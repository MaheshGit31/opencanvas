/* Scene renderer, animation sampling, auto layout */
(function () {
  const U = OC.U, D = OC.doc, A = OC.assets;
  const R = OC.render = { dirty: false, onPaint: null };
  R.invalidate = function () { if (R.dirty) return; R.dirty = true; requestAnimationFrame(() => { R.dirty = false; R.onPaint && R.onPaint(); }); };

  /* ---------- animation ---------- */
  const E = {
    linear: t => t, ease: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2, easeIn: t => t * t * t, easeOut: t => 1 - (1 - t) ** 3, easeInOut: t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
    back: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
    bounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; },
    elastic: t => t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1, step: t => t < 1 ? 0 : 1
  };
  const bez = (a, b, c, d) => t => { let x = t, i = 0; const cx = 3 * a, bx = 3 * (c - a) - cx, ax = 1 - cx - bx, cy = 3 * b, by = 3 * (d - b) - cy, ay = 1 - cy - by; for (; i < 8; i++) { const e = ((ax * x + bx) * x + cx) * x - t; if (Math.abs(e) < 1e-4) break; const dd = (3 * ax * x + 2 * bx) * x + cx; if (Math.abs(dd) < 1e-6) break; x -= e / dd; } return ((ay * x + by) * x + cy) * x; };
  R.EASINGS = Object.keys(E);
  R.ease = function (name, t) { if (!name) return t; if (name.startsWith('bezier(')) { const p = name.slice(7, -1).split(',').map(Number); return bez(...p)(t); } return (E[name] || E.linear)(t); };
  function mixVal(a, b, t) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
    if (typeof a === 'string' && typeof b === 'string' && /^(#|rgb|hsl)/.test(a)) return U.mix(a, b, t);
    return t < .5 ? a : b;
  }
  R.sample = function (keys, t) {
    if (!keys || !keys.length) return undefined; if (t <= keys[0].t) return keys[0].v; const last = keys[keys.length - 1]; if (t >= last.t) return last.v;
    for (let i = 0; i < keys.length - 1; i++) { const a = keys[i], b = keys[i + 1]; if (t >= a.t && t <= b.t) { const k = (t - a.t) / (b.t - a.t || 1); return mixVal(a.v, b.v, R.ease(a.e, k)); } }
  };
  R.hasAnim = el => el.anim && Object.keys(el.anim).some(k => el.anim[k] && el.anim[k].length);
  R.resolve = function (el, t) {
    if (t == null || !R.hasAnim(el)) return el;
    const o = Object.assign({}, el); let sc = 1;
    for (const prop in el.anim) {
      const v = R.sample(el.anim[prop], t); if (v === undefined) continue;
      if (prop === 'scale') { sc = v; continue; }
      if (prop === 'fillColor') { o.fills = (el.fills || []).map((f, i) => i === 0 && f.type === 'solid' ? { ...f, color: v } : f); continue; }
      const parts = prop.split('.'); if (parts.length === 1) o[prop] = v; else { o[parts[0]] = { ...(o[parts[0]] || {}) }; o[parts[0]][parts[1]] = v; }
    }
    if (sc !== 1) { const cx = o.x + o.w / 2, cy = o.y + o.h / 2; o.w *= sc; o.h *= sc; o.x = cx - o.w / 2; o.y = cy - o.h / 2; o._scale = sc; }
    return o;
  };

  /* ---------- auto layout ---------- */
  R.autoLayout = function (list) {
    (list || OC.S.project.pages.flatMap(p => p.elements)).forEach(e => {
      if (e.children) { R.autoLayout(e.children); const L = e.layout; if (e.type === 'frame' && L && L.mode !== 'none') apply(e); }
    });
  };
  function apply(f) {
    const L = f.layout, kids = f.children.filter(c => c.visible !== false); const row = L.mode === 'row'; let pos = L.pad, cross = 0;
    kids.forEach(c => { cross = Math.max(cross, row ? c.h : c.w); });
    const innerCross = (row ? f.h : f.w) - L.pad * 2;
    kids.forEach(c => {
      if (row) { c.x = pos; c.y = L.pad + (L.align === 'center' ? (innerCross - c.h) / 2 : L.align === 'end' ? innerCross - c.h : 0); pos += c.w + L.gap; }
      else { c.y = pos; c.x = L.pad + (L.align === 'center' ? (innerCross - c.w) / 2 : L.align === 'end' ? innerCross - c.w : 0); pos += c.h + L.gap; }
    });
    if (L.hug && kids.length) { if (row) { f.w = pos - L.gap + L.pad; f.h = cross + L.pad * 2; } else { f.h = pos - L.gap + L.pad; f.w = cross + L.pad * 2; } }
  }

  /* ---------- fills ---------- */
  function gradient(ctx, f, w, h) {
    let g; const stops = f.stops || [{ o: 0, c: '#000' }, { o: 1, c: '#fff' }];
    if (f.type === 'linear') {
      const a = U.rad((f.angle == null ? 90 : f.angle)), dx = Math.sin(a), dy = -Math.cos(a), len = Math.abs(w * dx) + Math.abs(h * dy), cx = w / 2, cy = h / 2;
      g = ctx.createLinearGradient(cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2);
    } else if (f.type === 'radial') { const cx = (f.cx == null ? .5 : f.cx) * w, cy = (f.cy == null ? .5 : f.cy) * h; g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * (f.r || .5)); }
    else if (ctx.createConicGradient) g = ctx.createConicGradient(U.rad((f.angle || 0) - 90), (f.cx == null ? .5 : f.cx) * w, (f.cy == null ? .5 : f.cy) * h);
    else g = ctx.createLinearGradient(0, 0, w, 0);
    stops.forEach(s => g.addColorStop(U.clamp(s.o, 0, 1), U.rgba(s.c, f.opacity == null ? 1 : f.opacity)));
    return g;
  }
  R.gradient = gradient;
  function fillStyle(ctx, f, w, h) { return f.type === 'solid' ? U.rgba(f.color, f.opacity) : gradient(ctx, f, w, h); }
  R.fillStyle = fillStyle;
  R.fitRect = function (nw, nh, w, h, fit, crop) {
    crop = crop || { x: 0, y: 0, s: 1 }; let s;
    if (fit === 'fill') return { x: crop.x, y: crop.y, w: w * crop.s, h: h * crop.s };
    s = (fit === 'contain' ? Math.min(w / nw, h / nh) : Math.max(w / nw, h / nh)) * (crop.s || 1);
    const sw = nw * s, sh = nh * s; return { x: (w - sw) / 2 + (crop.x || 0), y: (h - sh) / 2 + (crop.y || 0), w: sw, h: sh };
  };
  function placeholder(ctx, w, h, label) {
    ctx.save(); ctx.fillStyle = 'rgba(128,128,150,.18)'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(128,128,150,.5)'; ctx.lineWidth = Math.max(1, Math.min(w, h) / 120); ctx.setLineDash([8, 6]); ctx.strokeRect(0, 0, w, h);
    ctx.setLineDash([]); ctx.beginPath(); const s = Math.min(w, h) * .18; ctx.moveTo(w / 2 - s, h / 2 + s * .6); ctx.lineTo(w / 2 - s * .3, h / 2 - s * .2); ctx.lineTo(w / 2 + s * .2, h / 2 + s * .3); ctx.lineTo(w / 2 + s * .5, h / 2); ctx.lineTo(w / 2 + s, h / 2 + s * .6); ctx.stroke(); ctx.restore();
  }
  function drawImageFill(ctx, path, f, el, o) {
    const img = A.img(f.src); ctx.save(); ctx.clip(path, el.fillRule || 'nonzero');
    if (!img) { placeholder(ctx, el.w, el.h); ctx.restore(); return; }
    const r = R.fitRect(img.naturalWidth, img.naturalHeight, el.w, el.h, f.fit || 'cover', f.crop); ctx.globalAlpha *= f.opacity == null ? 1 : f.opacity; ctx.drawImage(img, r.x, r.y, r.w, r.h); ctx.restore();
  }

  /* ---------- layers ---------- */
  function makeLayer(ctx, el, margin, rectW, rectH) {
    const m = ctx.getTransform(); const cv = ctx.canvas; const sc = Math.hypot(m.a, m.b) || 1;
    const pts = [[0, 0], [rectW, 0], [rectW, rectH], [0, rectH]].map(p => [m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f]);
    const mg = margin * sc; let x0 = Math.floor(Math.min(...pts.map(p => p[0])) - mg), y0 = Math.floor(Math.min(...pts.map(p => p[1])) - mg), x1 = Math.ceil(Math.max(...pts.map(p => p[0])) + mg), y1 = Math.ceil(Math.max(...pts.map(p => p[1])) + mg);
    if (cv && !cv._noClamp) { const pad = 64; x0 = Math.max(x0, -pad); y0 = Math.max(y0, -pad); x1 = Math.min(x1, cv.width + pad); y1 = Math.min(y1, cv.height + pad); }
    const w = x1 - x0, h = y1 - y0; if (w < 1 || h < 1 || w * h > 5e7) return null;
    const L = U.newCanvas(w, h), g = L.getContext('2d'); g.translate(-x0, -y0); g.transform(m.a, m.b, m.c, m.d, m.e, m.f); g.imageSmoothingQuality = 'high';
    return { c: L, g, x0, y0, sc };
  }
  function sibling(g) { const c = U.newCanvas(g.canvas.width, g.canvas.height), n = c.getContext('2d'); n.setTransform(g.getTransform()); return n; }

  /* ---------- element drawing ---------- */
  R.drawElements = function (ctx, list, o) { for (let i = 0; i < list.length; i++) R.drawElement(ctx, list[i], o); };
  R.drawElement = function (ctx, el0, o) {
    o = o || {}; if (el0.visible === false) return; if (o.hide && o.hide.has(el0.id) && el0.type === 'text') return;
    const t = o.t; const el = R.resolve(el0, t);
    if (t != null) { const s = (el.timing && el.timing.start) || 0, e = el.timing && el.timing.end != null ? el.timing.end : (o.page ? o.page.duration : 1e9); if (t < s - 1e-6 || t > e + 1e-6) return; }
    if ((el.w === 0 && el.type !== 'line') || el.opacity === 0) return;
    ctx.save();
    ctx.translate(el.x + el.w / 2, el.y + el.h / 2); if (el.rot) ctx.rotate(U.rad(el.rot)); if (el.flipX || el.flipY) ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1); ctx.translate(-el.w / 2, -el.h / 2);
    const isCont = !!el.children;
    const shadows = (el.shadows || []).filter(s => s.visible !== false);
    const needLayer = el.blur > 0 || shadows.length || (el.type === 'group' && el.mask) || (isCont && el.opacity < 1) || (el.opacity < 1 && el.stroke && el.stroke.width > 0 && (el.fills || []).length) || (el.blend && el.blend !== 'source-over' && isCont);
    if (!needLayer) {
      ctx.globalAlpha *= el.opacity; if (el.blend && el.blend !== 'source-over') ctx.globalCompositeOperation = el.blend;
      content(ctx, el, o);
    } else {
      let ext = 0; shadows.forEach(s => { ext = Math.max(ext, Math.abs(s.x || 0) + Math.abs(s.y || 0) + (s.blur || 0) * 2 + (s.spread || 0)); });
      const margin = ext + (el.blur || 0) * 3 + (el.stroke ? el.stroke.width : 0) + 6;
      const L = makeLayer(ctx, el, margin, el.w, Math.max(el.h, 1));
      if (L) {
        content(L.g, el, o);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha *= el.opacity; if (el.blend && el.blend !== 'source-over') ctx.globalCompositeOperation = el.blend;
        shadows.forEach(s => { ctx.save(); ctx.shadowColor = U.rgba(s.color || '#000', s.opacity == null ? .4 : s.opacity); ctx.shadowBlur = (s.blur || 0) * L.sc; ctx.shadowOffsetX = (s.x || 0) * L.sc; ctx.shadowOffsetY = (s.y || 0) * L.sc; if ('filter' in ctx && el.blur > 0) ctx.filter = `blur(${el.blur * L.sc}px)`; ctx.drawImage(L.c, L.x0, L.y0); ctx.restore(); });
        if ('filter' in ctx && el.blur > 0) ctx.filter = `blur(${el.blur * L.sc}px)`;
        ctx.drawImage(L.c, L.x0, L.y0); ctx.restore();
      }
    }
    ctx.restore();
  };

  function paintShape(ctx, el, path, o) {
    const fills = (el.fills || []).filter(f => f.visible !== false);
    const rule = el.fillRule || 'nonzero';
    fills.forEach(f => { if (f.type === 'image') drawImageFill(ctx, path, f, el, o); else { ctx.fillStyle = fillStyle(ctx, f, el.w, el.h); ctx.fill(path, rule); } });
    const s = el.stroke;
    if (s && s.width > 0) {
      const profile = s.profile && s.profile !== 'uniform' && el.type !== 'text' ? OC.vec.profilePath(el) : null;
      ctx.save(); ctx.strokeStyle = U.rgba(s.color, s.opacity); ctx.fillStyle = ctx.strokeStyle;
      if (profile) ctx.fill(profile, 'nonzero');
      else {
        ctx.lineCap = s.cap || 'butt'; ctx.lineJoin = s.join || 'miter'; ctx.miterLimit = s.miter || 4; ctx.setLineDash(s.dash && s.dash.length ? s.dash.map(d => d * (s.dashScale ? s.width : 1)) : []);
        if (s.grad) ctx.strokeStyle = gradient(ctx, s.grad, el.w, el.h);
        const open = el.type === 'line' || (el.type === 'path' && el.subpaths.some(sp => !sp.closed));
        if (s.align === 'inside' && !open) { ctx.clip(path, rule); ctx.lineWidth = s.width * 2; ctx.stroke(path); }
        else if (s.align === 'outside' && !open) { const big = new Path2D(); big.rect(-1e5, -1e5, 2e5, 2e5); big.addPath(path); ctx.clip(big, 'evenodd'); ctx.lineWidth = s.width * 2; ctx.stroke(path); }
        else { ctx.lineWidth = s.width; ctx.stroke(path); }
      }
      ctx.restore();
    }
    if (el.ends && (el.type === 'line' || el.type === 'path') && s) lineEnds(ctx, el);
  }
  function lineEnds(ctx, el) {
    let a, b, da, db;
    if (el.type === 'line') { a = { x: 0, y: 0 }; b = { x: el.w, y: 0 }; da = 0; db = 0; }
    else { const sp = el.subpaths.find(p => !p.closed); if (!sp || sp.nodes.length < 2) return; const sx = el.w / el.vw, sy = el.h / el.vh, n0 = sp.nodes[0], n1 = sp.nodes[1], m0 = sp.nodes[sp.nodes.length - 1], m1 = sp.nodes[sp.nodes.length - 2]; a = { x: n0.x * sx, y: n0.y * sy }; b = { x: m0.x * sx, y: m0.y * sy }; const ta = { x: (n0.ox ? n0.x + n0.ox : n1.ix ? n1.x + n1.ix : n1.x) * sx, y: (n0.oy ? n0.y + n0.oy : n1.iy ? n1.y + n1.iy : n1.y) * sy }; const tb = { x: (m0.ix ? m0.x + m0.ix : m1.ox ? m1.x + m1.ox : m1.x) * sx, y: (m0.iy ? m0.y + m0.iy : m1.oy ? m1.y + m1.oy : m1.y) * sy }; da = Math.atan2(a.y - ta.y, a.x - ta.x) - Math.PI; db = Math.atan2(b.y - tb.y, b.x - tb.x) - Math.PI; da += Math.PI; db += Math.PI; }
    const w = el.stroke.width, col = U.rgba(el.stroke.color, el.stroke.opacity);
    const mark = (kind, p, ang) => {
      if (!kind || kind === 'none') return; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]); const L = Math.max(w * 3.2, 10);
      if (kind === 'arrow') { ctx.beginPath(); ctx.moveTo(-L, -L * .6); ctx.lineTo(0, 0); ctx.lineTo(-L, L * .6); ctx.stroke(); }
      else if (kind === 'triangle') { ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(-L, -L * .6); ctx.lineTo(-L, L * .6); ctx.closePath(); ctx.fill(); }
      else if (kind === 'dot') { ctx.beginPath(); ctx.arc(0, 0, w * 1.6, 0, 7); ctx.fill(); }
      else if (kind === 'square') { ctx.fillRect(-w * 1.5, -w * 1.5, w * 3, w * 3); }
      else if (kind === 'bar') { ctx.beginPath(); ctx.moveTo(0, -L * .6); ctx.lineTo(0, L * .6); ctx.stroke(); }
      else if (kind === 'diamond') { ctx.beginPath(); ctx.moveTo(w * 2.4, 0); ctx.lineTo(0, -w * 1.8); ctx.lineTo(-w * 2.4, 0); ctx.lineTo(0, w * 1.8); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    };
    if (el.type === 'line') { mark(el.ends.start, a, Math.PI); mark(el.ends.end, b, 0); } else { mark(el.ends.start, a, da); mark(el.ends.end, b, db + Math.PI); }
  }

  function content(ctx, el, o) {
    switch (el.type) {
      case 'rect': case 'ellipse': case 'polygon': case 'star': case 'path': case 'line': {
        const path = OC.vec.path2D(el); paintShape(ctx, el, path, o); break;
      }
      case 'text': {
        const f = (el.fills || []).find(f => f.visible !== false); const fs = f ? fillStyle(ctx, f, el.w, el.h) : '#000';
        if (el.bg && el.bg.mode === 'sticky') { ctx.save(); ctx.fillStyle = el.bg.color; ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fillRect(0, 0, el.w, el.h); ctx.restore(); }
        OC.text.draw(ctx, el, { fillStyle: fs, noSync: o.noSync }); break;
      }
      case 'image': case 'video': drawMedia(ctx, el, o); break;
      case 'frame': {
        const path = OC.vec.path2D(el); ctx.save(); paintShape(ctx, { ...el, stroke: null }, path, o); if (el.clip) ctx.clip(path);
        R.drawElements(ctx, el.children, o); ctx.restore();
        if (el.stroke) { ctx.save(); paintShape(ctx, { ...el, fills: [] }, path, o); ctx.restore(); } break;
      }
      case 'group': {
        if (el.mask && el.children.length > 1) {
          const kids = el.children.slice(0, -1), mk = el.children[el.children.length - 1]; const sib = sibling(ctx);
          R.drawElements(ctx, kids, o); R.drawElement(sib, { ...mk, opacity: 1 }, { ...o, t: undefined });
          let mc = sib.canvas; if (el.maskMode === 'luminance') mc = lumMask(mc);
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mc, 0, 0); ctx.restore();
        } else R.drawElements(ctx, el.children, o);
        break;
      }
      case 'scene3d': if (OC.threed) OC.threed.draw(ctx, el, o); else placeholder(ctx, el.w, el.h); break;
      case 'audio': {
        ctx.fillStyle = 'rgba(109,94,252,.9)'; ctx.fillRect(0, 0, el.w, el.h); ctx.fillStyle = '#fff'; for (let i = 0; i < 24; i++) { const hh = (Math.sin(i * 1.7) * .5 + .55) * el.h * .6; ctx.fillRect(10 + i * ((el.w - 20) / 24), (el.h - hh) / 2, 3, hh); } break;
      }
    }
  }
  function lumMask(c) {
    const out = U.newCanvas(c.width, c.height), g = out.getContext('2d'); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const l = (p[i] * .2126 + p[i + 1] * .7152 + p[i + 2] * .0722) / 255; p[i + 3] = p[i + 3] * l; } g.putImageData(d, 0, 0); return out;
  }
  function drawMedia(ctx, el, o) {
    let src, nw, nh;
    if (el.type === 'video') { const v = OC.media && OC.media.frame(el, o.t, o); if (v && v.videoWidth) { src = v; nw = v.videoWidth; nh = v.videoHeight; } }
    else { const img = A.img(el.src); if (img) { src = img; nw = img.naturalWidth; nh = img.naturalHeight; } }
    const path = OC.vec.path2D(el);
    if (!src) { ctx.save(); ctx.clip(path); placeholder(ctx, el.w, el.h); ctx.restore(); return; }
    ctx.save(); ctx.clip(path);
    const hasAdj = el.adj && (Object.keys(el.adj).length || el.pin); const r = R.fitRect(nw, nh, el.w, el.h, el.fit, el.crop);
    if (hasAdj && OC.photo) {
      const need = Math.max(nw * Math.min(1, (o.scale || 1) * r.w / nw), 64);
      const proc = OC.photo.process(el, src, { scale: o.scale || 1, w: r.w, h: r.h, live: o.live });
      if (el.adj.pin && OC.photo.drawPinned) OC.photo.drawPinned(ctx, proc || src, el, r); else ctx.drawImage(proc || src, r.x, r.y, r.w, r.h);
      OC.photo.overlays(ctx, el, r);
    } else ctx.drawImage(src, r.x, r.y, r.w, r.h);
    ctx.restore();
    if (el.stroke && el.stroke.width > 0) { ctx.save(); paintShape(ctx, { ...el, fills: [] }, path, o); ctx.restore(); }
  }

  /* ---------- pages ---------- */
  R.drawPageBg = function (ctx, page, w, h) {
    const bg = page.bg || { type: 'solid', color: '#fff' };
    if (bg.type === 'solid') { ctx.fillStyle = bg.color; ctx.fillRect(0, 0, w, h); }
    else if (bg.type === 'linear' || bg.type === 'radial' || bg.type === 'conic') { ctx.fillStyle = gradient(ctx, bg, w, h); ctx.fillRect(0, 0, w, h); }
    else if (bg.type === 'image') { ctx.fillStyle = bg.color || '#fff'; ctx.fillRect(0, 0, w, h); const img = A.img(bg.src); if (img) { const r = R.fitRect(img.naturalWidth, img.naturalHeight, w, h, bg.fit || 'cover', bg.crop); ctx.drawImage(img, r.x, r.y, r.w, r.h); } }
    else if (bg.type === 'transparent') { }
    if (bg.type !== 'transparent' && page.bgPattern) page.bgPattern;
  };
  R.drawPage = function (ctx, page, o) {
    o = Object.assign({ page }, o || {});
    ctx.save();
    if (!page.infinite) { ctx.beginPath(); ctx.rect(0, 0, page.w, page.h); ctx.clip(); R.drawPageBg(ctx, page, page.w, page.h); }
    R.drawElements(ctx, page.elements, o);
    ctx.restore();
  };
  R.renderPage = function (page, opts = {}) {
    const s = opts.scale || 1; const w = opts.w || page.w, h = opts.h || page.h; const c = U.newCanvas(w * s, h * s); const g = c.getContext('2d'); g._noClamp = true; g.scale(s, s); g.imageSmoothingQuality = 'high';
    if (opts.transparent) { const bg = page.bg; page = { ...page, bg: { type: 'transparent' } }; }
    R.drawPage(g, page, { t: opts.t, scale: s, noSync: true, hide: opts.hide }); return c;
  };
  R.thumb = function (page, max = 200) {
    const s = max / Math.max(page.w, page.h, 1); return R.renderPage(page, { scale: Math.min(s, 1), t: 0 });
  };

  /* ---------- page transitions ---------- */
  R.TRANSITIONS = [['none', 'None'], ['fade', 'Fade'], ['dissolve', 'Dissolve'], ['slide', 'Slide'], ['slide-up', 'Slide up'], ['zoom', 'Zoom'], ['wipe', 'Wipe']];
  const eio = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  /* draw canvas A (outgoing) and B (incoming) blended at progress p (0 to 1) */
  R.drawTransition = function (g, A, B, kind, p, W, H) {
    p = Math.max(0, Math.min(1, p)); const e = eio(p); g.save(); g.clearRect(0, 0, W, H);
    switch (kind) {
      case 'slide': g.drawImage(A, -e * W, 0, W, H); g.drawImage(B, (1 - e) * W, 0, W, H); break;
      case 'slide-up': g.drawImage(A, 0, -e * H, W, H); g.drawImage(B, 0, (1 - e) * H, W, H); break;
      case 'zoom': g.globalAlpha = 1 - e; g.translate(W / 2, H / 2); g.scale(1 + e * .25, 1 + e * .25); g.drawImage(A, -W / 2, -H / 2, W, H); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = e; g.translate(W / 2, H / 2); g.scale(.85 + e * .15, .85 + e * .15); g.drawImage(B, -W / 2, -H / 2, W, H); break;
      case 'wipe': g.drawImage(A, 0, 0, W, H); g.beginPath(); g.rect(0, 0, W * e, H); g.clip(); g.drawImage(B, 0, 0, W, H); break;
      case 'dissolve': g.drawImage(A, 0, 0, W, H); g.globalAlpha = e; g.translate(W / 2, H / 2); g.scale(1.03 - e * .03, 1.03 - e * .03); g.drawImage(B, -W / 2, -H / 2, W, H); break;
      default: g.drawImage(A, 0, 0, W, H); g.globalAlpha = e; g.drawImage(B, 0, 0, W, H);
    }
    g.restore();
  };
  /* sequence of pages on one timeline; a page's transition overlaps the end of the page before it */
  R.projectLayout = function (proj) {
    const segs = []; let end = 0;
    (proj.pages || []).forEach((pg, i) => {
      const td = i && pg.transition && pg.transition !== 'none' ? Math.min(pg.transitionDur == null ? .6 : pg.transitionDur, segs[i - 1].dur / 2, pg.duration / 2) : 0;
      const start = i ? segs[i - 1].end - td : 0; const seg = { pg, i, start, dur: pg.duration, end: start + pg.duration, td }; segs.push(seg); end = seg.end;
    });
    return { segs, total: end };
  };
  /* draw whatever is on screen at global time gt; returns { i, t, blend } */
  R.drawProjectFrame = function (g, proj, gt, scale, W, H) {
    const L = R.projectLayout(proj); gt = Math.max(0, Math.min(L.total, gt)); let idx = L.segs.findIndex(s => gt >= s.start && gt < s.end); if (idx < 0) idx = L.segs.length - 1; const s = L.segs[idx]; const nx = L.segs[idx + 1];
    if (nx && nx.td && gt >= nx.start) {
      const mk = (sg, t) => R.renderPage(sg.pg, { scale, t, noSync: true }); const A = mk(s, gt - s.start), B = mk(nx, gt - nx.start);
      R.drawTransition(g, A, B, nx.pg.transition, (gt - nx.start) / nx.td, W, H); return { i: gt - nx.start > nx.td / 2 ? nx.i : s.i, t: gt - s.start, blend: true };
    }
    g.clearRect(0, 0, W, H); g.save(); g.scale(scale, scale); R.drawPage(g, s.pg, { t: gt - s.start, scale, noSync: true }); g.restore(); return { i: s.i, t: gt - s.start, blend: false };
  };

  /* element only render (download selection, symbols, etc) */
  R.renderElements = function (els, opts = {}) {
    const b = D.boundsOf(els); const pad = opts.pad || 0; const s = opts.scale || 1; const c = U.newCanvas((b.w + pad * 2) * s, (b.h + pad * 2) * s); const g = c.getContext('2d'); g._noClamp = true; g.scale(s, s); g.translate(-b.x + pad, -b.y + pad);
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2); }
    R.drawElements(g, els, { scale: s, noSync: true, page: { duration: 5 } }); return c;
  };
})();
