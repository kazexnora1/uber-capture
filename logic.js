({
  VERSION: '2026-08-28-06',

  _TOKYO_MUNICIPALITIES: [
    '千代田区','中央区','港区','新宿区','文京区','台東区','墨田区','江東区','品川区','目黒区',
    '大田区','世田谷区','渋谷区','中野区','杉並区','豊島区','北区','荒川区','板橋区','練馬区',
    '足立区','葛飾区','江戸川区',
    '八王子市','立川市','武蔵野市','三鷹市','青梅市','府中市','昭島市','調布市','町田市',
    '小金井市','小平市','日野市','東村山市','国分寺市','国立市','福生市','狛江市','東大和市',
    '清瀬市','東久留米市','武蔵村山市','多摩市','稲城市','羽村市','あきる野市','西東京市',
    '瑞穂町','日の出町','檜原村','奥多摩町','大島町','利島村','新島村','神津島村','三宅村',
    '御蔵島村','八丈町','青ヶ島村','小笠原村'
  ],

  _looksLikeAddressStart: function (s) {
    return this._TOKYO_MUNICIPALITIES.some(function (m) { return s.indexOf(m) !== -1; });
  },

  _isBoundary: function (s) {
    if (/(承諾|キャンセル|完了|返却配送対象|申込み|注文の品の受け渡し場所)/.test(s)) return true;
    if (/^→/.test(s)) return true;
    return false;
  },

  _isNoise: function (s) {
    return /^[◎●○\s]*$/.test(s);
  },

  _isNoiseInStore: function (s) {
    if (this._isNoise(s)) return true;
    if (/^[ァ-ヶ]{1}$/.test(s)) return true;
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
      if (self._isNoiseInStore(s)) { i++; continue; }
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
    var results = (this.fixtures || []).map(function (fx) {
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
