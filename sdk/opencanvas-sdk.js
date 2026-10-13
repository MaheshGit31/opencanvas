/* OpenCanvas app SDK. Injected into every app. Use window.OpenCanvas */
(function () {
  var pending = {}, n = 0, handlers = { selection: [] }, last = [];
  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var id = ++n; pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ oc: 'rpc', id: id, method: method, args: args }, '*');
      setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('Timed out')); } }, 30000);
    });
  }
  addEventListener('message', function (e) {
    var m = e.data; if (!m) return;
    if (m.oc === 'res' && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; m.ok ? p.resolve(m.res) : p.reject(new Error(m.err)); }
    if (m.oc === 'event' && m.name === 'selection') { last = m.data; handlers.selection.forEach(function (f) { try { f(last); } catch (e) { console.error(e); } }); }
  });
  window.OpenCanvas = {
    version: 1,
    getSelection: function () { return call('selection.get'); },
    updateSelection: function (patches) { return call('selection.update', patches); },
    renderSelection: function (scale) { return call('selection.render', scale); },
    pageInfo: function () { return call('page.info'); },
    palette: function () { return call('palette.get'); },
    insertSVG: function (svg, name) { return call('insert', { svg: svg, name: name }); },
    insertImage: function (dataUrl, name) { return call('insert', { image: dataUrl, name: name }); },
    insertText: function (text, opts) { return call('insert', Object.assign({ text: text }, opts || {})); },
    insertElements: function (elements) { return call('insert', { elements: elements }); },
    get: function (key) { return call('storage.get', key); },
    set: function (key, value) { return call('storage.set', { k: key, v: value }); },
    toast: function (msg) { return call('toast', msg); },
    onSelection: function (fn) { handlers.selection.push(fn); if (last.length) fn(last); }
  };
})();
