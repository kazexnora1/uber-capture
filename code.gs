var SRC_BASE = 'https://raw.githubusercontent.com/kazexnora1/uber-capture/main/';
var CACHE_SECONDS = 30;

function loadApp_() {
  var c = CacheService.getScriptCache();
  var src = c.get('app');
  if (!src) {
    src = UrlFetchApp.fetch(SRC_BASE + 'app.js?_=' + Date.now(), { muteHttpExceptions: true }).getContentText();
    c.put('app', src, CACHE_SECONDS);
  }
  return eval(src);
}

function doGet(e) {
  if (e && e.parameter && e.parameter.flush) {
    CacheService.getScriptCache().removeAll(['app', 'logic', 'ui', 'fixtures']);
    return ContentService.createTextOutput('cache cleared').setMimeType(ContentService.MimeType.TEXT);
  }
  return loadApp_().doGet(e);
}

function doPost(e) {
  return loadApp_().doPost(e);
}

/**
 * この関数は呼ばれない。app.js は eval 経由で実行されるため、
 * DriveAppの利用がGASの権限自動検出に見えない。
 * ここに実際の呼び出しを書いておくことで、必要なスコープを
 * 正しく認識・要求させる。
 */
function ensureScopes_() {
  if (false) {
    DriveApp.getRootFolder();
  }
}
