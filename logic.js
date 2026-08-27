({
  VERSION: '2026-08-27-01',

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
    },
    {
      name: '2026-08-26_gusto',
      lines: [
        '◎合計18分(2.7km)',
        'ガスト 国立駅前店 Gusto Kunitachi',
        'Ekimae',
        '国分寺市光町1丁目49-アットイー',
        'ス',
        '承諾'
      ],
      expected: { store: 'ガスト 国立駅前店 Gusto Kunitachi Ekimae', address: '国分寺市光町1丁目49-アットイース' }
    },
    {
      name: '2026-08-26_musashino',
      lines: [
        '◎合計28分(4.9km)',
        'むさしの森珈琲 国立富士見台店',
        'Musashino Mori Coffee',
        'Kunitachi Fujimidai',
        '府中市宮西町5丁目11-関田コ',
        '一求',
        '承諾'
      ],
      expected: { store: 'むさしの森珈琲 国立富士見台店 Musashino Mori Coffee Kunitachi Fujimidai', address: '府中市宮西町5丁目11-関田コ一求' }
    },
    {
      name: '2026-08-27_yataizushi',
      lines: [
        '◎合計12分(1.6km)',
        'や台ずし 立川曙町',
        '立川市曙町2丁目42-23桜乃',
        '承諾',
        'フ',
        '還年 至、目钮',
        'ーデン'
      ],
      expected: { store: 'や台ずし 立川曙町', address: '立川市曙町2丁目42-23桜乃' }
    }
  ],

  _looksLikeAddressStart: function (s) {
    return /(市|丁目|[0-9０-９]+-)/.test(s);
  },

  _isBoundary: function (s) {
    return /^(→|承諾|キャンセル|完了)/.test(s) || /^◎/.test(s);
  },

  parse: function (text) {
    var L = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    return this._parseLines(L);
  },

  _parseLines: function (L) {
    var self = this;
    var idx = -1;
    for (var i = 0; i < L.length; i++) {
      if (/km\)/.test(L[i]) || /^◎/.test(L[i])) { idx = i; break; }
    }
    if (idx < 0) return { lines: L, store: '', address: '' };

    var i = idx + 1;
    var storeParts = [];
    while (i < L.length && !self._looksLikeAddressStart(L[i]) && !self._isBoundary(L[i])) {
      storeParts.push(L[i]);
      i++;
    }
    var addrParts = [];
    while (i < L.length && !self._isBoundary(L[i])) {
      addrParts.push(L[i]);
      i++;
    }

    return {
      lines: L,
      store: storeParts.join(' ').trim(),
      address: addrParts.join('').trim()
    };
  },

  view: function (p) {
    if (!p.store || !p.address) {
      return '⚠️ 解析失敗 (v' + this.VERSION + ')\n' + p.lines.map(function (s, i) { return i + ': ' + s; }).join('\n');
    }
    return '🏪 ' + p.store + '\n📍 ' + p.address + '\n(v' + this.VERSION + ')';
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
        '\n   期待store: ' + r.expected.store +
        '\n   結果store: ' + r.got.store +
        '\n   期待addr : ' + r.expected.address +
        '\n   結果addr : ' + r.got.address);
    });
    return 'version: ' + this.VERSION + '\n' + pass + '/' + results.length + ' 件成功\n' + lines.join('\n');
  }
})
