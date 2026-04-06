/* ===================================================
   PADRES.JS — Vista administración ApoyoConBebes
   =================================================== */

const state = {
  config: null,
  selectedWeek: null,
  weeks: {},
  collaborators: {},
  activities: {},
  parentNotifications: [],
  editingCollabId: null,
  editingActivityId: null,
  activeFilter: null,   // 'sin-cubrir' | 'pendiente' | 'confirmado' | 'prioritario' | null
  notifPanelOpen: false
};

// ===================================================
// UTILIDADES
// ===================================================

function isoWeekId(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const w = Math.ceil((((d - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

function weekStartDate(weekId) {
  const [year, week] = weekId.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  mon.setUTCDate(mon.getUTCDate() + (week - 1) * 7);
  return mon;
}

function getWeekDates(weekId) {
  const start = weekStartDate(weekId);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().split('T')[0];
  });
}

function formatDay(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDayLong(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatWeekRange(weekId) {
  const start = weekStartDate(weekId);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${weekId}  •  ${start.toLocaleDateString('es-ES', opts)} – ${end.toLocaleDateString('es-ES', opts)}`;
}

function blockStatus(block) {
  if (!block.collaboratorIds || block.collaboratorIds.length === 0) return 'sin-cubrir';
  return block.confirmed ? 'confirmado' : 'pendiente';
}

function statusLabel(status) {
  return { 'sin-cubrir': 'Sin cubrir', pendiente: 'Pendiente', confirmado: 'Confirmado' }[status] || status;
}

function statusBadgeClass(status) {
  return { 'sin-cubrir': 'badge-danger', pendiente: 'badge-warning', confirmado: 'badge-success' }[status] || '';
}

function getCollabUrl(collabId) {
  const basePath = window.location.pathname.includes('ApoyoConBebes') ? '/ApoyoConBebes' : '';
  return `${location.origin}${basePath}/colaborador.html?id=${collabId}`;
}

function uid() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 7);
}

// ===================================================
// MODAL HELPER
// ===================================================

function showModal(html) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.addEventListener('click', e => { if (e.target === back) back.remove(); });
  document.body.append(back);
  return back;
}

// ===================================================
// CARGA DE DATOS
// ===================================================

function loadConfig() {
  return fetch('config.json').then(r => r.json()).then(cfg => { state.config = cfg; });
}

function loadData() {
  return Promise.all([
    db.get('weeks'),
    db.get('collaborators'),
    db.get('activities'),
    db.get('notifications/parents')
  ]).then(([weeks, collaborators, activities, notifs]) => {
    state.weeks = weeks || {};
    state.collaborators = collaborators || {};
    state.activities = activities || {};
    const raw = notifs ? Object.values(notifs) : [];
    state.parentNotifications = raw.sort((a, b) => b.date - a.date);
    if (!state.selectedWeek) state.selectedWeek = isoWeekId(new Date());
  });
}

// ===================================================
// LOGIN
// ===================================================

document.getElementById('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const pin = document.getElementById('pinInput').value.trim();
  if (pin === state.config.pin_padres) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminApp').classList.remove('hidden');
    document.getElementById('loginError').classList.add('hidden');
    refresh();
  } else {
    document.getElementById('loginError').classList.remove('hidden');
    document.getElementById('pinInput').value = '';
  }
});

// ===================================================
// NAVEGACIÓN
// ===================================================

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const sec = document.getElementById(id);
  const link = document.querySelector(`.nav-link[data-section="${id}"]`);
  if (sec) sec.classList.add('active');
  if (link) link.classList.add('active');
  // Re-render on switch so forms have latest data
  if (id === 'collaborators') renderCollaborators();
  if (id === 'activities') renderActivities();
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => showSection(link.dataset.section));
});

// ===================================================
// CAMPANA / NOTIFICACIONES
// ===================================================

function updateBell() {
  const unread = state.parentNotifications.filter(n => !n.read).length;
  const badge = document.getElementById('bellBadge');
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotifPanel() {
  const body = document.getElementById('notifPanelBody');
  if (!state.parentNotifications.length) {
    body.innerHTML = '<div class="empty-state">No hay notificaciones</div>';
    return;
  }
  body.innerHTML = '';
  state.parentNotifications.forEach(n => {
    const el = document.createElement('div');
    el.className = `notif-item${n.read ? '' : ' unread'}`;
    el.innerHTML = `
      <div class="notif-item-text">${n.text}</div>
      <div class="notif-item-time">${new Date(n.date).toLocaleString('es-ES', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
    `;
    body.append(el);
  });
}

function markAllNotifsRead() {
  const unread = state.parentNotifications.filter(n => !n.read);
  if (!unread.length) return;
  const updates = {};
  unread.forEach(n => { updates[`notifications/parents/${n.id}/read`] = true; });
  db.update('', updates).then(() => {
    state.parentNotifications.forEach(n => { n.read = true; });
    updateBell();
    renderNotifPanel();
  });
}

document.getElementById('bellBtn').addEventListener('click', e => {
  e.stopPropagation();
  state.notifPanelOpen = !state.notifPanelOpen;
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden', !state.notifPanelOpen);
  if (state.notifPanelOpen) {
    renderNotifPanel();
    markAllNotifsRead();
  }
});

document.getElementById('markAllReadBtn').addEventListener('click', e => {
  e.stopPropagation();
  markAllNotifsRead();
});

document.addEventListener('click', () => {
  if (state.notifPanelOpen) {
    state.notifPanelOpen = false;
    document.getElementById('notifPanel').classList.add('hidden');
  }
});

// ===================================================
// AGENDA — semana
// ===================================================

function renderWeekHeader() {
  document.getElementById('weekDisplay').textContent = formatWeekRange(state.selectedWeek);
  // Load week note
  const note = state.weeks[state.selectedWeek]?.note || '';
  document.getElementById('weekNote').value = note;
}

document.getElementById('prevWeek').addEventListener('click', () => {
  const d = weekStartDate(state.selectedWeek);
  d.setUTCDate(d.getUTCDate() - 7);
  state.selectedWeek = isoWeekId(d);
  renderWeekHeader();
  renderFilterChips();
  renderBlocks();
});

document.getElementById('nextWeek').addEventListener('click', () => {
  const d = weekStartDate(state.selectedWeek);
  d.setUTCDate(d.getUTCDate() + 7);
  state.selectedWeek = isoWeekId(d);
  renderWeekHeader();
  renderFilterChips();
  renderBlocks();
});

document.getElementById('saveWeekNote').addEventListener('click', () => {
  const note = document.getElementById('weekNote').value.trim();
  db.update(`weeks/${state.selectedWeek}`, { note }).then(() => {
    if (!state.weeks[state.selectedWeek]) state.weeks[state.selectedWeek] = {};
    state.weeks[state.selectedWeek].note = note;
  });
});

document.getElementById('newBlockBtn').addEventListener('click', () => openBlockModal());
document.getElementById('copyWeekBtn').addEventListener('click', copyPreviousWeek);

// ===================================================
// AGENDA — chips de filtro
// ===================================================

function getBlocksForWeek() {
  const week = state.weeks[state.selectedWeek];
  if (!week || !week.blocks) return [];
  return Object.values(week.blocks).sort((a, b) =>
    a.date.localeCompare(b.date) || state.config.bloques_horarios.indexOf(a.slot) - state.config.bloques_horarios.indexOf(b.slot)
  );
}

function renderFilterChips() {
  const blocks = getBlocksForWeek();
  const counts = {
    'sin-cubrir': blocks.filter(b => blockStatus(b) === 'sin-cubrir').length,
    'pendiente':  blocks.filter(b => blockStatus(b) === 'pendiente').length,
    'confirmado': blocks.filter(b => blockStatus(b) === 'confirmado').length,
    'prioritario': blocks.filter(b => b.priority).length
  };

  const defs = [
    { key: 'sin-cubrir',  label: 'Sin cubrir' },
    { key: 'pendiente',   label: 'Pendiente' },
    { key: 'confirmado',  label: 'Confirmado' },
    { key: 'prioritario', label: 'Prioritario' }
  ];

  const bar = document.getElementById('filterChips');
  bar.innerHTML = '';
  defs.forEach(({ key, label }) => {
    const chip = document.createElement('button');
    chip.className = `chip${state.activeFilter === key ? ' active' : ''}`;
    chip.innerHTML = `${label} <span class="chip-count">${counts[key]}</span>`;
    chip.addEventListener('click', () => {
      state.activeFilter = state.activeFilter === key ? null : key;
      renderFilterChips();
      renderBlocks();
    });
    bar.append(chip);
  });
}

// ===================================================
// AGENDA — bloques
// ===================================================

function renderBlocks() {
  const container = document.getElementById('blocksContainer');
  let blocks = getBlocksForWeek();

  if (state.activeFilter === 'prioritario') {
    blocks = blocks.filter(b => b.priority);
  } else if (state.activeFilter) {
    blocks = blocks.filter(b => blockStatus(b) === state.activeFilter);
  }

  container.innerHTML = '';

  if (!blocks.length) {
    container.innerHTML = '<div class="empty-state">No hay bloques' + (state.activeFilter ? ' con este filtro' : ' esta semana') + '</div>';
    return;
  }

  // Group by day
  const byDay = {};
  blocks.forEach(b => {
    if (!byDay[b.date]) byDay[b.date] = [];
    byDay[b.date].push(b);
  });

  Object.keys(byDay).sort().forEach(date => {
    const group = document.createElement('div');
    group.className = 'day-group';
    group.innerHTML = `<div class="day-label">${formatDayLong(date)}</div>`;
    byDay[date].forEach(block => group.append(buildBlockCard(block)));
    container.append(group);
  });
}

function buildBlockCard(block) {
  const status = blockStatus(block);
  const card = document.createElement('div');
  card.className = `card block-${status}`;

  const collabNames = (block.collaboratorIds || [])
    .map(id => state.collaborators[id]?.name || id)
    .join(', ');
  const actNames = (block.activityIds || [])
    .map(id => state.activities[id]?.name || id)
    .join(', ');
  const countStr = `${(block.collaboratorIds || []).length}/${block.peopleNeeded} personas`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
      <div style="flex:1;min-width:0;">
        ${block.priority ? '<span class="priority-banner">&#9733; PRIORITARIO</span>' : ''}
        <div class="card-title">${block.slot} &mdash; ${formatDay(block.date)}</div>
        <div class="card-sub" style="margin-top:3px;">${actNames || '<i>Sin actividades</i>'}</div>
        ${collabNames ? `<div class="card-sub" style="margin-top:2px;">Colaboradores: ${collabNames} &bull; ${countStr}</div>` : `<div class="card-sub" style="margin-top:2px;">${countStr}</div>`}
        ${block.notes ? `<div class="card-sub" style="margin-top:4px;font-style:italic;">"${block.notes}"</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <span class="badge ${statusBadgeClass(status)}">${statusLabel(status)}</span>
        <div class="btn-group" style="justify-content:flex-end;">
          <button class="btn-secondary btn-sm" data-action="edit">Editar</button>
          <button class="btn-danger btn-sm" data-action="delete">Eliminar</button>
        </div>
        ${status === 'pendiente' ? `
        <div class="btn-group" style="justify-content:flex-end;">
          <button class="btn-success btn-sm" data-action="confirm">Confirmar</button>
          <button class="btn-warning btn-sm" data-action="reject">Rechazar</button>
        </div>` : ''}
      </div>
    </div>
  `;

  card.querySelector('[data-action="edit"]').addEventListener('click', () => openBlockModal(block));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => {
    if (confirm(`Eliminar bloque ${block.slot} del ${formatDay(block.date)}?`)) deleteBlock(block);
  });
  if (status === 'pendiente') {
    card.querySelector('[data-action="confirm"]').addEventListener('click', () => confirmBlock(block));
    card.querySelector('[data-action="reject"]').addEventListener('click', () => rejectBlock(block));
  }
  return card;
}

// ===================================================
// AGENDA — CRUD bloques
// ===================================================

function openBlockModal(block = null) {
  const isEdit = Boolean(block);
  const dates = getWeekDates(state.selectedWeek);
  const dateOptions = dates.map(d =>
    `<option value="${d}"${block?.date === d ? ' selected' : ''}>${formatDay(d)}</option>`
  ).join('');
  const slotOptions = state.config.bloques_horarios.map(s =>
    `<option value="${s}"${block?.slot === s ? ' selected' : ''}>${s}</option>`
  ).join('');

  const modal = showModal(`
    <button class="modal-close">&#x2715;</button>
    <h3 class="modal-title">${isEdit ? 'Editar' : 'Nuevo'} bloque</h3>
    <form id="blockForm">
      <div class="form-row">
        <div class="form-group">
          <label>Día</label>
          <select name="date" required>${dateOptions}</select>
        </div>
        <div class="form-group">
          <label>Horario</label>
          <select name="slot" required>${slotOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <label>Personas necesarias</label>
        <select name="peopleNeeded">
          <option value="1"${block?.peopleNeeded === 1 ? ' selected' : ''}>1 persona</option>
          <option value="2"${block?.peopleNeeded === 2 ? ' selected' : ''}>2 personas</option>
          <option value="3"${block?.peopleNeeded === 3 ? ' selected' : ''}>3 personas</option>
        </select>
      </div>
      <div class="form-group">
        <label>Actividades</label>
        <div id="bkActivities" class="checkbox-group"></div>
      </div>
      <div class="form-group">
        <label>Colaboradores asignados (opcional)</label>
        <div id="bkCollabs" class="checkbox-group"></div>
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="bkPriority" name="priority"${block?.priority ? ' checked' : ''} style="width:auto;" />
        <label for="bkPriority" style="margin:0;font-weight:500;">Marcar como PRIORITARIO</label>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea name="notes">${block?.notes || ''}</textarea>
      </div>
      <div class="btn-group">
        <button type="submit" class="btn-primary">Guardar</button>
        <button type="button" id="bkCancel" class="btn-secondary">Cancelar</button>
      </div>
    </form>
  `);

  // Build checkbox groups
  buildCheckboxGroup(modal.querySelector('#bkActivities'),
    Object.values(state.activities).map(a => ({ id: a.id, label: a.name })),
    block?.activityIds || []);
  buildCheckboxGroup(modal.querySelector('#bkCollabs'),
    Object.values(state.collaborators).map(c => ({ id: c.id, label: c.name })),
    block?.collaboratorIds || []);

  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#bkCancel').addEventListener('click', () => modal.remove());

  modal.querySelector('#blockForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newBlock = {
      id:              block?.id || uid(),
      date:            fd.get('date'),
      slot:            fd.get('slot'),
      peopleNeeded:    Number(fd.get('peopleNeeded')),
      activityIds:     getChecked(modal.querySelector('#bkActivities')),
      collaboratorIds: getChecked(modal.querySelector('#bkCollabs')),
      priority:        modal.querySelector('#bkPriority').checked,
      notes:           fd.get('notes').trim(),
      confirmed:       block?.confirmed || false
    };

    if (isSlotTaken(newBlock, block?.id)) {
      alert('Ya existe un bloque en ese día y horario.');
      return;
    }

    db.set(`weeks/${state.selectedWeek}/blocks/${newBlock.id}`, newBlock).then(() => {
      modal.remove();
      refresh();
    });
  });
}

function isSlotTaken(newBlock, ignoreId) {
  return getBlocksForWeek().some(b =>
    b.id !== ignoreId && b.date === newBlock.date && b.slot === newBlock.slot
  );
}

function deleteBlock(block) {
  db.remove(`weeks/${state.selectedWeek}/blocks/${block.id}`).then(refresh);
}

function confirmBlock(block) {
  const updated = { ...block, confirmed: true };
  db.set(`weeks/${state.selectedWeek}/blocks/${block.id}`, updated).then(() => {
    const notifUpdates = {};
    (block.collaboratorIds || []).forEach(cid => {
      const nid = uid();
      notifUpdates[`notifications/collaborators/${cid}/${nid}`] = {
        id: nid, text: `Tu turno del ${formatDay(block.date)} ${block.slot} fue confirmado.`,
        type: 'confirmado', date: Date.now(), read: false
      };
    });
    if (Object.keys(notifUpdates).length) db.update('', notifUpdates);
    refresh();
  });
}

function rejectBlock(block) {
  const assigned = [...(block.collaboratorIds || [])];
  const updated = { ...block, collaboratorIds: [], confirmed: false };
  db.set(`weeks/${state.selectedWeek}/blocks/${block.id}`, updated).then(() => {
    const notifUpdates = {};
    assigned.forEach(cid => {
      const nid = uid();
      notifUpdates[`notifications/collaborators/${cid}/${nid}`] = {
        id: nid, text: `Tu solicitud para ${formatDay(block.date)} ${block.slot} no fue aceptada.`,
        type: 'rechazado', date: Date.now(), read: false
      };
    });
    if (Object.keys(notifUpdates).length) db.update('', notifUpdates);
    refresh();
  });
}

function copyPreviousWeek() {
  const d = weekStartDate(state.selectedWeek);
  d.setUTCDate(d.getUTCDate() - 7);
  const prevId = isoWeekId(d);
  const source = state.weeks[prevId];
  if (!source || !source.blocks) { alert('No hay bloques en la semana anterior para copiar.'); return; }

  const existing = getBlocksForWeek();
  const updates = {};

  Object.values(source.blocks).forEach(block => {
    // shift date by 7 days
    const [y, m, day] = block.date.split('-').map(Number);
    const newDate = new Date(y, m - 1, day);
    newDate.setDate(newDate.getDate() + 7);
    const newDateStr = newDate.toISOString().split('T')[0];

    // check slot not taken
    const taken = existing.some(b => b.date === newDateStr && b.slot === block.slot);
    if (taken) return;

    const id = uid();
    updates[`weeks/${state.selectedWeek}/blocks/${id}`] = {
      id, date: newDateStr, slot: block.slot,
      activityIds: block.activityIds || [],
      collaboratorIds: [], confirmed: false,
      peopleNeeded: block.peopleNeeded || 1,
      priority: block.priority || false,
      notes: ''
    };
  });

  if (!Object.keys(updates).length) { alert('Todos los horarios de la semana anterior ya están ocupados.'); return; }
  db.update('', updates).then(refresh);
}

// ===================================================
// COLABORADORES
// ===================================================

function renderCollaborators() {
  // Populate form checkboxes with latest activities/days (only when not editing)
  if (!state.editingCollabId) {
    buildCheckboxGroup(
      document.getElementById('collabActivities'),
      Object.values(state.activities).map(a => ({ id: a.id, label: a.name })), []
    );
    buildCheckboxGroup(
      document.getElementById('collabAvailability'),
      ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((v, i) => ({ id: String(i), label: v })), []
    );
  }

  const list = document.getElementById('collabList');
  const collabs = Object.values(state.collaborators);

  if (!collabs.length) {
    list.innerHTML = '<div class="empty-state">No hay colaboradores. Agrega el primero abajo.</div>';
    return;
  }

  list.innerHTML = '';
  collabs.forEach(c => {
    const actNames = (c.activityIds || []).map(id => state.activities[id]?.name || id).join(', ') || 'Sin actividades';
    const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const avail = DAYS.map((d, i) => (c.availability || []).includes(i) ? d : null).filter(Boolean).join(' ') || 'Sin disponibilidad';

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-row">
        <div class="card-info">
          <div class="card-title">${c.name}</div>
          <div class="card-sub">${actNames}</div>
          <div class="card-sub">Disponibilidad: ${avail}</div>
          ${c.notes ? `<div class="card-sub" style="font-style:italic;">${c.notes}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn-secondary btn-sm" data-edit="${c.id}">Editar</button>
          <button class="btn-danger btn-sm" data-del="${c.id}">Eliminar</button>
        </div>
      </div>
    `;
    card.querySelector(`[data-edit]`).addEventListener('click', () => editCollaborator(c.id));
    card.querySelector(`[data-del]`).addEventListener('click', () => {
      if (confirm(`Eliminar a ${c.name}?`)) db.remove(`collaborators/${c.id}`).then(refresh);
    });
    list.append(card);
  });
}

function editCollaborator(id) {
  const c = state.collaborators[id];
  if (!c) return;
  state.editingCollabId = id;
  document.getElementById('collabFormTitle').textContent = `Editar colaborador: ${c.name}`;
  document.getElementById('collabName').value = c.name;
  document.getElementById('collabLink').value = getCollabUrl(c.id);
  document.getElementById('collabNotes').value = c.notes || '';
  buildCheckboxGroup(
    document.getElementById('collabActivities'),
    Object.values(state.activities).map(a => ({ id: a.id, label: a.name })),
    c.activityIds || []
  );
  buildCheckboxGroup(
    document.getElementById('collabAvailability'),
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((v, i) => ({ id: String(i), label: v })),
    (c.availability || []).map(String)
  );
  showSection('collaborators');
}

document.getElementById('collaboratorForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = state.editingCollabId || uid();
  const value = {
    id,
    name: document.getElementById('collabName').value.trim(),
    activityIds: getChecked(document.getElementById('collabActivities')),
    availability: getChecked(document.getElementById('collabAvailability')).map(Number),
    notes: document.getElementById('collabNotes').value.trim(),
    code: id
  };
  db.set(`collaborators/${id}`, value).then(() => {
    state.editingCollabId = null;
    document.getElementById('collaboratorForm').reset();
    document.getElementById('collabLink').value = '';
    document.getElementById('collabFormTitle').textContent = 'Agregar colaborador';
    refresh();
  });
});

document.getElementById('collabReset').addEventListener('click', () => {
  state.editingCollabId = null;
  document.getElementById('collaboratorForm').reset();
  document.getElementById('collabLink').value = '';
  document.getElementById('collabFormTitle').textContent = 'Agregar colaborador';
});

document.getElementById('copyLinkBtn').addEventListener('click', () => {
  const link = document.getElementById('collabLink').value;
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.getElementById('copyLinkBtn');
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  }).catch(() => alert('No se pudo copiar. Link: ' + link));
});

// ===================================================
// ACTIVIDADES
// ===================================================

function renderActivities() {
  const list = document.getElementById('activityList');
  const acts = Object.values(state.activities);

  if (!acts.length) {
    list.innerHTML = '<div class="empty-state">No hay actividades. Agrega la primera abajo.</div>';
    return;
  }

  list.innerHTML = '';
  acts.forEach(act => {
    const cat = state.config?.categorias?.find(c => c.value === act.category);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-row">
        <div class="card-info">
          <div class="card-title">
            ${act.name}
            <span class="badge" style="margin-left:8px;background:${cat?.color || '#ccc'}22;color:${cat?.color || '#555'};border:1px solid ${cat?.color || '#ccc'}55;">${act.category}</span>
          </div>
          <div class="card-sub">${act.people} persona(s)${act.experience ? ' · Requiere experiencia' : ''}</div>
          ${act.instructions ? `<div class="card-sub" style="margin-top:4px;">${act.instructions.slice(0, 120)}${act.instructions.length > 120 ? '…' : ''}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn-secondary btn-sm" data-edit="${act.id}">Editar</button>
          <button class="btn-danger btn-sm" data-del="${act.id}">Eliminar</button>
        </div>
      </div>
    `;
    card.querySelector(`[data-edit]`).addEventListener('click', () => editActivity(act.id));
    card.querySelector(`[data-del]`).addEventListener('click', () => {
      if (confirm(`Eliminar actividad "${act.name}"?`)) db.remove(`activities/${act.id}`).then(refresh);
    });
    list.append(card);
  });
}

function editActivity(id) {
  const act = state.activities[id];
  if (!act) return;
  state.editingActivityId = id;
  document.getElementById('activityFormTitle').textContent = `Editar actividad: ${act.name}`;
  document.getElementById('activityName').value = act.name;
  document.getElementById('activityCategory').value = act.category;
  document.getElementById('activityPeople').value = act.people;
  document.getElementById('activityExperience').checked = act.experience;
  document.getElementById('activityInstructions').value = act.instructions || '';
  showSection('activities');
}

document.getElementById('activityForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = state.editingActivityId || uid();
  const value = {
    id,
    name:         document.getElementById('activityName').value.trim(),
    category:     document.getElementById('activityCategory').value,
    people:       Number(document.getElementById('activityPeople').value),
    experience:   document.getElementById('activityExperience').checked,
    instructions: document.getElementById('activityInstructions').value.trim()
  };
  db.set(`activities/${id}`, value).then(() => {
    state.editingActivityId = null;
    document.getElementById('activityForm').reset();
    document.getElementById('activityFormTitle').textContent = 'Agregar actividad';
    refresh();
  });
});

document.getElementById('activityReset').addEventListener('click', () => {
  state.editingActivityId = null;
  document.getElementById('activityForm').reset();
  document.getElementById('activityFormTitle').textContent = 'Agregar actividad';
});

// ===================================================
// HELPERS
// ===================================================

function buildCheckboxGroup(container, items, selectedIds = []) {
  container.innerHTML = '';
  items.forEach(item => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = item.id;
    input.checked = selectedIds.includes(item.id);
    const span = document.createElement('span');
    span.textContent = item.label;
    label.append(input, span);
    container.append(label);
  });
}

function getChecked(container) {
  return Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
}

// ===================================================
// INIT
// ===================================================

function refresh() {
  return loadData().then(() => {
    renderWeekHeader();
    renderFilterChips();
    renderBlocks();
    renderCollaborators();
    renderActivities();
    updateBell();
  });
}

function populateCategorySelect() {
  const sel = document.getElementById('activityCategory');
  sel.innerHTML = state.config.categorias.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
}

function populateCollabForm() {
  buildCheckboxGroup(
    document.getElementById('collabActivities'),
    Object.values(state.activities).map(a => ({ id: a.id, label: a.name })),
    []
  );
  buildCheckboxGroup(
    document.getElementById('collabAvailability'),
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((v, i) => ({ id: String(i), label: v })),
    []
  );
}

loadConfig().then(() => {
  populateCategorySelect();
}).catch(console.error);
