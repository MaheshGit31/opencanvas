#!/usr/bin/env node
/* Checks registry.json and every file it points to. Run: node tools/validate-registry.js [path] */
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'community', 'registry.json');
const base = path.dirname(file); let bad = 0;
const fail = m => { console.error('x ' + m); bad++; };
let reg; try { reg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('registry.json is not valid JSON'); process.exit(1); }
const ids = new Set();
const exists = (p, what) => { if (!p) return fail(what + ' is missing a path'); if (/^https?:/.test(p)) return; if (p.includes('..')) return fail(p + ' must stay inside the registry'); if (!fs.existsSync(path.join(base, p))) fail(p + ' not found'); };
(reg.templates || []).forEach(t => {
  if (!/^[a-z0-9-]+$/.test(t.id || '')) fail('template id must be lowercase with dashes: ' + t.id);
  if (ids.has('t:' + t.id)) fail('duplicate template ' + t.id); ids.add('t:' + t.id);
  if (!t.name) fail(t.id + ' needs a name'); if (!t.license) fail(t.id + ' needs a license');
  exists(t.file, t.id); if (t.thumb) exists(t.thumb, t.id);
  try { const j = JSON.parse(fs.readFileSync(path.join(base, t.file), 'utf8')); if (j.format !== 'opencanvas-template') fail(t.id + ' file is not a template'); if (!Array.isArray(j.elements)) fail(t.id + ' has no elements'); if (JSON.stringify(j).length > 8e6) fail(t.id + ' is over 8 MB'); } catch (e) { fail(t.id + ' template.json cannot be read'); }
});
const PERMS = ['selection.read', 'selection.write', 'insert', 'palette', 'storage', 'network'];
(reg.apps || []).forEach(a => {
  if (!/^[a-z0-9-]+$/.test(a.id || '')) fail('app id must be lowercase with dashes: ' + a.id);
  if (ids.has('a:' + a.id)) fail('duplicate app ' + a.id); ids.add('a:' + a.id);
  if (!a.name) fail(a.id + ' needs a name'); exists(a.entry, a.id);
  (a.permissions || []).forEach(p => { if (!PERMS.includes(p)) fail(a.id + ' asks for unknown permission ' + p); });
  if (a.entry && !/^https?:/.test(a.entry) && fs.existsSync(path.join(base, a.entry))) { const t = fs.readFileSync(path.join(base, a.entry), 'utf8'); if (/<script[^>]+src=["']https?:\/\/(?!cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/i.test(t)) fail(a.id + ' loads scripts from a host that is not allowed'); }
});
if (bad) { console.error(bad + ' problem' + (bad > 1 ? 's' : '')); process.exit(1); }
console.log('Registry looks good: ' + (reg.templates || []).length + ' templates, ' + (reg.apps || []).length + ' apps');
