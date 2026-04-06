const parentState = {
  config: null,
  selectedWeek: null,
  weeks: {},
  collaborators: {},
  activities: {},
  notifications: [],
  filterState: null,
  editingCollabId: null,
  editingActivityId: null
};
const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const weekLabel = document.getElementById('weekLabel');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const stateChips = document.getElementById('stateChips');
const blocksContainer = document.getElementById('blocksContainer');
const copyWeekBtn = document.getElementById('copyWeekBtn');
const newBlockBtn = document.getElementById('newBlockBtn');
const parentNotifications = document.getElementById('parentNotifications');
const collaboratorList = document.getElementById('collaboratorList');
const activityList = document.getElementById('activityList');
const collabForm = document.getElementById('collaboratorForm');
const activityForm = document.getElementById('activityForm');
const collabName = document.getElementById('collabName');
const collabLink = document.getElementById('collabLink');
const collabActivities = document.getElementById('collabActivities');
const collabAvailability = document.getElementById('collabAvailability');
const collabNotes = document.getElementById('collabNotes');
const collabResetBtn = document.getElementById('collabResetBtn');
const activityName = document.getElementById('activityName');
const activityCategory = document.getElementById('activityCategory');
const activityPeople = document.getElementById('activityPeople');
const activityExperience = document.getElementById('activityExperience');
const activityInstructions = document.getElementById('activityInstructions');
const activityResetBtn = document.getElementById('activityResetBtn');
const modalOverlay = document.getElementById('modalOverlay');
const adminTabs = ['agendaSection','collaboratorsSection','activitiesSection'];
const blockStates = ['Sin cubrir','Pendiente','Confirmado','Priorizado'];
const statusOrder = ['Sin cubrir','Pendiente','Confirmado'];
function showLoginError() { loginError.style.display = 'block'; }
function hideLoginError() { loginError.style.display = 'none'; }
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
function formatWeek(weekId) {
  const start = weekStartDate(weekId);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate()+6);
  return `${weekId} · ${start.toLocaleDateString('es-ES',{day:'numeric', month:'short'})} - ${end.toLocaleDateString('es-ES',{day:'numeric', month:'short'})}`;
}
function buildOptions(container, items, selectedIds = []) {
  container.innerHTML = '';
  items.forEach(item => {
    const id = `option-${item.id}`;
    const label = document.createElement('label');
    label.className = 'checkbox-pill';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = item.id;
    input.checked = selectedIds.includes(item.id);
    label.append(input, item.label || item.name || item.value);
    container.append(label);
  });
}
function getSelectedValues(container) {
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
}
function showModal(innerHtml) {
  modalOverlay.innerHTML = `<div class="modal-backdrop"><div class="modal">${innerHtml}</div></div>`;
  modalOverlay.classList.remove('hidden');
  modalOverlay.querySelector('.modal-close')?.addEventListener('click', hideModal);
}
function hideModal() { modalOverlay.classList.add('hidden'); modalOverlay.innerHTML = ''; }
function loadConfig() {
  return fetch('config.json').then(res => res.json()).then(config => { parentState.config = config; return config; });
}
function loadData() {
  return Promise.all([
    db.get('weeks'),
    db.get('collaborators'),
    db.get('activities'),
    db.get('notifications/parents')
  ]).then(([weeks, collaborators, activities, notifications]) => {
    parentState.weeks = weeks || {};
    parentState.collaborators = collaborators || {};
    parentState.activities = activities || {};
    parentState.notifications = notifications ? Object.values(notifications).sort((a,b)=>b.date-a.date) : [];
    if (!parentState.selectedWeek) parentState.selectedWeek = isoWeekId(new Date());
  });
}
function saveBlock(weekId, block) {
  return db.set(`weeks/${weekId}/blocks/${block.id}`, block);
}
function removeBlock(weekId, blockId) { return db.remove(`weeks/${weekId}/blocks/${blockId}`); }
function renderStateChips() {
  const blocks = getVisibleBlocks();
  const counts = { 'Sin cubrir':0,'Pendiente':0,'Confirmado':0,'Prioritario':0 };
  blocks.forEach(block => {
    const state = getBlockState(block);
    counts[state] += 1;
    if (block.priority) counts['Prioritario'] += 1;
  });
  stateChips.innerHTML = '';
  ['Sin cubrir','Pendiente','Confirmado','Prioritario'].forEach(label => {
    const chip = document.createElement('div');
    chip.className = `chip${parentState.filterState===label?' active':''}`;
    chip.innerHTML = `${label} <span class="badge">${counts[label] || 0}</span>`;
    chip.addEventListener('click', () => {
      parentState.filterState = parentState.filterState===label ? null : label;
      renderStateChips(); renderBlocks();
    });
    stateChips.append(chip);
  });
}
function getVisibleBlocks() {
  const week = parentState.weeks[parentState.selectedWeek];
  if (!week || !week.blocks) return [];
  return Object.values(week.blocks).sort((a,b)=> a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}
function getBlockState(block) {
  if (!block.collaboratorIds || block.collaboratorIds.length === 0) return 'Sin cubrir';
  return block.confirmed ? 'Confirmado' : 'Pendiente';
}
function renderBlocks() {
  blocksContainer.innerHTML = '';
  const week = parentState.weeks[parentState.selectedWeek];
  if (!week || !week.blocks) {
    blocksContainer.innerHTML = '<p class="note">No hay bloques definidos para esta semana.</p>';
    return;
  }
  const blocks = getVisibleBlocks().filter(block => {
    if (!parentState.filterState) return true;
    if (parentState.filterState === 'Prioritario') return block.priority;
    return getBlockState(block) === parentState.filterState;
  });
  if (!blocks.length) { blocksContainer.innerHTML = '<p class="note">No hay bloques con ese filtro.</p>'; return; }
  blocks.forEach(block => {
    const card = document.createElement('div');
    const state = getBlockState(block);
    card.className = `block-card ${state.toLowerCase().replace(' ','-')}`;
    card.innerHTML = `
      <div class="status"><span class="status-pill ${state.toLowerCase().replace(' ','-')}">${state}</span> ${block.priority ? '<span class="tag-pill prioritario">PRIORITARIO</span>' : ''}</div>
      <div class="meta"><span>${formatDay(block.date)}</span><span>${block.slot}</span><span>${block.peopleNeeded} personas</span></div>
      <div class="note">${block.notes || 'Sin notas adicionales.'}</div>
      <div class="meta">Actividades: ${block.activityIds.map(id => parentState.activities[id]?.name || id).join(', ') || 'Sin actividad'}</div>
      <div class="meta">Colaboradores: ${block.collaboratorIds?.map(id => parentState.collaborators[id]?.name || id).join(', ') || 'Ninguno'}</div>
      <div class="card-footer">
        <button class="button secondary" data-action="edit" data-id="${block.id}">Editar</button>
        <button class="button danger" data-action="delete" data-id="${block.id}">Eliminar</button>
        ${state === 'Pendiente' ? `<button class="button success" data-action="confirm" data-id="${block.id}">Confirmar</button><button class="button danger" data-action="reject" data-id="${block.id}">Rechazar</button>` : ''}
      </div>
    `;
    card.querySelectorAll('button').forEach(btn => btn.addEventListener('click', handleBlockAction));
    blocksContainer.append(card);
  });
}
function handleBlockAction(event) {
  const action = event.target.dataset.action;
  const blockId = event.target.dataset.id;
  if (!action || !blockId) return;
  const week = parentState.weeks[parentState.selectedWeek];
  const block = week.blocks[blockId];
  if (action === 'delete') {
    if (confirm('Eliminar este bloque?')) { removeBlock(parentState.selectedWeek, blockId).then(refresh); }
  }
  if (action === 'edit') { openBlockForm(block); }
  if (action === 'confirm') { confirmBlock(block); }
  if (action === 'reject') { rejectBlock(block); }
}
function confirmBlock(block) {
  if (!block.collaboratorIds || block.collaboratorIds.length === 0) return;
  block.confirmed = true;
  saveBlock(parentState.selectedWeek, block).then(() => {
    block.collaboratorIds.forEach(id => {
      db.push(`notifications/collaborators/${id}`, { id: Date.now().toString(), text: `Tu turno del ${formatDay(block.date)} ${block.slot} fue confirmado.`, type:'confirmado', date: Date.now(), read:false });
    });
  }).then(refresh);
}
function rejectBlock(block) {
  if (!block.collaboratorIds || block.collaboratorIds.length === 0) return;
  const assigned = [...block.collaboratorIds];
  block.collaboratorIds = [];
  block.confirmed = false;
  saveBlock(parentState.selectedWeek, block).then(() => {
    assigned.forEach(id => {
      db.push(`notifications/collaborators/${id}`, { id: Date.now().toString(), text: `Tu solicitud para el ${formatDay(block.date)} ${block.slot} fue rechazada.`, type:'rechazado', date: Date.now(), read:false });
    });
  }).then(refresh);
}
function renderNotifications() {
  parentNotifications.innerHTML = '';
  if (!parentState.notifications.length) { parentNotifications.innerHTML = '<p class="note">No hay notificaciones.</p>'; return; }
  parentState.notifications.forEach(item => {
    const card = document.createElement('div');
    card.className = `notification-item${item.read ? '' : ' unread'}`;
    card.innerHTML = `<div>${item.text}</div><div class="small">${new Date(item.date).toLocaleString('es-ES')}</div>`;
    parentNotifications.append(card);
  });
}
function openBlockForm(block = null) {
  const isEdit = Boolean(block);
  const title = isEdit ? 'Editar bloque' : 'Crear bloque';
  const dates = getWeekDates(parentState.selectedWeek);
  const slotOptions = parentState.config.bloques_horarios.map(slot => `<option value="${slot}" ${block?.slot===slot ? 'selected':''}>${slot}</option>`).join('');
  const dateOptions = dates.map(date => `<option value="${date}">${formatDay(date)}</option>`).join('');
  const activityOptions = Object.values(parentState.activities).map(act => `<label class="checkbox-pill"><input type="checkbox" value="${act.id}" ${block?.activityIds?.includes(act.id)?'checked':''} /> ${act.name}</label>`).join('');
  const collabOptions = Object.values(parentState.collaborators).map(col => `<label class="checkbox-pill"><input type="checkbox" value="${col.id}" ${block?.collaboratorIds?.includes(col.id)?'checked':''} /> ${col.name}</label>`).join('');
  showModal(`
    <button class="modal-close">×</button>
    <h3>${title}</h3>
    <form id="blockForm">
      <div class="field-grid">
        <label>Fecha<select name="date" required>${dateOptions}</select></label>
        <label>Horario<select name="slot" required>${slotOptions}</select></label>
      </div>
      <label>Actividades<div class="checkbox-group">${activityOptions}</div></label>
      <label>Colaboradores<div class="checkbox-group">${collabOptions}</div></label>
      <div class="field-grid">
        <label>Personas necesarias<select name="peopleNeeded" required><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <label class="checkbox-pill"><input type="checkbox" name="priority" ${block?.priority?'checked':''} /> Prioritario</label>
      </div>
      <label>Notas<textarea name="notes">${block?.notes || ''}</textarea></label>
      <div class="card-footer">
        <button class="button primary" type="submit">Guardar</button>
        <button class="button secondary" type="button" id="cancelBlock">Cancelar</button>
      </div>
    </form>
  `);
  const form = document.getElementById('blockForm');
  if (block) form.date.value = block.date;
  form.peopleNeeded.value = block?.peopleNeeded || '1';
  form.addEventListener('submit', e => {
    e.preventDefault();
    const formData = new FormData(form);
    const newBlock = {
      id: block?.id || String(Date.now()),
      date: formData.get('date'),
      slot: formData.get('slot'),
      activityIds: Array.from(form.querySelectorAll('input[type="checkbox"][value]')).filter(i => i.checked && Object.keys(parentState.activities).includes(i.value)).map(i => i.value),
      collaboratorIds: Array.from(form.querySelectorAll('input[type="checkbox"][value]')).filter(i => i.checked && Object.keys(parentState.collaborators).includes(i.value)).map(i => i.value),
      peopleNeeded: Number(formData.get('peopleNeeded')),
      priority: formData.get('priority') === 'on',
      notes: formData.get('notes'),
      confirmed: block?.confirmed || false
    };
    if (isSlotTaken(newBlock, block?.id)) {
      alert('Ya existe un bloque para esta fecha y horario.');
      return;
    }
    saveBlock(parentState.selectedWeek, newBlock).then(() => { hideModal(); refresh(); });
  });
  document.getElementById('cancelBlock').addEventListener('click', hideModal);
}
function isSlotTaken(newBlock, ignoreId) {
  return getVisibleBlocks().some(existing => existing.id !== ignoreId && existing.date === newBlock.date && existing.slot === newBlock.slot);
}
function getWeekDates(weekId) {
  const start = weekStartDate(weekId);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().split('T')[0];
  });
}
function renderCollaborators() {
  collaboratorList.innerHTML = '';
  if (!Object.keys(parentState.collaborators).length) { collaboratorList.innerHTML = '<p class="note">No hay colaboradores registrados.</p>'; return; }
  Object.values(parentState.collaborators).forEach(collab => {
    const item = document.createElement('div');
    item.className = 'notification-item';
    item.innerHTML = `<div><strong>${collab.name}</strong> · ${collab.activityIds?.map(id => parentState.activities[id]?.name || id).join(', ') || 'Sin actividades'}</div><div class="small">Disponibilidad: ${collab.availability?.map(n => ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][n]).join(', ') || 'Sin disponibilidad'}</div><div class="card-footer"><button class="button secondary" data-action="edit" data-id="${collab.id}">Editar</button><button class="button danger" data-action="delete" data-id="${collab.id}">Eliminar</button></div>`;
    item.querySelector('[data-action="edit"]').addEventListener('click', () => editCollaborator(collab.id));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCollaborator(collab.id));
    collaboratorList.append(item);
  });
}
function renderActivities() {
  activityList.innerHTML = '';
  if (!Object.keys(parentState.activities).length) { activityList.innerHTML = '<p class="note">No hay actividades registradas.</p>'; return; }
  Object.values(parentState.activities).forEach(activity => {
    const category = parentState.config.categorias.find(cat => cat.value === activity.category) || {};
    const item = document.createElement('div');
    item.className = 'notification-item';
    item.innerHTML = `<div><strong>${activity.name}</strong> <span class="badge-pill" style="background:${category.color || '#94a3b8'}">${activity.category}</span></div><div class="small">${activity.people} personas · ${activity.experience ? 'Requiere experiencia' : 'No exige experiencia'}</div><div>${activity.instructions || 'Sin instrucciones.'}</div><div class="card-footer"><button class="button secondary" data-action="edit" data-id="${activity.id}">Editar</button><button class="button danger" data-action="delete" data-id="${activity.id}">Eliminar</button></div>`;
    item.querySelector('[data-action="edit"]').addEventListener('click', () => editActivity(activity.id));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteActivity(activity.id));
    activityList.append(item);
  });
}
function editCollaborator(id) {
  const collab = parentState.collaborators[id];
  if (!collab) return;
  parentState.editingCollabId = id;
  collabName.value = collab.name;
  const basePath = window.location.pathname.includes('ApoyoConBebes') ? '/ApoyoConBebes' : '';
  collabLink.value = `${location.origin}${basePath}/colaborador.html?id=${collab.id}`;
  buildOptions(collabActivities, Object.values(parentState.activities).map(a => ({ id:a.id, label:a.name })), collab.activityIds || []);
  buildOptions(collabAvailability, ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((value,index)=>({id:String(index),label:value})), collab.availability||[]);
  collabNotes.value = collab.notes || '';
}
function editActivity(id) {
  const activity = parentState.activities[id];
  if (!activity) return;
  parentState.editingActivityId = id;
  activityName.value = activity.name;
  activityCategory.value = activity.category;
  activityPeople.value = activity.people;
  activityExperience.checked = activity.experience;
  activityInstructions.value = activity.instructions || '';
}
function deleteCollaborator(id) {
  if (!confirm('Eliminar colaborador?')) return;
  db.remove(`collaborators/${id}`).then(refresh);
}
function deleteActivity(id) {
  if (!confirm('Eliminar actividad?')) return;
  db.remove(`activities/${id}`).then(refresh);
}
function renderAvailabilityOptions() {
  buildOptions(collabAvailability, ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((value,index)=>({ id:String(index), label:value })), []);
}
function renderCategoryOptions() {
  activityCategory.innerHTML = parentState.config.categorias.map(cat => `<option value="${cat.value}">${cat.label}</option>`).join('');
}
function refresh() { return loadData().then(() => { renderUI(); }); }
function renderUI() {
  weekLabel.textContent = formatWeek(parentState.selectedWeek);
  renderStateChips(); renderBlocks(); renderNotifications(); renderCollaborators(); renderActivities(); renderCategoryOptions(); renderAvailabilityOptions(); renderLinkForCollabForm();
}
function renderLinkForCollabForm() {
  if (!parentState.editingCollabId) return;
  const basePath = window.location.pathname.includes('ApoyoConBebes') ? '/ApoyoConBebes' : '';
  collabLink.value = `${location.origin}${basePath}/colaborador.html?id=${parentState.editingCollabId}`;
}
function handleLogin(event) {
  event.preventDefault();
  const pin = document.getElementById('pinInput').value.trim();
  if (pin === parentState.config.pin_padres) {
    loginScreen.classList.add('hidden');
    adminApp.classList.remove('hidden');
    hideLoginError();
    refresh();
  } else { showLoginError(); }
}
function changeWeek(delta) {
  const url = new URL(window.location.href);
  const current = weekStartDate(parentState.selectedWeek);
  current.setUTCDate(current.getUTCDate() + delta * 7);
  parentState.selectedWeek = isoWeekId(current);
  renderUI();
}
function copyPreviousWeek() {
  const currentMonday = weekStartDate(parentState.selectedWeek);
  const previousWeekDate = new Date(currentMonday);
  previousWeekDate.setUTCDate(currentMonday.getUTCDate() - 7);
  const previousWeek = isoWeekId(previousWeekDate);
  const source = parentState.weeks[previousWeek];
  if (!source || !source.blocks) { alert('No hay datos en la semana anterior para copiar.'); return; }
  const blocks = Object.values(source.blocks).map(block => ({
    ...block,
    id: String(Date.now() + Math.random()),
    collaboratorIds: [],
    confirmed: false,
    notes: block.notes || '',
  }));
  const updates = {};
  blocks.forEach(block => { updates[`weeks/${parentState.selectedWeek}/blocks/${block.id}`] = block; });
  db.update('', updates).then(refresh);
}
function setupForms() {
  loginForm.addEventListener('submit', handleLogin);
  prevWeekBtn.addEventListener('click', () => changeWeek(-1));
  nextWeekBtn.addEventListener('click', () => changeWeek(1));
  copyWeekBtn.addEventListener('click', copyPreviousWeek);
  newBlockBtn.addEventListener('click', () => openBlockForm());
  collabForm.addEventListener('submit', event => {
    event.preventDefault();
    const id = parentState.editingCollabId || String(Date.now());
    const values = {
      id,
      name: collabName.value.trim(),
      activityIds: getSelectedValues(collabActivities),
      availability: getSelectedValues(collabAvailability).map(Number),
      notes: collabNotes.value.trim(),
      code: id
    };
    db.set(`collaborators/${id}`, values).then(() => { parentState.editingCollabId = null; collabForm.reset(); refresh(); });
  });
  activityForm.addEventListener('submit', event => {
    event.preventDefault();
    const id = parentState.editingActivityId || String(Date.now());
    const values = {
      id,
      name: activityName.value.trim(),
      category: activityCategory.value,
      people: Number(activityPeople.value),
      experience: activityExperience.checked,
      instructions: activityInstructions.value.trim()
    };
    db.set(`activities/${id}`, values).then(() => { parentState.editingActivityId = null; activityForm.reset(); refresh(); });
  });
  collabResetBtn.addEventListener('click', () => { parentState.editingCollabId = null; collabForm.reset(); collabLink.value = ''; });
  activityResetBtn.addEventListener('click', () => { parentState.editingActivityId = null; activityForm.reset(); });
  modalOverlay.addEventListener('click', event => { if (event.target === modalOverlay) hideModal(); });
}
function init() {
  loadConfig().then(() => { setupForms(); renderCategoryOptions(); renderAvailabilityOptions(); }).catch(console.error);
}
init();
