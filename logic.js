({
  VERSION: '2026-09-12-01',

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

  /**
   * 市区町村名が実際の住所の始まりとして妥当かどうかの判定に使う、
   * マッチ直後の探索窓（この文字数以内に丁目/番地の数字が来るはず）。
   */
  _ADDRESS_DIGIT_WINDOW: 10,

  /**
   * 「東大和市駅前店」のように支店名自体に市区町村名が含まれるケースを
   * 誤って住所開始と判定しないよう、市区町村名の直後すぐ（_ADDRESS_DIGIT_WINDOW文字以内）に
   * 数字か「丁目」が続く場合だけを本物の住所開始として扱う。
   * 文字列中に複数の出現があれば、条件を満たす最初のものを採用する。
   */
  /**
   * 文字列中の市区町村名の出現位置を、出現順に全て返す。
   */
  _municipalityCandidates: function (s) {
    var candidates = [];
    for (var i = 0; i < this._TOKYO_MUNICIPALITIES.length; i++) {
      var name = this._TOKYO_MUNICIPALITIES[i];
      var idx = s.indexOf(name);
      while (idx !== -1) {
        candidates.push({ idx: idx, len: name.length });
        idx = s.indexOf(name, idx + 1);
      }
    }
    candidates.sort(function (a, b) { return a.idx - b.idx; });
    return candidates;
  },

  /**
   * 市区町村名の直後すぐ（_ADDRESS_DIGIT_WINDOW文字以内）に数字か「丁目」「番地」が
   * 続く出現だけを対象にした、厳しめの住所開始判定。
   * 「東大和市駅前店」のように支店名自体に市区町村名が含まれるケースを弾くために使う。
   */
  _strictAddressIndex: function (s) {
    var candidates = this._municipalityCandidates(s);
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var after = s.slice(c.idx + c.len, c.idx + c.len + this._ADDRESS_DIGIT_WINDOW);
      if (/[0-9０-９]|丁目|番地/.test(after)) return c.idx;
    }
    return -1;
  },

  /**
   * 数字の有無を問わない、最初に見つかった市区町村名の出現位置。
   * 「日野市日野」「小平市仲町」のように丁目番地が付かない住所もあるため、
   * 厳しい判定で見つからない場合のフォールバックとして使う。
   */
  _looseAddressIndex: function (s) {
    var candidates = this._municipalityCandidates(s);
    return candidates.length ? candidates[0].idx : -1;
  },

  /**
   * L[from]以降・境界行が来るまでの範囲で、実際に住所が始まる行と位置を1つ選ぶ。
   * まず全行を厳しい判定（数字が続くもの）でスキャンし、見つかればそれを採用する
   * （支店名に市区町村名が紛れているだけの行を誤検知しないため）。
   * どの行にも数字が続く出現が無ければ、緩い判定（最初の出現）で選び直す
   * （丁目番地の無い住所を持つ店を拾えなくならないようにするため）。
   */
  _findAddressStart: function (L, from) {
    for (var i = from; i < L.length; i++) {
      var s = L[i];
      if (this._isBoundary(s)) break;
      var strict = this._strictAddressIndex(s);
      if (strict !== -1) return { line: i, idx: strict };
    }
    for (var j = from; j < L.length; j++) {
      var t = L[j];
      if (this._isBoundary(t)) break;
      var loose = this._looseAddressIndex(t);
      if (loose !== -1) return { line: j, idx: loose };
    }
    return null;
  },

  _isBoundary: function (s) {
    if (/(承諾|キャンセル|完了|返却配送対象|申込み|注文の品の受け渡し場所|マッチする)/.test(s)) return true;
    if (/^→/.test(s)) return true;
    return false;
  },

  _isNoise: function (s) {
    return /^[◎●○\s]*$/.test(s);
  },

  /**
   * 店名を組み立てる際に読み飛ばす行。
   * - ◎●○や空白だけの行
   * - カタカナ1文字だけの行
   * - 1〜2桁の数字だけの行
   * - 英数字・かな・漢字を一切含まない短い記号だけの行
   *   （地図上の小さいアイコンなどをOCRが誤読した "*#/" "#" のようなゴミ文字。
   *   これが店名に紛れ込むと、同じ店でも毎回違う店名になり、
   *   店メモ/店情報キャッシュが同じ店として認識できなくなる）
   */
  _isNoiseInStore: function (s) {
    if (this._isNoise(s)) return true;
    if (s.length === 1 && /[A-Za-z0-9ぁ-んァ-ヶ一-龠]/.test(s)) return true;
    if (/^[0-9０-９]{1,2}$/.test(s)) return true;
    if (s.length <= 4 && !/[A-Za-z0-9ぁ-んァ-ヶ一-龠]/.test(s)) return true;
    return false;
  },

  _extractPrice: function (L) {
    for (var i = 0; i < L.length; i++) {
      var m = L[i].match(/^(\+)?\s*[·¥￥]\s*([\d,]{2,7})$/);
      if (m) return { value: parseInt(m[2].replace(/,/g, ''), 10), isAdditional: !!m[1] };
    }
    return null;
  },

  _extractMinutes: function (kmLine) {
    if (!kmLine) return null;
    var m = kmLine.match(/(\d+)\s*分/);
    return m ? parseInt(m[1], 10) : null;
  },

  _extractKm: function (kmLine) {
    if (!kmLine) return null;
    var m = kmLine.match(/([\d.]+)\s*km/);
    return m ? parseFloat(m[1]) : null;
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
    var km = idx >= 0 ? self._extractKm(L[idx]) : null;
    var multiplier = self._extractMultiplier(L);
    var hourlyRate = (priceInfo && minutes) ? Math.round(priceInfo.value / minutes * 60) : null;

    var base = {
      lines: L,
      price: priceInfo ? priceInfo.value : null,
      isAdditional: priceInfo ? priceInfo.isAdditional : false,
      minutes: minutes,
      km: km,
      multiplier: multiplier,
      hourlyRate: hourlyRate
    };

    if (idx < 0) {
      return Object.assign(base, { store: '', address: '' });
    }

    var i = idx + 1;
    var split = self._findAddressStart(L, i);

    var storeParts = [];
    while (i < L.length) {
      var s = L[i];
      if (self._isNoiseInStore(s)) { i++; continue; }
      if (self._isBoundary(s)) break;
      if (split && i === split.line) {
        if (split.idx === 0) break;
        var storePart = s.slice(0, split.idx).trim();
        if (storePart) storeParts.push(storePart);
        L[i] = s.slice(split.idx);
        break;
      }
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