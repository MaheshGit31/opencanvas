/* Document operations used by menus, shortcuts and panels */
(function () {
  const U = OC.U, D = OC.doc, S = OC.S;
  const Ops = OC.ops = {};
  const commit = l => OC.history.commit(l);
  const selEls = () => OC.sel.els();
  const T = s => OC.t(s);

  Ops.cloneEls = els => els.map(e => { const c = U.clone(e); OC.relabel([c]); return c; });
  const ordered = els => els.slice().sort((a, b) => { const fa = D.find(a.id), fb = D.find(b.id); if (fa.list === fb.list) return fa.list.indexOf(a) - fb.list.indexOf(b); return 0; });
  Ops.ordered = ordered;
  const editable = els => els.filter(e => !D.isLocked(e.id));
  Ops.viewCenter = function () {
    const pg = OC.page(); if (pg.infinite) { const r = OC.editor.stageRect(); const w = OC.editor.screenToWorld(r.w / 2, r.h / 2); return { x: w.x - pg._x, y: w.y - pg._y }; }
    return { x: pg.w / 2, y: pg.h / 2 };
  };

  /* add element to current page, centered */
  Ops.add = function (el, o = {}) {
    const pg = o.page || OC.page(); const c = o.at || Ops.viewCenter();
    if (!pg.infinite) { const m = Math.min(pg.w, pg.h) * .9; if (el.w > m || el.h > m) { const k = m / Math.max(el.w, el.h); Ops.scaleEl(el, k, k, k); } }
    if (!o.keepPos) { el.x = c.x - el.w / 2; el.y = c.y - el.h / 2; }
    const f = o.parent || (S.enter && D.get(S.enter) && D.get(S.enter).children ? D.get(S.enter) : null);
    (f ? f.children : pg.elements).push(el); D.reindex(); if (f) D.fitGroup(f);
    if (o.select !== false) OC.sel.set([el.id]); commit(o.label || 'Add ' + el.name); return el;
  };
  Ops.addImage = async function (srcOrId, name, o = {}) {
    const src = srcOrId.startsWith('asset:') || /^(data|http|blob)/.test(srcOrId) ? srcOrId : 'asset:' + srcOrId;
    const img = await OC.assets.imgReady(src); if (!img) { U.toast('Image failed to load'); return null; }
    const nw = img.naturalWidth, nh = img.naturalHeight; const pg = o.page || OC.page();
    if (S.project.photo && !pg.elements.length && !pg.infinite && !o.noResize) { const k = Math.min(1, 2400 / Math.max(nw, nh)); pg.w = Math.round(nw * k); pg.h = Math.round(nh * k); S.project.size = { w: pg.w, h: pg.h }; D.layoutPages(); const e = D.make('image', { src, name: name || 'Photo', w: pg.w, h: pg.h, x: 0, y: 0 }); pg.elements.push(e); D.reindex(); OC.sel.set([e.id]); commit('Add photo'); OC.editor.fit(); return e; }
    const k = Math.min(1, Math.min(pg.w, pg.h) * .6 / Math.max(nw, nh)) || 1; const w = nw * k, h = nh * k;
    const e = D.make('image', { src, name: name || 'Image', w, h, ...(o.props || {}) }); return Ops.add(e, o);
  };
  Ops.addText = function (kind = 'body', text) {
    const sz = { heading: 96, sub: 56, body: 32 }[kind] || 32, fw = { heading: 700, sub: 600, body: 400 }[kind]; const b = S.project.brand.fonts;
    const e = D.make('text', { name: kind === 'heading' ? 'Heading' : kind === 'sub' ? 'Subheading' : 'Body text', fs: sz, fw, w: Math.max(240, sz * 7), ff: b[kind] || 'Inter', runs: [{ t: text || { heading: 'Add a heading', sub: 'Add a subheading', body: 'Add a little bit of body text' }[kind] }] });
    return Ops.add(e);
  };

  /* clipboard */
  Ops.copy = function () { const els = ordered(selEls()); if (!els.length) return; S.clipboard = { els: U.clone(els), page: OC.sel.page().id }; try { U.copyText('opencanvas:' + els.length + ' element' + (els.length > 1 ? 's' : '')); } catch (e) { } U.toast(els.length > 1 ? 'Copied ' + els.length : 'Copied', 1200); };
  Ops.cut = function () { Ops.copy(); Ops.del(); };
  Ops.paste = function () {
    if (!S.clipboard) return; const pg = OC.page(); const els = Ops.cloneEls(S.clipboard.els); const dup = pg.elements.some(e => els.some(c => Math.abs(c.x - e.x) < 1 && Math.abs(c.y - e.y) < 1));
    els.forEach(e => { if (dup || S.clipboard.page === pg.id) { e.x += 24; e.y += 24; } pg.elements.push(e); });
    if (pg.infinite) { const c = Ops.viewCenter(), b = D.boundsOf(els); els.forEach(e => { e.x += c.x - (b.x + b.w / 2); e.y += c.y - (b.y + b.h / 2); }); }
    D.reindex(); OC.sel.set(els.map(e => e.id)); commit('Paste');
  };
  Ops.duplicate = function () {
    const els = ordered(editable(selEls())); if (!els.length) return; const out = [];
    els.forEach(e => { const f = D.find(e.id); const c = Ops.cloneEls([e])[0]; c.x += 24; c.y += 24; f.list.splice(f.list.indexOf(e) + 1, 0, c); out.push(c.id); });
    D.reindex(); OC.sel.set(out); commit('Duplicate');
  };
  Ops.del = function () {
    const els = editable(selEls()); if (!els.length) return; els.forEach(e => { const f = D.find(e.id); if (f) f.list.splice(f.list.indexOf(e), 1); });
    S.project.comments = S.project.comments.filter(c => !els.some(e => e.id === c.elId));
    D.reindex(); OC.sel.clear(); commit('Delete');
  };

  /* grouping */
  function sameList(els) { const f = els.map(e => D.find(e.id)); return f.every(x => x.list === f[0].list); }
  Ops.group = function (type = 'group') {
    let els = ordered(editable(selEls())); if (els.length < (type === 'group' ? 2 : 1)) return; if (!sameList(els)) { U.toast('Select items in the same layer'); return; }
    const f = D.find(els[0].id), list = f.list; const idx = Math.max(...els.map(e => list.indexOf(e)));
    els.forEach(e => list.splice(list.indexOf(e), 1));
    const g = D.make(type, { x: 0, y: 0, w: 1, h: 1, children: els, name: type === 'frame' ? 'Frame' : 'Group' }); if (type === 'frame') { g.fills = []; g.stroke = null; }
    D.fitGroup(g); list.splice(Math.min(idx - els.length + 1, list.length), 0, g); D.reindex(); OC.sel.set([g.id]); commit(type === 'frame' ? 'Frame' : 'Group'); return g;
  };
  Ops.ungroup = function () {
    const gs = selEls().filter(e => e.children && !D.isLocked(e.id)); if (!gs.length) return; const out = [];
    gs.forEach(g => {
      const f = D.find(g.id), list = f.list, i = list.indexOf(g); const gx = g.x + g.w / 2, gy = g.y + g.h / 2;
      g.children.forEach(c => {
        let cx = c.x + c.w / 2 - g.w / 2, cy = c.y + c.h / 2 - g.h / 2; if (g.flipX) { cx = -cx; c.flipX = !c.flipX; c.rot = -(c.rot || 0); } if (g.flipY) { cy = -cy; c.flipY = !c.flipY; c.rot = -(c.rot || 0); }
        const p = U.rotPt(cx, cy, 0, 0, U.rad(g.rot || 0)); c.x = gx + p.x - c.w / 2; c.y = gy + p.y - c.h / 2; c.rot = ((c.rot || 0) + (g.rot || 0)); c.opacity *= g.opacity;
      });
      list.splice(i, 1, ...g.children); out.push(...g.children.map(c => c.id));
    });
    D.reindex(); OC.sel.set(out); commit('Ungroup');
  };
  Ops.releaseMask = function () { const g = OC.sel.one(); if (g && g.mask) { g.mask = false; commit('Release mask'); } };
  Ops.useAsMask = function () {
    const els = ordered(editable(selEls())); if (els.length < 2) { U.toast('Select a shape and what to mask'); return; }
    const g = Ops.group(); if (g) { g.mask = true; g.name = 'Mask group'; commit('Mask'); }
  };

  /* order */
  Ops.order = function (kind) {
    const els = ordered(editable(selEls())); if (!els.length) return;
    const byList = new Map(); els.forEach(e => { const f = D.find(e.id); if (!byList.has(f.list)) byList.set(f.list, []); byList.get(f.list).push(e); });
    byList.forEach((sel, list) => {
      if (kind === 'front') { sel.forEach(e => list.splice(list.indexOf(e), 1)); list.push(...sel); }
      else if (kind === 'back') { sel.forEach(e => list.splice(list.indexOf(e), 1)); list.unshift(...sel); }
      else if (kind === 'forward') { for (let i = sel.length - 1; i >= 0; i--) { const j = list.indexOf(sel[i]); if (j < list.length - 1 && !sel.includes(list[j + 1])) { list.splice(j, 1); list.splice(j + 1, 0, sel[i]); } } }
      else if (kind === 'backward') { sel.forEach(e => { const j = list.indexOf(e); if (j > 0 && !sel.includes(list[j - 1])) { list.splice(j, 1); list.splice(j - 1, 0, e); } }); }
    });
    D.reindex(); commit('Arrange');
  };

  /* align / distribute */
  function parentBox(e) { const f = D.find(e.id); return f.parentEl ? { x: 0, y: 0, w: f.parentEl.w, h: f.parentEl.h } : { x: 0, y: 0, w: f.page.w, h: f.page.h }; }
  Ops.align = function (kind, toPage) {
    const els = editable(selEls()); if (!els.length) return; const multi = els.length > 1 && !toPage;
    const sb = multi ? D.boundsOf(els) : null;
    els.forEach(e => {
      const b = D.boundsOf([e]); const ref = multi ? sb : parentBox(e); let dx = 0, dy = 0;
      if (kind === 'left') dx = ref.x - b.x; if (kind === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); if (kind === 'right') dx = ref.x + ref.w - (b.x + b.w);
      if (kind === 'top') dy = ref.y - b.y; if (kind === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); if (kind === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      e.x += dx; e.y += dy;
    });
    commit('Align');
  };
  Ops.distribute = function (axis) {
    const els = editable(selEls()); if (els.length < 3) return; const h = axis === 'h';
    const items = els.map(e => ({ e, b: D.boundsOf([e]) })).sort((a, b) => h ? a.b.x - b.b.x : a.b.y - b.b.y);
    const first = items[0].b, last = items[items.length - 1].b; const total = h ? last.x + last.w - first.x : last.y + last.h - first.y; const sizes = items.reduce((s, i) => s + (h ? i.b.w : i.b.h), 0);
    const gap = (total - sizes) / (items.length - 1); let pos = h ? first.x : first.y;
    items.forEach(i => { const cur = h ? i.b.x : i.b.y; const d = pos - cur; if (h) i.e.x += d; else i.e.y += d; pos += (h ? i.b.w : i.b.h) + gap; });
    commit('Distribute');
  };
  Ops.flip = function (axis) { editable(selEls()).forEach(e => { if (axis === 'h') e.flipX = !e.flipX; else e.flipY = !e.flipY; }); commit('Flip'); };
  Ops.rotate = function (deg) { editable(selEls()).forEach(e => { e.rot = ((e.rot || 0) + deg) % 360; }); commit('Rotate'); };
  Ops.nudge = function (dx, dy) { const els = editable(selEls()).filter(e => !e.lockPos); if (!els.length) return; els.forEach(e => OC.editor.setGeom(e, { x: e.x + dx, y: e.y + dy })); commit('Nudge'); };

  /* lock / visibility */
  Ops.lock = function (mode) {
    const els = selEls(); if (!els.length) return; const allLocked = els.every(e => mode === 'pos' ? e.lockPos : e.locked);
    els.forEach(e => { if (mode === 'pos') e.lockPos = !allLocked; else { e.locked = !allLocked; if (e.locked) { } } });
    if (mode !== 'pos' && !allLocked) OC.sel.clear(); commit(allLocked ? 'Unlock' : 'Lock'); OC.bus.emit('selection');
  };
  Ops.toggleVisible = function (el) { el.visible = !el.visible; commit(el.visible ? 'Show' : 'Hide'); };
  Ops.toggleTiming = function () { selEls().forEach(e => { e.timingHidden = !e.timingHidden; }); commit('Timing'); };

  /* style */
  const STYLE_KEYS = ['fills', 'stroke', 'shadows', 'opacity', 'blur', 'blend', 'radius', 'ff', 'fw', 'fs', 'fi', 'align', 'lh', 'ls', 'ws', 'tf', 'under', 'strike', 'bg', 'adj'];
  Ops.copyStyle = function () { const e = OC.sel.one(); if (!e) return; const st = {}; STYLE_KEYS.forEach(k => { if (e[k] !== undefined) st[k] = U.clone(e[k]); }); S.styleClip = st; U.toast('Style copied', 1200); };
  Ops.pasteStyle = function () {
    if (!S.styleClip) return; editable(selEls()).forEach(e => { STYLE_KEYS.forEach(k => { if (S.styleClip[k] !== undefined && (k in e || ['fills', 'stroke', 'shadows', 'opacity', 'blur', 'blend'].includes(k))) { if (e.type === 'image' && k === 'fills') return; e[k] = U.clone(S.styleClip[k]); } }); });
    commit('Paste style');
  };

  /* geometry transforms */
  Ops.scaleEl = function (e, sx, sy, s) {
    s = s == null ? Math.min(sx, sy) : s; e.x *= sx; e.y *= sy; e.w *= sx; e.h *= sy;
    if (e.type === 'text') { e.fs = U.round(e.fs * s, 2); (e.runs || []).forEach(r => { if (r.sz) r.sz = U.round(r.sz * s, 2); }); }
    if (e.stroke) e.stroke.width = U.round(e.stroke.width * s, 2); (e.shadows || []).forEach(sh => { sh.x *= s; sh.y *= s; sh.blur *= s; });
    if (e.children) e.children.forEach(c => Ops.scaleEl(c, sx, sy, s));
    if (e.crop) { e.crop.x *= sx; e.crop.y *= sy; }
  };
  Ops.resizePage = function (pg, w, h, mode = 'smart') {
    const ow = pg.w, oh = pg.h, sx = w / ow, sy = h / oh, s = Math.min(sx, sy);
    pg.elements.forEach(e => {
      if (mode === 'keep') { return; }
      const full = e.w >= ow * .95 && e.h >= oh * .95 && (e.type === 'image' || e.type === 'rect' || e.type === 'video');
      if (full) { e.x = 0; e.y = 0; e.w = w; e.h = h; return; }
      if (mode === 'stretch') { Ops.scaleEl(e, sx, sy, s); return; }
      const cx = (e.x + e.w / 2) * sx, cy = (e.y + e.h / 2) * sy; Ops.scaleEl(e, s, s, s); e.x = cx - e.w / 2; e.y = cy - e.h / 2;
    });
    pg.w = w; pg.h = h;
  };
  Ops.resizeAll = function (w, h, mode) { S.project.pages.forEach(pg => { if (!pg.infinite) Ops.resizePage(pg, w, h, mode); }); S.project.size = { w, h }; D.layoutPages(); commit('Resize design'); OC.editor && OC.editor.fit(); };

  /* vector */
  Ops.boolean = function (op) {
    const els = ordered(editable(selEls())); if (els.length < 2) { U.toast('Select two or more shapes'); return; }
    OC.vec.init(); const r = OC.vec.boolean(els, op); if (!r) { U.toast('Nothing to combine'); return; }
    const f = D.find(els[els.length - 1].id); const list = f.page.elements; const idx = list.indexOf(f.parentEl || els[els.length - 1]);
    els.forEach(e => { const ff = D.find(e.id); ff.list.splice(ff.list.indexOf(e), 1); }); list.splice(Math.min(Math.max(idx, 0), list.length), 0, r); D.reindex(); OC.sel.set([r.id]); commit(r.name);
  };
  Ops.flatten = function () {
    const els = ordered(editable(selEls())); if (!els.length) return; OC.vec.init(); const r = OC.vec.flatten(els); if (!r) { U.toast('Nothing to flatten'); return; }
    const f = D.find(els[els.length - 1].id); const list = f.page.elements; const idx = list.indexOf(f.parentEl || els[els.length - 1]);
    els.forEach(e => { const ff = D.find(e.id); ff.list.splice(ff.list.indexOf(e), 1); }); list.splice(Math.min(Math.max(idx, 0), list.length), 0, r); D.reindex(); OC.sel.set([r.id]); commit('Flatten');
  };
  Ops.outline = function () {
    const e = OC.sel.one(); if (!e || e.type === 'path') return; OC.vec.init(); const p = OC.vec.toPathEl(e); if (!p) { U.toast('Cannot convert this layer'); return; }
    const f = D.find(e.id); f.list[f.list.indexOf(e)] = p; D.reindex(); OC.sel.set([p.id]); commit('Convert to path');
  };

  /* components */
  Ops.createComponent = function () {
    let els = editable(selEls()); if (!els.length) return; let g = els.length === 1 && els[0].type === 'group' ? els[0] : Ops.group(); if (!g) return;
    const id = U.uid('c'); g.compRef = id; g.compMaster = true; g.name = g.name === 'Group' ? 'Component' : g.name; S.project.components[id] = { id, name: g.name, el: U.clone({ ...g, compMaster: false }) };
    commit('Create component'); U.toast('Component created'); OC.bus.emit('components');
  };
  Ops.insertComponent = function (id) {
    const c = S.project.components[id]; if (!c) return; const e = U.clone(c.el); OC.relabel([e]); e.compRef = id; e.compMaster = false; e.compSig = JSON.stringify(c.el.children); return Ops.add(e);
  };
  Ops.detach = function () { selEls().forEach(e => { delete e.compRef; delete e.compMaster; delete e.compSig; }); commit('Detach'); };

  /* props */
  Ops.setLink = async function () { const e = OC.sel.one(); if (!e) return; const v = await OC.ui.prompt(T('Link'), e.link || '', 'https://'); if (v == null) return; e.link = v.trim(); commit('Link'); };
  Ops.setAlt = async function () { const e = OC.sel.one(); if (!e) return; const v = await OC.ui.prompt(T('Alternative text'), e.alt || '', T('Describe this for screen readers')); if (v == null) return; e.alt = v; commit('Alt text'); };
  Ops.rename = async function (e) { e = e || OC.sel.one(); if (!e) return; const v = await OC.ui.prompt(T('Rename'), e.name); if (v == null) return; e.name = v || e.name; commit('Rename'); };
  Ops.addComment = async function (elId, pos) {
    const e = elId ? D.get(elId) : OC.sel.one(); const pg = e ? D.find(e.id).page : OC.page(); const v = await OC.ui.prompt(T('Comment'), '', T('Write a comment')); if (!v) return;
    S.project.comments.push({ id: U.uid('c'), elId: e ? e.id : null, pageId: pg.id, x: pos ? pos.x : 0, y: pos ? pos.y : 0, text: v, author: OC.settings.name || 'You', time: Date.now(), resolved: false, replies: [] });
    commit('Comment'); OC.bus.emit('comments');
  };
  Ops.translateText = async function () {
    const els = []; const walk = e => { if (e.type === 'text') els.push(e); (e.children || []).forEach(walk); }; selEls().forEach(walk); if (!els.length) { U.toast('Select some text'); return; }
    const lang = await OC.ui.pickLanguage(); if (!lang) return; U.toast('Translating'); const out = await OC.i18n.translateMany(els.map(e => OC.text.plain(e)), lang);
    els.forEach((e, i) => { if (out[i] != null) { const r0 = e.runs[0] || {}; e.runs = [{ ...r0, t: out[i] }]; } }); commit('Translate'); OC.text.clear();
  };
  Ops.seeMore = function () { const e = OC.sel.one(); if (!e) return; const q = (e.tags && e.tags[0]) || e.name; OC.ui.openPanel('elements', { query: q }); };
  Ops.downloadSelection = function () { OC.exporter.dialog({ selection: true }); };

  /* palettes */
  Ops.palette = async function (els, n = 6) {
    const cols = [];
    const addC = c => { if (c && !cols.includes(U.hex(c))) cols.push(U.hex(c)); };
    for (const e of els) {
      if (e.type === 'image' || (e.type === 'video')) { const img = OC.assets.img(e.src); if (img) (await Ops.imagePalette(img, n)).forEach(addC); }
      else { const walk = x => { (x.fills || []).forEach(f => { if (f.type === 'solid') addC(f.color); else if (f.stops) f.stops.forEach(s => addC(s.c)); }); if (x.stroke) addC(x.stroke.color); (x.children || []).forEach(walk); }; walk(e); }
    }
    return cols.slice(0, n);
  };
  Ops.imagePalette = async function (img, n = 6) {
    const c = U.newCanvas(64, 64), g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; const px = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
    if (!px.length) return []; let cent = []; for (let i = 0; i < n; i++) cent.push(px[Math.floor(i * px.length / n)].slice());
    for (let it = 0; it < 8; it++) { const sum = cent.map(() => [0, 0, 0, 0]); px.forEach(p => { let bi = 0, bd = 1e9; cent.forEach((c2, i) => { const dd = (p[0] - c2[0]) ** 2 + (p[1] - c2[1]) ** 2 + (p[2] - c2[2]) ** 2; if (dd < bd) { bd = dd; bi = i; } }); const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; }); cent = cent.map((c2, i) => sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3], sum[i][3]] : c2); }
    return cent.sort((a, b) => (b[3] || 0) - (a[3] || 0)).map(c2 => U.toHex(c2[0], c2[1], c2[2]));
  };
  Ops.applyColorsToPage = async function () {
    const els = selEls(); if (!els.length) return; const pal = await Ops.palette(els, 5); if (!pal.length) { U.toast('No colors found'); return; }
    Ops.recolorPage(pal, els);
  };
  Ops.recolorPage = function (pal, skip) {
    skip = skip || []; const pg = OC.sel.page(); const targets = []; const walk = list => list.forEach(e => { if (!skip.includes(e)) { (e.fills || []).forEach(f => { if (f.type === 'solid') targets.push(f); }); if (e.stroke) targets.push(e.stroke); } if (e.children) walk(e.children); }); walk(pg.elements);
    const uniq = [...new Set(targets.map(t => U.hex(t.color)))].sort((a, b) => U.lum(a) - U.lum(b)); const sorted = pal.slice().sort((a, b) => U.lum(a) - U.lum(b));
    const map = {}; uniq.forEach((c, i) => { map[c] = sorted[Math.round(uniq.length > 1 ? i / (uniq.length - 1) * (sorted.length - 1) : sorted.length - 1)]; });
    targets.forEach(t => { t.color = map[U.hex(t.color)] || t.color; }); if (pg.bg.type === 'solid') pg.bg.color = U.lum(pg.bg.color) > .5 ? sorted[sorted.length - 1] : sorted[0];
    commit('Apply colors to page');
  };

  /* pages */
  Ops.addPage = function (after) {
    const pg = OC.page(); const np = D.newPage(pg.w, pg.h, { bg: U.clone(pg.bg), duration: pg.duration, infinite: pg.infinite }); const i = after == null ? S.pageIdx + 1 : after + 1;
    S.project.pages.splice(i, 0, np); S.pageIdx = i; D.reindex(); D.layoutPages(); OC.sel.clear(); commit('Add page'); OC.editor.focusPage(i); return np;
  };
  Ops.duplicatePage = function (i) {
    i = i == null ? S.pageIdx : i; const pg = S.project.pages[i]; const c = U.clone(pg); c.id = U.uid('p'); OC.relabel(c.elements); c.title = pg.title ? pg.title + ' copy' : '';
    S.project.pages.splice(i + 1, 0, c); S.pageIdx = i + 1; D.reindex(); D.layoutPages(); commit('Duplicate page'); OC.editor.focusPage(i + 1);
  };
  Ops.deletePage = function (i) {
    i = i == null ? S.pageIdx : i; if (S.project.pages.length < 2) { U.toast('A design needs at least one page'); return; } S.project.pages.splice(i, 1); S.pageIdx = Math.min(S.pageIdx, S.project.pages.length - 1);
    D.reindex(); D.layoutPages(); OC.sel.clear(); commit('Delete page');
  };
  Ops.movePage = function (from, to) { const ps = S.project.pages; if (to < 0 || to >= ps.length) return; const [p] = ps.splice(from, 1); ps.splice(to, 0, p); S.pageIdx = to; D.layoutPages(); commit('Move page'); };
  Ops.lockPage = function (i) { const pg = S.project.pages[i]; pg.locked = !pg.locked; if (pg.locked) OC.sel.clear(); commit(pg.locked ? 'Lock page' : 'Unlock page'); };

  /* reparent while preserving the world transform */
  Ops.reparent = function (el, newParent, pg) {
    const f = D.find(el.id); const cx = el.x + el.w / 2, cy = el.y + el.h / 2; const wc = D.toPage(el.id, el.w / 2, el.h / 2);
    let wrot = (el.rot || 0); D.ancestors(el.id).forEach(a => { wrot += a.rot || 0; });
    f.list.splice(f.list.indexOf(el), 1);
    let nx, ny, nrot = wrot;
    if (newParent) { const lp = D.toLocal(newParent.id, wc.x, wc.y); nx = lp.x; ny = lp.y; let pr = newParent.rot || 0; D.ancestors(newParent.id).forEach(a => { pr += a.rot || 0; }); nrot = wrot - pr; newParent.children.push(el); }
    else { nx = wc.x; ny = wc.y; pg.elements.push(el); }
    el.x = nx - el.w / 2; el.y = ny - el.h / 2; el.rot = nrot; D.reindex();
  };
})();
