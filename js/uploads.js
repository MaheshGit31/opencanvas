/* Importing files: images, SVG, video, audio, fonts, projects */
(function () {
  const U = OC.U, D = OC.doc, S = OC.S, O = OC.ops;
  const UP = OC.uploads = {};
  const ext = f => (f.name.split('.').pop() || '').toLowerCase();

  UP.importFiles = async function (files, o = {}) {
    let n = 0;
    for (const f of files) {
      const e = ext(f), t = f.type || '';
      try {
        if (['ttf', 'otf', 'woff', 'woff2'].includes(e)) { const name = await OC.fonts.addCustom(f); U.toast('Font added: ' + name); n++; }
        else if (e === 'opencanvas' || (e === 'json' && !t.startsWith('image'))) { await OC.app.openFile(f); }
        else if (e === 'svg' || t === 'image/svg+xml') { const txt = await U.readFile(f, 'text'); await UP.importSVG(txt, { ...o, name: f.name, asset: f }); n++; }
        else if (t.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(e)) { const id = await OC.assets.add(f, f.name); OC.bus.emit('uploads'); if (!S.project || S.project.mode !== 'design' && S.project.mode !== 'whiteboard') continue; UP.place({ kind: 'asset', id, type: 'image', name: f.name }, o); n++; }
        else if (t.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(e)) { const id = await OC.assets.add(f, f.name); OC.bus.emit('uploads'); await UP.placeVideo(id, f.name, o); n++; }
        else if (t.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(e)) { const id = await OC.assets.add(f, f.name); OC.bus.emit('uploads'); await UP.placeAudio(id, f.name, o); n++; }
        else U.toast('Unsupported file: ' + f.name);
      } catch (err) { console.error(err); U.toast('Could not import ' + f.name); }
    }
    return n;
  };
  UP.place = async function (p, o = {}) {
    if (p.type === 'image') {
      const src = 'asset:' + p.id; const t = o.target;
      if (t && t.type === 'image') { t.src = src; t.crop = { x: 0, y: 0, s: 1 }; OC.history.commit('Replace image'); OC.sel.set([t.id]); return; }
      if (t && ['rect', 'ellipse', 'polygon', 'star', 'path', 'frame'].includes(t.type)) { t.fills = [{ type: 'image', src, fit: 'cover', opacity: 1, visible: true }]; OC.history.commit('Fill with image'); OC.sel.set([t.id]); return; }
      return O.addImage(src, p.name, o);
    }
    if (p.type === 'video') return UP.placeVideo(p.id, p.name, o); if (p.type === 'audio') return UP.placeAudio(p.id, p.name, o);
  };
  function meta(url, kind) { return new Promise(res => { const v = document.createElement(kind); v.preload = 'metadata'; v.onloadedmetadata = () => res(v); v.onerror = () => res(null); v.src = url; }); }
  UP.placeVideo = async function (id, name, o = {}) {
    const url = OC.assets.url('asset:' + id); const v = await meta(url, 'video'); if (!v) { U.toast('Video could not be read'); return; }
    const pg = o.page || OC.page(); let w = v.videoWidth, h = v.videoHeight; if (S.project.video && !pg.elements.length) { pg.w = w; pg.h = h; S.project.size = { w, h }; D.layoutPages(); }
    const k = Math.min(1, pg.w * .9 / w, pg.h * .9 / h); const el = D.make('video', { name: name || 'Video', src: 'asset:' + id, w: w * k, h: h * k, srcDur: v.duration });
    el.timing = { start: 0, end: Math.min(v.duration, 600) }; if (v.duration > pg.duration) pg.duration = Math.ceil(v.duration * 10) / 10; O.add(el, o); OC.editor.fit && OC.editor.fit();
  };
  UP.placeAudio = async function (id, name, o = {}) {
    const url = OC.assets.url('asset:' + id); const v = await meta(url, 'audio'); const el = D.make('audio', { name: name || 'Audio', src: 'asset:' + id, srcDur: v ? v.duration : 0 }); el.timing = { start: 0, end: v ? v.duration : null }; O.add(el, o);
  };

  /* SVG import to editable vectors */
  UP.importSVG = async function (text, o = {}) {
    OC.vec.init(); let root; try { root = paper.project.importSVG(text, { expandShapes: true, insert: false }); } catch (e) { root = null; }
    const pg = o.page || OC.page(); const els = [];
    const col = c => (c ? c.toCSS(true) : null);
    const gradFill = c => { const g = c.gradient; const stops = g.stops.map((s, i) => ({ o: s.offset != null ? s.offset : i / (g.stops.length - 1), c: s.color.toCSS(true) })); const ang = c.origin && c.destination ? U.deg(Math.atan2(c.destination.y - c.origin.y, c.destination.x - c.origin.x)) + 90 : 90; return { type: g.radial ? 'radial' : 'linear', angle: ang, stops, opacity: 1, visible: true }; };
    const walk = item => {
      if (item.className === 'Path' || item.className === 'CompoundPath') {
        const c = item.clone({ insert: false }); if (item.parent && item.parent.globalMatrix) c.transform(item.parent.globalMatrix); const info = OC.vec.fromPaper(c); if (!info.subpaths.length) return;
        const fill = item.fillColor ? (item.fillColor.gradient ? gradFill(item.fillColor) : { type: 'solid', color: col(item.fillColor), opacity: 1, visible: true }) : null;
        const el = OC.vec.makePathEl(info.subpaths, info.bounds, { name: item.name || 'Path', fills: fill ? [fill] : [], opacity: item.opacity == null ? 1 : item.opacity, fillRule: info.fillRule || 'nonzero' });
        if (item.strokeColor && item.strokeWidth) el.stroke = { color: col(item.strokeColor), width: item.strokeWidth, align: 'center', cap: item.strokeCap || 'butt', join: item.strokeJoin || 'miter', dash: item.dashArray || [], profile: 'uniform', opacity: 1 };
        if (!fill && !el.stroke) el.fills = [D.solid('#000000')]; els.push(el);
      } else if (item.className === 'PointText') {
        const b = item.bounds; const el = D.make('text', { name: 'Text', x: b.x, y: b.y, w: Math.max(b.width * 1.1, 20), fs: item.fontSize || 16, ff: (item.fontFamily || 'Inter').split(',')[0].replace(/["']/g, '').trim(), runs: [{ t: item.content }], fills: [D.solid(item.fillColor ? col(item.fillColor) : '#000000')] }); els.push(el);
      } else if (item.children) item.children.forEach(walk);
    };
    if (root) walk(root);
    if (!els.length || o.raster) { const url = o.asset ? await OC.assets.add(o.asset, o.name) : await OC.assets.addDataURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text), o.name || 'graphic.svg'); return O.addImage('asset:' + url, o.name || 'SVG', o); }
    const b = D.boundsOf(els); els.forEach(e => { e.x -= b.x; e.y -= b.y; });
    const g = D.make('group', { name: (o.name || 'SVG').replace(/\.svg$/i, ''), x: 0, y: 0, w: b.w, h: b.h, children: els }); return O.add(g, o);
  };
  UP.listAssets = type => Object.values(OC.assets.map).filter(a => !type || a.mime.startsWith(type));
})();
