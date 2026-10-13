/* OpenCanvas utilities */
/* make DOM append tolerant: flattens arrays, skips empty values */
(function () { const app = Element.prototype.append; Element.prototype.append = function (...a) { return app.apply(this, a.flat(Infinity).filter(x => x != null && x !== false)); }; })();
window.OC = window.OC || {};
(function () {
  const U = OC.U = {};
  U.uid = (p = 'e') => p + Math.random().toString(36).slice(2, 9);
  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  U.round = (v, d = 2) => { const m = 10 ** d; return Math.round(v * m) / m; };
  U.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.throttleRaf = fn => { let q = false, last; return (...a) => { last = a; if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(...last); }); }; };
  U.sleep = ms => new Promise(r => setTimeout(r, ms));
  U.isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  /* hyperscript: h('div.cls#id', {onclick}, children) */
  U.h = function (tag, attrs, ...kids) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
    const el = (tag.startsWith('svg:') ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4)) : document.createElement(m[1] || 'div'));
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs) )) { kids.unshift(attrs); attrs = null; }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') v.split(' ').forEach(c => c && el.classList.add(c));
      else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = k => { if (k == null || k === false) return; if (Array.isArray(k)) k.forEach(add); else el.append(k.nodeType ? k : document.createTextNode(String(k))); };
    kids.forEach(add);
    return el;
  };
  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* event bus */
  const L = {};
  OC.bus = {
    on(e, f) { (L[e] = L[e] || []).push(f); return () => this.off(e, f); },
    off(e, f) { L[e] = (L[e] || []).filter(x => x !== f); },
    emit(e, ...a) { (L[e] || []).slice().forEach(f => { try { f(...a); } catch (err) { console.error(e, err); } }); }
  };

  /* colors */
  let cctx;
  U.parseColor = function (c) {
    if (!cctx) cctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    cctx.fillStyle = '#000'; cctx.fillStyle = c;
    const s = cctx.fillStyle;
    if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
    const m = s.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m[3] == null ? 1 : m[3]];
  };
  U.toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  U.hex = c => { const p = U.parseColor(c); return U.toHex(p[0], p[1], p[2]); };
  U.rgba = (c, a) => { const p = U.parseColor(c); return `rgba(${p[0]},${p[1]},${p[2]},${U.round(p[3] * (a == null ? 1 : a), 3)})`; };
  U.lum = c => { const p = U.parseColor(c); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };
  U.mix = (a, b, t) => { const p = U.parseColor(a), q = U.parseColor(b); return U.toHex(U.lerp(p[0], q[0], t), U.lerp(p[1], q[1], t), U.lerp(p[2], q[2], t)); };
  U.hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return U.toHex(f(0) * 255, f(8) * 255, f(4) * 255); };
  U.toHsl = c => { let [r, g, b] = U.parseColor(c); r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s * 100, l * 100]; };

  /* files */
  U.download = function (blob, name) {
    if (!(blob instanceof Blob)) blob = new Blob([blob]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };
  U.readFile = (f, as = 'dataURL') => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[as === 'text' ? 'readAsText' : as === 'buffer' ? 'readAsArrayBuffer' : 'readAsDataURL'](f); });
  U.pickFile = (accept, multiple) => new Promise(res => {
    const i = U.h('input', { type: 'file', accept: accept || '', multiple: !!multiple, style: 'display:none' });
    i.onchange = () => { res(Array.from(i.files)); i.remove(); }; document.body.append(i); i.click();
  });
  U.loadImage = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  U.canvasBlob = (c, type = 'image/png', q = .92) => new Promise(r => c.toBlob(r, type, q));
  U.newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  U.loadScript = (() => { const done = {}; return src => done[src] || (done[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete done[src]; rej(new Error('Failed to load ' + src)); }; document.head.append(s); })); })();

  /* toast */
  U.toast = function (msg, ms = 2600) {
    let box = U.$('#toasts'); if (!box) { box = U.h('div#toasts'); document.body.append(box); }
    const t = U.h('div.toast', OC.t ? OC.t(msg) : msg); box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  };

  /* geometry */
  U.rotPt = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c }; };
  U.rad = d => d * Math.PI / 180;
  U.deg = r => r * 180 / Math.PI;

  /* IndexedDB key value store */
  const DB = OC.db = {
    _p: null,
    open() {
      if (!this._p) this._p = new Promise((res, rej) => {
        const r = indexedDB.open('opencanvas', 1);
        r.onupgradeneeded = () => { ['projects', 'assets', 'kv'].forEach(s => r.result.createObjectStore(s)); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      }).catch(e => { console.warn('IndexedDB unavailable', e); return null; });
      return this._p;
    },
    async tx(store, mode, fn) { const db = await this.open(); if (!db) return null; return new Promise((res, rej) => { const t = db.transaction(store, mode), s = t.objectStore(store), r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); },
    get: (s, k) => DB.tx(s, 'readonly', o => o.get(k)),
    set: (s, k, v) => DB.tx(s, 'readwrite', o => o.put(v, k)),
    del: (s, k) => DB.tx(s, 'readwrite', o => o.delete(k)),
    keys: s => DB.tx(s, 'readonly', o => o.getAllKeys()).then(r => r || []),
    all: async s => { const ks = await DB.keys(s), out = []; for (const k of ks) out.push([k, await DB.get(s, k)]); return out; }
  };

  /* local settings storage */
  OC.ls = {
    get(k, d) { try { const v = localStorage.getItem('oc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('oc.' + k, JSON.stringify(v)); } catch (e) { } }
  };
})();
