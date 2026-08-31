var SRC_LOGIC = 'https://raw.githubusercontent.com/kazexnora1/uber-capture/main/logic.js';
var SRC_FIXTURES = 'https://raw.githubusercontent.com/kazexnora1/uber-capture/main/fixtures.json';
var DRIVE_FOLDER_ID = '1dGJeT9UA8BG0aCVWJd8lUxDBz1fyw0VJ';
var LOG_FILE_NAME = 'log.txt';
var LAST_FILE_NAME = 'last.json';

function doPost(e) {
  var res = { view: '', store: '', address: '', speak: '', ok: false };
  try {
    var payload = JSON.parse(e.postData.contents);

    if (payload.note) {
      res.view = appendNote_(payload.note) ? 'メモ記録しました' : 'メモ記録失敗';
      return out(res);
    }

    var text = payload.text || '';
    var imageB64 = payload.image || '';

    var mod = eval(loadLogic_());
    var p = mod.parse(text) || {};
    res.store = p.store || '';
    res.address = p.address || '';
    res.view = mod.view(p);
    res.speak = mod.speak(p);
    res.ok = !!(p.store && p.address);

    var fileName = '';
    if (imageB64) {
      fileName = saveImage_(imageB64, res.ok);
    }
    appendLog_(res.ok, fileName || '(なし)', text, p);
    if (res.ok) {
      saveLast_(p);
    }
  } catch (err) {
    res.view = 'エラー: ' + err;
    res.speak = 'エラーが発生しました';
  }
  return out(res);
}

function saveImage_(b64, ok) {
  try {
    var bytes = Utilities.base64Decode(b64);
    var blob = Utilities.newBlob(bytes, 'image/jpeg');
    var now = new Date();
    var ts = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmm');
    var name = ts + '_' + (ok ? 'ok' : 'fail') + '.jpg';
    blob.setName(name);
    DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);
    return name;
  } catch (err) {
    return '';
  }
}

function appendLog_(ok, fileName, rawText, p) {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var files = folder.getFilesByName(LOG_FILE_NAME);
    var file = files.hasNext() ? files.next() : folder.createFile(LOG_FILE_NAME, '', MimeType.PLAIN_TEXT);
    var now = new Date();
    var ts = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
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
    var existing = file.getBlob().getDataAsString();
    file.setContent(existing + block.join('\n') + '\n');
  } catch (err) {
    // ログ失敗はメイン処理に影響させない
  }
}

function appendNote_(note) {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var files = folder.getFilesByName(LOG_FILE_NAME);
    var file = files.hasNext() ? files.next() : folder.createFile(LOG_FILE_NAME, '', MimeType.PLAIN_TEXT);
    var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    var block = '>>> NOTE ' + ts + ': ' + note + '\n';
    file.setContent(file.getBlob().getDataAsString() + block);
    return true;
  } catch (err) {
    return false;
  }
}

function saveLast_(p) {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var files = folder.getFilesByName(LAST_FILE_NAME);
    var file = files.hasNext() ? files.next() : folder.createFile(LAST_FILE_NAME, '', MimeType.PLAIN_TEXT);
    var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    file.setContent(JSON.stringify({
      store: p.store || '',
      address: p.address || '',
      price: p.price != null ? p.price : '',
      minutes: p.minutes != null ? p.minutes : '',
      km: p.km != null ? p.km : '',
      hourlyRate: p.hourlyRate != null ? p.hourlyRate : '',
      multiplier: p.multiplier != null ? p.multiplier : 1,
      additional: !!p.isAdditional,
      ts: ts
    }));
  } catch (err) {
    // 失敗してもメイン処理に影響させない
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.test) {
    var mod = eval(loadLogic_());
    mod.fixtures = JSON.parse(loadFixtures_());
    return ContentService.createTextOutput(mod.selfTest())
      .setMimeType(ContentService.MimeType.TEXT);
  }
  if (e && e.parameter && e.parameter.last) {
    return getLast_();
  }
  return doPost(e);
}

function getLast_() {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var files = folder.getFilesByName(LAST_FILE_NAME);
    var content = files.hasNext() ? files.next().getBlob().getDataAsString() : '{}';
    var b64 = Utilities.base64Encode(content, Utilities.Charset.UTF_8);
    return ContentService.createTextOutput(b64).setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
  }
}

function out(res) {
  var b64 = Utilities.base64Encode(JSON.stringify(res), Utilities.Charset.UTF_8);
  return ContentService.createTextOutput(b64).setMimeType(ContentService.MimeType.TEXT);
}

function loadLogic_() {
  var c = CacheService.getScriptCache();
  var hit = c.get('logic');
  if (hit) return hit;
  var body = UrlFetchApp.fetch(SRC_LOGIC + '?_=' + Date.now(), { muteHttpExceptions: true }).getContentText();
  c.put('logic', body, 30);
  return body;
}

function loadFixtures_() {
  var c = CacheService.getScriptCache();
  var hit = c.get('fixtures');
  if (hit) return hit;
  var body = UrlFetchApp.fetch(SRC_FIXTURES + '?_=' + Date.now(), { muteHttpExceptions: true }).getContentText();
  c.put('fixtures', body, 30);
  return body;
}
