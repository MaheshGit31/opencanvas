/* Export: images, vector, documents, video, bundles */
(function () {
  const U = OC.U, h = U.h, S = OC.S, D = OC.doc, UI = OC.ui, R = OC.render;
  const T = s => OC.t(s); const X = OC.exporter = {};

  /* ---------- binary helpers ---------- */
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8, c = 0xFFFFFFFF) => { for (let i = 0; i < u8.length; i++) c = crcT[(c ^ u8[i]) & 255] ^ (c >>> 8); return c; };
  const enc = new TextEncoder();
  const u8 = x => typeof x === 'string' ? enc.encode(x) : x instanceof Uint8Array ? x : new Uint8Array(x);
  const cat = parts => { let n = 0; parts.forEach(p => n += p.length); const o = new Uint8Array(n); let i = 0; parts.forEach(p => { o.set(p, i); i += p.length; }); return o; };
  const blobBytes = async b => new Uint8Array(await b.arrayBuffer());
  X.zip = function (files) { // files: [{name, data(Uint8Array|string)}], store only
    const local = [], central = []; let off = 0; const dt = new Date(), time = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1), date = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
    files.forEach(f => {
      const d = u8(f.data), name = enc.encode(f.name), crc = (crc32(d) ^ 0xFFFFFFFF) >>> 0; const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      local.push(new Uint8Array(lh.buffer), name, d);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name); off += 30 + name.length + d.length;
    });
    const cl = central.reduce((a, b) => a + b.length, 0); const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cl, true); end.setUint32(16, off, true);
    return new Blob([cat([...local, ...central, new Uint8Array(end.buffer)])], { type: 'application/zip' });
  };
  function pngDpi(bytes, dpi) { // insert pHYs after IHDR
    const ppm = Math.round(dpi / 0.0254); const d = new DataView(new ArrayBuffer(21)); d.setUint32(0, 9); d.setUint8(4, 0x70); d.setUint8(5, 0x48); d.setUint8(6, 0x59); d.setUint8(7, 0x73); d.setUint32(8, ppm); d.setUint32(12, ppm); d.setUint8(16, 1); const body = new Uint8Array(d.buffer, 4, 13); d.setUint32(17, (crc32(body) ^ 0xFFFFFFFF) >>> 0);
    return cat([bytes.slice(0, 33), new Uint8Array(d.buffer), bytes.slice(33)]);
  }
  function jpgDpi(bytes, dpi) { if (bytes[2] === 0xFF && bytes[3] === 0xE0) { const b = bytes.slice(); b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255; return b; } return bytes; }
  const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
  const opaque = (c, bg = '#ffffff') => { const o = U.newCanvas(c.width, c.height), g = o.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, o.width, o.height); g.drawImage(c, 0, 0); return o; };

  /* ---------- encoders ---------- */
  function bmp(c) { const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data, row = W * 4, size = 54 + row * H; const b = new DataView(new ArrayBuffer(size)); b.setUint16(0, 0x4D42, true); b.setUint32(2, size, true); b.setUint32(10, 54, true); b.setUint32(14, 40, true); b.setInt32(18, W, true); b.setInt32(22, H, true); b.setUint16(26, 1, true); b.setUint16(28, 32, true); b.setUint32(34, row * H, true); b.setInt32(38, 2835, true); b.setInt32(42, 2835, true); let o = 54; for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; b.setUint8(o++, d[i + 2]); b.setUint8(o++, d[i + 1]); b.setUint8(o++, d[i]); b.setUint8(o++, d[i + 3]); } return new Blob([b.buffer], { type: 'image/bmp' }); }
  function tiff(c) { const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data; const n = W * H * 4, ifdOff = 8 + n, entries = 11; const buf = new DataView(new ArrayBuffer(ifdOff + 2 + entries * 12 + 4 + 8 + 6)); buf.setUint16(0, 0x4949, true); buf.setUint16(2, 42, true); buf.setUint32(4, ifdOff, true); new Uint8Array(buf.buffer).set(d, 8);
    let p = ifdOff; buf.setUint16(p, entries, true); p += 2; const ent = (tag, type, cnt, val) => { buf.setUint16(p, tag, true); buf.setUint16(p + 2, type, true); buf.setUint32(p + 4, cnt, true); if (type === 3 && cnt === 1) buf.setUint16(p + 8, val, true); else buf.setUint32(p + 8, val, true); p += 12; }; const extra = ifdOff + 2 + entries * 12 + 4;
    ent(256, 4, 1, W); ent(257, 4, 1, H); ent(258, 3, 4, extra); ent(259, 3, 1, 1); ent(262, 3, 1, 2); ent(273, 4, 1, 8); ent(277, 3, 1, 4); ent(278, 4, 1, H); ent(279, 4, 1, n); ent(284, 3, 1, 1); ent(338, 3, 1, 2); buf.setUint32(p, 0, true); for (let i = 0; i < 4; i++) buf.setUint16(extra + i * 2, 8, true);
    return new Blob([buf.buffer], { type: 'image/tiff' }); }
  async function ico(c) { const sizes = [16, 32, 48, 64, 128, 256]; const imgs = []; for (const s of sizes) { const t = U.newCanvas(s, s); const g = t.getContext('2d'); const k = Math.min(s / c.width, s / c.height); g.drawImage(c, (s - c.width * k) / 2, (s - c.height * k) / 2, c.width * k, c.height * k); imgs.push(await blobBytes(await toBlob(t, 'image/png'))); } const head = new DataView(new ArrayBuffer(6 + 16 * sizes.length)); head.setUint16(2, 1, true); head.setUint16(4, sizes.length, true); let off = head.byteLength; sizes.forEach((s, i) => { const p = 6 + i * 16; head.setUint8(p, s === 256 ? 0 : s); head.setUint8(p + 1, s === 256 ? 0 : s); head.setUint16(p + 4, 1, true); head.setUint16(p + 6, 32, true); head.setUint32(p + 8, imgs[i].length, true); head.setUint32(p + 12, off, true); off += imgs[i].length; }); return new Blob([head.buffer, ...imgs], { type: 'image/x-icon' }); }
  X.gif = function (frames, delayMs, loop = true) { // frames: canvases
    const W = frames[0].width, H = frames[0].height; const out = []; const w16 = v => [v & 255, v >> 8 & 255]; out.push(...enc.encode('GIF89a'), ...w16(W), ...w16(H), 0xF7, 0, 0);
    const pal = []; for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) pal.push(r * 51, Math.round(g * 255 / 6), b * 51); while (pal.length < 256 * 3) pal.push(0); out.push(...pal);
    if (loop) out.push(0x21, 0xFF, 11, ...enc.encode('NETSCAPE2.0'), 3, 1, 0, 0, 0);
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    frames.forEach(fr => {
      const d = fr.getContext('2d').getImageData(0, 0, W, H).data; const idx = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i + 3] < 128) { idx[y * W + x] = 252; continue; } const t = (bayer[y & 3][x & 3] / 16 - .5) * 36; const r = Math.round(U.clamp(d[i] + t, 0, 255) / 51), g = Math.round(U.clamp(d[i + 1] + t, 0, 255) / 255 * 6), b = Math.round(U.clamp(d[i + 2] + t, 0, 255) / 51); idx[y * W + x] = r * 42 + g * 6 + b; }
      out.push(0x21, 0xF9, 4, 0x09, ...w16(Math.round(delayMs / 10)), 252, 0); out.push(0x2C, 0, 0, 0, 0, ...w16(W), ...w16(H), 0, 8); // lzw
      const data = lzw(idx, 8); for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(data[i + j]); } out.push(0);
    }); out.push(0x3B); return new Blob([new Uint8Array(out)], { type: 'image/gif' });
  };
  function lzw(idx, minCode) {
    const clear = 1 << minCode, eoi = clear + 1; let size = minCode + 1, next = eoi + 1, dict = new Map(); const bytes = []; let cur = 0, bits = 0; const emit = c => { cur |= c << bits; bits += size; while (bits >= 8) { bytes.push(cur & 255); cur >>= 8; bits -= 8; } };
    emit(clear); let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) { const k = idx[i], key = prefix * 4096 + k; const f = dict.get(key); if (f !== undefined) prefix = f; else { emit(prefix); if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; } prefix = k; } }
    emit(prefix); emit(eoi); if (bits > 0) bytes.push(cur & 255); return bytes;
  }

  /* ---------- PDF ---------- */
  async function pdf(pages, o) { // pages: [{canvas, w, h, links}]
    const objs = []; const add = d => { objs.push(d); return objs.length; }; const parts = []; let len = 0; const offs = []; const push = d => { const b = typeof d === 'string' ? enc.encode(d) : d; parts.push(b); len += b.length; };
    objs.push(null); objs.push(null); const kids = []; const imgObjs = []; const jpgs = [];
    for (const p of pages) { const cv = opaque(p.canvas); const jb = await blobBytes(await toBlob(cv, 'image/jpeg', o.quality)); jpgs.push({ b: jb, w: cv.width, h: cv.height }); }
    const info = add(`<< /Title (${(S.project.name || 'Design').replace(/[()\\]/g, '')}) /Producer (OpenCanvas) >>`);
    pages.forEach((p, i) => {
      const J = jpgs[i]; const imgN = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${J.w} /Height ${J.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${J.b.length} >>`, stream: J.b }); const W = p.w * .75, Hh = p.h * .75; const content = `q ${W} 0 0 ${Hh} 0 0 cm /Im0 Do Q`; const cn = add({ dict: `<< /Length ${content.length} >>`, stream: enc.encode(content) });
      const annots = (p.links || []).map(l => add(`<< /Type /Annot /Subtype /Link /Rect [${l.x * .75} ${Hh - (l.y + l.h) * .75} ${(l.x + l.w) * .75} ${Hh - l.y * .75}] /Border [0 0 0] /A << /S /URI /URI (${l.url.replace(/[()\\]/g, '')}) >> >>`));
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${Hh}] /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${cn} 0 R ${annots.length ? '/Annots [' + annots.map(a => a + ' 0 R').join(' ') + ']' : ''} >>`));
    });
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>'; objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); objs.forEach((ob, i) => { offs.push(len); push(`${i + 1} 0 obj\n`); if (typeof ob === 'string') push(ob); else { push(ob.dict + '\nstream\n'); push(ob.stream); push('\nendstream'); } push('\nendobj\n'); });
    const xr = len; push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`); offs.forEach(o2 => push(String(o2).padStart(10, '0') + ' 00000 n \n')); push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xr}\n%%EOF`);
    return new Blob([cat(parts)], { type: 'application/pdf' });
  }

  /* ---------- SVG ---------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  async function toSVG(page, o) {
    const defs = []; let n = 0; const b = page.infinite ? padBounds(D.boundsOf(page.elements), 40) : { x: 0, y: 0, w: page.w, h: page.h }; const body = [];
    const fillAttr = (fills, w, hh) => { const f = (fills || []).filter(x => x.visible !== false)[0]; if (!f) return 'fill="none"'; if (f.type === 'solid') return `fill="${f.color}" fill-opacity="${f.opacity == null ? 1 : f.opacity}"`; if (f.type === 'linear' || f.type === 'radial') { const id = 'g' + (++n); const st = f.stops.map(s => `<stop offset="${s.o}" stop-color="${s.c}"/>`).join(''); if (f.type === 'linear') { const a = ((f.angle || 0) - 90) * Math.PI / 180, dx = Math.cos(a) / 2, dy = Math.sin(a) / 2; defs.push(`<linearGradient id="${id}" x1="${.5 - dx}" y1="${.5 - dy}" x2="${.5 + dx}" y2="${.5 + dy}">${st}</linearGradient>`); } else defs.push(`<radialGradient id="${id}" cx="${f.cx == null ? .5 : f.cx}" cy="${f.cy == null ? .5 : f.cy}" r=".5">${st}</radialGradient>`); return `fill="url(#${id})"`; } return 'fill="#cccccc"'; };
    const strokeAttr = e => e.stroke && e.stroke.width > 0 ? `stroke="${e.stroke.color}" stroke-width="${e.stroke.width}" stroke-linecap="${e.stroke.cap || 'butt'}" stroke-linejoin="${e.stroke.join || 'miter'}"${e.stroke.dash && e.stroke.dash.length ? ` stroke-dasharray="${e.stroke.dash.join(' ')}"` : ''} stroke-opacity="${e.stroke.opacity == null ? 1 : e.stroke.opacity}"` : '';
    const tf = e => { const cx = e.w / 2, cy = e.h / 2; return `translate(${e.x} ${e.y})${e.rot ? ` rotate(${e.rot} ${cx} ${cy})` : ''}${e.flipX || e.flipY ? ` translate(${cx} ${cy}) scale(${e.flipX ? -1 : 1} ${e.flipY ? -1 : 1}) translate(${-cx} ${-cy})` : ''}`; };
    const raster = async (e) => { const c = R.renderElements([{ ...U.clone(e), x: 0, y: 0, rot: 0 }], { scale: 2 }); const bb = D.boundsOf([{ ...e, x: 0, y: 0, rot: 0 }]); const bl = await toBlob(c, 'image/png'); const dataUrl = await U.readFile(bl); return `<image x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" href="${dataUrl}"/>`; };
    const el = async (e) => {
      if (e.hidden) return ''; const op = e.opacity == null || e.opacity === 1 ? '' : ` opacity="${e.opacity}"`; const g0 = `<g transform="${tf(e)}"${op}>`; let inner = '';
      const complex = (e.shadows || []).some(s => s.visible !== false) || e.blur || (e.blend && e.blend !== 'normal') || e.mask;
      if (complex || e.type === 'scene3d' || e.type === 'video' || e.type === 'audio') return e.type === 'audio' ? '' : g0 + await raster(e) + '</g>';
      switch (e.type) {
        case 'rect': inner = `<rect width="${e.w}" height="${e.h}" rx="${Math.min(e.radius || 0, e.w / 2, e.h / 2)}" ${fillAttr(e.fills)} ${strokeAttr(e)}/>`; break;
        case 'ellipse': inner = `<ellipse cx="${e.w / 2}" cy="${e.h / 2}" rx="${e.w / 2}" ry="${e.h / 2}" ${fillAttr(e.fills)} ${strokeAttr(e)}/>`; break;
        case 'polygon': case 'star': case 'path': inner = `<path d="${OC.vec.svgD(e.type === 'path' ? e : OC.vec.toPathEl(e))}" fill-rule="evenodd" ${fillAttr(e.fills)} ${strokeAttr(e)}/>`; break;
        case 'line': inner = `<line x1="0" y1="0" x2="${e.w}" y2="0" ${strokeAttr(e) || 'stroke="#000" stroke-width="2"'}/>`; break;
        case 'image': { const img = OC.assets.img(e.src); const am = e.src && e.src.startsWith('asset:') ? OC.assets.map[e.src.slice(6)] : null; const url = am ? await U.readFile(am.blob) : OC.assets.url(e.src); const r = R.fitRect(img ? img.naturalWidth : e.w, img ? img.naturalHeight : e.h, e.w, e.h, e.fit, e.crop); const id = 'c' + (++n); defs.push(`<clipPath id="${id}"><rect width="${e.w}" height="${e.h}" rx="${e.radius || 0}"/></clipPath>`); if (e.adj && Object.keys(e.adj).length) return `<g transform="translate(${e.x} ${e.y})"${op}>${await raster(e)}</g>`; inner = `<g clip-path="url(#${id})"><image x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" preserveAspectRatio="none" href="${url}"/></g>`; break; }
        case 'text': { const lay = OC.text.layout(e); inner = ''; const fill = (e.fills && e.fills[0] && e.fills[0].type === 'solid') ? e.fills[0] : { color: '#000', opacity: 1 }; if (e.curve) return `<g transform="translate(${e.x} ${e.y})"${op}>${await raster(e)}</g>`; lay.lines.forEach(L => L.parts.forEach(p => { const st = p.style || {}; inner += `<text x="${p.x}" y="${L.base}" font-family="${esc(OC.fonts.stack(st.ff || e.ff))}" font-size="${st.fs || e.fs}" font-weight="${st.fw || e.fw}" font-style="${(st.it || e.it) ? 'italic' : 'normal'}" fill="${st.color || fill.color}" fill-opacity="${fill.opacity == null ? 1 : fill.opacity}" xml:space="preserve"${(st.ul || e.ul) ? ' text-decoration="underline"' : ''}>${esc(p.t)}</text>`; })); break; }
        case 'group': case 'frame': { let kids = ''; for (const c of e.children || []) kids += await el(c); if (e.type === 'frame') { const id = 'f' + (++n); defs.push(`<clipPath id="${id}"><rect width="${e.w}" height="${e.h}" rx="${e.radius || 0}"/></clipPath>`); inner = `<rect width="${e.w}" height="${e.h}" rx="${e.radius || 0}" ${fillAttr(e.fills)} ${strokeAttr(e)}/><g clip-path="url(#${id})">${kids}</g>`; } else inner = kids; break; }
        default: return '';
      }
      return g0 + inner + '</g>';
    };
    const bg = page.bg || { type: 'solid', color: '#fff' }; if (!o.transparent && !page.infinite) { if (bg.type === 'solid') body.push(`<rect x="0" y="0" width="${page.w}" height="${page.h}" fill="${bg.color}"/>`); else if (bg.type === 'linear' || bg.type === 'radial') body.push(`<rect width="${page.w}" height="${page.h}" ${fillAttr([{ ...bg, opacity: 1 }])}/>`); else body.push(`<image width="${page.w}" height="${page.h}" href="${await U.readFile(await toBlob(R.renderPage({ ...page, elements: [] }, { scale: 1 }), 'image/png'))}"/>`); } else if (page.infinite && !o.transparent) body.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${page.bg && page.bg.color || '#fff'}"/>`);
    for (const e of page.elements) body.push(await el(e));
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${b.w}" height="${b.h}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
  }
  const padBounds = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + p * 2, h: b.h + p * 2 });

  /* ---------- PPTX (page images) ---------- */
  async function pptx(canvases, pages) {
    const files = []; const emu = v => Math.round(v * 9525); const W = emu(pages[0].w), H = emu(pages[0].h); const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    files.push({ name: '[Content_Types].xml', data: xml + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${canvases.map((c, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>` });
    files.push({ name: '_rels/.rels', data: xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>' });
    files.push({ name: 'ppt/presentation.xml', data: xml + `<p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${canvases.map((c, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>` });
    files.push({ name: 'ppt/_rels/presentation.xml.rels', data: xml + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${canvases.map((c, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>` });
    const tree = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>';
    files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: xml + `<p:sldMaster ${ns}>${tree}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>` });
    files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>' });
    files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: xml + `<p:sldLayout ${ns} type="blank">${tree}</p:sldLayout>` });
    files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>' });
    files.push({ name: 'ppt/theme/theme1.xml', data: xml + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="OpenCanvas"><a:themeElements><a:clrScheme name="OC"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1C1C28"/></a:dk2><a:lt2><a:srgbClr val="F4F4F7"/></a:lt2><a:accent1><a:srgbClr val="7C5CFF"/></a:accent1><a:accent2><a:srgbClr val="FF5D8F"/></a:accent2><a:accent3><a:srgbClr val="00C2A8"/></a:accent3><a:accent4><a:srgbClr val="FFB020"/></a:accent4><a:accent5><a:srgbClr val="38B6FF"/></a:accent5><a:accent6><a:srgbClr val="FF914D"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="OC"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="OC"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>' });
    for (let i = 0; i < canvases.length; i++) {
      const pg = pages[i]; const notes = ''; files.push({ name: `ppt/media/image${i + 1}.png`, data: await blobBytes(await toBlob(canvases[i], 'image/png')) });
      files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: xml + `<p:sld ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide ${i + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld></p:sld>` });
      files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: xml + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.png"/></Relationships>` });
    }
    const z = X.zip(files); return new Blob([z], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  /* ---------- page rendering ---------- */
  function pageCanvas(page, o) {
    const s = o.scale || 1; const bg = o.transparent ? null : '#ffffff';
    if (page.infinite) { const b = padBounds(D.boundsOf(page.elements), 40); if (!isFinite(b.w) || !page.elements.length) return U.newCanvas(800 * s, 600 * s); const c = U.newCanvas(Math.ceil(b.w * s), Math.ceil(b.h * s)); const g = c.getContext('2d'); g._noClamp = true; g.scale(s, s); g.translate(-b.x, -b.y); if (!o.transparent) { g.fillStyle = (page.bg && page.bg.color) || '#fff'; g.fillRect(b.x, b.y, b.w, b.h); } R.drawElements(g, page.elements, { scale: s, noSync: true, page, t: o.t }); return c; }
    return R.renderPage(page, { scale: s, transparent: o.transparent, t: o.t });
  }
  X.pageCanvas = pageCanvas;
  function selectedCanvas(els, o) { return R.renderElements(els, { scale: o.scale || 1, bg: o.transparent ? null : null, pad: 0 }); }
  function linksOf(page) { const out = []; const walk = (list, ox = 0, oy = 0) => list.forEach(e => { if (e.link) { const b = D.boundsOf([e]); out.push({ x: b.x, y: b.y, w: b.w, h: b.h, url: e.link }); } if (e.children && e.type !== 'frame') walk(e.children); }); walk(page.elements); return out; }
  const parseRange = (str, n) => { const set = new Set(); String(str || '').split(',').forEach(p => { const m = p.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (m) { const a = +m[1], b = m[2] ? +m[2] : a; for (let i = Math.max(1, a); i <= Math.min(n, b); i++) set.add(i - 1); } }); return [...set].sort((a, b) => a - b); };

  /* ---------- video ---------- */
  async function recordVideo(page, o, onProg) {
    const W = Math.round(page.w * o.scale), Hh = Math.round(page.h * o.scale); const c = U.newCanvas(W, Hh), g = c.getContext('2d'); g._noClamp = true; const stream = c.captureStream(o.fps);
    let actx = null; if (window.AudioContext) { try { actx = new AudioContext(); const dest = actx.createMediaStreamDestination(); const srcs = [...OC.media.audioElements(), ...OC.media.videoElements()]; srcs.forEach(m => { try { const s = actx.createMediaElementSource(m); s.connect(dest); } catch (e) { } }); if (srcs.length) dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); } catch (e) { actx = null; } }
    const types = o.fmt === 'mp4' ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']; const mime = types.find(t => MediaRecorder.isTypeSupported(t)); if (!mime) throw new Error('Video recording is not supported here');
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.bitrate * 1e6 }); const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => { rec.onstop = r; }); const prevT = S.time, prevPlay = S.playing; S.playing = true; S.time = 0; rec.start(250); const t0 = performance.now(); if (actx) actx.resume();
    await new Promise(res => { const step = () => { const t = (performance.now() - t0) / 1000; if (t >= page.duration) { res(); return; } S.time = t; g.clearRect(0, 0, W, Hh); g.save(); g.scale(o.scale, o.scale); R.drawPage(g, page, { t, scale: o.scale, noSync: true, export: false }); g.restore(); onProg && onProg(t / page.duration); requestAnimationFrame(step); }; step(); });
    rec.stop(); await done; S.playing = prevPlay; S.time = prevT; OC.media.stopAll(); if (actx) actx.close(); return new Blob(chunks, { type: mime.split(';')[0] });
  }
  async function frames(page, o, onProg) {
    const n = Math.max(1, Math.round(page.duration * o.fps)); const out = []; for (let i = 0; i < n; i++) { const t = i / o.fps; await OC.media.seekAll(page, t); out.push(pageCanvas(page, { scale: o.scale, t, transparent: o.transparent })); onProg && onProg(i / n); if (i % 3 === 0) await new Promise(r => setTimeout(r)); } return out;
  }

  /* ---------- formats ---------- */
  const FORMATS = [
    { id: 'png', label: 'PNG', group: 'Image', hint: 'Best for web and transparency', ext: 'png', transp: true, dpi: true },
    { id: 'jpg', label: 'JPG', group: 'Image', hint: 'Small files for photos', ext: 'jpg', quality: true, dpi: true },
    { id: 'webp', label: 'WebP', group: 'Image', hint: 'Modern and compact', ext: 'webp', quality: true, transp: true },
    { id: 'avif', label: 'AVIF', group: 'Image', hint: 'Smallest, if your browser can', ext: 'avif', quality: true, transp: true },
    { id: 'gif', label: 'GIF', group: 'Image', hint: 'Animated, 256 colors', ext: 'gif', anim: true, transp: true },
    { id: 'bmp', label: 'BMP', group: 'Image', hint: 'Uncompressed', ext: 'bmp' },
    { id: 'tiff', label: 'TIFF', group: 'Image', hint: 'Uncompressed for print', ext: 'tif' },
    { id: 'ico', label: 'ICO', group: 'Image', hint: 'Favicons, all sizes', ext: 'ico' },
    { id: 'svg', label: 'SVG', group: 'Vector', hint: 'Editable vectors', ext: 'svg', transp: true },
    { id: 'pdf', label: 'PDF', group: 'Document', hint: 'Print ready with links', ext: 'pdf', quality: true, multi: true },
    { id: 'pptx', label: 'PowerPoint', group: 'Document', hint: 'One slide per page', ext: 'pptx', multi: true },
    { id: 'html', label: 'Web page', group: 'Document', hint: 'Standalone HTML', ext: 'html', multi: true },
    { id: 'mp4', label: 'MP4', group: 'Video', hint: 'Plays everywhere', ext: 'mp4', video: true },
    { id: 'webm', label: 'WebM', group: 'Video', hint: 'Open video format', ext: 'webm', video: true },
    { id: 'zip', label: 'ZIP of images', group: 'Bundle', hint: 'Every page as PNG', ext: 'zip', multi: true },
    { id: 'json', label: 'Project file', group: 'Bundle', hint: 'Open it again later', ext: 'opencanvas' }
  ];
  X.FORMATS = FORMATS;
  const supports = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; const memo = {}; return t => { if (t in memo) return memo[t]; return (memo[t] = c.toDataURL(t).startsWith('data:' + t)); }; })();
  const canVideo = f => typeof MediaRecorder !== 'undefined' && (f === 'mp4' ? MediaRecorder.isTypeSupported('video/mp4') || MediaRecorder.isTypeSupported('video/webm') : MediaRecorder.isTypeSupported('video/webm'));

  X.run = async function (o, onProg) {
    const proj = S.project; const f = FORMATS.find(x => x.id === o.fmt); const base = (proj.name || 'Design').replace(/[^\w\- ]+/g, '').trim() || 'Design';
    if (o.fmt === 'json') return { blob: new Blob([await OC.app.bundle()], { type: 'application/json' }), name: base + '.opencanvas' };
    let idxs = o.pages === 'all' ? proj.pages.map((p, i) => i) : o.pages === 'range' ? parseRange(o.range, proj.pages.length) : [S.pageIdx]; if (!idxs.length) idxs = [S.pageIdx];
    const pages = idxs.map(i => proj.pages[i]);
    if (o.selection) { const els = OC.sel.els(); if (!els.length) throw new Error('Nothing selected'); const c = selectedCanvas(els, o); return finishImage(c, o, base + '-selection'); }
    const suffix = i => pages.length > 1 ? '-' + (idxs[i] + 1) : '';
    if (f.video) { const blob = await recordVideo(pages[0], o, onProg); const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'; return { blob, name: base + '.' + ext }; }
    if (o.fmt === 'gif' && o.animated) { const fr = await frames(pages[0], { ...o, fps: Math.min(o.fps, 20), scale: Math.min(o.scale, 1) }, onProg); return { blob: X.gif(fr, 1000 / Math.min(o.fps, 20)), name: base + '.gif' }; }
    if (o.fmt === 'svg') { if (pages.length === 1) return { blob: new Blob([await toSVG(pages[0], o)], { type: 'image/svg+xml' }), name: base + '.svg' }; const files = []; for (let i = 0; i < pages.length; i++) files.push({ name: `${base}${suffix(i)}.svg`, data: await toSVG(pages[i], o) }); return { blob: X.zip(files), name: base + '-svg.zip' }; }
    const cans = pages.map((p, i) => { onProg && onProg(i / pages.length); return pageCanvas(p, o); });
    if (o.fmt === 'pdf') return { blob: await pdf(cans.map((c, i) => ({ canvas: c, w: pages[i].infinite ? c.width / o.scale : pages[i].w, h: pages[i].infinite ? c.height / o.scale : pages[i].h, links: pages[i].infinite ? [] : linksOf(pages[i]) })), { quality: o.quality }), name: base + '.pdf' };
    if (o.fmt === 'pptx') return { blob: await pptx(cans.map(c => c), pages.map((p, i) => ({ w: p.infinite ? cans[i].width / o.scale : p.w, h: p.infinite ? cans[i].height / o.scale : p.h }))), name: base + '.pptx' };
    if (o.fmt === 'html') { const imgs = []; for (const c of cans) imgs.push(await U.readFile(await toBlob(c, 'image/webp', .92))); const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(proj.name)}</title><style>body{margin:0;background:#16161d;display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px}img{max-width:100%;height:auto;box-shadow:0 8px 40px rgba(0,0,0,.4);background:#fff}</style></head><body>${imgs.map((u, i) => `<img src="${u}" alt="${esc(pages[i].title || 'Page ' + (i + 1))}">`).join('')}</body></html>`; return { blob: new Blob([html], { type: 'text/html' }), name: base + '.html' }; }
    if (o.fmt === 'zip') { const files = []; for (let i = 0; i < cans.length; i++) files.push({ name: `${base}${suffix(i)}.png`, data: await blobBytes(await toBlob(cans[i], 'image/png')) }); return { blob: X.zip(files), name: base + '.zip' }; }
    if (cans.length > 1) { const files = []; for (let i = 0; i < cans.length; i++) { const r = await finishImage(cans[i], o, base + suffix(i)); files.push({ name: r.name, data: await blobBytes(r.blob) }); } return { blob: X.zip(files), name: base + '.zip' }; }
    return finishImage(cans[0], o, base);
  };
  async function finishImage(c, o, name) {
    const q = o.quality; let blob, ext = o.fmt === 'jpg' ? 'jpg' : o.fmt;
    if (o.fmt === 'png') { blob = await toBlob(c, 'image/png'); if (o.dpi && o.dpi !== 96) blob = new Blob([pngDpi(await blobBytes(blob), o.dpi)], { type: 'image/png' }); }
    else if (o.fmt === 'jpg') { blob = await toBlob(opaque(c), 'image/jpeg', q); if (o.dpi && o.dpi !== 96) blob = new Blob([jpgDpi(await blobBytes(blob), o.dpi)], { type: 'image/jpeg' }); }
    else if (o.fmt === 'webp') blob = await toBlob(c, 'image/webp', q);
    else if (o.fmt === 'avif') { blob = await toBlob(c, 'image/avif', q); if (!blob || blob.type !== 'image/avif') { U.toast('AVIF is not supported here, saved as WebP'); blob = await toBlob(c, 'image/webp', q); ext = 'webp'; } }
    else if (o.fmt === 'bmp') blob = bmp(c); else if (o.fmt === 'tiff') { blob = tiff(c); ext = 'tif'; } else if (o.fmt === 'ico') blob = await ico(c); else if (o.fmt === 'gif') blob = X.gif([c], 100, false);
    else blob = await toBlob(c, 'image/png'); return { blob, name: name + '.' + ext };
  }
  X.quick = async function (els, fmt) { try { const c = R.renderElements(els, { scale: 2 }); const r = await finishImage(c, { fmt: fmt === 'jpeg' ? 'jpg' : fmt, quality: .92 }, (els[0].name || 'Layer').replace(/[^\w\- ]+/g, '')); U.download(r.blob, r.name); } catch (e) { U.toast('Could not export'); } };

  /* ---------- dialog ---------- */
  X.dialog = function (opts = {}) {
    if (!S.project) return; const proj = S.project; const st = Object.assign({ fmt: OC.ls.get('exportFmt', 'png'), scale: 1, pages: proj.pages.length > 1 ? 'all' : 'current', range: '', quality: .92, transparent: false, dpi: 96, fps: 30, bitrate: 8, animated: false, selection: !!opts.selection }, OC.ls.get('exportOpts', {}));
    st.selection = !!opts.selection; if (!proj.pages.some(p => p.duration) && FORMATS.find(f => f.id === st.fmt).video) st.fmt = 'png'; if (st.pages === 'all' && proj.pages.length < 2) st.pages = 'current';
    const body = h('div.export'); const pg = OC.page(); const m = UI.modal({ title: opts.selection ? 'Download selection' : 'Export', width: 760, body, actions: [] }); let busyEl = null;
    const draw = () => {
      body.textContent = ''; const f = FORMATS.find(x => x.id === st.fmt); const list = h('div.fmt-list'); const groups = {}; FORMATS.forEach(x => (groups[x.group] = groups[x.group] || []).push(x));
      Object.keys(groups).forEach(gr => { list.append(h('h5', T(gr))); groups[gr].forEach(x => { const dis = (x.video && !canVideo(x.id)) || (opts.selection && !['png', 'jpg', 'webp', 'avif', 'bmp', 'tiff', 'ico', 'gif'].includes(x.id)); list.append(h('button.fmt' + (x.id === st.fmt ? '.on' : '') + (dis ? '.dis' : ''), { disabled: dis, onclick: () => { st.fmt = x.id; draw(); } }, h('b', x.label), h('small', T(x.hint)))); }); });
      const w = pg.infinite ? Math.round(D.boundsOf(pg.elements).w + 80) : pg.w, hh = pg.infinite ? Math.round(D.boundsOf(pg.elements).h + 80) : pg.h; const sizeText = () => `${Math.round(w * st.scale)} × ${Math.round(hh * st.scale)} px`;
      const sz = h('span.muted', sizeText()); const right = h('div.fmt-opts');
      if (!['json', 'pptx', 'html', 'zip', 'svg', 'ico'].includes(st.fmt) || st.fmt === 'ico' || true) { if (!['json', 'svg'].includes(st.fmt)) right.append(UI.field('Size', h('div.col', UI.seg([1, 2, 3, 4].map(v => ({ v, label: v + '×' })), st.scale, v => { st.scale = v; sz.textContent = sizeText(); }), sz))); }
      if (proj.pages.length > 1 && f.id !== 'json' && !opts.selection && !f.video) { right.append(UI.field('Pages', h('div.col', UI.seg([{ v: 'current', label: 'This page' }, { v: 'all', label: 'All' }, { v: 'range', label: 'Some' }], st.pages, v => { st.pages = v; draw(); }), st.pages === 'range' ? h('input.input', { placeholder: '1-3, 5', value: st.range, onkeydown: e => e.stopPropagation(), oninput: e => { st.range = e.target.value; } }) : ''))); }
      if (f.quality) right.append(UI.field('Quality', UI.slider(st.quality, .3, 1, .01, v => { st.quality = v; }, null)));
      if (f.transp && !opts.selection) right.append(UI.field('Transparent background', UI.toggle(st.transparent, v => { st.transparent = v; })));
      if (f.dpi) right.append(UI.field('Print resolution', UI.select([[72, '72 dpi'], [96, '96 dpi screen'], [150, '150 dpi'], [300, '300 dpi print'], [600, '600 dpi']], st.dpi, v => { st.dpi = +v; })));
      if (f.video) { right.append(UI.field('Frame rate', UI.seg([24, 30, 60].map(v => ({ v, label: v + '' })), st.fps, v => { st.fps = v; })), UI.field('Quality', UI.select([[4, 'Good'], [8, 'High'], [16, 'Best']], st.bitrate, v => { st.bitrate = +v; })), h('p.muted.small', T('Records in real time. Keep this tab open until it finishes. Length ' + pg.duration + ' seconds'))); }
      if (f.id === 'gif') right.append(UI.field('Animated', UI.toggle(st.animated, v => { st.animated = v; })));
      if (f.id === 'pdf') right.append(h('p.muted.small', T('Links on your design stay clickable')));
      const prog = h('div.prog', h('i')); const go = UI.btn('Download', async () => { if (busyEl) return; OC.ls.set('exportFmt', st.fmt); OC.ls.set('exportOpts', { scale: st.scale, quality: st.quality, dpi: st.dpi, fps: st.fps, bitrate: st.bitrate }); busyEl = true; go.disabled = true; go.textContent = T('Working'); prog.classList.add('on'); try { const r = await X.run({ ...st, selection: opts.selection }, p => { prog.firstChild.style.width = Math.round(p * 100) + '%'; }); U.download(r.blob, r.name); U.toast('Saved ' + r.name); m.close(); } catch (e) { console.error(e); U.toast(e.message || 'Export failed'); busyEl = null; go.disabled = false; go.textContent = T('Download'); prog.classList.remove('on'); } }, { primary: true, cls: 'full' });
      right.append(h('span.grow'), prog, go); body.append(list, right);
    };
    draw();
  };
})();
