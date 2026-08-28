({
  VERSION: '2026-08-29-05',

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
    if (/^[0-9０-９]{1,2}$/.test(s)) return true;
    return false;
  },

  _extractPrice: function (L) {
    for (var i = 0; i < L.length; i++) {
      var m = L[i].match(/^(\+)?\s*[·¥￥]\s*(\d{2,5})$/);
      if (m) return { value: parseInt(m[2], 10), isAdditional: !!m[1] };
    }
    return null;
  },

  _extractMinutes: function (kmLine) {
    if (!kmLine) return null;
    var m = kmLine.match(/(\d+)\s*分/);
    return m ? parseInt(m[1], 10) : null;
  },

  _extractMultiplier: function (L) {
    for (var i = 0; i < L.length; i++) {
      var m = L[i].match(/配達\s*[（(]\s*([0-9])\s*[）)]/);
      if (m) return parseInt(m[1], 10);
    }
    return 1;
  },

  _speakableStoreName: function (store) {
    var parts = store.split(' ').filter(function (w) {
      return /[ぁ-んァ-ヶ一-龠]/.test(w);
    });
    return parts.length ? parts.join(' ') : store;
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

    var priceInfo = self._extractPrice(L);
    var minutes = idx >= 0 ? self._extractMinutes(L[idx]) : null;
    var multiplier = self._extractMultiplier(L);
    var hourlyRate = (priceInfo && minutes) ? Math.round(priceInfo.value / minutes * 60) : null;

    var base = {
      lines: L,
      price: priceInfo ? priceInfo.value : null,
      isAdditional: priceInfo ? priceInfo.isAdditional : false,
      minutes: minutes,
      multiplier: multiplier,
      hourlyRate: hourlyRate
    };

    if (idx < 0) {
      return Object.assign(base, { store: '', address: '' });
    }

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

    return Object.assign(base, {
      store: storeParts.join(' ').trim(),
      address: addrParts.join('').trim().replace(/[■□◆◇○●]+$/, '')
    });
  },

  view: function (p) {
    if (!p.store || !p.address) {
      return '⚠️ 解析失敗 (v' + this.VERSION + ')\n' + p.lines.map(function (s, i) { return i + ': ' + s; }).join('\n');
    }
    var extra = (p.hourlyRate ? ' 時給約' + p.hourlyRate + '円' : '') + (p.multiplier > 1 ? ' x' + p.multiplier : '') + (p.isAdditional ? ' [追加]' : '');
    return '🏪 ' + p.store + '\n📍 ' + p.address + extra + '\n(v' + this.VERSION + ')';
  },

  speak: function (p) {
    if (!p.store || !p.address) {
      return '読み取りに失敗しました';
    }
    var parts = [];
    if (p.isAdditional) {
      parts.push('追加の配達です');
    }
    if (p.hourlyRate) parts.push('時給' + p.hourlyRate + '円');
    parts.push(this._speakableStoreName(p.store) + 'へ');
    if (p.multiplier === 2) parts.push('ダブルです');
    else if (p.multiplier === 3) parts.push('トリプルです');
    else if (p.multiplier >= 4) parts.push(p.multiplier + '連続です');
    return parts.join('、');
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