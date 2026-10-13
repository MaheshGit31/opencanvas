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
  let raf = 0, last = 0;
  TL.play = function () { if (S.playing) return; const pg = OC.page(); if (S.time >= pg.duration - .01) S.time = 0; S.playing = true; last = performance.now(); loop(); syncUi(); };
  TL.pause = function () { S.playing = false; cancelAnimationFrame(raf); M.stopAll(); R.invalidate(); syncUi(); };
  TL.toggle = function () { if (!S.timelineOpen) UI.toggleTimeline(true); S.playing ? TL.pause() : TL.play(); };
  TL.seek = function (t) { const pg = OC.page(); S.time = U.clamp(t, 0, pg.duration); if (S.playing) syncAudio(pg, true); R.invalidate(); drawHead(); };
  function loop() {
    raf = requestAnimationFrame(() => {
      if (!S.playing) return; const now = performance.now(); const dt = (now - last) / 1000; last = now; const pg = OC.page(); S.time += dt;
      if (S.time >= pg.duration) { if (S.project.cat === 'videos' && S.pageIdx < S.project.pages.length - 1) { S.pageIdx++; S.time = 0; OC.bus.emit('page-changed'); } else if (TL.loop) S.time = 0; else { S.time = pg.duration; TL.pause(); R.invalidate(); drawHead(); return; } }
      syncAudio(pg, true); R.invalidate(); drawHead(); loop();
    });
  }
  TL.loop = true;

  /* ---------- UI ---------- */
  let host = null, ui = {}, selKey = null, pps = 90; // pixels per second
  const LABEL_W = 220;
  const PROPS = { x: 'Position X', y: 'Position Y', w: 'Width', h: 'Height', rot: 'Rotation', opacity: 'Opacity', scale: 'Scale', fillColor: 'Fill color', 'stroke.width': 'Stroke', blur: 'Blur' };
  function syncUi() { if (!ui.play) return; ui.play.innerHTML = OC.icon(S.playing ? 'pause' : 'play', 16); }
  TL.mount = function (el) {
    host = el; build();
  };
  ['selection', 'history', 'page-changed'].forEach(ev => OC.bus.on(ev, U.debounce(() => { if (host && !S.playing) build(); }, 40)));
  TL.unmount = function () { if (S.playing) TL.pause(); if (host) host.textContent = ''; host = null; };
  const fmt = t => { const m = Math.floor(t / 60), s = (t % 60); return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0'); };
  function rows(pg) {
    const out = []; const pick = OC.sel.els(); const list = pick.length ? pick : pg.elements.slice().reverse().slice(0, 40);
    list.forEach(el => { out.push({ el, prop: null }); const props = el.anim ? Object.keys(el.anim).filter(k => el.anim[k] && el.anim[k].length) : []; props.forEach(p => out.push({ el, prop: p })); });
    return out;
  }
  function build() {
    if (!host || !S.project) return; const pg = OC.page(); host.textContent = ''; ui = {};
    const dur = pg.duration; const width = Math.max(600, dur * pps + 80); const rs = rows(pg);
    ui.play = h('button.icon-btn.play', { onclick: () => TL.toggle(), html: OC.icon(S.playing ? 'pause' : 'play', 16), title: T('Play or pause') });
    ui.time = h('span.tl-time', fmt(S.time));
    const head = h('div.tl-head', ui.play, UI.iconBtn('skip-back', 'Start', () => TL.seek(0)), ui.time, h('span.muted.small', ' / ' + fmt(dur)), h('span.grow'),
      h('label.tl-chk', UI.toggle(TL.loop, v => { TL.loop = v; }), T('Loop')), h('label.tl-chk', UI.toggle(S.autoKey, v => { S.autoKey = v; }), T('Auto key')),
      UI.num(dur, v => { pg.duration = Math.max(.5, v); build(); }, { unit: 's', w: 84, step: .5, dec: 1, min: .5, label: 'Length' }), UI.iconBtn('zoom-out', 'Zoom out', () => { pps = Math.max(30, pps / 1.3); build(); }), UI.iconBtn('zoom-in', 'Zoom in', () => { pps = Math.min(400, pps * 1.3); build(); }), UI.iconBtn('x', 'Close', () => UI.toggleTimeline(false)));
    const labels = h('div.tl-labels'), track = h('div.tl-scroll', { onscroll: () => { labels.scrollTop = track.scrollTop; } }), tracks = h('div.tl-tracks', { style: `width:${width}px` });
    // ruler
    const ruler = h('div.tl-ruler'); const step = pps > 200 ? .25 : pps > 90 ? .5 : pps > 50 ? 1 : 2; for (let t = 0; t <= dur + .001; t += step) ruler.append(h('div.tick' + (Math.abs(t % 1) < .001 ? '.major' : ''), { style: `left:${t * pps}px` }, Math.abs(t % 1) < .001 ? h('span', Math.round(t) + 's') : ''));
    ruler.addEventListener('pointerdown', ev => { const mv = e2 => { const r = tracks.getBoundingClientRect(); TL.seek((e2.clientX - r.left) / pps); }; mv(ev); ruler.setPointerCapture(ev.pointerId); ruler.onpointermove = mv; ruler.onpointerup = () => { ruler.onpointermove = null; }; });
    tracks.append(ruler); labels.append(h('div.tl-lab.ruler-lab', T('Layers')));
    rs.forEach(r => {
      const el = r.el; const isHead = !r.prop;
      labels.append(h('div.tl-lab' + (isHead ? '.el' : '.prop') + (OC.sel.has(el.id) ? '.sel' : ''), { onclick: () => OC.sel.set([el.id]) }, isHead ? [h('span.ico', { html: OC.icon(iconFor(el), 14) }), h('span.nm', el.name || el.type), h('span.grow'), UI.iconBtn('plus', 'Add keyframe', ev => { ev.stopPropagation(); addKeyMenu(ev.currentTarget, el); })] : [h('span.nm', T(PROPS[r.prop] || r.prop)), h('span.grow'), h('button.kf' + (((el.anim[r.prop] || []).some(k => near(k.t, S.time))) ? '.on' : ''), { onclick: ev => { ev.stopPropagation(); TL.toggleKey(el, r.prop); build(); }, html: '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M5 0L10 5L5 10L0 5Z" fill="currentColor"/></svg>' })]));
      const lane = h('div.tl-lane' + (isHead ? '.el' : '.prop'));
      if (isHead) {
        const s = (el.timing && el.timing.start) || 0, e = el.timing && el.timing.end != null ? el.timing.end : dur; const bar = h('div.tl-bar' + (OC.sel.has(el.id) ? '.sel' : ''), { style: `left:${s * pps}px;width:${Math.max(6, (e - s) * pps)}px`, title: T('Drag to move, edges to trim') }, h('i.hl'), h('span', el.name || el.type), h('i.hr'));
        bar.addEventListener('pointerdown', ev => { ev.stopPropagation(); OC.sel.set([el.id]); const side = ev.target.classList.contains('hl') ? 'l' : ev.target.classList.contains('hr') ? 'r' : 'm'; const x0 = ev.clientX, s0 = s, e0 = e; bar.setPointerCapture(ev.pointerId); bar.onpointermove = e2 => { const dt = Math.round((e2.clientX - x0) / pps * 20) / 20; el.timing = el.timing || { start: 0, end: null }; if (side === 'm') { const d2 = U.clamp(dt, -s0, dur - e0); el.timing.start = U.round(s0 + d2, 2); el.timing.end = U.round(e0 + d2, 2); } else if (side === 'l') el.timing.start = U.round(U.clamp(s0 + dt, 0, e0 - .1), 2); else el.timing.end = U.round(U.clamp(e0 + dt, s0 + .1, dur), 2); bar.style.left = el.timing.start * pps + 'px'; bar.style.width = Math.max(6, ((el.timing.end == null ? dur : el.timing.end) - el.timing.start) * pps) + 'px'; R.invalidate(); }; bar.onpointerup = () => { bar.onpointermove = null; OC.history.commit('Timing'); build(); }; });
        lane.append(bar);
        const allT = new Set(); Object.values(el.anim || {}).forEach(ks => ks.forEach(k => allT.add(k.t))); allT.forEach(t => lane.append(h('i.mini-kf', { style: `left:${t * pps}px` })));
      } else {
        (el.anim[r.prop] || []).forEach((k, i) => { const d = h('button.kfd' + (selKey && selKey.id === el.id && selKey.prop === r.prop && selKey.i === i ? '.on' : ''), { style: `left:${k.t * pps}px`, title: fmt(k.t) + ' · ' + T('Double click for easing'), html: '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M6 0L12 6L6 12L0 6Z" fill="currentColor"/></svg>' });
          d.addEventListener('pointerdown', ev => { ev.stopPropagation(); selKey = { id: el.id, prop: r.prop, i }; OC.sel.set([el.id]); const x0 = ev.clientX, t0 = k.t; d.setPointerCapture(ev.pointerId); let moved = false; d.onpointermove = e2 => { moved = true; k.t = U.round(U.clamp(t0 + (e2.clientX - x0) / pps, 0, dur), 2); d.style.left = k.t * pps + 'px'; TL.seek(k.t); }; d.onpointerup = () => { d.onpointermove = null; el.anim[r.prop].sort((a, b) => a.t - b.t); if (moved) OC.history.commit('Move keyframe'); build(); }; });
          d.addEventListener('dblclick', () => easePop(d, k, el)); lane.append(d); });
      }
      lane.addEventListener('pointerdown', ev => { if (ev.target !== lane) return; const rr = tracks.getBoundingClientRect(); TL.seek((ev.clientX - rr.left) / pps); });
      tracks.append(lane);
    });
    ui.head = h('div.tl-playhead', { style: `left:${S.time * pps}px` }, h('i')); tracks.append(ui.head);
    if (!rs.length) tracks.append(h('div.tl-empty', T('Select an element to animate it')));
    track.append(tracks); host.append(head, h('div.tl-body', labels, track));
    ui.tracks = tracks; ui.track = track;
  }
  function drawHead() { if (!ui.head) return; ui.head.style.left = S.time * pps + 'px'; if (ui.time) ui.time.textContent = fmt(S.time); if (S.playing && ui.track) { const x = S.time * pps; if (x > ui.track.scrollLeft + ui.track.clientWidth - 40) ui.track.scrollLeft = x - 60; } if (!S.playing) { OC.ctxbar && 0; } }
  const iconFor = e => ({ text: 'type', image: 'image', video: 'video', audio: 'music', group: 'group', frame: 'frame', path: 'pen-tool', scene3d: 'cuboid', ellipse: 'circle', rect: 'square' }[e.type] || 'shapes');
  function addKeyMenu(btn, el) {
    UI.menu(Object.keys(PROPS).map(p => ({ label: PROPS[p], onclick: () => { if (!(el.anim && el.anim[p] && el.anim[p].some(k => near(k.t, S.time)))) { const cur = R.resolve(el, S.time); TL.setKey(el, p, p === 'scale' ? 1 : TL.getVal(cur, p)); OC.history.commit('Keyframe'); } build(); } })), btn.getBoundingClientRect().left, btn.getBoundingClientRect().bottom);
  }
  function easePop(anchor, k, el) {
    const names = R.EASINGS; let bz = (k.e || '').startsWith('bezier(') ? k.e.slice(7, -1).split(',').map(Number) : [.25, .1, .25, 1];
    UI.popover(anchor, h('div.ease-pop', h('div.chips', names.map(n => h('button.chip' + (k.e === n ? '.on' : ''), { onclick: () => { k.e = n; OC.history.commit('Easing'); R.invalidate(); } }, n))), h('div.row', ['x1', 'y1', 'x2', 'y2'].map((l, i) => UI.num(bz[i], v => { bz[i] = v; }, { label: l, w: 62, step: .05, dec: 2, min: i % 2 ? -1 : 0, max: i % 2 ? 2 : 1 }))), h('div.row', UI.btn('Use curve', () => { k.e = `bezier(${bz.join(',')})`; OC.history.commit('Easing'); R.invalidate(); }), UI.btn('Delete key', () => { const ks = el.anim[Object.keys(el.anim).find(p => el.anim[p].includes(k))]; ks.splice(ks.indexOf(k), 1); OC.history.commit('Delete key'); build(); }))), { cls: 'pop-ease' });
  }
})();
