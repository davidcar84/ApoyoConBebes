'use strict';
/* ============================================================
   SYNC-CALENDAR.MJS — ApoyoConBebes
   Lee el calendario público de Google y crea bloques/actividades
   para la semana actual en Firebase, si no existen ya.
   ============================================================ */

import ical from 'node-ical';

const FIREBASE_URL = 'https://apoyoconbebes-default-rtdb.firebaseio.com';
const CALENDAR_ICS_URL = process.env.CALENDAR_ICS_URL;
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

// ── Ocurrencias de esta semana ──────────────────────────────
function weekOccurrences(events, weekDateSet) {
  const mon = weekMonday(isoWeek(new Date()));
  const nextMon = new Date(mon); nextMon.setUTCDate(mon.getUTCDate() + 7);

  const occs = [];
  for (const ev of Object.values(events)) {
    if (ev.type !== 'VEVENT' || !ev.summary) continue;
    if (ev.datetype !== 'date-time') continue; // ignora eventos de día completo

    if (ev.rrule) {
      // rrule.js trabaja con la hora local "tal cual" del DTSTART como si fuera UTC
      for (const occ of ev.rrule.between(mon, nextMon, true)) {
        const date = occ.toISOString().slice(0, 10);
        if (!weekDateSet.has(date)) continue;
        occs.push({ summary: ev.summary, date, hour: occ.getUTCHours() });
      }
    } else {
      const { date, hour } = localDateHour(ev.start);
      if (!weekDateSet.has(date)) continue;
      occs.push({ summary: ev.summary, date, hour });
    }
  }
  return occs;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  if (!CALENDAR_ICS_URL) throw new Error('Falta CALENDAR_ICS_URL');

  const wid = isoWeek(new Date());
  const weekDateSet = new Set(weekDates(wid));

  const [events, activities, weekData] = await Promise.all([
    ical.async.fromURL(CALENDAR_ICS_URL),
    fetch(`${FIREBASE_URL}/activities.json`).then(r => r.json()),
    fetch(`${FIREBASE_URL}/weeks/${wid}.json`).then(r => r.json()),
  ]);

  const acts = activities || {};
  const existingBlocks = Object.values(weekData?.blocks || {});
  const occs = weekOccurrences(events, weekDateSet);

  const updates = {};
  const newBlocks = [];

  for (const occ of occs) {
    const slot = slotForHour(occ.hour);
    if (!slot) continue; // fuera de los bloques horarios definidos

    const taken = existingBlocks.some(b => b.date === occ.date && b.slot === slot)
      || newBlocks.some(b => b.date === occ.date && b.slot === slot);
    if (taken) continue; // no pisar bloques ya existentes

    const name = occ.summary.trim();
    let act = Object.values(acts).find(a => a.name.toLowerCase() === name.toLowerCase());
    if (!act) {
      act = { id: uid(), name, category: DEFAULT_CATEGORY, people: 1, exp: false, instr: '' };
      acts[act.id] = act;
      updates[`activities/${act.id}`] = act;
    }

    const block = {
      id: uid(), date: occ.date, slot, people: 1,
      actIds: [act.id], collabIds: [], priority: false,
      notes: 'Importado de Google Calendar', confirmed: false,
    };
    newBlocks.push(block);
    updates[`weeks/${wid}/blocks/${block.id}`] = block;
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

  console.log(`Sincronizados ${newBlocks.length} bloque(s) en la semana ${wid}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
