const state = {
  config: null,
  selectedWeek: null,
  weeks: {},
  collaborators: {},
  activities: {},
  notifications: [],
  editingCollabId: null,
  editingActivityId: null,
  currentSection: 'agenda'
};

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

// Sidebar Navigation
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section');

// Agenda
const weekDisplay = document.getElementById('weekDisplay');
const prevWeek = document.getElementById('prevWeek');
const nextWeek = document.getElementById('nextWeek');
const newBlockBtn = document.getElementById('newBlockBtn');
const copyWeekBtn = document.getElementById('copyWeekBtn');
const blocksContainer = document.getElementById('blocksContainer');

// Collaborators
const collabList = document.getElementById('collabList');
const collaboratorForm = document.getElementById('collaboratorForm');
const collabName = document.getElementById('collabName');
const collabLink = document.getElementById('collabLink');
const collabActivities = document.getElementById('collabActivities');
const collabAvailability = document.getElementById('collabAvailability');
const collabNotes = document.getElementById('collabNotes');
const collabReset = document.getElementById('collabReset');

// Activities
const activityList = document.getElementById('activityList');
const activityForm = document.getElementById('activityForm');
const activityName = document.getElementById('activityName');
const activityCategory = document.getElementById('activityCategory');
const activityPeople = document.getElementById('activityPeople');
const activityExperience = document.getElementById('activityExperience');
const activityInstructions = document.getElementById('activityInstructions');
const activityReset = document.getElementById('activityReset');

// Notifications
const parentNotifications = document.getElementById('parentNotifications');

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
  return date.toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' });
}

function formatWeek(weekId) {
  const start = weekStartDate(weekId);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate()+6);
  return `${weekId} • ${start.toLocaleDateString('es-ES',{day:'numeric',month:'short'})} - ${end.toLocaleDateString('es-ES',{day:'numeric',month:'short'})}`;
}

function buildCheckboxGroup(container, items, selectedIds = []) {
  container.innerHTML = '';
  items.forEach(item => {
    const label = document.createElement('label');
    label.style.cssText = 'display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; cursor:pointer;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = item.id;
    input.checked = selectedIds.includes(item.id);
    label.append(input, item.label || item.name || item.value);
    container.append(label);
  });
}

function getCheckedValues(container) {
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
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
  return fetch('config.json').then(res => res.json()).then(config => { state.config = config; });
}

function loadData() {
  return Promise.all([
    db.get('weeks'),
    db.get('collaborators'),
    db.get('activities'),
    db.get('notifications/parents')
  ]).then(([weeks, collaborators, activities, notifications]) => {
    state.weeks = weeks || {};
    state.collaborators = collaborators || {};
    state.activities = activities || {};
    state.notifications = notifications ? Object.values(notifications).sort((a,b)=>b.date-a.date) : [];
    if (!state.selectedWeek) state.selectedWeek = isoWeekId(new Date());
  });
}

// LOGIN
function handleLogin(event) {
  event.preventDefault();
  const pin = document.getElementById('pinInput').value.trim();
  if (pin === state.config.pin_padres) {
    loginScreen.classList.add('hidden');
    adminApp.classList.remove('hidden');
    loginError.style.display = 'none';
    refresh();
  } else {
    loginError.style.display = 'block';
  }
}

// NAVIGATION
function showSection(sectionId) {
  sections.forEach(s => s.classList.remove('active'));
  navLinks.forEach(link => link.classList.remove('active'));
  document.getElementById(sectionId)?.classList.add('active');
  document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('active');
  state.currentSection = sectionId;
}

// AGENDA
function renderWeek() {
  weekDisplay.value = formatWeek(state.selectedWeek);
}

function changeWeek(delta) {
  const current = weekStartDate(state.selectedWeek);
  current.setUTCDate(current.getUTCDate() + delta * 7);
  state.selectedWeek = isoWeekId(current);
  renderBlocks();
  renderWeek();
}

function getVisibleBlocks() {
  const week = state.weeks[state.selectedWeek];
  if (!week || !week.blocks) return [];
  return Object.values(week.blocks).sort((a,b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}

function getBlockState(block) {
  if (!block.collaboratorIds || block.collaboratorIds.length === 0) return 'sin-cubrir';
  return block.confirmed ? 'confirmado' : 'pending';
}

function renderBlocks() {
  blocksContainer.innerHTML = '';
  const blocks = getVisibleBlocks();
  if (!blocks.length) { blocksContainer.innerHTML = '<div class="empty-state"><p>No hay bloques en esta semana</p></div>'; return; }
  
  blocks.forEach(block => {
    const stateCls = getBlockState(block);
    const card = document.createElement('div');
    card.className = 'card list-item';
    const info = document.createElement('div');
    info.className = 'list-item-info';
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.innerHTML = `${formatDay(block.date)} • ${block.slot}`;
    const subtitle = document.createElement('div');
    subtitle.className = 'list-item-subtitle';
    subtitle.textContent = `${block.activityIds.map(id => state.activities[id]?.name || id).join(', ') || 'Sin actividad'} • ${block.collaboratorIds?.length || 0}/${block.peopleNeeded} personas`;
    info.append(title, subtitle);
    
    const actions = document.createElement('div');
    actions.className = 'list-item-actions';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn-secondary btn-small';
    viewBtn.textContent = 'Ver';
    viewBtn.addEventListener('click', () => openBlockModal(block));
    actions.append(viewBtn);
    
    if (stateCls === 'pending') {
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn-success btn-small';
      confirmBtn.textContent = 'Confirmar';
      confirmBtn.addEventListener('click', () => confirmBlock(block));
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn-danger btn-small';
      rejectBtn.textContent = 'Rechazar';
      rejectBtn.addEventListener('click', () => rejectBlock(block));
      actions.append(confirmBtn, rejectBtn);
    }
    
    card.append(info, actions);
    blocksContainer.append(card);
  });
}

function openBlockModal(block = null) {
  const isEdit = Boolean(block);
  const dates = getWeekDates(state.selectedWeek);
  const dateOptions = dates.map(date => `<option value="${date}" ${block?.date === date ? 'selected' : ''}>${formatDay(date)}</option>`).join('');
  const slotOptions = state.config.bloques_horarios.map(slot => `<option value="${slot}" ${block?.slot === slot ? 'selected' : ''}>${slot}</option>`).join('');
  
  const html = `
    <button class="modal-close">×</button>
    <h3>${isEdit ? 'Editar' : 'Crear'} bloque</h3>
    <form id="blockForm">
      <div class="form-row">
        <select name="date" required>${dateOptions}</select>
        <select name="slot" required>${slotOptions}</select>
      </div>
      <div class="form-group">
        <label>Actividades</label>
        <div id="blockActivities" class="checkbox-group"></div>
      </div>
      <div class="form-group">
        <label>Colaboradores</label>
        <div id="blockCollaborators" class="checkbox-group"></div>
      </div>
      <div class="form-row">
        <select name="peopleNeeded" required>
          <option value="1" ${block?.peopleNeeded === 1 ? 'selected' : ''}>1 persona</option>
          <option value="2" ${block?.peopleNeeded === 2 ? 'selected' : ''}>2 personas</option>
          <option value="3" ${block?.peopleNeeded === 3 ? 'selected' : ''}>3 personas</option>
        </select>
        <label style="display:flex; align-items:center; gap:8px; margin-bottom:0;">
          <input type="checkbox" name="priority" ${block?.priority ? 'checked' : ''} />
          <span>Prioritario</span>
        </label>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea name="notes">${block?.notes || ''}</textarea>
      </div>
      <div class="button-group">
        <button type="submit" class="btn-primary">Guardar</button>
        <button type="button" class="btn-secondary" id="cancelBlock">Cancelar</button>
      </div>
    </form>
  `;
  
  const modal = showModal(html);
  const form = modal.querySelector('#blockForm');
  const blockActsContainer = modal.querySelector('#blockActivities');
  const blockCollabsContainer = modal.querySelector('#blockCollaborators');
  
  buildCheckboxGroup(blockActsContainer, Object.values(state.activities).map(a => ({ id: a.id, label: a.name })), block?.activityIds || []);
  buildCheckboxGroup(blockCollabsContainer, Object.values(state.collaborators).map(c => ({ id: c.id, label: c.name })), block?.collaboratorIds || []);
  
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const newBlock = {
      id: block?.id || String(Date.now()),
      date: fd.get('date'),
      slot: fd.get('slot'),
      activityIds: getCheckedValues(blockActsContainer),
      collaboratorIds: getCheckedValues(blockCollabsContainer),
      peopleNeeded: Number(fd.get('peopleNeeded')),
      priority: fd.get('priority') === 'on',
      notes: fd.get('notes'),
      confirmed: block?.confirmed || false
    };
    
    if (isSlotTaken(newBlock, block?.id)) { alert('Ya existe un bloque para este día y horario'); return; }
    
    db.set(`weeks/${state.selectedWeek}/blocks/${newBlock.id}`, newBlock).then(() => {
      modal.remove();
      refresh();
    });
  });
  
  modal.querySelector('#cancelBlock').addEventListener('click', () => modal.remove());
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
}

function isSlotTaken(newBlock, ignoreId) {
  return getVisibleBlocks().some(existing => existing.id !== ignoreId && existing.date === newBlock.date && existing.slot === newBlock.slot);
}

function getWeekDates(weekId) {
  const start = weekStartDate(weekId);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    return day.toISOString().split('T')[0];
  });
}

function confirmBlock(block) {
  if (!block.collaboratorIds || block.collaboratorIds.length === 0) return;
  block.confirmed = true;
  db.set(`weeks/${state.selectedWeek}/blocks/${block.id}`, block).then(() => {
    block.collaboratorIds.forEach(id => {
      db.push(`notifications/collaborators/${id}`, { id: Date.now().toString(), text: `Tu turno del ${formatDay(block.date)} ${block.slot} fue confirmado.`, type: 'confirmado', date: Date.now(), read: false });
    });
    refresh();
  });
}

function rejectBlock(block) {
  if (!block.collaboratorIds || block.collaboratorIds.length === 0) return;
  const assigned = [...block.collaboratorIds];
  block.collaboratorIds = [];
  block.confirmed = false;
  db.set(`weeks/${state.selectedWeek}/blocks/${block.id}`, block).then(() => {
    assigned.forEach(id => {
      db.push(`notifications/collaborators/${id}`, { id: Date.now().toString(), text: `Tu solicitud para el ${formatDay(block.date)} ${block.slot} fue rechazada.`, type: 'rechazado', date: Date.now(), read: false });
    });
    refresh();
  });
}

function copyPreviousWeek() {
  const currentMonday = weekStartDate(state.selectedWeek);
  const previousWeekDate = new Date(currentMonday);
  previousWeekDate.setUTCDate(currentMonday.getUTCDate() - 7);
  const previousWeek = isoWeekId(previousWeekDate);
  const source = state.weeks[previousWeek];
  if (!source || !source.blocks) { alert('No hay datos en la semana anterior'); return; }
  const blocks = Object.values(source.blocks).map(block => ({
    ...block,
    id: String(Date.now() + Math.random()),
    collaboratorIds: [],
    confirmed: false
  }));
  const updates = {};
  blocks.forEach(block => { updates[`weeks/${state.selectedWeek}/blocks/${block.id}`] = block; });
  db.update('', updates).then(refresh);
}

// COLLABORATORS
function renderCollaborators() {
  collabList.innerHTML = '';
  if (!Object.keys(state.collaborators).length) { collabList.innerHTML = '<p class="empty-state">No hay colaboradores registrados</p>'; return; }
  Object.values(state.collaborators).forEach(c => {
    const card = document.createElement('div');
    card.className = 'card list-item';
    const info = document.createElement('div');
    info.className = 'list-item-info';
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = c.name;
    const subtitle = document.createElement('div');
    subtitle.className = 'list-item-subtitle';
    subtitle.textContent = (c.activityIds?.map(id => state.activities[id]?.name || id).join(', ') || 'Sin actividades') + ' • ' + (['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((_, i) => c.availability?.includes(i) ? ['L','M','X','J','V','S','D'][i] : '').filter(x=>x).join('') || 'Sin disponibilidad');
    info.append(title, subtitle);
    const actions = document.createElement('div');
    actions.className = 'list-item-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-secondary btn-small';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => editCollaborator(c.id));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger btn-small';
    delBtn.textContent = 'Eliminar';
    delBtn.addEventListener('click', () => { if (confirm('Eliminar?')) db.remove(`collaborators/${c.id}`).then(refresh); });
    actions.append(editBtn, delBtn);
    card.append(info, actions);
    collabList.append(card);
  });
}

function editCollaborator(id) {
  const c = state.collaborators[id];
  if (!c) return;
  state.editingCollabId = id;
  collabName.value = c.name;
  const basePath = window.location.pathname.includes('ApoyoConBebes') ? '/ApoyoConBebes' : '';
  collabLink.value = `${location.origin}${basePath}/colaborador.html?id=${c.id}`;
  buildCheckboxGroup(collabActivities, Object.values(state.activities).map(a => ({ id: a.id, label: a.name })), c.activityIds || []);
  buildCheckboxGroup(collabAvailability, ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((v,i)=>({id:String(i),label:v})), c.availability || []);
  collabNotes.value = c.notes || '';
  showSection('collaborators');
}

function handleCollaboratorSubmit(e) {
  e.preventDefault();
  const id = state.editingCollabId || String(Date.now());
  const value = {
    id,
    name: collabName.value.trim(),
    activityIds: getCheckedValues(collabActivities),
    availability: getCheckedValues(collabAvailability).map(Number),
    notes: collabNotes.value.trim(),
    code: id
  };
  db.set(`collaborators/${id}`, value).then(() => { state.editingCollabId = null; collaboratorForm.reset(); refresh(); });
}

// ACTIVITIES
function renderActivities() {
  activityList.innerHTML = '';
  if (!Object.keys(state.activities).length) { activityList.innerHTML = '<p class="empty-state">No hay actividades registradas</p>'; return; }
  Object.values(state.activities).forEach(act => {
    const card = document.createElement('div');
    card.className = 'card list-item';
    const info = document.createElement('div');
    info.className = 'list-item-info';
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.innerHTML = `${act.name} <span class="badge badge-primary" style="margin-left:8px;">${act.category}</span>`;
    const subtitle = document.createElement('div');
    subtitle.className = 'list-item-subtitle';
    subtitle.textContent = `${act.people} personas${act.experience ? ' • Requiere experiencia' : ''}`;
    info.append(title, subtitle);
    const actions = document.createElement('div');
    actions.className = 'list-item-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-secondary btn-small';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => editActivity(act.id));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger btn-small';
    delBtn.textContent = 'Eliminar';
    delBtn.addEventListener('click', () => { if (confirm('Eliminar?')) db.remove(`activities/${act.id}`).then(refresh); });
    actions.append(editBtn, delBtn);
    card.append(info, actions);
    activityList.append(card);
  });
}

function editActivity(id) {
  const act = state.activities[id];
  if (!act) return;
  state.editingActivityId = id;
  activityName.value = act.name;
  activityCategory.value = act.category;
  activityPeople.value = act.people;
  activityExperience.checked = act.experience;
  activityInstructions.value = act.instructions || '';
  showSection('activities');
}

function handleActivitySubmit(e) {
  e.preventDefault();
  const id = state.editingActivityId || String(Date.now());
  const value = {
    id,
    name: activityName.value.trim(),
    category: activityCategory.value,
    people: Number(activityPeople.value),
    experience: activityExperience.checked,
    instructions: activityInstructions.value.trim()
  };
  db.set(`activities/${id}`, value).then(() => { state.editingActivityId = null; activityForm.reset(); refresh(); });
}

// NOTIFICATIONS
function renderNotifications() {
  parentNotifications.innerHTML = '';
  if (!state.notifications.length) { parentNotifications.innerHTML = '<p class="empty-state">No hay notificaciones</p>'; return; }
  state.notifications.forEach(note => {
    const item = document.createElement('div');
    item.className = `notification ${note.read ? '' : 'unread'}`;
    item.innerHTML = `<div class="notification-text">${note.text}</div><div class="notification-time">${new Date(note.date).toLocaleString('es-ES')}</div>`;
    parentNotifications.append(item);
  });
}

// INIT
function refresh() {
  return loadData().then(() => {
    renderWeek();
    renderBlocks();
    renderCollaborators();
    renderActivities();
    renderNotifications();
  });
}

function setupEventListeners() {
  // Login
  loginForm.addEventListener('submit', handleLogin);
  
  // Navigation
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const section = link.dataset.section;
      showSection(section);
      if (section === 'collaborators') renderCollaborators();
      if (section === 'activities') renderActivities();
      if (section === 'notifications') renderNotifications();
    });
  });
  
  // Agenda
  prevWeek.addEventListener('click', () => changeWeek(-1));
  nextWeek.addEventListener('click', () => changeWeek(1));
  newBlockBtn.addEventListener('click', () => openBlockModal());
  copyWeekBtn.addEventListener('click', copyPreviousWeek);
  
  // Collaborators
  collaboratorForm.addEventListener('submit', handleCollaboratorSubmit);
  collabReset.addEventListener('click', () => {
    state.editingCollabId = null;
    collaboratorForm.reset();
    collabLink.value = '';
  });
  
  // Activities
  activityForm.addEventListener('submit', handleActivitySubmit);
  activityReset.addEventListener('click', () => {
    state.editingActivityId = null;
    activityForm.reset();
  });
  
  // Category options
  activityCategory.innerHTML = state.config.categorias.map(cat => `<option value="${cat.value}">${cat.label}</option>`).join('');
}

function init() {
  loadConfig().then(() => {
    setupEventListeners();
  }).catch(console.error);
}

init();
