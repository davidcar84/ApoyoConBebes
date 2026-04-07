const FIREBASE_URL = 'https://apoyoconbebes-default-rtdb.firebaseio.com';

async function fbReq(path, opts = {}) {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const url = clean ? `${FIREBASE_URL}/${clean}.json` : `${FIREBASE_URL}/.json`;
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Firebase ${res.status}: ${await res.text()}`);
  return res.json();
}

const J = v => JSON.stringify(v);
const H = { 'Content-Type': 'application/json' };

window.db = {
  get:    path       => fbReq(path, { method: 'GET' }),
  set:    (path, v)  => fbReq(path, { method: 'PUT',   headers: H, body: J(v) }),
  update: (path, v)  => fbReq(path, { method: 'PATCH', headers: H, body: J(v) }),
  remove: path       => fbReq(path, { method: 'DELETE' }),
  push:   (path, v)  => fbReq(path, { method: 'POST',  headers: H, body: J(v) }),
};
