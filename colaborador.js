const collabState = {
  config: null,
  collaboratorId: null,
  weeks: {},
  collaborators: {},
  activities: {},
  notifications: [],
  currentSection: 'available'
};

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const collabApp = document.getElementById('collabApp');
const codeForm = document.getElementById('codeForm');
const codeInput = document.getElementById('codeInput');
const codeError = document.getElementById('codeError');

// Sidebar Navigation
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section');

// Sections
const availableBlocks = document.getElementById('availableBlocks');
const myTurnsBlocks = document.getElementById('myTurnsBlocks');
const notificationsList = document.getElementById('notificationsList');

// UTILITIES
function isoWeekId(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil((((d - Date.UTC(year,0,1)) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2,'0')}`;
}

function weekStartDate(weekId) {
  const [year, week] = weekId.split('-W').map(Number);
  const d = new Date(Date.UTC(year,0,1));
  const day = d.getUTCDay() || 7;
  const diff = (week - 1) * 7 + 1 - (day - 1);
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function formatDay(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'short' });
}

function formatTime(slot) {
  return slot;
}

function getVisibleWeekIds() {
  const today = new Date();
  const weeks = [];
  for (let i = -1; i <= 3; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i * 7);
    weeks.push(isoWeekId(d));
  }
  return weeks;
}

function showModal(html) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${html}</div>`;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  document.body.append(backdrop);
  return backdrop;
}

// LOAD DATA
function loadConfig() {
  return fetch('config.json').then(res => res.json()).then(config => { collabState.config = config; });
}

function loadData() {
  return Promise.all([
    db.get('weeks'),
    db.get('collaborators'),
    db.get('activities'),
    db.get('notifications/collaborators'),
  ]).then(([weeks, collaborators, activities, allNotifications]) => {
    collabState.weeks = weeks || {};
    collabState.collaborators = collaborators || {};
    collabState.activities = activities || {};
    const notifications = allNotifications ? allNotifications[collabState.collaboratorId] || [] : [];
    collabState.notifications = Array.isArray(notifications) 
      ? Object.values(notifications).sort((a,b) => b.date - a.date)
      : [];
  });
}

// LOGIN
function handleCodeSubmit(event) {
  event.preventDefault();
  const code = codeInput.value.trim();
  const collab = Object.values(collabState.collaborators).find(c => c.code === code);
  if (collab) {
    collabState.collaboratorId = collab.id;
    loginScreen.classList.add('hidden');
    collabApp.classList.remove('hidden');
    codeError.style.display = 'none';
    refresh();
  } else {
    codeError.style.display = 'block';
  }
}

// NAVIGATION
function showSection(sectionId) {
  sections.forEach(s => s.classList.remove('active'));
  navLinks.forEach(link => link.classList.remove('active'));
  document.getElementById(sectionId)?.classList.add('active');
  document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('active');
  collabState.currentSection = sectionId;
}

// AVAILABLE BLOCKS
function getAvailableBlocks() {
  const collabId = collabState.collaboratorId;
  const collab = collabState.collaborators[collabId];
  const blockList = [];
  
  getVisibleWeekIds().forEach(weekId => {
    const week = collabState.weeks[weekId];
    if (!week || !week.blocks) return;
    
    Object.values(week.blocks).forEach(block => {
      if (block.confirmed || (block.collaboratorIds && block.collaboratorIds.includes(collabId))) return;
      
      const activities = block.activityIds
        .map(id => collabState.activities[id])
        .filter(a => !a || !a.experience || (collab.activityIds && collab.activityIds.includes(a.id)));
      
      if (activities.length && collab.activityIds && block.activityIds.some(id => collab.activityIds.includes(id))) {
        blockList.push({ ...block, weekId });
      }
    });
  });
  
  return blockList.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}

function renderAvailable() {
  availableBlocks.innerHTML = '';
  const blocks = getAvailableBlocks();
  if (!blocks.length) { availableBlocks.innerHTML = '<div class="empty-state"><p>No hay bloques disponibles</p></div>'; return; }
  
  blocks.forEach(block => {
    const card = document.createElement('div');
    card.className = 'card list-item';
    const info = document.createElement('div');
    info.className = 'list-item-info';
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.innerHTML = `${formatDay(block.date)} • ${block.slot}`;
    const subtitle = document.createElement('div');
    subtitle.className = 'list-item-subtitle';
    subtitle.textContent = `${block.activityIds.map(id => collabState.activities[id]?.name || id).join(', ')} • ${block.collaboratorIds?.length || 0}/${block.peopleNeeded} personas`;
    info.append(title, subtitle);
    
    const actions = document.createElement('div');
    actions.className = 'list-item-actions';
    const detailBtn = document.createElement('button');
    detailBtn.className = 'btn-secondary btn-small';
    detailBtn.textContent = 'Ver';
    detailBtn.addEventListener('click', () => openBlockDetail(block, block.weekId));
    const signBtn = document.createElement('button');
    signBtn.className = 'btn-primary btn-small';
    signBtn.textContent = 'Solicitar';
    signBtn.addEventListener('click', () => signUpToBlock(block, block.weekId));
    actions.append(detailBtn, signBtn);
    
    card.append(info, actions);
    availableBlocks.append(card);
  });
}

// MY TURNS
function getMyTurns() {
  const collabId = collabState.collaboratorId;
  const turnsList = [];
  
  getVisibleWeekIds().forEach(weekId => {
    const week = collabState.weeks[weekId];
    if (!week || !week.blocks) return;
    
    Object.values(week.blocks).forEach(block => {
      if (block.collaboratorIds && block.collaboratorIds.includes(collabId)) {
        turnsList.push({ ...block, weekId });
      }
    });
  });
  
  return turnsList.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}

function renderMyTurns() {
  myTurnsBlocks.innerHTML = '';
  const blocks = getMyTurns();
  if (!blocks.length) { myTurnsBlocks.innerHTML = '<div class="empty-state"><p>No tienes turnos asignados</p></div>'; return; }
  
  blocks.forEach(block => {
    const card = document.createElement('div');
    card.className = `card list-item ${block.confirmed ? 'confirmed' : 'pending'}`;
    const info = document.createElement('div');
    info.className = 'list-item-info';
    const title = document.createElement('div');
    title.className = 'list-item-title';
    const status = block.confirmed ? '✓ Confirmado' : '⏳ Pendiente';
    title.innerHTML = `${status} • ${formatDay(block.date)} ${block.slot}`;
    const subtitle = document.createElement('div');
    subtitle.className = 'list-item-subtitle';
    subtitle.textContent = block.activityIds.map(id => collabState.activities[id]?.name || id).join(', ');
    info.append(title, subtitle);
    
    const actions = document.createElement('div');
    actions.className = 'list-item-actions';
    const detailBtn = document.createElement('button');
    detailBtn.className = 'btn-secondary btn-small';
    detailBtn.textContent = 'Ver';
    detailBtn.addEventListener('click', () => openBlockDetail(block, block.weekId));
    actions.append(detailBtn);
    
    card.append(info, actions);
    myTurnsBlocks.append(card);
  });
}

// NOTIFICATIONS
function renderNotifications() {
  notificationsList.innerHTML = '';
  if (!collabState.notifications.length) { notificationsList.innerHTML = '<div class="empty-state"><p>No hay notificaciones</p></div>'; return; }
  
  collabState.notifications.forEach(note => {
    const item = document.createElement('div');
    item.className = `notification ${note.read ? '' : 'unread'}`;
    item.innerHTML = `<div class="notification-text">${note.text}</div><div class="notification-time">${new Date(note.date).toLocaleString('es-ES')}</div>`;
    notificationsList.append(item);
  });
}

// ACTIONS
function signUpToBlock(block, weekId) {
  const collabId = collabState.collaboratorId;
  if (!block.collaboratorIds) block.collaboratorIds = [];
  
  if (!block.collaboratorIds.includes(collabId)) {
    block.collaboratorIds.push(collabId);
    db.set(`weeks/${weekId}/blocks/${block.id}`, block).then(refresh);
  }
}

function openBlockDetail(block, weekId) {
  const activities = block.activityIds.map(id => collabState.activities[id]?.name || id).join(', ');
  const collabNames = (block.collaboratorIds || []).map(id => collabState.collaborators[id]?.name || id).join(', ');
  
  const html = `
    <button class="modal-close">×</button>
    <h3>${formatDay(block.date)} ${block.slot}</h3>
    <div class="modal-section">
      <strong>Actividades:</strong>
      <p>${activities}</p>
    </div>
    <div class="modal-section">
      <strong>Descripción:</strong>
      <p>${block.notes || 'Sin descripción'}</p>
    </div>
    <div class="modal-section">
      <strong>Personas necesarias:</strong>
      <p>${block.collaboratorIds?.length || 0}/${block.peopleNeeded}</p>
    </div>
    <div class="modal-section">
      <strong>Colaboradores asignados:</strong>
      <p>${collabNames || 'Ninguno'}</p>
    </div>
    <div class="button-group">
      <button class="btn-primary" id="modalClose">Cerrar</button>
    </div>
  `;
  
  const modal = showModal(html);
  modal.querySelector('#modalClose').addEventListener('click', () => modal.remove());
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
}

// INIT
function refresh() {
  return loadData().then(() => {
    renderAvailable();
    renderMyTurns();
    renderNotifications();
  });
}

function setupEventListeners() {
  // Login
  codeForm.addEventListener('submit', handleCodeSubmit);
  
  // Navigation
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const section = link.dataset.section;
      showSection(section);
      if (section === 'available') renderAvailable();
      if (section === 'myturns') renderMyTurns();
      if (section === 'notifications') renderNotifications();
    });
  });
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const idFromUrl = params.get('id');
  
  loadConfig().then(() => {
    if (idFromUrl) {
      collabState.collaboratorId = idFromUrl;
      loginScreen.classList.add('hidden');
      collabApp.classList.remove('hidden');
      refresh();
    } else {
      setupEventListeners();
    }
  }).catch(console.error);
}

init();
