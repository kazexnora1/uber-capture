({
  DEBUG: true,

  parse: function (text) {
    var L = text.split('\n').map(function (s) { return s.trim(); }).filter(String);
    return { lines: L, store: '', address: '' };
  },

  view: function (p) {
    if (this.DEBUG) {
      return p.lines.map(function (s, i) { return i + ': ' + s; }).join('\n');
    }
    return '🏪 ' + (p.store || '不明') + '\n📍 ' + (p.address || '不明');
  }
})
