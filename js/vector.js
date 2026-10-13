/* Vector engine: shapes, paths, booleans, stroke profiles, symbols */
(function () {
  const U = OC.U, D = OC.doc;
  const V = OC.vec = {};
  let ready = false;
  V.init = function () { if (ready || !window.paper) return; paper.setup(U.newCanvas(4, 4)); paper.view.autoUpdate = false; ready = true; };

  /* preset shapes in a 100x100 box */
  V.SHAPES = {
    'Heart': 'M50 88 C20 65 5 45 5 28 C5 14 16 6 28 6 C38 6 46 12 50 20 C54 12 62 6 72 6 C84 6 95 14 95 28 C95 45 80 65 50 88 Z',
    'Cloud': 'M25 78 C8 78 2 60 14 52 C12 36 30 28 40 36 C46 22 70 22 74 38 C90 36 98 52 88 62 C96 74 86 80 76 78 Z',
    'Speech': 'M15 10 H85 Q95 10 95 20 V60 Q95 70 85 70 H45 L25 90 V70 H15 Q5 70 5 60 V20 Q5 10 15 10 Z',
    'Arrow': 'M5 38 H55 V15 L95 50 L55 85 V62 H5 Z',
    'Double arrow': 'M5 50 L30 25 V40 H70 V25 L95 50 L70 75 V60 H30 V75 Z',
    'Chevron': 'M20 5 L70 50 L20 95 L35 95 L85 50 L35 5 Z',
    'Plus': 'M38 5 H62 V38 H95 V62 H62 V95 H38 V62 H5 V38 H38 Z',
    'Cross': 'M20 8 L50 38 L80 8 L92 20 L62 50 L92 80 L80 92 L50 62 L20 92 L8 80 L38 50 L8 20 Z',
    'Check': 'M8 55 L22 41 L40 59 L78 17 L92 31 L40 87 Z',
    'Bolt': 'M58 3 L18 55 H42 L35 97 L82 40 H56 Z',
    'Moon': 'M60 5 C30 10 10 35 15 62 C20 88 50 100 75 88 C50 85 38 55 48 30 C52 20 56 12 60 5 Z',
    'Drop': 'M50 5 C50 5 15 45 15 65 C15 85 30 95 50 95 C70 95 85 85 85 65 C85 45 50 5 50 5 Z',
    'Diamond': 'M50 3 L97 50 L50 97 L3 50 Z',
    'Trapezoid': 'M25 15 H75 L97 85 H3 Z',
    'Parallelogram': 'M25 15 H97 L75 85 H3 Z',
    'Pentagon': 'M50 4 L96 38 L78 92 H22 L4 38 Z',
    'Octagon': 'M30 3 H70 L97 30 V70 L70 97 H30 L3 70 V30 Z',
    'Ring': 'M50 3 A47 47 0 1 0 50 97 A47 47 0 1 0 50 3 Z M50 22 A28 28 0 1 1 50 78 A28 28 0 1 1 50 22 Z',
    'Pie': 'M50 50 L50 3 A47 47 0 1 1 8 71 Z',
    'Half circle': 'M3 70 A47 47 0 0 1 97 70 Z',
    'Right triangle': 'M5 95 V5 L95 95 Z',
    'Flag': 'M15 5 V95 H23 V55 H85 L65 30 L85 5 Z',
    'Ribbon': 'M3 20 H97 L82 50 L97 80 H3 L18 50 Z',
    'Arch': 'M10 95 V50 A40 40 0 0 1 90 50 V95 Z',
    'Blob 1': 'M45 5 C70 0 95 20 92 48 C90 75 70 97 45 93 C18 90 3 70 8 45 C12 25 25 8 45 5 Z',
    'Blob 2': 'M50 8 C75 5 98 30 88 55 C80 78 55 95 32 85 C8 75 2 45 15 25 C25 12 38 9 50 8 Z',
    'Bookmark': 'M20 5 H80 V95 L50 70 L20 95 Z',
    'Shield': 'M50 3 L90 17 V50 C90 75 70 90 50 97 C30 90 10 75 10 50 V17 Z',
    'Pin': 'M50 97 C50 97 15 60 15 38 C15 18 30 3 50 3 C70 3 85 18 85 38 C85 60 50 97 50 97 Z M50 25 A13 13 0 1 0 50 51 A13 13 0 1 0 50 25 Z',
    'Sparkle': 'M50 3 C54 30 70 46 97 50 C70 54 54 70 50 97 C46 70 30 54 3 50 C30 46 46 30 50 3 Z',
    'Wave': 'M0 40 C15 10 35 10 50 40 C65 70 85 70 100 40 V100 H0 Z',
    'Rounded square': 'M25 5 H75 Q95 5 95 25 V75 Q95 95 75 95 H25 Q5 95 5 75 V25 Q5 5 25 5 Z',
    'Tag': 'M5 15 Q5 5 15 5 H55 L95 45 Q100 50 95 55 L55 95 Q50 100 45 95 L5 55 Z',
    'Crescent star': 'M50 5 L61 36 L95 38 L68 58 L78 92 L50 72 L22 92 L32 58 L5 38 L39 36 Z'
  };
  const evenodd = { Ring: 1, Pin: 1 };

  /* convert svg path data to subpaths in its own coordinate system, returns {subpaths, bounds} */
  V.fromD = function (d) {
    V.init(); const item = new paper.CompoundPath(d); const res = V.fromPaper(item); item.remove(); return res;
  };
  V.fromPaper = function (item) {
    const paths = item.children ? item.children : [item]; const subpaths = [];
    paths.forEach(p => {
      if (!p.segments || !p.segments.length) return;
      subpaths.push({ closed: p.closed, nodes: p.segments.map(s => ({ x: s.point.x, y: s.point.y, ix: s.handleIn.x, iy: s.handleIn.y, ox: s.handleOut.x, oy: s.handleOut.y })) });
    });
    const b = item.bounds; return { subpaths, bounds: { x: b.x, y: b.y, w: b.width, h: b.height }, fillRule: item.fillRule };
  };
  V.makePathEl = function (subpaths, bounds, extra) {
    const subs = subpaths.map(sp => ({ closed: sp.closed, nodes: sp.nodes.map(n => ({ ...n, x: n.x - bounds.x, y: n.y - bounds.y })) }));
    return D.make('path', Object.assign({ subpaths: subs, vw: Math.max(bounds.w, .01), vh: Math.max(bounds.h, .01), x: bounds.x, y: bounds.y, w: Math.max(bounds.w, .01), h: Math.max(bounds.h, .01) }, extra || {}));
  };
  V.shapeEl = function (name, size = 200) {
    const r = V.fromD(V.SHAPES[name]);
    const el = V.makePathEl(r.subpaths, r.bounds, { name, fillRule: evenodd[name] ? 'evenodd' : 'nonzero' });
    el.x = 0; el.y = 0; el.w = size; el.h = size * (r.bounds.h / Math.max(r.bounds.w, .01)); return el;
  };

  /* Path2D builders (element local coordinates) */
  const wm = new WeakMap();
  function rr(p, x, y, w, h, r) {
    const R = Array.isArray(r) ? r : [r, r, r, r]; const m = Math.min(w, h) / 2;
    const [a, b, c, d] = R.map(v => Math.min(Math.max(v || 0, 0), m));
    p.moveTo(x + a, y); p.lineTo(x + w - b, y); b ? p.arcTo(x + w, y, x + w, y + b, b) : 0; p.lineTo(x + w, y + h - c); c ? p.arcTo(x + w, y + h, x + w - c, y + h, c) : 0;
    p.lineTo(x + d, y + h); d ? p.arcTo(x, y + h, x, y + h - d, d) : 0; p.lineTo(x, y + a); a ? p.arcTo(x, y, x + a, y, a) : 0; p.closePath();
  }
  V.polyPoints = function (el) {
    const cx = el.w / 2, cy = el.h / 2, rx = el.w / 2, ry = el.h / 2; const pts = [];
    if (el.type === 'polygon') { const n = Math.max(3, el.sides | 0); for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } }
    else { const n = Math.max(3, el.points | 0); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, k = i % 2 ? el.inner : 1; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); } }
    return pts;
  };
  V.path2D = function (el) {
    const p = new Path2D();
    switch (el.type) {
      case 'rect': case 'image': case 'video': case 'frame': case 'text': case 'scene3d': case 'group': case 'audio': rr(p, 0, 0, el.w, el.h, el.radius || 0); break;
      case 'ellipse': p.ellipse(el.w / 2, el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2); break;
      case 'polygon': case 'star': {
        const pts = V.polyPoints(el); const r = el.radius || 0;
        if (!r) { pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); p.closePath(); }
        else { const n = pts.length; for (let i = 0; i < n; i++) { const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n]; const l1 = Math.hypot(a[0] - b[0], a[1] - b[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]); const rr_ = Math.min(r, l1 / 2, l2 / 2); const p1 = [b[0] + (a[0] - b[0]) / l1 * rr_, b[1] + (a[1] - b[1]) / l1 * rr_], p2 = [b[0] + (c[0] - b[0]) / l2 * rr_, b[1] + (c[1] - b[1]) / l2 * rr_]; i ? p.lineTo(p1[0], p1[1]) : p.moveTo(p1[0], p1[1]); p.quadraticCurveTo(b[0], b[1], p2[0], p2[1]); } p.closePath(); }
        break;
      }
      case 'line': p.moveTo(0, 0); p.lineTo(el.w, 0); break;
      case 'path': {
        const hit = wm.get(el.subpaths); const key = el.w + 'x' + el.h; if (hit && hit.key === key) return hit.p;
        const sx = el.w / el.vw, sy = el.h / el.vh;
        el.subpaths.forEach(sp => {
          const n = sp.nodes; if (!n.length) return; p.moveTo(n[0].x * sx, n[0].y * sy);
          const seg = (a, b) => { if (!a.ox && !a.oy && !b.ix && !b.iy) p.lineTo(b.x * sx, b.y * sy); else p.bezierCurveTo((a.x + a.ox) * sx, (a.y + a.oy) * sy, (b.x + b.ix) * sx, (b.y + b.iy) * sy, b.x * sx, b.y * sy); };
          for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]); if (sp.closed && n.length > 1) { seg(n[n.length - 1], n[0]); p.closePath(); }
        });
        wm.set(el.subpaths, { key, p }); return p;
      }
    }
    return p;
  };

  /* paper path of an element in its local coordinates */
  V.toPaper = function (el) {
    V.init(); let item;
    if (el.type === 'path') {
      const sx = el.w / el.vw, sy = el.h / el.vh; const paths = el.subpaths.map(sp => new paper.Path({ segments: sp.nodes.map(n => new paper.Segment(new paper.Point(n.x * sx, n.y * sy), new paper.Point(n.ix * sx, n.iy * sy), new paper.Point(n.ox * sx, n.oy * sy))), closed: sp.closed }));
      item = new paper.CompoundPath({ children: paths, fillRule: el.fillRule || 'nonzero' });
    } else if (el.type === 'ellipse') item = new paper.Path.Ellipse({ point: [0, 0], size: [el.w, el.h] });
    else if (el.type === 'polygon' || el.type === 'star') item = new paper.Path({ segments: V.polyPoints(el), closed: true });
    else if (el.type === 'line') item = new paper.Path({ segments: [[0, 0], [el.w, 0]] });
    else if (el.type === 'rect' || el.type === 'frame' || el.type === 'image' || el.type === 'video') { const r = Array.isArray(el.radius) ? el.radius[0] : el.radius || 0; item = new paper.Path.Rectangle({ point: [0, 0], size: [el.w, el.h], radius: r }); }
    else return null;
    return item;
  };
  V.toPagePaper = function (el) {
    const item = V.toPaper(el); if (!item) return null;
    D.chain(el.id).reverse().forEach(a => {
      const m = new paper.Matrix().translate(a.x + a.w / 2, a.y + a.h / 2).rotate(a.rot || 0).scale(a.flipX ? -1 : 1, a.flipY ? -1 : 1).translate(-a.w / 2, -a.h / 2);
      item.transform(m);
    });
    return item;
  };
  V.boolean = function (els, op) {
    V.init(); if (els.length < 2) return null;
    const items = els.map(e => V.toPagePaper(e)).filter(Boolean); if (items.length < 2) return null;
    let res = items[0];
    for (let i = 1; i < items.length; i++) { const n = res[op](items[i], { insert: false }); res.remove(); items[i].remove(); res = n; }
    if (!res || res.isEmpty && res.isEmpty()) return null;
    const info = V.fromPaper(res);
    const first = els[0]; const el = V.makePathEl(info.subpaths, info.bounds, { name: ({ unite: 'Union', subtract: 'Subtract', intersect: 'Intersect', exclude: 'Exclude' })[op], fills: U.clone(first.fills), stroke: U.clone(first.stroke), shadows: U.clone(first.shadows), opacity: first.opacity, fillRule: info.fillRule || 'nonzero' });
    res.remove(); return el;
  };
  /* flatten: shapes to a single path in page space, keeping all subpaths */
  V.flatten = function (els) {
    V.init(); const items = []; const walk = e => { if (e.children) e.children.forEach(walk); else { const p = V.toPagePaper(e); if (p) items.push({ p, e }); } };
    els.forEach(walk); if (!items.length) return null;
    const all = new paper.CompoundPath({ children: [] });
    items.forEach(it => { (it.p.children ? it.p.children.slice() : [it.p]).forEach(c => all.addChild(c)); });
    const info = V.fromPaper(all); const first = items[0].e;
    const el = V.makePathEl(info.subpaths, info.bounds, { name: 'Flattened', fills: U.clone(first.fills && first.fills.length ? first.fills : [D.solid('#000000')]), stroke: U.clone(first.stroke), shadows: U.clone(first.shadows), fillRule: 'evenodd' });
    all.remove(); return el;
  };
  V.toPathEl = function (el) {
    if (el.type === 'path') return el; const item = V.toPaper(el); if (!item) return null; const info = V.fromPaper(item);
    const o = { ...U.clone(el), type: 'path', subpaths: info.subpaths.map(sp => ({ ...sp })), vw: Math.max(el.w, .01), vh: Math.max(el.h, .01), fillRule: info.fillRule || 'nonzero' };
    ['radius', 'sides', 'points', 'inner', 'ends'].forEach(k => delete o[k]); item.remove(); return o;
  };
  V.pathD = function (el) {
    const sx = el.w / el.vw, sy = el.h / el.vh; const f = n => U.round(n, 2); let d = '';
    el.subpaths.forEach(sp => {
      const n = sp.nodes; if (!n.length) return; d += `M${f(n[0].x * sx)} ${f(n[0].y * sy)}`;
      const seg = (a, b) => { d += (!a.ox && !a.oy && !b.ix && !b.iy) ? `L${f(b.x * sx)} ${f(b.y * sy)}` : `C${f((a.x + a.ox) * sx)} ${f((a.y + a.oy) * sy)} ${f((b.x + b.ix) * sx)} ${f((b.y + b.iy) * sy)} ${f(b.x * sx)} ${f(b.y * sy)}`; };
      for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]); if (sp.closed && n.length > 1) { seg(n[n.length - 1], n[0]); d += 'Z'; }
    });
    return d;
  };
  V.svgD = function (el) {
    if (el.type === 'path') return V.pathD(el); const p = V.toPathEl(el); return p ? V.pathD(p) : '';
  };

  /* variable width stroke */
  V.PROFILES = { uniform: null, 'taper both': t => Math.sin(Math.PI * t) ** .6, 'taper start': t => t ** .6 * .9 + .1, 'taper end': t => (1 - t) ** .6 * .9 + .1, bulge: t => .35 + .65 * Math.sin(Math.PI * t), 'pen pressure': t => .25 + .75 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** .5 * (1 - t * .3) };
  const profCache = new WeakMap();
  V.profilePath = function (el) {
    const fn = V.PROFILES[el.stroke.profile]; if (!fn) return null;
    const key = el.w + ',' + el.h + ',' + el.stroke.width + el.stroke.profile + (el.type === 'path' ? '' : el.type + (el.radius || '') + (el.sides || '') + (el.points || '')); const k = el.type === 'path' ? el.subpaths : el;
    const c = profCache.get(k); if (c && c.key === key) return c.p;
    const item = V.toPaper(el); if (!item) return null; const out = new Path2D(); const W = el.stroke.width / 2;
    (item.children ? item.children : [item]).forEach(path => {
      const len = path.length; if (!len) return; const n = Math.max(24, Math.min(400, Math.round(len / 3))); const L = [], R = [];
      for (let i = 0; i <= n; i++) { const t = i / n, off = Math.min(len, t * len); const pt = path.getPointAt(off), nm = path.getNormalAt(off); if (!pt || !nm) continue; const w = W * fn(t); L.push([pt.x + nm.x * w, pt.y + nm.y * w]); R.push([pt.x - nm.x * w, pt.y - nm.y * w]); }
      L.forEach((q, i) => i ? out.lineTo(q[0], q[1]) : out.moveTo(q[0], q[1])); R.reverse().forEach(q => out.lineTo(q[0], q[1])); out.closePath();
    });
    item.remove(); profCache.set(k, { key, p: out }); return out;
  };

  /* simplify freehand points to smooth path */
  V.fromPoints = function (pts, tol = 2.5) {
    V.init(); const p = new paper.Path({ segments: pts.map(q => [q.x, q.y]) }); p.simplify(tol);
    const info = V.fromPaper(p); p.remove(); return info;
  };

  /* hit testing */
  const hctx = U.newCanvas(2, 2).getContext('2d');
  V.hit = function (el, lx, ly, tol = 0) {
    if (el.type === 'line') { const d = Math.abs(ly); return lx >= -tol && lx <= el.w + tol && d <= (el.stroke ? el.stroke.width / 2 : 1) + tol + 3; }
    if (el.type === 'path' || el.type === 'ellipse' || el.type === 'polygon' || el.type === 'star') {
      const p = V.path2D(el);
      if (el.fills && el.fills.some(f => f.visible !== false) && hctx.isPointInPath(p, lx, ly, el.fillRule || 'nonzero')) return true;
      if (el.stroke && el.stroke.width > 0) { hctx.lineWidth = el.stroke.width + tol * 2; if (hctx.isPointInStroke(p, lx, ly)) return true; }
      return false;
    }
    return lx >= -tol && ly >= -tol && lx <= el.w + tol && ly <= el.h + tol;
  };

  /* QR code to path element (squares merged into one compound path) */
  V.qrEl = function (text, color = '#000000', bg = '#ffffff') {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); const n = qr.getModuleCount(); const margin = 2; const N = n + margin * 2;
    let d = ''; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    const info = V.fromD(d); const bgEl = D.make('rect', { w: 240, h: 240, fills: [D.solid(bg)], name: 'QR background' });
    const p = V.makePathEl(info.subpaths, { x: 0, y: 0, w: N, h: N }, { name: 'QR modules', fills: [D.solid(color)], fillRule: 'nonzero' }); p.vw = N; p.vh = N; p.w = 240; p.h = 240;
    const g = D.make('group', { name: 'QR code', w: 240, h: 240, children: [bgEl, p], link: text }); return g;
  };
})();
