/* Languages: built in packs plus machine translation for the rest */
(function () {
  const U = OC.U;
  const I = OC.i18n = {
    packs: {}, cache: {}, pending: new Set(), busy: false,
    langs: [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ru', 'Русский'], ['uk', 'Українська'], ['tr', 'Türkçe'], ['ar', 'العربية'], ['he', 'עברית'], ['fa', 'فارسی'], ['hi', 'हिन्दी'], ['te', 'తెలుగు'], ['ta', 'தமிழ்'], ['bn', 'বাংলা'], ['mr', 'मराठी'], ['gu', 'ગુજરાતી'], ['kn', 'ಕನ್ನಡ'], ['ml', 'മലയാളം'], ['pa', 'ਪੰਜਾਬੀ'], ['ur', 'اردو'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['ja', '日本語'], ['ko', '한국어'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'], ['tl', 'Filipino'], ['sv', 'Svenska'], ['da', 'Dansk'], ['no', 'Norsk'], ['fi', 'Suomi'], ['cs', 'Čeština'], ['sk', 'Slovenčina'], ['hu', 'Magyar'], ['ro', 'Română'], ['bg', 'Български'], ['el', 'Ελληνικά'], ['hr', 'Hrvatski'], ['sr', 'Српски'], ['sw', 'Kiswahili'], ['af', 'Afrikaans'], ['ca', 'Català']],
    flush: U.debounce(() => I.run(), 350)
  };
  const lang = () => OC.settings.lang;
  OC.t = function (s) {
    const l = lang(); if (!s || l === 'en') return s;
    const p = I.packs[l]; if (p && p[s]) return p[s];
    const c = I.cache[l] || (I.cache[l] = OC.ls.get('tr.' + l, {})); if (c[s]) return c[s];
    if (OC.settings.translator !== 'none' && /[A-Za-z]/.test(s) && s.length < 160) { I.pending.add(s); I.flush(); }
    return s;
  };
  I.set = function (code) { OC.settings.set('lang', code); I.pending.clear(); OC.ui && OC.ui.refreshAll && OC.ui.refreshAll(); };
  async function mtBatch(texts, tl) {
    const prov = OC.settings.translator;
    if (prov === 'libre' && OC.settings.translatorUrl) {
      return Promise.all(texts.map(async t => { try { const r = await fetch(OC.settings.translatorUrl.replace(/\/$/, '') + '/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: t, source: 'en', target: tl.split('-')[0], format: 'text' }) }); return (await r.json()).translatedText; } catch (e) { return null; } }));
    }
    if (prov === 'mymemory') return Promise.all(texts.map(async t => { try { const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=en|${tl}`); return (await r.json()).responseData.translatedText; } catch (e) { return null; } }));
    /* google gtx, joined by newline */
    const out = []; let chunk = [], len = 0; const chunks = [];
    texts.forEach(t => { if (len + t.length > 1200 || chunk.length >= 25) { chunks.push(chunk); chunk = []; len = 0; } chunk.push(t); len += t.length + 3; }); if (chunk.length) chunks.push(chunk);
    for (const c of chunks) {
      let res = null; try { const q = c.map(x => x.replace(/\n/g, ' ')).join('\n'); const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${tl}&dt=t&q=${encodeURIComponent(q)}`); const j = await r.json(); const joined = j[0].map(x => x[0]).join(''); const parts = joined.split('\n'); if (parts.length === c.length) res = parts; } catch (e) { }
      if (!res) res = await Promise.all(c.map(async t => { try { const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${tl}&dt=t&q=${encodeURIComponent(t)}`); const j = await r.json(); return j[0].map(x => x[0]).join(''); } catch (e) { return null; } }));
      out.push(...res);
    }
    return out;
  }
  I.translateMany = async function (texts, tl) {
    tl = tl || lang(); if (tl === 'en') return texts.slice(); const uniq = [...new Set(texts)].filter(t => t && t.trim()); const res = await mtBatch(uniq, tl); const map = {}; uniq.forEach((t, i) => { map[t] = res[i]; });
    return texts.map(t => (t && t.trim() ? map[t] || t : t));
  };
  I.run = async function () {
    if (I.busy || !I.pending.size) return; I.busy = true; const l = lang(); const list = [...I.pending]; I.pending.clear();
    try { const res = await mtBatch(list, l); const c = I.cache[l] || (I.cache[l] = {}); let n = 0; list.forEach((t, i) => { if (res[i] && res[i] !== t) { c[t] = res[i]; n++; } }); OC.ls.set('tr.' + l, c); if (n && l === lang()) OC.ui && OC.ui.refreshAll && OC.ui.refreshAll(); } catch (e) { console.warn('translate failed', e); }
    I.busy = false; if (I.pending.size) I.flush();
  };
})();
