// Small, dependency-free helpers shared by the maintenance tools.
// Node 18+ (global fetch). Every download is size-capped and, where we know it, integrity-checked.

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const UA = 'waitbook-tools (+https://github.com/)';

export async function fetchBytes(url, { maxBytes = 64 * 2 ** 20, headers = {}, timeoutMs = 60000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow', signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) throw new Error(`${url} is ${len} bytes, over the ${maxBytes} limit`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`${url} exceeded ${maxBytes} bytes`);
    return buf;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url, opts) {
  return (await fetchBytes(url, opts)).toString('utf8');
}

/** Verify an npm-style "sha512-<base64>" integrity string. */
export function checkIntegrity(buf, integrity) {
  const [algo, want] = integrity.split('-');
  const got = createHash(algo).update(buf).digest('base64');
  if (got !== want) throw new Error(`integrity mismatch: expected ${integrity}, got ${algo}-${got}`);
}

/** Minimal ustar reader: returns Map(path -> Buffer) for regular files. */
export function untar(tgz) {
  const tar = gunzipSync(tgz);
  const files = new Map();
  let off = 0;
  let longName = null;
  while (off + 512 <= tar.length) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (a, b) => header.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    let name = field(0, 100);
    const prefix = field(345, 500);
    if (prefix) name = prefix + '/' + name;
    const size = parseInt(field(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const body = tar.subarray(off + 512, off + 512 + size);
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0.*$/s, '');
    } else if (type === 'x' || type === 'g') {
      const m = /\d+ path=([^\n]+)\n/.exec(body.toString('utf8'));
      if (m) longName = m[1];
    } else {
      if (longName) { name = longName; longName = null; }
      if (type === '0' || type === '\0') files.set(name, Buffer.from(body));
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

export async function npmPackage({ name, version, integrity }) {
  const base = name.startsWith('@') ? name.split('/')[1] : name;
  const url = `https://registry.npmjs.org/${name}/-/${base}-${version}.tgz`;
  const tgz = await fetchBytes(url, { maxBytes: 128 * 2 ** 20 });
  checkIntegrity(tgz, integrity);
  return untar(tgz);
}
