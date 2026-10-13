/* App: boot, projects, saving, home screen */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui;
  const T = s => OC.t(s); const A = OC.app = { dirty: false };
  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

  /* ---------- storage ---------- */
  A.snapshotRecord = async function (p) {
    const used = OC.assets.usedIn(p), assets = {}; used.forEach(id => { const a = OC.assets.map[id]; if (a) assets[id] = { name: a.name, mime: a.mime, blob: a.blob }; });
    let thumb = ''; try { if (p.pages[0]) thumb = OC.render.thumb(p.pages[0], 260).toDataURL('image/webp', .7); } catch (e) { }
    return { project: D.snapshot(p), assets, meta: { id: p.id, name: p.name, modified: p.modified, cat: p.cat, mode: p.mode, thumb } };
  };
  A.save = async function (manual) {
    if (!S.project) return; const p = S.project; try {
      const rec = await A.snapshotRecord(p); await OC.db.set('projects', p.id, rec); await OC.db.set('kv', 'meta:' + p.id, rec.meta); OC.ls.set('last', p.id); A.dirty = false; setState(); if (manual) U.toast('Saved');
    } catch (e) { console.error(e); if (manual) U.toast('Could not save here. Download a project file instead'); }
  };
  const setState = () => { const ss = U.$('#saveState'); if (ss) ss.textContent = A.dirty ? T('Saving') : T('Saved'); };
  const autosave = U.debounce(() => { if (OC.settings.autosave !== false) A.save(false); }, 1200);
  OC.bus.on('changed', () => { A.dirty = true; setState(); autosave(); });
  addEventListener('beforeunload', () => { if (A.dirty && S.project) { A.save(false); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && A.dirty) A.save(false); });
  A.listProjects = async function () { const ks = (await OC.db.keys('kv')).filter(k => String(k).startsWith('meta:')); const out = []; for (const k of ks) { const m = await OC.db.get('kv', k); if (m) out.push(m); } return out.sort((a, b) => b.modified - a.modified); };
  A.deleteProject = async id => { await OC.db.del('projects', id); await OC.db.del('kv', 'meta:' + id); if (S.project && S.project.id === id) { S.project = null; A.goHome(); } };
  A.openId = async function (id) { const rec = await OC.db.get('projects', id); if (!rec) { U.toast('That project is gone'); return; } if (S.project && A.dirty) await A.save(false); OC.assets.map = {}; OC.assets.cache = {}; await OC.assets.restore(rec.assets); open(JSON.parse(rec.project)); };
  function open(p) {
    S.project = p; S.pageIdx = 0; S.sel = []; S.time = 0; S.playing = false; S.editing = null; S.nodeEdit = null; S.cropEl = null; S.enter = null; S.tool = 'select'; S.photoTool = null; S.home = false; OC.threed && (OC.threed.active = null);
    D.reindex(); D.layoutPages(); OC.text.clear && OC.text.clear(); OC.history.init(); A.dirty = false;
    D.walk && 0; const fonts = new Set(); (function w(list) { list.forEach(e => { if (e.type === 'text') { fonts.add(e.ff); (e.runs || []).forEach(r => r.ff && fonts.add(r.ff)); } if (e.children) w(e.children); }); })(p.pages.flatMap(pg => pg.elements)); fonts.forEach(f => f && OC.fonts.ensure(f)); ['heading', 'sub', 'body'].forEach(k => OC.fonts.ensure(p.brand.fonts[k]));
    UI.onProjectOpen(); OC.bus.emit('project-open'); OC.render.invalidate();
  }
  A.create = async function (cat, item) {
    try { OC.templates.track(null, cat.id); } catch (e) { }
    if (S.project && A.dirty) await A.save(false); item = item || [T('Untitled design'), 1080, 1080]; const w = item[1] || 0, hh = item[2] || 0;
    const p = D.newProject({ name: item[0] === 'Custom size' ? T('Untitled design') : item[0], mode: cat.mode, cat: cat.id, w: w || 1080, h: hh || 1080, photo: cat.photo, video: cat.video, data: {} });
    if (cat.mode === 'doc' && w) p.data.size = { w, h: hh }; if (cat.mode === 'email') p.data.size = { w: 600 };
    OC.assets.map = {}; OC.assets.cache = {}; open(p); 
    A.save(false);
  };
  A.duplicateProject = async function (silent) { if (!S.project) return; const rec = await A.snapshotRecord(S.project); const p = JSON.parse(rec.project); p.id = U.uid('proj'); p.name = S.project.name + ' ' + T('copy'); p.created = p.modified = Date.now(); rec.project = JSON.stringify(p); rec.meta.id = p.id; rec.meta.name = p.name; rec.meta.modified = p.modified; await OC.db.set('projects', p.id, rec); await OC.db.set('kv', 'meta:' + p.id, rec.meta); if (!silent) { await A.openId(p.id); U.toast('Made a copy'); } };
  A.jumpHistory = function (i) { const H = OC.history; while (H.idx > i) H.undo(); while (H.idx < i) H.redo(); };
  A.goHome = async function () { if (S.project && A.dirty) await A.save(false); OC.threed && OC.threed.exit && OC.threed.exit(); OC.timeline && OC.timeline.pause(); UI.showHome(); };

  /* ---------- bundles ---------- */
  A.bundle = async function (p) {
    p = p || S.project; const used = OC.assets.usedIn(p), assets = {}; for (const id of used) { const a = OC.assets.map[id]; if (a) assets[id] = { name: a.name, mime: a.mime, data: await U.readFile(a.blob) }; }
    const names = new Set(); (function w(list) { list.forEach(e => { if (e.type === 'text') { names.add(e.ff); (e.runs || []).forEach(r => r.ff && names.add(r.ff)); } if (e.children) w(e.children); }); })(p.pages.flatMap(pg => pg.elements)); const fonts = {}; try { const raw = await OC.fonts.exportUsed([...names]); for (const n in raw) fonts[n] = b64(raw[n]); } catch (e) { }
    return JSON.stringify({ format: 'opencanvas', version: 1, project: JSON.parse(D.snapshot(p)), assets, fonts });
  };
  A.exportBundle = async function () { if (!S.project) return; const t = await A.bundle(); U.download(new Blob([t], { type: 'application/json' }), (S.project.name || 'Design').replace(/[^\w\- ]+/g, '') + '.opencanvas'); };
  A.importBundle = async function (j, silent) {
    if (j.format === 'opencanvas-backup') { for (const b of j.projects) await A.importBundle(b, true); U.toast(j.projects.length + ' projects restored'); if (S.home) A.renderHome(U.$('.home')); return; }
    if (j.format !== 'opencanvas') throw new Error('Not an OpenCanvas file'); const p = j.project; p.id = U.uid('proj'); await OC.assets.restore(j.assets);
    for (const n in j.fonts || {}) { try { if (!OC.fonts.isCustom(n)) { const buf = unb64(j.fonts[n]); await OC.db.set('kv', 'font:' + n, { name: n, buf }); await OC.fonts._register(n, buf); OC.fonts.custom.push && !OC.fonts.custom.some(c => c.name === n) && OC.fonts.custom.push({ name: n }); } } catch (e) { } }
    if (silent) { const rec = await A.snapshotRecord(p); await OC.db.set('projects', p.id, rec); await OC.db.set('kv', 'meta:' + p.id, rec.meta); return; } open(p); A.save(false);
  };
  A.openFile = async function (file) { try { if (!file) { const f = await U.pickFile('.opencanvas,.json'); file = f[0]; } if (!file) return; await A.importBundle(JSON.parse(await file.text())); } catch (e) { console.error(e); U.toast('That file could not be opened'); } };
  A.backupAll = async function () { const list = await A.listProjects(); const bundles = []; for (const m of list) { const rec = await OC.db.get('projects', m.id); if (!rec) continue; const prev = OC.assets.map; OC.assets.map = {}; await OC.assets.restore(rec.assets); bundles.push(JSON.parse(await A.bundle(JSON.parse(rec.project)))); OC.assets.map = prev; } U.download(new Blob([JSON.stringify({ format: 'opencanvas-backup', version: 1, projects: bundles })], { type: 'application/json' }), 'opencanvas-backup.json'); };
  A.shareLink = async function () {
    try { const j = JSON.parse(await A.bundle()); if (JSON.stringify(j).length > 400000) { U.toast('Too big for a link. Save a project file instead'); return; } const cs = new Blob([JSON.stringify(j)]).stream().pipeThrough(new CompressionStream('gzip')); const buf = await new Response(cs).arrayBuffer(); const s = b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); const url = location.href.split('#')[0] + '#share=' + s; if (url.length > 60000) { U.toast('Too big for a link. Save a project file instead'); return; } await U.copyText(url); U.toast('Link copied. It holds the whole design'); } catch (e) { U.toast('Could not make a link here'); }
  };
  async function fromHash() { const m = location.hash.match(/^#share=(.+)$/); if (!m) return false; try { let s = m[1].replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const ds = new Blob([unb64(s)]).stream().pipeThrough(new DecompressionStream('gzip')); const j = JSON.parse(await new Response(ds).text()); history.replaceState(null, '', location.pathname); await A.importBundle(j); return true; } catch (e) { console.warn(e); return false; } }

  /* ---------- home ---------- */
  A.renderHome = async function (host) {
    host.textContent = ''; const hero = h('section.home-hero', h('h1', T('What will you design today?')), h('div.home-search', h('span', { html: OC.icon('search', 18) }), h('input', { placeholder: T('Search templates and sizes'), onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') searchGo(e.target.value); } })));
    const tiles = h('div.home-cats', OC.CATEGORIES.map(c => h('button.home-cat', { onclick: () => UI.newDialog(c.id) }, h('span.hc-ic', { html: OC.icon(c.icon, 24) }), h('b', T(c.label)))));
    const QUICK = [['presentations', 'Presentation', 1920, 1080], ['social', 'Instagram post', 1080, 1080], ['social', 'Story', 1080, 1920], ['print', 'Poster', 1123, 1587], ['videos', 'Video', 1920, 1080], ['education', 'Worksheet', 794, 1123], ['whiteboards', 'Whiteboard', 1920, 1080]];
    const uc = OC.ls.get('usage', { cats: {} }).cats || {}; QUICK.sort((x, y) => (uc[y[0]] || 0) - (uc[x[0]] || 0));
    const quick = h('section.home-sec', h('h2', T('Start something new')), h('div.quick', QUICK.slice(0, 6).map(([c, n, w, hh]) => h('button.quick-card', { onclick: () => A.create(OC.CATEGORIES.find(x => x.id === c), [n, w, hh]) }, h('div.q-prev', h('i', { style: `aspect-ratio:${w}/${hh};${w > hh ? 'width:60%' : 'height:70%'}` })), h('b', T(n)), h('small', w + ' × ' + hh)))));
    const recent = h('section.home-sec', h('h2', T('Recent designs'))); const grid = h('div.home-grid'); recent.append(grid);
    const list = await A.listProjects();
    grid.append(h('button.proj-card.new', { onclick: () => UI.newDialog() }, h('div.pc-thumb', { html: OC.icon('plus', 32) }), h('b', T('New design'))));
    list.slice(0, 24).forEach(m => grid.append(h('div.proj-card', { onclick: () => A.openId(m.id), oncontextmenu: e => { e.preventDefault(); UI.menu([{ label: 'Open', icon: 'folder-open', onclick: () => A.openId(m.id) }, { label: 'Delete', icon: 'trash-2', danger: true, onclick: async () => { if (await UI.confirm('Delete project', m.name, 'Delete', true)) { await A.deleteProject(m.id); A.renderHome(host); } } }], e.clientX, e.clientY); } }, h('div.pc-thumb', m.thumb ? { style: `background-image:url("${m.thumb}")` } : {}, m.thumb ? '' : h('span', { html: OC.icon((OC.CATEGORIES.find(c => c.id === m.cat) || {}).icon || 'file', 28) })), h('b', m.name), h('small', new Date(m.modified).toLocaleDateString()))));
    const tpl = h('section.home-sec', h('h2', T('Templates')));
    const chips = h('div.chips.scroll.sub'); const tgrid = h('div.home-tpl'); let tf = (OC.ls.get('usage', {}).recent || []).length ? 'foryou' : 'all'; tpl.append(chips, tgrid);
    const drawT = () => {
      chips.textContent = ''; OC.templates.FILTERS.forEach(([k, l]) => chips.append(h('button.chip' + (k === tf ? '.on' : ''), { onclick: () => { tf = k; drawT(); } }, T(l))));
      tgrid.textContent = ''; const list = OC.templates.pick(tf);
      if (!list.length) { tgrid.append(UI.empty('Templates you use show up here')); return; }
      list.forEach(t => { const c = (() => { try { return OC.templates.thumb(t, 320); } catch (e) { return U.newCanvas(10, 10); } })(); const cv = U.newCanvas(c.width, c.height); cv.getContext('2d').drawImage(c, 0, 0); tgrid.append(h('button.tpl-card', { onclick: async () => { const cat = OC.CATEGORIES.find(x => t.cats.includes(x.id) && x.mode !== 'doc') || OC.CATEGORIES[2]; await A.create(cat, [t.name, t.w, t.h]); OC.templates.apply(t, {}); OC.history.init(); }, title: t.name }, h('div.tpl-img', cv), h('small', t.name))); });
    };
    drawT();
    const foot = h('section.home-foot', UI.btn('Open a project file', () => A.openFile(), { icon: 'folder-open' }), UI.btn('Coming from Canva?', () => UI.help(), { icon: 'heart' }), UI.btn('Community', async () => { await A.create(OC.CATEGORIES.find(c => c.id === 'social'), ['Untitled design', 1080, 1080]); UI.openPanel('design'); }, { icon: 'users' }));
    host.append(hero, tiles, quick, recent, tpl, foot);
    OC.fonts.preloadMany && OC.fonts.preloadMany(['Poppins', 'Playfair Display', 'Bebas Neue', 'Anton', 'Great Vibes', 'Caveat', 'Inter', 'Shrikhand']);
  };
  function searchGo(q) { q = (q || '').toLowerCase().trim(); if (!q) return UI.newDialog(); for (const c of OC.CATEGORIES) for (const i of c.items) if (i[0].toLowerCase().includes(q)) { A.create(c, i); return; } const c = OC.CATEGORIES.find(c => c.label.toLowerCase().includes(q)); UI.newDialog(c && c.id); }
  OC.bus.on('font-loaded', U.debounce(() => { if (S.home && U.$('.home')) A.renderHome(U.$('.home')); }, 800));

  /* ---------- boot ---------- */
  A.boot = async function () {
    const root = document.getElementById('app'); try {
      await OC.fonts.restoreCustom().catch(() => { }); OC.settings.apply(); UI.build(root);
      document.getElementById('boot') && document.getElementById('boot').remove();
      if (await fromHash()) return; const last = OC.ls.get('last'); const list = await A.listProjects();
      UI.showHome();
      if (location.search.includes('new=')) { }
    } catch (e) { console.error(e); const b = document.getElementById('boot'); if (b) b.textContent = 'Something went wrong while starting. ' + e.message; }
  };
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
  document.addEventListener('DOMContentLoaded', A.boot);
})();
