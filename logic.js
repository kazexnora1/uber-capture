({
  fixtures: [
    {
      name: '2026-08-26_mcdonalds',
      lines: [
        '◎合計+13分(+1.2km)',
        'マクドナルド 立川立飛店',
        '立川市柏町4丁目5-29',
        '→ 返却配送対象'
      ],
      expected: { store: 'マクドナルド 立川立飛店', address: '立川市柏町4丁目5-29' }
    }
  ],

  parse: function (text) {
    var L = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    return this._parseLines(L);
  },

  _parseLines: function (L) {
    var idx = -1;
    for (var i = 0; i < L.length; i++) {
      if (/km\)/.test(L[i]) || /^◎/.test(L[i])) { idx = i; break; }
    }
    return {
      lines: L,
      store: idx >= 0 ? (L[idx + 1] || '') : '',
      address: idx >= 0 ? (L[idx + 2] || '') : ''
    };
  },

  view: function (p) {
    if (!p.store || !p.address) {
      // 解析に失敗した時は、行番号付きの生データを自動表示（デバッグ用）
      return '⚠️ 解析失敗\n' + p.lines.map(function (s, i) { return i + ': ' + s; }).join('\n');
    }
    return '🏪 ' + p.store + '\n📍 ' + p.address;
  },

  selfTest: function () {
    var self = this;
    var results = this.fixtures.map(function (fx) {
      var p = self._parseLines(fx.lines);
      var ok = p.store === fx.expected.store && p.address === fx.expected.address;
      return { name: fx.name, ok: ok, got: p, expected: fx.expected };
    });
    var pass = results.filter(function (r) { return r.ok; }).length;
    var lines = results.map(function (r) {
      return (r.ok ? '✅ ' : '❌ ') + r.name + (r.ok ? '' :
        '\n   期待: ' + r.expected.store + ' / ' + r.expected.address +
        '\n   結果: ' + r.got.store + ' / ' + r.got.address);
    });
    return pass + '/' + results.length + ' 件成功\n' + lines.join('\n');
  }
})
