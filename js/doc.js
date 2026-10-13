/* Document model, size presets, assets */
(function () {
  const U = OC.U;
  const IN = 96, MM = 96 / 25.4;
  const inch = (a, b) => [Math.round(a * IN), Math.round(b * IN)];
  const mm = (a, b) => [Math.round(a * MM), Math.round(b * MM)];

  OC.CATEGORIES = [
    { id: 'education', label: 'Education', icon: 'graduation-cap', mode: 'design', items: [
      ['Worksheet', ...mm(210, 297)], ['Lesson plan', ...mm(210, 297)], ['Classroom poster', ...mm(420, 594)], ['Infographic', 800, 2000],
      ['Flashcard', ...inch(5, 3)], ['Certificate', ...inch(11, 8.5)], ['Timeline', 1920, 600], ['Study notes', ...mm(210, 297)],
      ['Class schedule', ...inch(11, 8.5)], ['Bookmark', ...inch(2, 6)], ['Report', ...mm(210, 297)], ['Lecture slides', 1920, 1080]] },
    { id: 'presentations', label: 'Presentations', icon: 'presentation', mode: 'design', items: [
      ['Presentation 16:9', 1920, 1080], ['Presentation 4:3', 1024, 768], ['Pitch deck', 1920, 1080], ['Portrait slides', 1080, 1350], ['Ultra wide', 2560, 1080]] },
    { id: 'social', label: 'Social media', icon: 'smartphone', mode: 'design', items: [
      ['Instagram post', 1080, 1080], ['Instagram portrait', 1080, 1350], ['Instagram story', 1080, 1920], ['Facebook post', 1200, 630], ['Facebook cover', 851, 315],
      ['X post', 1600, 900], ['X header', 1500, 500], ['YouTube thumbnail', 1280, 720], ['YouTube banner', 2560, 1440], ['LinkedIn post', 1200, 627],
      ['LinkedIn banner', 1584, 396], ['Pinterest pin', 1000, 1500], ['Twitch banner', 1200, 480], ['Discord banner', 960, 540], ['Profile picture', 800, 800], ['Carousel', 1080, 1350]] },
    { id: 'photo', label: 'Photo editor', icon: 'image', mode: 'design', photo: true, items: [['Photo 4:3', 1600, 1200], ['Photo 3:2', 1800, 1200], ['Square photo', 1500, 1500], ['Portrait photo', 1200, 1600]] },
    { id: 'videos', label: 'Videos', icon: 'film', mode: 'design', video: true, items: [
      ['Video 1080p', 1920, 1080], ['Video 4K', 3840, 2160], ['Vertical video', 1080, 1920], ['Square video', 1080, 1080], ['YouTube Short', 1080, 1920], ['Instagram reel', 1080, 1920], ['TikTok', 1080, 1920], ['Intro', 1920, 1080], ['Slideshow', 1920, 1080]] },
    { id: 'print', label: 'Print', icon: 'printer', mode: 'design', items: [
      ['Flyer portrait', ...inch(8.5, 11)], ['Flyer landscape', ...inch(11, 8.5)], ['Flyer A5', ...mm(148, 210)], ['Poster A3', ...mm(297, 420)], ['Poster A2', ...mm(420, 594)], ['Poster 18x24 in', ...inch(18, 24)],
      ['Business card', ...inch(3.5, 2)], ['Postcard', ...inch(6, 4)], ['Invitation', ...inch(5, 7)], ['Brochure', ...inch(11, 8.5)], ['Menu', ...inch(8.5, 14)], ['Resume', ...mm(210, 297)],
      ['Letterhead', ...inch(8.5, 11)], ['Sticker', ...inch(3, 3)], ['Greeting card', ...inch(5, 7)], ['Book cover', ...inch(6, 9)], ['Banner 2x6 ft', ...inch(72, 24)], ['T shirt print', ...inch(12, 16)], ['Mug wrap', ...inch(9, 3.5)], ['Label', ...inch(4, 2)]] },
    { id: 'docs', label: 'Docs', icon: 'file-text', mode: 'doc', items: [['Blank doc', ...mm(210, 297)], ['Report', ...mm(210, 297)], ['Letter', ...inch(8.5, 11)], ['Meeting notes', ...mm(210, 297)], ['Proposal', ...mm(210, 297)]] },
    { id: 'whiteboards', label: 'Whiteboards', icon: 'frame', mode: 'whiteboard', items: [['Blank whiteboard', 1920, 1080], ['Brainstorm', 1920, 1080], ['Flowchart', 1920, 1080], ['Mind map', 1920, 1080], ['Kanban', 1920, 1080], ['Retrospective', 1920, 1080]] },
    { id: 'sheets', label: 'Sheets', icon: 'table', mode: 'sheet', items: [['Blank sheet', 0, 0], ['Budget', 0, 0], ['Tracker', 0, 0], ['Schedule', 0, 0]] },
    { id: 'code', label: 'Code', icon: 'code', mode: 'code', items: [['HTML playground', 0, 0], ['JavaScript sketch', 0, 0], ['Canvas sketch', 0, 0]] },
    { id: 'websites', label: 'Websites', icon: 'globe', mode: 'web', items: [['Landing page', 0, 0], ['Portfolio', 0, 0], ['Link in bio', 0, 0], ['Blog', 0, 0]] },
    { id: 'emails', label: 'Emails', icon: 'mail', mode: 'email', items: [['Newsletter', 600, 0], ['Promotion', 600, 0], ['Welcome', 600, 0], ['Invitation', 600, 0]] },
    { id: 'custom', label: 'Custom size', icon: 'scaling', mode: 'design', custom: true, items: [] }
  ];
  OC.UNITS = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72 };

  /* assets: blobs referenced as asset:ID */
  const A = OC.assets = {
    map: {}, cache: {},
    async add(blob, name) {
      const id = U.uid('a'); const url = URL.createObjectURL(blob);
      this.map[id] = { id, name: name || 'asset', mime: blob.type, blob, url };
      return id;
    },
    async addDataURL(d, name) { const b = await (await fetch(d)).blob(); return this.add(b, name); },
    url(src) { if (!src) return ''; if (src.startsWith('asset:')) { const a = this.map[src.slice(6)]; return a ? a.url : ''; } return src; },
    img(src) {
      if (!src) return null;
      let c = this.cache[src];
      if (c) return c.ready ? c.img : null;
      const img = new Image(); img.crossOrigin = 'anonymous'; c = this.cache[src] = { img, ready: false };
      img.onload = () => { c.ready = true; OC.render && OC.render.invalidate(true); OC.bus.emit('asset-loaded', src); };
      img.onerror = () => { c.failed = true; };
      const u = this.url(src); if (!u) { c.failed = true; return null; } img.src = u;
      return null;
    },
    imgReady(src) { return new Promise(res => { const t = () => { const i = this.img(src); if (i) res(i); else if (this.cache[src] && this.cache[src].failed) res(null); else setTimeout(t, 30); }; t(); }); },
    async serialize() { const out = {}; for (const id in this.map) { const a = this.map[id]; out[id] = { name: a.name, mime: a.mime, data: await U.readFile(a.blob) }; } return out; },
    async restore(obj) { for (const id in obj || {}) { const a = obj[id]; let blob = a.blob; if (!blob && a.data) blob = await (await fetch(a.data)).blob(); if (!blob) continue; this.map[id] = { id, name: a.name, mime: a.mime || blob.type, blob, url: URL.createObjectURL(blob) }; } },
    raw() { const out = {}; for (const id in this.map) { const a = this.map[id]; out[id] = { name: a.name, mime: a.mime, blob: a.blob }; } return out; },
    usedIn(project) { const s = new Set(); const f = o => { if (typeof o === 'string') { const m = o.match(/asset:\w+/g); m && m.forEach(x => s.add(x.slice(6))); } else if (o && typeof o === 'object') for (const k in o) f(o[k]); }; f(project.pages); f(project.brand); f(project.components); return s; }
  };

  const D = OC.doc = {};
  D.index = new Map();

  D.newPage = function (w, h, o) {
    return Object.assign({ id: U.uid('p'), title: '', locked: false, w, h, bg: { type: 'solid', color: '#ffffff' }, duration: 5, elements: [], notes: '', guides: [], transition: 'none', hidden: false }, o || {});
  };
  D.newProject = function (o = {}) {
    const w = o.w || 1080, h = o.h || 1080;
    const p = {
      v: 1, id: U.uid('proj'), name: o.name || 'Untitled design', mode: o.mode || 'design', cat: o.cat || 'custom', photo: !!o.photo, video: !!o.video,
      size: { w, h }, fps: 30, pages: [], brand: { colors: ['#2563eb', '#ff5d8f', '#00c2a8', '#ffb020', '#1c1c28', '#ffffff'], fonts: { heading: 'Poppins', sub: 'Poppins', body: 'Inter' }, logos: [] },
      components: {}, comments: [], data: o.data || {}, created: Date.now(), modified: Date.now(), grid: { show: false, size: 20, snap: false }
    };
    if (p.mode === 'design' || p.mode === 'whiteboard') {
      const pg = D.newPage(w, h, p.mode === 'whiteboard' ? { infinite: true, bg: { type: 'solid', color: '#f6f6f9' } } : {});
      if (p.video) pg.duration = 5;
      p.pages.push(pg);
    }
    return p;
  };

  /* element factory */
  const solid = (c, o = 1) => ({ type: 'solid', color: c, opacity: o, visible: true });
  D.solid = solid;
  const NAMES = { rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line', path: 'Vector', text: 'Text', image: 'Image', video: 'Video', audio: 'Audio', group: 'Group', frame: 'Frame', scene3d: '3D scene' };
  D.make = function (type, o = {}) {
    const e = {
      id: U.uid(), type, name: NAMES[type] || type, x: 0, y: 0, w: 200, h: 200, rot: 0, opacity: 1, blend: 'source-over', visible: true, locked: false, lockPos: false,
      flipX: false, flipY: false, fills: [], stroke: null, shadows: [], blur: 0, anim: {}, timing: { start: 0, end: null }, link: '', alt: '', tags: []
    };
    const brandC = (OC.S && OC.S.project && OC.S.project.brand.colors[0]) || '#2563eb';
    switch (type) {
      case 'rect': e.fills = [solid(brandC)]; e.radius = 0; break;
      case 'ellipse': e.fills = [solid(brandC)]; break;
      case 'polygon': e.fills = [solid(brandC)]; e.sides = 6; e.radius = 0; break;
      case 'star': e.fills = [solid(brandC)]; e.points = 5; e.inner = 0.45; e.radius = 0; break;
      case 'line': e.h = 0; e.w = 240; e.stroke = { color: '#1c1c28', width: 6, align: 'center', cap: 'round', join: 'round', dash: [], profile: 'uniform', opacity: 1 }; e.ends = { start: 'none', end: 'none' }; break;
      case 'path': e.subpaths = []; e.vw = 100; e.vh = 100; e.fills = [solid(brandC)]; e.fillRule = 'nonzero'; break;
      case 'text': Object.assign(e, { w: 400, h: 60, runs: [{ t: 'Add text' }], ff: 'Inter', fw: 400, fs: 48, fi: false, align: 'left', valign: 'top', lh: 1.25, ls: 0, ws: 0, tf: 'none', autoH: true, curve: 0, under: false, strike: false, kern: true, caps: false, bg: null, para: 0 }); e.fills = [solid('#1c1c28')]; break;
      case 'image': e.src = ''; e.fit = 'cover'; e.crop = { x: 0, y: 0, s: 1 }; e.adj = {}; e.radius = 0; break;
      case 'video': e.src = ''; e.fit = 'cover'; e.trim = 0; e.volume = 1; e.loop = false; e.adj = {}; e.radius = 0; e.srcDur = 0; break;
      case 'audio': e.src = ''; e.w = 160; e.h = 48; e.volume = 1; e.trim = 0; e.srcDur = 0; break;
      case 'group': e.children = []; break;
      case 'frame': e.children = []; e.clip = true; e.radius = 0; e.layout = { mode: 'none', gap: 12, pad: 16, align: 'start' }; e.fills = [solid('#ffffff')]; break;
      case 'scene3d': e.w = 480; e.h = 480; e.scene = null; break;
    }
    Object.assign(e, o);
    return e;
  };

  /* indexing */
  D.reindex = function (project) {
    project = project || OC.S.project; D.index.clear();
    const walk = (list, parentEl, page) => list.forEach(el => { D.index.set(el.id, { el, list, parentEl, page }); if (el.children) walk(el.children, el, page); });
    project.pages.forEach(pg => walk(pg.elements, null, pg));
  };
  D.find = id => D.index.get(id);
  D.get = id => { const f = D.index.get(id); return f && f.el; };
  D.walk = function (list, fn) { list.forEach(el => { fn(el); if (el.children) D.walk(el.children, fn); }); };
  D.allElements = function (project) { const out = []; (project || OC.S.project).pages.forEach(p => D.walk(p.elements, e => out.push(e))); return out; };
  D.ancestors = id => { const out = []; let f = D.find(id); while (f && f.parentEl) { out.push(f.parentEl); f = D.find(f.parentEl.id); } return out; };
  D.isLocked = id => { const f = D.find(id); if (!f) return false; if (f.el.locked) return true; if (f.page && f.page.locked) return true; return D.ancestors(id).some(a => a.locked); };

  /* bounds */
  D.cornersOf = function (el) {
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2, a = U.rad(el.rot || 0);
    return [[el.x, el.y], [el.x + el.w, el.y], [el.x + el.w, el.y + el.h], [el.x, el.y + el.h]].map(p => U.rotPt(p[0], p[1], cx, cy, a));
  };
  D.boundsOf = function (els) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    els.forEach(el => D.cornersOf(el).forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  /* recompute group box from children */
  D.fitGroup = function (g) {
    if (!g.children || !g.children.length) return;
    const b = D.boundsOf(g.children);
    const lcx = b.x + b.w / 2, lcy = b.y + b.h / 2;
    let dx = lcx - g.w / 2, dy = lcy - g.h / 2; if (g.flipX) dx = -dx; if (g.flipY) dy = -dy;
    const dp = U.rotPt(dx, dy, 0, 0, U.rad(g.rot || 0));
    const ncx = g.x + g.w / 2 + dp.x, ncy = g.y + g.h / 2 + dp.y;
    g.children.forEach(c => { c.x -= b.x; c.y -= b.y; });
    g.w = b.w; g.h = b.h; g.x = ncx - b.w / 2; g.y = ncy - b.h / 2;
  };
  D.fitAllGroups = function (project) {
    const rec = list => list.forEach(el => { if (el.children) { rec(el.children); if (el.type === 'group') D.fitGroup(el); } });
    (project || OC.S.project).pages.forEach(p => rec(p.elements));
  };

  /* Map a point in page space to element local space (before flip), walking ancestors */
  D.chain = function (id) { const out = []; let f = D.find(id); while (f) { out.unshift(f.el); f = f.parentEl ? D.find(f.parentEl.id) : null; } return out; };
  D.toLocal = function (id, px, py) {
    const chain = D.chain(id); let x = px, y = py;
    for (const el of chain) {
      const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
      const p = U.rotPt(x, y, cx, cy, -U.rad(el.rot || 0)); x = p.x - el.x; y = p.y - el.y;
      if (el.flipX) x = el.w - x; if (el.flipY) y = el.h - y;
    }
    return { x, y };
  };
  /* element's local point to page space */
  D.toPage = function (id, lx, ly) {
    const chain = D.chain(id).reverse(); let x = lx, y = ly;
    for (const el of chain) {
      if (el.flipX) x = el.w - x; if (el.flipY) y = el.h - y;
      const p = U.rotPt(x + el.x, y + el.y, el.x + el.w / 2, el.y + el.h / 2, U.rad(el.rot || 0)); x = p.x; y = p.y;
    }
    return { x, y };
  };
  /* page space bounds of an element at any depth */
  D.pageCorners = function (id) {
    const el = D.get(id); return [[0, 0], [el.w, 0], [el.w, el.h], [0, el.h]].map(p => D.toPage(id, p[0], p[1]));
  };

  /* page layout in world space */
  D.layoutPages = function (project) {
    project = project || OC.S.project; const mode = OC.S.pageLayout || 'vertical'; const gap = 100, titleH = 44;
    let x = 0, y = 0, rowH = 0; const cols = mode === 'grid' ? Math.max(2, Math.ceil(Math.sqrt(project.pages.length))) : 1; let i = 0;
    project.pages.forEach(pg => {
      if (pg.infinite) { pg._x = -20000; pg._y = -20000; pg._w = 40000; pg._h = 40000; return; }
      if (mode === 'horizontal') { pg._x = x; pg._y = 0; x += pg.w + gap; }
      else if (mode === 'grid') { pg._x = x; pg._y = y; x += pg.w + gap; rowH = Math.max(rowH, pg.h); if (++i % cols === 0) { x = 0; y += rowH + gap + titleH; rowH = 0; } }
      else { pg._x = 0; pg._y = y; y += pg.h + gap + titleH; }
      pg._w = pg.w; pg._h = pg.h;
    });
  };

  /* snapshot (without assets) */
  D.snapshot = project => JSON.stringify(project || OC.S.project, (k, v) => (k[0] === '_' ? undefined : v));
})();
