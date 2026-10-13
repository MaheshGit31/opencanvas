/* Command registry with default shortcuts */
(function () {
  const U = OC.U, D = OC.doc, S = OC.S, C = OC.cmd, O = OC.ops, E = OC.editor;
  const design = () => !S.home && S.project && (S.project.mode === 'design' || S.project.mode === 'whiteboard');
  const anyDoc = () => !S.home && !!S.project;
  const sel = () => S.sel.length > 0;
  const d = (id, label, keys, run, extra) => C.register(id, label, keys, run, Object.assign({ scope: design, group: 'Edit' }, extra));

  d('undo', 'Undo', ['mod+z'], () => OC.history.undo(), { group: 'Edit' });
  d('redo', 'Redo', ['mod+y', 'mod+shift+z'], () => OC.history.redo());
  d('cut', 'Cut', ['mod+x'], () => O.cut(), { when: sel }); d('copy', 'Copy', ['mod+c'], () => O.copy(), { when: sel }); d('paste', 'Paste', [], () => O.paste());
  d('duplicate', 'Duplicate', ['mod+d'], () => O.duplicate(), { when: sel });
  d('delete', 'Delete', ['delete', 'backspace'], () => { if (S.tool === 'pen' && E.tools.pen.key('Backspace')) return; if (S.nodeEdit && E.nodeDelete()) return; O.del(); }, { when: () => sel() || (S.tool === 'pen' && E.tools.pen.st) });
  d('selectAll', 'Select all', ['mod+a'], () => { const pg = OC.page(); const list = S.enter && D.get(S.enter) ? D.get(S.enter).children : pg.elements; OC.sel.set(list.filter(e => !e.locked && e.visible !== false).map(e => e.id)); });
  d('escape', 'Deselect', ['escape'], () => {
    if (S.tool === 'pen' && E.tools.pen.st) { E.tools.pen.finish(true); return; } if (S.photoTool) { OC.photo.cancel && OC.photo.cancel(); return; }
    if (S.cropEl) { E.exitCrop(); return; } if (S.nodeEdit) { S.nodeEdit = null; OC.history.commit('Edit path'); OC.render.invalidate(); return; } if (OC.threed && OC.threed.active) { OC.threed.exit(); return; }
    if (S.enter) { S.enter = null; OC.render.invalidate(); OC.bus.emit('selection'); return; } if (S.tool !== 'select') { E.setTool('select'); return; } OC.sel.clear();
  });
  d('enter', 'Edit selected', ['enter'], () => {
    if (S.tool === 'pen' && E.tools.pen.key('Enter')) return; if (S.cropEl) { E.exitCrop(); return; } if (S.nodeEdit) { S.nodeEdit = null; OC.history.commit('Edit path'); OC.render.invalidate(); return; }
    const e = OC.sel.one(); if (!e) return;
    if (e.type === 'text') E.editText(e); else if (e.children) { S.enter = e.id; OC.sel.set(e.children.map(c => c.id)); } else if (e.type === 'path') { S.nodeEdit = e.id; E.nodeSel = new Set(); OC.render.invalidate(); } else if (e.type === 'image') { S.cropEl = e.id; OC.render.invalidate(); OC.bus.emit('selection'); } else if (e.type === 'scene3d') OC.threed.edit(e); else E.shapeText(e);
  }, { when: () => sel() || S.cropEl || S.nodeEdit || (S.tool === 'pen' && E.tools.pen.st) });
  d('selectParent', 'Select parent', ['shift+enter'], () => { const e = OC.sel.one(); if (!e) return; const f = D.find(e.id); if (f.parentEl) OC.sel.set([f.parentEl.id]); }, { when: sel });
  d('group', 'Group', ['mod+g'], () => O.group(), { when: sel }); d('ungroup', 'Ungroup', ['mod+shift+g'], () => O.ungroup(), { when: sel });
  d('frame', 'Frame selection', ['mod+alt+g'], () => O.group('frame'), { when: sel });
  d('lock', 'Lock or unlock', ['alt+shift+l'], () => O.lock(), { when: sel }); d('lockPos', 'Lock position', [], () => O.lock('pos'), { when: sel });
  d('hide', 'Show or hide', ['mod+shift+h'], () => { OC.sel.els().forEach(e => { e.visible = !e.visible; }); OC.history.commit('Visibility'); }, { when: sel });
  d('toFront', 'Bring to front', ['mod+shift+]'], () => O.order('front'), { when: sel }); d('toBack', 'Send to back', ['mod+shift+['], () => O.order('back'), { when: sel });
  d('forward', 'Bring forward', ['mod+]'], () => O.order('forward'), { when: sel }); d('backward', 'Send backward', ['mod+['], () => O.order('backward'), { when: sel });
  d('link', 'Link', ['mod+k'], () => O.setLink(), { when: sel }); d('component', 'Create component', ['mod+alt+k'], () => O.createComponent(), { when: sel }); d('comment', 'Comment', ['mod+alt+n'], () => O.addComment(), {});
  d('copyStyle', 'Copy style', ['mod+alt+c'], () => O.copyStyle(), { when: sel }); d('pasteStyle', 'Paste style', ['mod+alt+v'], () => O.pasteStyle(), { when: sel });
  d('mask', 'Use as mask', ['mod+alt+m'], () => O.useAsMask(), { when: sel }); d('releaseMask', 'Release mask', [], () => O.releaseMask());
  d('flatten', 'Flatten', ['mod+e'], () => O.flatten(), { when: sel }); d('outline', 'Convert to path', [], () => O.outline(), { when: sel });
  ['unite:Union', 'subtract:Subtract', 'intersect:Intersect', 'exclude:Exclude'].forEach(s => { const [k, l] = s.split(':'); d('bool_' + k, l + ' shapes', [], () => O.boolean(k), { when: sel }); });
  d('flipH', 'Flip horizontal', ['shift+h'], () => O.flip('h'), { when: sel }); d('flipV', 'Flip vertical', ['shift+v'], () => O.flip('v'), { when: sel });
  d('rotate90', 'Rotate 90 degrees', [], () => O.rotate(90), { when: sel });
  [['left', 'alt+a'], ['center', 'alt+h'], ['right', 'alt+d'], ['top', 'alt+w'], ['middle', 'alt+v'], ['bottom', 'alt+s']].forEach(([k, key]) => d('align_' + k, 'Align ' + k, [key], () => O.align(k), { when: sel }));
  d('distH', 'Distribute horizontally', [], () => O.distribute('h'), { when: sel }); d('distV', 'Distribute vertically', [], () => O.distribute('v'), { when: sel });
  d('rename', 'Rename layer', ['f2'], () => O.rename(), { when: sel });
  d('detach', 'Detach component', [], () => O.detach(), { when: sel });
  [['nudgeL', 'arrowleft', -1, 0], ['nudgeR', 'arrowright', 1, 0], ['nudgeU', 'arrowup', 0, -1], ['nudgeD', 'arrowdown', 0, 1]].forEach(([id, k, x, y]) => {
    d(id, 'Nudge', [k], () => { if (S.cropEl) return; O.nudge(x, y); }, { when: sel, hidden: true }); d(id + 'x', 'Nudge 10', ['shift+' + k], () => O.nudge(x * 10, y * 10), { when: sel, hidden: true });
  });
  /* text */
  const txt = f => () => { if (OC.sel.els().some(e => e.type === 'text') || E.isEditing()) f(); };
  d('bold', 'Bold', ['mod+b'], txt(() => E.setTextProp('bold')), { group: 'Text' }); d('italic', 'Italic', ['mod+i'], txt(() => E.setTextProp('italic')), { group: 'Text' }); d('underline', 'Underline', ['mod+u'], txt(() => E.setTextProp('underline')), { group: 'Text' });
  d('strike', 'Strikethrough', ['mod+shift+x'], txt(() => E.setTextProp('strike')), { group: 'Text' });
  [['left', 'l'], ['center', 'e'], ['right', 'r'], ['justify', 'j']].forEach(([a, k]) => d('text_' + a, 'Align text ' + a, ['mod+shift+' + k], txt(() => E.setTextProp('align', a)), { group: 'Text' }));
  d('textBigger', 'Bigger text', ['mod+shift+.'], txt(() => { const e = OC.sel.one(); if (e) E.setTextProp('size', Math.round(e.fs * 1.1)); }), { group: 'Text' });
  d('textSmaller', 'Smaller text', ['mod+shift+,'], txt(() => { const e = OC.sel.one(); if (e) E.setTextProp('size', Math.max(4, Math.round(e.fs / 1.1))); }), { group: 'Text' });
  /* tools */
  [['select', 'Select', 'v'], ['hand', 'Hand', 'h'], ['text', 'Text', 't'], ['rect', 'Rectangle', 'r'], ['ellipse', 'Ellipse', 'o'], ['line', 'Line', 'l'], ['pen', 'Pen', 'p'], ['pencil', 'Pencil', 'b'], ['frame', 'Frame', 'f'], ['sticky', 'Sticky note', 'n'], ['comment', 'Comment tool', 'c'], ['polygon', 'Polygon', 'y'], ['star', 'Star', 'shift+8']].forEach(([id, l, k]) => d('tool_' + id, l, [k], () => E.setTool(id), { group: 'Tools' }));
  /* view */
  d('zoomIn', 'Zoom in', ['mod+=', 'mod+shift+='], () => E.setZoom(S.zoom * 1.25, null, null, true), { group: 'View', scope: anyDoc }); d('zoomOut', 'Zoom out', ['mod+-'], () => E.setZoom(S.zoom / 1.25, null, null, true), { group: 'View', scope: anyDoc });
  d('zoomFit', 'Fit page', ['mod+0', 'shift+1'], () => E.fit(undefined, true), { group: 'View' }); d('zoom100', 'Zoom to 100%', ['mod+1'], () => E.setZoom(1, null, null, true), { group: 'View' }); d('zoomSel', 'Zoom to selection', ['shift+2'], () => E.fitSelection(), { group: 'View' });
  d('nextPage', 'Next page', ['pagedown'], () => { OC.setPageIdx(S.pageIdx + 1); E.focusPage(S.pageIdx); }, { group: 'Pages' }); d('prevPage', 'Previous page', ['pageup'], () => { OC.setPageIdx(S.pageIdx - 1); E.focusPage(S.pageIdx); }, { group: 'Pages' });
  d('addPage', 'Add page', ['mod+enter'], () => O.addPage(), { group: 'Pages' }); d('dupPage', 'Duplicate page', [], () => O.duplicatePage(), { group: 'Pages' }); d('delPage', 'Delete page', [], () => O.deletePage(), { group: 'Pages' });
  d('toggleGrid', 'Toggle grid', ["mod+'"], () => { S.project.grid.show = !S.project.grid.show; OC.render.invalidate(); }, { group: 'View' });
  d('toggleSnap', 'Toggle snapping', [], () => OC.settings.set('snap', !OC.settings.snap), { group: 'View', scope: anyDoc });
  d('layoutVertical', 'Pages in a column', [], () => { S.pageLayout = 'vertical'; D.layoutPages(); E.fit(); }, { group: 'View' }); d('layoutGrid', 'Pages in a grid', [], () => { S.pageLayout = 'grid'; D.layoutPages(); E.fit(); }, { group: 'View' }); d('layoutHorizontal', 'Pages in a row', [], () => { S.pageLayout = 'horizontal'; D.layoutPages(); E.fit(); }, { group: 'View' });
  /* app level */
  const g = (id, label, keys, run, extra) => C.register(id, label, keys, run, Object.assign({ scope: anyDoc, group: 'App' }, extra));
  g('save', 'Save', ['mod+s'], () => OC.app.save(true)); g('export', 'Export', ['mod+shift+e'], () => OC.exporter.dialog({}), { scope: anyDoc });
  g('palette', 'Command palette', ['mod+/', 'mod+shift+p'], () => OC.ui.palette(), { scope: () => true }); g('shortcuts', 'Keyboard shortcuts', ['?'], () => OC.ui.shortcuts(), { scope: () => true });
  g('newDesign', 'New design', ['mod+alt+shift+n'], () => OC.ui.newDialog(), { scope: () => true }); g('home', 'Home', [], () => OC.app.goHome(), { scope: () => true });
  g('toggleAdvanced', 'Toggle advanced mode', ['mod+alt+a'], () => OC.settings.set('mode', OC.settings.mode === 'advanced' ? 'simple' : 'advanced'), { scope: () => true });
  g('settings', 'Settings', ['mod+,'], () => OC.ui.settings(), { scope: () => true });
  g('resize', 'Resize design', [], () => OC.ui.resizeDialog()); g('present', 'Present', ['mod+alt+p'], () => OC.present && OC.present.start());
  g('timeline', 'Toggle timeline', ['mod+alt+t'], () => OC.ui.toggleTimeline(), { scope: design }); g('playPause', 'Play or pause', ['shift+space'], () => OC.timeline && OC.timeline.toggle(), { scope: design });
  g('threeD', 'Add 3D scene', [], () => OC.threed && OC.threed.add(), { scope: design });
  g('hint', 'Open help', ['f1'], () => OC.ui.help(), { scope: () => true });
})();
