/* State, history, settings, commands and keybinds */
(function () {
  const U = OC.U, D = OC.doc;

  /* ---------- state ---------- */
  const S = OC.S = {
    project: null, pageIdx: 0, sel: [], tool: 'select', zoom: 1, panX: 0, panY: 0, time: 0, playing: false, timelineOpen: false,
    enter: null, editing: null, nodeEdit: null, cropEl: null, clipboard: null, styleClip: null, pageLayout: 'vertical', photoTool: null, home: true
  };
  OC.sel = {
    ids: () => S.sel.slice(),
    els: () => S.sel.map(id => D.get(id)).filter(Boolean),
    set(ids, quiet) { ids = (ids || []).filter(id => D.get(id)); if (JSON.stringify(ids) === JSON.stringify(S.sel)) return; S.sel = ids; if (!ids.length) { S.nodeEdit = null; S.cropEl = null; } if (S.nodeEdit && S.nodeEdit !== ids[0]) S.nodeEdit = null; if (S.cropEl && S.cropEl !== ids[0]) S.cropEl = null; if (!quiet) OC.bus.emit('selection'); OC.render.invalidate(); },
    add(id) { if (!S.sel.includes(id)) this.set([...S.sel, id]); },
    toggle(id) { this.set(S.sel.includes(id) ? S.sel.filter(x => x !== id) : [...S.sel, id]); },
    clear() { this.set([]); },
    has: id => S.sel.includes(id),
    one() { return S.sel.length === 1 ? D.get(S.sel[0]) : null; },
    page() { if (S.sel.length) { const f = D.find(S.sel[0]); if (f) return f.page; } return OC.page(); }
  };
  OC.page = () => S.project && S.project.pages[Math.min(S.pageIdx, S.project.pages.length - 1)];
  OC.setPageIdx = i => { i = U.clamp(i, 0, S.project.pages.length - 1); if (i !== S.pageIdx) { S.pageIdx = i; OC.bus.emit('page-changed'); } };

  /* ---------- history ---------- */
  const H = OC.history = { stack: [], idx: -1, max: 120, labels: [] };
  H.init = function () { H.stack = [D.snapshot()]; H.labels = ['Open']; H.idx = 0; OC.bus.emit('history'); };
  H.commit = function (label) {
    OC.render.autoLayout(); D.fitAllGroups(); D.reindex(); D.layoutPages();
    syncComponents();
    const snap = D.snapshot(); if (snap === H.stack[H.idx]) { OC.render.invalidate(); return; }
    H.stack = H.stack.slice(0, H.idx + 1); H.stack.push(snap); H.labels = H.labels.slice(0, H.idx + 1); H.labels.push(label || 'Edit');
    if (H.stack.length > H.max) { H.stack.shift(); H.labels.shift(); } H.idx = H.stack.length - 1;
    S.project.modified = Date.now(); OC.bus.emit('changed', label); OC.bus.emit('history'); OC.render.invalidate(true);
  };
  function restore(i) {
    H.idx = i; const p = JSON.parse(H.stack[i]); p.assets = undefined; S.project = p; D.reindex(); D.layoutPages();
    if (S.pageIdx >= p.pages.length) S.pageIdx = p.pages.length - 1; S.sel = S.sel.filter(id => D.get(id)); S.editing = null; S.nodeEdit = null; S.cropEl = null;
    OC.text.clear(); OC.bus.emit('restored'); OC.bus.emit('changed', 'history'); OC.bus.emit('history'); OC.bus.emit('selection'); OC.render.invalidate(true);
  }
  H.undo = () => { if (H.idx > 0) restore(H.idx - 1); };
  H.redo = () => { if (H.idx < H.stack.length - 1) restore(H.idx + 1); };
  H.canUndo = () => H.idx > 0; H.canRedo = () => H.idx < H.stack.length - 1;

  /* keep component instances in sync with their master */
  function syncComponents() {
    const comps = S.project.components; if (!comps || !Object.keys(comps).length) return;
    D.allElements().forEach(e => {
      if (e.compRef && comps[e.compRef]) {
        if (e.compMaster) { comps[e.compRef].el = U.clone({ ...e, compMaster: false }); }
      }
    });
    D.allElements().forEach(e => {
      if (e.compRef && !e.compMaster && comps[e.compRef]) {
        const m = comps[e.compRef].el; const sig = JSON.stringify(m.children);
        if (e._sig !== sig && e.compSig !== sig) {
          const sx = e.w / m.w, sy = e.h / m.h; const kids = U.clone(m.children); relabel(kids); e.children = kids; e.compSig = sig;
          if (Math.abs(sx - 1) > 1e-3 || Math.abs(sy - 1) > 1e-3) scaleKids(e.children, sx, sy);
        }
      }
    });
  }
  function relabel(list) { list.forEach(c => { c.id = U.uid(); if (c.children) relabel(c.children); }); }
  function scaleKids(list, sx, sy) { list.forEach(c => { c.x *= sx; c.y *= sy; c.w *= sx; c.h *= sy; if (c.children) scaleKids(c.children, sx, sy); }); }
  OC.relabel = relabel;

  /* ---------- settings ---------- */
  const DEF = {
    mode: 'simple', theme: 'dark', accent: '#2563eb', radius: 10, density: 'comfortable', uiScale: 100, lang: 'en', sidebarSide: 'left', canvasBg: '',
    ai: { where: 'device', serverUrl: '', apiKey: '' }, translator: 'google', translatorUrl: '', snap: true, snapGrid: false, proportional: true, autosave: true, keymap: 'opencanvas', keys: {},
    registries: ['community/registry.json'], safeApps: true, showTips: true, showRulers: false, wheel: 'pan', checker: true
  };
  const SET = OC.settings = Object.assign({}, DEF, OC.ls.get('settings', {}));
  SET.ai = Object.assign({}, DEF.ai, SET.ai);
  SET.set = function (k, v) { const p = k.split('.'); let o = SET; while (p.length > 1) o = o[p.shift()]; o[p[0]] = v; OC.ls.set('settings', SET.plain()); OC.bus.emit('settings', k); SET.apply(); };
  SET.plain = () => { const o = {}; Object.keys(DEF).forEach(k => o[k] = SET[k]); return o; };
  SET.apply = function () {
    const r = document.documentElement; let theme = SET.theme; if (theme === 'system') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    r.dataset.theme = theme; r.style.setProperty('--accent', SET.accent); r.style.setProperty('--radius', SET.radius + 'px'); r.dataset.density = SET.density; r.style.fontSize = (SET.uiScale / 100 * 14) + 'px';
    const rgb = U.parseColor(SET.accent); r.style.setProperty('--accent-soft', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.16)`); r.style.setProperty('--accent-text', U.lum(SET.accent) > .6 ? '#111' : '#fff');
    r.dataset.side = SET.sidebarSide; r.dir = ['ar', 'he', 'fa', 'ur'].includes(SET.lang) ? 'rtl' : 'ltr';
    if (SET.canvasBg) r.style.setProperty('--canvas', SET.canvasBg); else r.style.removeProperty('--canvas');
  };

  /* ---------- commands and keys ---------- */
  const C = OC.cmd = { list: {}, groups: [] };
  C.register = function (id, label, keys, run, opts) { C.list[id] = Object.assign({ id, label, keys: keys || [], run }, opts || {}); };
  C.run = function (id, ...a) { const c = C.list[id]; if (!c) return; if (c.when && !c.when()) return; return c.run(...a); };
  const PRESETS = {
    opencanvas: {},
    canva: { text: ['t'], rect: ['r'], ellipse: ['c'], line: ['l'], pen: ['p'], pencil: ['d'], select: ['v'] },
    figma: { rect: ['r'], ellipse: ['o'], line: ['l'], pen: ['p'], pencil: ['shift+p'], text: ['t'], frame: ['f'], select: ['v'], flatten: ['mod+e'], exportDialog: ['mod+shift+e'] }
  };
  C.keysFor = function (id) { const c = C.list[id]; if (!c) return []; if (SET.keys[id]) return SET.keys[id]; const pre = PRESETS[SET.keymap] || {}; return pre[id] || c.keys; };
  C.format = function (combo) { return combo.split('+').map(k => ({ mod: U.isMac ? '⌘' : 'Ctrl', shift: U.isMac ? '⇧' : 'Shift', alt: U.isMac ? '⌥' : 'Alt', delete: 'Delete', backspace: '⌫', escape: 'Esc', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓' }[k] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)))).join(U.isMac ? '' : '+'); };
  C.firstKey = id => { const k = C.keysFor(id)[0]; return k ? C.format(k) : ''; };
  function combo(e) {
    let k = e.key.toLowerCase(); if (k === ' ') k = 'space'; if (e.code && /^(Digit|Key)/.test(e.code) && (e.altKey)) k = e.code.replace(/^(Digit|Key)/, '').toLowerCase();
    if (['control', 'shift', 'alt', 'meta'].includes(k)) return '';
    const parts = []; if (e.ctrlKey || e.metaKey) parts.push('mod'); if (e.altKey) parts.push('alt'); if (e.shiftKey && !(k.length === 1 && !/[a-z0-9]/.test(k) && !['[', ']'].includes(k))) parts.push('shift');
    if (e.shiftKey && (k === '{' || k === '}')) { k = k === '{' ? '[' : ']'; if (!parts.includes('shift')) parts.push('shift'); }
    if (k === '+') k = '='; if (k === '_') k = '-';
    parts.push(k); return parts.join('+');
  }
  C.combo = combo;
  C.pre = [];
  C.dispatch = function (e) {
    const t = e.target; const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const cb = combo(e); if (!cb) return;
    if (typing) { /* allow a few global ones */
      if (!/^mod\+(s|enter)$|^escape$/.test(cb)) return; if (t.isContentEditable && cb === 'mod+s') { } else if (cb === 'escape') return;
    }
    if (OC.ui && OC.ui.modalOpen && OC.ui.modalOpen() && cb !== 'escape') return;
    if (!typing || cb === 'escape') for (const f of C.pre) { try { if (f(e, cb)) { e.preventDefault(); e.stopImmediatePropagation(); return; } } catch (err) { console.error(err); } }
    for (const id in C.list) { const c = C.list[id]; if (c.scope && !c.scope()) continue; if (C.keysFor(id).includes(cb)) { if (c.when && !c.when()) continue; e.preventDefault(); c.run(e); return; } }
  };
  window.addEventListener('keydown', C.dispatch, true);
})();
