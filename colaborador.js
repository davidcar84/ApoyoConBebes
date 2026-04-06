const collabState = {
  config: null,
  collaborator: null,
  activities: {},
  weeks: {},
  notifications: [],
  selectedTab: 'available'
};
const collabTitle = document.getElementById('collabTitle');
const collabSubtitle = document.getElementById('collabSubtitle');
const errorPanel = document.getElementById('errorPanel');
const availableSection = document.getElementById('availableSection');
const myTurnsSection = document.getElementById('myTurnsSection');
const notificationsSection = document.getElementById('notificationsSection');
const tabAvailableBtn = document.getElementById('tabAvailableBtn');
const tabMyTurnsBtn = document.getElementById('tabMyTurnsBtn');
const tabNotificationsBtn = document.getElementById('tabNotificationsBtn');
const collabChips = document.getElementById('collabChips');
const detailModal = document.getElementById('detailModal');
function normalizePath(path) { return path ? path.replace(/^\/+|\/+$/g, '') : ''; }
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
  return date.toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'numeric' });
}
function toArray(obj) {
  if (!obj) return [];
  return Object.entries(obj).map(([key,value]) => ({ key, ...value }));
}
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
function getVisibleWeekIds() {
  const current = isoWeekId(new Date());
  const result = [];
  let date = weekStartDate(current);
  for (let i = 0; i < (collabState.config?.ventana_semanas || 4); i += 1) {
    result.push(isoWeekId(date));
    date = new Date(date);
    date.setUTCDate(date.getUTCDate() + 7);
  }
  return result;
}
function renderError(message) {
  errorPanel.textContent = message;
  errorPanel.classList.remove('hidden');
}
function clearError() { errorPanel.classList.add('hidden'); errorPanel.textContent = ''; }
function loadConfig() {
  return fetch('config.json').then(res => res.json()).then(config => { collabState.config = config; });
}
function loadData() {
  const collabId = getQueryParam('id');
  if (!collabId) return Promise.reject(new Error('Falta el identificador del colaborador.'));
  return Promise.all([
    db.get(`collaborators/${collabId}`),
    db.get('activities'),
    db.get('weeks'),
    db.get(`notifications/collaborators/${collabId}`)
  ]).then(([collab, activities, weeks, notifications]) => {
    if (!collab) throw new Error('Link de colaborador inválido.');
    collabState.collaborator = collab;
    collabState.activities = activities || {};
    collabState.weeks = weeks || {};
    collabState.notifications = toArray(notifications).sort((a,b)=>b.date-a.date);
  });
}
function getWeekBlocks() {
  const weekIds = getVisibleWeekIds();
  const blocks = [];
  weekIds.forEach(weekId => {
    const week = collabState.weeks[weekId];
    if (!week?.blocks) return;
    Object.values(week.blocks).forEach(block => blocks.push({ ...block, weekId }));
  });
  return blocks;
}
function canCollaborate(block) {
  const common = block.activityIds?.some(id => collabState.collaborator.activityIds?.includes(id));
  if (!common) return false;
  const assigned = block.collaboratorIds || [];
  const already = assigned.includes(collabState.collaborator.id);
  if (already) return false;
  return assigned.length < (block.peopleNeeded || 1);
}
function getAvailableBlocks() {
  return getWeekBlocks()
    .filter(block => canCollaborate(block))
    .sort((a,b) => (b.priority ? 1:0) - (a.priority ? 1:0) || a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}
function getMyTurns() {
  return getWeekBlocks().filter(block => (block.collaboratorIds || []).includes(collabState.collaborator.id));
}
function setActiveTab(tab) {
  collabState.selectedTab = tab;
  tabAvailableBtn.classList.toggle('active', tab === 'available');
  tabMyTurnsBtn.classList.toggle('active', tab === 'myturns');
  tabNotificationsBtn.classList.toggle('active', tab === 'notifications');
  availableSection.classList.toggle('hidden', tab !== 'available');
  myTurnsSection.classList.toggle('hidden', tab !== 'myturns');
  notificationsSection.classList.toggle('hidden', tab !== 'notifications');
  if (tab === 'notifications') markNotificationsRead();
}
function renderChips() {
  const available = getAvailableBlocks().length;
  const mine = getMyTurns().length;
  const unseen = collabState.notifications.filter(n => !n.read).length;
  collabChips.innerHTML = '';
  const chips = [
    { label: 'Disponible', value: available },
    { label: 'Mis turnos', value: mine },
    { label: 'No leídas', value: unseen }
  ];
  chips.forEach(chip => {
    const button = document.createElement('div');
    button.className = 'chip';
    button.textContent = `${chip.label} `;
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = chip.value;
    button.appendChild(badge);
    collabChips.append(button);
  });
}
function renderAvailable() {
  const blocks = getAvailableBlocks();
  availableSection.innerHTML = '<div class="section-title"><h2>Bloques disponibles</h2></div>';
  if (!blocks.length) { availableSection.innerHTML += '<p class="note">No hay bloques disponibles para tus actividades en las semanas visibles.</p>'; return; }
  blocks.forEach(block => {
    const card = document.createElement('div');
    const matchCount = block.activityIds.filter(id => collabState.collaborator.activityIds?.includes(id)).length;
    const assigned = block.collaboratorIds?.length || 0;
    card.className = 'block-card';
    card.innerHTML = `
      <div class="status"><span class="status-pill ${block.priority ? 'prioritario' : 'sin-cubrir'}">${block.priority ? 'PRIORITARIO' : 'Disponible'}</span></div>
      <div class="meta"><strong>${formatDay(block.date)}</strong><span>${block.slot}</span><span>${assigned}/${block.peopleNeeded} personas</span></div>
      <div class="note">Actividades compatibles: ${matchCount}/${block.activityIds?.length || 0}</div>
      <div class="meta">${block.activityIds.map(id => `<span class="badge-pill" style="background:${getActivityColor(id)}">${collabState.activities[id]?.name || id}</span>`).join(' ')}</div>
      <div class="card-footer"><button class="button primary" data-week="${block.weekId}" data-id="${block.id}">Me apunto</button><button class="button secondary" data-detail="${block.id}" data-week="${block.weekId}">Ver</button></div>
    `;
    card.querySelector('[data-week]')?.addEventListener('click', signUpToBlock);
    card.querySelector('[data-detail]')?.addEventListener('click', () => openDetailModal(block));
    availableSection.append(card);
  });
}
function getActivityColor(id) {
  const activity = collabState.activities[id];
  const category = collabState.config.categorias.find(cat => cat.value === activity?.category);
  return category?.color || '#94a3b8';
}
function renderMyTurns() {
  const blocks = getMyTurns();
  myTurnsSection.innerHTML = '<div class="section-title"><h2>Mis turnos</h2></div>';
  if (!blocks.length) { myTurnsSection.innerHTML += '<p class="note">Todavía no te has apuntado a ningún bloque.</p>'; return; }
  blocks.forEach(block => {
    const card = document.createElement('div');
    const status = block.confirmed ? 'Confirmado' : 'Esperando confirmación de los papás';
    const statusClass = block.confirmed ? 'confirmado' : 'pending';
    card.className = 'block-card';
    card.innerHTML = `
      <div class="status"><span class="status-pill ${statusClass}">${status}</span></div>
      <div class="meta"><strong>${formatDay(block.date)}</strong><span>${block.slot}</span><span>${(block.collaboratorIds?.length||0)}/${block.peopleNeeded} personas</span></div>
      <div class="note">Actividades: ${block.activityIds.map(id => collabState.activities[id]?.name || id).join(', ')}</div>
      <div class="card-footer"><button class="button secondary" data-detail="${block.id}" data-week="${block.weekId}">Ver detalles</button></div>
    `;
    card.querySelector('[data-detail]')?.addEventListener('click', () => openDetailModal(block));
    myTurnsSection.append(card);
  });
}
function renderNotifications() {
  notificationsSection.innerHTML = '<div class="section-title"><h2>Notificaciones</h2></div>';
  if (!collabState.notifications.length) { notificationsSection.innerHTML += '<p class="note">No hay notificaciones nuevas.</p>'; return; }
  collabState.notifications.forEach(note => {
    const item = document.createElement('div');
    item.className = `notification-item${note.read ? '' : ' unread'}`;
    item.innerHTML = `<div>${note.text}</div><div class="small">${new Date(note.date).toLocaleString('es-ES')}</div>`;
    notificationsSection.append(item);
  });
}
function signUpToBlock(event) {
  const button = event.currentTarget;
  const weekId = button.dataset.week;
  const blockId = button.dataset.id;
  const week = collabState.weeks[weekId];
  if (!week || !week.blocks || !week.blocks[blockId]) return;
  const block = week.blocks[blockId];
  const assigned = block.collaboratorIds || [];
  if (assigned.includes(collabState.collaborator.id)) return;
  assigned.push(collabState.collaborator.id);
  const update = { collaboratorIds: assigned, confirmed:false };
  db.update(`weeks/${weekId}/blocks/${blockId}`, update).then(() => {
    db.push('notifications/parents', { id: String(Date.now()), text: `${collabState.collaborator.name} se apuntó al bloque ${formatDay(block.date)} ${block.slot}.`, date: Date.now(), read:false });
    refresh();
  }).catch(err => { console.error(err); alert('Error al apuntarte. Intenta de nuevo.'); });
}
function refresh() {
  return loadData().then(() => {
    clearError();
    collabTitle.textContent = `Hola, ${collabState.collaborator.name}`;
    collabSubtitle.textContent = `Actividades: ${collabState.collaborator.activityIds?.map(id => collabState.activities[id]?.name || id).join(', ') || 'No definidas'}`;
    renderChips(); renderAvailable(); renderMyTurns(); renderNotifications(); setActiveTab(collabState.selectedTab);
  }).catch(error => renderError(error.message));
}
function openDetailModal(block) {
  const canDo = block.activityIds.map(id => ({
    name: collabState.activities[id]?.name || id,
    can: collabState.collaborator.activityIds?.includes(id)
  }));
  detailModal.innerHTML = `
    <div class="modal-backdrop"><div class="modal">
      <button class="modal-close">×</button>
      <h3>Detalle del bloque</h3>
      <div class="meta"><strong>${formatDay(block.date)}</strong> · ${block.slot}</div>
      ${block.priority ? '<div class="tag-pill prioritario">PRIORITARIO</div>' : ''}
      <div class="section-title"><h2>Actividades</h2></div>
      <ul class="group-list">${canDo.map(item => `<li style="opacity:${item.can?1:0.45}">${item.name} ${item.can ? '✅' : '⚪'}</li>`).join('')}</ul>
      <p class="note">${block.notes || 'Sin notas.'}</p>
      <div class="card-footer"><button class="button secondary" id="closeDetail">Cerrar</button></div>
    </div></div>`;
  detailModal.classList.remove('hidden');
  detailModal.querySelector('#closeDetail').addEventListener('click', () => detailModal.classList.add('hidden'));
  detailModal.querySelector('.modal-close').addEventListener('click', () => detailModal.classList.add('hidden'));
}
function markNotificationsRead() {
  const unread = collabState.notifications.filter(note => !note.read);
  if (!unread.length) return;
  Promise.all(unread.map(note => db.update(`notifications/collaborators/${collabState.collaborator.id}/${note.key}`, { read:true })))
    .then(() => refresh())
    .catch(console.error);
}
function initTabs() {
  tabAvailableBtn.addEventListener('click', () => setActiveTab('available'));
  tabMyTurnsBtn.addEventListener('click', () => setActiveTab('myturns'));
  tabNotificationsBtn.addEventListener('click', () => setActiveTab('notifications'));
}
function init() {
  loadConfig().then(() => { initTabs(); refresh(); }).catch(error => renderError(error.message));
}
init();
