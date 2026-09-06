({
  VERSION: '2026-09-05-14',

  SRC_LOGIC: 'https://raw.githubusercontent.com/kazexnora1/uber-capture/main/logic.js',
  SRC_FIXTURES: 'https://raw.githubusercontent.com/kazexnora1/uber-capture/main/fixtures.json',

  FOLDER_ID: '1dGJeT9UA8BG0aCVWJd8lUxDBz1fyw0VJ',
  LOG_FILE: 'log.txt',
  LAST_FILE: 'last.json',
  HISTORY_FILE: 'history.json',
  STORES_FILE: 'stores.json',
  STOREINFO_FILE: 'storeinfo.json',
  ELEVATION_FILE: 'elevation.json',
  PLACES_FILE: 'places.json',

  HISTORY_MAX: 20,
  GEMINI_MODEL: 'gemini-3.6-flash',

  /* ---------- 入口（ショートカットからのPOST／画面からのAPI呼び出し） ---------- */

  doPost: function (e) {
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (err) {
      return this.jsonOut({ status: 'error', message: 'bad request' });
    }

    // 画面（GitHub Pages）から呼ばれるAPI操作
    if (payload.action) {
      return this.jsonOut(this.api(payload.action, payload.args || []));
    }

    // 以下は従来通り、ショートカットからのキャプチャ処理
    var res = { view: '', store: '', address: '', speak: '', ok: false };
    try {
      if (payload.note) {
        res.view = this.appendNote(payload.note) ? 'メモ記録しました' : 'メモ記録失敗';
        return this.out(res);
      }

      var text = payload.text || '';
      var imageB64 = payload.image || '';

      var mod = eval(this.loadSrc('logic', this.SRC_LOGIC));
      var p = mod.parse(text) || {};

      res.store = p.store || '';
      res.address = p.address || '';
      res.view = mod.view(p);
      res.speak = mod.speak(p);
      res.ok = !!(p.store && p.address);

      var img = { name: '', id: '' };
      if (imageB64) {
        img = this.saveImage(imageB64, res.ok);
      }

      this.appendLog(res.ok, img.name || '(なし)', text, p);

      if (res.ok) {
        this.saveLast(p);
        this.appendHistory(p, img);
      }
    } catch (err) {
      res.view = 'エラー: ' + err;
      res.speak = 'エラーが発生しました';
    }
    return this.out(res);
  },

  doGet: function (e) {
    if (e && e.parameter && e.parameter.diag) {
      return this.diag();
    }
    if (e && e.parameter && e.parameter.data) {
      return this.getData();
    }
    if (e && e.parameter && e.parameter.test) {
      var mod = eval(this.loadSrc('logic', this.SRC_LOGIC));
      mod.fixtures = JSON.parse(this.loadSrc('fixtures', this.SRC_FIXTURES));
      return ContentService.createTextOutput(mod.selfTest())
        .setMimeType(ContentService.MimeType.TEXT);
    }
    if (e && e.parameter && e.parameter.last) {
      return this.getLast();
    }
    return this.doPost(e);
  },

  /**
   * 画面からの呼び出し口。api_ で始まるメソッドだけ実行できる。
   * 新しい処理を足すときは api_xxx を書くだけでよく、GAS側の変更は要らない。
   */
  api: function (name, args) {
    var fn = this['api_' + name];
    if (typeof fn !== 'function') return { status: 'unknown', name: name };
    try {
      return fn.apply(this, args || []);
    } catch (err) {
      return { status: 'error', message: String(err) };
    }
  },

  /* ---------- 画面から呼ばれる処理 ---------- */

  /**
   * ピック(店名)からドロップ(住所)までの標高差を調べる。
   * 店の座標は resolvePlace（Places API）から取り、配達先はGeocoding APIで座標化する。
   * 組み合わせ（店×配達先）ごとにキャッシュする。配達先は毎回変わるため、
   * 店メモ/店情報と違って店名だけでは照合しない。
   *
   * あわせて、店と配達先の直線距離をOCRが読み取った配達距離(km)と突き合わせる。
   * 直線距離の方が大幅に大きい場合、Places APIが同名の別店舗（違う市区町村など）を
   * 誤って掴んでいる可能性が高いので、その旨を返す。
   */
  api_elevation: function (store, address, km) {
    if (!store || !address) return { status: 'empty' };
    var key = this.normKey(store) + '||' + this.normKey(address);

    var cache = this.readJson(this.ELEVATION_FILE, {});
    if (cache[key]) {
      return this.withSuspicionCheck(cache[key], km);
    }
    return this.fetchElevation(store, address, km, key, cache);
  },

  api_refreshElevation: function (store, address, km) {
    if (!store || !address) return { status: 'empty' };
    var key = this.normKey(store) + '||' + this.normKey(address);

    var cache = this.readJson(this.ELEVATION_FILE, {});
    delete cache[key];
    return this.fetchElevation(store, address, km, key, cache);
  },

  withSuspicionCheck: function (entry, km) {
    var res = {
      status: 'found',
      diff: entry.diff,
      straightKm: entry.straightKm,
      placeName: entry.placeName,
      placeAddress: entry.placeAddress
    };
    if (km && entry.straightKm != null && entry.straightKm > km * 2.5) {
      res.suspicious = true;
    }
    return res;
  },

  fetchElevation: function (store, address, km, key, cache) {
    var apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
    if (!apiKey) return { status: 'nokey' };

    try {
      var place = this.resolvePlace(store);
      if (!place || place.lat == null) return { status: 'geofail', message: '店の場所が特定できませんでした' };

      var drop = this.geocode(address, apiKey);
      if (!drop) return { status: 'geofail', message: '配達先の場所が特定できませんでした' };

      var locations = place.lat + ',' + place.lng + '|' + drop.lat + ',' + drop.lng;
      var url = 'https://maps.googleapis.com/maps/api/elevation/json?locations='
        + encodeURIComponent(locations) + '&key=' + apiKey;

      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var body = JSON.parse(resp.getContentText());

      if (body.status !== 'OK' || !body.results || body.results.length < 2) {
        return { status: 'error', message: body.status || 'unknown' };
      }

      var diff = Math.round(body.results[1].elevation - body.results[0].elevation);
      var straightKm = Math.round(this.haversineKm(place.lat, place.lng, drop.lat, drop.lng) * 10) / 10;

      var entry = {
        diff: diff,
        straightKm: straightKm,
        placeName: place.name || '',
        placeAddress: place.address || ''
      };
      cache[key] = entry;
      this.writeJson(this.ELEVATION_FILE, cache);

      return this.withSuspicionCheck(entry, km);
    } catch (err) {
      return { status: 'error', message: String(err) };
    }
  },

  /**
   * 2点間の直線距離(km)。ハーサイン公式。
   */
  haversineKm: function (lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
      * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * 店名からGoogleマップ上の正式な店舗情報（正式名称・住所・座標）を解決する。
   * Places API (New) の Text Search を使う。店名をキーにキャッシュし、
   * 高低差の計算とGemini店情報プロンプトの両方から共有して使う。
   */
  resolvePlace: function (store) {
    var key = this.normKey(store);
    var cache = this.readJson(this.PLACES_FILE, {});
    if (cache[key]) return cache[key];

    var apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
    if (!apiKey) return null;

    try {
      var resp = UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location'
        },
        payload: JSON.stringify({
          textQuery: store,
          languageCode: 'ja',
          regionCode: 'JP',
          maxResultCount: 1
        }),
        muteHttpExceptions: true
      });

      var body = JSON.parse(resp.getContentText());
      if (!body.places || !body.places.length) return null;

      var pl = body.places[0];
      var result = {
        name: (pl.displayName && pl.displayName.text) || store,
        address: pl.formattedAddress || '',
        lat: pl.location ? pl.location.latitude : null,
        lng: pl.location ? pl.location.longitude : null
      };

      cache[key] = result;
      this.writeJson(this.PLACES_FILE, cache);
      return result;
    } catch (err) {
      return null;
    }
  },

  geocode: function (query, apiKey) {
    var url = 'https://maps.googleapis.com/maps/api/geocode/json?address='
      + encodeURIComponent(query) + '&region=jp&key=' + apiKey;
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var body = JSON.parse(resp.getContentText());
    if (body.status !== 'OK' || !body.results || !body.results.length) return null;
    var loc = body.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  },

  api_saveMemo: function (store, memo) {
    if (!store) return { status: 'error' };
    var key = this.normKey(store);

    var stores = this.readJson(this.STORES_FILE, {});
    var body = String(memo == null ? '' : memo).trim();

    if (!body) {
      delete stores[key];
      this.writeJson(this.STORES_FILE, stores);
      return { status: 'deleted' };
    }

    var entry = {
      memo: body,
      updatedAt: this.stamp('yyyy-MM-dd HH:mm')
    };
    stores[key] = entry;
    this.writeJson(this.STORES_FILE, stores);

    return { status: 'saved', entry: entry };
  },

  /**
   * 店の情報をGemini(Web検索つき)で調べる。店名をキーにキャッシュし、
   * 一度調べた店は次回以降APIを呼ばない。
   * address(配達先＝お客様の住所)は店の特定に無関係かつ個人情報なので、
   * 検索クエリには一切含めない。
   */
  api_storeInfo: function (store) {
    if (!store) return { status: 'empty' };
    var key = this.normKey(store);

    var cache = this.readJson(this.STOREINFO_FILE, {});
    if (cache[key]) {
      return { status: 'found', text: cache[key].text, updatedAt: cache[key].updatedAt };
    }
    return this.fetchStoreInfo(store, key, cache);
  },

  /**
   * キャッシュを捨てて調べ直す。
   */
  api_refreshStoreInfo: function (store) {
    if (!store) return { status: 'empty' };
    var key = this.normKey(store);

    var cache = this.readJson(this.STOREINFO_FILE, {});
    delete cache[key];
    return this.fetchStoreInfo(store, key, cache);
  },

  fetchStoreInfo: function (store, key, cache) {
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return { status: 'nokey' };

    try {
      var place = this.resolvePlace(store);
      var placeContext = (place && (place.name || place.address))
        ? ('\nGoogleマップ上の登録情報（参考）: 店名「' + (place.name || '不明') + '」、住所「' + (place.address || '不明') + '」\n')
        : '';

      var prompt = '自転車での商品配達のため、次の店舗の「現地に着いてから迷わないための情報」を'
        + 'Web検索して分かる範囲で日本語で教えてください。\n'
        + 'この店名はUber Eats上の表示名です。最近はゴーストキッチン（バーチャルブランド）といって、'
        + '1つの実店舗が複数のUber Eats用ブランド名を掲げて営業していることがよくあります。'
        + 'そうした情報が見つかれば、実際にその場所で営業している本当の店舗名も教えてください'
        + '（現地の看板や実際の店構えの目印として重要なため）。\n'
        + '知りたいのは次の項目だけです。営業時間・定休日・電話番号・メニューなど配達と無関係な情報は書かないでください。\n'
        + '- 実際に営業している店舗名（Uber Eats上の表示名と異なる場合。ゴーストキッチンの母体）\n'
        + '- 建物名（商業施設・ビルの名前）\n'
        + '- 何階にあるか\n'
        + '- 大型施設の場合、複数棟あるならどの棟か\n'
        + '- 入口の場所（正面/裏口/搬入口など、分かれば）\n'
        + '- 駐輪場の場所（大型施設の場合、特に重要）\n'
        + '- 隣接する建物や目印になるもの\n'
        + '分からない項目は書かず省略してください。分かる項目だけ箇条書きで、6行以内、前置きなしに本文だけ書いてください。'
        + placeContext
        + '店名: ' + store;

      var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
        + this.GEMINI_MODEL + ':generateContent?key=' + apiKey;

      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }]
        }),
        muteHttpExceptions: true
      });

      if (resp.getResponseCode() !== 200) {
        return { status: 'error', message: 'HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200) };
      }

      var body = JSON.parse(resp.getContentText());
      var cand = body.candidates && body.candidates[0];
      var parts = cand && cand.content && cand.content.parts;
      var text = parts && parts.map(function (p) { return p.text || ''; }).join('').trim();

      if (!text) return { status: 'notfound' };

      var entry = { text: text, updatedAt: this.stamp('yyyy-MM-dd HH:mm') };
      cache[key] = entry;
      this.writeJson(this.STOREINFO_FILE, cache);

      return { status: 'found', text: entry.text, updatedAt: entry.updatedAt };
    } catch (err) {
      return { status: 'error', message: String(err) };
    }
  },

  /* ---------- 画面へのデータ提供（GitHub Pagesからfetchされる） ---------- */

  getData: function () {
    var history = this.readJson(this.HISTORY_FILE, []);
    var stores = this.readJson(this.STORES_FILE, {});
    var infoCache = this.readJson(this.STOREINFO_FILE, {});
    var self = this;

    var memos = {};
    var infos = {};
    history.forEach(function (h) {
      if (!h.store) return;
      var key = self.normKey(h.store);
      if (stores[key]) memos[h.store] = stores[key];
      if (infoCache[key]) infos[h.store] = infoCache[key];
    });

    return this.jsonOut({ history: history, memos: memos, infos: infos, version: this.VERSION });
  },

  /* ---------- 診断 ---------- */

  diag: function () {
    var lines = [];
    lines.push('app.js version: ' + this.VERSION);

    try {
      var folder = DriveApp.getFolderById(this.FOLDER_ID);
      lines.push('folder: OK (' + folder.getName() + ')');
    } catch (err) {
      lines.push('folder: NG ' + err);
      return ContentService.createTextOutput(lines.join('\n')).setMimeType(ContentService.MimeType.TEXT);
    }

    try {
      this.getFile('diag_test.txt').setContent('diag ' + new Date());
      lines.push('write: OK');
    } catch (err) {
      lines.push('write: NG ' + err);
    }

    try {
      var files = DriveApp.getFolderById(this.FOLDER_ID).getFilesByName('diag_test.txt');
      lines.push(files.hasNext() ? 'read: OK' : 'read: NG not found');
    } catch (err) {
      lines.push('read: NG ' + err);
    }

    try {
      var history = this.readJson(this.HISTORY_FILE, 'NOFILE');
      lines.push('history.json: ' + JSON.stringify(history));
    } catch (err) {
      lines.push('history.json: NG ' + err);
    }

    var geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    lines.push('gemini key: ' + (geminiKey ? 'set' : 'not set'));

    var mapsKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
    lines.push('maps key: ' + (mapsKey ? 'set' : 'not set'));

    return ContentService.createTextOutput(lines.join('\n')).setMimeType(ContentService.MimeType.TEXT);
  },

  /* ---------- 保存まわり ---------- */

  saveImage: function (b64, ok) {
    try {
      var bytes = Utilities.base64Decode(b64);
      var blob = Utilities.newBlob(bytes, 'image/jpeg');
      var name = this.stamp('yyyyMMdd_HHmmss') + '_' + (ok ? 'ok' : 'fail') + '.jpg';
      blob.setName(name);
      var file = DriveApp.getFolderById(this.FOLDER_ID).createFile(blob);
      return { name: name, id: file.getId() };
    } catch (err) {
      return { name: '', id: '' };
    }
  },

  appendHistory: function (p, img) {
    try {
      var history = this.readJson(this.HISTORY_FILE, []);

      history.unshift({
        ts: this.stamp('yyyy-MM-dd HH:mm'),
        store: p.store || '',
        address: p.address || '',
        price: p.price != null ? p.price : null,
        minutes: p.minutes != null ? p.minutes : null,
        km: p.km != null ? p.km : null,
        hourlyRate: p.hourlyRate != null ? p.hourlyRate : null,
        multiplier: p.multiplier != null ? p.multiplier : 1,
        additional: !!p.isAdditional,
        image: (img && img.name) || '',
        imageId: (img && img.id) || ''
      });

      this.writeJson(this.HISTORY_FILE, history.slice(0, this.HISTORY_MAX));
    } catch (err) {
      // 履歴の失敗はメイン処理に影響させない
    }
  },

  appendLog: function (ok, fileName, rawText, p) {
    try {
      var file = this.getFile(this.LOG_FILE);
      var ts = this.stamp('yyyy-MM-dd HH:mm');
      var lines = rawText.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);

      var block = [];
      block.push('----------');
      block.push(ts + ' [' + (ok ? 'OK' : 'FAIL') + '] image: ' + (fileName || '(なし)'));
      block.push('--- OCR行 ---');
      lines.forEach(function (s, i) { block.push(i + ': ' + s); });
      block.push('store: ' + (p.store || '(空)'));
      block.push('address: ' + (p.address || '(空)'));
      block.push('price: ' + (p.price != null ? p.price : '-') +
        ' minutes: ' + (p.minutes != null ? p.minutes : '-') +
        ' hourlyRate: ' + (p.hourlyRate != null ? p.hourlyRate : '-') +
        ' multiplier: ' + (p.multiplier != null ? p.multiplier : '-') +
        ' additional: ' + (p.isAdditional ? 'yes' : 'no'));

      file.setContent(file.getBlob().getDataAsString() + block.join('\n') + '\n');
    } catch (err) {
      // ログ失敗はメイン処理に影響させない
    }
  },

  appendNote: function (note) {
    try {
      var file = this.getFile(this.LOG_FILE);
      var block = '>>> NOTE ' + this.stamp('yyyy-MM-dd HH:mm') + ': ' + note + '\n';
      file.setContent(file.getBlob().getDataAsString() + block);
      return true;
    } catch (err) {
      return false;
    }
  },

  saveLast: function (p) {
    try {
      this.writeJson(this.LAST_FILE, {
        store: p.store || '',
        address: p.address || '',
        price: p.price != null ? p.price : '',
        minutes: p.minutes != null ? p.minutes : '',
        km: p.km != null ? p.km : '',
        hourlyRate: p.hourlyRate != null ? p.hourlyRate : '',
        multiplier: p.multiplier != null ? p.multiplier : 1,
        additional: !!p.isAdditional,
        ts: this.stamp('yyyy-MM-dd HH:mm')
      });
    } catch (err) {
      // 失敗してもメイン処理に影響させない
    }
  },

  getLast: function () {
    try {
      var folder = DriveApp.getFolderById(this.FOLDER_ID);
      var files = folder.getFilesByName(this.LAST_FILE);
      var content = files.hasNext() ? files.next().getBlob().getDataAsString() : '{}';
      var b64 = Utilities.base64Encode(content, Utilities.Charset.UTF_8);
      return ContentService.createTextOutput(b64).setMimeType(ContentService.MimeType.TEXT);
    } catch (err) {
      return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
    }
  },

  /* ---------- 汎用 ---------- */

  /**
   * 店名をキャッシュ照合用に正規化する。前後の空白除去、全角スペースの半角化、
   * 連続する空白の圧縮のみ行う。表示用の店名そのものはどこにも書き換えない。
   */
  normKey: function (s) {
    return String(s || '').trim().replace(/[\u3000\s]+/g, ' ');
  },

  stamp: function (fmt) {
    return Utilities.formatDate(new Date(), 'Asia/Tokyo', fmt);
  },

  getFile: function (fileName) {
    var folder = DriveApp.getFolderById(this.FOLDER_ID);
    var files = folder.getFilesByName(fileName);
    return files.hasNext() ? files.next() : folder.createFile(fileName, '', MimeType.PLAIN_TEXT);
  },

  readJson: function (fileName, fallback) {
    try {
      var folder = DriveApp.getFolderById(this.FOLDER_ID);
      var files = folder.getFilesByName(fileName);
      if (!files.hasNext()) return fallback;
      var text = files.next().getBlob().getDataAsString();
      if (!text) return fallback;
      return JSON.parse(text);
    } catch (err) {
      return fallback;
    }
  },

  writeJson: function (fileName, obj) {
    this.getFile(fileName).setContent(JSON.stringify(obj));
  },

  out: function (res) {
    var b64 = Utilities.base64Encode(JSON.stringify(res), Utilities.Charset.UTF_8);
    return ContentService.createTextOutput(b64).setMimeType(ContentService.MimeType.TEXT);
  },

  jsonOut: function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  },

  loadSrc: function (key, url) {
    var c = CacheService.getScriptCache();
    var hit = c.get(key);
    if (hit) return hit;
    var body = UrlFetchApp.fetch(url + '?_=' + Date.now(), { muteHttpExceptions: true }).getContentText();
    c.put(key, body, 30);
    return body;
  }
})