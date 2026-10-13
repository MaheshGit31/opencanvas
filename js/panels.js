/* Sidebar panels */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui, O = OC.ops, V = OC.vec, E = OC.editor;
  const T = s => OC.t(s); const P = OC.panels = {};
  const reg = (id, title, render) => { UI.panels[id] = { title, render }; };
  const search = (ph, onq, val) => h('div.search', h('span', { html: OC.icon('search', 16) }), h('input', { placeholder: T(ph), value: val || '', onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') onq(e.target.value); }, oninput: e => { if (!e.target.value) onq(''); } }));
  const drag = payload => e => { e.dataTransfer.setData('application/x-opencanvas', JSON.stringify(payload)); };
  const svgShape = (name, cls) => h('span.shape-svg', { html: `<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="${V.SHAPES[name]}" fill="currentColor" fill-rule="evenodd"/></svg>` });
  const sec = (t, ...c) => h('div.psec', h('h4', T(t)), ...c);

  /* ---------- insert and drop ---------- */
  async function fetchBlobAsset(url, name) { const r = await fetch(url); if (!r.ok) throw new Error('fetch'); const b = await r.blob(); return OC.assets.add(b, name); }
  P.insert = async function (p, o = {}) {
    if (!UI.isCanvas()) { U.toast('Open a canvas design first'); return; }
    switch (p.kind) {
      case 'prim': { const e = D.make(p.type, p.props || {}); if (p.type === 'frame') { e.fills = [D.solid('#ffffff')]; e.w = 480; e.h = 320; } if (p.type === 'line') { if (p.ends) e.ends = { start: 'none', end: p.ends }; e.w = 300; } if (p.type === 'star' || p.type === 'polygon') { e.w = e.h = 220; } if (p.type === 'text') { } return O.add(e, o); }
      case 'shape': { const e = V.shapeEl(p.name, 240); return O.add(e, o); }
      case 'frameShape': { const e = V.shapeEl(p.name, 320); e.name = p.name + ' frame'; e.fills = [{ type: 'image', src: '', fit: 'cover', opacity: 1, visible: true }]; return O.add(e, o); }
      case 'emoji': { const e = D.make('text', { name: 'Emoji', runs: [{ t: p.ch }], fs: 180, w: 260, align: 'center', fills: [D.solid('#000000')] }); e.h = OC.text.layout(e).h; return O.add(e, o); }
      case 'symbol': { const e = D.make('text', { name: 'Symbol', runs: [{ t: p.ch }], fs: 200, w: 300, align: 'center', ff: 'Noto Sans', fills: [D.solid(S.project.brand.colors[4] || '#1c1c28')] }); e.h = OC.text.layout(e).h; return O.add(e, o); }
      case 'mysymbol': { const e = U.clone(p.el); OC.relabel([e]); return O.add(e, o); }
      case 'icon': { try { const txt = await (await fetch(`https://api.iconify.design/${p.id.replace(':', '/')}.svg?color=%231c1c28`)).text(); return OC.uploads.importSVG(txt, { ...o, name: p.id.split(':')[1] }); } catch (e) { U.toast('Icon could not load'); } return; }
      case 'photo': { try { const id = await fetchBlobAsset(p.url, p.title || 'Photo'); const el = await O.addImage('asset:' + id, p.title || 'Photo', o); if (el && p.credit) { el.alt = p.title || ''; el.tags = ['photo']; el.credit = p.credit; } } catch (e) { U.toast('Photo could not load'); } return; }
      case 'asset': return OC.uploads.place(p, o);
      case 'template': { const t = OC.templates.list.find(x => x.id === p.id); if (t) OC.templates.apply(t, o); else if (p.data) OC.templates.apply(p.data, o); return; }
      case 'text': return O.addText(p.style);
      case 'combo': return addCombo(p, o);
      case 'textfx': return addTextFx(p, o);
      case 'component': return O.insertComponent(p.id);
      case 'element': { const e = U.clone(p.el); OC.relabel([e]); return O.add(e, o); }
      case 'chart': return addChart(p, o);
    }
  };
  P.drop = (p, at, pg, target) => { if (p.kind === 'asset' || p.kind === 'photo') { if (p.kind === 'asset') return OC.uploads.place(p, { at, page: pg, target }); } return P.insert(p, { at, page: pg, target }); };
  function addCombo(p, o) {
    const b = S.project.brand; const hd = D.make('text', { name: 'Heading', runs: [{ t: p.t1 || 'Heading' }], fs: 88, fw: p.w1 || 700, ff: p.f1, w: 640, fills: [D.solid(b.colors[4] || '#1c1c28')] }); const sb = D.make('text', { name: 'Subtext', runs: [{ t: p.t2 || 'Supporting text goes here' }], fs: 34, fw: 400, ff: p.f2, w: 640, y: 0, fills: [D.solid('#555566')] });
    hd.h = OC.text.layout(hd).h; sb.h = OC.text.layout(sb).h; sb.y = hd.h + 12; const g = D.make('group', { name: 'Text pair', w: 640, h: sb.y + sb.h, children: [hd, sb] }); return O.add(g, o);
  }
  const FX = {
    Neon: e => { e.fills = [D.solid('#ffffff')]; e.shadows = [{ x: 0, y: 0, blur: 6, color: '#ff5dd8', opacity: 1, visible: true }, { x: 0, y: 0, blur: 24, color: '#ff5dd8', opacity: .9, visible: true }, { x: 0, y: 0, blur: 48, color: '#ff5dd8', opacity: .6, visible: true }]; e.bg = null; },
    Shadow: e => { e.shadows = [{ x: 6, y: 8, blur: 12, color: '#000000', opacity: .35, visible: true }]; },
    Outline: e => { e.fills = [D.solid('#ffffff')]; e.stroke = { color: '#1c1c28', width: 4, align: 'center', cap: 'round', join: 'round', dash: [], profile: 'uniform', opacity: 1 }; },
    Hollow: e => { e.fills = [{ type: 'solid', color: '#ffffff', opacity: 0, visible: true }]; e.stroke = { color: '#2563eb', width: 3, align: 'center', cap: 'round', join: 'round', dash: [], profile: 'uniform', opacity: 1 }; },
    Gradient: e => { e.fills = [{ type: 'linear', angle: 90, stops: [{ o: 0, c: '#2563eb' }, { o: 1, c: '#06b6d4' }], opacity: 1, visible: true }]; },
    Retro: e => { e.ff = 'Shrikhand'; e.fills = [D.solid('#ffe14d')]; e.shadows = [{ x: 5, y: 5, blur: 0, color: '#ff3b6b', opacity: 1, visible: true }, { x: 10, y: 10, blur: 0, color: '#3b3bff', opacity: 1, visible: true }]; },
    Glitch: e => { e.fills = [D.solid('#ffffff')]; e.shadows = [{ x: -4, y: 0, blur: 0, color: '#00ffff', opacity: .9, visible: true }, { x: 4, y: 0, blur: 0, color: '#ff0055', opacity: .9, visible: true }]; },
    Highlight: e => { e.fills = [D.solid('#1c1c28')]; e.bg = { color: '#ffe14d', pad: 8, radius: 6, mode: 'line' }; },
    Echo: e => { e.fills = [D.solid('#1c1c28')]; e.shadows = [{ x: 8, y: 8, blur: 0, color: '#2563eb', opacity: .7, visible: true }, { x: 16, y: 16, blur: 0, color: '#2563eb', opacity: .35, visible: true }]; },
    Curved: e => { e.curve = 60; e.w = 640; }
  };
  function addTextFx(p, o) { const e = D.make('text', { name: 'Styled text', runs: [{ t: p.name }], fs: 110, fw: 800, ff: 'Poppins', w: 700, align: 'center', fills: [D.solid('#1c1c28')] }); FX[p.name](e); e.h = OC.text.layout(e).h; return O.add(e, o); }
  function addChart(p, o) {
    const rows = p.data.split('\n').map(r => r.split(',')).filter(r => r.length >= 2 && !isNaN(parseFloat(r[1]))).map(r => [r[0].trim(), parseFloat(r[1])]); if (!rows.length) { U.toast('Add some data first'); return; }
    const cols = S.project.brand.colors.slice(0, 5).concat(['#ff914d', '#38b6ff', '#7ed957']); const kids = []; const W = 640, Hh = 400; const max = Math.max(...rows.map(r => r[1]), 1);
    const label = (t, x, y, w, o2 = {}) => { const e = D.make('text', { runs: [{ t }], x, y, w, fs: o2.fs || 20, align: o2.align || 'center', ff: 'Inter', fills: [D.solid('#555566')] }); e.h = OC.text.layout(e).h; return e; };
    if (p.type === 'bar') { const bw = W / rows.length * .62; rows.forEach((r, i) => { const hh = r[1] / max * (Hh - 70); const x = i * (W / rows.length) + (W / rows.length - bw) / 2; kids.push(D.make('rect', { name: r[0], x, y: Hh - 40 - hh, w: bw, h: hh, radius: 10, fills: [D.solid(cols[i % cols.length])] }), label(r[0], x - 20, Hh - 32, bw + 40), label(String(r[1]), x - 20, Hh - 40 - hh - 28, bw + 40, { fs: 18 })); }); const ax = D.make('line', { x: 0, y: Hh - 40, w: W }); ax.stroke.color = '#c7c7d1'; ax.stroke.width = 2; kids.push(ax); }
    else if (p.type === 'line') { const pts = rows.map((r, i) => ({ x: 20 + i * ((W - 40) / Math.max(rows.length - 1, 1)), y: Hh - 50 - r[1] / max * (Hh - 100) })); const info = V.fromPoints(pts, 0.01); const b = info.bounds; const path = V.makePathEl(info.subpaths.map(sp => ({ ...sp, nodes: sp.nodes.map(n => ({ ...n, ix: n.ix * .3, iy: n.iy * .3, ox: n.ox * .3, oy: n.oy * .3 })) })), { x: b.x, y: b.y, w: Math.max(b.w, 1), h: Math.max(b.h, 1) }, { name: 'Line', fills: [], stroke: { color: cols[0], width: 6, align: 'center', cap: 'round', join: 'round', dash: [], profile: 'uniform', opacity: 1 } }); kids.push(path); rows.forEach((r, i) => { kids.push(D.make('ellipse', { x: pts[i].x - 8, y: pts[i].y - 8, w: 16, h: 16, fills: [D.solid('#ffffff')], stroke: { color: cols[0], width: 4, align: 'center', cap: 'butt', join: 'miter', dash: [], profile: 'uniform', opacity: 1 } }), label(r[0], pts[i].x - 40, Hh - 36, 80)); }); }
    else { const tot = rows.reduce((s, r) => s + r[1], 0); let a0 = -Math.PI / 2; const R = 180, cx = 200, cy = 200, hole = p.type === 'donut' ? 100 : 0; rows.forEach((r, i) => { const a1 = a0 + r[1] / tot * Math.PI * 2; const big = a1 - a0 > Math.PI ? 1 : 0; const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1); let d = `M${cx} ${cy}L${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}Z`; if (hole) { const ix0 = cx + hole * Math.cos(a0), iy0 = cy + hole * Math.sin(a0), ix1 = cx + hole * Math.cos(a1), iy1 = cy + hole * Math.sin(a1); d = `M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${ix1} ${iy1}A${hole} ${hole} 0 ${big} 0 ${ix0} ${iy0}Z`; } const info = V.fromD(d); const e = V.makePathEl(info.subpaths, info.bounds, { name: r[0], fills: [D.solid(cols[i % cols.length])], stroke: { color: '#ffffff', width: 3, align: 'center', cap: 'butt', join: 'round', dash: [], profile: 'uniform', opacity: 1 } }); kids.push(e); const mid = (a0 + a1) / 2; kids.push(label(r[0] + ' ' + Math.round(r[1] / tot * 100) + '%', cx + Math.cos(mid) * (R + 70) - 60, cy + Math.sin(mid) * (R + 30) - 12, 120, { fs: 18 })); a0 = a1; }); }
    const b = D.boundsOf(kids); kids.forEach(k => { k.x -= b.x; k.y -= b.y; }); return O.add(D.make('group', { name: 'Chart', w: b.w, h: b.h, children: kids }), o);
  }

  /* ---------- design ---------- */
  const PALETTES = [['Sunset', ['#0b2545', '#7597de', '#ff5d8f', '#ffb020', '#fff1e6']], ['Ocean', ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8']], ['Forest', ['#1b4332', '#2d6a4f', '#52b788', '#95d5b2', '#d8f3dc']], ['Candy', ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff']], ['Mono', ['#111111', '#444444', '#888888', '#cccccc', '#ffffff']], ['Earth', ['#3d2c1e', '#7f5539', '#b08968', '#e6ccb2', '#fdf3e7']], ['Neon', ['#0b0014', '#2563eb', '#00f5d4', '#ff5dd8', '#fee440']], ['Pastel', ['#cdb4db', '#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff']]];
  const COMBOS = [['Playfair Display', 'Inter', 700], ['Bebas Neue', 'Montserrat', 400], ['Poppins', 'Lora', 700], ['DM Serif Display', 'DM Sans', 400], ['Pacifico', 'Open Sans', 400], ['Anton', 'Roboto', 400], ['Space Grotesk', 'Inter', 700], ['Abril Fatface', 'Lato', 400], ['Caveat', 'Poppins', 700], ['Righteous', 'Nunito', 400], ['Fraunces', 'Work Sans', 700], ['Archivo Black', 'Source Serif 4', 400]];
  const tplThumbs = new Map();
  reg('design', 'Design', (host) => {
    let tab = 'templates', q = ''; const body = h('div'); const cat = S.project ? S.project.cat : '';
    const draw = () => {
      body.textContent = ''; const tabs = h('div.chips', ['templates', 'styles', 'community'].map(t => h('button.chip' + (t === tab ? '.on' : ''), { onclick: () => { tab = t; draw(); } }, T(t[0].toUpperCase() + t.slice(1))))); body.append(tabs);
      if (tab === 'templates') {
        body.append(search('Search templates', v => { q = v; draw(); }, q)); const grid = h('div.grid2.cards'); body.append(grid);
        const list = OC.templates.list.filter(t => (!q || t.name.toLowerCase().includes(q.toLowerCase())) && (S.project.mode === 'whiteboard' ? t.cats.includes('whiteboards') : true)).sort((a, b) => ((b.cats.includes(cat) ? 1 : 0) - (a.cats.includes(cat) ? 1 : 0)));
        list.forEach(t => { let c = tplThumbs.get(t.id); if (!c) { try { c = OC.templates.thumb(t, 260); } catch (e) { c = U.newCanvas(10, 10); } tplThumbs.set(t.id, c); } const img = U.newCanvas(c.width, c.height); img.getContext('2d').drawImage(c, 0, 0); grid.append(h('button.card', { title: t.name, onclick: e => P.insert({ kind: 'template', id: t.id }), draggable: true, ondragstart: drag({ kind: 'template', id: t.id }) }, h('div.card-img.canvas', img), h('span', t.name))); });
        body.append(UI.btn('Pitch deck, 5 slides', () => OC.templates.applyPitch(), { icon: 'presentation', cls: 'full' }));
        OC.templates.list.forEach(t => OC.fonts.preloadMany(['Poppins', 'Playfair Display', 'Bebas Neue', 'Anton', 'Great Vibes', 'Caveat', 'Inter', 'Shrikhand']));
      } else if (tab === 'styles') {
        body.append(sec('Color palettes', h('div.palettes', PALETTES.map(([n, cols]) => h('button.palette', { title: n, onclick: () => O.recolorPage(cols) }, cols.map(c => h('i', { style: 'background:' + c })), h('span', n))))), sec('Font pairs', h('div.combos', COMBOS.map(([a, b, w]) => combo(a, b, w)))));
      } else OC.community.renderList(body, 'template');
    };
    draw(); OC.bus.on('font-loaded', U.debounce(() => { if (UI.curPanel === 'design') { tplThumbs.clear(); draw(); } }, 600));
    host.append(body);
  });
  function combo(a, b, w) { OC.fonts.ensure(a); OC.fonts.ensure(b); return h('button.combo', { onclick: () => P.insert({ kind: 'combo', f1: a, f2: b, w1: w }), draggable: true, ondragstart: drag({ kind: 'combo', f1: a, f2: b, w1: w }) }, h('b', { style: `font-family:${OC.fonts.stack(a)};font-weight:${w}` }, 'Heading'), h('span', { style: `font-family:${OC.fonts.stack(b)}` }, 'Supporting text'), h('small', a + ' + ' + b)); }

  /* ---------- elements ---------- */
  const EMOJI = '😀 😂 😍 🥰 😎 🤩 🥳 😇 🤔 😴 😭 😡 🤯 🙌 👍 👏 🙏 💪 👀 🔥 ✨ ⭐ 🌟 💫 ⚡ ❤️ 🧡 💛 💚 💙 💜 🖤 💯 🎉 🎊 🎁 🎈 🏆 🥇 🎯 🚀 🌈 ☀️ 🌙 ⛅ ❄️ 🌸 🌼 🌻 🌿 🍀 🌴 🌊 🍕 🍔 🍟 🍣 🍩 🍰 ☕ 🍷 🍉 🍎 🍓 🥑 🐶 🐱 🦊 🐼 🦁 🐸 🦄 🐝 🦋 🎵 🎧 🎮 📷 💡 📚 ✏️ 📌 📎 🔒 🔑 💎 🧩 🏠 ✈️ 🚗 🚲 ⚽ 🏀 🎨 🎬 💻 📱'.split(' ');
  const CHARTS = [['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie'], ['donut', 'Donut']];
  reg('elements', 'Elements', (host, opts) => {
    let tab = opts.tab || 'shapes', q = opts.query || ''; const body = h('div'); const tabs = ['shapes', 'lines', 'frames', 'icons', 'photos', 'stickers', 'charts', 'gradients'];
    const draw = () => {
      host.lastChild === body || 0; body.textContent = '';
      body.append(search('Search elements', v => { q = v; if (q && ['shapes', 'lines', 'frames', 'gradients'].includes(tab) === false) { } draw(); }, q), h('div.chips.scroll', tabs.map(t => h('button.chip' + (t === tab ? '.on' : ''), { onclick: () => { tab = t; draw(); } }, T(t[0].toUpperCase() + t.slice(1))))));
      const f = q.toLowerCase();
      if (tab === 'shapes') {
        const prims = [['rect', 'Rectangle'], ['ellipse', 'Circle'], ['polygon', 'Polygon'], ['star', 'Star']].filter(p => !f || p[1].toLowerCase().includes(f));
        body.append(h('div.shape-grid', prims.map(([t, n]) => h('button.shape-btn', { title: T(n), onclick: () => P.insert({ kind: 'prim', type: t }), draggable: true, ondragstart: drag({ kind: 'prim', type: t }), html: { rect: '<svg viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" rx="10" fill="currentColor"/></svg>', ellipse: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="currentColor"/></svg>', polygon: '<svg viewBox="0 0 100 100"><polygon points="50,6 92,30 92,70 50,94 8,70 8,30" fill="currentColor"/></svg>', star: '<svg viewBox="0 0 100 100"><polygon points="50,6 62,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 38,38" fill="currentColor"/></svg>' }[t] })), Object.keys(V.SHAPES).filter(n => !f || n.toLowerCase().includes(f)).map(n => h('button.shape-btn', { title: n, onclick: () => P.insert({ kind: 'shape', name: n }), draggable: true, ondragstart: drag({ kind: 'shape', name: n }) }, svgShape(n)))));
      } else if (tab === 'lines') {
        body.append(h('div.line-grid', [['none', 'Line'], ['arrow', 'Arrow'], ['triangle', 'Triangle arrow'], ['dot', 'Dot'], ['diamond', 'Diamond'], ['bar', 'Bar']].map(([e, n]) => h('button.line-btn', { title: n, onclick: () => P.insert({ kind: 'prim', type: 'line', ends: e }), html: `<svg viewBox="0 0 100 20"><line x1="6" y1="10" x2="${e === 'none' ? 94 : 88}" y2="10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>${e === 'arrow' ? '<path d="M80 2L94 10L80 18" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' : e === 'triangle' ? '<path d="M78 3L96 10L78 17Z" fill="currentColor"/>' : e === 'dot' ? '<circle cx="92" cy="10" r="5" fill="currentColor"/>' : e === 'diamond' ? '<path d="M86 10L92 4L98 10L92 16Z" fill="currentColor"/>' : e === 'bar' ? '<line x1="92" y1="2" x2="92" y2="18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' : ''}</svg>` }))));
      } else if (tab === 'frames') {
        body.append(h('p.muted.small', T('Drop a photo onto a frame')), h('div.shape-grid', ['Rounded square', 'Heart', 'Blob 1', 'Blob 2', 'Arch', 'Pentagon', 'Octagon', 'Cloud', 'Speech', 'Shield', 'Diamond', 'Ribbon'].filter(n => !f || n.toLowerCase().includes(f)).map(n => h('button.shape-btn.frame-btn', { title: n, onclick: () => P.insert({ kind: 'frameShape', name: n }), draggable: true, ondragstart: drag({ kind: 'frameShape', name: n }) }, svgShape(n)))), UI.btn('Empty frame (clips content)', () => P.insert({ kind: 'prim', type: 'frame' }), { cls: 'full' }));
      } else if (tab === 'icons') iconsTab(f);
      else if (tab === 'photos') photosTab(f);
      else if (tab === 'stickers') body.append(h('div.emoji-grid', EMOJI.map(ch => h('button.emoji', { onclick: () => P.insert({ kind: 'emoji', ch }), draggable: true, ondragstart: drag({ kind: 'emoji', ch }) }, ch))));
      else if (tab === 'charts') chartsTab();
      else if (tab === 'gradients') body.append(h('div.grid3', UI.GRADIENTS.map(g => h('button.swatch.grad.lg', { style: `background:linear-gradient(135deg,${g[0]},${g[1]})`, title: T('Click to add, shift click for page background'), onclick: ev => { if (ev.shiftKey) { OC.page().bg = { type: 'linear', angle: 135, stops: [{ o: 0, c: g[0] }, { o: 1, c: g[1] }] }; OC.history.commit('Background'); } else { const pg = OC.page(); P.insert({ kind: 'element', el: D.make('rect', { name: 'Gradient', w: 400, h: 400, radius: 24, fills: [{ type: 'linear', angle: 135, stops: [{ o: 0, c: g[0] }, { o: 1, c: g[1] }], opacity: 1, visible: true }] }) }); } } }))));
    };
    async function iconsTab(f) {
      const grid = h('div.icon-grid'); body.append(grid, h('p.muted.small', T('Icons by Iconify, open source sets'))); if (!f) { grid.append(UI.spinner()); }
      try { const query = f || 'star'; const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=72`); const j = await r.json(); grid.textContent = ''; (j.icons || []).forEach(id => { const [pre, name] = id.split(':'); grid.append(h('button.icon-tile', { title: id, onclick: () => P.insert({ kind: 'icon', id }), draggable: true, ondragstart: drag({ kind: 'icon', id }) }, h('img', { src: `https://api.iconify.design/${pre}/${name}.svg?height=40&color=%23c9c9d9`, loading: 'lazy', alt: name }))); }); if (!(j.icons || []).length) grid.append(UI.empty('No results')); } catch (e) { grid.textContent = ''; grid.append(UI.empty('Icons need an internet connection')); }
    }
    async function photosTab(f) {
      const grid = h('div.photo-grid'); body.append(grid, h('p.muted.small', T('Free photos from Openverse'))); grid.append(UI.spinner());
      try { const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(f || 'nature')}&page_size=30&mature=false&license_type=commercial`); const j = await r.json(); grid.textContent = ''; (j.results || []).forEach(p => { const th = p.thumbnail || p.url; grid.append(h('button.photo-tile', { title: p.title || '', onclick: () => P.insert({ kind: 'photo', url: th, title: p.title, credit: (p.creator || '') + ' ' + (p.license || '') }), draggable: true, ondragstart: drag({ kind: 'photo', url: th, title: p.title }) }, h('img', { src: th, loading: 'lazy', alt: p.title || '' }))); }); if (!(j.results || []).length) grid.append(UI.empty('No results')); } catch (e) { grid.textContent = ''; grid.append(UI.empty('Photos need an internet connection')); }
    }
    function chartsTab() {
      let type = 'bar', data = 'Mon,12\nTue,19\nWed,8\nThu,15\nFri,22'; const ta = h('textarea.input', { rows: 6, value: data, onkeydown: e => e.stopPropagation(), oninput: () => { data = ta.value; } });
      body.append(UI.seg(CHARTS.map(c => ({ v: c[0], label: c[1] })), type, v => { type = v; }), h('p.muted.small', T('One row per item, as label comma value')), ta, UI.btn('Add chart', () => P.insert({ kind: 'chart', type, data }), { primary: true, cls: 'full' }));
    }
    draw(); host.append(body); if (UI.curPanelOpts && UI.curPanelOpts.query) { }
  });

  /* ---------- text ---------- */
  reg('text', 'Text', host => {
    let q = ''; const body = h('div'); host.append(body);
    const draw = () => {
      body.textContent = '';
      body.append(h('button.txt-add.h1', { onclick: () => O.addText('heading') }, T('Add a heading')), h('button.txt-add.h2', { onclick: () => O.addText('sub') }, T('Add a subheading')), h('button.txt-add.h3', { onclick: () => O.addText('body') }, T('Add a little bit of body text')),
        sec('Font pairs', h('div.combos', COMBOS.slice(0, 6).map(([a, b, w]) => combo(a, b, w)))),
        sec('Text effects', h('div.fx-grid.big', Object.keys(FX).map(n => { const b = h('button.fx.big', { onclick: () => P.insert({ kind: 'textfx', name: n }), draggable: true, ondragstart: drag({ kind: 'textfx', name: n }) }, h('span', { style: 'font-family:Poppins;font-weight:800' }, 'Ag'), h('small', T(n))); const e = D.make('text', { runs: [{ t: 'Ag' }], fs: 34 }); FX[n](e); const sh = (e.shadows || []).map(s => `${s.x / 3}px ${s.y / 3}px ${s.blur / 3}px ${U.rgba(s.color, s.opacity)}`).join(','); const sp = b.firstChild; sp.style.textShadow = sh; sp.style.color = e.fills[0] && e.fills[0].type === 'solid' ? (e.fills[0].opacity === 0 ? 'transparent' : e.fills[0].color) : '#2563eb'; if (e.stroke) sp.style.webkitTextStroke = e.stroke.width / 2 + 'px ' + e.stroke.color; if (e.bg) { sp.style.background = e.bg.color; } if (e.fills[0] && e.fills[0].type === 'linear') { sp.style.background = `linear-gradient(90deg,${e.fills[0].stops[0].c},${e.fills[0].stops[1].c})`; sp.style.webkitBackgroundClip = 'text'; sp.style.color = 'transparent'; } return b; }))),
        sec('Fonts', search('Search fonts', v => { q = v; draw(); }, q), UI.fontPicker(S.sel.length && OC.sel.one() && OC.sel.one().ff, n => { const e = OC.sel.one(); if (e && e.type === 'text') OC.editor.setTextProp('font', n); else { const t = D.make('text', { name: 'Text', runs: [{ t: n }], ff: n, fs: 80, w: 600, fills: [D.solid('#1c1c28')] }); t.h = OC.text.layout(t).h; O.add(t); } })));
    };
    draw(); OC.bus.on('fonts-changed', () => { if (UI.curPanel === 'text') draw(); });
  });

  /* ---------- brand ---------- */
  reg('brand', 'Brand', host => {
    const b = S.project.brand; const body = h('div'); host.append(body);
    const draw = () => {
      body.textContent = '';
      body.append(sec('Brand colors', h('div.swatches', b.colors.map((c, i) => h('div.brand-sw', h('button.swatch.lg', { style: 'background:' + c, title: T('Click to apply'), onclick: () => applyColor(c) }), h('button.x', { onclick: () => { b.colors.splice(i, 1); OC.history.commit('Brand'); draw(); }, html: OC.icon('x', 11) }))), UI.colorBtn('#2563eb', () => { }, c => { b.colors.push(c); OC.history.commit('Brand'); draw(); }, { title: 'Add color', cls: 'add' })), h('div.row', UI.btn('From image', async () => { const f = await U.pickFile('image/*'); if (!f[0]) return; const img = await U.loadImage(URL.createObjectURL(f[0])); const pal = await O.imagePalette(img, 6); pal.forEach(c => { if (!b.colors.includes(c)) b.colors.push(c); }); OC.history.commit('Brand'); draw(); }, { icon: 'image' }), UI.btn('Use page colors', async () => { const pg = OC.page(); const cols = await O.palette(pg.elements, 8); cols.forEach(c => { if (!b.colors.includes(c)) b.colors.push(c); }); OC.history.commit('Brand'); draw(); }))));
      const fontRow = (k, label) => h('div.brand-font', h('small', T(label)), h('button.btn.full.font-btn', { style: 'font-family:' + OC.fonts.stack(b.fonts[k]), onclick: ev => UI.toggleSticky(ev.currentTarget, () => UI.fontPicker(b.fonts[k], n => { b.fonts[k] = n; OC.history.commit('Brand'); draw(); }), { cls: 'pop-font' }) }, b.fonts[k]));
      body.append(sec('Brand fonts', fontRow('heading', 'Heading'), fontRow('sub', 'Subheading'), fontRow('body', 'Body'), UI.btn('Apply fonts to page', () => { const sizeOf = e => e.fs >= 64 ? 'heading' : e.fs >= 40 ? 'sub' : 'body'; const walk = list => list.forEach(e => { if (e.type === 'text') { e.ff = b.fonts[sizeOf(e)]; (e.runs || []).forEach(r => delete r.ff); OC.fonts.ensure(e.ff); } if (e.children) walk(e.children); }); walk(OC.page().elements); OC.text.clear(); OC.history.commit('Apply brand fonts'); }, { cls: 'full' })));
      body.append(sec('Logos', h('div.grid3', b.logos.map((l, i) => h('button.logo-tile', { onclick: () => O.addImage(l, 'Logo'), title: T('Add to design') }, h('img', { src: OC.assets.url(l) })))), UI.btn('Upload logo', async () => { const fs = await U.pickFile('image/*,.svg'); for (const f of fs) { const id = await OC.assets.add(f, f.name); b.logos.push('asset:' + id); } OC.history.commit('Brand'); draw(); }, { icon: 'upload', cls: 'full' })));
      body.append(sec('Apply brand', UI.btn('Recolor page with brand colors', () => O.recolorPage(b.colors.filter((c, i) => i < 6)), { icon: 'palette', cls: 'full' })));
    };
    const applyColor = c => { const els = OC.sel.els(); if (!els.length) { OC.page().bg = { type: 'solid', color: c }; OC.history.commit('Background'); return; } OC.ctxbar.apply(e => { if (e.type === 'text') { e.fills = [D.solid(c)]; } else if (e.fills) { if (e.fills[0] && e.fills[0].type === 'solid') e.fills[0].color = c; else e.fills = [D.solid(c)]; } }, 'Color'); };
    draw();
  });

  /* ---------- uploads ---------- */
  reg('uploads', 'Uploads', host => {
    let tab = 'images'; const body = h('div'); host.append(body);
    const draw = () => {
      body.textContent = ''; body.append(UI.btn('Upload files', async () => { const f = await U.pickFile('image/*,video/*,audio/*,.svg,.ttf,.otf,.woff,.woff2', true); await OC.uploads.importFiles(f, {}); draw(); }, { primary: true, cls: 'full', icon: 'upload' }), h('div.dropzone', T('Drop files here or paste')), h('div.chips', ['images', 'video', 'audio', 'fonts'].map(t => h('button.chip' + (t === tab ? '.on' : ''), { onclick: () => { tab = t; draw(); } }, T(t[0].toUpperCase() + t.slice(1))))));
      if (tab === 'fonts') { body.append(h('div.font-list', OC.fonts.custom.map(f => h('div.row', h('span.grow', { style: 'font-family:"' + f.name + '"' }, f.name), UI.iconBtn('trash-2', 'Remove', () => OC.fonts.removeCustom(f.name).then(draw))))), !OC.fonts.custom.length ? UI.empty('No custom fonts yet') : '', UI.btn('Upload a font', async () => { const f = await U.pickFile('.ttf,.otf,.woff,.woff2', true); for (const x of f) await OC.fonts.addCustom(x); draw(); }, { cls: 'full' })); return; }
      const mime = { images: 'image', video: 'video', audio: 'audio' }[tab]; const list = OC.uploads.listAssets(mime).filter(a => a.mime !== 'image/svg+xml' || tab === 'images'); const grid = h('div.grid2.cards');
      list.forEach(a => grid.append(h('button.card', { onclick: () => OC.uploads.place({ id: a.id, type: mime, name: a.name }, {}), draggable: true, ondragstart: drag({ kind: 'asset', id: a.id, type: mime, name: a.name }), title: a.name }, mime === 'image' ? h('div.card-img', { style: `background-image:url("${a.url}")` }) : mime === 'video' ? h('video.card-img', { src: a.url, muted: true, preload: 'metadata' }) : h('div.card-img.audio', { html: OC.icon('music', 28) }), h('span', a.name))));
      body.append(grid); if (!list.length) body.append(UI.empty('Nothing uploaded yet'));
      const url = h('input.input', { placeholder: T('Paste an image link'), onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter' && url.value) O.addImage(url.value.trim(), 'Image'); } }); body.append(h('div.psec', h('h4', T('From a link')), url));
    };
    draw(); OC.bus.on('uploads', () => { if (UI.curPanel === 'uploads') draw(); });
  });

  /* ---------- tools ---------- */
  reg('tools', 'Tools', host => {
    const card = (icon, label, fn, adv) => h('button.tool-card' + (adv ? '.adv' : ''), { onclick: fn }, h('span', { html: OC.icon(icon, 26) }), h('b', T(label)));
    const noImg = () => { const e = OC.sel.one(); if (!e || (e.type !== 'image' && e.type !== 'video')) { U.toast('Select a photo first'); return null; } return e; };
    host.append(sec('Draw', h('div.grid2', card('pencil', 'Pencil', () => E.setTool('pencil')), card('pen-tool', 'Pen', () => E.setTool('pen'), true)), h('div.row', h('span.lbl', T('Color')), UI.colorBtn(S.drawColor, c => { S.drawColor = c; }, c => { S.drawColor = c; }), UI.num(S.drawWidth, v => { S.drawWidth = v; }, { label: 'W', min: 1, max: 100, w: 80, dec: 0 })), UI.field('Brush', UI.select(Object.keys(V.PROFILES).map(k => [k, k[0].toUpperCase() + k.slice(1)]), S.drawProfile || 'uniform', v => { S.drawProfile = v; }))),
      sec('Photo tools', h('div.grid2', card('eraser', 'Background remover', () => { const e = noImg(); e && OC.photo.removeBackground(e); }), card('wand-sparkles', 'Magic eraser', () => { if (noImg()) { UI.openPanel('photo', { tab: 'ai', tool: 'eraser' }); } }), card('scan-text', 'Grab text', () => { const e = noImg(); e && OC.photo.grabText(e); }), card('scissors', 'Magic grab', () => { const e = noImg(); e && OC.photo.magicGrab(e); }), card('image', 'Background generator', () => UI.openPanel('photo', { tab: 'ai' })), card('sliders-horizontal', 'Edit photo', () => { if (noImg()) UI.openPanel('photo'); }))),
      sec('Create', h('div.grid2', card('qr-code', 'QR code', qrDialog), card('bar-chart-3', 'Charts', () => UI.openPanel('elements', { tab: 'charts' })), card('pipette', 'Eyedropper', async () => { if (!window.EyeDropper) { U.toast('Not supported in this browser'); return; } try { const r = await new EyeDropper().open(); const c = r.sRGBHex; if (!S.project.brand.colors.includes(c)) { S.project.brand.colors.push(c); OC.history.commit('Brand'); } navigator.clipboard && navigator.clipboard.writeText(c); U.toast('Copied ' + c); } catch (e) { } }), card('sticker', 'Sticky note', () => E.setTool('sticky')), card('languages', 'Translate page', async () => { const pg = OC.page(); OC.sel.set(pg.elements.map(e => e.id)); O.translateText(); }), card('scaling', 'Resize', () => UI.resizeDialog()))),
      sec('Open projects', h('div.grid2', card('file-text', 'Doc', () => OC.app.create(OC.CATEGORIES.find(c => c.id === 'docs'), ['Blank doc', 794, 1123])), card('table', 'Sheet', () => OC.app.create(OC.CATEGORIES.find(c => c.id === 'sheets'), ['Blank sheet', 0, 0])), card('code', 'Code', () => OC.app.create(OC.CATEGORIES.find(c => c.id === 'code'), ['HTML playground', 0, 0])), card('globe', 'Website', () => OC.app.create(OC.CATEGORIES.find(c => c.id === 'websites'), ['Landing page', 0, 0])))));
  });
  function qrDialog() {
    let text = 'https://', color = '#000000', bg = '#ffffff'; const inp = h('input.input', { value: text, onkeydown: e => e.stopPropagation(), oninput: () => { text = inp.value; } });
    UI.modal({ title: 'QR code', width: 400, body: [inp, h('div.row', h('span.lbl', T('Color')), UI.colorBtn(color, c => { color = c; }, c => { color = c; }), h('span.lbl', T('Background')), UI.colorBtn(bg, c => { bg = c; }, c => { bg = c; }))], actions: [{ label: 'Cancel' }, { label: 'Add', primary: true, onclick: () => { try { O.add(V.qrEl(text || ' ', color, bg)); } catch (e) { U.toast('Text is too long for a QR code'); } } }] });
  }

  /* ---------- projects ---------- */
  reg('projects', 'Projects', host => {
    const body = h('div.col'); host.append(UI.btn('New design', () => UI.newDialog(), { primary: true, cls: 'full', icon: 'plus' }), UI.btn('Open project file', () => OC.app.openFile(), { cls: 'full', icon: 'folder-open' }), body);
    OC.app.listProjects().then(list => { body.textContent = ''; list.forEach(p => body.append(h('div.proj-row' + (S.project && S.project.id === p.id ? '.on' : ''), h('button.proj-main', { onclick: () => OC.app.openId(p.id) }, h('div.proj-thumb', { style: p.thumb ? `background-image:url("${p.thumb}")` : '' }), h('div', h('b', p.name), h('small', new Date(p.modified).toLocaleDateString() + ' · ' + T(p.cat || 'Design')))), UI.iconBtn('trash-2', 'Delete', async () => { if (await UI.confirm('Delete project', p.name, 'Delete', true)) { await OC.app.deleteProject(p.id); UI.openPanel('projects'); } })))); if (!list.length) body.append(UI.empty('No saved projects')); });
  });

  /* ---------- symbols ---------- */
  const rng = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i));
  const SYMS = { Arrows: rng(0x2190, 0x21ff).concat(rng(0x27f0, 0x27ff)), Math: rng(0x2200, 0x22ff).slice(0, 120), Currency: ['$', '€', '£', '¥', '₹', '₩', '₽', '₺', '₫', '฿', '₴', '₦', '₱', '₪', '¢', '₿'], Shapes: rng(0x25a0, 0x25ff), Stars: ['★', '☆', '✦', '✧', '✩', '✪', '✫', '✬', '✭', '✮', '✯', '✰', '❂', '❉', '❋', '✱', '✲', '✳', '✴', '✵', '✶', '✷', '✸', '✹', '✺'], Dingbats: rng(0x2701, 0x275e), Weather: rng(0x2600, 0x2614), Music: rng(0x2669, 0x266f), Letters: rng(0x2100, 0x214f), Fractions: rng(0x2150, 0x215f), Circled: rng(0x2460, 0x2473).concat(rng(0x24b6, 0x24e9)), Greek: rng(0x391, 0x3a9).concat(rng(0x3b1, 0x3c9)), Punctuation: ['“', '”', '‘', '’', '«', '»', '‹', '›', '…', '•', '·', '–', '—', '†', '‡', '§', '¶', '©', '®', '™', '°', '№', '‰', '※', '⁂'], Braille: rng(0x2800, 0x283f), Latin: rng(0xc0, 0xff) };
  reg('symbols', 'Symbols', host => {
    let cat = 'Arrows', q = ''; const body = h('div'); host.append(body);
    const mine = () => OC.ls.get('symbols', []);
    const draw = () => {
      body.textContent = ''; body.append(h('div.chips.scroll', ['Mine', ...Object.keys(SYMS)].map(c => h('button.chip' + (c === cat ? '.on' : ''), { onclick: () => { cat = c; draw(); } }, T(c)))));
      if (cat === 'Mine') { body.append(UI.btn('Save selection as symbol', () => { const els = O.ordered(OC.sel.els()); if (!els.length) { U.toast('Select something first'); return; } let el = els.length === 1 ? U.clone(els[0]) : D.make('group', { name: 'Symbol', children: U.clone(els), w: 1, h: 1 }); if (els.length > 1) { const b = D.boundsOf(els); el.children.forEach(c => { c.x -= b.x; c.y -= b.y; }); el.w = b.w; el.h = b.h; } el.x = 0; el.y = 0; el.rot = 0; const l = mine(); l.push({ id: U.uid('s'), el }); OC.ls.set('symbols', l); draw(); }, { icon: 'plus', cls: 'full' }), h('div.emoji-grid', mine().map(s => h('button.emoji.sym', { onclick: () => P.insert({ kind: 'mysymbol', el: s.el }), oncontextmenu: ev => { ev.preventDefault(); OC.ls.set('symbols', mine().filter(x => x.id !== s.id)); draw(); }, title: s.el.name }, (() => { try { const c = OC.render.renderElements([{ ...U.clone(s.el), x: 0, y: 0, rot: 0 }], { scale: Math.min(1, 40 / Math.max(s.el.w, s.el.h)) }); return c; } catch (e) { return '?'; } })()))), !mine().length ? UI.empty('Saved symbols appear here') : ''); return; }
      body.append(h('div.emoji-grid', SYMS[cat].map(ch => h('button.emoji.sym', { onclick: () => P.insert({ kind: 'symbol', ch }), draggable: true, ondragstart: drag({ kind: 'symbol', ch }), title: 'U+' + ch.codePointAt(0).toString(16).toUpperCase() }, ch))));
    };
    draw();
  });

  /* ---------- graphics generators ---------- */
  const rand = seed => { let s = seed | 0 || 1; return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 100000) / 100000; }; };
  const GEN = {
    Spirograph: { kind: 'vec', stroke: true, params: [{ k: 'R', l: 'Outer', min: 20, max: 200, def: 100 }, { k: 'r', l: 'Inner', min: 5, max: 150, def: 37 }, { k: 'd', l: 'Offset', min: 5, max: 200, def: 60 }], make(p) { const g = (a, b) => b ? g(b, a % b) : a; const turns = Math.round(p.r) / g(Math.round(p.R), Math.round(p.r)); const pts = []; for (let t = 0; t <= Math.PI * 2 * turns; t += .02) { pts.push({ x: (p.R - p.r) * Math.cos(t) + p.d * Math.cos((p.R - p.r) / p.r * t), y: (p.R - p.r) * Math.sin(t) - p.d * Math.sin((p.R - p.r) / p.r * t) }); } return V.fromPoints(pts, .6); } },
    Blob: { kind: 'vec', params: [{ k: 'n', l: 'Points', min: 3, max: 12, def: 6 }, { k: 'rough', l: 'Wobble', min: 0, max: 80, def: 35 }, { k: 'seed', l: 'Seed', min: 1, max: 999, def: 7 }], make(p) { const r = rand(p.seed * 9301); const pts = []; for (let i = 0; i < p.n; i++) { const a = i / p.n * Math.PI * 2, rr = 100 * (1 - p.rough / 100 * r() * .6); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } V.init(); const path = new paper.Path({ segments: pts, closed: true }); path.smooth({ type: 'catmull-rom', factor: .5 }); const info = V.fromPaper(path); path.remove(); return info; } },
    Waves: { kind: 'group', params: [{ k: 'layers', l: 'Layers', min: 1, max: 6, def: 3 }, { k: 'amp', l: 'Height', min: 5, max: 80, def: 30 }, { k: 'freq', l: 'Frequency', min: 1, max: 8, def: 3 }], makeAll(p) { const out = []; for (let l = 0; l < p.layers; l++) { let d = `M0 ${100 - l * 12}`; for (let x = 0; x <= 400; x += 10) d += `L${x} ${70 - l * 14 + Math.sin(x / 400 * Math.PI * 2 * p.freq + l * 1.3) * p.amp}`; d += 'L400 200L0 200Z'; out.push({ d, op: .35 + l * .6 / Math.max(1, p.layers) }); } return out; } },
    Sunburst: { kind: 'vec', params: [{ k: 'rays', l: 'Rays', min: 4, max: 60, def: 20 }, { k: 'inner', l: 'Inner', min: 5, max: 90, def: 30 }], make(p) { const pts = []; for (let i = 0; i < p.rays * 2; i++) { const a = i * Math.PI / p.rays; const r = i % 2 ? p.inner : 100; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } V.init(); const path = new paper.Path({ segments: pts, closed: true }); const info = V.fromPaper(path); path.remove(); return info; } },
    Gear: { kind: 'vec', params: [{ k: 'teeth', l: 'Teeth', min: 6, max: 40, def: 14 }, { k: 'depth', l: 'Depth', min: 4, max: 30, def: 14 }, { k: 'hole', l: 'Hole', min: 0, max: 60, def: 25 }], make(p) { const pts = []; const n = p.teeth; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, w = Math.PI * 2 / n; [[0, 100 - p.depth], [.2, 100], [.5, 100], [.7, 100 - p.depth]].forEach(([o, r]) => pts.push([Math.cos(a + o * w) * r, Math.sin(a + o * w) * r])); } V.init(); const outer = new paper.Path({ segments: pts, closed: true }); let item = outer; if (p.hole > 0) { const hole = new paper.Path.Circle({ center: [0, 0], radius: p.hole }); item = outer.subtract(hole, { insert: false }); outer.remove(); hole.remove(); } const info = V.fromPaper(item); item.remove(); return info; } },
    Rose: { kind: 'vec', stroke: true, params: [{ k: 'k', l: 'Petals', min: 2, max: 12, def: 5 }, { k: 'turns', l: 'Turns', min: 1, max: 4, def: 2 }], make(p) { const pts = []; for (let t = 0; t <= Math.PI * 2 * p.turns; t += .02) { const r = 100 * Math.cos(p.k / (p.turns > 1 ? p.turns / 1 : 1) * t); pts.push({ x: r * Math.cos(t), y: r * Math.sin(t) }); } return V.fromPoints(pts, .5); } },
    Lissajous: { kind: 'vec', stroke: true, params: [{ k: 'a', l: 'A', min: 1, max: 9, def: 3 }, { k: 'b', l: 'B', min: 1, max: 9, def: 2 }, { k: 'delta', l: 'Phase', min: 0, max: 180, def: 90 }], make(p) { const pts = []; for (let t = 0; t <= Math.PI * 2; t += .02) pts.push({ x: 100 * Math.sin(p.a * t + p.delta * Math.PI / 180), y: 100 * Math.sin(p.b * t) }); return V.fromPoints(pts, .4); } },
    'Dot grid': { kind: 'vec', params: [{ k: 'cols', l: 'Columns', min: 2, max: 20, def: 8 }, { k: 'rows', l: 'Rows', min: 2, max: 20, def: 8 }, { k: 'size', l: 'Dot size', min: 2, max: 20, def: 7 }], make(p) { V.init(); const all = new paper.CompoundPath({ children: [] }); for (let i = 0; i < p.cols; i++) for (let j = 0; j < p.rows; j++) all.addChild(new paper.Path.Circle({ center: [i * 30, j * 30], radius: p.size / 2 })); const info = V.fromPaper(all); all.remove(); return info; } },
    'Noise texture': { kind: 'raster', params: [{ k: 'scale', l: 'Scale', min: 2, max: 40, def: 12 }, { k: 'seed', l: 'Seed', min: 1, max: 999, def: 3 }, { k: 'contrast', l: 'Contrast', min: 1, max: 10, def: 3 }], colors: ['#0f0c29', '#ff5d8f'], make(p, size, cols) { const c = U.newCanvas(size, size), g = c.getContext('2d'); const r = rand(p.seed * 7919); const N = 64; const grid = Array.from({ length: N + 1 }, () => Array.from({ length: N + 1 }, () => r())); const sm = t => t * t * (3 - 2 * t); const val = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = grid[yi % N][xi % N], b = grid[yi % N][(xi + 1) % N], c2 = grid[(yi + 1) % N][xi % N], d = grid[(yi + 1) % N][(xi + 1) % N]; return U.lerp(U.lerp(a, b, xf), U.lerp(c2, d, xf), yf); }; const img = g.createImageData(size, size); const A = U.parseColor(cols[0]), B = U.parseColor(cols[1]); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let v = val(x / size * p.scale, y / size * p.scale) * .6 + val(x / size * p.scale * 2, y / size * p.scale * 2) * .3 + val(x / size * p.scale * 4, y / size * p.scale * 4) * .1; v = U.clamp((v - .5) * p.contrast + .5, 0, 1); const i = (y * size + x) * 4; img.data[i] = U.lerp(A[0], B[0], v); img.data[i + 1] = U.lerp(A[1], B[1], v); img.data[i + 2] = U.lerp(A[2], B[2], v); img.data[i + 3] = 255; } g.putImageData(img, 0, 0); return c; } },
    'Mesh gradient': { kind: 'raster', params: [{ k: 'blobs', l: 'Blobs', min: 2, max: 8, def: 5 }, { k: 'seed', l: 'Seed', min: 1, max: 999, def: 11 }, { k: 'soft', l: 'Softness', min: 20, max: 200, def: 100 }], colors: ['#2563eb', '#06b6d4'], make(p, size, cols) { const c = U.newCanvas(size, size), g = c.getContext('2d'); const r = rand(p.seed * 4421); g.fillStyle = cols[0]; g.fillRect(0, 0, size, size); const pal = [cols[0], cols[1], '#00c2a8', '#ffb020', '#38b6ff', '#ff914d']; g.filter = `blur(${p.soft * size / 800}px)`; for (let i = 0; i < p.blobs; i++) { g.fillStyle = pal[i % pal.length]; g.beginPath(); g.ellipse(r() * size, r() * size, size * (.2 + r() * .3), size * (.2 + r() * .3), r() * 3, 0, 7); g.fill(); } g.filter = 'none'; return c; } }
  };
  OC.GEN = GEN;
  reg('graphics', 'Graphics', host => {
    let name = 'Spirograph'; const body = h('div'); host.append(body); const vals = {}; let fillC = '#2563eb';
    const draw = () => {
      body.textContent = ''; const g = GEN[name]; g.params.forEach(p => { if (vals[name + p.k] == null) vals[name + p.k] = p.def; });
      const getP = () => { const o = {}; g.params.forEach(p => { o[p.k] = vals[name + p.k]; }); return o; }; const prev = h('div.gen-prev');
      const upd = () => { prev.textContent = ''; try { const o = getP(); if (g.kind === 'raster') { const c = g.make(o, 200, g.colors.map((c, i) => vals[name + 'c' + i] || c)); prev.append(c); c.style.width = '100%'; } else if (g.kind === 'group') { const ds = g.makeAll(o); prev.innerHTML = `<svg viewBox="0 0 400 200" width="100%">${ds.map(x => `<path d="${x.d}" fill="${fillC}" opacity="${x.op}"/>`).join('')}</svg>`; } else { const info = g.make(o); const el = V.makePathEl(info.subpaths, info.bounds, {}); const b = info.bounds; prev.innerHTML = `<svg viewBox="${-6} ${-6} ${b.w + 12} ${b.h + 12}" width="100%" height="150"><path d="${V.pathD(el)}" fill="${g.stroke ? 'none' : fillC}" stroke="${g.stroke ? fillC : 'none'}" stroke-width="${Math.max(b.w, b.h) / 100}" fill-rule="evenodd"/></svg>`; } } catch (e) { prev.textContent = '…'; console.warn(e); } };
      body.append(h('div.chips.scroll', Object.keys(GEN).map(n => h('button.chip' + (n === name ? '.on' : ''), { onclick: () => { name = n; draw(); } }, T(n)))), prev,
        ...g.params.map(p => h('div.row', h('span.lbl', T(p.l)), UI.slider(vals[name + p.k], p.min, p.max, p.k === 'seed' || Number.isInteger(p.def) ? 1 : .1, v => { vals[name + p.k] = v; upd(); }), h('span.small.muted', ''))),
        g.kind === 'raster' ? h('div.row', ...g.colors.map((c, i) => UI.colorBtn(vals[name + 'c' + i] || c, v => { vals[name + 'c' + i] = v; upd(); }, v => { vals[name + 'c' + i] = v; upd(); }))) : h('div.row', h('span.lbl', T(g.stroke ? 'Stroke' : 'Fill')), UI.colorBtn(fillC, v => { fillC = v; upd(); }, v => { fillC = v; upd(); })),
        h('div.row', UI.btn('Shuffle', () => { g.params.forEach(p => { vals[name + p.k] = U.round(p.min + Math.random() * (p.max - p.min), Number.isInteger(p.def) ? 0 : 1); }); draw(); }, { icon: 'rotate-cw' }), UI.btn('Add to design', async () => { const o = getP(); if (g.kind === 'raster') { const c = g.make(o, 1600, g.colors.map((c, i) => vals[name + 'c' + i] || c)); const blob = await U.canvasBlob(c); const id = await OC.assets.add(blob, name + '.png'); O.addImage('asset:' + id, name, { noResize: true }); } else if (g.kind === 'group') { const ds = g.makeAll(o); const kids = ds.map(x => { const info = V.fromD(x.d); return V.makePathEl(info.subpaths, info.bounds, { name: 'Wave', fills: [D.solid(fillC)], opacity: x.op }); }); const gr = D.make('group', { name: 'Waves', children: kids, w: 1, h: 1 }); D.fitGroup(gr); O.add(gr); } else { const info = g.make(o); const sz = 320 / Math.max(info.bounds.w, info.bounds.h, 1); const el = V.makePathEl(info.subpaths, info.bounds, { name }); el.w = info.bounds.w * sz; el.h = info.bounds.h * sz; if (g.stroke) { el.fills = []; el.stroke = { color: fillC, width: 3, align: 'center', cap: 'round', join: 'round', dash: [], profile: 'uniform', opacity: 1 }; } else el.fills = [D.solid(fillC)]; el.fillRule = 'evenodd'; O.add(el); } }, { primary: true })), h('p.muted.small', T('Vector results stay fully editable. Use the Pen tool for hand drawn shapes.')));
      upd();
    };
    draw();
  });

  /* ---------- 3D ---------- */
  reg('three', '3D', (host, opts) => OC.threed ? OC.threed.renderPanel(host, opts) : host.append(UI.empty('3D is loading')));
})();
