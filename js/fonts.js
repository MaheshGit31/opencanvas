/* Font library: Google fonts on demand, custom uploads, system fonts */
(function () {
  const U = OC.U;
  const G = (cat, names) => names.split(',').map(n => [n.trim(), cat]);
  const LIST = [
    ...G('Sans', 'Inter,Poppins,Montserrat,Roboto,Open Sans,Lato,Nunito,Raleway,Work Sans,DM Sans,Manrope,Outfit,Plus Jakarta Sans,Space Grotesk,Sora,Rubik,Karla,Barlow,Mulish,Figtree,Urbanist,Lexend,Archivo,Public Sans'),
    ...G('Serif', 'Playfair Display,Merriweather,Lora,DM Serif Display,Cormorant Garamond,Libre Baskerville,EB Garamond,Crimson Text,Bitter,Fraunces,Source Serif 4,Abril Fatface'),
    ...G('Display', 'Bebas Neue,Anton,Oswald,Righteous,Lobster,Fredoka,Bungee,Archivo Black,Alfa Slab One,Black Ops One,Monoton,Shrikhand,Rubik Mono One,Staatliches,Titan One,Chango'),
    ...G('Handwriting', 'Pacifico,Dancing Script,Caveat,Satisfy,Great Vibes,Sacramento,Permanent Marker,Kalam,Indie Flower,Shadows Into Light,Amatic SC,Yellowtail,Homemade Apple,Rock Salt'),
    ...G('Mono', 'JetBrains Mono,Fira Code,Space Mono,IBM Plex Mono,Source Code Pro,Roboto Mono,Inconsolata,VT323,Press Start 2P'),
    ...G('Indic and global', 'Noto Sans,Noto Serif,Noto Sans Telugu,Noto Sans Devanagari,Noto Sans Arabic,Noto Sans JP,Noto Sans KR,Noto Sans SC,Noto Sans Tamil,Noto Sans Bengali,Noto Sans Hebrew,Noto Sans Thai')
  ];
  const SYSTEM = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'system-ui'];
  const F = OC.fonts = { list: LIST, system: SYSTEM, custom: [], loaded: {}, loading: {} };

  F.all = () => [...F.custom.map(f => [f.name, 'Custom']), ...LIST, ...SYSTEM.map(n => [n, 'System'])];
  F.isCustom = n => F.custom.some(f => f.name === n);
  F.stack = n => `"${n}", ${/Mono|Code|Courier/.test(n) ? 'monospace' : /Serif|Garamond|Georgia|Times|Playfair|Merri|Lora|Baskerville|Bitter|Fraunces/.test(n) ? 'serif' : 'sans-serif'}`;

  F.ensure = function (name, weight, italic) {
    if (!name || SYSTEM.includes(name) || F.isCustom(name)) return true;
    if (F.loaded[name]) return true;
    if (F.loading[name]) return false;
    if (!LIST.some(l => l[0] === name)) return true;
    F.loading[name] = true;
    const fam = encodeURIComponent(name).replace(/%20/g, '+');
    const urls = [`https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,700&display=swap`, `https://fonts.googleapis.com/css2?family=${fam}:wght@400;700&display=swap`, `https://fonts.googleapis.com/css2?family=${fam}&display=swap`];
    const tryUrl = i => {
      if (i >= urls.length) { delete F.loading[name]; return; }
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = urls[i];
      l.onload = async () => {
        try { await Promise.all([document.fonts.load(`400 20px "${name}"`), document.fonts.load(`700 20px "${name}"`)]); } catch (e) { }
        F.loaded[name] = true; delete F.loading[name]; OC.text && OC.text.clear(); OC.render && OC.render.invalidate(true); OC.bus.emit('font-loaded', name);
      };
      l.onerror = () => { l.remove(); tryUrl(i + 1); };
      document.head.append(l);
    };
    tryUrl(0);
    return false;
  };
  F.preloadMany = names => names.forEach(n => F.ensure(n));

  /* custom fonts */
  F.addCustom = async function (file) {
    const buf = await U.readFile(file, 'buffer');
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    await F._register(name, buf);
    const rec = { name, buf, added: Date.now() };
    await OC.db.set('kv', 'font:' + name, rec);
    OC.bus.emit('fonts-changed'); return name;
  };
  F._register = async function (name, buf) {
    if (F.custom.some(f => f.name === name)) return;
    const face = new FontFace(name, buf); await face.load(); document.fonts.add(face); F.custom.push({ name });
  };
  F.removeCustom = async function (name) { F.custom = F.custom.filter(f => f.name !== name); await OC.db.del('kv', 'font:' + name); OC.bus.emit('fonts-changed'); };
  F.restoreCustom = async function () {
    const keys = (await OC.db.keys('kv')).filter(k => String(k).startsWith('font:'));
    for (const k of keys) { const r = await OC.db.get('kv', k); try { await F._register(r.name, r.buf); } catch (e) { console.warn('font fail', k); } }
    OC.bus.emit('fonts-changed');
  };
  /* embed custom fonts used by a project so bundles stay portable */
  F.exportUsed = async function (names) { const out = {}; for (const n of names) if (F.isCustom(n)) { const r = await OC.db.get('kv', 'font:' + n); if (r) out[n] = r.buf; } return out; };
})();
