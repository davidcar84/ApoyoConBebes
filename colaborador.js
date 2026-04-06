/* ===================================================
   COLABORADOR.JS — Vista colaborador ApoyoConBebes
   =================================================== */

const cState = {
  config: null,
  collaboratorId: null,
  weeks: {},
  collaborators: {},
  activities: {},
  collabNotifs: [],
  notifPanelOpen: false,
  availFilter: null,   // null | 'sin-cubrir' | 'pendiente' | 'confirmado' | 'prioritario'
  turnsFilter: null
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

function formatDay(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDayLong(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function uid() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 7);
}

function showModal(html) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.addEventListener('click', e => { if (e.target === back) back.remove(); });
  document.body.append(back);
  return back;
}

// ===================================================
// SEMANAS VISIBLES
// ===================================================

function getVisibleWeekIds() {
  const ventana = cState.config?.ventana_semanas || 4;
  const today = new Date();
  const ids = new Set();
  for (let i = 0; i < ventana; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i * 7);
    ids.add(isoWeekId(d));
  }
  return [...ids];
}

// ===================================================
// LOAD DATA
// ===================================================

function loadConfig() {
  return fetch('config.json').then(r => r.json()).then(cfg => { cState.config = cfg; });
}

function loadData() {
  return Promise.all([
    db.get('weeks'),
    db.get('collaborators'),
    db.get('activities'),
    db.get(`notifications/collaborators/${cState.collaboratorId}`)
  ]).then(([weeks, collaborators, activities, rawNotifs]) => {
    cState.weeks = weeks || {};
    cState.collaborators = collaborators || {};
    cState.activities = activities || {};
    const arr = rawNotifs ? Object.values(rawNotifs) : [];
    cState.collabNotifs = arr.sort((a, b) => b.date - a.date);
  });
}

// ===================================================
// ACCESO
// ===================================================

function showScreen(id) {
  ['codeScreen', 'errorScreen', 'collabApp'].forEach(s =>
    document.getElementById(s).classList.toggle('hidden', s !== id)
  );
}

function loadCollaborator(id) {
  cState.collaboratorId = id;
  const collab = cState.collaborators[id];
  if (!collab) { showScreen('errorScreen'); return; }

  showScreen('collabApp');
  const actNames = (collab.activityIds || [])
    .map(aid => cState.activities[aid]?.name || aid)
    .filter(Boolean).join(', ');
  document.getElementById('collabTitle').textContent = `Hola, ${collab.name}`;
  document.getElementById('collabSubtitle').textContent = actNames ? `Actividades: ${actNames}` : '';
  setupCollabEvents();
  refresh();
}

// Code form
document.getElementById('codeForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = document.getElementById('codeInput').value.trim();
  const collab = Object.values(cState.collaborators).find(c => c.code === code || c.id === code);
  if (collab) {
    document.getElementById('codeError').classList.add('hidden');
    loadCollaborator(collab.id);
  } else {
    document.getElementById('codeError').classList.remove('hidden');
  }
});

// ===================================================
// NAVEGACIÓN
// ===================================================

function showSection(id) {
  document.querySelectorAll('#collabApp .section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#collabApp .nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  document.querySelector(`#collabApp .nav-link[data-section="${id}"]`)?.classList.add('active');
}

function setupCollabEvents() {
  document.querySelectorAll('#collabApp .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      showSection(link.dataset.section);
      if (link.dataset.section === 'available') { renderAvailableChips(); renderAvailable(); }
      if (link.dataset.section === 'myturns') { renderMyturnsChips(); renderMyTurns(); }
    });
  });

  document.getElementById('bellBtn').addEventListener('click', e => {
    e.stopPropagation();
    cState.notifPanelOpen = !cState.notifPanelOpen;
    document.getElementById('notifPanel').classList.toggle('hidden', !cState.notifPanelOpen);
    if (cState.notifPanelOpen) { renderNotifPanel(); markNotifsRead(); }
  });

  document.getElementById('markReadBtn').addEventListener('click', e => {
    e.stopPropagation();
    markNotifsRead();
  });

  document.addEventListener('click', () => {
    if (cState.notifPanelOpen) {
      cState.notifPanelOpen = false;
      document.getElementById('notifPanel').classList.add('hidden');
    }
  });
}

// ===================================================
// CAMPANA
// ===================================================

function updateBell() {
  const unread = cState.collabNotifs.filter(n => !n.read).length;
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
  if (!cState.collabNotifs.length) {
    body.innerHTML = '<div class="empty-state">No hay notificaciones</div>';
    return;
  }
  body.innerHTML = '';
  cState.collabNotifs.forEach(n => {
    const el = document.createElement('div');
    el.className = `notif-item${n.read ? '' : ' unread'} type-${n.type || ''}`;
    const icon = n.type === 'confirmado' ? '✅' : n.type === 'rechazado' ? '❌' : '📩';
    el.innerHTML = `
      <div class="notif-item-text">${icon} ${n.text}</div>
      <div class="notif-item-time">${new Date(n.date).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
    `;
    body.append(el);
  });
}

function markNotifsRead() {
  const unread = cState.collabNotifs.filter(n => !n.read);
  if (!unread.length) return;
  const updates = {};
  unread.forEach(n => {
    updates[`notifications/collaborators/${cState.collaboratorId}/${n.id}/read`] = true;
  });
  db.update('', updates).then(() => {
    cState.collabNotifs.forEach(n => { n.read = true; });
    updateBell();
    renderNotifPanel();
  });
}

// ===================================================
// BLOQUES DISPONIBLES
// ===================================================

function getAvailableBlocks() {
  const collab = cState.collaborators[cState.collaboratorId];
  if (!collab) return [];

  const myActIds = new Set(collab.activityIds || []);
  const blocks = [];

  getVisibleWeekIds().forEach(weekId => {
    const week = cState.weeks[weekId];
    if (!week?.blocks) return;
    Object.values(week.blocks).forEach(block => {
      // Skip confirmed
      if (block.confirmed) return;
      // Skip if collab already signed up
      if ((block.collaboratorIds || []).includes(cState.collaboratorId)) return;
      // Skip if block is full
      if ((block.collaboratorIds || []).length >= block.peopleNeeded) return;
      // Collab must have at least one activity in common
      if (!(block.activityIds || []).some(id => myActIds.has(id))) return;
      blocks.push({ ...block, weekId });
    });
  });

  // Priority first, then by date, then by slot order
  return blocks.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const slots = cState.config?.bloques_horarios || [];
    return slots.indexOf(a.slot) - slots.indexOf(b.slot);
  });
}

function blockAvailStatus(block) {
  const assigned = (block.collaboratorIds || []).length;
  if (assigned === 0) return 'sin-cubrir';
  if (assigned < block.peopleNeeded) return 'pendiente';
  return 'confirmado';
}

function renderAvailableChips() {
  const blocks = getAvailableBlocks();
  const counts = {
    'sin-cubrir':  blocks.filter(b => blockAvailStatus(b) === 'sin-cubrir').length,
    'pendiente':   blocks.filter(b => blockAvailStatus(b) === 'pendiente').length,
    'prioritario': blocks.filter(b => b.priority).length
  };
  const defs = [
    { key: 'sin-cubrir',  label: 'Sin cubrir' },
    { key: 'pendiente',   label: 'Parcial' },
    { key: 'prioritario', label: 'Prioritario' }
  ];
  const bar = document.getElementById('availableChips');
  bar.innerHTML = '';
  defs.forEach(({ key, label }) => {
    const chip = document.createElement('button');
    chip.className = `chip${cState.availFilter === key ? ' active' : ''}`;
    chip.innerHTML = `${label} <span class="chip-count">${counts[key]}</span>`;
    chip.addEventListener('click', () => {
      cState.availFilter = cState.availFilter === key ? null : key;
      renderAvailableChips();
      renderAvailable();
    });
    bar.append(chip);
  });
}

function renderAvailable() {
  const container = document.getElementById('availableBlocks');
  const collab = cState.collaborators[cState.collaboratorId];
  const myActIds = new Set(collab?.activityIds || []);

  let blocks = getAvailableBlocks();
  if (cState.availFilter === 'prioritario') {
    blocks = blocks.filter(b => b.priority);
  } else if (cState.availFilter) {
    blocks = blocks.filter(b => blockAvailStatus(b) === cState.availFilter);
  }

  container.innerHTML = '';
  if (!blocks.length) {
    container.innerHTML = '<div class="empty-state">No hay bloques disponibles' + (cState.availFilter ? ' con este filtro' : '') + '</div>';
    return;
  }

  blocks.forEach(block => {
    const card = buildAvailCard(block, myActIds);
    container.append(card);
  });
}

function buildAvailCard(block, myActIds) {
  const collab = cState.collaborators[cState.collaboratorId];
  const assigned = (block.collaboratorIds || []).length;
  const otherNames = (block.collaboratorIds || [])
    .map(id => cState.collaborators[id]?.name || id)
    .join(', ');

  const card = document.createElement('div');
  card.className = `card${block.priority ? ' block-sin-cubrir' : ''}`;
  card.style.cursor = 'pointer';

  const actHtml = (block.activityIds || []).map(id => {
    const act = cState.activities[id];
    if (!act) return '';
    const canDo = myActIds.has(id);
    return `<span class="badge" style="opacity:${canDo ? '1' : '.45'};background:var(--primary-muted);color:var(--primary);margin:2px;">${act.name}</span>`;
  }).join('');

  card.innerHTML = `
    <div>
      ${block.priority ? '<span class="priority-banner">&#9733; PRIORITARIO</span>' : ''}
      <div class="card-title" style="margin-top:4px;">${formatDay(block.date)} &bull; ${block.slot}</div>
      <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${actHtml}</div>
      <div class="card-sub" style="margin-top:6px;">
        ${assigned}/${block.peopleNeeded} personas
        ${otherNames ? ` &bull; Apuntados: ${otherNames}` : ''}
      </div>
      ${block.notes ? `<div class="card-sub" style="margin-top:3px;font-style:italic;">"${block.notes}"</div>` : ''}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
      <button class="btn-secondary btn-sm" data-action="detail">Ver detalle</button>
      <button class="btn-primary btn-sm" data-action="signup">Me apunto</button>
    </div>
  `;

  card.querySelector('[data-action="detail"]').addEventListener('click', e => {
    e.stopPropagation();
    openBlockDetail(block, myActIds);
  });
  card.querySelector('[data-action="signup"]').addEventListener('click', e => {
    e.stopPropagation();
    signUp(block);
  });
  card.addEventListener('click', () => openBlockDetail(block, myActIds));

  return card;
}

// ===================================================
// MIS TURNOS
// ===================================================

function getMyTurns() {
  const blocks = [];
  Object.entries(cState.weeks).forEach(([weekId, week]) => {
    if (!week?.blocks) return;
    Object.values(week.blocks).forEach(block => {
      if ((block.collaboratorIds || []).includes(cState.collaboratorId)) {
        blocks.push({ ...block, weekId });
      }
    });
  });
  return blocks.sort((a, b) => a.date.localeCompare(b.date) ||
    (cState.config?.bloques_horarios || []).indexOf(a.slot) - (cState.config?.bloques_horarios || []).indexOf(b.slot)
  );
}

function renderMyturnsChips() {
  const turns = getMyTurns();
  const counts = {
    pendiente:  turns.filter(b => !b.confirmed).length,
    confirmado: turns.filter(b => b.confirmed).length
  };
  const defs = [
    { key: 'pendiente',  label: 'Esperando confirmación' },
    { key: 'confirmado', label: 'Confirmado' }
  ];
  const bar = document.getElementById('myturnsChips');
  bar.innerHTML = '';
  defs.forEach(({ key, label }) => {
    const chip = document.createElement('button');
    chip.className = `chip${cState.turnsFilter === key ? ' active' : ''}`;
    chip.innerHTML = `${label} <span class="chip-count">${counts[key]}</span>`;
    chip.addEventListener('click', () => {
      cState.turnsFilter = cState.turnsFilter === key ? null : key;
      renderMyturnsChips();
      renderMyTurns();
    });
    bar.append(chip);
  });
}

function renderMyTurns() {
  const container = document.getElementById('myTurnsBlocks');
  const collab = cState.collaborators[cState.collaboratorId];
  const myActIds = new Set(collab?.activityIds || []);

  let blocks = getMyTurns();
  if (cState.turnsFilter === 'pendiente')  blocks = blocks.filter(b => !b.confirmed);
  if (cState.turnsFilter === 'confirmado') blocks = blocks.filter(b => b.confirmed);

  container.innerHTML = '';
  if (!blocks.length) {
    container.innerHTML = '<div class="empty-state">No tienes turnos asignados' + (cState.turnsFilter ? ' con este filtro' : '') + '</div>';
    return;
  }

  blocks.forEach(block => {
    const card = document.createElement('div');
    card.className = `card ${block.confirmed ? 'block-confirmado' : 'block-pendiente'}`;
    card.style.cursor = 'pointer';

    const statusText = block.confirmed
      ? '<span class="status-confirmado">&#10003; Confirmado por los papás</span>'
      : '<span class="status-pendiente">&#8987; Esperando confirmación</span>';

    const actNames = (block.activityIds || [])
      .map(id => cState.activities[id]?.name || id)
      .join(', ');

    card.innerHTML = `
      <div>
        ${block.priority ? '<span class="priority-banner">&#9733; PRIORITARIO</span>' : ''}
        <div class="card-title" style="margin-top:4px;">${formatDay(block.date)} &bull; ${block.slot}</div>
        <div class="card-sub" style="margin-top:3px;">${actNames || 'Sin actividades'}</div>
        <div style="margin-top:6px;">${statusText}</div>
        ${block.notes ? `<div class="card-sub" style="margin-top:4px;font-style:italic;">"${block.notes}"</div>` : ''}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button class="btn-secondary btn-sm" data-action="detail">Ver detalle</button>
      </div>
    `;

    card.querySelector('[data-action="detail"]').addEventListener('click', e => {
      e.stopPropagation();
      openBlockDetail(block, myActIds);
    });
    card.addEventListener('click', () => openBlockDetail(block, myActIds));
    container.append(card);
  });
}

// ===================================================
// DETALLE DEL BLOQUE (modal)
// ===================================================

function openBlockDetail(block, myActIds) {
  const actRows = (block.activityIds || []).map(id => {
    const act = cState.activities[id];
    if (!act) return '';
    const canDo = myActIds.has(id);
    const cat = cState.config?.categorias?.find(c => c.value === act.category);
    return `
      <div class="activity-row ${canDo ? 'can-do' : 'cannot-do'}">
        <div class="activity-row-name">
          ${canDo ? '&#10003;' : '&#8722;'} ${act.name}
          <span class="badge" style="margin-left:6px;font-size:0.7rem;background:${cat?.color || '#ccc'}22;color:${cat?.color || '#555'};">${act.category}</span>
        </div>
        ${act.instructions ? `<div class="activity-row-inst">${act.instructions}</div>` : ''}
      </div>
    `;
  }).join('');

  const assignedNames = (block.collaboratorIds || [])
    .map(id => cState.collaborators[id]?.name || id).join(', ');

  const alreadySigned = (block.collaboratorIds || []).includes(cState.collaboratorId);
  const isFull = (block.collaboratorIds || []).length >= block.peopleNeeded;
  const canSignUp = !alreadySigned && !isFull && !block.confirmed;

  const modal = showModal(`
    <button class="modal-close">&#x2715;</button>
    <h3 class="modal-title">
      ${block.priority ? '<span class="priority-banner" style="display:block;margin-bottom:8px;">&#9733; PRIORITARIO</span>' : ''}
      ${formatDayLong(block.date)} &bull; ${block.slot}
    </h3>
    <div class="modal-section">
      <h4>Actividades</h4>
      ${actRows || '<p class="text-muted">Sin actividades especificadas</p>'}
    </div>
    <div class="modal-section">
      <h4>Personas necesarias</h4>
      <p style="margin:0;">${(block.collaboratorIds || []).length}/${block.peopleNeeded} personas cubiertas${assignedNames ? ` (${assignedNames})` : ''}</p>
    </div>
    ${block.notes ? `<div class="modal-section"><h4>Notas</h4><p style="margin:0;">${block.notes}</p></div>` : ''}
    <div class="btn-group" style="margin-top:20px;">
      ${canSignUp ? `<button id="modalSignup" class="btn-primary">Me apunto</button>` : ''}
      <button id="modalClose" class="btn-secondary">${canSignUp ? 'Cancelar' : 'Cerrar'}</button>
    </div>
  `);

  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#modalClose').addEventListener('click', () => modal.remove());
  if (canSignUp) {
    modal.querySelector('#modalSignup').addEventListener('click', () => {
      modal.remove();
      signUp(block);
    });
  }
}

// ===================================================
// APUNTARSE A UN BLOQUE
// ===================================================

function signUp(block) {
  const ids = [...(block.collaboratorIds || [])];
  if (ids.includes(cState.collaboratorId)) return;
  ids.push(cState.collaboratorId);

  const collab = cState.collaborators[cState.collaboratorId];
  const updates = {};
  updates[`weeks/${block.weekId}/blocks/${block.id}/collaboratorIds`] = ids;

  // Notificación a los papás
  const nid = uid();
  updates[`notifications/parents/${nid}`] = {
    id: nid,
    text: `${collab?.name || 'Un colaborador'} se apuntó al bloque ${block.slot} del ${formatDay(block.date)}.`,
    type: 'signup',
    date: Date.now(),
    read: false
  };

  db.update('', updates).then(refresh);
}

// ===================================================
// INIT
// ===================================================

function refresh() {
  return loadData().then(() => {
    renderAvailableChips();
    renderAvailable();
    renderMyturnsChips();
    renderMyTurns();
    updateBell();
  });
}

function init() {
  loadConfig().then(() => {
    return db.get('collaborators');
  }).then(collabs => {
    cState.collaborators = collabs || {};
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      if (cState.collaborators[id]) {
        // Valid ID in URL: load data and show app
        db.get('activities').then(acts => {
          cState.activities = acts || {};
          loadCollaborator(id);
        });
      } else {
        showScreen('errorScreen');
      }
    } else {
      showScreen('codeScreen');
    }
  }).catch(err => {
    console.error(err);
    showScreen('errorScreen');
  });
}

init();
