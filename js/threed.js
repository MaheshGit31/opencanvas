/* 3D scenes: three.js rendered into the canvas scene graph */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui, R = OC.render;
  const T = s => OC.t(s); const TD = OC.threed = { active: null, sel: null };
  let renderer = null, glFail = false; const cache = new Map(); const texCache = new Map();
  const MATS = { Matte: { metal: 0, rough: .9 }, Plastic: { metal: 0, rough: .3 }, Metal: { metal: 1, rough: .25 }, Glossy: { metal: .1, rough: .08 }, Clay: { metal: 0, rough: 1 }, Chrome: { metal: 1, rough: .02 } };
  const KINDS = [['cube', 'Cube', 'box'], ['sphere', 'Sphere', 'circle'], ['cylinder', 'Cylinder', 'cylinder'], ['cone', 'Cone', 'triangle'], ['torus', 'Torus', 'donut'], ['capsule', 'Capsule', 'pill'], ['pyramid', 'Pyramid', 'pyramid'], ['plane', 'Plane', 'square'], ['heart', 'Heart', 'heart'], ['star', 'Star', 'star'], ['text', 'Text', 'type'], ['card', 'Image card', 'image']];
  const newScene = () => ({ objects: [], cam: { az: 35, el: 22, dist: 6, fov: 40 }, light: { az: 40, el: 45, int: 1.1, color: '#ffffff' }, ambient: .55, bg: null, shadow: true });
  const mk = (kind, o = {}) => ({ id: U.uid('o'), kind, name: (KINDS.find(k => k[0] === kind) || [0, kind])[1], color: '#2563eb', mat: 'Plastic', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], text: 'Hello', src: '', depth: .5, d: '', bevel: .06, ...o });
  TD.mk = mk;

  function ensureRenderer() {
    if (renderer || glFail) return renderer; if (!window.THREE) { glFail = true; return null; }
    try { const c = document.createElement('canvas'); renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; }
    catch (e) { console.warn('WebGL unavailable', e); glFail = true; renderer = null; } return renderer;
  }
  function geomFor(o) {
    switch (o.kind) {
      case 'cube': return new THREE.BoxGeometry(1.4, 1.4, 1.4, 1, 1, 1);
      case 'sphere': return new THREE.SphereGeometry(.85, 48, 32);
      case 'cylinder': return new THREE.CylinderGeometry(.7, .7, 1.5, 48);
      case 'cone': return new THREE.ConeGeometry(.8, 1.6, 48);
      case 'torus': return new THREE.TorusGeometry(.75, .3, 32, 72);
      case 'capsule': return new THREE.CapsuleGeometry(.5, 1, 12, 32);
      case 'pyramid': return new THREE.ConeGeometry(1, 1.5, 4);
      case 'plane': return new THREE.BoxGeometry(2.4, .08, 2.4);
      case 'card': return new THREE.BoxGeometry(2.4, 1.6, .06);
      case 'text': return new THREE.BoxGeometry(2.6, .9, Math.max(.05, o.depth));
      case 'heart': case 'star': case 'path': return extrude(o);
    }
    return new THREE.BoxGeometry(1, 1, 1);
  }
  function shapeFromD(d) { // svg path data (M L C Z only, from OC.vec) into THREE.Shape(s)
    const sh = new THREE.Shape(); const t = d.match(/[MLCZmlcz]|-?[\d.]+(?:e-?\d+)?/g) || []; let i = 0, cmd = '', cx = 0, cy = 0, started = false; const shapes = [];
    while (i < t.length) { if (/[A-Za-z]/.test(t[i])) cmd = t[i++]; if (cmd === 'M') { cx = +t[i++]; cy = +t[i++]; if (started) { shapes.push(sh.curves.length ? sh : null); } sh.moveTo(cx, -cy); started = true; } else if (cmd === 'L') { cx = +t[i++]; cy = +t[i++]; sh.lineTo(cx, -cy); } else if (cmd === 'C') { const a = [+t[i++], +t[i++], +t[i++], +t[i++], +t[i++], +t[i++]]; sh.bezierCurveTo(a[0], -a[1], a[2], -a[3], a[4], -a[5]); cx = a[4]; cy = a[5]; } else if (cmd === 'Z' || cmd === 'z') { sh.closePath(); } else i++; }
    return sh;
  }
  const HEART = 'M50 88C20 62 6 44 6 28C6 14 17 6 29 6C38 6 46 11 50 19C54 11 62 6 71 6C83 6 94 14 94 28C94 44 80 62 50 88Z';
  function extrude(o) {
    let d = o.kind === 'heart' ? HEART : o.kind === 'star' ? 'M50 4L62 38L96 38L68 58L79 92L50 72L21 92L32 58L4 38L38 38Z' : o.d; if (!d) d = HEART; const sh = shapeFromD(d); const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(.02, o.depth) * 40, bevelEnabled: o.bevel > 0, bevelThickness: o.bevel * 40, bevelSize: o.bevel * 40, bevelSegments: 4, curveSegments: 24 });
    g.computeBoundingBox(); const b = g.boundingBox; const k = 1.8 / Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 1); g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2); g.scale(k, k, k); return g;
  }
  function texFor(o) {
    const key = o.kind + o.text + o.src + o.color; if (texCache.has(key)) return texCache.get(key);
    let c; if (o.kind === 'text') { c = U.newCanvas(1024, 360); const g = c.getContext('2d'); g.fillStyle = o.color; g.fillRect(0, 0, 1024, 360); g.fillStyle = '#fff'; g.font = '800 200px Poppins, Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.text, 512, 190, 960); }
    else { const img = OC.assets.img(o.src); if (!img) return null; c = U.newCanvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
  }
  function buildScene(sc, withShadowPlane) {
    const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(sc.cam.fov, 1, .1, 200);
    const az = sc.cam.az * Math.PI / 180, el = sc.cam.el * Math.PI / 180; cam.position.set(Math.sin(az) * Math.cos(el) * sc.cam.dist, Math.sin(el) * sc.cam.dist, Math.cos(az) * Math.cos(el) * sc.cam.dist); cam.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight('#ffffff', sc.ambient * 1.6)); const hemi = new THREE.HemisphereLight('#ffffff', '#555566', .6); scene.add(hemi);
    const la = sc.light.az * Math.PI / 180, le = sc.light.el * Math.PI / 180; const dl = new THREE.DirectionalLight(sc.light.color, sc.light.int * 2.4); dl.position.set(Math.sin(la) * Math.cos(le) * 8, Math.sin(le) * 8, Math.cos(la) * Math.cos(le) * 8); dl.castShadow = !!sc.shadow; dl.shadow.mapSize.set(1024, 1024); const sc2 = dl.shadow.camera; sc2.left = -6; sc2.right = 6; sc2.top = 6; sc2.bottom = -6; sc2.near = .5; sc2.far = 30; dl.shadow.bias = -.0004; dl.shadow.radius = 5; scene.add(dl);
    const meshes = {}; for (const o of sc.objects) {
      if (o.hidden) continue; const m = MATS[o.mat] || MATS.Plastic; const g = geomFor(o); let mat; const tex = (o.kind === 'text' || o.kind === 'card') ? texFor(o) : null;
      if (tex && o.kind === 'card') { const side = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .6 }); const face = new THREE.MeshStandardMaterial({ map: tex, roughness: .5 }); mat = [side, side, side, side, face, face]; }
      else if (tex) { const side = new THREE.MeshStandardMaterial({ color: o.color, roughness: m.rough, metalness: m.metal }); const face = new THREE.MeshStandardMaterial({ map: tex, roughness: m.rough, metalness: m.metal * .3 }); mat = [side, side, side, side, face, side]; }
      else mat = new THREE.MeshStandardMaterial({ color: o.color, metalness: m.metal, roughness: m.rough, envMapIntensity: 1 });
      const mesh = new THREE.Mesh(g, mat); mesh.position.set(...o.pos); mesh.rotation.set(o.rot[0] * Math.PI / 180, o.rot[1] * Math.PI / 180, o.rot[2] * Math.PI / 180); mesh.scale.set(...o.scale); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.id = o.id; scene.add(mesh); meshes[o.id] = mesh;
    }
    if (sc.shadow) { const p = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .28 })); p.rotation.x = -Math.PI / 2; p.position.y = -1.01; p.receiveShadow = true; scene.add(p); }
    // fake env for metals: gradient cube
    scene.environment = envTex(); return { scene, cam, meshes };
  }
  let _env = null; function envTex() {
    if (_env) return _env; const c = U.newCanvas(512, 256), g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#dfe8ff'); gr.addColorStop(.5, '#ffffff'); gr.addColorStop(.52, '#8a8a99'); gr.addColorStop(1, '#2a2a33'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(60, 40, 90, 50); g.fillRect(330, 30, 120, 40);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; const pm = new THREE.PMREMGenerator(renderer); _env = pm.fromEquirectangular(t).texture; return _env;
  }
  function renderTo(el, W, Hh, withMeshes) {
    if (!ensureRenderer()) return null; const sc = el.scene; if (!sc) return null; const { scene, cam, meshes } = buildScene(sc); cam.aspect = W / Hh; cam.updateProjectionMatrix(); renderer.setSize(W, Hh, false); renderer.setClearColor(sc.bg || '#000000', sc.bg ? 1 : 0); renderer.render(scene, cam); if (withMeshes) { withMeshes.scene = scene; withMeshes.cam = cam; withMeshes.meshes = meshes; } return renderer.domElement;
  }
  TD.draw = function (ctx, el, o) {
    const sc = el.scene; if (!sc) { ctx.fillStyle = 'rgba(128,128,160,.15)'; ctx.fillRect(0, 0, el.w, el.h); return; }
    const k = Math.min(2, Math.max(.3, (o.scale || 1))); const W = Math.max(64, Math.min(1800, Math.round(el.w * k))), Hh = Math.max(64, Math.min(1800, Math.round(el.h * k)));
    const key = el.id + '|' + W + 'x' + Hh + '|' + JSON.stringify(sc) + '|' + OC.assets.imgReady; let c = cache.get(key);
    if (!c) { const src = renderTo(el, W, Hh); if (!src) return fallback(ctx, el); c = U.newCanvas(W, Hh); c.getContext('2d').drawImage(src, 0, 0); cache.set(key, c); if (cache.size > 12) cache.delete(cache.keys().next().value); }
    ctx.drawImage(c, 0, 0, el.w, el.h);
  };
  function fallback(ctx, el) { ctx.save(); ctx.fillStyle = 'rgba(37,99,235,.12)'; ctx.fillRect(0, 0, el.w, el.h); ctx.fillStyle = '#2563eb'; ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('3D needs WebGL', el.w / 2, el.h / 2); ctx.restore(); }

  /* ---------- editing ---------- */
  TD.add = function (kind) {
    const pg = OC.page(); const sc = newScene(); sc.objects.push(mk(kind || 'cube', { color: S.project.brand.colors[0] || '#2563eb', pos: [0, 0, 0] }));
    const el = D.make('scene3d', { name: '3D scene', w: Math.min(520, pg.w * .7), h: Math.min(520, pg.h * .7), scene: sc }); el.x = (pg.w - el.w) / 2; el.y = (pg.h - el.h) / 2; OC.ops.add(el); TD.edit(el); return el;
  };
  TD.addFullPage = function () { const pg = OC.page(); const sc = newScene(); sc.bg = '#14141c'; sc.objects.push(mk('torus', { color: '#2563eb', mat: 'Glossy' }), mk('sphere', { color: '#ff5d8f', mat: 'Chrome', pos: [1.6, -.2, .3], scale: [.5, .5, .5] })); const el = D.make('scene3d', { name: '3D scene', x: 0, y: 0, w: pg.w, h: pg.h, scene: sc }); OC.ops.add(el, { noSelect: false }); TD.edit(el); };
  TD.addObject = function (kind, extra) { const el = TD.cur(); if (!el) { const e = TD.add(kind); if (extra) Object.assign(e.scene.objects[0], extra); return; } const o = mk(kind, { color: S.project.brand.colors[el.scene.objects.length % 5] || '#2563eb', pos: [(el.scene.objects.length % 3 - 1) * 1.2, 0, 0], ...extra }); el.scene.objects.push(o); TD.sel = o.id; OC.history.commit('Add 3D object'); R.invalidate(); refreshPanel(); };
  TD.cur = () => { if (TD.active) return D.get(TD.active); const e = OC.sel.one(); return e && e.type === 'scene3d' ? e : null; };
  TD.edit = function (el) { TD.active = el.id; TD.sel = el.scene.objects[0] && el.scene.objects[0].id; OC.sel.set([el.id]); UI.openPanel('three'); R.invalidate(); };
  TD.exit = function () { TD.active = null; TD.sel = null; R.invalidate(); if (UI.curPanel === 'three') refreshPanel(); };
  const refreshPanel = () => { if (UI.curPanel === 'three') UI.openPanel('three'); };
  TD.pointer = function (kind, p) {
    const el = TD.active && D.get(TD.active); if (!el) return false; const lp = D.toLocal(el.id, p.px, p.py); const inside = lp.x >= 0 && lp.y >= 0 && lp.x <= el.w && lp.y <= el.h; const cam = el.scene.cam;
    if (kind === 'down') { if (!inside) { TD.exit(); return false; } TD.drag = { x: p.sx, y: p.sy, az: cam.az, el: cam.el, dist: cam.dist, mode: p.alt || (p.e && p.e.button === 1) ? 'pan' : p.shift ? 'move' : 'orbit', moved: false, lx: lp.x, ly: lp.y }; const o = TD.pick(el, lp); if (o && !TD.drag.mode.startsWith('orbit')) TD.sel = o; TD.drag.pick = o; if (o) { TD.sel = o.id; const ob = o; TD.drag.pos = ob.pos.slice(); TD.drag.mode = p.shift ? 'move' : 'object'; refreshPanelSoft(); } else TD.drag.mode = 'orbit'; return true; }
    if (kind === 'move' && TD.drag) { const d = TD.drag, dx = p.sx - d.x, dy = p.sy - d.y; d.moved = true; if (d.mode === 'orbit') { cam.az = d.az - dx * .5; cam.el = U.clamp(d.el + dy * .5, -85, 85); } else if (d.mode === 'object' || d.mode === 'move') { const o = el.scene.objects.find(x => x.id === TD.sel); if (o) { const az = cam.az * Math.PI / 180, k = cam.dist / 380 * 1.1; o.pos[0] = d.pos[0] + (Math.cos(az) * dx) * k; o.pos[2] = d.pos[2] + (-Math.sin(az) * dx) * k; o.pos[1] = d.pos[1] - dy * k; } } R.invalidate(); return true; }
    if (kind === 'up' && TD.drag) { const moved = TD.drag.moved; TD.drag = null; if (moved) OC.history.commit('3D'); refreshPanelSoft(); return true; }
    if (kind === 'wheel') { cam.dist = U.clamp(cam.dist * (1 + p.dy * .001), 2, 30); R.invalidate(); return true; }
    return false;
  };
  const refreshPanelSoft = U.debounce(refreshPanel, 60);
  TD.pick = function (el, lp) { // ray pick via three raycaster on the same scene
    if (!ensureRenderer()) return null; const sc = el.scene; const { scene, cam, meshes } = buildScene(sc); cam.aspect = el.w / el.h; cam.updateProjectionMatrix(); const ndc = new THREE.Vector2(lp.x / el.w * 2 - 1, -(lp.y / el.h * 2 - 1)); const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, cam); const hit = rc.intersectObjects(Object.values(meshes), false)[0]; return hit ? sc.objects.find(o => o.id === hit.object.userData.id) : null;
  };
  TD.overlay = function (ctx, acc, toS) {
    const el = TD.active && D.get(TD.active); if (!el) return; const f = D.find(el.id); if (!f) return; const c = D.pageCorners(el.id); const pg = f.page; const a = toS(pg, c[0].x, c[0].y), b = toS(pg, c[2].x, c[2].y);
    ctx.save(); ctx.strokeStyle = acc; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.setLineDash([]); const label = T('Drag to orbit, scroll to zoom'); ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const w = ctx.measureText(label).width + 20; const px = Math.min(a.x, b.x) + 10, py = Math.max(a.y, b.y) - 32; ctx.fillStyle = acc; ctx.beginPath(); ctx.roundRect(px, py, w, 22, 11); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(label, px + 10, py + 11.5); ctx.restore();
  };

  /* extrude a vector element into 3D */
  TD.extrudeSelection = function () {
    const e = OC.sel.one(); if (!e) { U.toast('Select a shape first'); return; } const p = e.type === 'path' ? e : OC.vec.toPathEl(e); if (!p) { U.toast('Select a shape first'); return; }
    const d = OC.vec.svgD ? OC.vec.svgD(p) : OC.vec.pathD(p); const col = (e.fills && e.fills[0] && e.fills[0].color) || '#2563eb'; const sc = newScene(); sc.objects.push(mk('path', { name: e.name || 'Extrusion', d, color: col, depth: .35, rot: [0, 0, 0] })); const el = D.make('scene3d', { name: '3D ' + (e.name || 'shape'), w: 480, h: 480, scene: sc, x: e.x, y: e.y }); OC.ops.add(el); TD.edit(el);
  };

  /* ---------- panel ---------- */
  TD.renderPanel = function (host, opts) {
    const el = TD.cur(); const body = h('div'); host.append(body);
    body.append(h('div.psec', h('h4', T('Add object')), h('div.grid3', KINDS.map(([k, n, ic]) => h('button.tool-card.sm', { onclick: () => TD.addObject(k, k === 'card' ? { src: pickImage() } : undefined) }, h('span', { html: OC.icon(ic === 'box' ? 'box' : ic === 'circle' ? 'circle' : ic === 'cylinder' ? 'cylinder' : ic === 'triangle' ? 'triangle' : ic === 'donut' ? 'circle-dot' : ic === 'pill' ? 'pill' : ic === 'pyramid' ? 'triangle' : ic === 'square' ? 'square' : ic === 'heart' ? 'heart' : ic === 'star' ? 'star' : ic === 'type' ? 'type' : 'image', 22) }), h('b', T(n)))))));
    body.append(UI.btn('Extrude selected shape', () => TD.extrudeSelection(), { icon: 'layers', cls: 'full' }), UI.btn('Full page 3D scene', () => TD.addFullPage(), { icon: 'cuboid', cls: 'full' }));
    if (!el) { body.append(UI.empty('Add an object to start')); return; }
    const sc = el.scene; const upd = (c) => { R.invalidate(); if (c) OC.history.commit('3D'); }; const o = sc.objects.find(x => x.id === TD.sel) || sc.objects[0];
    body.append(UI.section('Objects', h('div.layer-list', sc.objects.map(ob => h('div.lrow' + (ob.id === (o && o.id) ? '.on' : ''), { onclick: () => { TD.sel = ob.id; refreshPanel(); } }, h('span.grow', ob.name), UI.iconBtn(ob.hidden ? 'eye-off' : 'eye', 'Show or hide', ev => { ev.stopPropagation(); ob.hidden = !ob.hidden; upd(true); refreshPanel(); }), UI.iconBtn('copy', 'Duplicate', ev => { ev.stopPropagation(); const c = U.clone(ob); c.id = U.uid('o'); c.pos[0] += .5; sc.objects.push(c); TD.sel = c.id; upd(true); refreshPanel(); }), UI.iconBtn('trash-2', 'Delete', ev => { ev.stopPropagation(); sc.objects.splice(sc.objects.indexOf(ob), 1); TD.sel = null; upd(true); refreshPanel(); }))))));
    if (o) {
      const vec = (label, key, min, max, step) => h('div.vec3', h('label', T(label)), [0, 1, 2].map(i => UI.num(Math.round(o[key][i] * 100) / 100, v => { o[key][i] = v; upd(); }, { label: 'XYZ'[i], step, min, max, w: 64, onChange: () => upd(true) })));
      body.append(UI.section('Object', h('div', UI.field('Name', h('input.input', { value: o.name, onkeydown: e => e.stopPropagation(), onchange: ev => { o.name = ev.target.value; upd(true); refreshPanel(); } })), vec('Position', 'pos', -20, 20, .1), vec('Rotation', 'rot', -360, 360, 1), vec('Scale', 'scale', .05, 20, .05), h('div.row', h('span.lbl', T('Color')), UI.colorBtn(o.color, v => { o.color = v; upd(); }, v => { o.color = v; upd(true); })), h('div.chips', Object.keys(MATS).map(m => h('button.chip' + (o.mat === m ? '.on' : ''), { onclick: () => { o.mat = m; upd(true); refreshPanel(); } }, T(m)))), o.kind === 'text' ? UI.field('Text', h('input.input', { value: o.text, onkeydown: e => e.stopPropagation(), oninput: ev => { o.text = ev.target.value; upd(); }, onchange: () => upd(true) })) : '', ['heart', 'star', 'path', 'text'].includes(o.kind) ? UI.field('Depth', UI.slider(o.depth, .05, 2, .01, v => { o.depth = v; upd(); }, () => upd(true))) : '', ['heart', 'star', 'path'].includes(o.kind) ? UI.field('Bevel', UI.slider(o.bevel, 0, .3, .005, v => { o.bevel = v; upd(); }, () => upd(true))) : '')));
    }
    body.append(UI.section('Camera and light', h('div', UI.field('Rotate', UI.slider(sc.cam.az, -180, 180, 1, v => { sc.cam.az = v; upd(); }, () => upd(true))), UI.field('Tilt', UI.slider(sc.cam.el, -85, 85, 1, v => { sc.cam.el = v; upd(); }, () => upd(true))), UI.field('Zoom', UI.slider(sc.cam.dist, 2, 20, .1, v => { sc.cam.dist = v; upd(); }, () => upd(true))), UI.field('Perspective', UI.slider(sc.cam.fov, 15, 90, 1, v => { sc.cam.fov = v; upd(); }, () => upd(true))), UI.field('Light angle', UI.slider(sc.light.az, -180, 180, 1, v => { sc.light.az = v; upd(); }, () => upd(true))), UI.field('Light height', UI.slider(sc.light.el, 5, 90, 1, v => { sc.light.el = v; upd(); }, () => upd(true))), UI.field('Brightness', UI.slider(sc.light.int, 0, 2.5, .05, v => { sc.light.int = v; upd(); }, () => upd(true))), UI.field('Soft shadow', UI.toggle(sc.shadow, v => { sc.shadow = v; upd(true); })), h('div.row', h('span.lbl', T('Background')), UI.toggle(!!sc.bg, v => { sc.bg = v ? '#14141c' : null; upd(true); refreshPanel(); }), sc.bg ? UI.colorBtn(sc.bg, v => { sc.bg = v; upd(); }, v => { sc.bg = v; upd(true); }) : ''))));
    body.append(TD.active ? UI.btn('Done', () => TD.exit(), { primary: true, cls: 'full' }) : UI.btn('Edit scene', () => TD.edit(el), { primary: true, cls: 'full' }));
  };
  function pickImage() { const e = OC.sel.els().find(x => x.type === 'image'); return e ? e.src : ''; }
})();
