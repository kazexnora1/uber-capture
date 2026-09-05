({
  VERSION: '2026-09-05-06',

  SRC_LOGIC: 'https://raw.githubusercontent.com/kazexnora1/uber-capture/main/logic.js',
  SRC_FIXTURES: 'https://raw.githubusercontent.com/kazexnora1/uber-capture/main/fixtures.json',

  FOLDER_ID: '1dGJeT9UA8BG0aCVWJd8lUxDBz1fyw0VJ',
  LOG_FILE: 'log.txt',
  LAST_FILE: 'last.json',
  HISTORY_FILE: 'history.json',
  STORES_FILE: 'stores.json',

  HISTORY_MAX: 20,

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

  api_saveMemo: function (store, memo) {
    if (!store) return { status: 'error' };

    var stores = this.readJson(this.STORES_FILE, {});
    var body = String(memo == null ? '' : memo).trim();

    if (!body) {
      delete stores[store];
      this.writeJson(this.STORES_FILE, stores);
      return { status: 'deleted' };
    }

    var entry = {
      memo: body,
      updatedAt: this.stamp('yyyy-MM-dd HH:mm')
    };
    stores[store] = entry;
    this.writeJson(this.STORES_FILE, stores);

    return { status: 'saved', entry: entry };
  },

  /* ---------- 画面へのデータ提供（GitHub Pagesからfetchされる） ---------- */

  getData: function () {
    var history = this.readJson(this.HISTORY_FILE, []);
    var stores = this.readJson(this.STORES_FILE, {});

    var memos = {};
    history.forEach(function (h) {
      if (h.store && stores[h.store]) memos[h.store] = stores[h.store];
    });

    return this.jsonOut({ history: history, memos: memos, version: this.VERSION });
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
