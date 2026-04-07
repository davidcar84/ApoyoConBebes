'use strict';
/* ============================================================
   PADRES.JS — ApoyoConBebes
   ============================================================ */

// ── State ──────────────────────────────────────────────────
const S = {
  cfg:        null,     // config.json
  week:       null,     // ISO week id activo, ej "2026-W14"
  weeks:      {},       // { [weekId]: { note, blocks: { [id]: block } } }
  collabs:    {},       // { [id]: collaborator }
  acts:       {},       // { [id]: activity }
  notifs:     [],       // notificaciones de los papás
  filter:     null,     // chip de filtro activo
  editCollab: null,     // id colaborador en edición
  editAct:    null,     // id actividad en edición
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

function weekDates(wid) {
  const mon = weekMonday(wid);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtDayLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtWeek(wid) {
  const mon = weekMonday(wid);
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  const o = { day: 'numeric', month: 'short' };
  return `${wid}  ·  ${mon.toLocaleDateString('es-ES', o)} – ${sun.toLocaleDateString('es-ES', o)}`;
}

function blockStatus(b) {
  if (!b.collabIds || b.collabIds.length === 0) return 'sin-cubrir';
  return b.confirmed ? 'confirmado' : 'pendiente';
}

function statusLabel(s) {
  return { 'sin-cubrir': 'Sin cubrir', pendiente: 'Pendiente', confirmado: 'Confirmado' }[s] || s;
}

function statusBadge(s) {
  return { 'sin-cubrir': 'badge-red', pendiente: 'badge-amber', confirmado: 'badge-green' }[s] || '';
}

function collabUrl(id) {
  const base = location.pathname.includes('ApoyoConBebes') ? '/ApoyoConBebes' : '';
  return `${location.origin}${base}/colaborador.html?id=${id}`;
}

function modal(inner) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal">${inner}</div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.body.append(wrap);
  return wrap;
}

function checkGroup(container, items, selected = []) {
  container.innerHTML = '';
  items.forEach(({ id, label }) => {
    const l = document.createElement('label');
    const i = document.createElement('input');
    i.type = 'checkbox'; i.value = id; i.checked = selected.includes(id);
    const s = document.createElement('span'); s.textContent = label;
    l.append(i, s); container.append(l);
  });
}

function checked(container) {
  return [...container.querySelectorAll('input:checked')].map(i => i.value);
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ── Data ───────────────────────────────────────────────────
async function loadCfg() {
  S.cfg = await fetch('config.json').then(r => r.json());
}

async function loadData() {
  const [weeks, collabs, acts, notifs] = await Promise.all([
    db.get('weeks'), db.get('collaborators'),
    db.get('activities'), db.get('notifications/parents'),
  ]);
  S.weeks   = weeks   || {};
  S.collabs = collabs || {};
  S.acts    = acts    || {};
  S.notifs  = notifs ? Object.values(notifs).sort((a, b) => b.ts - a.ts) : [];
  if (!S.week) S.week = isoWeek(new Date());
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
    const d = document.createElement('div');
    d.className = `notif-item${n.read ? '' : ' unread'}`;
    d.innerHTML = `<div class="notif-text">${n.text}</div>
      <div class="notif-time">${new Date(n.ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>`;
    body.append(d);
  });
}

async function markRead() {
  const unread = S.notifs.filter(n => !n.read);
  if (!unread.length) return;
  const u = {};
  unread.forEach(n => { u[`notifications/parents/${n.id}/read`] = true; n.read = true; });
  await db.update('', u);
  updateBell(); renderNotifs();
}

// ── Tab navigation ─────────────────────────────────────────
function showTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === id));
}

// ── Agenda ─────────────────────────────────────────────────
function renderWeekHeader() {
  el('weekLabel').textContent = fmtWeek(S.week);
  el('weekNote').value = S.weeks[S.week]?.note || '';
}

function currentBlocks() {
  const w = S.weeks[S.week];
  if (!w?.blocks) return [];
  const slots = S.cfg.bloques_horarios;
  return Object.values(w.blocks).sort((a, b) =>
    a.date.localeCompare(b.date) || slots.indexOf(a.slot) - slots.indexOf(b.slot)
  );
}

function renderChips() {
  const blocks = currentBlocks();
  const cnt = {
    'sin-cubrir':  blocks.filter(b => blockStatus(b) === 'sin-cubrir').length,
    pendiente:     blocks.filter(b => blockStatus(b) === 'pendiente').length,
    confirmado:    blocks.filter(b => blockStatus(b) === 'confirmado').length,
    prioritario:   blocks.filter(b => b.priority).length,
  };
  const defs = [
    { k: 'sin-cubrir', l: 'Sin cubrir' },
    { k: 'pendiente',  l: 'Pendiente' },
    { k: 'confirmado', l: 'Confirmado' },
    { k: 'prioritario',l: 'Prioritario' },
  ];
  const bar = el('agendaChips'); bar.innerHTML = '';
  defs.forEach(({ k, l }) => {
    const c = document.createElement('button');
    c.className = `chip${S.filter === k ? ' on' : ''}`;
    c.innerHTML = `${l} <span class="chip-n">${cnt[k]}</span>`;
    c.addEventListener('click', () => {
      S.filter = S.filter === k ? null : k;
      renderChips(); renderBlocks();
    });
    bar.append(c);
  });
}

function renderBlocks() {
  let blocks = currentBlocks();
  if (S.filter === 'prioritario')        blocks = blocks.filter(b => b.priority);
  else if (S.filter)                     blocks = blocks.filter(b => blockStatus(b) === S.filter);

  const cont = el('agendaBlocks'); cont.innerHTML = '';
  if (!blocks.length) {
    cont.innerHTML = `<div class="empty">No hay bloques${S.filter ? ' con este filtro' : ' esta semana'}</div>`;
    return;
  }

  // Group by day
  const byDay = {};
  blocks.forEach(b => { (byDay[b.date] = byDay[b.date] || []).push(b); });

  Object.keys(byDay).sort().forEach(date => {
    const g = document.createElement('div'); g.className = 'day-group';
    g.innerHTML = `<div class="day-heading">${fmtDayLong(date)}</div>`;
    byDay[date].forEach(b => g.append(buildBlockCard(b)));
    cont.append(g);
  });
}

function buildBlockCard(b) {
  const status = blockStatus(b);
  const actNames = (b.actIds || []).map(id => S.acts[id]?.name).filter(Boolean).join(', ') || '—';
  const names = (b.collabIds || []).map(id => S.collabs[id]?.name).filter(Boolean).join(', ');
  const isPend = status === 'pendiente';

  const card = document.createElement('div');
  card.className = `block-card ${status}`;
  card.innerHTML = `
    <div class="block-top">
      <div class="block-info">
        ${b.priority ? '<div class="priority-tag">★ PRIORITARIO</div>' : ''}
        <div class="block-slot">${b.slot}</div>
        <div class="block-acts">${actNames}</div>
        <div class="block-meta">
          <span class="badge ${statusBadge(status)}">${statusLabel(status)}</span>
          &nbsp;${(b.collabIds || []).length}/${b.people} personas
          ${names ? ` · ${names}` : ''}
        </div>
        ${b.notes ? `<div class="block-notes">"${b.notes}"</div>` : ''}
      </div>
      <div class="block-right">
        <div class="block-actions">
          <button class="btn btn-ghost btn-sm" data-ac="edit">Editar</button>
          <button class="btn btn-danger btn-sm" data-ac="del">Eliminar</button>
        </div>
        ${isPend ? `<div class="block-actions">
          <button class="btn btn-success btn-sm" data-ac="confirm">Confirmar</button>
          <button class="btn btn-ghost btn-sm" data-ac="reject">Rechazar</button>
        </div>` : ''}
      </div>
    </div>
  `;

  card.querySelector('[data-ac="edit"]').addEventListener('click', () => openBlockModal(b));
  card.querySelector('[data-ac="del"]').addEventListener('click', () => {
    if (confirm(`Eliminar el bloque del ${fmtDay(b.date)} ${b.slot}?`))
      db.remove(`weeks/${S.week}/blocks/${b.id}`).then(refresh);
  });
  if (isPend) {
    card.querySelector('[data-ac="confirm"]').addEventListener('click', () => confirmBlock(b));
    card.querySelector('[data-ac="reject"]').addEventListener('click', () => rejectBlock(b));
  }
  return card;
}

// ── Block modal (crear / editar) ───────────────────────────
function openBlockModal(b = null) {
  const isEdit = !!b;
  const dates = weekDates(S.week);
  const slots = S.cfg.bloques_horarios;

  const dateOpts = dates.map(d =>
    `<option value="${d}"${b?.date === d ? ' selected' : ''}>${fmtDay(d)}</option>`).join('');
  const slotOpts = slots.map(s =>
    `<option value="${s}"${b?.slot === s ? ' selected' : ''}>${s}</option>`).join('');
  const peopleOpts = [1, 2, 3].map(n =>
    `<option value="${n}"${b?.people === n ? ' selected' : ''}>${n} persona${n > 1 ? 's' : ''}</option>`).join('');

  const m = modal(`
    <div class="modal-header">
      <h3 class="modal-title">${isEdit ? 'Editar' : 'Nuevo'} bloque</h3>
      <button class="modal-close" id="mClose">✕</button>
    </div>
    <form id="blockForm">
      <div class="form-row">
        <div class="field"><label>Día</label><select id="bDate">${dateOpts}</select></div>
        <div class="field"><label>Horario</label><select id="bSlot">${slotOpts}</select></div>
      </div>
      <div class="field"><label>Personas necesarias</label><select id="bPeople">${peopleOpts}</select></div>
      <div class="field">
        <label>Actividades</label>
        <div id="bActs" class="check-group"></div>
      </div>
      <div class="field">
        <label>Colaboradores (opcional)</label>
        <div id="bCollabs" class="check-group"></div>
      </div>
      <div class="field">
        <div class="check-inline">
          <input type="checkbox" id="bPriority"${b?.priority ? ' checked' : ''}/>
          <label for="bPriority">Marcar como prioritario</label>
        </div>
      </div>
      <div class="field"><label>Notas</label><textarea id="bNotes">${b?.notes || ''}</textarea></div>
      <div class="btn-row mt-2">
        <button type="submit" class="btn btn-primary">Guardar</button>
        <button type="button" id="mCancelBtn" class="btn btn-ghost">Cancelar</button>
      </div>
    </form>
  `);

  checkGroup(el('bActs'),
    Object.values(S.acts).map(a => ({ id: a.id, label: a.name })),
    b?.actIds || []);
  checkGroup(el('bCollabs'),
    Object.values(S.collabs).map(c => ({ id: c.id, label: c.name })),
    b?.collabIds || []);

  el('mClose').addEventListener('click', () => m.remove());
  el('mCancelBtn').addEventListener('click', () => m.remove());

  el('blockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const nb = {
      id:       b?.id || uid(),
      date:     el('bDate').value,
      slot:     el('bSlot').value,
      people:   Number(el('bPeople').value),
      actIds:   checked(el('bActs')),
      collabIds:checked(el('bCollabs')),
      priority: el('bPriority').checked,
      notes:    el('bNotes').value.trim(),
      confirmed: b?.confirmed || false,
    };
    // Validar slot duplicado
    const taken = currentBlocks().some(x => x.id !== nb.id && x.date === nb.date && x.slot === nb.slot);
    if (taken) { alert('Ya existe un bloque en ese día y horario.'); return; }
    await db.set(`weeks/${S.week}/blocks/${nb.id}`, nb);
    m.remove(); refresh();
  });
}

// ── Confirmar / Rechazar ───────────────────────────────────
async function confirmBlock(b) {
  await db.set(`weeks/${S.week}/blocks/${b.id}`, { ...b, confirmed: true });
  const u = {};
  (b.collabIds || []).forEach(cid => {
    const nid = uid();
    u[`notifications/collaborators/${cid}/${nid}`] = {
      id: nid, type: 'confirmado', read: false, ts: Date.now(),
      text: `Tu turno del ${fmtDay(b.date)} ${b.slot} fue confirmado ✅`,
    };
  });
  if (Object.keys(u).length) await db.update('', u);
  refresh();
}

async function rejectBlock(b) {
  const prev = [...(b.collabIds || [])];
  await db.set(`weeks/${S.week}/blocks/${b.id}`, { ...b, collabIds: [], confirmed: false });
  const u = {};
  prev.forEach(cid => {
    const nid = uid();
    u[`notifications/collaborators/${cid}/${nid}`] = {
      id: nid, type: 'rechazado', read: false, ts: Date.now(),
      text: `Tu solicitud para ${fmtDay(b.date)} ${b.slot} no fue aceptada ❌`,
    };
  });
  if (Object.keys(u).length) await db.update('', u);
  refresh();
}

// ── Copiar semana anterior ─────────────────────────────────
async function copyPrevWeek() {
  const prev = isoWeek(new Date(weekMonday(S.week).getTime() - 7 * 86400000));
  const src  = S.weeks[prev];
  if (!src?.blocks) { alert('No hay bloques en la semana anterior.'); return; }

  const existing = currentBlocks();
  const updates  = {};
  Object.values(src.blocks).forEach(b => {
    // Calcular fecha equivalente (mismo día de semana, +7 días)
    const srcMon  = weekMonday(prev);
    const diffDay = (new Date(b.date).getTime() - srcMon.getTime()) / 86400000;
    const newDate = new Date(weekMonday(S.week));
    newDate.setUTCDate(weekMonday(S.week).getUTCDate() + Math.round(diffDay));
    const dateStr = newDate.toISOString().slice(0, 10);

    if (existing.some(x => x.date === dateStr && x.slot === b.slot)) return; // slot ocupado
    const id = uid();
    updates[`weeks/${S.week}/blocks/${id}`] = {
      id, date: dateStr, slot: b.slot,
      people:    b.people,
      actIds:    b.actIds || [],
      collabIds: [],
      priority:  b.priority || false,
      notes:     '',
      confirmed: false,
    };
  });

  if (!Object.keys(updates).length) { alert('Todos los horarios ya están ocupados en esta semana.'); return; }
  await db.update('', updates);
  refresh();
}

// ── Colaboradores ──────────────────────────────────────────
function renderCollabForm(c = null) {
  S.editCollab = c?.id || null;
  el('collabFormTitle').textContent = c ? `Editar: ${c.name}` : 'Agregar colaborador';
  el('collabName').value  = c?.name  || '';
  el('collabLink').value  = c ? collabUrl(c.id) : '';
  el('collabNotes').value = c?.notes || '';
  checkGroup(el('collabActsCheck'),
    Object.values(S.acts).map(a => ({ id: a.id, label: a.name })),
    c?.actIds || []);
  checkGroup(el('collabDaysCheck'),
    DAYS.map((l, i) => ({ id: String(i), label: l })),
    (c?.days || []).map(String));
}

function renderCollabs() {
  const list = el('collabList');
  const cs = Object.values(S.collabs);
  if (!cs.length) { list.innerHTML = '<div class="empty" style="margin-bottom:16px;">No hay colaboradores aún.</div>'; return; }
  list.innerHTML = '';
  cs.forEach(c => {
    const actStr  = (c.actIds || []).map(id => S.acts[id]?.name).filter(Boolean).join(', ') || '—';
    const dayStr  = DAYS.map((l, i) => (c.days || []).includes(i) ? l.slice(0, 3) : null).filter(Boolean).join(', ') || '—';
    const card = document.createElement('div'); card.className = 'list-card';
    card.innerHTML = `
      <div class="list-card-row">
        <div class="list-card-info">
          <div class="list-card-name">${c.name}</div>
          <div class="list-card-sub">${actStr}</div>
          <div class="list-card-sub">Disponibilidad: ${dayStr}</div>
          ${c.notes ? `<div class="list-card-sub" style="font-style:italic;">${c.notes}</div>` : ''}
        </div>
        <div class="list-card-actions">
          <button class="btn btn-ghost btn-sm" data-ed="${c.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-dl="${c.id}">Eliminar</button>
        </div>
      </div>`;
    card.querySelector(`[data-ed]`).addEventListener('click', () => { renderCollabForm(c); showTab('colaboradores'); });
    card.querySelector(`[data-dl]`).addEventListener('click', () => {
      if (confirm(`Eliminar a ${c.name}?`)) db.remove(`collaborators/${c.id}`).then(refresh);
    });
    list.append(card);
  });
}

// ── Actividades ────────────────────────────────────────────
function renderActForm(a = null) {
  S.editAct = a?.id || null;
  el('actFormTitle').textContent = a ? `Editar: ${a.name}` : 'Agregar actividad';
  el('actName').value  = a?.name  || '';
  el('actCategory').value = a?.category || S.cfg.categorias[0].value;
  el('actPeople').value   = a?.people   || 1;
  el('actExp').checked    = a?.exp      || false;
  el('actInstr').value    = a?.instr    || '';
}

function renderActs() {
  const list = el('actsList');
  const as = Object.values(S.acts);
  if (!as.length) { list.innerHTML = '<div class="empty" style="margin-bottom:16px;">No hay actividades aún.</div>'; return; }
  list.innerHTML = '';
  as.forEach(a => {
    const cat = S.cfg.categorias.find(c => c.value === a.category);
    const card = document.createElement('div'); card.className = 'list-card';
    card.innerHTML = `
      <div class="list-card-row">
        <div class="list-card-info">
          <div class="list-card-name">
            ${a.name}
            <span class="cat-badge" style="color:${cat?.color || '#555'};border-color:${cat?.color || '#ccc'};margin-left:8px;font-size:.72rem;">${a.category}</span>
          </div>
          <div class="list-card-sub">${a.people} persona${a.people > 1 ? 's' : ''}${a.exp ? ' · Requiere experiencia' : ''}</div>
          ${a.instr ? `<div class="list-card-sub">${a.instr.slice(0, 100)}${a.instr.length > 100 ? '…' : ''}</div>` : ''}
        </div>
        <div class="list-card-actions">
          <button class="btn btn-ghost btn-sm" data-ed="${a.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-dl="${a.id}">Eliminar</button>
        </div>
      </div>`;
    card.querySelector(`[data-ed]`).addEventListener('click', () => { renderActForm(a); showTab('actividades'); });
    card.querySelector(`[data-dl]`).addEventListener('click', () => {
      if (confirm(`Eliminar "${a.name}"?`)) db.remove(`activities/${a.id}`).then(refresh);
    });
    list.append(card);
  });
}

// ── Render all ─────────────────────────────────────────────
function renderAll() {
  renderWeekHeader();
  renderChips();
  renderBlocks();
  renderCollabs();
  renderActs();
  updateBell();
  // Resetear formularios al recargar si no hay edición activa
  if (!S.editCollab) renderCollabForm();
  if (!S.editAct)    renderActForm();
}

async function refresh() {
  await loadData();
  renderAll();
}

// ── Event Listeners ────────────────────────────────────────
function setupListeners() {
  // Tabs
  document.querySelectorAll('.tab').forEach(t =>
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

  // Week nav
  el('prevWeek').addEventListener('click', () => {
    S.week = isoWeek(new Date(weekMonday(S.week).getTime() - 7 * 86400000));
    S.filter = null;
    renderWeekHeader(); renderChips(); renderBlocks();
  });
  el('nextWeek').addEventListener('click', () => {
    S.week = isoWeek(new Date(weekMonday(S.week).getTime() + 7 * 86400000));
    S.filter = null;
    renderWeekHeader(); renderChips(); renderBlocks();
  });

  // Week note
  el('saveNote').addEventListener('click', async () => {
    const note = el('weekNote').value.trim();
    await db.update(`weeks/${S.week}`, { note });
    if (!S.weeks[S.week]) S.weeks[S.week] = {};
    S.weeks[S.week].note = note;
  });

  // Agenda
  el('newBlockBtn').addEventListener('click', () => openBlockModal());
  el('copyWeekBtn').addEventListener('click', copyPrevWeek);

  // Collab form
  el('collabForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!el('collabName').value.trim()) { alert('El nombre es requerido.'); return; }
    const id  = S.editCollab || uid();
    const val = {
      id,
      name:   el('collabName').value.trim(),
      actIds: checked(el('collabActsCheck')),
      days:   checked(el('collabDaysCheck')).map(Number),
      notes:  el('collabNotes').value.trim(),
    };
    await db.set(`collaborators/${id}`, val);
    S.editCollab = null;
    refresh();
  });
  el('collabCancel').addEventListener('click', () => { S.editCollab = null; renderCollabForm(); });

  el('copyLinkBtn').addEventListener('click', () => {
    const v = el('collabLink').value;
    if (!v) return;
    navigator.clipboard.writeText(v).then(() => {
      el('copyLinkBtn').textContent = '¡Copiado!';
      setTimeout(() => { el('copyLinkBtn').textContent = 'Copiar'; }, 2000);
    }).catch(() => prompt('Copia este link:', v));
  });

  // Activity form
  el('actForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!el('actName').value.trim()) { alert('El nombre es requerido.'); return; }
    const id  = S.editAct || uid();
    const val = {
      id,
      name:     el('actName').value.trim(),
      category: el('actCategory').value,
      people:   Number(el('actPeople').value),
      exp:      el('actExp').checked,
      instr:    el('actInstr').value.trim(),
    };
    await db.set(`activities/${id}`, val);
    S.editAct = null;
    refresh();
  });
  el('actCancel').addEventListener('click', () => { S.editAct = null; renderActForm(); });
}

// ── Init ───────────────────────────────────────────────────
async function init() {
  await loadCfg();
  // Populate category select
  el('actCategory').innerHTML = S.cfg.categorias.map(c =>
    `<option value="${c.value}">${c.label}</option>`).join('');
  setupListeners();
  await loadData();
  renderAll();
}

init().catch(console.error);
