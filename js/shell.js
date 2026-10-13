/* App shell: layout, top bar, rail, dock, page strip, menus and dialogs */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui, E = OC.editor, O = OC.ops, C = OC.cmd;
  const T = s => OC.t(s); const ic = UI.ic; let refs = {};

  const RAIL = [['design', 'Design', 'layout-template'], ['elements', 'Elements', 'shapes'], ['text', 'Text', 'type'], ['brand', 'Brand', 'palette'], ['uploads', 'Uploads', 'cloud-upload'], ['tools', 'Tools', 'wrench'], ['projects', 'Projects', 'folder'], ['apps', 'Apps', 'layout-grid'], ['symbols', 'Symbols', 'hash', 'adv'], ['graphics', 'Graphics', 'spline', 'adv'], ['three', '3D', 'cuboid']];

  UI.build = function (root) {
    refs.root = root; root.textContent = '';
    refs.top = h('header.topbar'); refs.rail = h('nav.rail'); refs.panel = h('aside.panel'); refs.ctx = h('div.ctxbar', { 'data-keep-edit': '1' }); refs.canvas = h('div.canvas-wrap'); refs.tl = h('div.timeline-host'); refs.pages = h('div.pagebar'); refs.insp = h('aside.inspector', { 'data-keep-edit': '1' }); refs.modeHost = h('div.mode-host'); refs.home = h('div.home');
    refs.center = h('main.center', refs.ctx, refs.canvas, refs.tl, refs.pages, refs.modeHost);
    refs.work = h('div.work', refs.rail, refs.panel, refs.center, refs.insp);
    root.append(refs.top, refs.work, refs.home); UI.refs = refs;
    E.init(refs.canvas); buildDock(); buildZoomHud();
    renderTop(); renderRail(); renderPageBar(); OC.ctxbar && OC.ctxbar.render(); OC.inspector && OC.inspector.render();
    ['changed', 'restored', 'history'].forEach(ev => OC.bus.on(ev, () => { renderTopState(); pageThumbsDebounced(); }));
    OC.bus.on('page-changed', () => { markPages(); OC.ctxbar.render(); }); OC.bus.on('zoom', updateZoomHud); OC.bus.on('tool', updateDock);
    OC.bus.on('settings', k => { if (k === 'mode') { applyMode(); } if (['lang', 'sidebarSide', 'theme'].includes(k)) { } }); applyMode();
  };
  UI.refreshAll = function () { if (!refs.root) return; renderTop(); renderRail(); renderPageBar(); buildDock(); OC.ctxbar.render(); OC.inspector.render(); if (UI.curPanel) UI.openPanel(UI.curPanel, UI.curPanelOpts); OC.editor.buildHeads && S.project && OC.editor.buildHeads(); OC.bus.emit('i18n'); };
  function applyMode() { document.documentElement.dataset.mode = OC.settings.mode; refs.insp && (refs.insp.hidden = OC.settings.mode !== 'advanced' || S.home || !isCanvas()); renderTop(); buildDock(); OC.ctxbar && OC.ctxbar.render(); OC.inspector && OC.inspector.render(); setTimeout(() => OC.editor.paint && OC.render.invalidate(), 60); }
  const isCanvas = () => S.project && (S.project.mode === 'design' || S.project.mode === 'whiteboard');
  UI.isCanvas = isCanvas;
  UI.onProjectOpen = function () {
    S.home = false; refs.root.classList.remove('is-home'); const canvasMode = isCanvas(); refs.root.dataset.kind = canvasMode ? 'canvas' : 'other';
    refs.insp.hidden = OC.settings.mode !== 'advanced' || !canvasMode;
    if (canvasMode) { refs.modeHost.textContent = ''; if (OC.modes && OC.modes.unmount) OC.modes.unmount(); OC.editor.buildHeads(); D.layoutPages(); OC.editor.fit(); UI.closePanel(); if (S.project.video || S.project.pages.some(p => p.elements.some(e => OC.render.hasAnim(e)))) UI.toggleTimeline(true, true); else UI.toggleTimeline(false, true); if (S.project.photo) UI.openPanel('photo'); renderPageBar(); }
    else { UI.closePanel(); OC.modes.mount(S.project, refs.modeHost); }
    renderTop(); OC.ctxbar.render(); OC.inspector.render(); OC.render.invalidate();
  };
  UI.showHome = function () { S.home = true; refs.root.classList.add('is-home'); UI.closePanel(); OC.app.renderHome(refs.home); renderTop(); };

  /* ---------- top bar ---------- */
  function menuBtn(label, items) { const b = h('button.top-btn', { onclick: () => UI.menu(typeof items === 'function' ? items() : items, 0, 0, { anchor: b }) }, T(label)); return b; }
  const k = id => C.firstKey(id);
  function fileMenu() {
    return [
      { label: 'New design', icon: 'file-plus', keys: k('newDesign'), onclick: () => UI.newDialog() }, { label: 'Open project file', icon: 'folder-open', onclick: () => OC.app.openFile() }, { label: 'Home', icon: 'layout-dashboard', onclick: () => OC.app.goHome() }, { sep: 1 },
      { label: 'Save', icon: 'save', keys: k('save'), onclick: () => OC.app.save(true) }, { label: 'Make a copy', icon: 'copy', onclick: () => OC.app.duplicateProject() }, { label: 'Rename', icon: 'pencil', onclick: async () => { const v = await UI.prompt(T('Rename'), S.project.name); if (v) { S.project.name = v; renderTopState(); OC.app.save(); } } }, { sep: 1 },
      { label: 'Import files', icon: 'upload', onclick: async () => { const f = await U.pickFile('image/*,video/*,audio/*,.svg,.ttf,.otf,.woff,.woff2,.opencanvas,.json', true); OC.uploads.importFiles(f, {}); } },
      { label: 'Export', icon: 'download', keys: k('export'), onclick: () => OC.exporter.dialog({}) }, { label: 'Save as project file', icon: 'file-down', onclick: () => OC.app.exportBundle() }, { label: 'Publish to community', icon: 'share-2', onclick: () => OC.community.publishDialog() }, { sep: 1 },
      { label: 'Version history', icon: 'history', sub: OC.history.stack.map((s, i) => ({ label: (i === OC.history.idx ? '• ' : '') + OC.history.labels[i], onclick: () => { OC.history.idx !== i && (OC.history.idx = i, OC.app.jumpHistory(i)); } })).slice(-14).reverse() }
    ];
  }
  function editMenu() { const m = id => ({ label: C.list[id].label, keys: k(id), onclick: () => C.run(id) }); return [m('undo'), m('redo'), { sep: 1 }, m('cut'), m('copy'), m('paste'), m('duplicate'), m('delete'), { sep: 1 }, m('selectAll'), m('group'), m('ungroup'), m('lock')]; }
  function viewMenu() {
    const m = (id, o) => Object.assign({ label: C.list[id].label, keys: k(id), onclick: () => C.run(id) }, o);
    return [m('zoomIn'), m('zoomOut'), m('zoomFit'), m('zoom100'), m('zoomSel'), { sep: 1 }, m('layoutVertical', { check: S.pageLayout === 'vertical' }), m('layoutGrid', { check: S.pageLayout === 'grid' }), m('layoutHorizontal', { check: S.pageLayout === 'horizontal' }), { sep: 1 },
      m('toggleGrid', { check: S.project && S.project.grid && S.project.grid.show }), m('toggleSnap', { check: OC.settings.snap }), m('toggleAdvanced', { check: OC.settings.mode === 'advanced' }), m('timeline')];
  }
  function renderTop() {
    const t = refs.top; if (!t) return; t.textContent = ''; const inProj = !S.home && S.project;
    t.append(h('button.logo', { onclick: () => OC.app.goHome(), title: T('Home') }, h('span.logo-mark', { html: OC.LOGO }), h('b', 'OpenCanvas')));
    if (inProj) {
      t.append(menuBtn('File', fileMenu), menuBtn('Edit', editMenu), menuBtn('View', viewMenu));
      if (isCanvas()) t.append(h('button.top-btn.accent-soft', { onclick: () => UI.resizeDialog() }, h('span', { html: OC.icon('scaling', 15) }), T('Resize')));
      t.append(UI.iconBtn('undo-2', 'Undo', () => OC.history.undo(), false, { cls: 'undo' }), UI.iconBtn('redo-2', 'Redo', () => OC.history.redo(), false, { cls: 'redo' }), h('span.save-state', { id: 'saveState' }));
      refs.name = h('input.proj-name', { value: S.project.name, onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); }, onchange: e => { S.project.name = e.target.value || 'Untitled'; OC.app.save(); } }); t.append(refs.name);
    }
    t.append(h('span.grow'));
    if (inProj) {
      t.append(h('div.mode-sw', { title: T('Simple mode hides advanced tools') }, UI.seg([{ v: 'simple', label: 'Simple' }, { v: 'advanced', label: 'Advanced' }], OC.settings.mode, v => OC.settings.set('mode', v))));
      t.append(aiChip());
    }
    t.append(UI.iconBtn('languages', 'Language', async () => { const l = await UI.pickLanguage(); if (l) OC.i18n.set(l); }, false, { cls: 'top-ic' }));
    if (inProj) {
      t.append(UI.iconBtn('message-square-plus', 'Comments', () => { OC.settings.set('mode', 'advanced'); OC.inspector.tab('comments'); }, false, { cls: 'top-ic' }));
      t.append(h('button.top-btn', { onclick: () => UI.menu([{ label: 'Publish to community', icon: 'share-2', onclick: () => OC.community.publishDialog() }, { label: 'Save as project file', icon: 'file-down', onclick: () => OC.app.exportBundle() }, { label: 'Copy share link', icon: 'link', onclick: () => OC.app.shareLink() }], 0, 0, { anchor: t.lastChild }) }, h('span', { html: OC.icon('share-2', 15) }), T('Share')));
      if (isCanvas()) t.append(h('button.top-btn', { onclick: () => OC.present && OC.present.start() }, h('span', { html: OC.icon('play', 15) }), T('Present')));
      t.append(h('button.btn.primary.export-btn', { onclick: () => OC.exporter.dialog({}) }, h('span', { html: OC.icon('download', 16) }), T('Export')));
    }
    t.append(UI.iconBtn('settings', 'Settings', () => UI.settings(), false, { cls: 'top-ic' }));
    renderTopState();
  }
  function aiChip() {
    const dev = OC.settings.ai.where === 'device'; const b = h('button.chip', { title: T('Where AI tools run'), onclick: () => UI.toggleSticky(b, () => aiPanel(), { cls: 'pop-pad' }) }, h('span', { html: OC.icon(dev ? 'cpu' : 'server', 15) }), T(dev ? 'On device' : 'Server')); return b;
  }
  function aiPanel() {
    const a = OC.settings.ai; const url = h('input.input', { value: a.serverUrl, placeholder: 'https://your-server.example', onkeydown: e => e.stopPropagation(), onchange: () => OC.settings.set('ai.serverUrl', url.value.trim()) });
    return h('div.ai-pop', h('h4', T('AI tools run')), UI.seg([{ v: 'device', label: 'On device' }, { v: 'server', label: 'On server' }], a.where, v => { OC.settings.set('ai.where', v); UI.closeMenus(); renderTop(); }),
      h('p.muted.small', T(a.where === 'device' ? 'Runs in your browser. Models download once.' : 'Sends images to your own server.')), a.where === 'server' ? [url, UI.btn('Test connection', async () => { const r = await OC.photo.pingServer(); U.toast(r ? 'Server ready' : 'Cannot reach server'); })] : null);
  }
  function renderTopState() {
    const t = refs.top; if (!t || S.home) return; const u = t.querySelector('.undo'), r = t.querySelector('.redo'); if (u) u.disabled = !OC.history.canUndo(); if (r) r.disabled = !OC.history.canRedo(); if (refs.name && document.activeElement !== refs.name) refs.name.value = S.project.name;
    const ss = U.$('#saveState'); if (ss) ss.textContent = OC.app.dirty ? T('Saving') : T('Saved');
  }
  UI.renderTopState = renderTopState;

  /* ---------- rail and panel ---------- */
  function renderRail() {
    const r = refs.rail; r.textContent = ''; RAIL.forEach(([id, label, icon, adv]) => {
      const b = h('button.rail-item' + (UI.curPanel === id ? '.on' : '') + (adv ? '.adv' : ''), { 'data-id': id, onclick: () => (UI.curPanel === id ? UI.closePanel() : UI.openPanel(id)) }, h('span', { html: OC.icon(icon, 24) }), h('small', T(label))); r.append(b);
    });
  }
  UI.openPanel = function (id, opts) {
    const p = UI.panels[id]; if (!p) return; UI.curPanel = id; UI.curPanelOpts = opts; const host = refs.panel; host.textContent = ''; host.classList.add('open');
    host.append(h('div.panel-head', h('h3', T(p.title)), h('button.icon-btn', { onclick: () => UI.closePanel(), html: OC.icon('chevron-left', 18), title: T('Hide') })), h('div.panel-body'));
    try { p.render(host.lastChild, opts || {}); } catch (e) { console.error(e); host.lastChild.append(UI.empty('Something went wrong')); }
    U.$$('.rail-item', refs.rail).forEach(b => b.classList.toggle('on', b.dataset.id === id)); setTimeout(() => OC.render.invalidate(), 250);
  };
  UI.closePanel = function () { UI.curPanel = null; refs.panel && refs.panel.classList.remove('open'); refs.panel && (refs.panel.textContent = ''); U.$$('.rail-item', refs.rail || document).forEach(b => b.classList.remove('on')); OC.photo && OC.photo.leavePanel && OC.photo.leavePanel(); setTimeout(() => OC.render.invalidate(), 250); };

  /* ---------- floating tool dock ---------- */
  const DOCK = [['select', 'mouse-pointer-2', 'Select'], ['hand', 'hand', 'Hand'], ['text', 'type', 'Text'], ['shape', 'square', 'Shapes'], ['line', 'minus', 'Line'], ['pen', 'pen-tool', 'Pen', 'adv'], ['pencil', 'pencil', 'Draw'], ['frame', 'frame', 'Frame', 'adv'], ['sticky', 'sticker', 'Sticky note', 'wb'], ['comment', 'message-square-plus', 'Comment', 'adv']];
  function buildDock() {
    if (!refs.canvas) return; let dk = U.$('.dock', refs.canvas); if (dk) dk.remove(); dk = h('div.dock', { 'data-keep-edit': '' });
    DOCK.forEach(([id, icon, label, flag]) => {
      if (flag === 'adv' && OC.settings.mode !== 'advanced') return; if (flag === 'wb' && !(S.project && S.project.mode === 'whiteboard')) return;
      const key = id === 'shape' ? C.firstKey('tool_rect') : C.firstKey('tool_' + id);
      const b = h('button.dock-btn', { 'data-t': id, title: T(label) + (key ? ' (' + key + ')' : ''), onclick: () => { if (id === 'shape') { UI.menu([['rect', 'Rectangle', 'square'], ['ellipse', 'Ellipse', 'circle'], ['polygon', 'Polygon', 'hexagon'], ['star', 'Star', 'star']].map(s => ({ label: s[1], icon: s[2], keys: C.firstKey('tool_' + s[0]), onclick: () => E.setTool(s[0]) })), 0, 0, { anchor: b, side: 'right' }); } else E.setTool(id); }, html: OC.icon(icon, 20) }); dk.append(b);
    }); refs.canvas.append(dk); updateDock();
  }
  function updateDock() { U.$$('.dock-btn', refs.canvas).forEach(b => { const t = b.dataset.t; b.classList.toggle('on', t === S.tool || (t === 'shape' && ['rect', 'ellipse', 'polygon', 'star'].includes(S.tool))); }); }

  /* ---------- zoom hud ---------- */
  let zoomEl;
  function buildZoomHud() {
    zoomEl = h('div.zoomhud', { 'data-keep-edit': '' }, UI.iconBtn('zoom-out', 'Zoom out', () => E.setZoom(S.zoom / 1.25)), h('button.zoom-pct', { onclick: () => UI.menu([[.25, '25%'], [.5, '50%'], [1, '100%'], [2, '200%']].map(z => ({ label: z[1], onclick: () => E.setZoom(z[0]) })).concat([{ sep: 1 }, { label: 'Fit page', keys: k('zoomFit'), onclick: () => E.fit() }, { label: 'Fit selection', keys: k('zoomSel'), onclick: () => E.fitSelection() }]), 0, 0, { anchor: zoomEl.children[1] }) }, '100%'), UI.iconBtn('zoom-in', 'Zoom in', () => E.setZoom(S.zoom * 1.25)), UI.iconBtn('maximize', 'Fit page', () => E.fit()));
    refs.canvas.append(zoomEl);
  }
  function updateZoomHud() { if (zoomEl) zoomEl.children[1].textContent = Math.round(S.zoom * 100) + '%'; }

  /* ---------- page strip ---------- */
  const pageThumbsDebounced = U.debounce(() => renderPageBar(true), 350);
  function renderPageBar(keepScroll) {
    const bar = refs.pages; if (!bar || !S.project || !isCanvas()) return; const sc = bar.querySelector('.pg-scroll'); const left = sc ? sc.scrollLeft : 0; bar.textContent = '';
    const list = h('div.pg-scroll');
    S.project.pages.forEach((pg, i) => {
      const c = U.newCanvas(10, 10); try { const t = OC.render.thumb(pg.infinite ? { ...pg, w: 1600, h: 900, infinite: false, elements: pg.elements.map(e => e) } : pg, 150); c.width = t.width; c.height = t.height; c.getContext('2d').drawImage(t, 0, 0); } catch (e) { }
      const card = h('button.pg-card' + (i === S.pageIdx ? '.on' : '') + (pg.locked ? '.locked' : ''), { draggable: true, title: pg.title || T('Page') + ' ' + (i + 1), onclick: () => { E.focusPage(i); renderPageBar(true); }, oncontextmenu: ev => { ev.preventDefault(); S.pageIdx = i; UI.menu([{ label: 'Duplicate page', icon: 'copy', onclick: () => O.duplicatePage(i) }, { label: pg.locked ? 'Unlock page' : 'Lock page', icon: 'lock', onclick: () => O.lockPage(i) }, { label: 'Add page', icon: 'plus', onclick: () => O.addPage(i) }, { sep: 1 }, { label: 'Delete page', icon: 'trash-2', onclick: () => O.deletePage(i) }], ev.clientX, ev.clientY); },
        ondragstart: ev => { ev.dataTransfer.setData('text/oc-page', String(i)); }, ondragover: ev => ev.preventDefault(), ondrop: ev => { ev.preventDefault(); const f = +ev.dataTransfer.getData('text/oc-page'); if (!isNaN(f) && f !== i) O.movePage(f, i); } }, c, h('small', pg.title || String(i + 1)), pg.locked ? h('span.lk', { html: OC.icon('lock', 11) }) : null);
      list.append(card);
    });
    bar.append(list, h('button.pg-add', { title: T('Add page'), onclick: () => O.addPage(S.project.pages.length - 1), html: OC.icon('plus', 18) }), h('span.grow'),
      UI.iconBtn('grid-3x3', 'Page layout', ev => UI.menu([['vertical', 'Pages in a column'], ['grid', 'Pages in a grid'], ['horizontal', 'Pages in a row']].map(([v, l]) => ({ label: l, check: S.pageLayout === v, onclick: () => { S.pageLayout = v; D.layoutPages(); E.fit(); } })), 0, 0, { anchor: ev.currentTarget })), UI.iconBtn('timer', 'Timeline', () => UI.toggleTimeline(), S.timelineOpen, { cls: 'tl-btn' }));
    list.scrollLeft = left;
  }
  UI.renderPageBar = renderPageBar;
  function markPages() { U.$$('.pg-card', refs.pages).forEach((c, i) => c.classList.toggle('on', i === S.pageIdx)); }
  UI.toggleTimeline = function (v, quiet) { S.timelineOpen = v == null ? !S.timelineOpen : v; refs.tl.classList.toggle('open', S.timelineOpen); if (S.timelineOpen && OC.timeline) OC.timeline.mount(refs.tl); else if (OC.timeline) OC.timeline.unmount(); const b = U.$('.tl-btn', refs.pages); b && b.classList.toggle('on', S.timelineOpen); OC.render.invalidate(); if (!quiet) setTimeout(() => OC.render.invalidate(), 200); };

  /* ---------- context menu ---------- */
  UI.contextMenu = function (x, y, kind, p) {
    const els = OC.sel.els(); const one = els.length === 1 ? els[0] : null; const adv = OC.settings.mode === 'advanced'; const K = id => k(id);
    const has = els.length > 0; const hasText = els.some(function f(e) { return e.type === 'text' || (e.children && e.children.some(f)); }); const isImg = one && (one.type === 'image' || one.type === 'video');
    if (kind === 'page' || !has) {
      UI.menu([{ label: 'Paste', icon: 'clipboard', keys: K('paste'), disabled: !S.clipboard, onclick: () => O.paste() }, { label: 'Select all', keys: K('selectAll'), onclick: () => C.run('selectAll') }, { sep: 1 },
        { label: 'Add page', icon: 'plus', keys: K('addPage'), onclick: () => O.addPage() }, { label: 'Duplicate page', icon: 'copy', onclick: () => O.duplicatePage() }, { label: S.project.pages[S.pageIdx].locked ? 'Unlock page' : 'Lock page', icon: 'lock', onclick: () => O.lockPage(S.pageIdx) }, { label: 'Delete page', icon: 'trash-2', onclick: () => O.deletePage() }, { sep: 1 },
        { label: 'Comment', icon: 'message-square-plus', keys: K('comment'), onclick: () => O.addComment(null, { x: p.px, y: p.py }) }, { label: 'Fit page', onclick: () => E.fit() }], x, y); return;
    }
    const locked = els.every(e => e.locked), lpos = els.every(e => e.lockPos);
    const items = [
      { label: 'Copy', icon: 'copy', keys: K('copy'), onclick: () => O.copy() }, { label: 'Copy style', icon: 'paintbrush', sub: [{ label: 'Copy style', keys: K('copyStyle'), onclick: () => O.copyStyle() }, { label: 'Paste style', keys: K('pasteStyle'), disabled: !S.styleClip, onclick: () => O.pasteStyle() }] },
      { label: 'Paste', icon: 'clipboard', keys: K('paste'), disabled: !S.clipboard, onclick: () => O.paste() }, { label: 'Duplicate', icon: 'copy-plus', keys: K('duplicate'), onclick: () => O.duplicate() }, { label: 'Delete', icon: 'trash-2', keys: 'DELETE', onclick: () => O.del() }, { sep: 1 },
      { label: 'Layer', icon: 'layers', sub: [{ label: 'Bring to front', keys: K('toFront'), onclick: () => O.order('front') }, { label: 'Bring forward', keys: K('forward'), onclick: () => O.order('forward') }, { label: 'Send backward', keys: K('backward'), onclick: () => O.order('backward') }, { label: 'Send to back', keys: K('toBack'), onclick: () => O.order('back') }, { sep: 1 }, { label: 'Show layers', onclick: () => { OC.settings.set('mode', 'advanced'); OC.inspector.tab('layers'); } }] },
      { label: 'Align to page', icon: 'align-start-vertical', sub: [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([a, l]) => ({ label: l, onclick: () => O.align(a, true) })) }, { sep: 1 },
      { label: 'Create component', icon: 'component', keys: K('component'), onclick: () => O.createComponent() }, { label: 'Comment', icon: 'message-square-plus', keys: K('comment'), onclick: () => O.addComment() },
      { label: 'Lock', icon: 'lock', sub: [{ label: locked ? 'Unlock' : 'Lock', onclick: () => O.lock() }, { label: lpos ? 'Unlock position' : 'Lock position', onclick: () => O.lock('pos') }] }, { label: 'Link', icon: 'link', keys: K('link'), onclick: () => O.setLink() },
      { label: 'Hide element timing', icon: 'clock', onclick: () => O.toggleTiming() }, { label: 'Alternative text', icon: 'info', onclick: () => O.setAlt() }, { sep: 1 },
      { label: 'Replace background', icon: 'image', disabled: !isImg, onclick: () => OC.photo.replaceBackground(one) }, { label: 'Apply colors to page', icon: 'palette', onclick: () => O.applyColorsToPage() }, { label: 'Download selection', icon: 'download', onclick: () => O.downloadSelection() },
      { label: 'Translate text', icon: 'languages', disabled: !hasText, onclick: () => O.translateText() }, { label: 'See more like this', icon: 'search', disabled: !one || !(one.tags && one.tags.length || one.name), onclick: () => O.seeMore() }, { label: 'Info', icon: 'info', onclick: () => UI.info(one || els[0]) }
    ];
    if (adv) items.splice(items.length - 6, 0, { sep: 1 }, { label: 'Group', icon: 'group', keys: K('group'), disabled: els.length < 2, onclick: () => O.group() }, { label: 'Ungroup', icon: 'ungroup', keys: K('ungroup'), disabled: !els.some(e => e.children), onclick: () => O.ungroup() }, { label: 'Use as mask', icon: 'circle-dot', keys: K('mask'), disabled: els.length < 2, onclick: () => O.useAsMask() },
      { label: 'Combine shapes', icon: 'merge', disabled: els.length < 2, sub: [['unite', 'Union'], ['subtract', 'Subtract'], ['intersect', 'Intersect'], ['exclude', 'Exclude']].map(([a, l]) => ({ label: l, onclick: () => O.boolean(a) })) }, { label: 'Flatten', icon: 'layers', keys: K('flatten'), onclick: () => O.flatten() }, { label: 'Convert to path', icon: 'spline', disabled: !one || one.type === 'path' || one.type === 'text', onclick: () => O.outline() }, { label: 'Frame selection', icon: 'frame', onclick: () => O.group('frame') },
      { label: 'Flip', icon: 'flip-horizontal-2', sub: [{ label: 'Horizontal', onclick: () => O.flip('h') }, { label: 'Vertical', onclick: () => O.flip('v') }] }, { label: 'Rename', keys: K('rename'), onclick: () => O.rename() });
    UI.menu(items, x, y);
  };

  /* ---------- dialogs ---------- */
  UI.info = function (el) {
    if (!el) return; const f = D.find(el.id); const rows = [['Name', el.name], ['Type', el.type], ['Size', Math.round(el.w) + ' × ' + Math.round(el.h) + ' px'], ['Position', Math.round(el.x) + ', ' + Math.round(el.y)], ['Rotation', Math.round(el.rot || 0) + '°'], ['Opacity', Math.round(el.opacity * 100) + '%'], ['Page', f ? (f.page.title || (S.project.pages.indexOf(f.page) + 1)) : ''], ['Layers inside', el.children ? el.children.length : ''], ['Font', el.type === 'text' ? el.ff + ' ' + el.fw + ' ' + el.fs + 'px' : ''], ['Link', el.link], ['Alt text', el.alt], ['ID', el.id]];
    UI.modal({ title: 'Info', width: 420, body: h('table.info', rows.filter(r => r[1] !== '' && r[1] != null).map(r => h('tr', h('th', T(r[0])), h('td', String(r[1]))))), actions: [{ label: 'Done', primary: true }] });
  };
  UI.help = function () {
    const map = [['Create a design', 'File, New design'], ['Magic Resize', 'Resize button'], ['Magic Eraser, Magic Grab', 'Edit photo, Tools panel'], ['Brand Kit', 'Brand panel'], ['Pages', 'Strip at the bottom'], ['Apps', 'Apps panel'], ['Position, Animate', 'Context bar'], ['Layers', 'Advanced mode, right panel']];
    UI.modal({ title: 'Coming from Canva', width: 520, body: [h('table.info', map.map(r => h('tr', h('th', T(r[0])), h('td', T(r[1]))))), h('div.row.end', UI.btn('Keyboard shortcuts', () => UI.shortcuts()), UI.btn('Switch to advanced mode', () => { OC.settings.set('mode', 'advanced'); }))], actions: [{ label: 'Done', primary: true }] });
  };
  UI.shortcuts = function () {
    const groups = {}; Object.values(C.list).filter(c => !c.hidden && C.keysFor(c.id).length).forEach(c => { (groups[c.group || 'Edit'] = groups[c.group || 'Edit'] || []).push(c); });
    const q = h('input.input', { placeholder: T('Search'), onkeydown: e => e.stopPropagation(), oninput: () => draw() }); const body = h('div.sc-list');
    const draw = () => { body.textContent = ''; Object.keys(groups).forEach(g => { const rows = groups[g].filter(c => !q.value || c.label.toLowerCase().includes(q.value.toLowerCase())); if (!rows.length) return; body.append(h('h4', T(g)), ...rows.map(c => h('div.sc-row', h('span', T(c.label)), h('span', C.keysFor(c.id).map(kk => h('kbd', C.format(kk))))))); }); }; draw();
    UI.modal({ title: 'Keyboard shortcuts', width: 560, body: [q, body], actions: [{ label: 'Done', primary: true }] });
  };
  UI.palette = function () {
    const q = h('input.input.big', { placeholder: T('Type a command'), onkeydown: ev => { ev.stopPropagation(); if (ev.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); mark(); ev.preventDefault(); } else if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); ev.preventDefault(); } else if (ev.key === 'Enter' && shown[sel]) { m.close(); setTimeout(() => shown[sel].run(), 20); } }, oninput: () => draw() }); const list = h('div.pal-list'); let sel = 0, shown = [];
    const all = () => { const out = []; Object.values(C.list).forEach(c => { if (c.scope && !c.scope() || c.hidden) return; out.push({ label: c.label, keys: C.firstKey(c.id), run: () => C.run(c.id) }); }); Object.keys(UI.panels).forEach(id => out.push({ label: 'Open ' + UI.panels[id].title, keys: '', run: () => UI.openPanel(id) })); if (S.project && S.project.pages) S.project.pages.forEach((p, i) => out.push({ label: 'Go to page ' + (i + 1) + (p.title ? ' ' + p.title : ''), keys: '', run: () => E.focusPage(i) })); return out; };
    const mark = () => { U.$$('.pal-item', list).forEach((e, i) => e.classList.toggle('on', i === sel)); const on = U.$('.pal-item.on', list); on && on.scrollIntoView({ block: 'nearest' }); };
    const draw = () => { const f = q.value.toLowerCase(); shown = all().filter(c => !f || T(c.label).toLowerCase().includes(f) || c.label.toLowerCase().includes(f)).slice(0, 60); sel = 0; list.textContent = ''; shown.forEach((c, i) => list.append(h('button.pal-item', { onclick: () => { m.close(); setTimeout(() => c.run(), 20); } }, h('span', T(c.label)), c.keys ? h('kbd', c.keys) : ''))); mark(); }; draw();
    const m = UI.modal({ title: 'Commands', width: 520, body: [q, list], cls: 'palette' }); setTimeout(() => q.focus(), 30);
  };

  /* new design dialog */
  UI.newDialog = function (pre) {
    let cat = OC.CATEGORIES.find(c => c.id === pre) || OC.CATEGORIES[2]; const left = h('div.nd-cats'), right = h('div.nd-main'); let name = '';
    const create = (c, item) => { m.close(); OC.app.create(c, item); };
    const drawR = () => {
      right.textContent = ''; right.append(h('h3', T(cat.label)));
      if (cat.custom) {
        let w = 1080, hh = 1080, u = 'px'; const wi = UI.num(w, v => { w = v; }, { label: 'W', min: 1, max: 20000, scrub: false, dec: 2 }), hi = UI.num(hh, v => { hh = v; }, { label: 'H', min: 1, max: 20000, scrub: false, dec: 2 }), us = UI.select(Object.keys(OC.UNITS), 'px', v => { u = v; });
        right.append(h('div.row', wi, h('span.muted', '×'), hi, us), h('p.muted.small', T('Sizes are stored in pixels at 96 per inch')), UI.btn('Create design', () => { const k = OC.UNITS[u]; create(cat, [T('Custom size'), Math.round(w * k), Math.round(hh * k)]); }, { primary: true }), h('h4', T('Popular sizes')), grid(['social', 'print', 'presentations'].flatMap(id => OC.CATEGORIES.find(c => c.id === id).items.slice(0, 5).map(i => [OC.CATEGORIES.find(c => c.id === id), i]))));
      } else right.append(grid(cat.items.map(i => [cat, i])));
    };
    const grid = list => h('div.size-grid', list.map(([c, i]) => h('button.size-card', { onclick: () => create(c, i) }, h('div.size-prev', { style: i[1] ? `aspect-ratio:${i[1]}/${i[2]}` : '' }, !i[1] ? h('span', { html: OC.icon(c.icon, 26) }) : ''), h('b', T(i[0])), h('small', i[1] ? `${i[1]} × ${i[2]} px` : T(c.label)))));
    const drawL = () => { left.textContent = ''; OC.CATEGORIES.forEach(c => left.append(h('button.nd-cat' + (c === cat ? '.on' : ''), { onclick: () => { cat = c; drawL(); drawR(); } }, h('span', { html: OC.icon(c.icon, 18) }), T(c.label)))); };
    drawL(); drawR(); const m = UI.modal({ title: 'Create a design', width: 880, cls: 'newdlg', body: h('div.nd', left, right) });
  };
  UI.resizeDialog = function () {
    const pg = OC.page(); let w = pg.w, hh = pg.h, mode = 'smart', copy = false, all = true; const wi = UI.num(w, v => { w = v; }, { label: 'W', min: 1, scrub: false }), hi = UI.num(hh, v => { hh = v; wi.set(w); }, { label: 'H', min: 1, scrub: false });
    const list = h('div.size-pick'); OC.CATEGORIES.filter(c => c.items.length && c.mode === 'design').forEach(c => { list.append(h('h5', T(c.label))); c.items.forEach(i => list.append(h('button.size-row', { onclick: () => { w = i[1]; hh = i[2]; wi.input.value = w; hi.input.value = hh; } }, h('span', T(i[0])), h('small', `${i[1]} × ${i[2]}`)))); });
    UI.modal({ title: 'Resize', width: 520, body: [h('div.row', wi, h('span.muted', '×'), hi, h('span.muted.small', 'px')), h('div.fld', h('label', T('Scaling')), UI.seg([{ v: 'smart', label: 'Smart' }, { v: 'stretch', label: 'Stretch' }, { v: 'keep', label: 'Keep sizes' }], mode, v => { mode = v; })), h('label.chk', h('input', { type: 'checkbox', onchange: e => { copy = e.target.checked; } }), T('Make a copy')), list],
      actions: [{ label: 'Cancel' }, { label: 'Resize', primary: true, onclick: async () => { w = Math.round(w); hh = Math.round(hh); if (copy) { await OC.app.duplicateProject(true); } O.resizeAll(w, hh, mode); } }] });
  };

  /* settings */
  UI.settings = function (tabId) {
    const SET = OC.settings; const tabs = ['General', 'Editor', 'Shortcuts', 'AI', 'Community', 'Data']; let cur = tabId || 'General'; const body = h('div.set-body'), nav = h('div.set-nav');
    const row = (label, ctrl, hint) => h('div.set-row', h('div', h('b', T(label)), hint ? h('small', T(hint)) : null), ctrl);
    const pages = {
      General: () => [row('Theme', UI.seg([{ v: 'dark', label: 'Dark' }, { v: 'light', label: 'Light' }, { v: 'system', label: 'System' }], SET.theme, v => { SET.set('theme', v); E.cacheColors(); })),
        row('Accent color', h('div.row', UI.colorBtn(SET.accent, (c, live) => { SET.set('accent', c); }, c => SET.set('accent', c), { docColors: false }), ...['#2563eb', '#e5484d', '#00a58e', '#ff914d', '#0ea5e9', '#22c55e'].map(c => h('button.swatch', { style: 'background:' + c, onclick: () => { SET.set('accent', c); UI.settings('General'); } })))),
        row('Corner roundness', UI.slider(SET.radius, 0, 20, 1, v => SET.set('radius', v))), row('Density', UI.seg([{ v: 'comfortable', label: 'Comfortable' }, { v: 'compact', label: 'Compact' }], SET.density, v => SET.set('density', v))), row('Interface size', UI.slider(SET.uiScale, 80, 130, 5, v => SET.set('uiScale', v))),
        row('Panel position', UI.seg([{ v: 'left', label: 'Left' }, { v: 'right', label: 'Right' }], SET.sidebarSide, v => SET.set('sidebarSide', v))), row('Canvas color', h('div.row', UI.colorBtn(SET.canvasBg || '#1a1a24', (c) => { SET.set('canvasBg', c); E.cacheColors(); }, c => { SET.set('canvasBg', c); E.cacheColors(); }), UI.btn('Reset', () => { SET.set('canvasBg', ''); E.cacheColors(); }))),
        row('Language', UI.btn(OC.i18n.langs.find(l => l[0] === SET.lang)[1], async () => { const l = await UI.pickLanguage(); if (l) { OC.i18n.set(l); UI.settings('General'); } })),
        row('Translation service', h('div', UI.select([['google', 'Google Translate'], ['mymemory', 'MyMemory'], ['libre', 'LibreTranslate'], ['none', 'Off']], SET.translator, v => SET.set('translator', v)), SET.translator === 'libre' ? h('input.input', { placeholder: 'https://libretranslate.example', value: SET.translatorUrl, onkeydown: e => e.stopPropagation(), onchange: e => SET.set('translatorUrl', e.target.value) }) : null), 'Used for languages without a built in pack')],
      Editor: () => [row('Snap to guides', UI.toggle(SET.snap, v => SET.set('snap', v))), row('Snap to grid', UI.toggle(SET.snapGrid, v => SET.set('snapGrid', v))), row('Corner handles keep proportions', UI.toggle(SET.proportional, v => SET.set('proportional', v))), row('Mouse wheel', UI.seg([{ v: 'pan', label: 'Scrolls' }, { v: 'zoom', label: 'Zooms' }], SET.wheel, v => SET.set('wheel', v))), row('Autosave', UI.toggle(SET.autosave, v => SET.set('autosave', v))), row('Show tips', UI.toggle(SET.showTips, v => SET.set('showTips', v)))],
      Shortcuts: () => { const rows = Object.values(C.list).filter(c => !c.hidden); return [row('Preset', UI.select([['opencanvas', 'OpenCanvas'], ['canva', 'Canva'], ['figma', 'Figma']], SET.keymap, v => { SET.set('keymap', v); UI.settings('Shortcuts'); })), UI.btn('Reset custom keys', () => { SET.set('keys', {}); UI.settings('Shortcuts'); }), h('div.sc-list', rows.map(c => { const cell = h('button.key-cell', { onclick: () => { cell.textContent = T('Press keys'); const on = e => { e.preventDefault(); e.stopPropagation(); const cb = C.combo(e); if (!cb) return; removeEventListener('keydown', on, true); if (cb !== 'escape') { const ks = Object.assign({}, SET.keys); ks[c.id] = [cb]; SET.set('keys', ks); } UI.settings('Shortcuts'); }; addEventListener('keydown', on, true); } }, C.keysFor(c.id).map(C.format).join('  ') || T('None')); return h('div.sc-row', h('span', T(c.label)), cell); }))]; },
      AI: () => [row('Run AI tools', UI.seg([{ v: 'device', label: 'On device' }, { v: 'server', label: 'On server' }], SET.ai.where, v => { SET.set('ai.where', v); UI.settings('AI'); renderTop(); }), 'Background remover, magic eraser, magic grab, grab text, background generator'), SET.ai.where === 'server' ? [row('Server address', h('input.input', { value: SET.ai.serverUrl, placeholder: 'https://', onkeydown: e => e.stopPropagation(), onchange: e => SET.set('ai.serverUrl', e.target.value.trim()) })), row('API key', h('input.input', { type: 'password', value: SET.ai.apiKey, onkeydown: e => e.stopPropagation(), onchange: e => SET.set('ai.apiKey', e.target.value) })), UI.btn('Test connection', async () => U.toast(await OC.photo.pingServer() ? 'Server ready' : 'Cannot reach server'))] : h('p.muted.small', T('Models download once and run in your browser.'))],
      Community: () => [row('Registries', h('div', ...SET.registries.map((r, i) => h('div.row', h('code', r), UI.iconBtn('x', 'Remove', () => { SET.registries.splice(i, 1); SET.set('registries', SET.registries); UI.settings('Community'); }))), h('div.row', h('input#newReg.input', { placeholder: 'owner/repo or https://…/registry.json', onkeydown: e => e.stopPropagation() }), UI.btn('Add', () => { const v = U.$('#newReg').value.trim(); if (v) { SET.registries.push(v.includes('/') && !v.startsWith('http') && !v.startsWith('gh:') && !v.endsWith('.json') ? 'gh:' + v : v); SET.set('registries', SET.registries); UI.settings('Community'); } }))), 'Any GitHub repo with a registry file works'), row('Sandbox apps', UI.toggle(SET.safeApps, v => SET.set('safeApps', v)), 'Apps run isolated from your design')],
      Data: () => [row('Export all projects', UI.btn('Download backup', () => OC.app.backupAll())), row('Import backup', UI.btn('Choose file', async () => { const f = await U.pickFile('.json,.opencanvas'); f[0] && OC.app.openFile(f[0]); })), row('Clear translation cache', UI.btn('Clear', () => { Object.keys(localStorage).filter(k2 => k2.startsWith('oc.tr.')).forEach(k2 => localStorage.removeItem(k2)); U.toast('Cleared'); })), row('Reset settings', UI.btn('Reset', async () => { if (await UI.confirm('Reset settings', 'All settings return to defaults.', 'Reset', true)) { localStorage.removeItem('oc.settings'); location.reload(); } }))]
    };
    const draw = () => { nav.textContent = ''; tabs.forEach(t => nav.append(h('button' + (t === cur ? '.on' : ''), { onclick: () => { cur = t; draw(); } }, T(t)))); body.textContent = ''; body.append(...[].concat(pages[cur]())); };
    if (UI._settingsModal) UI._settingsModal.close(); draw(); UI._settingsModal = UI.modal({ title: 'Settings', width: 720, cls: 'settings', body: h('div.set', nav, body), onclose: () => { UI._settingsModal = null; } });
  };
  /* drop payloads from panels */
  UI.dropPayload = function (p, at, pg, target) { OC.panels && OC.panels.drop(p, at, pg, target); };

  OC.LOGO = '<svg viewBox="0 0 32 32" width="22" height="22"><rect x="2" y="2" width="28" height="28" rx="9" fill="#2563eb"/><path d="M21.5 11.2A7.2 7.2 0 1 0 21.5 20.8" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="21.8" cy="16" r="1.9" fill="#fff"/></svg>';
})();
