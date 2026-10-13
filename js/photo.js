/* Photo suite: pipeline, filters, pin, AI tools, panel */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui, R = OC.render;
  const T = s => OC.t(s); const Ph = OC.photo = {};
  const cache = new Map(); const srcIds = new WeakMap(); let sidN = 0;
  const sid = s => { if (!srcIds.has(s)) srcIds.set(s, ++sidN); return srcIds.get(s); };

  /* ---------- filters ---------- */
  const FILTERS = {
    None: {}, Vivid: { contrast: 12, vibrance: 40, saturation: 10 }, Warm: { temp: 28, tint: 4, contrast: 6 }, Cool: { temp: -28, tint: -3, contrast: 6 },
    Fade: { fade: 28, contrast: -10, saturation: -12 }, Mono: { saturation: -100, contrast: 10 }, Noir: { saturation: -100, contrast: 38, blacks: -20, vignette: 35 },
    Sepia: { sepia: 80, contrast: 6 }, Matte: { fade: 20, blacks: 25, contrast: -8, saturation: -8 }, Cinema: { temp: -10, tint: 8, contrast: 18, shadows: -12, vignette: 25, duotone: null },
    Dream: { exposure: .15, contrast: -14, saturation: 12, blur: 0, fade: 12, temp: 10, tint: 10 }, Punch: { contrast: 28, saturation: 22, sharpen: 30 },
    Film: { grain: 28, fade: 12, temp: 8, contrast: 10, saturation: -6 }, Sunset: { temp: 38, tint: 12, saturation: 14, contrast: 8 }, Frost: { temp: -35, saturation: -10, exposure: .1, contrast: 8 }
  };
  const DUOS = [['Midnight', '#14213d', '#fca311'], ['Pop', '#0b2545', '#ff5d8f'], ['Ocean', '#03045e', '#90e0ef'], ['Toxic', '#0b0014', '#b8ff3c'], ['Rose', '#3d0c11', '#ffc2d1'], ['Forest', '#0b3d2e', '#f4f1bb'], ['Sunrise', '#6a040f', '#ffd166'], ['Slate', '#111111', '#e9e9ef']];
  Ph.FILTERS = FILTERS; Ph.DUOS = DUOS;
  const DEF = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temp: 0, tint: 0, saturation: 0, vibrance: 0, hue: 0, fade: 0, sepia: 0, sharpen: 0, blur: 0, vignette: 0, grain: 0, clarity: 0 };

  function effective(adj) {
    const f = FILTERS[adj.filter] || {}, amt = adj.filterAmt == null ? 1 : adj.filterAmt; const o = {}; for (const k in DEF) o[k] = (adj[k] || 0) + (f[k] || 0) * amt; return o;
  }
  const clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v;
  const lum = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
  function curveLUT(pts) { // pts [[x,y]...] 0..255, monotone cubic-ish via linear + smoothing
    const lut = new Uint8Array(256); const p = pts.slice().sort((a, b) => a[0] - b[0]); const n = p.length; const dx = [], dy = [], m = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; dy[i] = p[i + 1][1] - p[i][1]; m[i] = dy[i] / (dx[i] || 1); }
    const t = [m[0]]; for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2; t[n - 1] = m[n - 2];
    for (let x = 0; x < 256; x++) { let i = 0; while (i < n - 2 && x > p[i + 1][0]) i++; const hh = dx[i] || 1, s = (x - p[i][0]) / hh; const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2; lut[x] = clamp8(Math.round(h00 * p[i][1] + h10 * hh * t[i] + h01 * p[i + 1][1] + h11 * hh * t[i + 1])); }
    return lut;
  }
  Ph.curveLUT = curveLUT;

  function work(src, nw, nh, maxDim) { const k = Math.min(1, maxDim / Math.max(nw, nh)); const w = Math.max(1, Math.round(nw * k)), hh = Math.max(1, Math.round(nh * k)); const c = U.newCanvas(w, hh); c.getContext('2d').drawImage(src, 0, 0, w, hh); return c; }
  function blurred(c, px) { const o = U.newCanvas(c.width, c.height), g = o.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(c, 0, 0); g.filter = 'none'; return o; }

  Ph.process = function (el, src, o) {
    const adj = el.adj; if (!adj) return null;
    const nw = src.videoWidth || src.naturalWidth || src.width, nh = src.videoHeight || src.naturalHeight || src.height; if (!nw) return null;
    const isVideo = el.type === 'video'; const target = Math.min(2400, Math.max(96, Math.round(o.w * (o.scale || 1) * (window.devicePixelRatio > 1 ? 1 : 1))));
    const maxDim = o.live ? Math.min(target, 900) : target; const key = el.id + '|' + sid(src) + '|' + maxDim + '|' + JSON.stringify(adj) + (isVideo ? '|' + Math.round((src.currentTime || 0) * 30) : '');
    const hit = cache.get(key); if (hit) return hit;
    const e = effective(adj); const c = work(src, nw, nh, maxDim); const g = c.getContext('2d'); const W = c.width, H = c.height;
    const needPix = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temp', 'tint', 'saturation', 'vibrance', 'hue', 'fade', 'sepia'].some(k => e[k]) || adj.duotone || adj.curve;
    if (needPix) {
      const id = g.getImageData(0, 0, W, H), d = id.data; const ex = Math.pow(2, e.exposure), ct = 1 + e.contrast / 100, hi = e.highlights / 100, sh = e.shadows / 100, wh = e.whites / 100, bl = e.blacks / 100;
      const tr = e.temp / 100 * 40, tb = -e.temp / 100 * 40, tg = -e.tint / 100 * 30, sat = 1 + e.saturation / 100, vib = e.vibrance / 100, fade = e.fade / 100 * 60, sep = e.sepia / 100;
      let hm = null; if (e.hue) { const a = e.hue * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a); hm = [.213 + cs * .787 - sn * .213, .715 - cs * .715 - sn * .715, .072 - cs * .072 + sn * .928, .213 - cs * .213 + sn * .143, .715 + cs * .285 + sn * .140, .072 - cs * .072 - sn * .283, .213 - cs * .213 - sn * .787, .715 - cs * .715 + sn * .715, .072 + cs * .928 + sn * .072]; }
      const du = adj.duotone ? { a: U.parseColor(adj.duotone.a), b: U.parseColor(adj.duotone.b), amt: (adj.duotone.amt == null ? 100 : adj.duotone.amt) / 100 } : null;
      const lutAll = adj.curve && adj.curve.all ? curveLUT(adj.curve.all) : null, lr = adj.curve && adj.curve.r ? curveLUT(adj.curve.r) : null, lg = adj.curve && adj.curve.g ? curveLUT(adj.curve.g) : null, lb = adj.curve && adj.curve.b ? curveLUT(adj.curve.b) : null;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i] * ex + tr, gg = d[i + 1] * ex + tg, b = d[i + 2] * ex + tb;
        if (hi || sh || wh || bl) { const l = lum(r, gg, b) / 255; const dh = hi * Math.max(0, l - .5) * 2 * 60 + wh * Math.max(0, l - .75) * 4 * 50, ds = sh * Math.max(0, .5 - l) * 2 * 60 + bl * Math.max(0, .25 - l) * 4 * 50; r += dh + ds; gg += dh + ds; b += dh + ds; }
        if (ct !== 1) { r = (r - 128) * ct + 128; gg = (gg - 128) * ct + 128; b = (b - 128) * ct + 128; }
        if (sat !== 1 || vib) { const l = lum(r, gg, b); let s = sat; if (vib) { const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); const cur = mx ? (mx - mn) / mx : 0; s *= 1 + vib * (1 - cur); } r = l + (r - l) * s; gg = l + (gg - l) * s; b = l + (b - l) * s; }
        if (hm) { const r2 = r * hm[0] + gg * hm[1] + b * hm[2], g2 = r * hm[3] + gg * hm[4] + b * hm[5], b2 = r * hm[6] + gg * hm[7] + b * hm[8]; r = r2; gg = g2; b = b2; }
        if (sep) { const l = lum(r, gg, b); r += (l * 1.07 + 20 - r) * sep; gg += (l * .93 + 8 - gg) * sep; b += (l * .72 - 10 - b) * sep; }
        if (fade) { r = r + (fade - r * fade / 255); gg = gg + (fade - gg * fade / 255); b = b + (fade - b * fade / 255); }
        r = clamp8(r); gg = clamp8(gg); b = clamp8(b);
        if (lutAll) { r = lutAll[r | 0]; gg = lutAll[gg | 0]; b = lutAll[b | 0]; } if (lr) r = lr[r | 0]; if (lg) gg = lg[gg | 0]; if (lb) b = lb[b | 0];
        if (du) { const l = lum(r, gg, b) / 255; r += (du.a[0] + (du.b[0] - du.a[0]) * l - r) * du.amt; gg += (du.a[1] + (du.b[1] - du.a[1]) * l - gg) * du.amt; b += (du.a[2] + (du.b[2] - du.a[2]) * l - b) * du.amt; }
        d[i] = r; d[i + 1] = gg; d[i + 2] = b;
      }
      g.putImageData(id, 0, 0);
    }
    if (e.blur > 0) { const t = blurred(c, e.blur * W / 1600 * .6); g.clearRect(0, 0, W, H); g.drawImage(t, 0, 0); }
    if (e.sharpen > 0 || e.clarity) { const amt = e.sharpen / 100 * 1.6, rad = Math.max(.6, W / 1500 * 1.2); const bl2 = blurred(c, rad), a = g.getImageData(0, 0, W, H), b = bl2.getContext('2d').getImageData(0, 0, W, H); const ad = a.data, bd = b.data; for (let i = 0; i < ad.length; i += 4) { ad[i] = clamp8(ad[i] + (ad[i] - bd[i]) * amt); ad[i + 1] = clamp8(ad[i + 1] + (ad[i + 1] - bd[i + 1]) * amt); ad[i + 2] = clamp8(ad[i + 2] + (ad[i + 2] - bd[i + 2]) * amt); } g.putImageData(a, 0, 0); if (e.clarity) { const big = blurred(c, W / 60); const a2 = g.getImageData(0, 0, W, H), b2 = big.getContext('2d').getImageData(0, 0, W, H); const k = e.clarity / 100 * .8; for (let i = 0; i < a2.data.length; i += 4) for (let j = 0; j < 3; j++) a2.data[i + j] = clamp8(a2.data[i + j] + (a2.data[i + j] - b2.data[i + j]) * k); g.putImageData(a2, 0, 0); } }
    const L = adj.light; if (L && L.on !== false) lighting(g, W, H, L);
    if (e.vignette) { const v = e.vignette / 100; const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.hypot(W, H) / 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, v > 0 ? `rgba(0,0,0,${v * .85})` : `rgba(255,255,255,${-v * .85})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    if (e.grain > 0) { const gc = U.newCanvas(256, 256), gg2 = gc.getContext('2d'), gi = gg2.createImageData(256, 256); const r = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) | 0, (s >>> 0) / 4294967296); })(); for (let i = 0; i < gi.data.length; i += 4) { const v = 128 + (r() - .5) * 255; gi.data[i] = gi.data[i + 1] = gi.data[i + 2] = v; gi.data[i + 3] = 255; } gg2.putImageData(gi, 0, 0); g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = e.grain / 100 * .9; g.fillStyle = g.createPattern(gc, 'repeat'); const sc = W / 900; g.scale(sc, sc); g.fillRect(0, 0, W / sc, H / sc); g.restore(); }
    cache.set(key, c); if (cache.size > 30) cache.delete(cache.keys().next().value); return c;
  };
  function lighting(g, W, H, L) {
    const cx = (L.x == null ? .3 : L.x) * W, cy = (L.y == null ? .25 : L.y) * H, rad = (L.r == null ? .6 : L.r) * Math.max(W, H), k = (L.int == null ? 60 : L.int) / 100, col = L.color || '#ffd9a0';
    g.save(); g.globalCompositeOperation = 'soft-light'; let gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad); gr.addColorStop(0, U.rgba(col, Math.min(1, k * 1.3))); gr.addColorStop(1, U.rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'screen'; gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad * .6); gr.addColorStop(0, U.rgba(col, k * .45)); gr.addColorStop(1, U.rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (L.shade) { g.globalCompositeOperation = 'multiply'; gr = g.createRadialGradient(cx, cy, rad * .3, cx, cy, rad * 1.8); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, `rgba(0,0,0,${L.shade / 100})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    if (L.rays) { g.globalCompositeOperation = 'screen'; g.globalAlpha = L.rays / 100 * .5; const n = 14; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, a2 = a + Math.PI / n * .55; g.fillStyle = U.rgba(col, .25); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rad * 3, cy + Math.sin(a) * rad * 3); g.lineTo(cx + Math.cos(a2) * rad * 3, cy + Math.sin(a2) * rad * 3); g.closePath(); g.fill(); } }
    g.restore();
  }
  let maskCanvas = null, maskFor = null;
  Ph.overlays = function (ctx, el, r) {
    if (maskCanvas && maskFor === el.id) { ctx.save(); ctx.globalAlpha = .55; ctx.drawImage(maskCanvas, 0, 0, el.w, el.h); ctx.restore(); }
  };

  /* ---------- corner pin ---------- */
  Ph.drawPinned = function (ctx, c, el, r) {
    const pin = el.adj.pin; const iw = c.width, ih = c.height; const N = 14; const q = (u, v) => { const t = pin.tl, tr = pin.tr, bl = pin.bl, br = pin.br; const x = (1 - u) * (1 - v) * t[0] + u * (1 - v) * tr[0] + (1 - u) * v * bl[0] + u * v * br[0]; const y = (1 - u) * (1 - v) * t[1] + u * (1 - v) * tr[1] + (1 - u) * v * bl[1] + u * v * br[1]; return [r.x + x * r.w, r.y + y * r.h]; };
    // projective weights: use homography for correct perspective
    const H = homography([[0, 0], [1, 0], [1, 1], [0, 1]], [pin.tl, pin.tr, pin.br, pin.bl]);
    const map = (u, v) => { const w = H[6] * u + H[7] * v + 1; const x = (H[0] * u + H[1] * v + H[2]) / w, y = (H[3] * u + H[4] * v + H[5]) / w; return [r.x + x * r.w, r.y + y * r.h]; };
    ctx.save(); const eps = .6;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N; const P = [map(u0, v0), map(u1, v0), map(u1, v1), map(u0, v1)], Sx = [u0 * iw, u1 * iw, u1 * iw, u0 * iw], Sy = [v0 * ih, v0 * ih, v1 * ih, v1 * ih];
      tri(ctx, c, P[0], P[1], P[2], [Sx[0], Sy[0]], [Sx[1], Sy[1]], [Sx[2], Sy[2]], eps); tri(ctx, c, P[0], P[2], P[3], [Sx[0], Sy[0]], [Sx[2], Sy[2]], [Sx[3], Sy[3]], eps);
    }
    ctx.restore();
  };
  function tri(ctx, img, p0, p1, p2, s0, s1, s2, grow) {
    const cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3; const ex = p => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * grow, p[1] + dy / l * grow]; };
    const a = ex(p0), b = ex(p1), c = ex(p2); ctx.save(); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.clip();
    const den = s0[0] * (s1[1] - s2[1]) - s1[0] * (s0[1] - s2[1]) + s2[0] * (s0[1] - s1[1]); if (Math.abs(den) < 1e-9) { ctx.restore(); return; }
    const m11 = (p0[0] * (s1[1] - s2[1]) - p1[0] * (s0[1] - s2[1]) + p2[0] * (s0[1] - s1[1])) / den, m12 = (-p0[0] * (s1[0] - s2[0]) + p1[0] * (s0[0] - s2[0]) - p2[0] * (s0[0] - s1[0])) / den, dx = (p0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) - p1[0] * (s0[0] * s2[1] - s2[0] * s0[1]) + p2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
    const m21 = (p0[1] * (s1[1] - s2[1]) - p1[1] * (s0[1] - s2[1]) + p2[1] * (s0[1] - s1[1])) / den, m22 = (-p0[1] * (s1[0] - s2[0]) + p1[1] * (s0[0] - s2[0]) - p2[1] * (s0[0] - s1[0])) / den, dy = (p0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) - p1[1] * (s0[0] * s2[1] - s2[0] * s0[1]) + p2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
    ctx.transform(m11, m21, m12, m22, dx, dy); ctx.drawImage(img, 0, 0); ctx.restore();
  }
  function homography(src, dst) { // unit square -> quad
    const A = [], B = []; for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); B.push(u); A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); B.push(v); }
    const n = 8; for (let i = 0; i < n; i++) { let m = i; for (let j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[m][i])) m = j;[A[i], A[m]] = [A[m], A[i]];[B[i], B[m]] = [B[m], B[i]]; for (let j = i + 1; j < n; j++) { const f = A[j][i] / A[i][i]; for (let k = i; k < n; k++) A[j][k] -= f * A[i][k]; B[j] -= f * B[i]; } }
    const x = Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = B[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; } return x;
  }
  Ph.startPin = function (el) {
    if (!el.adj.pin) el.adj.pin = { tl: [0, 0], tr: [1, 0], br: [1, 1], bl: [0, 1] }; S.photoTool = { kind: 'pin', id: el.id }; R.invalidate();
  };
  const pinKeys = ['tl', 'tr', 'br', 'bl']; let dragKey = null;
  function curEl() { const t = S.photoTool; return t && D.get(t.id); }
  function imgRect(el) { const img = OC.assets.img(el.src); const nw = img ? img.naturalWidth : el.w, nh = img ? img.naturalHeight : el.h; return R.fitRect(nw, nh, el.w, el.h, el.fit, el.crop); }
  Ph.pointer = function (kind, p) {
    const t = S.photoTool; const el = curEl(); if (!t || !el) return false; const lp = D.toLocal(el.id, p.px, p.py);
    if (t.kind === 'pin') {
      const r = imgRect(el), pin = el.adj.pin, z = S.zoom;
      if (kind === 'down') { let best = null, bd = 18 / z; pinKeys.forEach(k => { const d = Math.hypot(r.x + pin[k][0] * r.w - lp.x, r.y + pin[k][1] * r.h - lp.y); if (d < bd) { bd = d; best = k; } }); if (best) { dragKey = best; return true; } return false; }
      if (kind === 'move' && dragKey) { pin[dragKey] = [(lp.x - r.x) / r.w, (lp.y - r.y) / r.h]; R.invalidate(); return true; }
      if (kind === 'up' && dragKey) { dragKey = null; OC.history.commit('Corner pin'); return true; }
      return false;
    }
    if (t.kind === 'eraser' || t.kind === 'keep') {
      if (kind === 'hover') { t.hx = lp.x; t.hy = lp.y; R.invalidate(); return false; }
      if (kind === 'down') { ensureMask(el); t.drawing = true; t.lx = lp.x; t.ly = lp.y; stroke(t, lp.x, lp.y, lp.x, lp.y); return true; }
      if (kind === 'move') { t.hx = lp.x; t.hy = lp.y; if (t.drawing) { stroke(t, t.lx, t.ly, lp.x, lp.y); t.lx = lp.x; t.ly = lp.y; } R.invalidate(); return t.drawing; }
      if (kind === 'up' && t.drawing) { t.drawing = false; if (t.auto) Ph.applyEraser(); return true; }
    }
    return false;
  };
  function ensureMask(el) { if (!maskCanvas || maskFor !== el.id) { maskCanvas = U.newCanvas(Math.max(1, Math.round(el.w)), Math.max(1, Math.round(el.h))); maskFor = el.id; } }
  function stroke(t, x0, y0, x1, y1) { const g = maskCanvas.getContext('2d'); g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#ff2d55'; g.lineWidth = t.size || 40; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); R.invalidate(); }
  Ph.overlay = function (ctx, acc, toS) {
    const t = S.photoTool, el = curEl(); if (!t || !el) return; const f = D.find(el.id); const pg = f && f.page; if (!pg) return; const cs = D.pageCorners ? null : null;
    const L = (x, y) => { const c = D.toPage(el.id, x, y); return toS(pg, c.x, c.y); };
    if (t.kind === 'pin') {
      const r = imgRect(el), pin = el.adj.pin; const pts = pinKeys.map(k => L(r.x + pin[k][0] * r.w, r.y + pin[k][1] * r.h)); ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 1.5; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke(); pts.forEach(p => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fill(); ctx.stroke(); }); ctx.restore();
    } else if ((t.kind === 'eraser' || t.kind === 'keep') && t.hx != null) { const c = L(t.hx, t.hy); const rr = (t.size || 40) / 2 * S.zoom; ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, 7); ctx.stroke(); ctx.strokeStyle = '#000'; ctx.lineWidth = .75; ctx.beginPath(); ctx.arc(c.x, c.y, rr + 1.2, 0, 7); ctx.stroke(); ctx.restore(); }
  };
  Ph.cancel = function () { S.photoTool = null; maskCanvas = null; maskFor = null; dragKey = null; R.invalidate(); OC.ui.refreshAll && OC.ui.refreshAll(); };
  Ph.leavePanel = function () { if (S.photoTool) Ph.cancel(); };

  /* ---------- AI plumbing ---------- */
  const ai = () => OC.settings.ai; const useServer = () => ai().where === 'server' && ai().serverUrl;
  const base = () => ai().serverUrl.replace(/\/$/, '');
  const headers = () => ai().apiKey ? { Authorization: 'Bearer ' + ai().apiKey } : {};
  Ph.pingServer = async function () { try { const r = await fetch(base() + '/v1/health', { headers: headers() }); return r.ok ? await r.json().catch(() => ({ ok: true })) : false; } catch (e) { return false; } };
  Ph.serverMsg = function (j) { if (!j) return 'Cannot reach server'; const m = { OWNER: 'Connected with your key', FULL: 'Open to everyone', LIMITED: 'Open with limits', NONE: 'Private. Add the owner key' }; return m[j.access] || 'Server ready'; };
  async function post(path, fields) { const fd = new FormData(); for (const k in fields) fd.append(k, fields[k]); const r = await fetch(base() + path, { method: 'POST', body: fd, headers: headers() }); if (!r.ok) { let m = 'Server said ' + r.status; try { const j = await r.json(); if (j.message) m = j.message; } catch (e) { } throw new Error(m); } return r; }
  function busy(msg) { const t = h('div.busy', h('div.spinner'), h('span', T(msg))); document.body.append(t); return () => t.remove(); }
  async function srcCanvas(el, maxDim = 2000) { const img = OC.assets.img(el.src); if (!img) throw new Error('Image is still loading'); return work(img, img.naturalWidth, img.naturalHeight, maxDim); }
  async function setSrc(el, canvas, label) { const blob = await U.canvasBlob(canvas); const id = await OC.assets.add(blob, (el.name || 'Photo') + '.png'); el.src = 'asset:' + id; if (el.type === 'image') el.adj = el.adj || {}; OC.history.commit(label); R.invalidate(); }
  async function waitImg(el) { for (let i = 0; i < 40 && !OC.assets.img(el.src); i++) await new Promise(r => setTimeout(r, 100)); }

  /* background removal */
  let imglyP = null;
  async function imgly() { if (!imglyP) imglyP = import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm'); return imglyP; }
  function liteRemove(c) { // edge colour flood: soft chroma key from border samples
    const W = c.width, H = c.height, g = c.getContext('2d'), id = g.getImageData(0, 0, W, H), d = id.data; const samples = []; const add = (x, y) => { const i = (y * W + x) * 4; samples.push([d[i], d[i + 1], d[i + 2]]); };
    for (let x = 0; x < W; x += Math.max(1, W >> 5)) { add(x, 0); add(x, H - 1); } for (let y = 0; y < H; y += Math.max(1, H >> 5)) { add(0, y); add(W - 1, y); }
    const keys = []; samples.forEach(s => { if (!keys.some(k => Math.hypot(k[0] - s[0], k[1] - s[1], k[2] - s[2]) < 40)) keys.push(s); }); const dist = i => { let m = 1e9; for (const k of keys) m = Math.min(m, Math.hypot(d[i] - k[0], d[i + 1] - k[1], d[i + 2] - k[2])); return m; };
    const bgm = new Uint8Array(W * H), q = []; const seed = (x, y) => { const p = y * W + x; if (!bgm[p] && dist(p * 4) < 46) { bgm[p] = 1; q.push(p); } }; for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); } for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
    while (q.length) { const p = q.pop(), x = p % W, y = (p / W) | 0; if (x > 0) seed(x - 1, y); if (x < W - 1) seed(x + 1, y); if (y > 0) seed(x, y - 1); if (y < H - 1) seed(x, y + 1); }
    for (let p = 0; p < W * H; p++) if (bgm[p]) d[p * 4 + 3] = 0; g.putImageData(id, 0, 0); const o = U.newCanvas(W, H), og = o.getContext('2d'); og.filter = 'blur(.8px)'; og.drawImage(c, 0, 0); return o;
  }
  Ph.cutout = async function (el) {
    const c = await srcCanvas(el, 2400); const blob = await U.canvasBlob(c);
    if (useServer()) { const r = await post('/v1/remove-bg', { image: blob }); const b = await r.blob(); return U.loadImage(URL.createObjectURL(b)); }
    try { const lib = await imgly(); const out = await (lib.removeBackground || lib.default)(blob, { device: 'cpu' }); return U.loadImage(URL.createObjectURL(out)); }
    catch (e) { console.warn('model unavailable, using lite mode', e); U.toast('Model could not load, used quick mode'); return liteRemove(c); }
  };
  Ph.removeBackground = async function (el) {
    if (el.type !== 'image') { U.toast('Select a photo first'); return; } await waitImg(el); const done = busy('Removing background'); try { const res = await Ph.cutout(el); const c = U.newCanvas(res.width || res.naturalWidth, res.height || res.naturalHeight); c.getContext('2d').drawImage(res, 0, 0); await setSrc(el, c, 'Remove background'); } catch (e) { console.error(e); U.toast('Could not remove the background'); } finally { done(); }
  };
  Ph.magicGrab = async function (el) {
    await waitImg(el); const done = busy('Lifting the subject'); try {
      const res = await Ph.cutout(el); const c = U.newCanvas(res.width || res.naturalWidth, res.height || res.naturalHeight); c.getContext('2d').drawImage(res, 0, 0); const blob = await U.canvasBlob(c); const id = await OC.assets.add(blob, 'Subject.png');
      const cut = D.make('image', { name: 'Subject', x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot, src: 'asset:' + id, fit: el.fit, crop: U.clone(el.crop) });
      // fill hole in original
      const src = await srcCanvas(el, 1600); const m = U.newCanvas(src.width, src.height); const mg = m.getContext('2d'); mg.drawImage(c, 0, 0, src.width, src.height); const md = mg.getImageData(0, 0, src.width, src.height); for (let i = 0; i < md.data.length; i += 4) { const a = md.data[i + 3] > 24 ? 255 : 0; md.data[i] = 255; md.data[i + 1] = 255; md.data[i + 2] = 255; md.data[i + 3] = a; } mg.putImageData(md, 0, 0); const mm = U.newCanvas(src.width, src.height); const mg2 = mm.getContext('2d'); mg2.filter = `blur(${Math.max(2, src.width / 160)}px)`; mg2.drawImage(m, 0, 0); mg2.filter = 'none'; const dd = mg2.getImageData(0, 0, src.width, src.height); for (let i = 0; i < dd.data.length; i += 4) dd.data[i + 3] = dd.data[i + 3] > 10 ? 255 : 0; mg2.putImageData(dd, 0, 0);
      const filled = inpaint(src, mm); await setSrc(el, filled, 'Magic grab'); const f = D.find(el.id); const list = f.parentEl ? f.parentEl.children : f.page.elements; list.splice(list.indexOf(el) + 1, 0, cut); D.reindex && D.reindex(); OC.sel.set([cut.id]); OC.history.commit('Magic grab');
    } catch (e) { console.error(e); U.toast('Could not lift the subject'); } finally { done(); }
  };

  /* magic eraser */
  function inpaint(srcC, maskC) { // onion peel diffusion with texture noise
    const W = srcC.width, H = srcC.height; const out = U.newCanvas(W, H), og = out.getContext('2d'); og.drawImage(srcC, 0, 0); const id = og.getImageData(0, 0, W, H), d = id.data; const md = maskC.getContext('2d').getImageData(0, 0, W, H).data;
    const hole = new Uint8Array(W * H); let cnt = 0; for (let p = 0; p < W * H; p++) if (md[p * 4 + 3] > 40) { hole[p] = 1; cnt++; }
    let guard = 0; const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    while (cnt > 0 && guard++ < 600) {
      const fill = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!hole[p]) continue; let r = 0, g = 0, b = 0, n = 0; for (const [dx, dy] of dirs) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (!hole[q]) { const w = dx && dy ? .7 : 1; r += d[q * 4] * w; g += d[q * 4 + 1] * w; b += d[q * 4 + 2] * w; n += w; } } if (n) fill.push([p, r / n, g / n, b / n]); }
      if (!fill.length) break; for (const [p, r, g, b] of fill) { const nz = (Math.random() - .5) * 6; d[p * 4] = clamp8(r + nz); d[p * 4 + 1] = clamp8(g + nz); d[p * 4 + 2] = clamp8(b + nz); d[p * 4 + 3] = 255; hole[p] = 0; cnt--; }
    }
    og.putImageData(id, 0, 0); return out;
  }
  Ph.inpaint = inpaint;
  Ph.startEraser = function (el, kind) { S.photoTool = { kind: kind || 'eraser', id: el.id, size: 48, auto: false }; ensureMask(el); R.invalidate(); };
  Ph.clearMask = function () { if (maskCanvas) { maskCanvas.getContext('2d').clearRect(0, 0, maskCanvas.width, maskCanvas.height); R.invalidate(); } };
  Ph.applyEraser = async function () {
    const t = S.photoTool, el = curEl(); if (!t || !el || !maskCanvas) return; await waitImg(el); const done = busy('Erasing'); try {
      const img = OC.assets.img(el.src), nw = img.naturalWidth, nh = img.naturalHeight, r = imgRect(el); const k = Math.min(1, 1800 / Math.max(nw, nh)), W = Math.round(nw * k), H = Math.round(nh * k); const src = U.newCanvas(W, H); src.getContext('2d').drawImage(img, 0, 0, W, H);
      const m = U.newCanvas(W, H), mg = m.getContext('2d'); mg.setTransform(W / r.w, 0, 0, H / r.h, -r.x * W / r.w, -r.y * H / r.h); mg.drawImage(maskCanvas, 0, 0, el.w, el.h); mg.setTransform(1, 0, 0, 1, 0, 0);
      const big = U.newCanvas(W, H), bg = big.getContext('2d'); bg.filter = `blur(${Math.max(1, W / 500)}px)`; bg.drawImage(m, 0, 0); bg.filter = 'none'; // grow slightly
      let res; if (useServer()) { const r2 = await post('/v1/inpaint', { image: await U.canvasBlob(src), mask: await U.canvasBlob(big) }); res = await U.loadImage(URL.createObjectURL(await r2.blob())); const c = U.newCanvas(W, H); c.getContext('2d').drawImage(res, 0, 0, W, H); res = c; } else res = inpaint(src, big);
      await setSrc(el, res, 'Magic eraser'); Ph.clearMask();
    } catch (e) { console.error(e); U.toast('Could not erase that'); } finally { done(); }
  };

  /* grab text */
  let tessP = null;
  Ph.grabText = async function (el) {
    if (el.type !== 'image') { U.toast('Select a photo first'); return; } await waitImg(el); const done = busy('Reading text'); try {
      const c = await srcCanvas(el, 2400); let lines = [];
      if (useServer()) { const r = await post('/v1/ocr', { image: await U.canvasBlob(c) }); const j = await r.json(); lines = j.lines || []; }
      else { if (!tessP) tessP = U.loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'); await tessP; const res = await Tesseract.recognize(c, 'eng'); lines = (res.data.lines || []).filter(l => l.confidence > 55 && l.text.trim()).map(l => ({ text: l.text.replace(/\n/g, ' ').trim(), x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 })); }
      if (!lines.length) { U.toast('No text found'); return; }
      const r = imgRect(el), sx = r.w / c.width, sy = r.h / c.height; const f = D.find(el.id); const list = f.parentEl ? f.parentEl.children : f.page.elements; const made = [];
      const mask = U.newCanvas(c.width, c.height), mg = mask.getContext('2d'); mg.fillStyle = '#fff'; const pad = 4;
      lines.forEach(l => { mg.fillRect(l.x0 - pad, l.y0 - pad, l.x1 - l.x0 + pad * 2, l.y1 - l.y0 + pad * 2); const px = c.getContext('2d').getImageData(Math.max(0, l.x0), Math.max(0, l.y0), Math.max(1, l.x1 - l.x0), Math.max(1, l.y1 - l.y0)).data; let dark = 0, light = 0, rr = 0, gg = 0, bb = 0; for (let i = 0; i < px.length; i += 4) { const lu = lum(px[i], px[i + 1], px[i + 2]); if (lu < 128) { dark++; rr += px[i]; gg += px[i + 1]; bb += px[i + 2]; } else light++; } const dk = dark < light; const col = dk ? '#' + [rr, gg, bb].map(v => Math.round(v / Math.max(1, dark)).toString(16).padStart(2, '0')).join('') : '#ffffff'; const lh = (l.y1 - l.y0) * sy; const t = D.make('text', { name: 'Text', runs: [{ t: l.text }], x: el.x + r.x + l.x0 * sx, y: el.y + r.y + l.y0 * sy, fs: Math.max(8, Math.round(lh * .78)), w: Math.max(40, (l.x1 - l.x0) * sx * 1.1), fills: [D.solid(dk ? (dark ? col : '#1c1c28') : '#fff')], ff: 'Inter' }); t.h = OC.text.layout(t).h; made.push(t); });
      const filled = inpaint(c, mask); await setSrc(el, filled, 'Grab text'); const i = list.indexOf(el); list.splice(i + 1, 0, ...made); D.reindex && D.reindex(); OC.sel.set(made.map(m => m.id)); OC.history.commit('Grab text');
    } catch (e) { console.error(e); U.toast('Text grab needs an internet connection the first time'); } finally { done(); }
  };

  /* background generator */
  const MOODS = { sunset: ['#0b2545', '#ff5d8f', '#ffb020'], ocean: ['#03045e', '#0077b6', '#90e0ef'], forest: ['#1b4332', '#52b788', '#d8f3dc'], neon: ['#0b0014', '#2563eb', '#00f5d4'], pastel: ['#cdb4db', '#ffc8dd', '#bde0fe'], night: ['#0b1026', '#2a3b8f', '#9db4ff'], warm: ['#7f1d1d', '#f97316', '#fde68a'], mint: ['#064e3b', '#10b981', '#d1fae5'], rose: ['#4a0d2a', '#e11d74', '#fecdd3'], studio: ['#d9d9df', '#f4f4f7', '#bfc0c8'] };
  Ph.generateBackground = async function (prompt, w, hh, seed) {
    if (useServer()) { try { const r = await post('/v1/generate-bg', { prompt, width: w, height: hh }); return await U.loadImage(URL.createObjectURL(await r.blob())); } catch (e) { U.toast('Server failed, made a gradient instead'); } }
    const p = (prompt || '').toLowerCase(); let key = Object.keys(MOODS).find(k => p.includes(k)) || (/sun|dusk|evening|gold/.test(p) ? 'sunset' : /sea|water|beach|blue/.test(p) ? 'ocean' : /tree|green|nature|leaf/.test(p) ? 'forest' : /dark|space|moon/.test(p) ? 'night' : /soft|baby|candy/.test(p) ? 'pastel' : /party|club|cyber/.test(p) ? 'neon' : Object.keys(MOODS)[(seed || Math.floor(Math.random() * 99)) % Object.keys(MOODS).length]);
    const cols = MOODS[key], W = Math.min(w, 1600), H = Math.round(W * hh / w); const c = U.newCanvas(W, H), g = c.getContext('2d'); const r = (() => { let s = (seed || 7) * 7919 + p.length * 31; return () => (s = (s * 1664525 + 1013904223) | 0, (s >>> 0) / 4294967296); })();
    const gr = g.createLinearGradient(0, 0, W * r(), H); gr.addColorStop(0, cols[0]); gr.addColorStop(.6, cols[1]); gr.addColorStop(1, cols[2]); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.filter = `blur(${W / 18}px)`; for (let i = 0; i < 6; i++) { g.fillStyle = U.rgba(cols[(i + 1) % 3], .5); g.beginPath(); g.ellipse(r() * W, r() * H, W * (.15 + r() * .25), H * (.15 + r() * .25), r() * 3, 0, 7); g.fill(); } g.filter = 'none';
    if (/bokeh|light|party|city|night/.test(p) || key === 'neon' || key === 'night') { g.globalCompositeOperation = 'screen'; for (let i = 0; i < 36; i++) { const rr = W * (.01 + r() * .05), x = r() * W, y = r() * H; const bg = g.createRadialGradient(x, y, 0, x, y, rr); bg.addColorStop(0, U.rgba(cols[2], .55)); bg.addColorStop(1, U.rgba(cols[2], 0)); g.fillStyle = bg; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over'; }
    return c;
  };
  Ph.replaceBackground = async function (el) {
    if (!el || el.type !== 'image') { U.toast('Select a photo first'); return; }
    let prompt = ''; const inp = h('input.input', { placeholder: T('For example sunset beach'), onkeydown: e => { e.stopPropagation(); } });
    UI.modal({ title: 'Replace background', width: 420, body: [h('p.muted.small', T(useServer() ? 'Generated on your server' : 'Generated on this device. Connect a server for photoreal results.')), inp], actions: [{ label: 'Cancel' }, { label: 'Replace', primary: true, onclick: async () => {
      const done = busy('Working'); try { await waitImg(el); const cut = await Ph.cutout(el); const bg = await Ph.generateBackground(inp.value, 1200, Math.round(1200 * el.h / el.w)); const img = OC.assets.img(el.src); const W = img.naturalWidth, H = img.naturalHeight; const c = U.newCanvas(W, H), g = c.getContext('2d'); g.drawImage(bg, 0, 0, W, H); g.drawImage(cut, 0, 0, W, H); await setSrc(el, c, 'Replace background'); } catch (e) { console.error(e); U.toast('Could not replace the background'); } finally { done(); }
    } }] });
  };

  /* ---------- panel ---------- */
  const sel = () => { const e = OC.sel.one(); return e && (e.type === 'image' || e.type === 'video') ? e : null; };
  const setAdj = (k, v, commit) => { const els = OC.sel.els().filter(e => e.adj); els.forEach(e => { if (v === null || v === undefined) delete e.adj[k]; else e.adj[k] = v; }); R.invalidate(); if (commit) OC.history.commit('Adjust photo'); };
  const row = (label, k, min, max, step = 1) => { const e = sel(); const v = (e.adj[k] || 0); const out = h('span.val', String(Math.round(v * 100) / 100)); const sl = UI.slider(v, min, max, step, val => { setAdj(k, val === 0 ? null : val, false); out.textContent = Math.round(val * 100) / 100; }, () => OC.history.commit('Adjust photo')); return h('div.adj-row', h('label', { ondblclick: () => { setAdj(k, null, true); sl.value = 0; sl.dispatchEvent(new Event('input')); } }, T(label)), sl, out); };
  UI.panels.photo = { title: 'Photo', render(host, opts) {
    const body = h('div'); host.append(body); let tab = opts.tab || 'adjust';
    const draw = () => {
      body.textContent = ''; const e = sel(); if (!e) { body.append(UI.empty('Select a photo or video to edit')); return; }
      const adv = OC.settings.mode === 'advanced';
      const tabs = [['adjust', 'Adjust'], ['filters', 'Filters'], ['light', 'Light'], ['color', 'Color'], ['ai', 'AI tools']]; if (adv) tabs.push(['pin', 'Pin']);
      body.append(h('div.chips.scroll', tabs.map(([k, l]) => h('button.chip' + (k === tab ? '.on' : ''), { onclick: () => { tab = k; if (k !== 'pin' && k !== 'ai') Ph.leavePanel(); draw(); } }, T(l)))));
      if (tab === 'adjust') {
        body.append(UI.section('Light', h('div', row('Exposure', 'exposure', -2, 2, .01), row('Contrast', 'contrast', -100, 100), row('Highlights', 'highlights', -100, 100), row('Shadows', 'shadows', -100, 100), adv ? row('Whites', 'whites', -100, 100) : '', adv ? row('Blacks', 'blacks', -100, 100) : '')), UI.section('Color', h('div', row('Temperature', 'temp', -100, 100), row('Tint', 'tint', -100, 100), row('Saturation', 'saturation', -100, 100), row('Vibrance', 'vibrance', -100, 100), adv ? row('Hue', 'hue', -180, 180) : '')), UI.section('Detail', h('div', row('Sharpen', 'sharpen', 0, 100), adv ? row('Clarity', 'clarity', 0, 100) : '', row('Blur', 'blur', 0, 40), row('Vignette', 'vignette', -100, 100), row('Grain', 'grain', 0, 100), row('Fade', 'fade', 0, 100))), UI.btn('Reset all', () => { e.adj = {}; OC.history.commit('Reset photo'); draw(); }, { cls: 'full' }));
      } else if (tab === 'filters') {
        const thumb = (name) => { const c = U.newCanvas(96, 96); const img = OC.assets.img(e.src) || e._poster; if (img) { const t = work(img, img.naturalWidth || img.width, img.naturalHeight || img.height, 120); const tmp = { id: 'th_' + name, type: 'image', adj: { filter: name } }; const out = Ph.process(tmp, t, { w: 96, scale: 1 }); const g = c.getContext('2d'); const s = Math.max(96 / out.width, 96 / out.height); g.drawImage(out, (96 - out.width * s) / 2, (96 - out.height * s) / 2, out.width * s, out.height * s); } return c; };
        body.append(h('div.grid3.filters', Object.keys(FILTERS).map(n => h('button.filter' + ((e.adj.filter || 'None') === n ? '.on' : ''), { onclick: () => { setAdj('filter', n === 'None' ? null : n, true); draw(); } }, thumb(n), h('small', T(n))))), UI.field('Strength', UI.slider(e.adj.filterAmt == null ? 1 : e.adj.filterAmt, 0, 1.5, .01, v => setAdj('filterAmt', v, false), () => OC.history.commit('Filter'))));
      } else if (tab === 'light') {
        const L = e.adj.light || { on: false, x: .3, y: .25, r: .6, int: 60, color: '#ffd9a0', shade: 0, rays: 0 }; const upd = (k, v, c) => { const cur = e.adj.light || { ...L, on: true }; cur[k] = v; cur.on = true; e.adj.light = cur; R.invalidate(); if (c) OC.history.commit('Lighting'); };
        body.append(UI.field('Light source', UI.toggle(!!(e.adj.light && e.adj.light.on !== false), v => { if (v) e.adj.light = { ...L, on: true }; else delete e.adj.light; OC.history.commit('Lighting'); draw(); })));
        if (e.adj.light) body.append(...[['Position X', 'x', 0, 1, .01], ['Position Y', 'y', 0, 1, .01], ['Radius', 'r', .1, 1.5, .01], ['Intensity', 'int', 0, 100, 1], ['Shadow falloff', 'shade', 0, 90, 1], adv ? ['Light rays', 'rays', 0, 100, 1] : null].filter(Boolean).map(([l, k, a, b, s]) => h('div.adj-row', h('label', T(l)), UI.slider(L[k] || 0, a, b, s, v => upd(k, v), () => OC.history.commit('Lighting')), h('span.val', ''))), h('div.row', h('span.lbl', T('Color')), UI.colorBtn(L.color, v => upd('color', v), v => upd('color', v, true))), h('div.chips', [['Warm', '#ffd9a0'], ['Cool', '#a0c8ff'], ['Neon', '#ff5dd8'], ['White', '#ffffff'], ['Golden', '#ffb347']].map(([n, c]) => h('button.chip', { onclick: () => { upd('color', c, true); draw(); } }, T(n)))));
        else body.append(h('p.muted.small', T('Add a light to relight your photo')));
      } else if (tab === 'color') {
        const du = e.adj.duotone; body.append(UI.section('Duotone', h('div', h('div.chips', DUOS.map(([n, a, b]) => h('button.duo' + (du && du.a === a && du.b === b ? '.on' : ''), { title: n, style: `background:linear-gradient(135deg,${a},${b})`, onclick: () => { e.adj.duotone = { a, b, amt: 100 }; OC.history.commit('Duotone'); draw(); } }))), du ? h('div', h('div.row', h('span.lbl', T('Shadows')), UI.colorBtn(du.a, v => { du.a = v; R.invalidate(); }, v => { du.a = v; OC.history.commit('Duotone'); }), h('span.lbl', T('Highlights')), UI.colorBtn(du.b, v => { du.b = v; R.invalidate(); }, v => { du.b = v; OC.history.commit('Duotone'); })), UI.field('Amount', UI.slider(du.amt, 0, 100, 1, v => { du.amt = v; R.invalidate(); }, () => OC.history.commit('Duotone'))), UI.btn('Remove duotone', () => { delete e.adj.duotone; OC.history.commit('Duotone'); draw(); }, { cls: 'full' })) : '')));
        if (adv) body.append(UI.section('Curves', curvesUI(e)));
      } else if (tab === 'ai') {
        const st = OC.settings.ai; body.append(h('div.ai-chip', h('span', { html: OC.icon(st.where === 'server' ? 'server' : 'cpu', 15) }), h('span', T(st.where === 'server' ? 'Running on your server' : 'Running on this device')), UI.btn('Change', () => UI.settings('AI'), {})));
        body.append(h('div.grid2', [['eraser', 'Remove background', () => Ph.removeBackground(e)], ['scissors', 'Magic grab', () => Ph.magicGrab(e)], ['scan-text', 'Grab text', () => Ph.grabText(e)], ['image', 'Replace background', () => Ph.replaceBackground(e)]].map(([i, l, f]) => h('button.tool-card', { onclick: f }, h('span', { html: OC.icon(i, 24) }), h('b', T(l))))));
        const t = S.photoTool && S.photoTool.kind === 'eraser' ? S.photoTool : null; body.append(UI.section('Magic eraser', h('div', h('p.muted.small', T('Paint over what you want gone')), t ? h('div', UI.field('Brush', UI.slider(t.size, 8, 200, 1, v => { t.size = v; }, null)), h('div.row', UI.btn('Erase', () => Ph.applyEraser(), { primary: true }), UI.btn('Clear', () => Ph.clearMask()), UI.btn('Done', () => { Ph.cancel(); draw(); }))) : UI.btn('Start painting', () => { Ph.startEraser(e); draw(); }, { icon: 'brush', cls: 'full' }))));
      } else if (tab === 'pin') {
        body.append(h('p.muted.small', T('Drag the four corners on the canvas to warp the photo')), UI.btn(S.photoTool && S.photoTool.kind === 'pin' ? 'Done' : 'Pin corners', () => { if (S.photoTool && S.photoTool.kind === 'pin') Ph.cancel(); else Ph.startPin(e); draw(); }, { primary: true, cls: 'full', icon: 'move-3d' }), UI.btn('Reset corners', () => { delete e.adj.pin; if (S.photoTool && S.photoTool.kind === 'pin') Ph.startPin(e); OC.history.commit('Corner pin'); }, { cls: 'full' }));
      }
    };
    if (opts.tool === 'eraser' && sel()) Ph.startEraser(sel()); draw(); const off = OC.bus.on('selection', U.debounce(() => { if (UI.curPanel === 'photo') draw(); }, 80)); host._off = off;
  } };
  function curvesUI(e) {
    const c = U.newCanvas(220, 220); c.className = 'curves'; const g = c.getContext('2d'); let ch = 'all'; const pts = () => { e.adj.curve = e.adj.curve || {}; return (e.adj.curve[ch] = e.adj.curve[ch] || [[0, 0], [255, 255]]); };
    const draw = () => { g.clearRect(0, 0, 220, 220); g.fillStyle = 'rgba(128,128,128,.12)'; g.fillRect(0, 0, 220, 220); g.strokeStyle = 'rgba(128,128,128,.3)'; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 55, 0); g.lineTo(i * 55, 220); g.moveTo(0, i * 55); g.lineTo(220, i * 55); g.stroke(); } const p = pts(); const lut = curveLUT(p); g.strokeStyle = { all: '#fff', r: '#ff5d5d', g: '#5dff8f', b: '#5da8ff' }[ch]; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < 256; x++) { const X = x / 255 * 220, Y = 220 - lut[x] / 255 * 220; x ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke(); p.forEach(q => { g.fillStyle = '#fff'; g.beginPath(); g.arc(q[0] / 255 * 220, 220 - q[1] / 255 * 220, 5, 0, 7); g.fill(); }); };
    let drag = null; const pos = ev => { const r = c.getBoundingClientRect(); return [U.clamp((ev.clientX - r.left) / r.width * 255, 0, 255), U.clamp(255 - (ev.clientY - r.top) / r.height * 255, 0, 255)]; };
    c.onpointerdown = ev => { c.setPointerCapture(ev.pointerId); const p = pts(), q = pos(ev); let i = p.findIndex(pp => Math.hypot(pp[0] - q[0], pp[1] - q[1]) < 14); if (i < 0) { p.push(q); p.sort((a, b) => a[0] - b[0]); i = p.indexOf(q); } drag = i; draw(); };
    c.onpointermove = ev => { if (drag == null) return; const p = pts(), q = pos(ev); if (drag === 0 || drag === p.length - 1) q[0] = p[drag][0]; else q[0] = U.clamp(q[0], p[drag - 1][0] + 2, p[drag + 1][0] - 2); p[drag] = q; draw(); R.invalidate(); };
    c.onpointerup = () => { drag = null; OC.history.commit('Curves'); }; c.ondblclick = ev => { const p = pts(), q = pos(ev); const i = p.findIndex(pp => Math.hypot(pp[0] - q[0], pp[1] - q[1]) < 14); if (i > 0 && i < p.length - 1) { p.splice(i, 1); draw(); R.invalidate(); OC.history.commit('Curves'); } };
    draw(); return h('div', UI.seg([{ v: 'all', label: 'RGB' }, { v: 'r', label: 'R' }, { v: 'g', label: 'G' }, { v: 'b', label: 'B' }], ch, v => { ch = v; draw(); }), c, UI.btn('Reset curves', () => { delete e.adj.curve; draw(); R.invalidate(); OC.history.commit('Curves'); }, { cls: 'full' }));
  }
})();
