/* Timeline, keyframes, playback and media sync */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui, R = OC.render;
  const T = s => OC.t(s); const TL = OC.timeline = {}; const M = OC.media = {};
  const vids = new Map(), auds = new Map();

  /* ---------- media ---------- */
  function mediaEl(map, el, tag) {
    let m = map.get(el.id); const url = OC.assets.url(el.src);
    if (!m || m.src !== url) { if (m) { m.pause(); } m = document.createElement(tag); m.preload = 'auto'; m.muted = tag === 'video'; m.playsInline = true; m.crossOrigin = 'anonymous'; m.src = url; m._src = url; m.addEventListener('loadedmetadata', () => { if (el.srcDur !== m.duration && isFinite(m.duration)) { el.srcDur = m.duration; if (el.timing && el.timing.end == null && tag === 'video') { } } R.invalidate(); }); m.addEventListener('seeked', () => R.invalidate()); m.addEventListener('loadeddata', () => R.invalidate()); map.set(el.id, m); }
    return m;
  }
  function target(el, t) {
    const start = (el.timing && el.timing.start) || 0; let d = (t - start) * (el.speed || 1) + (el.trim || 0); const dur = el.srcDur || 0;
    if (dur) { const len = dur - (el.trim || 0); if (el.loop && len > 0) d = (el.trim || 0) + (((t - start) * (el.speed || 1)) % len + len) % len; else d = Math.min(d, dur - .02); }
    return Math.max(0, d);
  }
  M.frame = function (el, t, o) {
    if (!el.src) return null; const v = mediaEl(vids, el, 'video'); if (t == null) t = S.time; const want = target(el, t); v.playbackRate = el.speed || 1; v.volume = U.clamp(el.volume == null ? 1 : el.volume, 0, 1); v.muted = !!el.muted || !S.playing || (o && o.export);
    const active = t >= ((el.timing && el.timing.start) || 0) - 1e-6;
    if (o && o.export) { if (Math.abs(v.currentTime - want) > .001) v.currentTime = want; }
    else if (S.playing) { if (v.paused && active) v.play().catch(() => { }); if (Math.abs(v.currentTime - want) > .25) v.currentTime = want; }
    else { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - want) > .03) v.currentTime = want; }
    return v.readyState >= 2 ? v : (v.videoWidth ? v : null);
  };
  M.seekAll = async function (page, t) { // for export: wait for every video to land on frame
    const jobs = []; const walk = list => list.forEach(el => { if (el.type === 'video' && el.src) { const v = mediaEl(vids, el, 'video'); const want = target(el, t); if (Math.abs(v.currentTime - want) > .001 || v.readyState < 2) jobs.push(new Promise(res => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = want; setTimeout(res, 1500); })); } if (el.children) walk(el.children); }); walk(page.elements); await Promise.all(jobs);
  };
  function syncAudio(page, playing) {
    const walk = list => list.forEach(el => { if (el.type === 'audio' && el.src) { const a = mediaEl(auds, el, 'audio'); a.volume = U.clamp(el.volume == null ? 1 : el.volume, 0, 1); const st = (el.timing && el.timing.start) || 0; const en = el.timing && el.timing.end != null ? el.timing.end : page.duration; const want = S.time - st + (el.trim || 0); const inside = S.time >= st && S.time <= en; if (playing && inside) { if (a.paused) { a.currentTime = Math.max(0, want); a.play().catch(() => { }); } else if (Math.abs(a.currentTime - want) > .3) a.currentTime = Math.max(0, want); } else if (!a.paused) a.pause(); } if (el.children) walk(el.children); }); walk(page.elements);
  }
  M.stopAll = function () { vids.forEach(v => v.pause()); auds.forEach(a => a.pause()); };
  M.audioElements = () => [...auds.values()]; M.videoElements = () => [...vids.values()];

  /* ---------- keyframe data ---------- */
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  TL.setKey = function (el, prop, value, t = S.time) {
    el.anim = el.anim || {}; const ks = el.anim[prop] = el.anim[prop] || []; const k = ks.find(x => near(x.t, t)); if (k) k.v = value; else { ks.push({ t: U.round(t, 3), v: value, e: 'ease' }); ks.sort((a, b) => a.t - b.t); }
  };
  TL.getVal = function (el, prop) { const parts = prop.split('.'); if (parts.length > 1) return (el[parts[0]] || {})[parts[1]]; if (prop === 'scale') return 1; if (prop === 'fillColor') return el.fills && el.fills[0] && el.fills[0].color; return el[prop]; };
  TL.toggleKey = function (el, prop) {
    const ks = el.anim && el.anim[prop]; const i = ks ? ks.findIndex(k => near(k.t, S.time)) : -1;
    if (i >= 0) { ks.splice(i, 1); if (!ks.length) delete el.anim[prop]; } else { const cur = R.resolve(el, S.time); TL.setKey(el, prop, prop === 'scale' ? 1 : TL.getVal(cur, prop), S.time); }
    OC.history.commit('Keyframe'); R.invalidate();
  };
  TL.PRESETS = {
    Fade: (e, a, b, w) => ({ opacity: w === 'out' ? [[a, e.opacity], [b, 0]] : [[a, 0], [b, e.opacity]] }),
    Rise: (e, a, b, w) => ({ y: w === 'out' ? [[a, e.y], [b, e.y - 80]] : [[a, e.y + 80], [b, e.y]], opacity: w === 'out' ? [[a, e.opacity], [b, 0]] : [[a, 0], [b, e.opacity]] }),
    Drop: (e, a, b, w) => ({ y: w === 'out' ? [[a, e.y], [b, e.y + 80]] : [[a, e.y - 80], [b, e.y]], opacity: w === 'out' ? [[a, e.opacity], [b, 0]] : [[a, 0], [b, e.opacity]] }),
    'Slide left': (e, a, b, w) => ({ x: w === 'out' ? [[a, e.x], [b, e.x - 300]] : [[a, e.x + 300], [b, e.x]], opacity: w === 'out' ? [[a, e.opacity], [b, 0]] : [[a, 0], [b, e.opacity]] }),
    'Slide right': (e, a, b, w) => ({ x: w === 'out' ? [[a, e.x], [b, e.x + 300]] : [[a, e.x - 300], [b, e.x]], opacity: w === 'out' ? [[a, e.opacity], [b, 0]] : [[a, 0], [b, e.opacity]] }),
    Zoom: (e, a, b, w) => ({ scale: w === 'out' ? [[a, 1], [b, .2]] : [[a, .2], [b, 1]], opacity: w === 'out' ? [[a, e.opacity], [b, 0]] : [[a, 0], [b, e.opacity]] }),
    Pop: (e, a, b, w) => ({ scale: w === 'out' ? [[a, 1], [(a + b) / 2, 1.15], [b, 0]] : [[a, 0], [a + (b - a) * .6, 1.15], [b, 1]] }),
    Spin: (e, a, b, w) => ({ rot: w === 'out' ? [[a, e.rot], [b, e.rot + 180]] : [[a, e.rot - 180], [b, e.rot]], opacity: w === 'out' ? [[a, e.opacity], [b, 0]] : [[a, 0], [b, e.opacity]] }),
    Bounce: (e, a, b, w) => ({ y: [[a, e.y - 160], [a + (b - a) * .6, e.y], [a + (b - a) * .78, e.y - 34], [b, e.y]], opacity: [[a, 0], [a + (b - a) * .2, e.opacity]] }),
    Pulse: (e, a, b) => ({ scale: [[a, 1], [(a + b) / 2, 1.1], [b, 1]] }),
    Float: (e, a, b) => ({ y: [[a, e.y], [(a + b) / 2, e.y - 24], [b, e.y]] }),
    Wiggle: (e, a, b) => ({ rot: [[a, e.rot], [a + (b - a) * .25, e.rot + 6], [a + (b - a) * .5, e.rot - 6], [a + (b - a) * .75, e.rot + 6], [b, e.rot]] }),
    Blink: (e, a, b) => ({ opacity: [[a, e.opacity], [(a + b) / 2, .15], [b, e.opacity]] })
  };
  const EASE_OF = { Bounce: 'easeOut', Pop: 'back', Zoom: 'easeOut' };
  TL.applyPreset = function (el, name, o = {}) {
    const pg = D.find(el.id).page; const dur = o.dur || .8, where = o.where || 'in'; const start = (el.timing && el.timing.start) || 0, end = el.timing && el.timing.end != null ? el.timing.end : pg.duration;
    let a, b; if (where === 'in') { a = start; b = start + dur; } else if (where === 'out') { a = Math.max(start, end - dur); b = end; } else { a = start; b = Math.min(end, start + dur); }
    const base = { ...el, opacity: el.opacity == null ? 1 : el.opacity }; const spec = TL.PRESETS[name](base, a, b, where);
    for (const prop in spec) { const pts = spec[prop].map(([t, v]) => ({ t: U.round(t, 3), v, e: EASE_OF[name] || (where === 'out' ? 'easeIn' : 'easeOut') })); const old = (el.anim && el.anim[prop]) || []; el.anim = el.anim || {}; const keep = old.filter(k => k.t < a - 1e-3 || k.t > b + 1e-3); el.anim[prop] = keep.concat(pts).sort((x, y) => x.t - y.t); }
    if (o.loop || where === 'loop') { const reps = Math.floor((end - start) / dur); for (const prop in spec) { const arr = []; for (let r = 0; r < reps; r++) spec[prop].forEach(([t, v]) => arr.push({ t: U.round(t + r * dur, 3), v, e: 'easeInOut' })); el.anim[prop] = arr; } }
    R.invalidate();
  };

  /* ---------- playback ---------- */
  let raf = 0, last = 0, gt = 0;
  TL.loop = true; TL.snap = true; TL.allPages = true;
  const multi = () => S.project && S.project.pages.length > 1 && TL.allPages;
  const segOf = i => R.projectLayout(S.project).segs[i];
  function overlay() {
    if (ui.ov && ui.ov.isConnected) return ui.ov; const E = OC.editor; if (!E.stage) return null;
    ui.ov = h('canvas.tl-ov'); E.stage.append(ui.ov); return ui.ov;
  }
  function hideOverlay() { if (ui.ov) { ui.ov.remove(); ui.ov = null; } }
  function drawFrame(info) { // paint the transition overlay when two pages are mixing
    const E = OC.editor; const pg = OC.page();
    if (!info.blend) { hideOverlay(); return; }
    const c = overlay(); if (!c) return; const dpr = Math.min(2, window.devicePixelRatio || 1); const k = S.zoom * dpr;
    const sp = E.pgToScreen(pg, 0, 0); const w = Math.round(pg.w * k), hh = Math.round(pg.h * k);
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    c.style.cssText = `left:${sp.x}px;top:${sp.y}px;width:${pg.w * S.zoom}px;height:${pg.h * S.zoom}px`;
    R.drawProjectFrame(c.getContext('2d'), S.project, info.gt, k, w, hh);
  }
  TL.play = function () {
    if (S.playing) return; const pg = OC.page(); const L = R.projectLayout(S.project);
    if (multi()) { const s = L.segs[S.pageIdx]; gt = s.start + S.time; if (gt >= L.total - .01) gt = 0; } else if (S.time >= pg.duration - .01) S.time = 0;
    if (multi() && gt === 0 && S.pageIdx !== 0) { OC.setPageIdx(0); OC.editor.focusPage(0); build(); }
    S.playing = true; last = performance.now(); loop(); syncUi();
  };
  TL.pause = function () { S.playing = false; cancelAnimationFrame(raf); M.stopAll(); hideOverlay(); R.invalidate(); syncUi(); };
  TL.toggle = function () { if (!S.project.video && !S.timelineOpen && !selVideo()) { UI.toggleTimeline(true); } S.playing ? TL.pause() : TL.play(); };
  TL.seek = function (t) { const pg = OC.page(); S.time = U.clamp(t, 0, pg.duration); if (S.playing) syncAudio(pg, true); R.invalidate(); drawHead(); };
  function loop() {
    raf = requestAnimationFrame(() => {
      if (!S.playing) return; const now = performance.now(); const dt = Math.min(.1, (now - last) / 1000); last = now; const pg = OC.page();
      if (multi()) {
        const L = R.projectLayout(S.project); gt += dt;
        if (gt >= L.total) { if (TL.loop) gt = 0; else { gt = L.total; S.time = pg.duration; TL.pause(); drawHead(); return; } }
        const seg = L.segs.find(s => gt >= s.start && gt < s.end) || L.segs[L.segs.length - 1]; const nx = L.segs[seg.i + 1]; const blend = !!(nx && nx.td && gt >= nx.start);
        const show = blend ? (gt - nx.start > nx.td / 2 ? nx.i : seg.i) : seg.i;
        if (show !== S.pageIdx) { S.pageIdx = show; OC.bus.emit('page-changed'); OC.editor.focusPage(show); build(); }
        S.time = Math.max(0, gt - L.segs[S.pageIdx].start); drawFrame({ blend, gt });
      } else {
        S.time += dt; if (S.time >= pg.duration) { if (TL.loop) S.time = 0; else { S.time = pg.duration; TL.pause(); drawHead(); return; } }
      }
      syncAudio(OC.page(), true); R.invalidate(); drawHead(); loop();
    });
  }
  const selVideo = () => OC.sel.els().some(e => e.type === 'video' || e.type === 'audio');
  /* clips that start later than the playhead */
  TL.split = function (el, t) {
    t = t == null ? S.time : t; const f = D.find(el.id); if (!f) return; const pg = f.page; const st = (el.timing && el.timing.start) || 0, en = el.timing && el.timing.end != null ? el.timing.end : pg.duration;
    if (t <= st + .05 || t >= en - .05) { U.toast('Move the playhead inside the clip'); return; }
    const b = U.clone(el); OC.relabel([b]); b.name = (el.name || el.type) + ' 2'; b.timing = { start: U.round(t, 2), end: el.timing && el.timing.end != null ? el.timing.end : null };
    if (el.type === 'video' || el.type === 'audio') b.trim = (el.trim || 0) + (t - st) * (el.speed || 1);
    el.timing = { start: st, end: U.round(t, 2) }; f.list.splice(f.list.indexOf(el) + 1, 0, b); D.reindex(); OC.sel.set([b.id]); OC.history.commit('Split clip'); build();
  };

  /* ---------- keyboard ---------- */
  const selKeys = new Map(); // key object -> { el, prop }
  const nodes = new Map();   // key object -> element
  const isTyping = e => { const t = e.target; return t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable); };
  function deleteKeys() {
    if (!selKeys.size) return false; selKeys.forEach(({ el, prop }, k) => { const ks = el.anim && el.anim[prop]; if (!ks) return; const i = ks.indexOf(k); if (i >= 0) ks.splice(i, 1); if (!ks.length) delete el.anim[prop]; });
    const n = selKeys.size; selKeys.clear(); OC.history.commit(n > 1 ? 'Delete keyframes' : 'Delete keyframe'); R.invalidate(); build(); return true;
  }
  OC.cmd.pre.push((e, cb) => {
    if (!S.project || !OC.ui.isCanvas()) return false;
    if ((cb === 'backspace' || cb === 'delete') && selKeys.size && !isTyping(e)) return deleteKeys();
    if (cb === 'escape' && selKeys.size) { selKeys.clear(); refreshSel(); return true; }
    if ((cb === 'arrowleft' || cb === 'arrowright' || cb === 'shift+arrowleft' || cb === 'shift+arrowright') && selKeys.size) {
      const d = (cb.endsWith('left') ? -1 : 1) * (e.shiftKey ? .1 : 1 / 30); const dur = OC.page().duration; selKeys.forEach(({ el, prop }, k) => { k.t = U.round(U.clamp(k.t + d, 0, dur), 3); }); selKeys.forEach(({ el, prop }) => el.anim[prop].sort((a, b) => a.t - b.t)); OC.history.commit('Nudge keyframes'); R.invalidate(); build(); return true;
    }
    if (cb === 'space' && (S.timelineOpen || S.project.video || selVideo())) { TL.toggle(); return true; }
    if (cb === 's' && S.timelineOpen) { const one = OC.sel.one(); if (one) { TL.split(one); return true; } }
    if (S.timelineOpen && !S.playing && (cb === 'home' || cb === 'end')) { TL.seek(cb === 'home' ? 0 : OC.page().duration); return true; }
    return false;
  });

  /* ---------- UI ---------- */
  let host = null, ui = {}, pps = 90, labelW = OC.ls.get('tlLabelW', 200); // pixels per second
  const PROPS = { x: 'Position X', y: 'Position Y', w: 'Width', h: 'Height', rot: 'Rotation', opacity: 'Opacity', scale: 'Scale', fillColor: 'Fill color', 'stroke.width': 'Stroke', blur: 'Blur' };
  function syncUi() { if (!ui.play) return; ui.play.innerHTML = OC.icon(S.playing ? 'pause' : 'play', 15); }
  TL.mount = function (el) { host = el; build(); };
  ['selection', 'history', 'page-changed'].forEach(ev => OC.bus.on(ev, U.debounce(() => { if (host && !S.playing) build(); }, 40)));
  TL.unmount = function () { if (S.playing) TL.pause(); selKeys.clear(); if (host) host.textContent = ''; host = null; };
  const fmt = t => { const m = Math.floor(t / 60), s = (t % 60); return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0'); };
  function rows(pg) {
    const out = []; const pick = OC.sel.els(); const list = pick.length ? pick : pg.elements.slice().reverse().slice(0, 40);
    list.forEach(el => { out.push({ el, prop: null }); const props = el.anim ? Object.keys(el.anim).filter(k => el.anim[k] && el.anim[k].length) : []; props.forEach(p => out.push({ el, prop: p })); });
    return out;
  }
  const iconFor = e => ({ text: 'type', image: 'image', video: 'video', audio: 'music', group: 'group', frame: 'frame', path: 'pen-tool', scene3d: 'cuboid', ellipse: 'circle', rect: 'square' }[e.type] || 'shapes');
  /* easing curve as an svg path, y runs from 0 (start value) to 1 (end value) */
  const curveD = (name, w, hh, pad = 2) => { let d = ''; for (let i = 0; i <= 40; i++) { const x = i / 40, y = R.ease(name, x); d += (i ? 'L' : 'M') + (pad + x * (w - pad * 2)).toFixed(1) + ' ' + (hh - pad - y * (hh - pad * 2)).toFixed(1); } return d; };
  const curveSvg = (name, w = 28, hh = 20, cls = '') => `<svg class="${cls}" viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}"><path d="${curveD(name, w, hh)}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  TL.curveSvg = curveSvg;

  function snapT(t, ignore) {
    if (!TL.snap) return t; const pg = OC.page(); const th = 7 / pps; const c = [0, pg.duration, S.time]; pg.elements.forEach(e => { if (ignore === e) return; if (e.timing) { c.push(e.timing.start || 0); if (e.timing.end != null) c.push(e.timing.end); } });
    let best = t, bd = th; c.forEach(x => { const d = Math.abs(x - t); if (d < bd) { bd = d; best = x; } }); return best;
  }
  function refreshSel() { nodes.forEach((n, k) => n.classList.toggle('on', selKeys.has(k))); }
  function setSel(ks, add) { if (!add) selKeys.clear(); ks.forEach(([k, el, prop]) => selKeys.set(k, { el, prop })); refreshSel(); }

  function build() {
    if (!host || !S.project) return; const pg = OC.page(); const oldScroll = ui.track ? [ui.track.scrollLeft, ui.track.scrollTop] : [0, 0]; host.textContent = ''; nodes.clear();
    [...selKeys.keys()].forEach(k => { const o = selKeys.get(k); if (!o.el.anim || !(o.el.anim[o.prop] || []).includes(k)) selKeys.delete(k); });
    ui = { ov: ui.ov }; const dur = pg.duration; const width = Math.max(600, dur * pps + 120); const rs = rows(pg); const proj = S.project; const L = R.projectLayout(proj);
    ui.play = h('button.icon-btn.play', { onclick: () => TL.toggle(), html: OC.icon(S.playing ? 'pause' : 'play', 15), title: T('Play or pause') + '  Space' });
    ui.time = h('span.tl-time', fmt(S.time));
    const one = OC.sel.one();
    const head = h('div.tl-head',
      ui.play, UI.iconBtn('skip-back', 'Back to start', () => { if (multi()) { OC.setPageIdx(0); OC.editor.focusPage(0); } TL.seek(0); build(); }), ui.time, h('span.muted.small', '/ ' + fmt(dur)), proj.pages.length > 1 ? h('span.muted.small.tl-tot', T('Total') + ' ' + fmt(L.total)) : '',
      h('span.tl-sep'), UI.iconBtn('scissors', 'Split at playhead  S', () => { if (one) TL.split(one); else U.toast('Select a clip first'); }, false, { cls: one ? '' : 'dim' }),
      h('button.tl-tg' + (TL.snap ? '.on' : ''), { title: T('Snap to edges and playhead'), onclick: ev => { TL.snap = !TL.snap; ev.currentTarget.classList.toggle('on', TL.snap); }, html: OC.icon('magnet', 14) + '<span>' + T('Snap') + '</span>' }),
      h('button.tl-tg' + (TL.loop ? '.on' : ''), { title: T('Loop'), onclick: ev => { TL.loop = !TL.loop; ev.currentTarget.classList.toggle('on', TL.loop); }, html: OC.icon('repeat', 14) + '<span>' + T('Loop') + '</span>' }),
      h('button.tl-tg' + (S.autoKey ? '.on' : ''), { title: T('Auto key'), onclick: ev => { S.autoKey = !S.autoKey; ev.currentTarget.classList.toggle('on', S.autoKey); }, html: OC.icon('circle-dot', 14) + '<span>' + T('Auto key') + '</span>' }),
      proj.pages.length > 1 ? h('button.tl-tg' + (TL.allPages ? '.on' : ''), { title: T('Play through every page'), onclick: ev => { TL.allPages = !TL.allPages; ev.currentTarget.classList.toggle('on', TL.allPages); }, html: OC.icon('layers', 14) + '<span>' + T('All pages') + '</span>' }) : '',
      h('span.grow'), UI.num(dur, v => { pg.duration = Math.max(.5, v); OC.history.commit('Duration'); build(); }, { unit: 's', w: 104, step: .5, dec: 1, min: .5, label: 'Length' }),
      UI.iconBtn('zoom-out', 'Zoom out', () => { pps = Math.max(24, pps / 1.3); build(); }), UI.iconBtn('maximize-2', 'Fit to width', () => { const w = (ui.track ? ui.track.clientWidth : 700) - 100; pps = U.clamp(w / dur, 24, 400); build(); }), UI.iconBtn('zoom-in', 'Zoom in', () => { pps = Math.min(400, pps * 1.3); build(); }), UI.iconBtn('x', 'Close', () => UI.toggleTimeline(false)));
    /* strip with every page, transitions between them */
    const strip = h('div.tl-pages'); proj.pages.forEach((p, j) => {
      if (j) { const tr = p.transition && p.transition !== 'none'; strip.append(h('button.tl-trans' + (tr ? '.on' : ''), { title: T('Transition') + ': ' + T((R.TRANSITIONS.find(x => x[0] === (p.transition || 'none')) || [0, 'None'])[1]), onclick: ev => transPop(ev.currentTarget, p), html: OC.icon(tr ? 'arrow-right-left' : 'plus', 12) })); }
      const blk = h('div.tl-page' + (j === S.pageIdx ? '.on' : ''), { style: `width:${Math.max(96, p.duration * 20)}px`, onclick: () => { OC.setPageIdx(j); OC.editor.focusPage(j); build(); } }, h('b', p.title || (T('Page') + ' ' + (j + 1))), h('span', p.duration.toFixed(1) + 's'), h('i.edge', { title: T('Drag to change length') }));
      blk.querySelector('.edge').addEventListener('pointerdown', ev => { ev.stopPropagation(); const x0 = ev.clientX, d0 = p.duration; const edge = ev.currentTarget; edge.setPointerCapture(ev.pointerId); edge.onpointermove = e2 => { p.duration = Math.max(.5, Math.round((d0 + (e2.clientX - x0) / 20) * 10) / 10); blk.style.width = Math.max(96, p.duration * 20) + 'px'; blk.querySelector('span').textContent = p.duration.toFixed(1) + 's'; }; edge.onpointerup = () => { edge.onpointermove = null; OC.history.commit('Page length'); build(); }; });
      strip.append(blk);
    });
    strip.append(h('button.tl-addpage', { title: T('Add page'), onclick: () => { OC.ops.addPage(S.pageIdx); build(); }, html: OC.icon('plus', 13) }));
    const labels = h('div.tl-labels', { style: `width:${labelW}px` }), track = h('div.tl-scroll', { onscroll: () => { labels.scrollTop = track.scrollTop; } }), tracks = h('div.tl-tracks', { style: `width:${width}px` });
    track.addEventListener('wheel', ev => { if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); const r = tracks.getBoundingClientRect(); const tm = (ev.clientX - r.left) / pps; pps = U.clamp(pps * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), 24, 400); build(); ui.track.scrollLeft = tm * pps - (ev.clientX - ui.track.getBoundingClientRect().left); } }, { passive: false });
    const ruler = h('div.tl-ruler'); const step = pps > 200 ? .25 : pps > 90 ? .5 : pps > 50 ? 1 : 2; for (let t = 0; t <= dur + .001; t += step) ruler.append(h('div.tick' + (Math.abs(t % 1) < .001 ? '.major' : ''), { style: `left:${t * pps}px` }, Math.abs(t % 1) < .001 ? h('span', Math.round(t) + 's') : ''));
    ruler.addEventListener('pointerdown', ev => { const mv = e2 => { const r = tracks.getBoundingClientRect(); TL.seek((e2.clientX - r.left) / pps); }; mv(ev); ruler.setPointerCapture(ev.pointerId); ruler.onpointermove = mv; ruler.onpointerup = () => { ruler.onpointermove = null; }; });
    tracks.append(ruler); labels.append(h('div.tl-lab.ruler-lab', T('Layers')));
    const laneEls = [];
    rs.forEach(r => {
      const el = r.el; const isHead = !r.prop; const media = el.type === 'video' || el.type === 'audio';
      labels.append(h('div.tl-lab' + (isHead ? '.el' : '.prop') + (OC.sel.has(el.id) ? '.sel' : ''), { onclick: () => OC.sel.set([el.id]) }, isHead ? [h('span.ico', { html: OC.icon(iconFor(el), 13) }), h('span.nm', el.name || el.type), h('span.grow'),
        media ? h('button.lb' + (el.muted ? '.on' : ''), { title: T(el.muted ? 'Unmute' : 'Mute'), onclick: ev => { ev.stopPropagation(); el.muted = !el.muted; OC.history.commit('Mute'); build(); }, html: OC.icon(el.muted ? 'volume-x' : 'volume-2', 13) }) : '',
        UI.iconBtn('plus', 'Add keyframe', ev => { ev.stopPropagation(); addKeyMenu(ev.currentTarget, el); })] : [h('span.nm', T(PROPS[r.prop] || r.prop)), h('span.grow'), h('button.kf' + (((el.anim[r.prop] || []).some(k => near(k.t, S.time))) ? '.on' : ''), { title: T('Add or remove a keyframe here'), onclick: ev => { ev.stopPropagation(); TL.toggleKey(el, r.prop); build(); }, html: '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M5 0L10 5L5 10L0 5Z" fill="currentColor"/></svg>' })]));
      const lane = h('div.tl-lane' + (isHead ? '.el' : '.prop')); laneEls.push(lane);
      if (isHead) {
        const s = (el.timing && el.timing.start) || 0, e = el.timing && el.timing.end != null ? el.timing.end : dur;
        const bar = h('div.tl-bar' + (OC.sel.has(el.id) ? '.sel' : '') + (el.type === 'video' ? '.vid' : '') + (el.type === 'audio' ? '.aud' : ''), { style: `left:${s * pps}px;width:${Math.max(8, (e - s) * pps)}px`, title: T('Drag to move, edges to trim') }, h('i.hl'), h('span', el.name || el.type), h('i.hr'));
        if (el.type === 'video') filmstrip(el, bar);
        bar.addEventListener('pointerdown', ev => {
          ev.stopPropagation(); OC.sel.set([el.id]); const side = ev.target.classList.contains('hl') ? 'l' : ev.target.classList.contains('hr') ? 'r' : 'm'; const x0 = ev.clientX, s0 = s, e0 = e; bar.setPointerCapture(ev.pointerId);
          bar.onpointermove = e2 => { const raw = (e2.clientX - x0) / pps; el.timing = el.timing || { start: 0, end: null };
            if (side === 'm') { let ns = snapT(s0 + raw, el); const ne = snapT(e0 + raw, el); if (Math.abs(ne - (e0 + raw)) < Math.abs(ns - (s0 + raw)) && ne !== e0 + raw) ns = ne - (e0 - s0); const d2 = U.clamp(ns - s0, -s0, dur - e0); el.timing.start = U.round(s0 + d2, 2); el.timing.end = U.round(e0 + d2, 2); }
            else if (side === 'l') { const ns = U.clamp(snapT(s0 + raw, el), 0, e0 - .1); if (el.type === 'video' || el.type === 'audio') { el.trim = Math.max(0, (el._trim0 == null ? (el._trim0 = el.trim || 0) : el._trim0) + (ns - s0) * (el.speed || 1)); } el.timing.start = U.round(ns, 2); }
            else el.timing.end = U.round(U.clamp(snapT(e0 + raw, el), s0 + .1, dur), 2);
            bar.style.left = el.timing.start * pps + 'px'; bar.style.width = Math.max(8, ((el.timing.end == null ? dur : el.timing.end) - el.timing.start) * pps) + 'px'; R.invalidate(); };
          bar.onpointerup = () => { bar.onpointermove = null; delete el._trim0; OC.history.commit('Timing'); build(); };
        });
        lane.append(bar);
        const byT = new Map(); Object.entries(el.anim || {}).forEach(([prop, ks]) => ks.forEach(k => { const key = k.t.toFixed(3); if (!byT.has(key)) byT.set(key, []); byT.get(key).push([k, el, prop]); }));
        byT.forEach((list, key) => { const t = +key; const d = h('i.mini-kf', { style: `left:${t * pps}px` }); d.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (!ev.shiftKey && !list.every(([k]) => selKeys.has(k))) setSel(list, false); else if (ev.shiftKey) setSel(list, true); startKeyDrag(ev, d, dur); }); lane.append(d); list.forEach(([k]) => { nodes.set(k, d); }); });
      } else {
        const ks = el.anim[r.prop] || [];
        ks.forEach((k, i) => { if (i < ks.length - 1) { const nx = ks[i + 1]; lane.append(h('div.kf-seg', { style: `left:${k.t * pps}px;width:${Math.max(2, (nx.t - k.t) * pps)}px`, title: T('Easing') + ': ' + (k.e || 'linear'), onclick: () => { }, ondblclick: ev => { ev.stopPropagation(); easePop(ev.currentTarget, k, el, nx); }, html: (nx.t - k.t) * pps > 26 ? curveSvg(k.e || 'linear', Math.max(20, (nx.t - k.t) * pps - 10), 16, 'kf-curve') : '' })); } });
        ks.forEach((k, i) => {
          const d = h('button.kfd', { style: `left:${k.t * pps}px`, title: fmt(k.t) + '  ' + T('Double click for easing graph'), html: '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M6 0L12 6L6 12L0 6Z" fill="currentColor"/></svg>' }); nodes.set(k, d);
          d.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (ev.shiftKey) { selKeys.has(k) ? selKeys.delete(k) : selKeys.set(k, { el, prop: r.prop }); refreshSel(); } else if (!selKeys.has(k)) setSel([[k, el, r.prop]], false); startKeyDrag(ev, d, dur, () => easePop(d, k, el, ks[ks.indexOf(k) + 1])); });
          lane.append(d);
        });
        refreshSel();
      }
      tracks.append(lane);
    });
    /* background of every lane: click to seek, drag to box select keyframes */
    tracks.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.tl-bar,.kfd,.mini-kf,.tl-ruler,.kf-seg')) return; const tr = tracks.getBoundingClientRect(); const x0 = ev.clientX, y0 = ev.clientY; const base = ev.shiftKey ? new Map(selKeys) : new Map(); let box = null, moved = false;
      tracks.setPointerCapture(ev.pointerId);
      tracks.onpointermove = e2 => {
        if (!moved && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 4) return; moved = true; if (!box) { box = h('div.tl-box'); tracks.append(box); }
        const l = Math.min(x0, e2.clientX), t2 = Math.min(y0, e2.clientY), r2 = Math.max(x0, e2.clientX), b2 = Math.max(y0, e2.clientY); box.style.cssText = `left:${l - tr.left}px;top:${t2 - tr.top}px;width:${r2 - l}px;height:${b2 - t2}px`;
        selKeys.clear(); base.forEach((v, k) => selKeys.set(k, v)); const seen = new Set();
        rs.forEach((r, i) => { const el = r.el; if (!r.prop) { /* element row: pick every key at the same time */ const ln = laneEls[i].getBoundingClientRect(); if (ln.bottom < t2 || ln.top > b2) return; Object.entries(el.anim || {}).forEach(([prop, ks]) => ks.forEach(k => { const x = tr.left + k.t * pps; if (x >= l - 4 && x <= r2 + 4) selKeys.set(k, { el, prop }); })); return; }
          const ln = laneEls[i].getBoundingClientRect(); if (ln.bottom < t2 || ln.top > b2) return; (el.anim[r.prop] || []).forEach(k => { const x = tr.left + k.t * pps; if (x >= l - 4 && x <= r2 + 4) selKeys.set(k, { el, prop: r.prop }); }); });
        refreshSel();
      };
      tracks.onpointerup = () => { tracks.onpointermove = null; tracks.onpointerup = null; if (box) box.remove(); if (!moved) { if (!ev.shiftKey) { selKeys.clear(); refreshSel(); } TL.seek((ev.clientX - tr.left) / pps); } };
    });
    function startKeyDrag(ev, node, dur2, onDouble) {
      const x0 = ev.clientX; const moving = [...selKeys.entries()].map(([k, v]) => ({ k, v, t0: k.t })); let moved = false; node.setPointerCapture(ev.pointerId);
      node.onpointermove = e2 => {
        if (!moved && Math.abs(e2.clientX - x0) < 3) return; moved = true; let d = (e2.clientX - x0) / pps; const lead = moving[0]; d = snapT(lead.t0 + d) - lead.t0; const minT = Math.min(...moving.map(m => m.t0)), maxT = Math.max(...moving.map(m => m.t0)); d = U.clamp(d, -minT, dur2 - maxT);
        moving.forEach(m => { m.k.t = U.round(m.t0 + d, 3); const n = nodes.get(m.k); if (n) n.style.left = m.k.t * pps + 'px'; }); TL.seek(lead.k.t);
      };
      node.onpointerup = ev2 => { node.onpointermove = null; node.onpointerup = null; if (moved) { moving.forEach(m => m.v.el.anim[m.v.prop].sort((a, b) => a.t - b.t)); OC.history.commit('Move keyframes'); build(); return; }
        const now = performance.now(); if (node._lastClick && now - node._lastClick < 380 && onDouble) { node._lastClick = 0; onDouble(); } else { node._lastClick = now; const k0 = moving[0] && moving[0].k; if (k0 && selKeys.size === 1) TL.seek(k0.t); } };
    }
    ui.head = h('div.tl-playhead', { style: `left:${S.time * pps}px` }, h('i')); tracks.append(ui.head);
    if (!rs.length) tracks.append(h('div.tl-empty', T('Select an element to animate it')));
    track.append(tracks); const body = h('div.tl-body', labels, h('i.tl-lres', { title: T('Drag to resize') }), track);
    host.append(h('i.tl-res', { title: T('Drag to resize') }), head, strip, body); ui.tracks = tracks; ui.track = track;
    ui.track.scrollLeft = oldScroll[0]; ui.track.scrollTop = oldScroll[1];
    host.querySelector('.tl-res').addEventListener('pointerdown', ev => { const y0 = ev.clientY, h0 = host.offsetHeight; const el = ev.currentTarget; el.setPointerCapture(ev.pointerId); host.style.transition = 'none'; el.onpointermove = e2 => { const nh = U.clamp(h0 - (e2.clientY - y0), 150, innerHeight * .75); host.style.height = nh + 'px'; OC.ls.set('tlH', Math.round(nh)); OC.render.invalidate(); }; el.onpointerup = () => { el.onpointermove = null; host.style.transition = ''; }; });
    host.querySelector('.tl-lres').addEventListener('pointerdown', ev => { const x0 = ev.clientX, w0 = labelW; const el = ev.currentTarget; el.setPointerCapture(ev.pointerId); el.onpointermove = e2 => { labelW = U.clamp(w0 + e2.clientX - x0, 110, 420); labels.style.width = labelW + 'px'; OC.ls.set('tlLabelW', labelW); }; el.onpointerup = () => { el.onpointermove = null; }; });
  }
  function drawHead() { if (!ui.head) return; ui.head.style.left = S.time * pps + 'px'; if (ui.time) ui.time.textContent = fmt(S.time); if (S.playing && ui.track) { const x = S.time * pps; if (x > ui.track.scrollLeft + ui.track.clientWidth - 40 || x < ui.track.scrollLeft) ui.track.scrollLeft = Math.max(0, x - 60); } }
  /* a handful of frames across a video clip */
  const strips = new Map();
  function filmstrip(el, bar) {
    const key = el.id + '|' + (el.trim || 0) + '|' + el.src; const draw = urls => { const w = bar.offsetWidth || 1; bar.style.backgroundImage = urls.map(u => `url(${u})`).join(','); bar.style.backgroundSize = `${100 / urls.length}% 100%`; bar.style.backgroundPosition = urls.map((_, i) => `${urls.length > 1 ? i / (urls.length - 1) * 100 : 0}% 0`).join(','); bar.style.backgroundRepeat = 'no-repeat'; bar.classList.add('thumbs'); };
    if (strips.has(key)) { const v = strips.get(key); if (Array.isArray(v)) draw(v); return; } strips.set(key, null);
    (async () => { try { const v = document.createElement('video'); v.muted = true; v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.src = OC.assets.url(el.src); await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 4000); }); const n = 6, urls = []; const len = Math.max(.1, (v.duration || 1) - (el.trim || 0)); for (let i = 0; i < n; i++) { v.currentTime = (el.trim || 0) + len * (i + .5) / n; await new Promise(r => { v.onseeked = r; setTimeout(r, 800); }); const c = document.createElement('canvas'); c.width = 64; c.height = 40; c.getContext('2d').drawImage(v, 0, 0, 64, 40); urls.push(c.toDataURL('image/jpeg', .6)); } strips.set(key, urls); if (bar.isConnected) draw(urls); } catch (e) { } })();
  }
  function transPop(anchor, p) {
    const dur = p.transitionDur == null ? .6 : p.transitionDur;
    UI.popover(anchor, h('div.trans-pop', h('div.cp-t', T('Transition in')), h('div.trans-grid', R.TRANSITIONS.map(([k, l]) => h('button' + ((p.transition || 'none') === k ? '.on' : ''), { onclick: ev => { p.transition = k; OC.history.commit('Transition'); UI.closeMenus(); build(); } }, h('i', { class: 'tp tp-' + k }), h('span', T(l))))), h('div.row', h('span.lbl', T('Length')), UI.num(dur, v => { p.transitionDur = Math.max(.1, v); OC.history.commit('Transition length'); build(); }, { unit: 's', w: 80, step: .1, dec: 1, min: .1, max: 3 }))), { cls: 'pop-trans' });
  }
  function addKeyMenu(btn, el) {
    UI.menu(Object.keys(PROPS).map(p => ({ label: PROPS[p], onclick: () => { if (!(el.anim && el.anim[p] && el.anim[p].some(k => near(k.t, S.time)))) { const cur = R.resolve(el, S.time); TL.setKey(el, p, p === 'scale' ? 1 : TL.getVal(cur, p)); OC.history.commit('Keyframe'); } build(); } })), btn.getBoundingClientRect().left, btn.getBoundingClientRect().bottom);
  }
  /* easing graph: pick a preset or drag the two bezier handles */
  function easePop(anchor, k, el, nx) {
    if (!anchor || !k) return; const names = R.EASINGS; const cur = () => k.e || 'ease';
    let bz = String(cur()).startsWith('bezier(') ? cur().slice(7, -1).split(',').map(Number) : [.25, .1, .25, 1]; const SZ = 196, P = 18;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${SZ} ${SZ}`); svg.setAttribute('width', SZ); svg.setAttribute('height', SZ); svg.classList.add('eg');
    const X = v => P + v * (SZ - P * 2), Y = v => SZ - P - v * (SZ - P * 2);
    const redraw = () => {
      const isB = String(cur()).startsWith('bezier('); let d = ''; for (let i = 0; i <= 60; i++) { const x = i / 60; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(R.ease(cur(), x)).toFixed(1); }
      svg.innerHTML = `<rect x="${P}" y="${P}" width="${SZ - P * 2}" height="${SZ - P * 2}" class="eg-box"/><path d="M${X(0)} ${Y(0)}L${X(1)} ${Y(1)}" class="eg-diag"/>` + (isB ? `<path d="M${X(0)} ${Y(0)}L${X(bz[0])} ${Y(bz[1])}M${X(1)} ${Y(1)}L${X(bz[2])} ${Y(bz[3])}" class="eg-h"/>` : '') + `<path d="${d}" class="eg-curve"/>` + (isB ? `<circle data-i="0" cx="${X(bz[0])}" cy="${Y(bz[1])}" r="6" class="eg-pt"/><circle data-i="1" cx="${X(bz[2])}" cy="${Y(bz[3])}" r="6" class="eg-pt"/>` : '') + `<circle cx="${X(0)}" cy="${Y(0)}" r="3.5" class="eg-end"/><circle cx="${X(1)}" cy="${Y(1)}" r="3.5" class="eg-end"/>`;
      chips.forEach(([n, b]) => b.classList.toggle('on', cur() === n)); label.textContent = isB ? 'bezier(' + bz.map(v => +v.toFixed(2)).join(', ') + ')' : T(cur());
    };
    const chips = names.map(n => [n, h('button.eg-chip', { title: n, onclick: () => { k.e = n; OC.history.commit('Easing'); R.invalidate(); redraw(); build(); }, html: curveSvg(n, 34, 22) + '<span>' + n + '</span>' })]);
    const label = h('b.eg-label');
    svg.addEventListener('pointerdown', ev => {
      const c = ev.target.closest('circle[data-i]'); if (!c) { if (!String(cur()).startsWith('bezier(')) { k.e = `bezier(${bz.join(',')})`; redraw(); } return; }
      const i = +c.dataset.i; svg.setPointerCapture(ev.pointerId);
      svg.onpointermove = e2 => { const r = svg.getBoundingClientRect(); const sx = SZ / r.width; const vx = U.clamp(((e2.clientX - r.left) * sx - P) / (SZ - P * 2), 0, 1), vy = U.clamp(1 - ((e2.clientY - r.top) * sx - P) / (SZ - P * 2), -1, 2); bz[i * 2] = U.round(vx, 2); bz[i * 2 + 1] = U.round(vy, 2); k.e = `bezier(${bz.join(',')})`; redraw(); R.invalidate(); };
      svg.onpointerup = () => { svg.onpointermove = null; OC.history.commit('Easing'); build(); };
    });
    const body = h('div.ease-pop', h('div.eg-head', label, h('span.muted.small', fmt(k.t) + (nx ? ' to ' + fmt(nx.t) : ''))), svg, h('div.eg-chips', chips.map(c => c[1])), h('div.row', UI.btn('Custom curve', () => { k.e = `bezier(${bz.join(',')})`; OC.history.commit('Easing'); R.invalidate(); redraw(); build(); }, { cls: 'sm' }), UI.btn('Delete key', () => { const prop = Object.keys(el.anim).find(p => el.anim[p].includes(k)); const ks = el.anim[prop]; ks.splice(ks.indexOf(k), 1); if (!ks.length) delete el.anim[prop]; selKeys.delete(k); OC.history.commit('Delete keyframe'); UI.closeMenus(); build(); }, { cls: 'sm', icon: 'trash-2' })));
    redraw(); UI.popover(anchor, body, { cls: 'pop-ease' });
  }
})();
