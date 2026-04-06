const FIREBASE_BASE = 'https://apoyoconbebes-default-rtdb.firebaseio.com';
function normalizePath(path) {
  if (!path) return '';
  return path.replace(/^\/+|\/+$/g, '');
}
async function firebaseRequest(path, options = {}) {
  const normalizedPath = normalizePath(path);
  const url = normalizedPath ? `${FIREBASE_BASE}/${normalizedPath}.json` : `${FIREBASE_BASE}/.json`;
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase error ${response.status}: ${text}`);
  }
  return response.json();
}
window.db = {
  get(path) { return firebaseRequest(path, { method: 'GET' }); },
  set(path, value) { return firebaseRequest(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); },
  update(path, value) { return firebaseRequest(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); },
  remove(path) { return firebaseRequest(path, { method: 'DELETE' }); },
  push(path, value) { return firebaseRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); }
};
