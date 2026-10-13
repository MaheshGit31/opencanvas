/* Right side inspector: design, layers, comments */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui, E = OC.editor, O = OC.ops, R = OC.render;
  const T = s => OC.t(s); const IN = OC.inspector = { cur: 'design', collapsed: {} };
  const apply = (...a) => OC.ctxbar.apply(...a);

  IN.tab = function (t) { IN.cur = t; if (UI.refs) UI.refs.insp.hidden = false; IN.render(); };
  IN.render = U.debounce(function () { IN.renderNow(); }, 30);
  IN.renderNow = function () {
    const host = UI.refs && UI.refs.insp; if (!host) return; if (host.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && IN._busy) return;
    const top = host.scrollTop; host.textContent = ''; if (host.hidden || !S.project || !UI.isCanvas()) return;
    const tabs = [['design', 'Design'], ['layers', 'Layers'], ['comments', 'Comments']];
    host.append(h('div.insp-tabs', tabs.map(([k, l]) => h('button' + (IN.cur === k ? '.on' : ''), { onclick: () => { IN.cur = k; IN.renderNow(); } }, T(l), k === 'comments' && S.project.comments.length ? h('em', String(S.project.comments.filter(c => !c.resolved).length || '')) : ''))));
    const body = h('div.insp-body'); host.append(body); ({ design, layers, comments })[IN.cur](body); host.scrollTop = top;
  };
  ['selection', 'restored', 'page-changed'].forEach(ev => OC.bus.on(ev, () => IN.render()));
  OC.bus.on('changed', () => IN.render()); OC.bus.on('comments', () => IN.render());
  OC.bus.on('geom', U.throttleRaf(() => { if (IN.cur === 'design') liveUpdate(); }));

  /* ---------- design tab ---------- */
  let liveFields = [];
  function liveUpdate() { const e = OC.sel.one(); if (!e) return; const g = E.geo(e); liveFields.forEach(([k, f]) => { if (f.set) f.set(k === 'x' ? g.x : k === 'y' ? g.y : k === 'w' ? g.w : k === 'h' ? g.h : g.rot || 0); }); }
  const kfBtn = (el, prop) => { const keys = el.anim && el.anim[prop]; const on = keys && keys.some(k => Math.abs(k.t - S.time) < 1e-3); const has = keys && keys.length; return h('button.kf' + (on ? '.on' : has ? '.has' : ''), { title: T('Keyframe'), onclick: () => { OC.timeline.toggleKey(el, prop); UI.toggleTimeline(true, true); IN.renderNow(); }, html: OC.icon('diamond', 13) }); };
  function design(body) {
    liveFields = []; const els = OC.sel.els(); const el = els[0];
    if (!els.length) { pageDesign(body); return; }
    const g = E.geo(el); const set = (props, live) => { els.filter(e => !D.isLocked(e.id)).forEach(e => E.setGeom(e, typeof props === 'function' ? props(e) : props)); if (live) { R.invalidate(); OC.bus.emit('geom'); } else OC.history.commit('Edit'); };
    const f = (k, label, v, o) => { const n = UI.num(v, (val, live) => { IN._busy = true; set({ [k]: val }, live); if (!live) IN._busy = false; }, Object.assign({ label, dec: 1 }, o)); liveFields.push([k, n]); return h('div.fld-kf', n, el.anim !== undefined && els.length === 1 ? kfBtn(el, k) : ''); };
    body.append(UI.section('Layout', h('div.grid2', f('x', 'X', g.x), f('y', 'Y', g.y), f('w', 'W', g.w, { min: 1 }), f('h', 'H', g.h, { min: 1 }), f('rot', '°', g.rot || 0, { title: T('Rotation') }), el.radius !== undefined ? UI.num(Array.isArray(el.radius) ? el.radius[0] : el.radius, (v, l) => apply(e => { if (e.radius !== undefined) e.radius = v; }, 'Radius', l), { label: 'R', min: 0, dec: 0 }) : h('span')), h('div.row.wrap', [['left', 'align-start-vertical'], ['center', 'align-center-vertical'], ['right', 'align-end-vertical'], ['top', 'align-start-horizontal'], ['middle', 'align-center-horizontal'], ['bottom', 'align-end-horizontal']].map(([a, i]) => UI.iconBtn(i, 'Align ' + a, () => O.align(a))), UI.iconBtn('flip-horizontal-2', 'Flip horizontal', () => O.flip('h')), UI.iconBtn('flip-vertical-2', 'Flip vertical', () => O.flip('v')))));
    if (el.children && el.type === 'frame') body.append(UI.section('Auto layout', autoLayout(el)));
    body.append(UI.section('Appearance', h('div', h('div.row', h('span.lbl', T('Opacity')), UI.slider(el.opacity * 100, 0, 100, 1, v => apply(e => { E.setGeom(e, { opacity: v / 100 }); }, 'Opacity', true), v => apply(e => { E.setGeom(e, { opacity: v / 100 }); }, 'Opacity')), UI.num(Math.round(el.opacity * 100), v => apply(e => { E.setGeom(e, { opacity: v / 100 }); }, 'Opacity'), { unit: '%', w: 66, dec: 0, min: 0, max: 100 }), els.length === 1 ? kfBtn(el, 'opacity') : ''),
      UI.field('Blend', OC.ctxbar.blendCtl(el)))));
    if (el.type === 'text' || el.type === 'image' && false) { }
    if (el.type === 'text') body.append(UI.section('Typography', typography(el)));
    if (el.fills !== undefined && el.type !== 'image' && el.type !== 'video' && el.type !== 'scene3d') body.append(UI.section('Fill', fillList(els), { right: h('span.sect-act', { onclick: e => { e.stopPropagation(); apply(x => { (x.fills = x.fills || []).push(D.solid('#cccccc')); }, 'Add fill'); IN.renderNow(); }, html: OC.icon('plus', 15) }) }));
    if (el.type !== 'group' && el.type !== 'scene3d' && el.type !== 'audio') body.append(UI.section('Stroke', UI.strokeEditor(els), { open: !!el.stroke }));
    body.append(UI.section('Effects', UI.effectsEditor(els), { open: false }));
    if (el.type === 'image' || el.type === 'video') body.append(UI.section('Photo', h('div.col', UI.btn('Adjust and filters', () => UI.openPanel('photo'), { icon: 'sliders-horizontal', cls: 'full' }), UI.btn('Corner pin', () => OC.photo.startPin(el), { icon: 'move-diagonal', cls: 'full' }), UI.btn('Replace background', () => OC.photo.replaceBackground(el), { icon: 'image', cls: 'full' }))));
    if (el.type === 'scene3d') body.append(UI.section('3D', UI.btn('Edit scene', () => OC.threed.edit(el), { icon: 'cuboid', cls: 'full' })));
    body.append(UI.section('Vector and masks', h('div.col', h('div.row.wrap', ['unite:Union', 'subtract:Subtract', 'intersect:Intersect', 'exclude:Exclude'].map(s => { const [k, l] = s.split(':'); return UI.btn(l, () => O.boolean(k), { cls: 'sm' }); })), h('div.row.wrap', UI.btn('Mask', () => O.useAsMask(), { cls: 'sm' }), UI.btn('Flatten', () => O.flatten(), { cls: 'sm' }), UI.btn('Path', () => O.outline(), { cls: 'sm' }), UI.btn('Frame', () => O.group('frame'), { cls: 'sm' }), UI.btn('Component', () => O.createComponent(), { cls: 'sm' }))), { open: false }));
    body.append(UI.section('Link and access', h('div', UI.field('Link', h('input.input', { value: el.link || '', placeholder: 'https://', onkeydown: e => e.stopPropagation(), onchange: ev => apply(e => { e.link = ev.target.value; }, 'Link') })), UI.field('Alt text', h('input.input', { value: el.alt || '', onkeydown: e => e.stopPropagation(), onchange: ev => apply(e => { e.alt = ev.target.value; }, 'Alt text') })), UI.field('Name', h('input.input', { value: el.name || '', onkeydown: e => e.stopPropagation(), onchange: ev => apply(e => { e.name = ev.target.value; }, 'Rename') }))), { open: false }));
    body.append(UI.section('Export layer', h('div.row', UI.btn('PNG', () => exportLayer('png'), { cls: 'sm' }), UI.btn('SVG', () => exportLayer('svg'), { cls: 'sm' }), UI.btn('WebP', () => exportLayer('webp'), { cls: 'sm' })), { open: false }));
  }
  async function exportLayer(fmt) { const els = OC.sel.els(); if (!els.length) return; OC.exporter.quick(els, fmt); }
  function autoLayout(el) { const L = el.layout; const set = (k, v) => apply(e => { e.layout = e.layout || { mode: 'none', gap: 12, pad: 16, align: 'start' }; e.layout[k] = v; }, 'Layout'); return h('div', UI.seg([{ v: 'none', label: 'Off' }, { v: 'row', label: 'Row' }, { v: 'column', label: 'Column' }], L.mode, v => { set('mode', v); IN.renderNow(); }), UI.field('Gap', UI.num(L.gap, v => set('gap', v), { dec: 0, w: 80 })), UI.field('Padding', UI.num(L.pad, v => set('pad', v), { dec: 0, w: 80 })), UI.field('Align', UI.seg([{ v: 'start', label: 'Start' }, { v: 'center', label: 'Center' }, { v: 'end', label: 'End' }], L.align, v => set('align', v))), UI.field('Hug content', UI.toggle(!!L.hug, v => set('hug', v))), UI.field('Clip content', UI.toggle(el.clip !== false, v => set('clip', v)))); }
  function typography(el) {
    const tp = (k, v, live) => OC.editor.setTextProp(k, v, { live }); const ff = h('button.btn.full.font-btn', { style: 'font-family:' + OC.fonts.stack(el.ff), onclick: ev => UI.toggleSticky(ev.currentTarget, () => UI.fontPicker(el.ff, n => { tp('font', n); IN.renderNow(); }), { cls: 'pop-font' }) }, el.ff);
    return h('div', ff, h('div.grid2', UI.num(el.fs, v => tp('size', v, false), { label: 'Sz', min: 1, dec: 1 }), UI.select([100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => [w, w]), el.fw, v => tp('weight', +v))), h('div.grid2', UI.num(el.lh, (v, l) => tp('lh', v, l), { label: 'LH', step: .05, dec: 2, min: .3 }), UI.num(el.ls, (v, l) => tp('ls', v, l), { label: 'LS', step: .5, dec: 1 }), UI.num(el.ws || 0, (v, l) => tp('ws', v, l), { label: 'WS', step: .5, dec: 1 }), UI.num(el.para || 0, (v, l) => tp('para', v, l), { label: 'PS', dec: 0, min: 0 })),
      UI.seg([{ v: 'left', icon: 'align-left' }, { v: 'center', icon: 'align-center' }, { v: 'right', icon: 'align-right' }, { v: 'justify', icon: 'align-justify' }], el.align, v => tp('align', v)), UI.seg([{ v: 'top', label: 'Top' }, { v: 'middle', label: 'Mid' }, { v: 'bottom', label: 'Bottom' }], el.valign, v => tp('valign', v)),
      UI.seg([{ v: 'none', label: 'Aa' }, { v: 'upper', label: 'AA' }, { v: 'lower', label: 'aa' }, { v: 'title', label: 'Aa Aa' }], el.tf, v => tp('tf', v)), UI.field('Curve', UI.slider(el.curve || 0, -100, 100, 1, v => tp('curve', v, true), v => tp('curve', v))), UI.field('Auto height', UI.toggle(el.autoH, v => tp('autoH', v))), UI.field('Kerning', UI.toggle(el.kern !== false, v => tp('kern', v))), UI.field('Small caps', UI.toggle(!!el.caps, v => tp('caps', v))),
      UI.field('Color', UI.colorBtn((el.fills && el.fills[0] && el.fills[0].color) || '#000', (c, l) => tp('color', c, l), c => tp('color', c))));
  }
  function fillList(els) {
    const e0 = els[0]; const wrap = h('div.fill-list');
    (e0.fills || []).forEach((f, i) => {
      const sw = f.type === 'solid' ? f.color : f.type === 'image' ? '#888' : `linear-gradient(135deg,${(f.stops || [{ c: '#000' }])[0].c},${(f.stops || [{ c: '#fff' }]).slice(-1)[0].c})`;
      const b = h('button.color-btn.fillbtn', { onclick: () => UI.toggleSticky(b, () => UI.fillEditor(els, { index: i }), { cls: 'pop-pad pop-color' }) }); b.style.setProperty('--c', sw);
      wrap.append(h('div.row.fill-row', b, h('span.grow.small.muted', f.type === 'solid' ? f.color.toUpperCase() : T(f.type === 'image' ? 'Image' : 'Gradient')), UI.num(Math.round((f.opacity == null ? 1 : f.opacity) * 100), (v, l) => apply(e => { if (e.fills[i]) e.fills[i].opacity = v / 100; }, 'Fill', l), { unit: '%', w: 66, dec: 0, min: 0, max: 100 }), UI.iconBtn(f.visible === false ? 'eye-off' : 'eye', 'Visibility', () => { apply(e => { if (e.fills[i]) e.fills[i].visible = e.fills[i].visible === false; }, 'Fill'); IN.renderNow(); }), UI.iconBtn('minus', 'Remove', () => { apply(e => { e.fills.splice(i, 1); }, 'Fill'); IN.renderNow(); })));
    });
    if (!(e0.fills || []).length) wrap.append(h('p.muted.small', T('No fill')));
    return wrap;
  }
  function pageDesign(body) {
    const pg = OC.page(); if (!pg) return;
    body.append(UI.section('Page', h('div', UI.field('Title', h('input.input', { value: pg.title || '', placeholder: T('Add page title'), onkeydown: e => e.stopPropagation(), onchange: e => { pg.title = e.target.value; OC.history.commit('Rename page'); } })), pg.infinite ? '' : h('div.grid2', UI.num(pg.w, v => { O.resizePage(pg, Math.round(v), pg.h, 'keep'); D.layoutPages(); OC.history.commit('Resize page'); }, { label: 'W', dec: 0, min: 1, scrub: false }), UI.num(pg.h, v => { O.resizePage(pg, pg.w, Math.round(v), 'keep'); D.layoutPages(); OC.history.commit('Resize page'); }, { label: 'H', dec: 0, min: 1, scrub: false })),
      UI.field('Duration', UI.num(pg.duration, v => { pg.duration = v; OC.history.commit('Duration'); }, { unit: 's', w: 80, step: .5, dec: 1, min: .5 })), UI.field('Transition', UI.select(['none', 'fade', 'slide', 'zoom', 'wipe', 'dissolve'].map(x => [x, x[0].toUpperCase() + x.slice(1)]), pg.transition || 'none', v => { pg.transition = v; OC.history.commit('Transition'); })), UI.field('Locked', UI.toggle(pg.locked, () => O.lockPage(S.project.pages.indexOf(pg)))))));
    body.append(UI.section('Background', OC.ctxbar.pageFill(pg)));
    body.append(UI.section('Brand colors', h('div.swatches', S.project.brand.colors.map(c => h('button.swatch', { style: 'background:' + c, title: c, onclick: () => { pg.bg = { type: 'solid', color: c }; OC.history.commit('Background'); } })))));
    body.append(UI.section('Notes', h('textarea.input.notes', { rows: 4, placeholder: T('Speaker notes'), onkeydown: e => e.stopPropagation(), onchange: e => { pg.notes = e.target.value; OC.history.commit('Notes'); } }, pg.notes || ''), { open: false }));
  }
  function bgEditor(pg) { const fake = { id: '_bg', fills: [], anim: {} }; return OC.ctxbar && OC.ctxbar.pageFill ? OC.ctxbar.pageFill(pg) : h('span'); }

  /* ---------- layers ---------- */
  const ICON = { rect: 'square', ellipse: 'circle', polygon: 'hexagon', star: 'star', line: 'minus', path: 'pen-tool', text: 'type', image: 'image', video: 'video', audio: 'music', group: 'group', frame: 'frame', scene3d: 'cuboid' };
  function layers(body) {
    const pg = OC.page(); body.append(h('div.layer-head', h('b', pg.title || T('Page') + ' ' + (S.pageIdx + 1)), h('span.muted.small', D.allElements({ pages: [pg] }).length + ' ' + T('layers'))));
    const tree = h('div.layer-tree'); body.append(tree);
    const row = (el, depth) => {
      const kids = el.children; const collapsed = IN.collapsed[el.id];
      const r = h('div.layer' + (OC.sel.has(el.id) ? '.on' : '') + (el.visible === false ? '.hid' : ''), { style: `padding-left:${8 + depth * 14}px`, 'data-id': el.id, onpointerdown: e => layerDrag(e, el, r),
        onclick: e => { if (r.dataset.nosel) return; if (D.isLocked(el.id) && !el.locked) return; if (e.shiftKey) OC.sel.toggle(el.id); else OC.sel.set([el.id]); }, ondblclick: () => O.rename(el), oncontextmenu: e => { e.preventDefault(); OC.sel.set([el.id]); UI.contextMenu(e.clientX, e.clientY, 'element', {}); },
        ondrop: null },
        kids ? h('button.lc', { onclick: e => { e.stopPropagation(); IN.collapsed[el.id] = !collapsed; IN.renderNow(); }, html: OC.icon(collapsed ? 'chevron-right' : 'chevron-down', 13) }) : h('span.lc'), h('span.lt', { html: OC.icon(ICON[el.type] || 'square', 14) }), h('span.ln', el.name || el.type),
        el.compRef ? h('span.lt', { html: OC.icon('component', 12) }) : '', h('button.lb' + (el.locked ? '.on' : ''), { onclick: e => { e.stopPropagation(); el.locked = !el.locked; if (el.locked) OC.sel.clear(); OC.history.commit('Lock'); }, html: OC.icon(el.locked ? 'lock' : 'unlock', 13) }), h('button.lb' + (el.visible === false ? '.on' : ''), { onclick: e => { e.stopPropagation(); O.toggleVisible(el); }, html: OC.icon(el.visible === false ? 'eye-off' : 'eye', 13) }));
      tree.append(r); if (kids && !collapsed) kids.slice().reverse().forEach(c => row(c, depth + 1));
    };
    pg.elements.slice().reverse().forEach(e => row(e, 0));
    if (!pg.elements.length) tree.append(UI.empty('Nothing here yet'));
  }
  function layerDrag(e, el, row) {
    if (e.button !== 0 || e.target.closest('button') || D.isLocked(el.id) && !el.locked) return;
    const tree = row.parentNode, y0 = e.clientY; let on = false, tgt = null, mode = null, ghost = null;
    const clear = () => { tree.querySelectorAll('[data-drop]').forEach(x => delete x.dataset.drop); };
    const mv = ev => {
      if (!on) { if (Math.abs(ev.clientY - y0) < 5) return; on = true; row.classList.add('dragging'); ghost = h('div.layer-ghost', el.name || el.type); document.body.append(ghost); }
      ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 6 + 'px';
      clear(); tgt = null; const rows = [...tree.querySelectorAll('.layer')]; const r = rows.find(x => { const b = x.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY <= b.bottom; });
      if (r && r !== row) { const t = D.get(r.dataset.id); if (t && !D.ancestors(t.id).includes(el)) { const b = r.getBoundingClientRect(), f = (ev.clientY - b.top) / b.height; tgt = t; mode = t.children && f > .3 && f < .7 ? 'in' : f < .5 ? 'above' : 'below'; r.dataset.drop = mode; } }
      const sc = tree.closest('.insp-body') || tree.parentNode; const sb = sc.getBoundingClientRect(); if (ev.clientY < sb.top + 30) sc.scrollTop -= 8; else if (ev.clientY > sb.bottom - 30) sc.scrollTop += 8;
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (ghost) ghost.remove(); clear(); row.classList.remove('dragging'); if (on) { if (tgt) moveLayer(el.id, tgt, mode); row.dataset.nosel = '1'; setTimeout(() => delete row.dataset.nosel, 50); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }
  function moveLayer(id, target, mode) {
    const el = D.get(id); if (!el || el === target || D.ancestors(target.id).includes(el)) return; const f = D.find(el.id), tf = D.find(target.id);
    f.list.splice(f.list.indexOf(el), 1);
    if (mode === 'in' && target.children) { target.children.push(el); const w = D.toPage(el.id, el.w / 2, el.h / 2); }
    else { const list = tf.list; let i = list.indexOf(target); if (mode === 'above') i += 1; list.splice(i, 0, el); }
    D.reindex(); OC.history.commit('Reorder layers');
  }

  /* ---------- comments ---------- */
  function comments(body) {
    const list = S.project.comments; body.append(h('div.row', UI.btn('New comment', () => E.setTool('comment'), { icon: 'message-square-plus' }), h('label.chk', h('input', { type: 'checkbox', checked: !!E.showResolved, onchange: e => { E.showResolved = e.target.checked; R.invalidate(); } }), T('Show resolved'))));
    if (!list.length) { body.append(UI.empty('No comments yet')); return; }
    list.forEach((c, i) => {
      body.append(h('div.comment' + (c.resolved ? '.done' : ''), h('div.c-head', h('span.pin', String(i + 1)), h('b', c.author), h('small', new Date(c.time).toLocaleString())), h('p', c.text), (c.replies || []).map(r => h('div.reply', h('b', r.author), h('span', r.text))),
        h('div.row', UI.btn('Reply', async () => { const v = await UI.prompt(T('Reply'), ''); if (v) { (c.replies = c.replies || []).push({ author: 'You', text: v }); OC.history.commit('Reply'); } }), UI.btn(c.resolved ? 'Reopen' : 'Resolve', () => { c.resolved = !c.resolved; OC.history.commit('Resolve'); }), UI.btn('Go to', () => { const pgI = S.project.pages.findIndex(p => p.id === c.pageId); if (pgI >= 0) E.focusPage(pgI); if (c.elId && D.get(c.elId)) OC.sel.set([c.elId]); }), UI.iconBtn('trash-2', 'Delete', () => { S.project.comments.splice(i, 1); OC.history.commit('Delete comment'); }))));
    });
  }
  OC.bus.on('comment-focus', id => { IN.cur = 'comments'; UI.refs.insp.hidden = false; OC.settings.set('mode', 'advanced'); IN.renderNow(); });
})();
