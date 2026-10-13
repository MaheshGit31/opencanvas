/* Rich text layout and drawing on canvas */
(function () {
  const U = OC.U;
  const mctx = U.newCanvas(4, 4).getContext('2d');
  const T = OC.text = {};
  let cache = new Map();
  T.clear = () => cache.clear();
  const hasLS = 'letterSpacing' in mctx;

  T.fontString = (ff, fw, fi, sz) => `${fi ? 'italic ' : ''}${fw} ${sz}px ${OC.fonts.stack(ff)}`;

  function styleOf(el, run) {
    const s = { ff: run.ff || el.ff, fw: run.fw || (run.b ? 700 : el.fw), fi: run.i != null ? run.i : el.fi, sz: run.sz || el.fs, c: run.c || null, u: run.u != null ? run.u : el.under, s: run.s != null ? run.s : el.strike };
    return s;
  }
  function transform(t, tf) { if (tf === 'upper') return t.toUpperCase(); if (tf === 'lower') return t.toLowerCase(); if (tf === 'title') return t.replace(/\b\w/g, c => c.toUpperCase()); return t; }

  T.layout = function (el, widthOverride) {
    const W = widthOverride != null ? widthOverride : el.w;
    const key = JSON.stringify([el.runs, el.ff, el.fw, el.fs, el.fi, el.lh, el.ls, el.ws, el.tf, W, el.under, el.strike, el.align, el.para, el.kern, el.caps]);
    const hit = cache.get(key); if (hit) return hit;
    OC.fonts.ensure(el.ff);
    const tokens = [];
    (el.runs || []).forEach(run => {
      if (run.ff) OC.fonts.ensure(run.ff);
      const st = styleOf(el, run); const text = transform(run.t || '', el.tf);
      text.replace(/(\n)|([ \t]+)|([^\s]+)/g, (m, nl, sp, wd) => { tokens.push({ nl: !!nl, sp: !!sp, t: m, st }); });
    });
    const lines = []; let cur = { segs: [], w: 0, maxSz: el.fs, para: false };
    const setFont = st => { mctx.font = T.fontString(st.ff, st.fw, st.fi, st.sz); if (hasLS) { mctx.letterSpacing = (el.ls || 0) + 'px'; } mctx.fontKerning = el.kern === false ? 'none' : 'auto'; mctx.fontVariantCaps = el.caps ? 'small-caps' : 'normal'; };
    const meas = (t, st) => { setFont(st); let w = mctx.measureText(t).width; if (!hasLS && el.ls) w += el.ls * t.length; if (el.ws && /^\s+$/.test(t)) w += el.ws * t.length; return w; };
    const push = (t, st, w) => { const last = cur.segs[cur.segs.length - 1]; if (last && last.st === st) { last.t += t; last.w += w; } else cur.segs.push({ t, st, w }); cur.w += w; cur.maxSz = Math.max(cur.maxSz, st.sz); };
    const endLine = hard => { cur.hard = hard; lines.push(cur); cur = { segs: [], w: 0, maxSz: el.fs }; };
    tokens.forEach(tk => {
      if (tk.nl) { if (!cur.segs.length) cur.maxSz = tk.st.sz; endLine(true); return; }
      const w = meas(tk.t, tk.st);
      if (tk.sp) { push(tk.t, tk.st, w); return; }
      if (W > 0 && cur.w + w > W + 0.01 && cur.segs.length) {
        /* drop trailing spaces */
        const l = cur.segs[cur.segs.length - 1]; if (/^\s+$/.test(l.t)) { cur.w -= l.w; cur.segs.pop(); } else { const m = l.t.match(/\s+$/); if (m) { const tw = meas(m[0], l.st); l.t = l.t.slice(0, -m[0].length); l.w -= tw; cur.w -= tw; } }
        endLine(false);
      }
      if (W > 0 && w > W) { /* break long word by chars */
        let chunk = '';
        for (const ch of tk.t) { const cw = meas(chunk + ch, tk.st); if (cw > W && chunk) { push(chunk, tk.st, meas(chunk, tk.st)); endLine(false); chunk = ch; } else chunk += ch; }
        if (chunk) push(chunk, tk.st, meas(chunk, tk.st));
      } else push(tk.t, tk.st, w);
    });
    endLine(true);
    /* metrics */
    let y = 0;
    lines.forEach((ln, i) => {
      const lh = ln.maxSz * el.lh; setFont({ ff: el.ff, fw: el.fw, fi: el.fi, sz: ln.maxSz });
      const m = mctx.measureText('Hg'); const asc = m.fontBoundingBoxAscent || ln.maxSz * .9, desc = m.fontBoundingBoxDescent || ln.maxSz * .25;
      ln.h = lh; ln.y = y; ln.base = y + (lh - (asc + desc)) / 2 + asc;
      /* trim trailing space width for alignment */
      const lastSeg = ln.segs[ln.segs.length - 1]; ln.vw = ln.w; if (lastSeg && /\s$/.test(lastSeg.t)) { const tr = lastSeg.t.match(/\s+$/)[0]; ln.vw -= meas(tr, lastSeg.st); }
      y += lh + (ln.hard && el.para ? el.para : 0);
    });
    const res = { lines, h: Math.max(y, el.fs * el.lh), W };
    if (cache.size > 400) cache.clear();
    cache.set(key, res); return res;
  };

  /* drawing. paint(ctx, seg) lets caller pick fill, e.g. gradient */
  T.draw = function (ctx, el, opts = {}) {
    const lay = T.layout(el); const W = el.w;
    if (el.autoH && Math.abs(el.h - lay.h) > .5 && !opts.noSync) { el.h = lay.h; }
    const H = el.h; const off = el.valign === 'middle' ? (H - lay.h) / 2 : el.valign === 'bottom' ? H - lay.h : 0;
    const fill = opts.fillStyle; const stroke = el.stroke && el.stroke.width > 0 ? el.stroke : null;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (hasLS) ctx.letterSpacing = (el.ls || 0) + 'px'; ctx.fontKerning = el.kern === false ? 'none' : 'auto'; ctx.fontVariantCaps = el.caps ? 'small-caps' : 'normal';
    if ('wordSpacing' in ctx) ctx.wordSpacing = (el.ws || 0) + 'px';
    const lines = lay.lines;
    /* background highlight */
    if (el.bg && el.bg.color) {
      const pad = el.bg.pad || 0; ctx.save(); ctx.fillStyle = el.bg.color;
      if (el.bg.mode === 'box') { roundRect(ctx, -pad, -pad, W + pad * 2, H + pad * 2, el.bg.radius || 0); ctx.fill(); }
      else lines.forEach(ln => { if (!ln.segs.length) return; const x = lineX(el, ln, W); roundRect(ctx, x - pad, off + ln.y - pad / 2, ln.vw + pad * 2, ln.h + pad, el.bg.radius || 0); ctx.fill(); });
      ctx.restore();
    }
    if (el.curve) { drawCurved(ctx, el, lay, fill, stroke, off); return; }
    lines.forEach(ln => {
      let x = lineX(el, ln, W); const justify = el.align === 'justify' && !ln.hard && ln.segs.length;
      let extra = 0; if (justify) { const spaces = ln.segs.reduce((n, s) => n + (s.t.match(/ /g) || []).length, 0); if (spaces) extra = (W - ln.vw) / spaces; }
      ln.segs.forEach(seg => {
        const st = seg.st; ctx.font = T.fontString(st.ff, st.fw, st.fi, st.sz);
        const parts = extra ? seg.t.split(/( )/) : [seg.t];
        parts.forEach(pt => {
          if (!pt) return; let pw = pt === seg.t ? seg.w : ctx.measureText(pt).width + (hasLS ? 0 : (el.ls || 0) * pt.length); if (extra && pt === ' ') pw += extra;
          const by = off + ln.base;
          if (stroke && opts.strokeUnder !== false) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = stroke.width * 2; ctx.strokeStyle = U.rgba(stroke.color, stroke.opacity); drawStr(ctx, pt, x, by, el, 'stroke'); ctx.restore(); }
          ctx.fillStyle = st.c || fill || '#000'; drawStr(ctx, pt, x, by, el, 'fill');
          if (st.u || st.s) { ctx.save(); ctx.fillStyle = ctx.fillStyle; const th = Math.max(1, st.sz / 16); if (st.u) ctx.fillRect(x, by + st.sz * .1, pw, th); if (st.s) ctx.fillRect(x, by - st.sz * .3, pw, th); ctx.restore(); }
          x += pw;
        });
      });
    });
  };
  function drawStr(ctx, t, x, y, el, mode) {
    if (!hasLS && el.ls) { let cx = x; for (const ch of t) { ctx[mode + 'Text'](ch, cx, y); cx += ctx.measureText(ch).width + el.ls; } } else ctx[mode + 'Text'](t, x, y);
  }
  function lineX(el, ln, W) { return el.align === 'center' ? (W - ln.vw) / 2 : el.align === 'right' ? W - ln.vw : 0; }
  function drawCurved(ctx, el, lay, fill, stroke, off) {
    const W = el.w; const sweep = el.curve / 100 * Math.PI * 1.8; const sign = Math.sign(sweep) || 1;
    lay.lines.forEach((ln, li) => {
      const total = ln.vw || 1; const R = total / Math.abs(sweep); const cx = W / 2, cy = off + ln.base + (sign > 0 ? R : -R);
      const half = Math.abs(sweep) / 2; let a = sign > 0 ? -Math.PI / 2 - half : Math.PI / 2 + half;
      ln.segs.forEach(seg => {
        const st = seg.st; ctx.font = T.fontString(st.ff, st.fw, st.fi, st.sz);
        for (const ch of seg.t) {
          const cw = ctx.measureText(ch).width + (hasLS ? 0 : el.ls || 0); const mid = a + sign * (cw / 2) / R;
          ctx.save(); ctx.translate(cx + Math.cos(mid) * R, cy + Math.sin(mid) * R); ctx.rotate(mid + (sign > 0 ? Math.PI / 2 : -Math.PI / 2));
          if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = stroke.width * 2; ctx.strokeStyle = U.rgba(stroke.color, stroke.opacity); ctx.strokeText(ch, -cw / 2, 0); }
          ctx.fillStyle = st.c || fill || '#000'; ctx.fillText(ch, -cw / 2, 0); ctx.restore(); a += sign * cw / R;
        }
      });
    });
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  T.roundRect = roundRect;

  /* plain text */
  T.plain = el => (el.runs || []).map(r => r.t).join('');
  T.setPlain = (el, s) => { el.runs = [{ t: s }]; };

  /* HTML round trip for editing */
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  T.toHTML = function (el) {
    return (el.runs || []).map(r => {
      const st = []; if (r.b) st.push('font-weight:700'); else if (r.fw) st.push('font-weight:' + r.fw); if (r.i != null) st.push('font-style:' + (r.i ? 'italic' : 'normal'));
      const dec = []; if (r.u) dec.push('underline'); if (r.s) dec.push('line-through'); if (dec.length) st.push('text-decoration:' + dec.join(' '));
      if (r.c) st.push('color:' + r.c); if (r.sz) st.push('font-size:' + r.sz + 'px'); if (r.ff) st.push(`font-family:"${r.ff}"`);
      return `<span style='${st.join(';')}'>${esc(r.t || '').replace(/\n/g, '<br>')}</span>`;
    }).join('');
  };
  T.fromDOM = function (root, el, zoom) {
    const runs = []; const base = getComputedStyle(root);
    const baseSz = parseFloat(base.fontSize), baseW = parseInt(base.fontWeight) || 400;
    const push = (t, node) => {
      if (!t) return; const cs = getComputedStyle(node.nodeType === 3 ? node.parentNode : node); const r = { t };
      const w = parseInt(cs.fontWeight) || 400; if (w !== baseW) r.fw = w;
      const it = cs.fontStyle === 'italic'; if (it !== !!el.fi) r.i = it;
      const dl = cs.textDecorationLine || cs.textDecoration || ''; const u = /underline/.test(dl), s = /line-through/.test(dl); if (u !== !!el.under) r.u = u; if (s !== !!el.strike) r.s = s;
      if (cs.color !== base.color) { r.c = U.hex(cs.color); }
      const sz = parseFloat(cs.fontSize); if (Math.abs(sz - baseSz) > .3) r.sz = U.round(sz / zoom, 1);
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const bfam = base.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (fam !== bfam) r.ff = fam;
      const last = runs[runs.length - 1]; if (last && JSON.stringify({ ...last, t: '' }) === JSON.stringify({ ...r, t: '' })) last.t += t; else runs.push(r);
    };
    const BLOCK = /^(DIV|P|LI|H\d)$/;
    const walk = (n, first) => {
      if (n.nodeType === 3) { push(n.nodeValue.replace(/ /g, ' '), n); return; }
      if (n.nodeName === 'BR') { push('\n', n); return; }
      const isBlock = BLOCK.test(n.nodeName) && n !== root;
      if (isBlock && runs.length && !/\n$/.test(runs[runs.length - 1].t)) push('\n', n);
      Array.from(n.childNodes).forEach((c, i) => walk(c, i === 0));
    };
    walk(root, true);
    if (runs.length && /^\n$/.test(runs[runs.length - 1].t) && runs.length > 1) { /* trailing br from contenteditable */ runs[runs.length - 1].t = ''; runs.pop(); }
    return runs.length ? runs : [{ t: '' }];
  };
})();
