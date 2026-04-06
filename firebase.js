const FIREBASE_BASE = 'https://apoyoconbebes-default-rtdb.firebaseio.com';

function normalizePath(path) {
  if (!path) return '';
  return path.replace(/^\/+|\/+$/g, '');
}

async function firebaseRequest(path, options = {}) {
  const p = normalizePath(path);
  const url = p ? `${FIREBASE_BASE}/${p}.json` : `${FIREBASE_BASE}/.json`;
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firebase ${res.status}: ${text}`);
  }
  return res.json();
}

window.db = {
  get:    path        => firebaseRequest(path, { method: 'GET' }),
  set:    (path, val) => firebaseRequest(path, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) }),
  update: (path, val) => firebaseRequest(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) }),
  remove: path        => firebaseRequest(path, { method: 'DELETE' }),
  push:   (path, val) => firebaseRequest(path, { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) })
};
