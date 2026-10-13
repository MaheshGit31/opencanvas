/* Viewport, painting, selection, move, resize, rotate */
(function () {
  const U = OC.U, D = OC.doc, S = OC.S, R = OC.render, h = U.h;
  const E = OC.editor = { tools: {}, guides: [], hover: null, marquee: null, drag: null, space: false };
  let stage, scene, over, sctx, octx, heads, W = 0, H = 0, dpr = 1, canvasColor = '#14141c';

  /* ---------- setup ---------- */
  E.init = function (host) {
    stage = E.stage = h('div.stage'); scene = h('canvas.cv-scene'); over = h('canvas.cv-over', { tabindex: 0 }); heads = h('div.page-heads'); E.textHost = h('div.text-host');
    stage.append(scene, heads, over, E.textHost); host.append(stage);
    sctx = scene.getContext('2d'); octx = over.getContext('2d');
    new ResizeObserver(resize).observe(stage); resize();
    over.addEventListener('pointerdown', onDown); over.addEventListener('pointermove', onMove); over.addEventListener('pointerup', onUp); over.addEventListener('pointercancel', onUp);
    over.addEventListener('dblclick', onDbl); over.addEventListener('contextmenu', onCtx); stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dragover', e => { e.preventDefault(); }); stage.addEventListener('drop', onDrop);
    window.addEventListener('keydown', e => { if (e.key === ' ' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.isContentEditable) { E.space = true; over.style.cursor = 'grab'; e.preventDefault(); } });
    window.addEventListener('keyup', e => { if (e.key === ' ') { E.space = false; over.style.cursor = ''; } });
    window.addEventListener('paste', onPaste);
    R.onPaint = paint;
    ['selection', 'changed', 'restored', 'page-changed', 'comments'].forEach(ev => OC.bus.on(ev, () => { if (ev !== 'selection') buildHeads(); R.invalidate(); }));
    OC.bus.on('settings', () => { cacheColors(); R.invalidate(); });
    cacheColors();
  };
  function cacheColors() { setTimeout(() => { const c = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(); if (c) canvasColor = c; R.invalidate(); }, 30); }
  E.cacheColors = cacheColors;
  function resize() {
    const r = stage.getBoundingClientRect(); const ow = W, oh = H; W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = window.devicePixelRatio || 1; if (ow > 8 && oh > 8 && S.project && !S.home && (ow !== W || oh !== H)) { S.panX += (W - ow) / 2; S.panY += (H - oh) / 2; }
    [scene, over].forEach(c => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }); if (S.project && !S.home && R.onPaint) { try { R.onPaint(); } catch (e) { R.invalidate(); } } else R.invalidate();
  }
  E.stageRect = () => ({ w: W, h: H });
  E.screenToWorld = (sx, sy) => ({ x: (sx - S.panX) / S.zoom, y: (sy - S.panY) / S.zoom });
  E.worldToScreen = (x, y) => ({ x: x * S.zoom + S.panX, y: y * S.zoom + S.panY });
  E.timeArg = () => (S.timelineOpen || S.playing ? S.time : undefined);
  E.geo = el => (S.timelineOpen ? R.resolve(el, S.time) : el);
  E.pgToScreen = (pg, x, y) => E.worldToScreen(pg._x + x, pg._y + y);

  /* view changes glide instead of jumping */
  const RM = () => OC.settings.reduceMotion || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let glideRaf = 0;
  const ease = t => 1 - Math.pow(1 - t, 3);
  function viewTo(z, px, py, anim) {
    cancelAnimationFrame(glideRaf); glideRaf = 0;
    if (!anim || RM() || Math.abs(z - S.zoom) + Math.abs(px - S.panX) + Math.abs(py - S.panY) < .5) { S.zoom = z; S.panX = px; S.panY = py; OC.bus.emit('zoom'); R.invalidate(); trackPage(); return; }
    const z0 = S.zoom, x0 = S.panX, y0 = S.panY, t0 = performance.now(), dur = 260;
    // interpolate zoom in log space so it feels even
    const lz0 = Math.log(z0), lz1 = Math.log(z);
    const step = now => { const t = Math.min(1, (now - t0) / dur), k = ease(t); S.zoom = Math.exp(lz0 + (lz1 - lz0) * k); S.panX = x0 + (px - x0) * k; S.panY = y0 + (py - y0) * k; OC.bus.emit('zoom'); R.invalidate(); if (t < 1) glideRaf = requestAnimationFrame(step); else { glideRaf = 0; trackPage(); } };
    glideRaf = requestAnimationFrame(step);
  }
  E.stopGlide = () => { cancelAnimationFrame(glideRaf); glideRaf = 0; };
  E.setZoom = function (z, cx, cy, anim) {
    z = U.clamp(z, .02, 40); if (cx == null) { cx = W / 2; cy = H / 2; } const w = E.screenToWorld(cx, cy);
    viewTo(z, cx - w.x * z, cy - w.y * z, anim);
  };
  /* wheel zoom eases toward a target so trackpad and mouse steps feel smooth */
  let zt = 0, zax = 0, zay = 0, zRaf = 0;
  E.smoothZoom = function (k, cx, cy) {
    cancelAnimationFrame(glideRaf); glideRaf = 0;
    if (!zRaf) zt = S.zoom; zt = U.clamp(zt * k, .02, 40); zax = cx; zay = cy;
    if (RM()) { zRaf = 0; return E.setZoom(zt, cx, cy); }
    if (zRaf) return;
    const tick = () => {
      const d = zt - S.zoom; if (Math.abs(Math.log(zt / S.zoom)) < .002) { E.setZoom(zt, zax, zay); zRaf = 0; return; }
      E.setZoom(S.zoom * Math.pow(zt / S.zoom, .32), zax, zay); zRaf = requestAnimationFrame(tick);
    };
    zRaf = requestAnimationFrame(tick);
  };
  E.fit = function (pgIdx, anim) {
    resize(); D.layoutPages(); const pgs = S.project.pages.filter(p => !p.infinite); let b;
    if (!pgs.length) return viewTo(1, W / 2, H / 2, anim);
    const pg = pgIdx != null ? S.project.pages[pgIdx] : OC.page(); b = pg && !pg.infinite ? { x: pg._x, y: pg._y, w: pg.w, h: pg.h } : { x: 0, y: 0, w: pgs[0].w, h: pgs[0].h };
    const padX = 70, top = 64, bottom = 112; const z = Math.max(Math.min((W - padX * 2) / b.w, (H - top - bottom) / b.h, 4), .02);
    viewTo(z, (W - b.w * z) / 2 - b.x * z, top + (H - top - bottom - b.h * z) / 2 - b.y * z, anim);
  };
  E.fitSelection = function () { const els = OC.sel.els(); if (!els.length) return E.fit(undefined, true); const pg = OC.sel.page(); const b = D.boundsOf(els.map(e => ({ x: D.toPage(e.id, e.w / 2, e.h / 2).x - e.w / 2, y: D.toPage(e.id, e.w / 2, e.h / 2).y - e.h / 2, w: e.w, h: e.h, rot: e.rot }))); const pad = 120; const z = Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h, 8); viewTo(z, W / 2 - (pg._x + b.x + b.w / 2) * z, H / 2 - (pg._y + b.y + b.h / 2) * z, true); };
  E.focusPage = function (i) {
    const pg = S.project.pages[i]; if (!pg) return; S.pageIdx = i; D.layoutPages();
    if (pg.infinite) { S.panX = W / 2; S.panY = H / 2; } else { const cx = pg._x + pg.w / 2, cy = pg._y + pg.h / 2; S.panX = W / 2 - cx * S.zoom; S.panY = H / 2 - cy * S.zoom; if (pg.h * S.zoom > H || pg.w * S.zoom > W) return E.fit(i); }
    OC.bus.emit('page-changed'); R.invalidate();
  };
  const trackPage = U.debounce(() => {
    if (S.drag || !S.project || S.timelineOpen) return; const c = E.screenToWorld(W / 2, H / 2); let best = 0, bd = 1e18;
    S.project.pages.forEach((pg, i) => { if (pg.infinite) return; const dx = Math.max(pg._x - c.x, 0, c.x - (pg._x + pg.w)), dy = Math.max(pg._y - c.y, 0, c.y - (pg._y + pg.h)); const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } });
    if (best !== S.pageIdx && !S.sel.length) { S.pageIdx = best; OC.bus.emit('page-changed'); }
  }, 120);

  /* ---------- geometry helpers ---------- */
  E.worldRot = el => { let r = el.rot || 0; D.ancestors(el.id).forEach(a => { r += a.rot || 0; }); return r; };
  E.boxOf = function (el) {
    const g = E.geo(el); const f = D.find(el.id); const c = D.toPage(el.id, el.w / 2, el.h / 2); const rot = E.worldRot(el);
    if (g !== el) { const dx = (g.x + g.w / 2) - (el.x + el.w / 2), dy = (g.y + g.h / 2) - (el.y + el.h / 2); return { cx: c.x + dx, cy: c.y + dy, w: g.w, h: g.h, rot: rot - (el.rot || 0) + (g.rot || 0), page: f.page }; }
    return { cx: c.x, cy: c.y, w: el.w, h: el.h, rot, page: f.page };
  };
  const cornersOfBox = b => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(k => U.rotPt(b.cx + k[0] * b.w / 2, b.cy + k[1] * b.h / 2, b.cx, b.cy, U.rad(b.rot)));
  E.selBox = function () {
    const els = OC.sel.els().filter(e => D.find(e.id)); if (!els.length) return null; const pg = D.find(els[0].id).page;
    if (els.length === 1) { const b = E.boxOf(els[0]); return { ...b, page: pg, single: els[0] }; }
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    els.forEach(e => cornersOfBox(E.boxOf(e)).forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }));
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, rot: 0, page: pg, multi: true };
  };
  const HANDLES = [[-1, -1, 'nw'], [0, -1, 'n'], [1, -1, 'ne'], [1, 0, 'e'], [1, 1, 'se'], [0, 1, 's'], [-1, 1, 'sw'], [-1, 0, 'w']];
  function handlePos(b, hx, hy) { return U.rotPt(b.cx + hx * b.w / 2, b.cy + hy * b.h / 2, b.cx, b.cy, U.rad(b.rot)); }
  function rotHandlePos(b) { const off = 30 / S.zoom; return U.rotPt(b.cx, b.cy - b.h / 2 - off, b.cx, b.cy, U.rad(b.rot)); }
  E.toParentSpace = function (el, px, py) { const f = D.find(el.id); return f.parentEl ? D.toLocal(f.parentEl.id, px, py) : { x: px, y: py }; };
  E.setGeom = function (el, props) {
    for (const k in props) {
      const keys = el.anim && el.anim[k];
      if (S.timelineOpen && (keys && keys.length || (S.autoKey && ['x', 'y', 'w', 'h', 'rot', 'opacity'].includes(k)))) { OC.timeline && OC.timeline.setKey(el, k, props[k]); } else el[k] = props[k];
    }
  };
  E.rebox = function (el, nx0, ny0, nw, nh) {
    let dx = nx0 + nw / 2 - el.w / 2, dy = ny0 + nh / 2 - el.h / 2; if (el.flipX) dx = -dx; if (el.flipY) dy = -dy; const dp = U.rotPt(dx, dy, 0, 0, U.rad(el.rot || 0));
    const cx = el.x + el.w / 2 + dp.x, cy = el.y + el.h / 2 + dp.y; el.w = nw; el.h = nh; el.x = cx - nw / 2; el.y = cy - nh / 2;
  };
  E.fitPath = function (el) {
    OC.vec.init(); const tmp = { ...el, w: el.vw, h: el.vh }; const item = OC.vec.toPaper(tmp); const b = item.bounds; item.remove(); if (!b || (b.width < .001 && b.height < .001)) return;
    const sx = el.w / el.vw, sy = el.h / el.vh; el.subpaths.forEach(sp => sp.nodes.forEach(n => { n.x -= b.x; n.y -= b.y; })); const nw = Math.max(b.width, .01), nh = Math.max(b.height, .01);
    E.rebox(el, b.x * sx, b.y * sy, nw * sx, nh * sy); el.vw = nw; el.vh = nh; el.subpaths = el.subpaths.slice();
  };

  /* ---------- hit testing ---------- */
  function toChild(g, x, y) { const p = U.rotPt(x, y, g.x + g.w / 2, g.y + g.h / 2, -U.rad(g.rot || 0)); let lx = p.x - g.x, ly = p.y - g.y; if (g.flipX) lx = g.w - lx; if (g.flipY) ly = g.h - ly; return { x: lx, y: ly }; }
  function deepHit(list, x, y, tol, chain, opts) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]; if (e.visible === false || (e.locked && !opts.locked)) continue;
      const g = E.geo(e); const p = toChild(g, x, y);
      if (e.children) {
        const r = deepHit(e.children, p.x, p.y, tol, chain.concat(e), opts); if (r) return r;
        if (e.type === 'frame' && e.fills && e.fills.length && p.x >= 0 && p.y >= 0 && p.x <= g.w && p.y <= g.h) return { el: e, chain };
        continue;
      }
      if (e.type === 'text') { if (p.x >= -tol && p.y >= -tol && p.x <= g.w + tol && p.y <= g.h + tol) return { el: e, chain }; continue; }
      if (OC.vec.hit(g, p.x, p.y, tol)) return { el: e, chain };
    }
    return null;
  }
  E.hitAt = function (pg, px, py, deep, includeLocked) {
    if (pg.locked && !includeLocked) return null;
    const r = deepHit(pg.elements, px, py, 4 / S.zoom, [], { locked: includeLocked }); if (!r) return null;
    if (deep) return r.el;
    /* climb to child of the entered container, or to top level */
    const chain = r.chain.concat(r.el); let idx = 0;
    if (S.enter) { const k = chain.findIndex(c => c.id === S.enter); if (k >= 0 && k + 1 < chain.length) idx = k + 1; else if (k >= 0) idx = chain.length - 1; }
    return chain[idx];
  };
  E.pageAt = function (wx, wy) {
    for (const pg of S.project.pages) { if (pg.infinite) continue; if (wx >= pg._x && wy >= pg._y && wx <= pg._x + pg.w && wy <= pg._y + pg.h) return pg; }
    const inf = S.project.pages.find(p => p.infinite); if (inf) return inf; return null;
  };
  E.frameAt = function (pg, px, py, exclude) {
    let best = null; const walk = (list, x, y) => list.forEach(e => { if (exclude.includes(e) || e.visible === false || e.locked || !e.children) return; const p = toChild(e, x, y); if (p.x >= 0 && p.y >= 0 && p.x <= e.w && p.y <= e.h) { if (e.type === 'frame') best = e; walk(e.children, p.x, p.y); } });
    walk(pg.elements, px, py); return best;
  };

  /* ---------- pointer ---------- */
  const pts = new Map(); let pinch = null;
  function info(e) {
    const r = stage.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; const w = E.screenToWorld(sx, sy);
    let pg = (S.drag && S.drag.pg) || E.pageAt(w.x, w.y) || OC.page(); return { sx, sy, wx: w.x, wy: w.y, pg, px: w.x - pg._x, py: w.y - pg._y, e, shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey };
  }
  E.info = info;
  function onDown(e) {
    E.stopGlide();
    over.focus({ preventScroll: true }); over.setPointerCapture(e.pointerId); if (S.editing) E.endEdit(); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && e.pointerType === 'touch') { S.drag = null; const a = [...pts.values()]; pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), z: S.zoom, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2, px: S.panX, py: S.panY }; return; }
    const p = info(e); closeMenus();
    if (e.button === 1 || E.space || S.tool === 'hand') { S.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, px: S.panX, py: S.panY }; over.style.cursor = 'grabbing'; return; }
    if (e.button === 2) return;
    if (p.pg !== OC.page() && !S.drag && !p.pg.infinite) { S.pageIdx = S.project.pages.indexOf(p.pg); OC.bus.emit('page-changed'); }
    if (S.photoTool && OC.photo && OC.photo.pointer('down', p)) { S.drag = { type: 'ext', pg: p.pg }; over.setPointerCapture(e.pointerId); return; }
    if (OC.threed && OC.threed.active && OC.threed.pointer('down', p)) { S.drag = { type: 'ext', pg: p.pg }; over.setPointerCapture(e.pointerId); return; }
    const tool = E.tools[S.tool]; if (tool && S.tool !== 'select') { if (tool.down) tool.down(p); return; }
    selectDown(p);
  }
  function onMove(e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) { const a = [...pts.values()]; const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); const cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2; const r = stage.getBoundingClientRect(); const z = U.clamp(pinch.z * d / pinch.d, .02, 40); const w = { x: (pinch.cx - r.left - pinch.px) / pinch.z, y: (pinch.cy - r.top - pinch.py) / pinch.z }; S.zoom = z; S.panX = cx - r.left - w.x * z; S.panY = cy - r.top - w.y * z; R.invalidate(); return; }
    const p = info(e); E.lastPt = p;
    if (S.drag) {
      const d = S.drag;
      if (d.type === 'pan') { S.panX = d.px + e.clientX - d.sx; S.panY = d.py + e.clientY - d.sy; R.invalidate(); trackPage(); return; }
      if (d.tool) { d.tool.move && d.tool.move(p); return; }
      if (S.photoTool && OC.photo && OC.photo.pointer('move', p)) return;
      if (OC.threed && OC.threed.drag && OC.threed.pointer('move', p)) return;
      if (d.type === 'ext') return;
      dragMove(p); return;
    }
    if (S.photoTool && OC.photo && OC.photo.pointer('hover', p)) return;
    const tool = E.tools[S.tool]; if (tool && tool.hover && S.tool !== 'select') { tool.hover(p); return; }
    if (S.tool === 'select') hover(p);
  }
  function onUp(e) {
    pts.delete(e.pointerId); if (pinch) { if (pts.size < 2) pinch = null; return; }
    const p = info(e); const d = S.drag; if (!d) return; over.releasePointerCapture && over.hasPointerCapture(e.pointerId) && over.releasePointerCapture(e.pointerId);
    if (d.type === 'pan') { S.drag = null; over.style.cursor = E.space ? 'grab' : ''; return; }
    if (d.tool) { d.tool.up && d.tool.up(p); S.drag = null; R.invalidate(); return; }
    if (S.photoTool && OC.photo && OC.photo.pointer('up', p)) { S.drag = null; return; }
    if (OC.threed && OC.threed.drag && OC.threed.pointer('up', p)) { S.drag = null; return; }
    dragUp(p); S.drag = null; E.guides = []; R.invalidate();
  }
  function onWheel(e) {
    e.preventDefault(); const r = stage.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (OC.threed && OC.threed.active) { const q = info(e); const el = OC.doc.get(OC.threed.active); const lp = el && OC.doc.toLocal(el.id, q.px, q.py); if (lp && lp.x >= 0 && lp.y >= 0 && lp.x <= el.w && lp.y <= el.h) { e.preventDefault(); OC.threed.pointer('wheel', { dy: e.deltaY }); return; } }
    if (e.ctrlKey || e.metaKey || OC.settings.wheel === 'zoom') { const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY, notch = Math.abs(dy) >= 50 && Number.isInteger(dy); const k = U.clamp(notch ? Math.exp(-Math.sign(dy) * Math.min(Math.abs(dy), 240) / 100 * .16) : Math.exp(-dy * (e.ctrlKey ? .01 : .0025)), .6, 1.7); if (S.cropEl) { cropWheel(k); return; } E.smoothZoom(k, sx, sy); }
    else { S.panX -= e.shiftKey ? e.deltaY : e.deltaX; S.panY -= e.shiftKey ? 0 : e.deltaY; R.invalidate(); trackPage(); }
  }
  function cropWheel(k) { const el = D.get(S.cropEl); if (!el) return; el.crop.s = U.clamp(el.crop.s * k, .2, 12); R.invalidate(); }
  function closeMenus() { OC.ui && OC.ui.closeMenus && OC.ui.closeMenus(); }

  /* ---------- select tool ---------- */
  function hitHandle(p, b) {
    const r = 9 / S.zoom; const sel = OC.sel.els();
    if (sel.length === 1 && sel[0].type === 'line') { const e = sel[0]; const s = D.toPage(e.id, 0, 0), t = D.toPage(e.id, e.w, 0); if (Math.hypot(p.px - s.x, p.py - s.y) < r) return { kind: 'line', end: 'start' }; if (Math.hypot(p.px - t.x, p.py - t.y) < r) return { kind: 'line', end: 'end' }; return null; }
    const rp = rotHandlePos(b); if (Math.hypot(p.px - rp.x, p.py - rp.y) < r * 1.1) return { kind: 'rotate' };
    const lone = OC.sel.els(); const textOnly = lone.length === 1 && lone[0].type === 'text'; for (const [hx, hy, n] of HANDLES) { if (textOnly && hx === 0) continue; const q = handlePos(b, hx, hy); if (Math.hypot(p.px - q.x, p.py - q.y) < r) return { kind: 'resize', hx, hy, n }; }
    return null;
  }
  function selectDown(p) {
    const e = p.e; const pg = p.pg;
    if (S.nodeEdit && E.nodeDown && E.nodeDown(p)) return;
    if (S.cropEl) { const el = D.get(S.cropEl); if (el) { const hh = E.cropDown(p); if (hh) return; } }
    const b = E.selBox(); const sels = OC.sel.els();
    if (b && b.page === pg && !sels.some(x => D.isLocked(x.id))) {
      const hd = hitHandle(p, b);
      if (hd) { startTransform(hd, p, b); return; }
    }
    const hit = E.hitAt(pg, p.px, p.py, p.mod, false);
    if (hit) {
      if (e.shiftKey) { OC.sel.toggle(hit.id); if (!OC.sel.has(hit.id)) return; }
      else if (!OC.sel.has(hit.id)) OC.sel.set([hit.id]);
      if (OC.sel.has(hit.id) && !pg.locked) startMove(p, e.altKey);
    } else {
      if (!e.shiftKey) OC.sel.clear(); S.drag = { type: 'marquee', pg, x0: p.px, y0: p.py, add: e.shiftKey, base: OC.sel.ids() }; E.marquee = { x0: p.px, y0: p.py, x1: p.px, y1: p.py, pg };
      if (S.enter && !hit) { S.enter = null; }
    }
  }
  function startMove(p, dup) {
    let els = OC.sel.els().filter(e => !e.locked && !e.lockPos); if (!els.length) return;
    S.drag = { type: 'move', pg: p.pg, x0: p.px, y0: p.py, moved: false, dup, items: null, els };
  }
  function beginMoveItems(d) {
    if (d.dup) { const clones = OC.ops.cloneEls(OC.ops.ordered(d.els)); d.els.forEach((e, i) => { }); const f0 = D.find(d.els[0].id); clones.forEach(c => f0.list.push(c)); D.reindex(); OC.sel.set(clones.map(c => c.id)); d.els = clones; }
    d.items = d.els.map(e => { const g = E.geo(e); return { e, x: g.x, y: g.y, rot: E.worldRot(e) - (e.rot || 0) }; });
    const b = D.boundsOf(d.els.map(e => { const c = D.toPage(e.id, e.w / 2, e.h / 2); return { x: c.x - e.w / 2, y: c.y - e.h / 2, w: e.w, h: e.h, rot: E.worldRot(e) }; })); d.box = b;
    d.others = []; const sels = d.els; d.pg.elements.forEach(o => { if (!sels.includes(o) && o.visible !== false && !sels.some(s => D.ancestors(s.id).includes(o))) d.others.push(D.boundsOf([E.geo(o)])); });
  }
  function startTransform(hd, p, b) {
    const els = OC.sel.els(); const d = S.drag = { type: hd.kind, pg: p.pg, hd, b, p0: p, items: els.map(e => ({ e, g: U.clone(pickGeo(e)), box: E.boxOf(e) })) };
    if (hd.kind === 'rotate') d.a0 = Math.atan2(p.py - b.cy, p.px - b.cx) - U.rad(b.rot);
  }
  function pickGeo(e) { const g = E.geo(e); const o = { x: g.x, y: g.y, w: g.w, h: g.h, rot: g.rot || 0, fs: e.fs, children: null }; if (e.children) o.children = U.clone(e.children); if (e.crop) o.crop = U.clone(e.crop); if (e.type === 'text') { o.runs = U.clone(e.runs); } return o; }

  function snapBox(d, box, exclude) {
    const thr = 6 / S.zoom; const pg = d.pg; const gl = []; let dx = 0, dy = 0;
    const xs = [box.x, box.x + box.w / 2, box.x + box.w], ys = [box.y, box.y + box.h / 2, box.y + box.h]; let tx = [], ty = [];
    if (!pg.infinite) { tx.push(0, pg.w / 2, pg.w); ty.push(0, pg.h / 2, pg.h); }
    (d.others || []).forEach(o => { tx.push(o.x, o.x + o.w / 2, o.x + o.w); ty.push(o.y, o.y + o.h / 2, o.y + o.h); });
    (pg.guides || []).forEach(g => { if (g.axis === 'x') tx.push(g.pos); else ty.push(g.pos); });
    let bx = thr, by = thr, sxl = null, syl = null;
    xs.forEach(v => tx.forEach(t => { const dd = t - v; if (Math.abs(dd) < Math.abs(bx)) { bx = dd; sxl = t; } })); ys.forEach(v => ty.forEach(t => { const dd = t - v; if (Math.abs(dd) < Math.abs(by)) { by = dd; syl = t; } }));
    if (sxl != null && Math.abs(bx) < thr) { dx = bx; gl.push({ x1: sxl, y1: -1e5, x2: sxl, y2: 1e5 }); } if (syl != null && Math.abs(by) < thr) { dy = by; gl.push({ x1: -1e5, y1: syl, x2: 1e5, y2: syl }); }
    if (OC.settings.snapGrid && S.project.grid) { const gs = S.project.grid.size || 20; if (!dx) dx = Math.round(box.x / gs) * gs - box.x; if (!dy) dy = Math.round(box.y / gs) * gs - box.y; }
    return { dx, dy, gl };
  }
  function dragMove(p) {
    const d = S.drag; if (!d) return;
    if (d.type === 'marquee') {
      const m = E.marquee; m.x1 = p.px; m.y1 = p.py; const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
      const ids = []; d.pg.elements.forEach(el => { if (el.visible === false || el.locked) return; const b = D.boundsOf([E.geo(el)]); if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) ids.push(el.id); });
      OC.sel.set(d.add ? [...new Set([...d.base, ...ids])] : ids); R.invalidate(); return;
    }
    if (d.type === 'move') {
      let dx = p.px - d.x0, dy = p.py - d.y0; if (!d.moved) { if (Math.hypot(dx, dy) * S.zoom < 3) return; d.moved = true; beginMoveItems(d); }
      if (p.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (OC.settings.snap && !p.mod) { const nb = { x: d.box.x + dx, y: d.box.y + dy, w: d.box.w, h: d.box.h }; const s = snapBox(d, nb); dx += s.dx; dy += s.dy; E.guides = s.gl.map(g => ({ ...g, pg: d.pg })); } else E.guides = [];
      d.items.forEach(it => { const q = U.rotPt(dx, dy, 0, 0, -U.rad(it.rot)); E.setGeom(it.e, { x: it.x + q.x, y: it.y + q.y }); });
      d.last = { dx, dy }; OC.bus.emit('geom'); R.invalidate(); return;
    }
    if (d.type === 'rotate') {
      const a = Math.atan2(p.py - d.b.cy, p.px - d.b.cx) - d.a0; let deg = U.deg(a); if (p.shift) deg = Math.round(deg / 15) * 15; else { const sn = Math.round(deg / 45) * 45; if (Math.abs(deg - sn) < 3) deg = sn; }
      const delta = deg - d.b.rot;
      d.items.forEach(it => {
        if (d.items.length === 1) { E.setGeom(it.e, { rot: ((deg % 360) + 360) % 360 > 180 ? ((deg % 360) + 360) % 360 - 360 : ((deg % 360) + 360) % 360 }); return; }
        const c = it.box; const q = U.rotPt(c.cx, c.cy, d.b.cx, d.b.cy, U.rad(delta)); const par = E.toParentSpace(it.e, q.x, q.y); E.setGeom(it.e, { x: par.x - it.g.w / 2, y: par.y - it.g.h / 2, rot: (it.g.rot + delta) });
      });
      d.deg = deg; OC.bus.emit('geom'); R.invalidate(); return;
    }
    if (d.type === 'line') { lineDrag(d, p); return; }
    if (d.type === 'resize') { resizeDrag(d, p); return; }
    if (d.type === 'crop') { cropDrag(d, p); return; }
    if (d.type === 'node') { E.nodeMove && E.nodeMove(d, p); return; }
  }
  function lineDrag(d, p) {
    const it = d.items[0], e = it.e; const S0 = D.toPage(e.id, 0, 0), T0 = D.toPage(e.id, e.w, 0); const fixed = d.hd.end === 'end' ? S0 : T0; let m = { x: p.px, y: p.py };
    if (p.shift) { const a = Math.atan2(m.y - fixed.y, m.x - fixed.x); const sn = Math.round(a / (Math.PI / 12)) * Math.PI / 12; const L = Math.hypot(m.x - fixed.x, m.y - fixed.y); m = { x: fixed.x + Math.cos(sn) * L, y: fixed.y + Math.sin(sn) * L }; }
    const pf = E.toParentSpace(e, fixed.x, fixed.y), pm = E.toParentSpace(e, m.x, m.y); const A = d.hd.end === 'end' ? pf : pm, B = d.hd.end === 'end' ? pm : pf;
    const len = Math.hypot(B.x - A.x, B.y - A.y), ang = U.deg(Math.atan2(B.y - A.y, B.x - A.x)); const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2;
    const wr = E.worldRot(e) - (e.rot || 0); e.w = Math.max(len, 1); e.rot = ang - wr; e.x = cx - e.w / 2; e.y = cy; OC.bus.emit('geom'); R.invalidate();
  }
  function resizeDrag(d, p) {
    const { hx, hy } = d.hd; const b = d.b; const multi = d.items.length > 1; const th = U.rad(b.rot); const u = { x: Math.cos(th), y: Math.sin(th) }, v = { x: -Math.sin(th), y: Math.cos(th) };
    const alt = p.alt; const prop = hx && hy ? (OC.settings.proportional ? !p.shift : p.shift) : false; const w0 = b.w, h0 = b.h;
    const A = alt ? { x: b.cx, y: b.cy } : { x: b.cx - (u.x * hx * w0 / 2 + v.x * hy * h0 / 2), y: b.cy - (u.y * hx * w0 / 2 + v.y * hy * h0 / 2) };
    const dd = { x: p.px - A.x, y: p.py - A.y }; const lx = dd.x * u.x + dd.y * u.y, ly = dd.x * v.x + dd.y * v.y; const k = alt ? 2 : 1;
    let nw = hx ? Math.max(1, hx * lx * (alt ? 1 : 1) / (alt ? 1 : 1) * 1) : w0, nh = hy ? Math.max(1, hy * ly) : h0; if (alt) { nw = hx ? Math.max(1, hx * lx * 2) : w0; nh = hy ? Math.max(1, hy * ly * 2) : h0; }
    if (prop) { const s = Math.max(nw / w0, nh / h0); nw = w0 * s; nh = h0 * s; }
    nw = Math.max(nw, 2); nh = Math.max(nh, 2);
    const center = alt ? A : { x: A.x + u.x * hx * nw / 2 + v.x * hy * nh / 2, y: A.y + u.y * hx * nw / 2 + v.y * hy * nh / 2 };
    const sx = nw / w0, sy = nh / h0;
    if (!multi) {
      const it = d.items[0], e = it.e; const par = E.toParentSpace(e, center.x, center.y); const upd = { x: par.x - nw / 2, y: par.y - nh / 2, w: nw, h: nh };
      if (e.type === 'text') {
        if (hx && hy) { const s = nw / it.g.w; e.fs = U.round(it.g.fs * s, 1); e.runs = U.clone(it.g.runs); e.runs.forEach(r => { if (r.sz) r.sz = U.round(r.sz * s, 1); }); }
        if (e.autoH) { upd.h = e.h; const lay = OC.text.layout({ ...e, w: nw }); upd.h = lay.h; upd.y = hy === -1 ? it.g.y + it.g.h - lay.h : it.g.y; }
      }
      if (e.children) { e.children = U.clone(it.g.children); e.children.forEach(c => OC.ops.scaleEl(c, sx, sy, Math.min(sx, sy))); }
      if (e.crop && it.g.crop) { e.crop = { x: it.g.crop.x * sx, y: it.g.crop.y * sy, s: it.g.crop.s }; }
      if (e.type === 'path' || e.type === 'star' || e.type === 'polygon' || e.type === 'ellipse') { /* geometry scales via w/h */ }
      if (e.type === 'rect' && e.radius) { }
      E.setGeom(e, upd); if (e.type === 'text' && e.autoH) e.h = upd.h; if (e.type === 'text') OC.text.clear();
    } else {
      d.items.forEach(it => {
        const c = it.box; const rel = { x: c.cx - b.cx, y: c.cy - b.cy }; const q = { x: center.x + rel.x * sx, y: center.y + rel.y * sy }; const par = E.toParentSpace(it.e, q.x, q.y); const e = it.e;
        const s = Math.min(sx, sy); const w = it.g.w * sx, h2 = it.g.h * sy;
        if (e.type === 'text') { e.fs = U.round(it.g.fs * s, 1); e.runs = U.clone(it.g.runs); e.runs.forEach(r => { if (r.sz) r.sz = U.round(r.sz * s, 1); }); e.w = it.g.w * sx; OC.text.clear(); e.x = par.x - e.w / 2; e.y = par.y - e.h / 2; return; }
        if (e.children) { e.children = U.clone(it.g.children); e.children.forEach(cc => OC.ops.scaleEl(cc, sx, sy, s)); }
        E.setGeom(e, { x: par.x - w / 2, y: par.y - h2 / 2, w, h: h2 });
      });
    }
    d.dims = { w: nw, h: nh }; OC.bus.emit('geom'); R.invalidate();
  }
  function dragUp(p) {
    const d = S.drag; if (!d) return;
    if (d.type === 'marquee') { E.marquee = null; return; }
    if (d.type === 'move' && d.moved) {
      /* reparent into frame or other page */
      const els = d.els; const tpg = E.pageAt(p.wx, p.wy) || d.pg; const target = E.frameAt(tpg, p.wx - tpg._x, p.wy - tpg._y, els);
      els.forEach(e => { const f = D.find(e.id); if (!f) return; const curParent = f.parentEl; const wantParent = target && !D.ancestors(target.id).includes(e) && target !== e ? target : null; if (tpg !== f.page || curParent !== wantParent) { if (target && target === e) return; OC.ops.reparent(e, wantParent, tpg); } });
      if (tpg !== d.pg) { S.pageIdx = S.project.pages.indexOf(tpg); OC.bus.emit('page-changed'); }
      OC.history.commit(d.dup ? 'Duplicate' : 'Move'); return;
    }
    if (d.type === 'move') return;
    if (d.type === 'node') { const ne = D.get(S.nodeEdit); if (ne) E.fitPath(ne); }
    if (d.type === 'resize' || d.type === 'rotate' || d.type === 'line' || d.type === 'crop' || d.type === 'node') { OC.history.commit(d.type === 'resize' ? 'Resize' : d.type === 'rotate' ? 'Rotate' : d.type === 'node' ? 'Edit path' : 'Edit'); }
  }
  /* hover and cursor */
  const TOOL_CUR = { text: 'text', hand: 'grab', comment: 'crosshair' };
  function hover(p) {
    if (S.tool && S.tool !== 'select' && !S.drag) { over.style.cursor = E.space ? 'grab' : (TOOL_CUR[S.tool] || 'crosshair'); return; }
    const b = E.selBox(); let cur = '';
    if (S.cropEl) cur = 'move';
    if (!cur && b && b.page === p.pg && !OC.sel.els().some(x => D.isLocked(x.id))) { const hd = hitHandle(p, b); if (hd) { if (hd.kind === 'rotate') cur = 'grab'; else if (hd.kind === 'line') cur = 'crosshair'; else { const ang = (Math.atan2(hd.hy, hd.hx) * 180 / Math.PI + b.rot + 360 * 4) % 180; cur = ang < 22.5 || ang >= 157.5 ? 'ew-resize' : ang < 67.5 ? 'nwse-resize' : ang < 112.5 ? 'ns-resize' : 'nesw-resize'; } } }
    const hit = !cur && !S.nodeEdit ? E.hitAt(p.pg, p.px, p.py, p.mod, false) : null; const id = hit ? hit.id : null; if (!cur && hit) cur = 'move'; if (S.nodeEdit && E.nodeHover) cur = E.nodeHover(p) || '';
    over.style.cursor = E.space ? 'grab' : cur; if (id !== E.hover) { E.hover = id; paintOverlay(); }
  }

  /* ---------- dbl click, context menu ---------- */
  function onDbl(e) {
    const p = info(e); if (S.tool !== 'select' && S.tool !== 'pen') return; if (S.tool === 'pen') { E.tools.pen.dbl && E.tools.pen.dbl(p); return; }
    if (S.nodeEdit && E.nodeDbl && E.nodeDbl(p)) return;
    const hit = E.hitAt(p.pg, p.px, p.py, true, false); if (!hit) return; const el = hit;
    if (el.type === 'text') { OC.sel.set([el.id]); E.editText(el); return; }
    const top = E.hitAt(p.pg, p.px, p.py, false, false);
    if (top && top.children && top !== el) { S.enter = top.id; OC.sel.set([el.id]); OC.bus.emit('selection'); return; }
    if (el.type === 'image' || el.type === 'video') { OC.sel.set([el.id]); S.cropEl = el.id; if (el.type === 'image' && S.project) OC.bus.emit('crop'); R.invalidate(); return; }
    if (el.type === 'path') { OC.sel.set([el.id]); S.nodeEdit = el.id; E.nodeSel = new Set(); R.invalidate(); return; }
    if (el.type === 'scene3d') { OC.sel.set([el.id]); OC.threed && OC.threed.edit(el); return; }
    if (['rect', 'ellipse', 'polygon', 'star'].includes(el.type) && OC.ops) { OC.sel.set([el.id]); E.shapeText(el); }
  }
  /* double click a shape to type inside it: wraps a text element on top */
  E.shapeText = function (el) {
    const f = D.find(el.id); const t = D.make('text', { name: 'Label', x: el.x + 8, y: el.y, w: Math.max(40, el.w - 16), h: 60, fs: Math.max(14, Math.min(48, el.h / 4)), align: 'center', ff: S.project.brand.fonts.body, runs: [{ t: 'Text' }], fills: [D.solid(U.lum(el.fills && el.fills[0] && el.fills[0].color || '#000') > .55 ? '#1c1c28' : '#ffffff')] });
    f.list.splice(f.list.indexOf(el) + 1, 0, t); D.reindex(); OC.sel.set([t.id]); t.y = el.y + el.h / 2 - t.fs * t.lh / 2; OC.history.commit('Add label'); E.editText(t, { selectAll: true });
  };
  function onCtx(e) {
    e.preventDefault(); const p = info(e); const hit = E.hitAt(p.pg, p.px, p.py, p.mod, false);
    if (hit && !OC.sel.has(hit.id)) OC.sel.set([hit.id]); if (!hit && !S.sel.length) { }
    if (p.pg !== OC.page() && !p.pg.infinite) { S.pageIdx = S.project.pages.indexOf(p.pg); OC.bus.emit('page-changed'); }
    OC.ui.contextMenu(e.clientX, e.clientY, hit ? 'element' : 'page', p);
  }

  /* ---------- paste and drop ---------- */
  async function onPaste(e) {
    if (e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName)) return; if (S.home || !S.project || S.project.mode !== 'design' && S.project.mode !== 'whiteboard') return;
    const items = Array.from(e.clipboardData.items || []); const files = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); OC.uploads.importFiles(files, {}); return; }
    const txt = e.clipboardData.getData('text/plain');
    if (txt && !txt.startsWith('opencanvas:')) { e.preventDefault(); if (/^\s*<svg[\s\S]*<\/svg>\s*$/i.test(txt)) { OC.uploads.importSVG(txt); return; } if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(txt.trim())) { OC.ops.addImage(txt.trim(), 'Image'); return; } const t = OC.ops.addText('body', txt.slice(0, 2000)); return; }
    e.preventDefault(); OC.ops.paste();
  }
  function onDrop(e) {
    e.preventDefault(); const files = Array.from(e.dataTransfer.files || []); const r = stage.getBoundingClientRect(); const w = E.screenToWorld(e.clientX - r.left, e.clientY - r.top); const pg = E.pageAt(w.x, w.y) || OC.page();
    const at = { x: w.x - pg._x, y: w.y - pg._y };
    if (files.length) { OC.uploads.importFiles(files, { at, page: pg, target: E.hitAt(pg, at.x, at.y, false, false) }); return; }
    const data = e.dataTransfer.getData('application/x-opencanvas'); if (data) { try { OC.ui.dropPayload(JSON.parse(data), at, pg, E.hitAt(pg, at.x, at.y, false, false)); } catch (err) { console.error(err); } }
  }

  /* ---------- painting ---------- */
  function paint() {
    if (!S.project || !sctx || S.home) return;
    D.layoutPages(); const z = S.zoom * dpr; sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.fillStyle = canvasColor; sctx.fillRect(0, 0, scene.width, scene.height);
    const view = { x0: -S.panX / S.zoom, y0: -S.panY / S.zoom, x1: (W - S.panX) / S.zoom, y1: (H - S.panY) / S.zoom };
    const hide = S.editing ? new Set([S.editing]) : null; const tNow = E.timeArg();
    S.project.pages.forEach((pg, i) => {
      if (!pg.infinite && (pg._x > view.x1 || pg._x + pg.w < view.x0 || pg._y > view.y1 || pg._y + pg.h < view.y0)) return;
      sctx.save(); sctx.setTransform(z, 0, 0, z, (S.panX + pg._x * S.zoom) * dpr, (S.panY + pg._y * S.zoom) * dpr); sctx.imageSmoothingQuality = 'high';
      if (pg.infinite) {
        sctx.setTransform(z, 0, 0, z, (S.panX) * dpr, (S.panY) * dpr); const bg = pg.bg.color || '#f6f6f9'; sctx.fillStyle = bg; sctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
        const gs = 40; if (S.zoom > .25) { sctx.fillStyle = U.lum(bg) > .5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.2)'; for (let x = Math.floor(view.x0 / gs) * gs; x < view.x1; x += gs) for (let y = Math.floor(view.y0 / gs) * gs; y < view.y1; y += gs) sctx.fillRect(x - 1, y - 1, 2, 2); }
        sctx.translate(pg._x, pg._y); R.drawElements(sctx, pg.elements, { scale: z, hide, page: pg, t: i === S.pageIdx ? tNow : undefined, live: S.live });
      } else {
        sctx.save(); sctx.shadowColor = 'rgba(0,0,0,.28)'; sctx.shadowBlur = 22 * dpr; sctx.shadowOffsetY = 5 * dpr; sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, pg.w, pg.h); sctx.restore();
        if (pg.bg.type === 'transparent' || OC.settings.checker && pg.bg.type === 'transparent') checker(sctx, pg.w, pg.h);
        R.drawPage(sctx, pg, { scale: z, hide, t: i === S.pageIdx ? tNow : undefined, live: S.live });
      }
      sctx.restore();
    });
    updateHeads(); paintOverlay(); E.positionEditor && E.positionEditor();
  }
  function checker(ctx, w, h) { const s = 16; for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { ctx.fillStyle = ((x + y) / s) % 2 ? '#ddd' : '#fff'; ctx.fillRect(x, y, Math.min(s, w - x), Math.min(s, h - y)); } }
  E.paint = paint;

  function paintOverlay() {
    if (!octx || !S.project || S.home) return; octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2563eb';
    const toS = (pg, x, y) => E.pgToScreen(pg, x, y);
    const poly = (pg, pts) => { octx.beginPath(); pts.forEach((q, i) => { const s = toS(pg, q.x, q.y); i ? octx.lineTo(s.x, s.y) : octx.moveTo(s.x, s.y); }); octx.closePath(); };
    /* hover */
    if (E.hover && !OC.sel.has(E.hover) && D.get(E.hover)) { const el = D.get(E.hover), pg = D.find(el.id).page; octx.strokeStyle = acc; octx.lineWidth = 1.5; poly(pg, cornersOfBox(E.boxOf(el))); octx.stroke(); }
    /* entered container */
    if (S.enter && D.get(S.enter)) { const el = D.get(S.enter), pg = D.find(el.id).page; octx.setLineDash([5, 4]); octx.strokeStyle = acc; octx.lineWidth = 1; poly(pg, cornersOfBox(E.boxOf(el))); octx.stroke(); octx.setLineDash([]); }
    /* selection */
    const sels = OC.sel.els().filter(e => D.find(e.id));
    if (sels.length) {
      const pg = D.find(sels[0].id).page; const locked = sels.some(e => D.isLocked(e.id));
      octx.lineWidth = 1.5; octx.strokeStyle = acc;
      if (sels.length > 1) { octx.globalAlpha = .6; sels.forEach(e => { poly(pg, cornersOfBox(E.boxOf(e))); octx.stroke(); }); octx.globalAlpha = 1; }
      const b = E.selBox(); const c = cornersOfBox(b); poly(pg, c); octx.stroke();
      if (S.nodeEdit) { E.paintNodes && E.paintNodes(octx, acc, toS); }
      else if (S.cropEl) { E.paintCrop && E.paintCrop(octx, acc, toS); }
      else if (!S.drag || S.drag.type !== 'move' || !S.drag.moved) drawHandles(b, pg, locked, sels, acc, toS);
      /* dimension label */
      const bs = toS(pg, b.cx, b.cy + b.h / 2 + 0); const lab = S.drag && S.drag.type === 'rotate' ? Math.round(S.drag.deg || 0) + '°' : `${Math.round(b.w)} × ${Math.round(b.h)}`;
      if (!S.nodeEdit && !locked) { const ps = U.rotPt(b.cx, b.cy + b.h / 2 + 22 / S.zoom, b.cx, b.cy, U.rad(b.rot)); const s = toS(pg, ps.x, ps.y); octx.font = '600 11px Inter, system-ui, sans-serif'; const tw = octx.measureText(lab).width + 14; octx.fillStyle = acc; octx.beginPath(); octx.roundRect ? octx.roundRect(s.x - tw / 2, s.y - 10, tw, 20, 6) : octx.rect(s.x - tw / 2, s.y - 10, tw, 20); octx.fill(); octx.fillStyle = '#fff'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(lab, s.x, s.y + .5); }
    }
    /* guides */
    octx.strokeStyle = '#ff3d8b'; octx.lineWidth = 1; E.guides.forEach(g => { const pg = g.pg || OC.page(); const a = toS(pg, g.x1, g.y1), b2 = toS(pg, g.x2, g.y2); octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b2.x, b2.y); octx.stroke(); });
    /* marquee */
    if (E.marquee) { const m = E.marquee, a = toS(m.pg, Math.min(m.x0, m.x1), Math.min(m.y0, m.y1)), b2 = toS(m.pg, Math.max(m.x0, m.x1), Math.max(m.y0, m.y1)); octx.fillStyle = 'rgba(37,99,235,.12)'; octx.fillRect(a.x, a.y, b2.x - a.x, b2.y - a.y); octx.strokeStyle = acc; octx.lineWidth = 1; octx.strokeRect(a.x, a.y, b2.x - a.x, b2.y - a.y); }
    /* comment pins */
    paintComments(octx, acc, toS);
    /* tools overlay */
    const tool = E.tools[S.tool]; if (tool && tool.over) tool.over(octx, acc, toS);
    if (S.photoTool && OC.photo && OC.photo.overlay) OC.photo.overlay(octx, acc, toS);
    if (OC.threed && OC.threed.overlay) OC.threed.overlay(octx, acc, toS);
  }
  E.paintOverlay = paintOverlay;
  function drawHandles(b, pg, locked, sels, acc, toS) {
    const sz = 9;
    if (locked) { const p = toS(pg, b.cx, b.cy); octx.fillStyle = acc; octx.beginPath(); octx.arc(p.x, p.y, 13, 0, 7); octx.fill(); octx.fillStyle = '#fff'; octx.strokeStyle = '#fff'; octx.lineWidth = 1.6; octx.lineCap = 'round'; octx.beginPath(); octx.arc(p.x, p.y - 2.5, 3.4, Math.PI, 0); octx.stroke(); octx.beginPath(); octx.roundRect ? octx.roundRect(p.x - 5, p.y - 1.5, 10, 7.5, 1.6) : octx.rect(p.x - 5, p.y - 1.5, 10, 7.5); octx.fill(); return; }
    const sq = (pt, round) => { const s = toS(pg, pt.x, pt.y); octx.fillStyle = '#fff'; octx.strokeStyle = acc; octx.lineWidth = 1.5; octx.beginPath(); if (round) octx.arc(s.x, s.y, sz / 2 + 2, 0, 7); else octx.roundRect ? octx.roundRect(s.x - sz / 2, s.y - sz / 2, sz, sz, 2) : octx.rect(s.x - sz / 2, s.y - sz / 2, sz, sz); octx.fill(); octx.stroke(); };
    if (sels.length === 1 && sels[0].type === 'line') { const e = sels[0]; sq(D.toPage(e.id, 0, 0), true); sq(D.toPage(e.id, e.w, 0), true); return; }
    const lone = OC.sel.els(); const textOnly = lone.length === 1 && lone[0].type === 'text'; const showSides = true; HANDLES.forEach(([hx, hy]) => { if (textOnly && hx === 0) return; if (!hx || !hy) { if (!showSides) return; const s = toS(pg, handlePos(b, hx, hy).x, handlePos(b, hx, hy).y); octx.fillStyle = '#fff'; octx.strokeStyle = acc; octx.lineWidth = 1.5; octx.beginPath(); const ang = U.rad(b.rot) + (hx ? Math.PI / 2 : 0); const L = 7, T = 3.5; octx.save(); octx.translate(s.x, s.y); octx.rotate(ang); octx.roundRect ? octx.roundRect(-L, -T, L * 2, T * 2, 3) : octx.rect(-L, -T, L * 2, T * 2); octx.fill(); octx.stroke(); octx.restore(); } else sq(handlePos(b, hx, hy)); });
    const rp = rotHandlePos(b), s = toS(pg, rp.x, rp.y); octx.fillStyle = '#fff'; octx.strokeStyle = acc; octx.beginPath(); octx.arc(s.x, s.y, 10, 0, 7); octx.fill(); octx.stroke(); octx.strokeStyle = acc; octx.lineWidth = 1.6; octx.beginPath(); octx.arc(s.x, s.y, 4.2, -2.4, 1.6); octx.stroke(); const ax = s.x + 4.2 * Math.cos(1.6), ay = s.y + 4.2 * Math.sin(1.6); octx.beginPath(); octx.moveTo(ax - 3, ay - 1); octx.lineTo(ax, ay + 1.5); octx.lineTo(ax + 1, ay - 2.5); octx.stroke();
  }
  function paintComments(ctx, acc, toS) {
    (S.project.comments || []).forEach((c, i) => {
      if (c.resolved && !E.showResolved) return; const pg = S.project.pages.find(p => p.id === c.pageId); if (!pg) return; let x = c.x, y = c.y; if (c.elId && D.get(c.elId)) { const b = E.boxOf(D.get(c.elId)); const cs = cornersOfBox(b); x = Math.min(...cs.map(p => p.x)) + c.x; y = Math.min(...cs.map(p => p.y)) + c.y; }
      const s = toS(pg, x, y); ctx.fillStyle = c.resolved ? '#888' : '#ffb020'; ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), s.x, s.y + .5);
    });
  }
  E.hitComment = function (p) {
    for (let i = 0; i < S.project.comments.length; i++) { const c = S.project.comments[i]; const pg = S.project.pages.find(q => q.id === c.pageId); if (!pg || pg !== p.pg) continue; let x = c.x, y = c.y; if (c.elId && D.get(c.elId)) { const cs = cornersOfBox(E.boxOf(D.get(c.elId))); x = Math.min(...cs.map(q => q.x)) + c.x; y = Math.min(...cs.map(q => q.y)) + c.y; } if (Math.hypot(p.px - x, p.py - y) < 14 / S.zoom) return c; } return null;
  };

  /* ---------- page headers (DOM) ---------- */
  function buildHeads() {
    if (!heads || !S.project) return; heads.textContent = '';
    S.project.pages.forEach((pg, i) => {
      if (pg.infinite) return;
      const T = OC.t; const ttl = h('input.pg-title', { value: pg.title || '', placeholder: T('Add page title'), onchange: ev => { pg.title = ev.target.value; OC.history.commit('Rename page'); }, onkeydown: ev => { ev.stopPropagation(); if (ev.key === 'Enter') ev.target.blur(); } });
      const btn = (ic, tip, fn, cls) => h('button.pg-btn' + (cls ? '.' + cls : ''), { title: T(tip), onclick: ev => { ev.stopPropagation(); fn(); }, onpointerdown: ev => ev.stopPropagation(), html: OC.icon(ic, 15) });
      const el = h('div.page-head', { 'data-i': i, onpointerdown: () => { S.pageIdx = i; OC.bus.emit('page-changed'); } },
        h('span.pg-num', T('Page') + ' ' + (i + 1)), ttl, h('span.pg-sp'),
        btn(pg.locked ? 'lock' : 'unlock', pg.locked ? 'Unlock page' : 'Lock page', () => OC.ops.lockPage(i), pg.locked ? 'on' : ''), btn('chevron-up', 'Move up', () => OC.ops.movePage(i, i - 1)), btn('chevron-down', 'Move down', () => OC.ops.movePage(i, i + 1)),
        btn('copy', 'Duplicate page', () => OC.ops.duplicatePage(i)), btn('trash-2', 'Delete page', () => OC.ops.deletePage(i)), btn('plus', 'Add page', () => OC.ops.addPage(i)));
      el._pg = pg; heads.append(el);
    });
    updateHeads();
  }
  E.buildHeads = buildHeads;
  function updateHeads() {
    if (!heads) return; Array.from(heads.children).forEach(el => { const pg = el._pg; if (!pg || !S.project.pages.includes(pg)) return; const s = E.worldToScreen(pg._x, pg._y); const w = pg.w * S.zoom; const vis = s.x + w > -50 && s.x < W + 50 && s.y > -10 && s.y < H + 40; el.style.display = vis ? '' : 'none'; if (!vis) return; el.style.transform = `translate(${s.x}px, ${s.y - 38}px)`; el.style.width = Math.max(w, 260) + 'px'; el.classList.toggle('active', S.project.pages[S.pageIdx] === pg); el.classList.toggle('locked', pg.locked); });
  }
  E.updateHeads = updateHeads;

  /* ---------- crop mode ---------- */
  E.cropDown = function (p) {
    const el = D.get(S.cropEl); if (!el) { S.cropEl = null; return false; } const lp = D.toLocal(el.id, p.px, p.py);
    if (lp.x < -10 || lp.y < -10 || lp.x > el.w + 10 || lp.y > el.h + 10) { S.cropEl = null; OC.history.commit('Crop'); OC.bus.emit('selection'); R.invalidate(); return false; }
    S.drag = { type: 'crop', pg: p.pg, x0: p.px, y0: p.py, c0: { ...el.crop }, el }; return true;
  };
  function cropDrag(d, p) {
    const el = d.el; const th = -U.rad(E.worldRot(el)); const q = U.rotPt(p.px - d.x0, p.py - d.y0, 0, 0, th); el.crop.x = d.c0.x + q.x; el.crop.y = d.c0.y + q.y;
    const img = OC.assets.img(el.src); if (img && el.fit === 'cover') { const r0 = R.fitRect(img.naturalWidth, img.naturalHeight, el.w, el.h, el.fit, { x: 0, y: 0, s: el.crop.s }); const mx = Math.max(0, (r0.w - el.w) / 2), my = Math.max(0, (r0.h - el.h) / 2); el.crop.x = U.clamp(el.crop.x, -mx, mx); el.crop.y = U.clamp(el.crop.y, -my, my); }
    R.invalidate();
  }
  E.paintCrop = function (ctx, acc, toS) {
    const el = D.get(S.cropEl); if (!el) return; const img = el.type === 'image' ? OC.assets.img(el.src) : null; if (!img) return; const pg = D.find(el.id).page; const r = R.fitRect(img.naturalWidth, img.naturalHeight, el.w, el.h, el.fit, el.crop);
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(q => { const pp = D.toPage(el.id, q[0], q[1]); return toS(pg, pp.x, pp.y); });
    ctx.save(); ctx.strokeStyle = acc; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke(); ctx.restore();
  };
  E.exitCrop = function () { if (S.cropEl) { S.cropEl = null; OC.history.commit('Crop'); R.invalidate(); OC.bus.emit('selection'); } };
  E.cropScale = k => { const el = D.get(S.cropEl); if (el) { el.crop.s = U.clamp(el.crop.s * k, .2, 12); R.invalidate(); } };

  E.onCtx = onCtx;
})();
