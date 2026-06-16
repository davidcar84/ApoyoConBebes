'use strict';
/* ============================================================
   SYNC-CALENDAR.MJS — ApoyoConBebes
   Lee el calendario público de Google y crea/actualiza bloques y
   actividades para la semana actual + N siguientes en Firebase.
   Cada bloque importado guarda `gcalUid` (uid del evento, o
   `uid_fecha` para eventos recurrentes) para poder actualizarlo o
   borrarlo si el evento cambia, sin generar duplicados.
   ============================================================ */

import ical from 'node-ical';

const FIREBASE_URL = 'https://apoyoconbebes-default-rtdb.firebaseio.com';
const CALENDAR_ICS_URL = process.env.CALENDAR_ICS_URL;
const WEEKS_AHEAD = Number(process.env.WEEKS_AHEAD || 3); // semana actual + 2 siguientes
const TZ = 'America/Bogota';
const DEFAULT_CATEGORY = 'Niños';

// Mapeo simple hora -> bloque horario (ver config.json)
const SLOTS = [
  { label: '7-9 AM',  start: 7,  end: 9  },
  { label: '9-12 PM', start: 9,  end: 12 },
  { label: '12-2 PM', start: 12, end: 14 },
  { label: '2-5 PM',  start: 14, end: 17 },
  { label: '5-8 PM',  start: 17, end: 20 },
];

// Palabras clave -> categoría (orden = prioridad)
const KEYWORD_CATEGORIES = [
  { category: 'Niños',   keywords: ['niños', 'niño', 'bebes', 'bebé', 'isa', 'mati'] },
  { category: 'Mascota', keywords: ['mia', 'jei'] },
  { category: 'Visita',  keywords: ['visita'] },
  { category: 'Otros',   keywords: ['cita', 'examen', 'exámenes', 'laboratorio', 'pilates', 'diana', 'david'] },
];

function categoryForSummary(summary) {
  const s = summary.toLowerCase();
  for (const { category, keywords } of KEYWORD_CATEGORIES) {
    if (keywords.some(k => s.includes(k.toLowerCase()))) return category;
  }
  return DEFAULT_CATEGORY;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ── Cálculo de semana ISO (igual que padres.js) ────────────
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const w = Math.ceil((((d - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

function weekMonday(wid) {
  const [y, w] = wid.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon  = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (w - 1) * 7);
  return mon;
}

function weekDates(wid) {
  const mon = weekMonday(wid);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function targetWeeks(n) {
  const today = new Date();
  const wids = [];
  for (let i = 0; i < n; i++) {
    wids.push(isoWeek(new Date(today.getTime() + i * 7 * 86400000)));
  }
  return wids;
}

function slotForHour(hour) {
  return SLOTS.find(s => hour >= s.start && hour < s.end)?.label || null;
}

// Fecha/hora local (America/Bogota) de un Date absoluto
function localDateHour(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// ── Ocurrencias dentro del rango de semanas objetivo ────────
function collectOccurrences(events, rangeStart, rangeEnd, allDates) {
  const occs = [];
  for (const ev of Object.values(events)) {
    if (ev.type !== 'VEVENT' || !ev.summary || !ev.uid) continue;
    if (ev.datetype !== 'date-time') continue; // ignora eventos de día completo

    if (ev.rrule) {
      // rrule.js trabaja con la hora local "tal cual" del DTSTART como si fuera UTC
      for (const occ of ev.rrule.between(rangeStart, rangeEnd, true)) {
        const date = occ.toISOString().slice(0, 10);
        if (!allDates.has(date)) continue;
        occs.push({ summary: ev.summary, date, hour: occ.getUTCHours(), key: `${ev.uid}_${date}` });
      }
    } else {
      const { date, hour } = localDateHour(ev.start);
      if (!allDates.has(date)) continue;
      occs.push({ summary: ev.summary, date, hour, key: ev.uid });
    }
  }
  return occs;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  if (!CALENDAR_ICS_URL) throw new Error('Falta CALENDAR_ICS_URL');

  const wids = targetWeeks(WEEKS_AHEAD);
  const dateToWid = new Map();
  wids.forEach(wid => weekDates(wid).forEach(d => dateToWid.set(d, wid)));
  const allDates = new Set(dateToWid.keys());

  const rangeStart = weekMonday(wids[0]);
  const rangeEnd = new Date(rangeStart.getTime() + WEEKS_AHEAD * 7 * 86400000);

  const [events, activities, ...weeksData] = await Promise.all([
    ical.async.fromURL(CALENDAR_ICS_URL),
    fetch(`${FIREBASE_URL}/activities.json`).then(r => r.json()),
    ...wids.map(wid => fetch(`${FIREBASE_URL}/weeks/${wid}.json`).then(r => r.json())),
  ]);

  const acts = activities || {};
  const weeksBlocks = {};
  wids.forEach((wid, i) => { weeksBlocks[wid] = weeksData[i]?.blocks || {}; });

  // Bloques ya importados anteriormente, indexados por gcalUid
  const importedByKey = new Map();
  for (const wid of wids) {
    for (const [id, b] of Object.entries(weeksBlocks[wid])) {
      if (b.gcalUid) importedByKey.set(b.gcalUid, { wid, id, block: b });
    }
  }

  const occs = collectOccurrences(events, rangeStart, rangeEnd, allDates);

  const updates = {};
  const matchedKeys = new Set();
  let created = 0, updated = 0, moved = 0, removed = 0;

  const findOrCreateActivity = name => {
    const category = categoryForSummary(name);
    let act = Object.values(acts).find(a => a.name.toLowerCase() === name.toLowerCase());
    if (!act) {
      act = { id: uid(), name, category, people: 1, exp: false, instr: '', gcalImported: true };
      acts[act.id] = act;
      updates[`activities/${act.id}`] = act;
    } else if (act.category !== category || !act.gcalImported) {
      act = { ...act, category, gcalImported: true };
      acts[act.id] = act;
      updates[`activities/${act.id}`] = act;
    }
    return act;
  };

  for (const occ of occs) {
    const slot = slotForHour(occ.hour);
    if (!slot) continue; // fuera de los bloques horarios definidos
    const targetWid = dateToWid.get(occ.date);
    if (!targetWid) continue;

    matchedKeys.add(occ.key);
    const act = findOrCreateActivity(occ.summary.trim());
    const existing = importedByKey.get(occ.key);

    if (existing) {
      const { wid: oldWid, id, block } = existing;
      const sameSpot = block.date === occ.date && block.slot === slot && block.actIds?.[0] === act.id;
      if (sameSpot) continue; // sin cambios

      const newBlock = { ...block, date: occ.date, slot, actIds: [act.id] };
      if (oldWid === targetWid) {
        updates[`weeks/${targetWid}/blocks/${id}`] = newBlock;
        weeksBlocks[targetWid][id] = newBlock;
        updated++;
      } else {
        const taken = Object.values(weeksBlocks[targetWid]).some(b => b.date === occ.date && b.slot === slot && b.id !== id);
        if (taken) {
          console.warn(`No se pudo mover el bloque importado "${occ.summary}" a ${occ.date} ${slot}: ya hay otro bloque ahí.`);
          continue;
        }
        updates[`weeks/${oldWid}/blocks/${id}`] = null;
        delete weeksBlocks[oldWid][id];
        updates[`weeks/${targetWid}/blocks/${id}`] = newBlock;
        weeksBlocks[targetWid][id] = newBlock;
        moved++;
      }
    } else {
      const taken = Object.values(weeksBlocks[targetWid]).some(b => b.date === occ.date && b.slot === slot);
      if (taken) continue; // no pisar bloques ya existentes (manuales u otros)

      const block = {
        id: uid(), date: occ.date, slot, people: 1,
        actIds: [act.id], collabIds: [], priority: false,
        notes: 'Importado de Google Calendar', confirmed: false,
        gcalUid: occ.key,
      };
      updates[`weeks/${targetWid}/blocks/${block.id}`] = block;
      weeksBlocks[targetWid][block.id] = block;
      created++;
    }
  }

  // Bloques importados cuyo evento ya no existe o salió del rango: eliminarlos
  for (const [key, { wid, id }] of importedByKey) {
    if (matchedKeys.has(key)) continue;
    updates[`weeks/${wid}/blocks/${id}`] = null;
    removed++;
  }

  if (!Object.keys(updates).length) {
    console.log('Nada nuevo para sincronizar.');
    return;
  }

  const res = await fetch(`${FIREBASE_URL}/.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Firebase ${res.status}: ${await res.text()}`);

  console.log(`Creados: ${created}, actualizados: ${updated}, movidos: ${moved}, eliminados: ${removed} (semanas ${wids.join(', ')}).`);
}

main().catch(err => { console.error(err); process.exit(1); });
