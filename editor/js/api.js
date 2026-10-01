// Thin client for the local editor server (demorec/server/http.py).
import { S } from './state.js';

export async function api(url, body) {
  const opt = body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Editor': '1' },
    body: JSON.stringify({ project_id: S.id, ...body }),
  };
  const r = await fetch(url, opt);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export async function uploadImage(file) {
  const r = await fetch('/api/upload', {
    method: 'POST', headers: { 'X-Editor': '1', 'X-Filename': encodeURIComponent(file.name) }, body: file,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j.path;
}
