/* UI primitives: popovers, modals, menus, controls, color picker */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc;
  const UI = OC.ui = { panels: {}, pops: [], modals: 0 };
  const T = s => OC.t(s);
  UI.T = T;
  const ic = (n, s) => h('span.ico', { html: OC.icon(n, s || 18) });
  UI.ic = ic;

  /* ---------- popover ---------- */
  UI.closeMenus = function () { UI.pops.slice().forEach(p => p.close()); };
  UI.popover = function (anchor, content, o = {}) {
    if (o.exclusive !== false) UI.closeMenus();
    const el = h('div.popover' + (o.cls ? '.' + o.cls : ''), { 'data-keep-edit': '1', onpointerdown: e => e.stopPropagation() }, content); document.body.append(el);
    const place = () => {
      const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
      const w = el.offsetWidth, hh = el.offsetHeight; let x = o.side === 'right' ? r.right + 8 : r.left, y = o.side === 'right' ? r.top : r.bottom + 6;
      if (o.side === 'top') { x = r.left; y = r.top - hh - 6; }
      if (x + w > innerWidth - 8) x = Math.max(8, innerWidth - w - 8); if (y + hh > innerHeight - 8) y = Math.max(8, (o.side === 'right' ? innerHeight - hh - 8 : r.top - hh - 6)); if (y < 8) y = 8;
      el.style.left = x + 'px'; el.style.top = y + 'px';
    };
    place(); requestAnimationFrame(place);
    const pop = { el, place, close() { el.remove(); UI.pops = UI.pops.filter(p => p !== pop); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); o.onclose && o.onclose(); } };
    const away = e => { if (!el.contains(e.target) && !(anchor.contains && anchor.contains(e.target)) && !e.target.closest('.popover')) pop.close(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); pop.close(); } };
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true); }, 0);
    UI.pops.push(pop); return pop;
  };
  UI.toggleSticky = function (anchor, build, o) { if (anchor._pop && UI.pops.includes(anchor._pop)) { anchor._pop.close(); anchor._pop = null; return; } anchor._pop = UI.popover(anchor, build(), o); };

  /* ---------- modal ---------- */
  UI.modalOpen = () => UI.modals > 0;
  UI.modal = function (o) {
    UI.closeMenus(); UI.modals++;
    const close = () => { back.remove(); UI.modals = Math.max(0, UI.modals - 1); document.removeEventListener('keydown', key, true); o.onclose && o.onclose(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const body = h('div.modal-body', o.body);
    const actions = (o.actions || []).length ? h('div.modal-actions', o.actions.map(a => h('button.btn' + (a.primary ? '.primary' : '') + (a.danger ? '.danger' : ''), { onclick: () => { const r = a.onclick ? a.onclick(m) : null; if (a.keep !== true && r !== false) close(); } }, T(a.label)))) : null;
    const m = { close, body, el: null };
    const box = h('div.modal' + (o.cls ? '.' + o.cls : ''), { style: o.width ? 'width:' + o.width + 'px' : '', 'data-keep-edit': '1' }, h('div.modal-head', h('h2', T(o.title || '')), h('button.icon-btn', { onclick: close, html: OC.icon('x') })), body, actions);
    const back = h('div.backdrop', { onpointerdown: e => { if (e.target === back) close(); } }, box); document.body.append(back); m.el = box; document.addEventListener('keydown', key, true);
    return m;
  };
  UI.prompt = function (title, value, placeholder) {
    return new Promise(res => {
      let done = false; const inp = h('input.input', { value: value || '', placeholder: placeholder || '', onkeydown: e => { if (e.key === 'Enter') { done = true; res(inp.value); m.close(); } } });
      const m = UI.modal({ title, body: inp, width: 380, onclose: () => { if (!done) res(null); }, actions: [{ label: 'Cancel' }, { label: 'OK', primary: true, onclick: () => { done = true; res(inp.value); } }] });
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  };
  UI.confirm = function (title, text, okLabel = 'OK', danger) {
    return new Promise(res => { let done = false; UI.modal({ title, body: h('p.muted', T(text || '')), width: 380, onclose: () => { if (!done) res(false); }, actions: [{ label: 'Cancel' }, { label: okLabel, primary: !danger, danger, onclick: () => { done = true; res(true); } }] }); });
  };
  UI.pickLanguage = function () {
    return new Promise(res => {
      let done = false; const list = h('div.lang-list'); const q = h('input.input', { placeholder: T('Search'), oninput: () => draw() });
      const draw = () => { list.textContent = ''; OC.i18n.langs.filter(l => !q.value || (l[1] + l[0]).toLowerCase().includes(q.value.toLowerCase())).forEach(l => list.append(h('button.lang-item' + (l[0] === OC.settings.lang ? '.on' : ''), { onclick: () => { done = true; res(l[0]); m.close(); } }, h('span', l[1]), h('small', l[0])))); };
      draw(); const m = UI.modal({ title: 'Language', body: [q, list], width: 420, onclose: () => { if (!done) res(null); } }); setTimeout(() => q.focus(), 30);
    });
  };

  /* ---------- menus ---------- */
  UI.menu = function (items, x, y, o = {}) {
    UI.closeMenus();
    const mk = (its, parent) => {
      const el = h('div.menu' + (parent ? '.sub' : ''), { 'data-keep-edit': '1', onpointerdown: e => e.stopPropagation(), oncontextmenu: e => e.preventDefault() });
      its.filter(i => i && !i.hidden).forEach(i => {
        if (i.sep) { el.append(h('div.menu-sep')); return; }
        const row = h('button.menu-item' + (i.disabled ? '.disabled' : ''), { onclick: () => { if (i.disabled || i.sub) return; UI.closeMenus(); i.onclick && i.onclick(); } },
          h('span.mi-ic', i.icon ? h('span', { html: OC.icon(i.icon, 17) }) : i.check ? h('span', { html: OC.icon('check', 15) }) : ''), h('span.mi-l', T(i.label)), i.keys ? h('span.keycap', i.keys) : '', i.sub ? h('span.mi-arrow', { html: OC.icon('chevron-right', 15) }) : '');
        if (i.sub) {
          let subEl = null; const open = () => { if (subEl) return; subEl = mk(i.sub, true); document.body.append(subEl); const r = row.getBoundingClientRect(); const w = subEl.offsetWidth; let sx = r.right - 4; if (sx + w > innerWidth) sx = r.left - w + 4; subEl.style.left = sx + 'px'; subEl.style.top = Math.min(r.top - 6, innerHeight - subEl.offsetHeight - 8) + 'px'; subEl._owner = el; UI.pops.push({ el: subEl, close() { subEl && subEl.remove(); } }); };
          row.addEventListener('pointerenter', () => { Array.from(document.querySelectorAll('.menu.sub')).forEach(s => { if (s !== subEl && s._owner === el) s.remove(); }); open(); });
        } else row.addEventListener('pointerenter', () => { Array.from(document.querySelectorAll('.menu.sub')).forEach(s => { if (s._owner === el) s.remove(); }); });
        el.append(row);
      });
      return el;
    };
    const el = mk(items); document.body.append(el);
    const pop = { el, close() { el.remove(); document.querySelectorAll('.menu.sub').forEach(s => s.remove()); UI.pops = UI.pops.filter(p => p !== pop); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); } };
    const away = e => { if (!e.target.closest('.menu')) pop.close(); }; const key = e => { if (e.key === 'Escape') pop.close(); };
    const place = () => { const w = el.offsetWidth, hh = el.offsetHeight; let px = x, py = y; if (o.anchor) { const r = o.anchor.getBoundingClientRect(); px = r.left; py = r.bottom + 4; } if (px + w > innerWidth - 6) px = innerWidth - w - 6; if (py + hh > innerHeight - 6) py = Math.max(6, innerHeight - hh - 6); el.style.left = px + 'px'; el.style.top = py + 'px'; }; place();
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true); }, 0); UI.pops.push(pop); return pop;
  };

  /* ---------- controls ---------- */
  UI.iconBtn = function (icon, title, onclick, active, o = {}) { return h('button.icon-btn' + (active ? '.on' : '') + (o.cls ? '.' + o.cls : ''), { title: T(title), 'aria-label': T(title), onpointerdown: e => { if (!o.focus) e.preventDefault(); }, onclick: e => onclick(e), html: OC.icon(icon, o.size || 18) + (o.label ? '<span>' + T(o.label) + '</span>' : '') }); };
  UI.btn = function (label, onclick, o = {}) { return h('button.btn' + (o.primary ? '.primary' : '') + (o.cls ? '.' + o.cls : ''), { onclick, title: o.title || '', onpointerdown: e => { if (!o.focus) e.preventDefault(); } }, o.icon ? h('span', { html: OC.icon(o.icon, 16) }) : '', T(label)); };
  UI.toggle = function (value, onChange) { const el = h('button.switch' + (value ? '.on' : ''), { role: 'switch', 'aria-checked': !!value, onclick: () => { value = !value; el.classList.toggle('on', value); el.setAttribute('aria-checked', value); onChange(value); } }, h('i')); return el; };
  UI.seg = function (opts, value, onChange) { const el = h('div.seg'); const draw = () => { el.textContent = ''; opts.forEach(o => el.append(h('button' + (o.v === value ? '.on' : ''), { title: o.title ? T(o.title) : '', onpointerdown: e => e.preventDefault(), onclick: () => { value = o.v; draw(); onChange(o.v); }, html: o.icon ? OC.icon(o.icon, 16) : '' }, o.icon ? '' : T(o.label)))); }; draw(); return el; };
  UI.select = function (opts, value, onChange, cls) { const s = h('select.select' + (cls ? '.' + cls : ''), { onchange: () => onChange(s.value) }, opts.map(o => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return h('option', { value: v, selected: v === value }, T(l)); })); return s; };
  UI.slider = function (value, min, max, step, onInput, onChange) {
    const r = h('input.range', { type: 'range', min, max, step, value, oninput: () => { onInput && onInput(+r.value); r.style.setProperty('--p', (r.value - min) / (max - min) * 100 + '%'); }, onchange: () => onChange && onChange(+r.value) }); r.style.setProperty('--p', (value - min) / (max - min) * 100 + '%'); return r;
  };
  /* number field with scrub label */
  UI.num = function (value, onInput, o = {}) {
    const inp = h('input.num', { type: 'text', inputmode: 'decimal', value: fmt(value, o), onfocus: () => inp.select(), onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const st = (o.step || 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1); commit(parse(inp.value) + st, true); } }, onchange: () => commit(parse(inp.value), false) });
    const parse = v => { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? (o.min || 0) : n; };
    const commit = (v, live) => { if (o.min != null) v = Math.max(o.min, v); if (o.max != null) v = Math.min(o.max, v); inp.value = fmt(v, o); onInput(v, !!live, true); };
    const lab = o.label ? h('span.num-l', { title: o.title || '', onpointerdown: e => { if (!o.scrub && o.scrub !== undefined) return; e.preventDefault(); const x0 = e.clientX, v0 = parse(inp.value); const mv = ev => { let v = v0 + (ev.clientX - x0) * (o.step || 1) * (ev.shiftKey ? 5 : 1) * (o.scrubK || 1); if (o.min != null) v = Math.max(o.min, v); if (o.max != null) v = Math.min(o.max, v); v = U.round(v, o.dec == null ? 2 : o.dec); inp.value = fmt(v, o); onInput(v, true); }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); onInput(parse(inp.value), false, true); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); } }, o.label) : null;
    const el = h('label.numf' + (o.cls ? '.' + o.cls : ''), { style: o.w ? 'width:' + o.w + 'px' : '' }, lab, inp, o.unit ? h('em', o.unit) : null); el.input = inp; el.set = v => { if (document.activeElement !== inp) inp.value = fmt(v, o); }; return el;
  };
  function fmt(v, o) { if (v == null || isNaN(v)) return ''; const d = o.dec == null ? 2 : o.dec; return String(U.round(v, d)); }

  /* ---------- color picker ---------- */
  function hsv2hex(hh, s, v) { const f = n => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return U.toHex(f(5) * 255, f(3) * 255, f(1) * 255); }
  function hex2hsv(hex) { const [r, g, b] = U.parseColor(hex).map(x => x / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d) { hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; } return [hh, mx ? d / mx : 0, mx]; }
  UI.DEFAULT_SWATCHES = ['#000000', '#545454', '#737373', '#a6a6a6', '#d9d9d9', '#ffffff', '#ff3131', '#ff5757', '#ff66c4', '#cb6ce6', '#8c52ff', '#5e17eb', '#0097b2', '#0cc0df', '#5ce1e6', '#38b6ff', '#5271ff', '#004aad', '#00bf63', '#7ed957', '#c1ff72', '#ffde59', '#ffbd59', '#ff914d'];
  UI.colorPanel = function (value, onInput, onChange, o = {}) {
    let [hh, s, v] = hex2hsv(value || '#000000'); const W = 220, H = 140;
    const cv = h('canvas.sv', { width: W * 2, height: H * 2, style: `width:${W}px;height:${H}px` }); const cx = cv.getContext('2d');
    const draw = () => { cx.setTransform(2, 0, 0, 2, 0, 0); cx.fillStyle = hsv2hex(hh, 1, 1); cx.fillRect(0, 0, W, H); let g = cx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = g; cx.fillRect(0, 0, W, H); g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); cx.fillStyle = g; cx.fillRect(0, 0, W, H); const x = s * W, y = (1 - v) * H; cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, y, 6, 0, 7); cx.stroke(); cx.strokeStyle = 'rgba(0,0,0,.5)'; cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y, 7.5, 0, 7); cx.stroke(); };
    const hex = h('input.input.hex', { value: (value || '#000000').toUpperCase(), onkeydown: e => e.stopPropagation(), onchange: () => { const c = hex.value.trim(); if (/^#?[0-9a-f]{3,8}$/i.test(c)) { const col = U.hex(c[0] === '#' ? c : '#' + c); [hh, s, v] = hex2hsv(col); draw(); hue.value = hh; out(true); } } });
    const hue = h('input.range.hue', { type: 'range', min: 0, max: 360, value: hh, oninput: () => { hh = +hue.value; draw(); out(false); }, onchange: () => out(true) });
    const out = fin => { const c = hsv2hex(hh, s, v); hex.value = c.toUpperCase(); sw.style.background = c; fin ? (onChange || onInput)(c) : onInput(c, true); };
    const pick = e => { const r = cv.getBoundingClientRect(); s = U.clamp((e.clientX - r.left) / r.width, 0, 1); v = 1 - U.clamp((e.clientY - r.top) / r.height, 0, 1); draw(); out(false); };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pick(e); const mv = ev => pick(ev); const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); out(true); }; cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); });
    const sw = h('span.cp-sw', { style: 'background:' + (value || '#000') });
    const eye = window.EyeDropper ? h('button.icon-btn', { title: T('Pick from screen'), onclick: async () => { try { const r = await new EyeDropper().open(); [hh, s, v] = hex2hsv(r.sRGBHex); hue.value = hh; draw(); out(true); } catch (e) { } }, html: OC.icon('pipette', 16) }) : null;
    const set = c => { (onChange || onInput)(U.hex(c)); [hh, s, v] = hex2hsv(c); hue.value = hh; draw(); hex.value = U.hex(c).toUpperCase(); sw.style.background = c; };
    const brand = (S.project && S.project.brand.colors) || []; const docc = o.docColors === false ? [] : docColors();
    const row = (title, cols) => cols.length ? [h('div.cp-t', T(title)), h('div.swatches', cols.map(c => h('button.swatch', { style: 'background:' + c, title: c, onclick: () => set(c) })))] : null;
    draw(); return h('div.colorpanel', cv, h('div.cp-row', sw, hue, eye), h('div.cp-row', hex), row('Brand colors', brand), row('Document colors', docc), row('Default colors', UI.DEFAULT_SWATCHES));
  };
  function docColors() {
    const set = new Set(); if (!S.project || !S.project.pages) return [];
    D.allElements().forEach(e => { (e.fills || []).forEach(f => { if (f.type === 'solid') set.add(U.hex(f.color)); }); if (e.stroke) set.add(U.hex(e.stroke.color)); }); return [...set].slice(0, 18);
  }
  UI.colorBtn = function (value, onInput, onChange, o = {}) {
    const b = h('button.color-btn' + (o.cls ? '.' + o.cls : ''), { title: T(o.title || 'Color'), onpointerdown: e => e.preventDefault(), onclick: () => { if (b._pop && UI.pops.includes(b._pop)) { b._pop.close(); return; } b._pop = UI.popover(b, h('div.pop-pad', UI.colorPanel(b._v, (c, live) => { b._v = c; paintBtn(); onInput(c, live); }, c => { b._v = c; paintBtn(); (onChange || onInput)(c, false); })), { cls: 'pop-color' }); } });
    b._v = value; const paintBtn = () => { b.style.setProperty('--c', b._v); if (o.icon) b.style.color = U.lum(b._v) > .55 ? '#111' : '#fff'; }; if (o.icon) b.append(h('span', { html: OC.icon(o.icon, 15), style: 'display:grid' })); paintBtn(); b.set = v => { b._v = v; paintBtn(); }; return b;
  };

  /* gradient editor content */
  UI.gradientPanel = function (fill, onChange) {
    const g = fill; g.stops = g.stops || [{ o: 0, c: '#2563eb' }, { o: 1, c: '#06b6d4' }]; let selIdx = 0; const wrap = h('div.gradpanel');
    const css = () => `linear-gradient(90deg, ${g.stops.slice().sort((a, b) => a.o - b.o).map(s => `${s.c} ${Math.round(s.o * 100)}%`).join(',')})`;
    const render = () => {
      wrap.textContent = '';
      const bar = h('div.grad-bar', { style: 'background:' + css(), onpointerdown: e => { if (e.target !== bar) return; const r = bar.getBoundingClientRect(); const o = U.clamp((e.clientX - r.left) / r.width, 0, 1); g.stops.push({ o, c: U.mix(g.stops[0].c, g.stops[g.stops.length - 1].c, o) }); selIdx = g.stops.length - 1; onChange(g, true); render(); } });
      g.stops.forEach((s, i) => { const m = h('i.stop' + (i === selIdx ? '.on' : ''), { style: `left:${s.o * 100}%;background:${s.c}`, onpointerdown: e => { e.stopPropagation(); selIdx = i; const r = bar.getBoundingClientRect(); const mv = ev => { s.o = U.clamp((ev.clientX - r.left) / r.width, 0, 1); m.style.left = s.o * 100 + '%'; bar.style.background = css(); onChange(g, false); }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); onChange(g, true); render(); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); } }); bar.append(m); });
      const sel = g.stops[selIdx];
      wrap.append(UI.seg([{ v: 'linear', label: 'Linear' }, { v: 'radial', label: 'Radial' }, { v: 'conic', label: 'Conic' }], g.type, v => { g.type = v; onChange(g, true); render(); }), bar,
        h('div.row', UI.colorBtn(sel.c, (c, live) => { sel.c = c; bar.style.background = css(); onChange(g, !live); }, c => { sel.c = c; onChange(g, true); render(); }), UI.num(Math.round(sel.o * 100), v => { sel.o = v / 100; onChange(g, true); render(); }, { unit: '%', min: 0, max: 100, dec: 0, w: 80 }), UI.iconBtn('trash-2', 'Remove stop', () => { if (g.stops.length > 2) { g.stops.splice(selIdx, 1); selIdx = 0; onChange(g, true); render(); } }),
          UI.iconBtn('rotate-cw', 'Reverse', () => { g.stops.forEach(s => { s.o = 1 - s.o; }); onChange(g, true); render(); })),
        g.type !== 'radial' ? h('div.row', h('span.lbl', T('Angle')), UI.slider(g.angle == null ? 90 : g.angle, 0, 360, 1, v => { g.angle = v; onChange(g, false); }, v => { g.angle = v; onChange(g, true); }), UI.num(g.angle == null ? 90 : g.angle, v => { g.angle = v; onChange(g, true); render(); }, { unit: '°', w: 70, dec: 0 })) : null,
        h('div.cp-t', T('Presets')), h('div.swatches.wide', UI.GRADIENTS.map(gr => h('button.swatch.grad', { style: `background:linear-gradient(135deg,${gr[0]},${gr[1]})`, onclick: () => { g.stops = [{ o: 0, c: gr[0] }, { o: 1, c: gr[1] }]; onChange(g, true); render(); } }))));
    };
    render(); return wrap;
  };
  UI.GRADIENTS = [['#2563eb', '#06b6d4'], ['#00c2a8', '#5271ff'], ['#ffde59', '#ff914d'], ['#ff512f', '#dd2476'], ['#11998e', '#38ef7d'], ['#0f2027', '#2c5364'], ['#fc466b', '#3f5efb'], ['#f7971e', '#ffd200'], ['#8e2de2', '#4a00e0'], ['#232526', '#414345'], ['#ee9ca7', '#ffdde1'], ['#00c6ff', '#0072ff']];

  /* generic scrollable section */
  UI.section = function (title, body, o = {}) {
    const open = o.open !== false; const sec = h('div.sect' + (open ? '.open' : '')); const head = h('button.sect-h', { onclick: () => sec.classList.toggle('open') }, h('span', T(title)), o.right || '', h('span.chev', { html: OC.icon('chevron-down', 14) }));
    sec.append(head, h('div.sect-b', body)); return sec;
  };
  UI.field = (label, ...ctrl) => h('div.fld', h('label', T(label)), h('div.fld-c', ctrl));
  UI.empty = text => h('div.empty', T(text));
  UI.spinner = () => h('div.spinner');
  UI.thumbCard = (src, label, onclick, o = {}) => h('button.card' + (o.cls ? '.' + o.cls : ''), { onclick, draggable: !!o.drag, ondragstart: o.drag ? e => { e.dataTransfer.setData('application/x-opencanvas', JSON.stringify(o.drag)); } : null, title: label || '' }, h('div.card-img', { style: src ? `background-image:url("${src}")` : '' }, o.overlay || ''), label ? h('span', label) : null);
})();
