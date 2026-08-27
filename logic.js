({
  VERSION: '2026-08-28-01',

  fixtures: [
    {
      name: '2026-08-26_mcdonalds',
      lines: ['◎合計+13分(+1.2km)', 'マクドナルド 立川立飛店', '立川市柏町4丁目5-29', '→ 返却配送対象'],
      expected: { store: 'マクドナルド 立川立飛店', address: '立川市柏町4丁目5-29' }
    },
    {
      name: '2026-08-26_gusto',
      lines: ['◎合計18分(2.7km)', 'ガスト 国立駅前店 Gusto Kunitachi', 'Ekimae', '国分寺市光町1丁目49-アットイー', 'ス', '承諾'],
      expected: { store: 'ガスト 国立駅前店 Gusto Kunitachi Ekimae', address: '国分寺市光町1丁目49-アットイース' }
    },
    {
      name: '2026-08-26_musashino',
      lines: ['◎合計28分(4.9km)', 'むさしの森珈琲 国立富士見台店', 'Musashino Mori Coffee', 'Kunitachi Fujimidai', '府中市宮西町5丁目11-関田コ', '一求', '承諾'],
      expected: { store: 'むさしの森珈琲 国立富士見台店 Musashino Mori Coffee Kunitachi Fujimidai', address: '府中市宮西町5丁目11-関田コ一求' }
    },
    {
      name: '2026-08-27_yataizushi',
      lines: ['◎合計12分（1.6km）', '◎', 'や台ずし 立川曙町', '立川市曙町2丁目42-23桜乃', '承諾', 'フ', 'ーデン'],
      expected: { store: 'や台ずし 立川曙町', address: '立川市曙町2丁目42-23桜乃' }
    },
    {
      name: '2026-08-27_mcd_isetan',
      lines: ['◎ 合計17分 （21km）', 'マクドナルド 立川伊勢丹前店', '立川市高松町2丁目2 3-3', 'AZEST立】I', 's 返却配送対象', 'コマップ', '承諾'],
      expected: { store: 'マクドナルド 立川伊勢丹前店', address: '立川市高松町2丁目2 3-3AZEST立】I' }
    },
    {
      name: '2026-08-27_ruroufan',
      lines: ['◎合計+8分（+0.9km）', '台湾夜市のルーローハン 立川キッチン', '昭島市東町4丁目1-ハイム藤戸', '承諾'],
      expected: { store: '台湾夜市のルーローハン 立川キッチン', address: '昭島市東町4丁目1-ハイム藤戸' }
    },
    {
      name: '2026-08-27_katsuya',
      lines: ['◎合計21分（1.1km）', 'かつや立川北口 Katsuya', 'Tachikawa Kita', '立川市曙町3丁目2-17', '承諾'],
      expected: { store: 'かつや立川北口 Katsuya Tachikawa Kita', address: '立川市曙町3丁目2-17' }
    },
    {
      name: '2026-08-28_hinoya',
      lines: ['◎合計33分（6.5km）', '日乃屋カレー立川北口店', 'Hinoya curry Tachikawa', 'Kitaguchiten', '日野市神明4丁目20-アルカディ', '■', '承諾'],
      expected: { store: '日乃屋カレー立川北口店 Hinoya curry Tachikawa Kitaguchiten', address: '日野市神明4丁目20-アルカディ' }
    },
    {
      name: '2026-08-28_yutou',
      lines: ['◎合計25分（3.3km）', '日本油党新宿東南口支部', '渋谷区本町1丁目28-5', '申込み', '都道423号', '423', '246'],
      expected: { store: '日本油党新宿東南口支部', address: '渋谷区本町1丁目28-5' }
    }
  ],

  _looksLikeAddressStart: function (s) {
    if (/[都道府県]?.{1,6}[市区町村].*[0-9０-９]/.test(s)) return true;
    if (/[0-9０-９]+丁目/.test(s)) return true;
    return false;
  },

  _isBoundary: function (s) {
    if (/(承諾|キャンセル|完了|返却配送対象|申込み)/.test(s)) return true;
    if (/^→/.test(s)) return true;
    return false;
  },

  _isNoise: function (s) {
    if (/^[◎●○\s]*$/.test(s)) return true;
    return false;
  },

  parse: function (text) {
    var L = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    return this._parseLines(L);
  },

  _parseLines: function (L) {
    var self = this;
    var idx = -1;
    for (var i = 0; i < L.length; i++) {
      if (/km[)）]/.test(L[i])) { idx = i; break; }
    }
    if (idx < 0) return { lines: L, store: '', address: '' };

    var i = idx + 1;
    var storeParts = [];
    while (i < L.length) {
      var s = L[i];
      if (self._isNoise(s)) { i++; continue; }
      if (self._looksLikeAddressStart(s) || self._isBoundary(s)) break;
      storeParts.push(s);
      i++;
    }
    var addrParts = [];
    while (i < L.length) {
      var t = L[i];
      if (self._isBoundary(t) || self._isNoise(t)) break;
      addrParts.push(t);
      i++;
    }

    return {
      lines: L,
      store: storeParts.join(' ').trim(),
      address: addrParts.join('').trim().replace(/[■□◆◇○●]+$/, '')
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