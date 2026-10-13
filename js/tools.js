/* Drawing tools, text editing, path editing */
(function () {
  const U = OC.U, D = OC.doc, S = OC.S, R = OC.render, E = OC.editor, T = OC.text, h = U.h;
  S.drawColor = '#1c1c28'; S.drawWidth = 6; S.autoKey = false;

  E.setTool = function (name) {
    if (S.tool === 'pen' && name !== 'pen') E.tools.pen.finish(false);
    E.endEdit(); if (name !== 'select') { S.nodeEdit = null; S.cropEl = null; }
    S.tool = name; if (name !== 'select' && name !== 'hand') OC.bus.emit('selection'); OC.bus.emit('tool'); E.over && (E.over.style.cursor = name === 'select' ? '' : name === 'text' ? 'text' : name === 'hand' ? 'grab' : 'crosshair'); R.invalidate();
    if (E.stage) E.stage.dataset.tool = name;
  };
  const back = () => { if (!E.keepTool) E.setTool('select'); };

  /* ---------- shape tools ---------- */
  function shapeTool(type, init) {
    return {
      down(p) {
        const el = D.make(type, { x: p.px, y: p.py, w: 0, h: 0 }); if (init) init(el); const container = S.enter && D.get(S.enter) && D.get(S.enter).children ? D.get(S.enter) : null;
        const frame = type !== 'frame' ? E.frameAt(p.pg, p.px, p.py, []) : null; const par = container || frame;
        let ox = p.px, oy = p.py; if (par) { const lp = D.toLocal(par.id, p.px, p.py); ox = lp.x; oy = lp.y; el.x = ox; el.y = oy; (par.children).push(el); } else p.pg.elements.push(el);
        D.reindex(); OC.sel.set([el.id]);
        S.drag = { type: 'create', pg: p.pg, tool: {
          move(q) {
            let x1 = q.px, y1 = q.py; if (par) { const lp = D.toLocal(par.id, q.px, q.py); x1 = lp.x; y1 = lp.y; }
            let w = x1 - ox, hh = y1 - oy; if (q.shift) { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; }
            let x = ox, y = oy; if (q.alt) { x = ox - w; y = oy - hh; w *= 2; hh *= 2; }
            el.x = Math.min(x, x + w); el.y = Math.min(y, y + hh); el.w = Math.abs(w); el.h = Math.abs(hh); OC.bus.emit('geom'); R.invalidate();
          },
          up(q) {
            if (el.w < 4 && el.h < 4) { const s = type === 'frame' ? 400 : 200; el.w = s; el.h = type === 'frame' ? 300 : s; el.x = ox - el.w / 2; el.y = oy - el.h / 2; }
            if (par) D.fitGroup(par); OC.history.commit('Add ' + el.name); back();
          }
        } };
      }
    };
  }
  E.tools.rect = shapeTool('rect'); E.tools.ellipse = shapeTool('ellipse'); E.tools.polygon = shapeTool('polygon'); E.tools.star = shapeTool('star'); E.tools.frame = shapeTool('frame', e => { e.fills = [D.solid('#ffffff')]; e.name = 'Frame'; });

  E.tools.line = {
    down(p) {
      const el = D.make('line', { x: p.px, y: p.py, w: 1 }); el.stroke.color = S.drawColor; if (E.lineEnd) el.ends.end = E.lineEnd; p.pg.elements.push(el); D.reindex(); OC.sel.set([el.id]); const A = { x: p.px, y: p.py };
      S.drag = { type: 'create', pg: p.pg, tool: {
        move(q) { let m = { x: q.px, y: q.py }; if (q.shift) { const a = Math.atan2(m.y - A.y, m.x - A.x), sn = Math.round(a / (Math.PI / 12)) * Math.PI / 12, L = Math.hypot(m.x - A.x, m.y - A.y); m = { x: A.x + Math.cos(sn) * L, y: A.y + Math.sin(sn) * L }; }
          const L = Math.hypot(m.x - A.x, m.y - A.y), cx = (A.x + m.x) / 2, cy = (A.y + m.y) / 2; el.w = Math.max(L, 1); el.rot = U.deg(Math.atan2(m.y - A.y, m.x - A.x)); el.x = cx - el.w / 2; el.y = cy; OC.bus.emit('geom'); R.invalidate(); },
        up() { if (el.w < 6) { el.w = 240; el.x = A.x - 120; el.rot = 0; } OC.history.commit('Add line'); back(); }
      } };
    }
  };

  /* ---------- text ---------- */
  E.tools.text = {
    down(p) {
      const x0 = p.px, y0 = p.py; const el = D.make('text', { x: x0, y: y0, w: 10, runs: [{ t: '' }], ff: S.project.brand.fonts.body, fs: 48 }); const fr = E.frameAt(p.pg, p.px, p.py, []);
      S.drag = { type: 'create', pg: p.pg, tool: {
        move(q) { const w = Math.abs(q.px - x0); if (w * S.zoom > 6 && !el._in) { el._in = true; el.autoH = true; p.pg.elements.push(el); D.reindex(); OC.sel.set([el.id]); } if (el._in) { el.x = Math.min(x0, q.px); el.w = Math.max(w, 20); R.invalidate(); } },
        up(q) {
          if (!el._in) { el.w = 420; el.x = x0 - 8; el.y = y0 - el.fs * .6; const par = fr; if (par) { const lp = D.toLocal(par.id, x0, y0); el.x = lp.x; el.y = lp.y; par.children.push(el); } else p.pg.elements.push(el); D.reindex(); OC.sel.set([el.id]); }
          S.tool = 'select'; OC.bus.emit('tool'); E.editText(el, { isNew: true });
        }
      } };
    }
  };
  E.tools.sticky = {
    down(p) {
      const cols = ['#fff176', '#ffab91', '#a5d6a7', '#90caf9', '#f48fb1', '#ce93d8']; const c = cols[Math.floor(Math.random() * cols.length)];
      const el = D.make('text', { name: 'Sticky note', x: p.px - 110, y: p.py - 110, w: 220, h: 220, autoH: false, fs: 26, ff: 'Caveat', fw: 600, runs: [{ t: '' }], bg: { color: c, mode: 'sticky' }, valign: 'top', fills: [D.solid('#222222')] });
      el.runs = [{ t: '' }]; p.pg.elements.push(el); D.reindex(); OC.sel.set([el.id]); S.tool = 'select'; OC.bus.emit('tool'); E.editText(el, { isNew: true });
    }
  };

  let ed = null;
  E.isEditing = () => !!ed;
  function styleEditor() {
    if (!ed) return; const el = ed.el, d = ed.div, z = S.zoom; const pg = D.find(el.id); if (!pg) return; const c = D.toPage(el.id, el.w / 2, el.h / 2); const s = E.pgToScreen(pg.page, c.x, c.y);
    const f = (el.fills || []).find(f => f.type === 'solid' && f.visible !== false); const st = d.style;
    st.position = 'absolute'; st.left = (s.x - el.w * z / 2) + 'px'; st.top = (s.y - el.h * z / 2) + 'px'; st.width = el.w * z + 'px'; st.minHeight = el.h * z + 'px'; st.transformOrigin = '50% 50%'; st.transform = `rotate(${E.worldRot(el)}deg)`;
    st.fontFamily = OC.fonts.stack(el.ff); st.fontSize = el.fs * z + 'px'; st.fontWeight = el.fw; st.fontStyle = el.fi ? 'italic' : 'normal'; st.lineHeight = el.lh; st.letterSpacing = (el.ls || 0) * z + 'px'; st.textAlign = el.align; st.color = f ? f.color : '#000';
    st.textDecoration = [el.under ? 'underline' : '', el.strike ? 'line-through' : ''].join(' ').trim() || 'none'; st.textTransform = el.tf === 'upper' ? 'uppercase' : el.tf === 'lower' ? 'lowercase' : el.tf === 'title' ? 'capitalize' : 'none'; st.whiteSpace = 'pre-wrap'; st.wordBreak = 'break-word';
    st.background = el.bg && el.bg.mode === 'sticky' ? el.bg.color : 'transparent'; st.padding = '0'; st.opacity = el.opacity; st.wordSpacing = (el.ws || 0) * z + 'px'; st.fontVariantCaps = el.caps ? 'small-caps' : 'normal';
  }
  E.positionEditor = styleEditor;
  E.editText = function (el, o = {}) {
    E.endEdit(); if (D.isLocked(el.id)) return; S.editing = el.id; OC.fonts.ensure(el.ff);
    const div = h('div.text-edit', { contenteditable: 'true', spellcheck: 'false', 'data-ph': OC.t('Type here') }); div.innerHTML = T.plain(el) ? T.toHTML(el) : '';
    ed = { el, div, isNew: !!o.isNew, before: JSON.stringify(el.runs) }; styleEditor(); E.textHost.append(div); R.invalidate();
    const focus = () => { div.focus(); const r = document.createRange(); r.selectNodeContents(div); if (!o.selectAll) r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }; focus();
    const sync = () => { el.runs = T.fromDOM(div, el, S.zoom); T.clear(); if (el.autoH) { const lay = T.layout(el); el.h = lay.h; } styleEditor(); OC.bus.emit('geom'); R.invalidate(); };
    div.addEventListener('input', sync); ed.sync = sync;
    div.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape') { ev.preventDefault(); E.endEdit(); } if (ev.key === 'Tab') ev.preventDefault(); if ((ev.ctrlKey || ev.metaKey) && /^[biu]$/i.test(ev.key)) { ev.preventDefault(); E.setTextProp({ b: 'bold', i: 'italic', u: 'underline' }[ev.key.toLowerCase()]); } });
    div.addEventListener('paste', ev => { ev.preventDefault(); const t = ev.clipboardData.getData('text/plain'); document.execCommand('insertText', false, t); });
    div.addEventListener('blur', () => setTimeout(() => { if (ed && ed.div === div && !div.contains(document.activeElement) && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-keep-edit]'))) E.endEdit(); }, 60));
    document.addEventListener('selectionchange', ed.selHandler = () => { const s = getSelection(); if (ed && s.rangeCount && div.contains(s.anchorNode)) ed.range = s.getRangeAt(0).cloneRange(); });
    OC.bus.emit('editing', true);
  };
  E.endEdit = function () {
    if (!ed) return; const { el, div, isNew, before } = ed; document.removeEventListener('selectionchange', ed.selHandler); el.runs = T.fromDOM(div, el, S.zoom); div.remove(); ed = null; S.editing = null; T.clear();
    if (!T.plain(el).trim()) { const f = D.find(el.id); if (f) { f.list.splice(f.list.indexOf(el), 1); D.reindex(); OC.sel.clear(); } OC.history.commit('Delete empty text'); }
    else { if (el.autoH) el.h = T.layout(el).h; if (JSON.stringify(el.runs) !== before || isNew) OC.history.commit(isNew ? 'Add text' : 'Edit text'); }
    OC.bus.emit('editing', false); R.invalidate();
  };
  const RUN_KEYS = { bold: 'fw', italic: 'i', underline: 'u', strike: 's', color: 'c', size: 'sz', font: 'ff' };
  /* set a text property from the toolbar; works while editing (partial) or on selected text elements */
  E.setTextProp = function (prop, val, opts = {}) {
    const apply = (el, local) => {
      switch (prop) {
        case 'bold': el.fw = val != null ? val : (el.fw >= 600 ? 400 : 700); (el.runs || []).forEach(r => { delete r.fw; }); break;
        case 'italic': el.fi = val != null ? val : !el.fi; (el.runs || []).forEach(r => { delete r.i; }); break;
        case 'underline': el.under = val != null ? val : !el.under; (el.runs || []).forEach(r => { delete r.u; }); break;
        case 'strike': el.strike = val != null ? val : !el.strike; (el.runs || []).forEach(r => { delete r.s; }); break;
        case 'color': if (el.fills && el.fills[0] && el.fills[0].type === 'solid') el.fills[0].color = val; else el.fills = [D.solid(val)]; (el.runs || []).forEach(r => { delete r.c; }); break;
        case 'size': { const k = val / el.fs; el.fs = val; (el.runs || []).forEach(r => { if (r.sz) r.sz = U.round(r.sz * k, 1); }); break; }
        case 'font': el.ff = val; (el.runs || []).forEach(r => { delete r.ff; }); OC.fonts.ensure(val); break;
        case 'weight': el.fw = val; (el.runs || []).forEach(r => { delete r.fw; }); break;
        default: el[prop] = val;
      }
    };
    if (ed) {
      const el = ed.el, div = ed.div; const sel = getSelection(); if (ed.range && (!sel.rangeCount || !div.contains(sel.anchorNode))) { sel.removeAllRanges(); sel.addRange(ed.range); }
      const partial = sel.rangeCount && !sel.isCollapsed && div.contains(sel.anchorNode) && RUN_KEYS[prop];
      if (partial) {
        div.focus(); document.execCommand('styleWithCSS', false, true);
        if (prop === 'bold') document.execCommand('bold'); else if (prop === 'italic') document.execCommand('italic'); else if (prop === 'underline') document.execCommand('underline'); else if (prop === 'strike') document.execCommand('strikeThrough');
        else if (prop === 'color') document.execCommand('foreColor', false, val); else if (prop === 'font') { document.execCommand('fontName', false, val); OC.fonts.ensure(val); }
        else if (prop === 'size') { document.execCommand('styleWithCSS', false, false); document.execCommand('fontSize', false, '7'); div.querySelectorAll('font[size="7"]').forEach(f => { const sp = document.createElement('span'); sp.style.fontSize = val * S.zoom + 'px'; sp.innerHTML = f.innerHTML; f.replaceWith(sp); }); }
        ed.sync(); return;
      }
      apply(el); styleEditor(); ed.sync(); OC.bus.emit('geom'); return;
    }
    const els = []; const walk = e => { if (e.type === 'text') els.push(e); (e.children || []).forEach(walk); }; OC.sel.els().forEach(walk);
    els.forEach(e => { apply(e); if (e.autoH) e.h = T.layout(e).h; }); T.clear(); if (opts.live) { R.invalidate(); OC.bus.emit('geom'); } else OC.history.commit('Text style');
  };

  /* ---------- pen ---------- */
  const V = OC.vec;
  const P = E.tools.pen = {
    st: null,
    down(p) {
      let st = P.st; if (st && st.pg !== p.pg) P.finish(true); st = P.st = P.st || { pg: p.pg, nodes: [], closed: false, cur: null };
      const f = st.nodes[0]; if (st.nodes.length >= 2 && Math.hypot(p.px - f.x, p.py - f.y) * S.zoom < 10) { st.closed = true; P.finish(true); return; }
      const n = { x: p.px, y: p.py, ix: 0, iy: 0, ox: 0, oy: 0, m: 'corner' }; st.nodes.push(n);
      S.drag = { type: 'create', pg: p.pg, tool: { move(q) { n.ox = q.px - n.x; n.oy = q.py - n.y; n.ix = -n.ox; n.iy = -n.oy; n.m = 'mirror'; E.paintOverlay(); }, up() { E.paintOverlay(); } } };
    },
    hover(p) { if (P.st) { P.st.cur = { x: p.px, y: p.py, pg: p.pg }; E.paintOverlay(); } },
    dbl() { P.finish(true); },
    key(k) { const st = P.st; if (!st) return false; if (k === 'Enter' || k === 'Escape') { P.finish(true); return true; } if (k === 'Backspace' || k === 'Delete') { st.nodes.pop(); if (!st.nodes.length) P.st = null; E.paintOverlay(); return true; } return false; },
    finish(keep) {
      const st = P.st; P.st = null; if (!st || !keep || st.nodes.length < 2) { E.paintOverlay(); return; }
      V.init(); const tmp = { type: 'path', subpaths: [{ closed: st.closed, nodes: st.nodes }], vw: 1, vh: 1, w: 1, h: 1 }; const item = V.toPaper(tmp); const b = item.bounds; item.remove();
      const bounds = { x: b.x, y: b.y, w: Math.max(b.width, 1), h: Math.max(b.height, 1) };
      const subs = [{ closed: st.closed, nodes: st.nodes.map(n => ({ ...n })) }]; const el = V.makePathEl(subs, bounds, { name: 'Path', fills: st.closed ? [D.solid(S.project.brand.colors[0])] : [], stroke: st.closed ? null : { color: S.drawColor, width: S.drawWidth, align: 'center', cap: 'round', join: 'round', dash: [], profile: 'uniform', opacity: 1 } });
      st.pg.elements.push(el); D.reindex(); OC.sel.set([el.id]); OC.history.commit('Draw path'); E.setTool('select');
    },
    over(ctx, acc, toS) {
      const st = P.st; if (!st) return; const pg = st.pg; const sc = (x, y) => toS(pg, x, y);
      ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath();
      st.nodes.forEach((n, i) => { const s = sc(n.x, n.y); if (!i) ctx.moveTo(s.x, s.y); else { const a = st.nodes[i - 1]; const c1 = sc(a.x + a.ox, a.y + a.oy), c2 = sc(n.x + n.ix, n.y + n.iy); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, s.x, s.y); } });
      if (st.cur && !st.closed) { const a = st.nodes[st.nodes.length - 1]; const c1 = sc(a.x + a.ox, a.y + a.oy), e = sc(st.cur.x, st.cur.y); ctx.setLineDash([5, 4]); ctx.bezierCurveTo(c1.x, c1.y, e.x, e.y, e.x, e.y); }
      ctx.stroke(); ctx.setLineDash([]);
      st.nodes.forEach((n, i) => { const s = sc(n.x, n.y); if (n.ox || n.oy) { ctx.strokeStyle = acc; ctx.lineWidth = 1; [[n.ox, n.oy], [n.ix, n.iy]].forEach(hh => { const t = sc(n.x + hh[0], n.y + hh[1]); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(t.x, t.y, 3.5, 0, 7); ctx.fill(); ctx.stroke(); }); } ctx.fillStyle = i === 0 ? acc : '#fff'; ctx.strokeStyle = acc; ctx.lineWidth = 1.5; ctx.fillRect(s.x - 4, s.y - 4, 8, 8); ctx.strokeRect(s.x - 4, s.y - 4, 8, 8); });
      ctx.restore();
    }
  };

  /* ---------- pencil ---------- */
  E.tools.pencil = {
    down(p) {
      const pts = [{ x: p.px, y: p.py }]; const pg = p.pg; const st = E.tools.pencil.cur = { pts, pg };
      S.drag = { type: 'create', pg, tool: {
        move(q) { const l = pts[pts.length - 1]; if (Math.hypot(q.px - l.x, q.py - l.y) * S.zoom > 1.2) { pts.push({ x: q.px, y: q.py }); if (!st.q) { st.q = requestAnimationFrame(() => { st.q = 0; E.paintOverlay(); }); } } },
        up() {
          E.tools.pencil.cur = null; if (pts.length < 2) { E.paintOverlay(); return; } const info = V.fromPoints(pts, 2.2 / S.zoom * 1.2 + 1); if (!info.subpaths.length) return;
          const b = { x: info.bounds.x, y: info.bounds.y, w: Math.max(info.bounds.w, 1), h: Math.max(info.bounds.h, 1) };
          const el = V.makePathEl(info.subpaths, b, { name: 'Drawing', fills: [], stroke: { color: S.drawColor, width: S.drawWidth, align: 'center', cap: 'round', join: 'round', dash: [], profile: S.drawProfile || 'uniform', opacity: 1 } });
          pg.elements.push(el); D.reindex(); OC.sel.set([el.id]); OC.history.commit('Draw'); E.keepTool = true; OC.bus.emit('selection');
        }
      } };
    },
    over(ctx, acc, toS) { const c = E.tools.pencil.cur; if (!c) return; ctx.save(); ctx.strokeStyle = S.drawColor; ctx.lineWidth = S.drawWidth * S.zoom; ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath(); (() => { const sp = c.pts.map(q => toS(c.pg, q.x, q.y)); if (sp.length < 3) { sp.forEach((s, i) => i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)); return; } ctx.moveTo(sp[0].x, sp[0].y); for (let i = 1; i < sp.length - 1; i++) { const mx = (sp[i].x + sp[i + 1].x) / 2, my = (sp[i].y + sp[i + 1].y) / 2; ctx.quadraticCurveTo(sp[i].x, sp[i].y, mx, my); } const z = sp[sp.length - 1]; ctx.lineTo(z.x, z.y); })(); ctx.stroke(); ctx.restore(); }
  };
  E.keepTool = false;
  OC.bus.on('tool', () => { if (S.tool !== 'pencil') E.keepTool = false; });

  /* ---------- comment tool ---------- */
  E.tools.comment = {
    down(p) {
      const hit = E.hitComment(p); if (hit) { OC.bus.emit('comment-focus', hit.id); return; }
      const el = E.hitAt(p.pg, p.px, p.py, false, true); let pos = { x: p.px, y: p.py };
      if (el) { const b = D.boundsOf([el]); pos = { x: p.px - b.x, y: p.py - b.y }; }
      E.setTool('select'); OC.ops.addComment(el ? el.id : null, pos);
    }
  };

  /* ---------- node editing ---------- */
  E.nodeSel = new Set();
  const key = (i, j) => i + ':' + j;
  function nodePage(el, n, which) { const sx = el.w / el.vw, sy = el.h / el.vh; const dx = which === 'in' ? n.ix : which === 'out' ? n.ox : 0, dy = which === 'in' ? n.iy : which === 'out' ? n.oy : 0; return D.toPage(el.id, (n.x + dx) * sx, (n.y + dy) * sy); }
  E.nodeDown = function (p) {
    const el = D.get(S.nodeEdit); if (!el || el.type !== 'path') { S.nodeEdit = null; return false; } const r = 9 / S.zoom;
    /* handles of selected nodes */
    for (let i = 0; i < el.subpaths.length; i++) for (let j = 0; j < el.subpaths[i].nodes.length; j++) {
      if (!E.nodeSel.has(key(i, j))) continue; const n = el.subpaths[i].nodes[j];
      for (const w of ['in', 'out']) { if (w === 'in' && !n.ix && !n.iy) continue; if (w === 'out' && !n.ox && !n.oy) continue; const q = nodePage(el, n, w); if (Math.hypot(p.px - q.x, p.py - q.y) < r) { S.drag = { type: 'node', mode: 'handle', which: w, i, j, pg: p.pg }; return true; } }
    }
    for (let i = 0; i < el.subpaths.length; i++) for (let j = 0; j < el.subpaths[i].nodes.length; j++) {
      const n = el.subpaths[i].nodes[j]; const q = nodePage(el, n); if (Math.hypot(p.px - q.x, p.py - q.y) < r) {
        const k = key(i, j); if (p.shift) { E.nodeSel.has(k) ? E.nodeSel.delete(k) : E.nodeSel.add(k); } else if (!E.nodeSel.has(k)) E.nodeSel = new Set([k]);
        const lp = D.toLocal(el.id, p.px, p.py); S.drag = { type: 'node', mode: 'anchor', pg: p.pg, lp0: lp, starts: [...E.nodeSel].map(s => { const [a, b] = s.split(':').map(Number); const nn = el.subpaths[a].nodes[b]; return { n: nn, x: nn.x, y: nn.y }; }) }; R.invalidate(); return true;
      }
    }
    /* segment click inserts a node */
    const sx = el.w / el.vw, sy = el.h / el.vh; const lp = D.toLocal(el.id, p.px, p.py);
    for (let i = 0; i < el.subpaths.length; i++) { const sp = el.subpaths[i], N = sp.nodes.length; for (let j = 0; j < (sp.closed ? N : N - 1); j++) {
      const a = sp.nodes[j], b = sp.nodes[(j + 1) % N]; const P0 = [a.x, a.y], P1 = [a.x + a.ox, a.y + a.oy], P2 = [b.x + b.ix, b.y + b.iy], P3 = [b.x, b.y]; let best = 1e9, bt = 0;
      for (let k = 0; k <= 40; k++) { const t = k / 40, mt = 1 - t; const x = mt ** 3 * P0[0] + 3 * mt * mt * t * P1[0] + 3 * mt * t * t * P2[0] + t ** 3 * P3[0], y = mt ** 3 * P0[1] + 3 * mt * mt * t * P1[1] + 3 * mt * t * t * P2[1] + t ** 3 * P3[1]; const d = Math.hypot(x * sx - lp.x, y * sy - lp.y); if (d < best) { best = d; bt = t; } }
      if (best < 8 / S.zoom) { splitSeg(sp, j, bt); E.nodeSel = new Set([key(i, j + 1)]); const nn = sp.nodes[j + 1]; el.subpaths = el.subpaths.slice(); S.drag = { type: 'node', mode: 'anchor', pg: p.pg, lp0: lp, starts: [{ n: nn, x: nn.x, y: nn.y }] }; R.invalidate(); return true; }
    } }
    const hit = E.hitAt(p.pg, p.px, p.py, true, false); if (hit === el) { return true; }
    S.nodeEdit = null; E.nodeSel = new Set(); R.invalidate(); return false;
  };
  function splitSeg(sp, j, t) {
    const N = sp.nodes.length, a = sp.nodes[j], b = sp.nodes[(j + 1) % N]; const lerp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const P0 = [a.x, a.y], P1 = [a.x + a.ox, a.y + a.oy], P2 = [b.x + b.ix, b.y + b.iy], P3 = [b.x, b.y]; const A = lerp(P0, P1), B = lerp(P1, P2), C = lerp(P2, P3), AB = lerp(A, B), BC = lerp(B, C), M = lerp(AB, BC);
    const straight = !a.ox && !a.oy && !b.ix && !b.iy;
    const nn = { x: M[0], y: M[1], ix: straight ? 0 : AB[0] - M[0], iy: straight ? 0 : AB[1] - M[1], ox: straight ? 0 : BC[0] - M[0], oy: straight ? 0 : BC[1] - M[1], m: 'mirror' };
    if (!straight) { a.ox = A[0] - a.x; a.oy = A[1] - a.y; b.ix = C[0] - b.x; b.iy = C[1] - b.y; }
    sp.nodes.splice(j + 1, 0, nn);
  }
  E.nodeMove = function (d, p) {
    const el = D.get(S.nodeEdit); if (!el) return; const sx = el.w / el.vw, sy = el.h / el.vh; const lp = D.toLocal(el.id, p.px, p.py);
    if (d.mode === 'anchor') { const dx = (lp.x - d.lp0.x) / sx, dy = (lp.y - d.lp0.y) / sy; d.starts.forEach(s => { s.n.x = s.x + dx; s.n.y = s.y + dy; }); }
    else { const n = el.subpaths[d.i].nodes[d.j]; const hx = lp.x / sx - n.x, hy = lp.y / sy - n.y; if (d.which === 'out') { n.ox = hx; n.oy = hy; if (n.m === 'mirror' && !p.alt) { n.ix = -hx; n.iy = -hy; } } else { n.ix = hx; n.iy = hy; if (n.m === 'mirror' && !p.alt) { n.ox = -hx; n.oy = -hy; } } if (p.alt) n.m = 'corner'; }
    el.subpaths = el.subpaths.slice(); OC.bus.emit('geom'); R.invalidate();
  };
  E.nodeDbl = function (p) {
    const el = D.get(S.nodeEdit); if (!el) return false; const r = 9 / S.zoom;
    for (let i = 0; i < el.subpaths.length; i++) { const sp = el.subpaths[i], N = sp.nodes.length; for (let j = 0; j < N; j++) { const n = sp.nodes[j]; const q = nodePage(el, n); if (Math.hypot(p.px - q.x, p.py - q.y) < r) {
      if (n.ox || n.oy || n.ix || n.iy) { n.ox = n.oy = n.ix = n.iy = 0; n.m = 'corner'; } else { const pr = sp.nodes[(j + N - 1) % N], nx = sp.nodes[(j + 1) % N]; const dx = (nx.x - pr.x) * .22, dy = (nx.y - pr.y) * .22; n.ox = dx; n.oy = dy; n.ix = -dx; n.iy = -dy; n.m = 'mirror'; }
      el.subpaths = el.subpaths.slice(); OC.history.commit('Toggle smooth'); return true; } } }
    return false;
  };
  E.nodeDelete = function () {
    const el = D.get(S.nodeEdit); if (!el || !E.nodeSel.size) return false; const del = [...E.nodeSel].map(k => k.split(':').map(Number)).sort((a, b) => b[1] - a[1]);
    del.forEach(([i, j]) => { el.subpaths[i].nodes.splice(j, 1); }); el.subpaths = el.subpaths.filter(sp => sp.nodes.length > 1); E.nodeSel = new Set();
    if (!el.subpaths.length) { S.nodeEdit = null; OC.ops.del(); return true; } E.fitPath(el); OC.history.commit('Delete node'); return true;
  };
  E.nodeHover = function (p) { const el = D.get(S.nodeEdit); if (!el) return ''; const r = 9 / S.zoom; for (const sp of el.subpaths) for (const n of sp.nodes) { const q = nodePage(el, n); if (Math.hypot(p.px - q.x, p.py - q.y) < r) return 'pointer'; } return 'crosshair'; };
  E.paintNodes = function (ctx, acc, toS) {
    const el = D.get(S.nodeEdit); if (!el) return; const pg = D.find(el.id).page;
    el.subpaths.forEach((sp, i) => sp.nodes.forEach((n, j) => {
      const sel = E.nodeSel.has(key(i, j)); const q = nodePage(el, n), s = toS(pg, q.x, q.y);
      if (sel) [['in', n.ix, n.iy], ['out', n.ox, n.oy]].forEach(([w, a, b]) => { if (!a && !b) return; const t = nodePage(el, n, w), ts = toS(pg, t.x, t.y); ctx.strokeStyle = acc; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ts.x, ts.y); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ts.x, ts.y, 4, 0, 7); ctx.fill(); ctx.stroke(); });
      ctx.fillStyle = sel ? acc : '#fff'; ctx.strokeStyle = acc; ctx.lineWidth = 1.5; if (n.m === 'mirror') { ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, 7); ctx.fill(); ctx.stroke(); } else { ctx.fillRect(s.x - 4.5, s.y - 4.5, 9, 9); ctx.strokeRect(s.x - 4.5, s.y - 4.5, 9, 9); }
    }));
  };
})();
