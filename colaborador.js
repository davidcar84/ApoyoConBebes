'use strict';
/* ============================================================
   COLABORADOR.JS — ApoyoConBebes
   ============================================================ */

// ── State ──────────────────────────────────────────────────
const S = {
  cfg:      null,
  cid:      null,   // collaborator id
  weeks:    {},
  collabs:  {},
  acts:     {},
  notifs:   [],     // notificaciones de este colaborador
  filterD:  null,   // filtro pestaña Disponible
  filterT:  null,   // filtro pestaña Mis Turnos
};

// ── Helpers ────────────────────────────────────────────────
const el  = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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

function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtDayLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function showScreen(id) {
  ['codeScreen', 'errorScreen', 'collabApp'].forEach(s =>
    el(s).classList.toggle('hidden', s !== id)
  );
}

function showTab(id) {
  document.querySelectorAll('#collabApp .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('#collabApp .panel').forEach(p => p.classList.toggle('active', p.id === id));
}

function modal(inner) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal">${inner}</div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.body.append(wrap);
  return wrap;
}

// ── Semanas visibles ───────────────────────────────────────
function visibleWeekIds() {
  const ventana = S.cfg?.ventana_semanas || 4;
  const seen = new Set();
  const today = new Date();
  for (let i = 0; i < ventana; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i * 7);
    seen.add(isoWeek(d));
  }
  return [...seen];
}

// ── Data ───────────────────────────────────────────────────
async function loadData() {
  const [weeks, collabs, acts, notifRaw] = await Promise.all([
    db.get('weeks'), db.get('collaborators'),
    db.get('activities'), db.get(`notifications/collaborators/${S.cid}`),
  ]);
  S.weeks   = weeks   || {};
  S.collabs = collabs || {};
  S.acts    = acts    || {};
  S.notifs  = notifRaw ? Object.values(notifRaw).sort((a, b) => b.ts - a.ts) : [];
}

// ── Bell ───────────────────────────────────────────────────
function updateBell() {
  const n = S.notifs.filter(n => !n.read).length;
  el('bellBadge').textContent = n > 99 ? '99+' : n;
  el('bellBadge').classList.toggle('hidden', n === 0);
}

function renderNotifs() {
  const body = el('notifBody');
  if (!S.notifs.length) { body.innerHTML = '<div class="empty">Sin notificaciones</div>'; return; }
  body.innerHTML = '';
  S.notifs.forEach(n => {
    const icon = n.type === 'confirmado' ? '✅' : n.type === 'rechazado' ? '❌' : '📩';
    const d = document.createElement('div');
    d.className = `notif-item type-${n.type || ''}${n.read ? '' : ' unread'}`;
    d.innerHTML = `<div class="notif-text">${icon} ${n.text}</div>
      <div class="notif-time">${new Date(n.ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>`;
    body.append(d);
  });
}

async function markRead() {
  const unread = S.notifs.filter(n => !n.read);
  if (!unread.length) return;
  const u = {};
  unread.forEach(n => { u[`notifications/collaborators/${S.cid}/${n.id}/read`] = true; n.read = true; });
  await db.update('', u);
  updateBell(); renderNotifs();
}

// ── Bloques disponibles ────────────────────────────────────
function getAvailable() {
  const collab = S.collabs[S.cid];
  const myActs = new Set(collab?.actIds || []);
  const blocks = [];

  visibleWeekIds().forEach(wid => {
    const week = S.weeks[wid];
    if (!week?.blocks) return;
    Object.values(week.blocks).forEach(b => {
      if (b.confirmed) return;                                              // ya confirmado
      if ((b.collabIds || []).includes(S.cid)) return;                     // ya apuntado
      if ((b.collabIds || []).length >= b.people) return;                  // lleno
      if (!(b.actIds || []).some(id => myActs.has(id))) return;            // sin actividad en común
      blocks.push({ ...b, wid });
    });
  });

  // Prioritarios primero, luego por fecha y horario
  const slots = S.cfg?.bloques_horarios || [];
  return blocks.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    const dc = a.date.localeCompare(b.date);
    return dc !== 0 ? dc : slots.indexOf(a.slot) - slots.indexOf(b.slot);
  });
}

function availStatus(b) {
  const n = (b.collabIds || []).length;
  if (n === 0) return 'sin-cubrir';
  return n < b.people ? 'parcial' : 'lleno';
}

function renderDisponibleChips() {
  const blocks = getAvailable();
  const cnt = {
    'sin-cubrir':  blocks.filter(b => availStatus(b) === 'sin-cubrir').length,
    parcial:       blocks.filter(b => availStatus(b) === 'parcial').length,
    prioritario:   blocks.filter(b => b.priority).length,
  };
  const defs = [
    { k: 'sin-cubrir', l: 'Sin cubrir' },
    { k: 'parcial',    l: 'Parcial' },
    { k: 'prioritario',l: 'Prioritario' },
  ];
  const bar = el('disponibleChips'); bar.innerHTML = '';
  defs.forEach(({ k, l }) => {
    const c = document.createElement('button');
    c.className = `chip${S.filterD === k ? ' on' : ''}`;
    c.innerHTML = `${l} <span class="chip-n">${cnt[k]}</span>`;
    c.addEventListener('click', () => { S.filterD = S.filterD === k ? null : k; renderDisponibleChips(); renderDisponible(); });
    bar.append(c);
  });
}

function renderDisponible() {
  const myActs = new Set(S.collabs[S.cid]?.actIds || []);
  let blocks = getAvailable();
  if (S.filterD === 'prioritario')       blocks = blocks.filter(b => b.priority);
  else if (S.filterD)                    blocks = blocks.filter(b => availStatus(b) === S.filterD);

  const cont = el('disponibleBlocks'); cont.innerHTML = '';
  if (!blocks.length) {
    cont.innerHTML = `<div class="empty">No hay bloques disponibles${S.filterD ? ' con este filtro' : ''}</div>`;
    return;
  }

  blocks.forEach(b => cont.append(buildDisponibleCard(b, myActs)));
}

function buildDisponibleCard(b, myActs) {
  const assigned  = (b.collabIds || []).length;
  const otherNames = (b.collabIds || []).map(id => S.collabs[id]?.name).filter(Boolean).join(', ');

  const actBadges = (b.actIds || []).map(id => {
    const a = S.acts[id]; if (!a) return '';
    const can = myActs.has(id);
    return `<span class="badge ${can ? 'badge-blue' : ''}" style="${can ? '' : 'opacity:.45'}">${a.name}</span>`;
  }).join(' ');

  const card = document.createElement('div');
  card.className = `block-card${b.priority ? ' sin-cubrir' : ''}`;
  card.style.cursor = 'pointer';
  card.innerHTML = `
    <div class="block-info">
      ${b.priority ? '<div class="priority-tag">★ PRIORITARIO</div>' : ''}
      <div class="block-slot">${fmtDay(b.date)} · ${b.slot}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">${actBadges}</div>
      <div class="block-meta" style="margin-top:6px;">
        ${assigned}/${b.people} personas${otherNames ? ` · Con: ${otherNames}` : ''}
      </div>
      ${b.notes ? `<div class="block-notes">"${b.notes}"</div>` : ''}
    </div>
    <div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-ghost btn-sm" data-ac="detail">Ver detalle</button>
      <button class="btn btn-primary btn-sm" data-ac="signup">Me apunto</button>
    </div>
  `;
  card.querySelector('[data-ac="detail"]').addEventListener('click', e => { e.stopPropagation(); openDetail(b, myActs); });
  card.querySelector('[data-ac="signup"]').addEventListener('click', e => { e.stopPropagation(); signUp(b); });
  card.addEventListener('click', () => openDetail(b, myActs));
  return card;
}

// ── Mis turnos ─────────────────────────────────────────────
function getMyTurns() {
  const slots = S.cfg?.bloques_horarios || [];
  const blocks = [];
  Object.entries(S.weeks).forEach(([wid, week]) => {
    if (!week?.blocks) return;
    Object.values(week.blocks).forEach(b => {
      if ((b.collabIds || []).includes(S.cid)) blocks.push({ ...b, wid });
    });
  });
  return blocks.sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    return dc !== 0 ? dc : slots.indexOf(a.slot) - slots.indexOf(b.slot);
  });
}

function renderMisturnosChips() {
  const turns = getMyTurns();
  const cnt = { pendiente: turns.filter(b => !b.confirmed).length, confirmado: turns.filter(b => b.confirmed).length };
  const defs = [{ k: 'pendiente', l: 'Esperando confirmación' }, { k: 'confirmado', l: 'Confirmado' }];
  const bar = el('misturnosChips'); bar.innerHTML = '';
  defs.forEach(({ k, l }) => {
    const c = document.createElement('button');
    c.className = `chip${S.filterT === k ? ' on' : ''}`;
    c.innerHTML = `${l} <span class="chip-n">${cnt[k]}</span>`;
    c.addEventListener('click', () => { S.filterT = S.filterT === k ? null : k; renderMisturnosChips(); renderMisturnos(); });
    bar.append(c);
  });
}

function renderMisturnos() {
  const myActs = new Set(S.collabs[S.cid]?.actIds || []);
  let blocks = getMyTurns();
  if (S.filterT === 'pendiente')  blocks = blocks.filter(b => !b.confirmed);
  if (S.filterT === 'confirmado') blocks = blocks.filter(b => b.confirmed);

  const cont = el('misturnosBlocks'); cont.innerHTML = '';
  if (!blocks.length) {
    cont.innerHTML = `<div class="empty">No tienes turnos asignados${S.filterT ? ' con este filtro' : ''}</div>`;
    return;
  }

  blocks.forEach(b => {
    const actNames = (b.actIds || []).map(id => S.acts[id]?.name).filter(Boolean).join(', ') || '—';
    const statusTxt = b.confirmed
      ? '<span style="color:var(--green);font-weight:700;">✓ Confirmado</span>'
      : '<span style="color:var(--amber);font-weight:700;">⏳ Esperando confirmación</span>';

    const card = document.createElement('div');
    card.className = `block-card ${b.confirmed ? 'confirmado' : 'pendiente'}`;
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="block-info">
        ${b.priority ? '<div class="priority-tag">★ PRIORITARIO</div>' : ''}
        <div class="block-slot">${fmtDay(b.date)} · ${b.slot}</div>
        <div class="block-acts">${actNames}</div>
        <div class="block-meta" style="margin-top:4px;">${statusTxt}</div>
        ${b.notes ? `<div class="block-notes">"${b.notes}"</div>` : ''}
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-ghost btn-sm" data-ac="detail">Ver detalle</button>
      </div>
    `;
    card.querySelector('[data-ac="detail"]').addEventListener('click', e => { e.stopPropagation(); openDetail(b, myActs); });
    card.addEventListener('click', () => openDetail(b, myActs));
    cont.append(card);
  });
}

// ── Modal detalle del bloque ───────────────────────────────
function openDetail(b, myActs) {
  const collab = S.collabs[S.cid];
  const alreadySigned = (b.collabIds || []).includes(S.cid);
  const isFull = (b.collabIds || []).length >= b.people;
  const canSign = !alreadySigned && !isFull && !b.confirmed;

  const actRows = (b.actIds || []).map(id => {
    const a = S.acts[id]; if (!a) return '';
    const can = myActs.has(id);
    const cat = S.cfg.categorias.find(c => c.value === a.category);
    return `<div class="act-row ${can ? 'can' : 'cant'}">
      <div class="act-row-name">
        ${can ? '✓' : '–'} ${a.name}
        <span class="cat-badge" style="color:${cat?.color};border-color:${cat?.color};margin-left:6px;font-size:.7rem;">${a.category}</span>
      </div>
      ${a.instr ? `<div class="act-row-inst">${a.instr}</div>` : ''}
    </div>`;
  }).join('');

  const assigned = (b.collabIds || []).map(id => S.collabs[id]?.name).filter(Boolean).join(', ');

  const m = modal(`
    <div class="modal-header">
      <h3 class="modal-title">
        ${b.priority ? '<div class="priority-tag" style="margin-bottom:6px;">★ PRIORITARIO</div>' : ''}
        ${fmtDayLong(b.date)} · ${b.slot}
      </h3>
      <button class="modal-close" id="mClose">✕</button>
    </div>
    <div class="modal-section">
      <h4>Actividades</h4>
      ${actRows || '<p style="color:var(--gray-400);font-size:.85rem;">Sin actividades especificadas</p>'}
    </div>
    <div class="modal-section">
      <h4>Personas necesarias</h4>
      <p style="font-size:.88rem;">${(b.collabIds || []).length}/${b.people} cubierta${b.people > 1 ? 's' : ''}${assigned ? ` · Apuntados: ${assigned}` : ''}</p>
    </div>
    ${b.notes ? `<div class="modal-section"><h4>Notas</h4><p style="font-size:.88rem;">${b.notes}</p></div>` : ''}
    <div class="btn-row mt-2">
      ${canSign ? `<button id="mSignup" class="btn btn-primary">Me apunto</button>` : ''}
      <button id="mClose2" class="btn btn-ghost">${canSign ? 'Cancelar' : 'Cerrar'}</button>
    </div>
  `);

  el('mClose').addEventListener('click', () => m.remove());
  el('mClose2').addEventListener('click', () => m.remove());
  if (canSign) el('mSignup').addEventListener('click', () => { m.remove(); signUp(b); });
}

// ── Apuntarse ──────────────────────────────────────────────
async function signUp(b) {
  const ids = [...(b.collabIds || [])];
  if (ids.includes(S.cid)) return;
  ids.push(S.cid);

  const collab = S.collabs[S.cid];
  const nid = uid();
  await db.update('', {
    [`weeks/${b.wid}/blocks/${b.id}/collabIds`]: ids,
    [`notifications/parents/${nid}`]: {
      id: nid, read: false, ts: Date.now(),
      text: `${collab?.name || 'Un colaborador'} se apuntó al bloque ${b.slot} del ${fmtDay(b.date)}.`,
    },
  });
  refresh();
}

// ── Render ─────────────────────────────────────────────────
function renderAll() {
  const collab = S.collabs[S.cid];
  if (!collab) { showScreen('errorScreen'); return; }

  el('collabName').textContent = `Hola, ${collab.name}`;
  const actStr = (collab.actIds || []).map(id => S.acts[id]?.name).filter(Boolean).join(', ');
  el('collabSub').textContent = actStr ? `Actividades: ${actStr}` : '';

  renderDisponibleChips(); renderDisponible();
  renderMisturnosChips();  renderMisturnos();
  updateBell();
}

async function refresh() {
  await loadData();
  renderAll();
}

// ── Init ───────────────────────────────────────────────────
function setupListeners() {
  // Tabs
  document.querySelectorAll('#collabApp .tab').forEach(t =>
    t.addEventListener('click', () => showTab(t.dataset.tab))
  );

  // Bell
  el('bellBtn').addEventListener('click', e => {
    e.stopPropagation();
    const p = el('notifPanel');
    const opening = p.classList.contains('hidden');
    p.classList.toggle('hidden', !opening);
    if (opening) { renderNotifs(); markRead(); }
  });
  el('markReadBtn').addEventListener('click', e => { e.stopPropagation(); markRead(); });
  document.addEventListener('click', () => el('notifPanel').classList.add('hidden'));
  el('notifPanel').addEventListener('click', e => e.stopPropagation());
}

// Code form
el('codeForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = el('codeInput').value.trim();
  const collab = Object.values(S.collabs).find(c => c.id === code);
  if (collab) {
    el('codeError').classList.add('hidden');
    S.cid = collab.id;
    showScreen('collabApp');
    setupListeners();
    refresh();
  } else {
    el('codeError').classList.remove('hidden');
  }
});

async function init() {
  S.cfg = await fetch('config.json').then(r => r.json());

  // Cargar colaboradores para validar el ?id
  const [collabs, acts] = await Promise.all([db.get('collaborators'), db.get('activities')]);
  S.collabs = collabs || {};
  S.acts    = acts    || {};

  const params = new URLSearchParams(location.search);
  const id = params.get('id');

  if (id) {
    if (S.collabs[id]) {
      S.cid = id;
      showScreen('collabApp');
      setupListeners();
      await loadData();
      renderAll();
    } else {
      showScreen('errorScreen');
    }
  } else {
    showScreen('codeScreen');
  }
}

init().catch(err => { console.error(err); showScreen('errorScreen'); });
