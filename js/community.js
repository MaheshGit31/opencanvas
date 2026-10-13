/* Community: GitHub based registries, templates, sandboxed apps */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui;
  const T = s => OC.t(s); const C = OC.community = {};
  const CACHE_MS = 10 * 60 * 1000;

  /* ---------- registries ---------- */
  function resolve(src) { // returns {url, base}
    if (src.startsWith('gh:')) { const m = src.slice(3).match(/^([^/@]+)\/([^/@]+)(?:@(.+))?$/); if (!m) return null; const base = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3] || 'main'}/`; return { url: base + 'registry.json', base, label: `${m[1]}/${m[2]}` }; }
    if (/^https?:/.test(src)) { return { url: src, base: src.replace(/[^/]*$/, ''), label: new URL(src).host }; }
    const abs = new URL(src, location.href).href; return { url: abs, base: abs.replace(/[^/]*$/, ''), label: 'Built in' };
  }
  C.load = async function (force) {
    const out = { templates: [], apps: [], errors: [] };
    await Promise.all(OC.settings.registries.map(async src => {
      const r = resolve(src); if (!r) { out.errors.push(src); return; } const ck = 'reg:' + r.url; const cached = OC.ls.get(ck); let data = cached && !force && Date.now() - cached.at < CACHE_MS ? cached.data : null;
      if (!data) { try { const res = await fetch(r.url, { cache: 'no-cache' }); if (!res.ok) throw new Error(res.status); data = await res.json(); OC.ls.set(ck, { at: Date.now(), data }); } catch (e) { data = cached && cached.data; if (!data) { out.errors.push(r.label); return; } } }
      (data.templates || []).forEach(t => out.templates.push({ ...t, _base: r.base, _src: r.label })); (data.apps || []).forEach(a => out.apps.push({ ...a, _base: r.base, _src: r.label }));
    }));
    C.data = out; return out;
  };
  const abs = (base, p) => /^(https?:|data:|blob:)/.test(p) ? p : new URL(p, base).href;

  /* ---------- templates ---------- */
  C.useTemplate = async function (t) {
    if (!UI.isCanvas()) { U.toast('Open a canvas design first'); return; }
    try { const r = await fetch(abs(t._base, t.file)); const j = await r.json(); if (j.assets) await OC.assets.restore(j.assets); if (j.fonts) await OC.fonts.restoreMany && OC.fonts.restoreMany(j.fonts); OC.templates.apply({ w: j.w, h: j.h, bg: j.bg, elements: j.elements }); U.toast('Template added'); }
    catch (e) { console.error(e); U.toast('Could not load that template'); }
  };
  C.templateFile = async function (name, cats) {
    const pg = U.clone(OC.page()); const used = OC.assets.usedIn({ pages: [pg] }); const assets = {}; for (const id of used) { const a = OC.assets.map[id]; if (a) assets[id] = { name: a.name, mime: a.mime, data: await U.readFile(a.blob) }; }
    return { format: 'opencanvas-template', version: 1, name, cats, w: pg.w, h: pg.h, bg: pg.bg, elements: pg.elements, assets };
  };

  /* ---------- lists ---------- */
  C.renderList = async function (host, kind) {
    const box = h('div.community'); host.append(box, h('p.muted.small', T('Shared by people like you')), UI.btn('Share yours', () => C.publishDialog(), { icon: 'share-2', cls: 'full' })); box.append(UI.spinner());
    const data = C.data || await C.load(); box.textContent = ''; let q = '';
    const list = h('div.grid2.cards');
    const draw = () => { list.textContent = ''; const items = kind === 'template' ? data.templates : data.apps; items.filter(x => !q || (x.name + ' ' + (x.tags || []).join(' ') + (x.author || '')).toLowerCase().includes(q.toLowerCase())).forEach(x => list.append(kind === 'template' ? tplCard(x) : appCard(x))); if (!list.children.length) list.append(UI.empty(data.errors.length ? 'Could not reach the registry' : 'Nothing here yet')); };
    box.append(h('div.search', h('span', { html: OC.icon('search', 16) }), h('input', { placeholder: T('Search'), onkeydown: e => e.stopPropagation(), oninput: e => { q = e.target.value; draw(); } })), list); draw();
  };
  const tplCard = t => h('button.card', { title: t.name, onclick: () => C.useTemplate(t) }, h('div.card-img', { style: t.thumb ? `background-image:url("${abs(t._base, t.thumb)}")` : '' }, t.thumb ? '' : h('span', { html: OC.icon('layout-template', 26) })), h('span', t.name), h('small.muted', t.author || t._src));
  const installed = () => OC.ls.get('apps', []);
  const appCard = a => h('button.card', { title: a.desc || a.name, onclick: () => C.openApp(a) }, h('div.card-img.app', { html: OC.icon(a.icon || 'puzzle', 30) }), h('span', a.name), h('small.muted', a.author || a._src));

  /* ---------- apps ---------- */
  UI.panels.apps = { title: 'Apps', render(host, opts) { C.renderApps(host, opts); } };
  C.renderApps = async function (host, opts = {}) {
    if (opts.app) { C.mountApp(host, opts.app); return; }
    const body = h('div'); host.append(body); body.append(UI.spinner()); const data = C.data || await C.load(); body.textContent = '';
    const inst = installed(); const mine = inst.map(i => data.apps.find(a => a.id === i.id) || i.manifest).filter(Boolean);
    body.append(h('div.psec', h('h4', T('Your apps')), mine.length ? h('div.grid2.cards', mine.map(appCard)) : h('p.muted.small', T('Open an app below to add it'))));
    const rest = data.apps.filter(a => !mine.some(m => m.id === a.id)); body.append(h('div.psec', h('h4', T('Discover')), rest.length ? h('div.grid2.cards', rest.map(appCard)) : UI.empty(data.errors.length ? 'Could not reach the registry' : 'No more apps')));
    body.append(UI.btn('Load app from link', async () => { const u = await UI.prompt('App manifest link', 'https://'); if (!u) return; try { const m = await (await fetch(u)).json(); m._base = u.replace(/[^/]*$/, ''); m._src = 'Link'; C.openApp(m); } catch (e) { U.toast('Could not read that link'); } }, { icon: 'link', cls: 'full' }), UI.btn('Share yours', () => C.publishDialog(), { icon: 'share-2', cls: 'full' }));
  };
  C.openApp = function (a) {
    const perms = a.permissions || []; const run = () => { const ins = installed(); if (!ins.some(i => i.id === a.id)) { ins.push({ id: a.id, manifest: { ...a } }); OC.ls.set('apps', ins); } UI.openPanel('apps', { app: a }); };
    if (installed().some(i => i.id === a.id) || OC.settings.safeApps === false) { run(); return; }
    const PL = { 'selection.read': 'Read the elements you select', 'selection.write': 'Change the elements you select', insert: 'Add new elements to your design', palette: 'See your brand colors', storage: 'Keep its own settings', network: 'Use the internet' };
    UI.modal({ title: a.name, width: 420, body: [h('p.muted', a.desc || ''), h('p.small', T('By ' + (a.author || 'someone') + ' from ' + a._src)), h('h5', T('This app can')), h('ul.perm', (perms.length ? perms : ['insert']).map(p => h('li', T(PL[p] || p)))), h('p.muted.small', T('Apps run in a locked box and never see your files unless you let them'))], actions: [{ label: 'Cancel' }, { label: 'Open', primary: true, onclick: run }] });
  };
  let sdkText = null; async function sdk() { if (sdkText) return sdkText; try { sdkText = await (await fetch('sdk/opencanvas-sdk.js')).text(); } catch (e) { sdkText = ''; } return sdkText; }
  C.mountApp = async function (host, a) {
    const head = h('div.app-head', UI.iconBtn('arrow-left', 'Back', () => UI.openPanel('apps')), h('b', a.name), h('span.grow'), UI.iconBtn('rotate-cw', 'Reload', () => { host.textContent = ''; C.mountApp(host, a); }), UI.iconBtn('trash-2', 'Remove app', () => { OC.ls.set('apps', installed().filter(i => i.id !== a.id)); UI.openPanel('apps'); }));
    host.append(head); const frame = h('iframe.app-frame', { sandbox: 'allow-scripts allow-forms allow-modals' }); host.append(frame);
    let html; try { const r = await fetch(abs(a._base || location.href, a.entry || 'index.html')); html = await r.text(); } catch (e) { host.append(UI.empty('Could not load this app')); return; }
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob: ${(a.permissions || []).includes('network') ? 'https:' : ''}; connect-src ${(a.permissions || []).includes('network') ? 'https:' : "'none'"}">`;
    const inject = `${csp}<script>${await sdk()}<\/script><base href="${abs(a._base || location.href, '.')}">`;
    frame.srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + inject) : inject + html;
    const perms = new Set(a.permissions || ['insert']); const store = k => 'app:' + a.id + ':' + k;
    const ser = e => { const c = U.clone(e); return c; };
    const api = {
      async 'selection.get'() { need('selection.read'); return OC.sel.els().map(ser); },
      async 'selection.update'(patches) { need('selection.write'); (patches || []).forEach(pt => { const e = D.get(pt.id); if (e) Object.assign(e, pt.props); }); OC.text.clear && OC.text.clear(); OC.history.commit('App: ' + a.name); OC.render.invalidate(); return true; },
      async 'page.info'() { need('selection.read'); const pg = OC.page(); return { w: pg.w, h: pg.h, count: pg.elements.length, title: pg.title }; },
      async 'palette.get'() { need('palette'); return S.project.brand.colors.slice(); },
      async insert(spec) { need('insert'); return insert(spec); },
      async 'storage.get'(k) { need('storage'); return OC.ls.get(store(k)); },
      async 'storage.set'({ k, v }) { need('storage'); OC.ls.set(store(k), v); return true; },
      async toast(m) { U.toast(String(m).slice(0, 140)); return true; },
      async 'selection.render'(scale) { need('selection.read'); const els = OC.sel.els(); if (!els.length) return null; const c = OC.render.renderElements(els, { scale: Math.min(3, scale || 1) }); return c.toDataURL('image/png'); }
    };
    const need = p => { if (!perms.has(p)) throw new Error('Permission needed: ' + p); };
    async function insert(spec) {
      if (!UI.isCanvas()) throw new Error('Open a canvas design first'); if (spec.svg) { const els = await OC.uploads.importSVG(spec.svg, { name: spec.name || a.name }); return true; }
      if (spec.image) { const id = await OC.assets.addDataURL(spec.image, spec.name || 'Image'); await OC.ops.addImage('asset:' + id, spec.name || 'Image'); return true; }
      if (spec.text) { const e = D.make('text', { name: 'Text', runs: [{ t: String(spec.text) }], fs: spec.fs || 64, w: spec.w || 600, fills: [D.solid(spec.color || '#1c1c28')] }); e.h = OC.text.layout(e).h; OC.ops.add(e); return true; }
      if (spec.elements) { const els = U.clone(spec.elements).slice(0, 300); els.forEach(sanitize); OC.relabel(els); els.forEach(e => OC.ops.add(e, { noCommit: true })); OC.history.commit('App: ' + a.name); return true; }
      throw new Error('Nothing to insert');
    }
    const sanitize = e => { const allowed = D.make(['rect', 'ellipse', 'polygon', 'star', 'line', 'path', 'text', 'group', 'frame'].includes(e.type) ? e.type : 'rect'); Object.keys(e).forEach(k => { if (k === 'src' && typeof e[k] === 'string' && !e[k].startsWith('data:image/')) delete e[k]; if (k === 'link') delete e[k]; }); Object.assign(allowed, e); Object.assign(e, allowed); if (e.children) e.children.forEach(sanitize); };
    const onMsg = async ev => {
      if (ev.source !== frame.contentWindow) return; const m = ev.data; if (!m || m.oc !== 'rpc') return;
      try { const fn = api[m.method]; if (!fn) throw new Error('Unknown method'); const res = await fn(m.args); frame.contentWindow.postMessage({ oc: 'res', id: m.id, ok: true, res }, '*'); } catch (e) { frame.contentWindow.postMessage({ oc: 'res', id: m.id, ok: false, err: e.message }, '*'); }
    };
    addEventListener('message', onMsg); const sendSel = () => { if (!perms.has('selection.read')) return; try { frame.contentWindow.postMessage({ oc: 'event', name: 'selection', data: OC.sel.els().map(ser) }, '*'); } catch (e) { } };
    const off = OC.bus.on('selection', sendSel); frame.addEventListener('load', () => setTimeout(sendSel, 50));
    const obs = new MutationObserver(() => { if (!document.contains(frame)) { removeEventListener('message', onMsg); OC.bus.off && OC.bus.off('selection', sendSel); obs.disconnect(); } }); obs.observe(document.body, { childList: true, subtree: true });
  };

  /* ---------- publish ---------- */
  C.publishDialog = function () {
    let kind = 'template', name = S.project ? S.project.name : 'My template', desc = '', author = OC.ls.get('author', ''), cats = S.project && S.project.cat ? [S.project.cat] : ['social'], tags = '';
    const body = h('div'); const draw = () => {
      body.textContent = ''; body.append(h('p.muted', T('Share through GitHub. No server needed. You submit a small pull request to a registry and everyone using it sees your work.')),
        UI.seg([{ v: 'template', label: 'Template' }, { v: 'app', label: 'App' }], kind, v => { kind = v; draw(); }));
      if (kind === 'template') {
        const f = (l, v, set) => UI.field(l, h('input.input', { value: v, onkeydown: e => e.stopPropagation(), oninput: e => set(e.target.value) }));
        body.append(f('Name', name, v => { name = v; }), f('Your name', author, v => { author = v; OC.ls.set('author', v); }), f('Tags', tags, v => { tags = v; }), h('p.muted.small', T('Shares the current page. Photos you used are included.')),
          UI.btn('Download template files', async () => { const slug = (name || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); const file = await C.templateFile(name, cats); const thumb = OC.render.thumb(OC.page(), 480); const tb = await U.canvasBlob(thumb, 'image/webp', .8); const entry = { id: slug, name, author, cats, tags: tags.split(',').map(s => s.trim()).filter(Boolean), file: `templates/${slug}/template.json`, thumb: `templates/${slug}/thumb.webp`, license: 'CC-BY-4.0' }; const z = OC.exporter.zip([{ name: `templates/${slug}/template.json`, data: JSON.stringify(file) }, { name: `templates/${slug}/thumb.webp`, data: new Uint8Array(await tb.arrayBuffer()) }, { name: `templates/${slug}/registry-entry.json`, data: JSON.stringify(entry, null, 2) }]); U.download(z, slug + '-submission.zip'); }, { primary: true, icon: 'download', cls: 'full' }));
      } else body.append(h('p.small', T('Apps are a folder with a manifest and an index page. Read the app guide, then submit your folder the same way.')), UI.btn('Open the app guide', () => window.open('docs/APP_SDK.md', '_blank'), { icon: 'book-open', cls: 'full' }));
      body.append(h('h5', T('Then')), h('ol.steps', h('li', T('Fork the community repository on GitHub')), h('li', T('Unzip into the repository and add the entry to registry.json')), h('li', T('Open a pull request. Checks run on their own'))), UI.btn('Open the community repository', () => window.open('https://github.com/OpenCanvasApp/community', '_blank', 'noopener'), { icon: 'github', cls: 'full' }));
    }; draw();
    UI.modal({ title: 'Share with the community', width: 520, body, actions: [{ label: 'Close' }] });
  };
})();
