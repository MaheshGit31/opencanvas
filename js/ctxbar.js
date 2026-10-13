/* Contextual toolbar and shared property editors */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui, E = OC.editor, O = OC.ops, R = OC.render;
  const T = s => OC.t(s); const adv = () => OC.settings.mode === 'advanced';
  const CB = OC.ctxbar = {};

  CB.apply = function (fn, label, live) {
    const els = OC.sel.els().filter(e => !D.isLocked(e.id)); if (!els.length) return; els.forEach(fn);
    if (live) { R.invalidate(); OC.bus.emit('geom'); } else OC.history.commit(label || 'Edit');
  };
  const apply = CB.apply;
  const firstFill = e => (e.fills || []).find(f => f.visible !== false);
  const ico = (n, s) => h('span', { html: OC.icon(n, s || 16) });
  const sep = () => h('span.cb-sep');

  /* ---------- shared editors ---------- */
  UI.fillEditor = function (els, o = {}) {
    const wrap = h('div.fill-editor'); const e0 = els[0]; let f = (e0.fills || [])[o.index || 0];
    const setFill = (nf, live) => { apply(e => { if (!e.fills) e.fills = []; e.fills[o.index || 0] = U.clone(nf); }, 'Fill', live); f = nf; };
    const draw = () => {
      wrap.textContent = ''; const type = f ? f.type : 'none';
      wrap.append(UI.seg([{ v: 'solid', label: 'Solid' }, { v: 'linear', label: 'Gradient' }, { v: 'image', label: 'Image' }, { v: 'none', label: 'None' }], type === 'radial' || type === 'conic' ? 'linear' : type, v => {
        if (v === 'none') { apply(e => { e.fills = []; }, 'Fill'); f = null; }
        else if (v === 'solid') { const c = f && f.type === 'solid' ? f.color : (f && f.stops ? f.stops[0].c : '#2563eb'); f = { type: 'solid', color: c, opacity: f ? f.opacity : 1, visible: true }; setFill(f); }
        else if (v === 'linear') { const c = f && f.type === 'solid' ? f.color : '#2563eb'; f = { type: 'linear', angle: 90, opacity: 1, visible: true, stops: [{ o: 0, c }, { o: 1, c: U.mix(c, '#ff5d8f', .8) }] }; setFill(f); }
        else if (v === 'image') { f = { type: 'image', src: '', fit: 'cover', opacity: 1, visible: true }; setFill(f); pickImg(); }
        draw();
      }));
      if (!f) return;
      if (f.type === 'solid') wrap.append(UI.colorPanel(f.color, (c, live) => { f.color = c; setFill(f, live); }, c => { f.color = c; setFill(f); }), h('div.row', h('span.lbl', T('Opacity')), UI.slider((f.opacity == null ? 1 : f.opacity) * 100, 0, 100, 1, v => { f.opacity = v / 100; setFill(f, true); }, v => { f.opacity = v / 100; setFill(f); })));
      else if (f.type === 'image') wrap.append(UI.btn('Choose image', pickImg, { icon: 'image' }), UI.seg([{ v: 'cover', label: 'Fill' }, { v: 'contain', label: 'Fit' }, { v: 'fill', label: 'Stretch' }], f.fit || 'cover', v => { f.fit = v; setFill(f); }));
      else wrap.append(UI.gradientPanel(f, (g, fin) => setFill(g, !fin)));
    };
    const pickImg = async () => { const fs = await U.pickFile('image/*'); if (!fs[0]) return; const id = await OC.assets.add(fs[0], fs[0].name); f.src = 'asset:' + id; setFill(f); draw(); };
    draw(); return wrap;
  };
  UI.strokeEditor = function (els) {
    const e0 = els[0]; const get = () => e0.stroke || { color: '#1c1c28', width: 0, align: 'center', cap: 'butt', join: 'miter', dash: [], profile: 'uniform', opacity: 1 };
    const set = (k, v, live) => apply(e => { if (!e.stroke) e.stroke = { color: '#1c1c28', width: 4, align: 'center', cap: 'butt', join: 'miter', dash: [], profile: 'uniform', opacity: 1 }; e.stroke[k] = v; }, 'Stroke', live);
    const s = get(); const dashes = [['', 'Solid'], ['12,8', 'Dashed'], ['2,8', 'Dotted'], ['20,6,4,6', 'Dash dot']];
    return h('div.stroke-editor', h('div.row', UI.colorBtn(s.color, (c, l) => set('color', c, l), c => set('color', c)), UI.num(s.width, (v, l) => set('width', v, l), { label: 'W', min: 0, max: 400, step: .5, w: 90 })),
      UI.field('Style', UI.select(dashes.map(d => [d[0], d[1]]), (s.dash || []).join(','), v => set('dash', v ? v.split(',').map(Number) : []))), UI.field('Position', UI.seg([{ v: 'inside', label: 'Inside' }, { v: 'center', label: 'Center' }, { v: 'outside', label: 'Outside' }], s.align || 'center', v => set('align', v))),
      UI.field('Cap', UI.seg([{ v: 'butt', label: 'Flat' }, { v: 'round', label: 'Round' }, { v: 'square', label: 'Square' }], s.cap || 'butt', v => set('cap', v))), UI.field('Join', UI.seg([{ v: 'miter', label: 'Miter' }, { v: 'round', label: 'Round' }, { v: 'bevel', label: 'Bevel' }], s.join || 'miter', v => set('join', v))),
      UI.field('Width profile', UI.select(Object.keys(OC.vec.PROFILES).map(k => [k, k[0].toUpperCase() + k.slice(1)]), s.profile || 'uniform', v => set('profile', v))), UI.btn('Remove stroke', () => apply(e => { e.stroke = null; }, 'Stroke')));
  };
  const SHADOWS = { none: [], soft: [{ x: 0, y: 8, blur: 24, color: '#000000', opacity: .3 }], hard: [{ x: 8, y: 8, blur: 0, color: '#000000', opacity: .9 }], lifted: [{ x: 0, y: 18, blur: 28, color: '#000000', opacity: .35 }, { x: 0, y: 4, blur: 6, color: '#000000', opacity: .2 }], glow: [{ x: 0, y: 0, blur: 24, color: '#2563eb', opacity: .9 }], neon: [{ x: 0, y: 0, blur: 6, color: '#ff5dd8', opacity: 1 }, { x: 0, y: 0, blur: 24, color: '#ff5dd8', opacity: .9 }, { x: 0, y: 0, blur: 48, color: '#ff5dd8', opacity: .6 }], echo: [{ x: 10, y: 10, blur: 0, color: '#2563eb', opacity: .6 }, { x: 20, y: 20, blur: 0, color: '#2563eb', opacity: .3 }], glitch: [{ x: -4, y: 0, blur: 0, color: '#00ffff', opacity: .8 }, { x: 4, y: 0, blur: 0, color: '#ff0055', opacity: .8 }] };
  UI.effectsEditor = function (els) {
    const e0 = els[0]; const wrap = h('div.fx-editor');
    const draw = () => {
      wrap.textContent = ''; wrap.append(h('div.cp-t', T('Shadow and glow')), h('div.fx-grid', Object.keys(SHADOWS).map(k => h('button.fx' + (JSON.stringify(SHADOWS[k].map(s => [s.x, s.y, s.blur])) === JSON.stringify((e0.shadows || []).map(s => [s.x, s.y, s.blur])) ? '.on' : ''), { onclick: () => { apply(e => { e.shadows = U.clone(SHADOWS[k]).map(s => ({ ...s, visible: true })); }, 'Effect'); draw(); } }, h('span.fx-prev' + '.' + k, 'Ag'), h('small', T(k[0].toUpperCase() + k.slice(1)))))));
      (e0.shadows || []).forEach((s, i) => wrap.append(h('div.row.shadow-row', UI.colorBtn(s.color, (c, l) => { apply(e => { if (e.shadows[i]) e.shadows[i].color = c; }, 'Shadow', l); }, c => apply(e => { if (e.shadows[i]) e.shadows[i].color = c; }, 'Shadow')), UI.num(s.x, (v, l) => apply(e => { if (e.shadows[i]) e.shadows[i].x = v; }, 'Shadow', l), { label: 'X', w: 64, dec: 0 }), UI.num(s.y, (v, l) => apply(e => { if (e.shadows[i]) e.shadows[i].y = v; }, 'Shadow', l), { label: 'Y', w: 64, dec: 0 }), UI.num(s.blur, (v, l) => apply(e => { if (e.shadows[i]) e.shadows[i].blur = v; }, 'Shadow', l), { label: 'B', w: 64, min: 0, dec: 0 }))));
      wrap.append(h('div.row', h('span.lbl', T('Blur')), UI.slider(e0.blur || 0, 0, 80, 1, v => apply(e => { e.blur = v; }, 'Blur', true), v => apply(e => { e.blur = v; }, 'Blur'))), h('div.row', h('span.lbl', T('Opacity')), UI.slider(e0.opacity * 100, 0, 100, 1, v => apply(e => { e.opacity = v / 100; }, 'Opacity', true), v => apply(e => { e.opacity = v / 100; }, 'Opacity'))));
      if (adv()) wrap.append(UI.field('Blend', UI.select(['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].map(b => [b, b === 'source-over' ? 'Normal' : b.replace('-', ' ')]), e0.blend || 'source-over', v => apply(e => { e.blend = v; }, 'Blend'))));
      if (e0.type === 'text') {
        wrap.append(h('div.cp-t', T('Text effects')), h('div.fx-grid', [['Outline', e => { e.stroke = { color: '#1c1c28', width: 3, align: 'center', cap: 'round', join: 'round', dash: [], profile: 'uniform', opacity: 1 }; }], ['Hollow', e => { e.stroke = { color: e.fills[0] ? e.fills[0].color : '#000', width: 2.5, align: 'center', cap: 'round', join: 'round', dash: [], profile: 'uniform', opacity: 1 }; e.fills = [{ type: 'solid', color: '#ffffff', opacity: 0, visible: true }]; }], ['Highlight', e => { e.bg = { color: '#ffe14d', pad: 6, radius: 4, mode: 'line' }; e.fills = [D.solid('#1c1c28')]; }], ['Gradient', e => { e.fills = [{ type: 'linear', angle: 90, stops: [{ o: 0, c: '#2563eb' }, { o: 1, c: '#06b6d4' }], opacity: 1, visible: true }]; }], ['Clear', e => { e.stroke = null; e.bg = null; e.shadows = []; }]].map(([l, fn]) => h('button.fx', { onclick: () => { apply(fn, 'Text effect'); draw(); } }, h('span.fx-prev', 'Ag'), h('small', T(l))))), h('div.row', h('span.lbl', T('Curve')), UI.slider(e0.curve || 0, -100, 100, 1, v => apply(e => { e.curve = v; }, 'Curve', true), v => apply(e => { e.curve = v; }, 'Curve'))));
      }
    };
    draw(); return wrap;
  };
  UI.positionEditor = function (els) {
    const e0 = els[0]; const g = E.geo(e0); const wrap = h('div.pos-editor'); const lockRatio = { v: true };
    const kf = (prop, ctrl) => ctrl;
    const setG = (props, live) => { els.filter(e => !D.isLocked(e.id)).forEach(e => E.setGeom(e, typeof props === 'function' ? props(e) : props)); if (live) { R.invalidate(); OC.bus.emit('geom'); } else OC.history.commit('Position'); };
    wrap.append(h('div.cp-t', T('Arrange')), h('div.row.wrap', [['Forward', 'forward', 'arrow-up'], ['Backward', 'backward', 'arrow-down'], ['To front', 'front', 'bring-to-front'], ['To back', 'back', 'send-to-back']].map(([l, k, ic]) => UI.btn(l, () => O.order(k), { icon: ic, cls: 'sm' }))),
      h('div.cp-t', T('Align to page')), h('div.row.wrap', [['left', 'align-start-vertical'], ['center', 'align-center-vertical'], ['right', 'align-end-vertical'], ['top', 'align-start-horizontal'], ['middle', 'align-center-horizontal'], ['bottom', 'align-end-horizontal']].map(([a, i]) => UI.iconBtn(i, 'Align ' + a, () => O.align(a, true)))),
      h('div.cp-t', T('Advanced')), h('div.grid2', UI.num(g.w, (v, l) => { const k = v / (g.w || 1); setG(e => lockRatio.v && els.length === 1 ? { w: v, h: e.h * (v / (E.geo(e).w || 1)) } : { w: v }, l); }, { label: 'W', min: 1, dec: 1 }), UI.num(g.h, (v, l) => setG(e => lockRatio.v && els.length === 1 ? { h: v, w: e.w * (v / (E.geo(e).h || 1)) } : { h: v }, l), { label: 'H', min: 1, dec: 1 }), UI.num(g.x, (v, l) => setG({ x: v }, l), { label: 'X', dec: 1 }), UI.num(g.y, (v, l) => setG({ y: v }, l), { label: 'Y', dec: 1 }), UI.num(g.rot || 0, (v, l) => setG({ rot: v }, l), { label: '°', dec: 1, title: T('Rotation') }),
        e0.radius !== undefined ? UI.num(Array.isArray(e0.radius) ? e0.radius[0] : e0.radius, (v, l) => apply(e => { if (e.radius !== undefined) e.radius = v; }, 'Radius', l), { label: 'R', min: 0, dec: 0, title: T('Corner radius') }) : ''),
      h('label.chk', h('input', { type: 'checkbox', checked: true, onchange: ev => { lockRatio.v = ev.target.checked; } }), T('Keep proportions')));
    return wrap;
  };
  UI.fontPicker = function (current, onPick) {
    const q = h('input.input', { placeholder: T('Search fonts'), onkeydown: e => e.stopPropagation(), oninput: () => draw() }); let cat = 'All'; const list = h('div.font-list'); const cats = ['All', 'Custom', 'Sans', 'Serif', 'Display', 'Handwriting', 'Mono', 'Indic and global', 'System'];
    const chips = h('div.chips'); const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { OC.fonts.ensure(en.target.dataset.f); io.unobserve(en.target); } }), { root: list });
    const draw = () => {
      chips.textContent = ''; cats.forEach(c => chips.append(h('button.chip' + (c === cat ? '.on' : ''), { onclick: () => { cat = c; draw(); } }, T(c)))); list.textContent = '';
      const f = q.value.toLowerCase(); const brand = S.project ? Object.values(S.project.brand.fonts) : [];
      if (!f && cat === 'All') { list.append(h('div.cp-t', T('Brand fonts'))); [...new Set(brand)].forEach(n => list.append(item(n, 'Brand'))); list.append(h('div.cp-t', T('All fonts'))); }
      OC.fonts.all().filter(([n, c]) => (cat === 'All' || c === cat) && (!f || n.toLowerCase().includes(f))).slice(0, 140).forEach(([n]) => list.append(item(n)));
      list.append(h('button.btn.full', { onclick: async () => { const fs = await U.pickFile('.ttf,.otf,.woff,.woff2', true); for (const x of fs) { const n = await OC.fonts.addCustom(x); onPick(n); } draw(); } }, T('Upload a font')));
    };
    const item = n => { const b = h('button.font-item' + (n === current ? '.on' : ''), { 'data-f': n, style: 'font-family:' + OC.fonts.stack(n), onclick: () => { current = n; onPick(n); } }, n); OC.fonts.ensure(n); io.observe(b); return b; };
    draw(); return h('div.font-picker', q, chips, list);
  };

  /* ---------- toolbar ---------- */
  const btn = (icon, title, fn, active, o) => UI.iconBtn(icon, title, fn, active, o);
  const popBtn = (content, label, build, o = {}) => { const b = h('button.cb-btn' + (o.cls ? '.' + o.cls : ''), { title: o.title ? T(o.title) : '', onpointerdown: e => e.preventDefault(), onclick: () => UI.toggleSticky(b, () => build(), { cls: 'pop-pad ' + (o.pcls || '') }) }, content, label ? h('span', T(label)) : ''); return b; };
  CB.render = U.debounce(function () { CB.renderNow(); }, 16);
  CB.renderNow = function () {
    const bar = UI.refs && UI.refs.ctx; if (!bar) return; if (!UI.isCanvas || !UI.isCanvas()) { bar.textContent = ''; bar.hidden = true; return; } bar.hidden = false; bar.textContent = '';
    const left = h('div.cb-left'), right = h('div.cb-right'); bar.append(left, right);
    const els = OC.sel.els(); const one = els.length === 1 ? els[0] : null;
    if (S.cropEl) { left.append(h('span.cb-title', T('Crop')), btn('zoom-out', 'Zoom out', () => E.cropScale(1 / 1.15)), btn('zoom-in', 'Zoom in', () => E.cropScale(1.15)), UI.btn('Reset crop', () => { const e = D.get(S.cropEl); e.crop = { x: 0, y: 0, s: 1 }; R.invalidate(); }), UI.btn('Done', () => E.exitCrop(), { primary: true })); return; }
    if (S.nodeEdit) { left.append(h('span.cb-title', T('Edit path')), h('small.muted', T('Drag points. Double click a point to smooth it. Click a line to add a point. Delete removes.')), UI.btn('Done', () => { S.nodeEdit = null; OC.history.commit('Edit path'); R.invalidate(); CB.render(); }, { primary: true })); return; }
    if (!els.length) { pageBar(left, right); return; }
    const types = new Set(els.map(e => e.type)); const allText = els.every(e => e.type === 'text');
    if (one && one.type === 'text') textBar(left, one);
    else if (allText) textBar(left, els[0]);
    else if (one && (one.type === 'image' || one.type === 'video')) imageBar(left, one);
    else if (one && one.type === 'scene3d') left.append(UI.btn('Edit 3D', () => OC.threed.edit(one), { icon: 'cuboid', primary: true }), btn('panel-left', '3D panel', () => UI.openPanel('three')));
    else if (one && one.children) groupBar(left, one);
    else if (els.length > 1) multiBar(left, els);
    else shapeBar(left, els);
    if (adv() && one && one.type === 'path') left.append(sep(), UI.btn('Edit points', () => { S.nodeEdit = one.id; E.nodeSel = new Set(); R.invalidate(); CB.render(); }, { icon: 'spline' }));
    /* right side */
    right.append(popBtn(h('span', { html: OC.icon('move', 16) }), 'Position', () => UI.positionEditor(els), { cls: 'txt' }), popBtn(h('span', { html: OC.icon('sparkles', 16) }), 'Effects', () => UI.effectsEditor(els), { cls: 'txt', pcls: 'wide' }), popBtn(h('span', { html: OC.icon('play', 16) }), 'Animate', () => animatePanel(els), { cls: 'txt', pcls: 'wide' }), sep(),
      btn(els.every(e => e.locked) ? 'lock' : 'unlock', 'Lock', () => O.lock(), els.every(e => e.locked)), btn('copy-plus', 'Duplicate', () => O.duplicate()), btn('trash-2', 'Delete', () => O.del()), btn('more-horizontal', 'More', ev => { const r = ev.currentTarget.getBoundingClientRect(); UI.contextMenu(r.left - 200, r.bottom + 4, 'element', {}); }));
  };
  function pageBar(left, right) {
    const pg = OC.page(); if (!pg) return; const bg = pg.bg || { type: 'solid', color: '#ffffff' };
    left.append(h('span.cb-title', T('Page')), popBtn(h('span.sw-pill', { style: 'background:' + (bg.type === 'solid' ? bg.color : bg.type === 'image' ? '#888' : `linear-gradient(135deg,${(bg.stops || [{ c: '#000' }, { c: '#fff' }])[0].c},${(bg.stops || [{ c: '#000' }, { c: '#fff' }]).slice(-1)[0].c})`) }), 'Background', () => bgPanel(pg), { cls: 'txt' }));
    if (!pg.infinite) left.append(h('span.muted.small', `${pg.w} × ${pg.h}`), UI.btn('Resize', () => UI.resizeDialog(), { icon: 'scaling' }));
    left.append(h('label.numf.dur', h('span.num-l', T('Duration')), UI.num(pg.duration, v => { pg.duration = v; OC.history.commit('Duration'); }, { min: .5, max: 600, step: .5, unit: 's', w: 78, dec: 1, scrub: false })));
    right.append(popBtn(ico('grid-3x3'), 'Grid', () => gridPanel(), { cls: 'txt' }), btn('trash-2', 'Delete page', () => O.deletePage()), btn('copy-plus', 'Duplicate page', () => O.duplicatePage()));
  }
  function bgPanel(pg) { return pageFillEditor(pg); }
  function pageFillEditor(pg) {
    const wrap = h('div.fill-editor'); const bg = () => pg.bg; const type = () => bg().type;
    const commitBg = (fin) => { R.invalidate(); if (fin) OC.history.commit('Background'); };
    const draw = () => {
      wrap.textContent = ''; const t = type();
      wrap.append(UI.seg([{ v: 'solid', label: 'Solid' }, { v: 'linear', label: 'Gradient' }, { v: 'image', label: 'Image' }, { v: 'transparent', label: 'None' }], t === 'radial' || t === 'conic' ? 'linear' : t, v => {
        if (v === 'solid') pg.bg = { type: 'solid', color: bg().color || (bg().stops ? bg().stops[0].c : '#ffffff') }; else if (v === 'linear') pg.bg = { type: 'linear', angle: 135, stops: [{ o: 0, c: '#2563eb' }, { o: 1, c: '#06b6d4' }] }; else if (v === 'image') { pg.bg = { type: 'image', src: '', fit: 'cover', color: '#ffffff' }; pick(); } else pg.bg = { type: 'transparent' }; commitBg(true); draw();
      }));
      if (t === 'solid') wrap.append(UI.colorPanel(bg().color, (c, l) => { bg().color = c; commitBg(false); }, c => { bg().color = c; commitBg(true); }));
      else if (t === 'image') wrap.append(UI.btn('Choose image', pick, { icon: 'image' }), UI.seg([{ v: 'cover', label: 'Fill' }, { v: 'contain', label: 'Fit' }, { v: 'fill', label: 'Stretch' }], bg().fit || 'cover', v => { bg().fit = v; commitBg(true); }));
      else if (t !== 'transparent') wrap.append(UI.gradientPanel(bg(), (g, fin) => commitBg(fin)));
    };
    const pick = async () => { const fs = await U.pickFile('image/*'); if (!fs[0]) return; const id = await OC.assets.add(fs[0], fs[0].name); pg.bg.src = 'asset:' + id; commitBg(true); draw(); };
    draw(); return wrap;
  }
  CB.pageFill = pg => pageFillEditor(pg);
  function gridPanel() { const g = S.project.grid; return h('div', UI.field('Show grid', UI.toggle(g.show, v => { g.show = v; R.invalidate(); })), UI.field('Snap to grid', UI.toggle(OC.settings.snapGrid, v => OC.settings.set('snapGrid', v))), UI.field('Grid size', UI.num(g.size, v => { g.size = v; R.invalidate(); }, { min: 2, max: 400, dec: 0, w: 80 }))); }

  function textBar(left, el) {
    const sel = OC.sel.els(); const color = firstFill(el) && firstFill(el).type === 'solid' ? firstFill(el).color : '#000000';
    left.append(h('button.cb-btn.font-btn', { style: 'font-family:' + OC.fonts.stack(el.ff), onpointerdown: e => e.preventDefault(), onclick: ev => { const b = ev.currentTarget; UI.toggleSticky(b, () => UI.fontPicker(el.ff, n => { E.setTextProp('font', n); CB.render(); }), { cls: 'pop-font' }); } }, el.ff, h('span', { html: OC.icon('chevron-down', 14) })),
      h('div.size-ctl', btn('minus', 'Smaller', () => E.setTextProp('size', Math.max(4, Math.round(el.fs - (el.fs > 40 ? 4 : 1))))), UI.num(Math.round(el.fs), v => { E.setTextProp('size', v); }, { min: 4, max: 800, dec: 0, w: 56, scrub: false }), btn('plus', 'Bigger', () => E.setTextProp('size', Math.round(el.fs + (el.fs > 40 ? 4 : 1))))),
      UI.colorBtn(color, (c, l) => E.setTextProp('color', c, { live: l }), c => E.setTextProp('color', c), { title: 'Text color', cls: 'tcolor' }), sep(),
      btn('bold', 'Bold', () => E.setTextProp('bold'), el.fw >= 600), btn('italic', 'Italic', () => E.setTextProp('italic'), el.fi), btn('underline', 'Underline', () => E.setTextProp('underline'), el.under), btn('strikethrough', 'Strikethrough', () => E.setTextProp('strike'), el.strike), sep(),
      btn({ left: 'align-left', center: 'align-center', right: 'align-right', justify: 'align-justify' }[el.align] || 'align-left', 'Alignment', () => { const order = ['left', 'center', 'right', 'justify']; E.setTextProp('align', order[(order.indexOf(el.align) + 1) % 4]); CB.render(); }),
      btn('case-sensitive' in OC.ICONS ? 'case-sensitive' : 'baseline', 'Letter case', () => { const o = ['none', 'upper', 'lower', 'title']; E.setTextProp('tf', o[(o.indexOf(el.tf) + 1) % 4]); }, el.tf !== 'none'),
      popBtn(ico('sliders-horizontal'), 'Spacing', () => h('div', UI.field('Letter', UI.slider(el.ls, -10, 60, .5, v => E.setTextProp('ls', v, { live: true }), v => E.setTextProp('ls', v))), UI.field('Line', UI.slider(el.lh, .6, 3, .05, v => E.setTextProp('lh', v, { live: true }), v => E.setTextProp('lh', v))), UI.field('Paragraph', UI.slider(el.para || 0, 0, 80, 1, v => E.setTextProp('para', v, { live: true }), v => E.setTextProp('para', v))), UI.field('Word', UI.slider(el.ws || 0, -10, 60, .5, v => E.setTextProp('ws', v, { live: true }), v => E.setTextProp('ws', v)))), { cls: 'txt' }));
    if (adv()) left.append(popBtn(ico('type'), 'Typography', () => h('div', UI.field('Weight', UI.select([100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => [w, w]), el.fw, v => E.setTextProp('weight', +v))), UI.field('Vertical', UI.seg([{ v: 'top', label: 'Top' }, { v: 'middle', label: 'Middle' }, { v: 'bottom', label: 'Bottom' }], el.valign, v => E.setTextProp('valign', v))), UI.field('Auto height', UI.toggle(el.autoH, v => E.setTextProp('autoH', v))), UI.field('Kerning', UI.toggle(el.kern !== false, v => E.setTextProp('kern', v))), UI.field('Small caps', UI.toggle(!!el.caps, v => E.setTextProp('caps', v)))), { cls: 'txt' }));
  }
  function shapeBar(left, els) {
    const e0 = els[0]; const f = firstFill(e0); const fillLabel = f ? (f.type === 'solid' ? f.color : f.type === 'image' ? '#888888' : null) : '#00000000';
    const fillBtn = h('button.color-btn.fillbtn', { title: T('Fill'), onpointerdown: e => e.preventDefault(), onclick: () => UI.toggleSticky(fillBtn, () => UI.fillEditor(els), { cls: 'pop-pad pop-color' }) });
    fillBtn.style.setProperty('--c', f ? (f.type === 'solid' ? f.color : f.type === 'image' ? '#888' : 'linear-gradient(135deg,' + f.stops[0].c + ',' + f.stops[f.stops.length - 1].c + ')') : 'transparent'); if (!f) fillBtn.classList.add('none');
    left.append(fillBtn);
    if (e0.type !== 'line') { const sb = h('button.cb-btn', { title: T('Border'), onpointerdown: e => e.preventDefault(), onclick: () => UI.toggleSticky(sb, () => UI.strokeEditor(els), { cls: 'pop-pad' }) }, h('span.stroke-ic', { style: '--c:' + (e0.stroke ? e0.stroke.color : 'transparent') }), h('span', T('Border'))); left.append(sb); }
    else left.append(UI.colorBtn(e0.stroke ? e0.stroke.color : '#000', (c, l) => apply(e => { if (e.stroke) e.stroke.color = c; }, 'Stroke', l), c => apply(e => { if (e.stroke) e.stroke.color = c; }, 'Stroke'), { title: 'Line color' }), UI.num(e0.stroke ? e0.stroke.width : 4, (v, l) => apply(e => { if (e.stroke) e.stroke.width = v; }, 'Stroke', l), { label: 'W', min: 1, max: 200, w: 80 }), popBtn(ico('arrow-right'), 'Ends', () => linePanel(e0), { cls: 'txt' }), popBtn(ico('sliders-horizontal'), 'Line style', () => UI.strokeEditor(els), { cls: 'txt' }));
    if (['rect', 'frame', 'polygon', 'star'].includes(e0.type)) left.append(h('div.row.radius', h('span.muted.small', T('Corners')), UI.slider(Array.isArray(e0.radius) ? e0.radius[0] : e0.radius || 0, 0, Math.min(e0.w, e0.h) / 2, 1, v => apply(e => { e.radius = v; }, 'Radius', true), v => apply(e => { e.radius = v; }, 'Radius'))));
    if (e0.type === 'polygon') left.append(UI.num(e0.sides, v => apply(e => { e.sides = Math.max(3, Math.round(v)); }, 'Sides', true), { label: 'Sides', min: 3, max: 40, dec: 0, w: 96, scrub: false }));
    if (e0.type === 'star') left.append(UI.num(e0.points, v => apply(e => { e.points = Math.max(3, Math.round(v)); }, 'Points', true), { label: 'Points', min: 3, max: 40, dec: 0, w: 100, scrub: false }), h('div.row.radius', h('span.muted.small', T('Depth')), UI.slider(e0.inner * 100, 5, 95, 1, v => apply(e => { e.inner = v / 100; }, 'Star', true), v => apply(e => { e.inner = v / 100; }, 'Star'))));
    if (adv()) { left.append(sep(), popBtn(ico('merge'), 'Combine', () => h('div.col', ...[['unite', 'Union'], ['subtract', 'Subtract'], ['intersect', 'Intersect'], ['exclude', 'Exclude']].map(([k, l]) => UI.btn(l, () => { O.boolean(k); UI.closeMenus(); }, { cls: 'full' })), UI.btn('Flatten', () => { O.flatten(); UI.closeMenus(); }, { cls: 'full' }), e0.type !== 'path' ? UI.btn('Convert to path', () => { O.outline(); UI.closeMenus(); }, { cls: 'full' }) : null), { cls: 'txt' }), UI.btn('Mask', () => O.useAsMask(), { icon: 'circle-dot', title: T('Use the top shape as a mask') })); }
  }
  function linePanel(e0) { const ends = ['none', 'arrow', 'triangle', 'dot', 'square', 'bar', 'diamond']; const mk = (side) => UI.select(ends.map(x => [x, x[0].toUpperCase() + x.slice(1)]), (e0.ends || {})[side] || 'none', v => apply(e => { e.ends = e.ends || { start: 'none', end: 'none' }; e.ends[side] = v; }, 'Line ends')); return h('div', UI.field('Start', mk('start')), UI.field('End', mk('end'))); }
  function imageBar(left, el) {
    left.append(UI.btn('Edit photo', () => UI.openPanel('photo'), { icon: 'wand-sparkles', primary: true }), UI.btn('Crop', () => { S.cropEl = el.id; R.invalidate(); CB.render(); }, { icon: 'crop' }),
      popBtn(ico('flip-horizontal-2'), 'Flip', () => h('div.col', UI.btn('Flip horizontal', () => { O.flip('h'); }, { cls: 'full' }), UI.btn('Flip vertical', () => { O.flip('v'); }, { cls: 'full' }), UI.btn('Rotate 90°', () => { O.rotate(90); }, { cls: 'full' })), { cls: 'txt' }),
      UI.btn('Remove background', () => OC.photo.removeBackground(el), { icon: 'eraser' }), popBtn(ico('layout-template'), 'Fit', () => UI.seg([{ v: 'cover', label: 'Fill' }, { v: 'contain', label: 'Fit' }, { v: 'fill', label: 'Stretch' }], el.fit, v => apply(e => { e.fit = v; e.crop = { x: 0, y: 0, s: 1 }; }, 'Fit')), { cls: 'txt' }));
    if (el.type === 'video') left.append(UI.btn('Trim', () => UI.toggleTimeline(true), { icon: 'scissors' }));
  }
  function groupBar(left, el) {
    if (el.mask) left.append(UI.btn('Release mask', () => O.releaseMask(), { icon: 'circle-dot' }));
    if (el.type === 'frame') { const f = firstFill(el); left.append(UI.colorBtn(f && f.type === 'solid' ? f.color : '#ffffff', (c, l) => apply(e => { e.fills = [D.solid(c)]; }, 'Fill', l), c => apply(e => { e.fills = [D.solid(c)]; }, 'Fill'), { title: 'Fill' }), h('label.chk', h('input', { type: 'checkbox', checked: el.clip, onchange: ev => apply(e => { e.clip = ev.target.checked; }, 'Clip') }), T('Clip content')), popBtn(ico('layout-dashboard'), 'Auto layout', () => layoutPanel(el), { cls: 'txt' })); }
    left.append(UI.btn('Ungroup', () => O.ungroup(), { icon: 'ungroup' }), UI.btn('Edit inside', () => { S.enter = el.id; OC.sel.set(el.children.map(c => c.id)); }, { icon: 'group' }));
    if (el.compRef) left.append(el.compMaster ? h('span.badge', T('Component')) : UI.btn('Detach', () => O.detach(), { icon: 'component' }));
    else left.append(UI.btn('Component', () => O.createComponent(), { icon: 'component' }));
  }
  function layoutPanel(el) { const L = el.layout; const set = (k, v) => apply(e => { e.layout = e.layout || { mode: 'none', gap: 12, pad: 16, align: 'start' }; e.layout[k] = v; }, 'Layout'); return h('div', UI.field('Direction', UI.seg([{ v: 'none', label: 'Off' }, { v: 'row', label: 'Row' }, { v: 'column', label: 'Column' }], L.mode, v => set('mode', v))), UI.field('Gap', UI.num(L.gap, v => set('gap', v), { dec: 0, w: 80 })), UI.field('Padding', UI.num(L.pad, v => set('pad', v), { dec: 0, w: 80 })), UI.field('Align', UI.seg([{ v: 'start', label: 'Start' }, { v: 'center', label: 'Center' }, { v: 'end', label: 'End' }], L.align, v => set('align', v))), UI.field('Hug content', UI.toggle(!!L.hug, v => set('hug', v)))); }
  function multiBar(left, els) {
    left.append(h('span.cb-title', els.length + ' ' + T('selected')), UI.btn('Group', () => O.group(), { icon: 'group' }), popBtn(ico('align-center-vertical'), 'Align', () => h('div.col', h('div.row.wrap', [['left', 'align-start-vertical'], ['center', 'align-center-vertical'], ['right', 'align-end-vertical'], ['top', 'align-start-horizontal'], ['middle', 'align-center-horizontal'], ['bottom', 'align-end-horizontal']].map(([a, i]) => UI.iconBtn(i, 'Align ' + a, () => O.align(a)))), UI.btn('Distribute horizontally', () => O.distribute('h'), { cls: 'full' }), UI.btn('Distribute vertically', () => O.distribute('v'), { cls: 'full' })), { cls: 'txt' }));
    if (adv()) left.append(UI.btn('Mask', () => O.useAsMask(), { icon: 'circle-dot' }), popBtn(ico('merge'), 'Combine', () => h('div.col', ...[['unite', 'Union'], ['subtract', 'Subtract'], ['intersect', 'Intersect'], ['exclude', 'Exclude']].map(([k, l]) => UI.btn(l, () => { O.boolean(k); UI.closeMenus(); }, { cls: 'full' })), UI.btn('Flatten', () => { O.flatten(); UI.closeMenus(); }, { cls: 'full' })), { cls: 'txt' }), UI.btn('Frame', () => O.group('frame'), { icon: 'frame' }));
  }
  function animatePanel(els) {
    const names = OC.timeline ? Object.keys(OC.timeline.PRESETS) : []; let where = 'in', dur = .8;
    return h('div.anim-pop', UI.seg([{ v: 'in', label: 'Enter' }, { v: 'out', label: 'Exit' }, { v: 'loop', label: 'Loop' }], where, v => { where = v; }), h('div.fld', h('label', T('Duration')), UI.num(dur, v => { dur = v; }, { unit: 's', w: 80, min: .1, step: .1, dec: 1 })),
      h('div.fx-grid', names.map(n => h('button.fx', { onclick: () => { els.forEach(e => OC.timeline.applyPreset(e, n, { where, dur })); OC.history.commit('Animate'); UI.toggleTimeline(true); S.time = 0; OC.render.invalidate(); } }, h('span.fx-prev.anim', n === 'none' ? '∅' : '▶'), h('small', T(n))))), UI.btn('Open timeline', () => { UI.toggleTimeline(true); UI.closeMenus(); }, { icon: 'timer', cls: 'full' }));
  }
  ['selection', 'changed', 'restored', 'tool', 'crop', 'editing'].forEach(ev => OC.bus.on(ev, () => CB.render()));
  OC.bus.on('geom', U.debounce(() => { if (!document.activeElement || !document.activeElement.closest || !document.activeElement.closest('.popover')) CB.render(); }, 120));
})();
