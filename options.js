const USER_SCRIPTS_DISABLED_MESSAGE =
  "userScripts API is not available. Enable \"Allow User Scripts\" on this extension's details page in chrome://extensions.";

function on($el, eventName, method) {
  $el.addEventListener(eventName, method);
}

Log.watch();

function setMessageText(text) {
  $labelError.textContent = text + "\n";
}

// APIが使えるかどうかを判定する。
// chrome.userScripts はAPIが無効なとき例外ではなく undefined になるため、
// プロパティアクセスではなくメソッド呼び出しで判定する。
function isUserScriptsAvailable() {
  try {
    chrome.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}

var $labelUserScriptsCaution = document.querySelector(".labelUserScriptsCaution");
if (!isUserScriptsAvailable()) {
  $labelUserScriptsCaution.style.display = "block";
}

var $textImport = document.querySelector(".textImport");
var $buttonImport = document.querySelector(".buttonImport");
var $textExport = document.querySelector(".textExport");
var $labelError = document.querySelector(".labelError");

on($buttonImport, "click", async () => {
    setMessageText("");
    try {
      // 入力テキストをJSONに変換する。
      var text = $textImport.value;
      var data = JSON.parse(text);
      // ストレージに書き込む。
      await chrome.storage.sync.set(data);
      // 終わったら表示を更新する。
      await refreshCurrentCssText();
    } catch (error) {
      await Log.error("Import failed: " + error.message);
      setMessageText(error.stack);
    }
});

// ストレージの内容を表示します。
async function refreshCurrentCssText() {
  var res = await chrome.storage.sync.get();
  var json = JSON.stringify(res);
  $textExport.value = json;
}

refreshCurrentCssText();


var $buttonUnregisterAllScripts = document.querySelector(".buttonUnregisterAllScripts");
on($buttonUnregisterAllScripts, "click", async () => {
    setMessageText("");
    try {
      if (!isUserScriptsAvailable()) throw new Error(USER_SCRIPTS_DISABLED_MESSAGE);
      await chrome.userScripts.unregister();
      await Log.info("Unregistered all (from options)");
      setMessageText("OK");
    } catch (error) {
      await Log.error(error.message);
      setMessageText(error.stack);
    }
    await refreshStatusIfShown();
});

var $buttonRegisterAll = document.querySelector(".buttonRegisterAll");
on($buttonRegisterAll, "click", async () => {
    setMessageText("");
    // 登録処理はswに一本化する。詳細な結果はLogセクションに出る。
    var res = await chrome.runtime.sendMessage({type: "registerall"});
    setMessageText(res != null && res.ok ? "OK" : "NG: " + (res && res.error));
    await refreshStatusIfShown();
});


// ---- Registration Status ----------------------------------------------

var $labelStatus = document.querySelector(".labelStatus");
var $buttonShowStatus = document.querySelector(".buttonShowStatus");

// ボタンを押すまでは取得しない。一度表示したあとは登録操作に合わせて更新する。
var _isStatusShown = false;

async function refreshStatus() {
  _isStatusShown = true;
  $labelStatus.style.display = "block";
  if (!isUserScriptsAvailable()) {
    $labelStatus.textContent = "NG: " + USER_SCRIPTS_DISABLED_MESSAGE;
    return;
  }
  try {
    var scripts = await chrome.userScripts.getScripts();
    var lines = scripts.map(s => `${s.id}  [${s.world || "USER_SCRIPT"}]  ${JSON.stringify(s.matches)}`);
    $labelStatus.textContent =
      `OK: userScripts API is available.\nRegistered scripts: ${scripts.length}\n` +
      (lines.length === 0 ? "(none)" : lines.join("\n"));
  } catch (error) {
    $labelStatus.textContent = "NG: " + error.message;
  }
}

on($buttonShowStatus, "click", refreshStatus);

// 表示済みのときだけ、内容が古くならないように更新する。
async function refreshStatusIfShown() {
  if (_isStatusShown) await refreshStatus();
}


// ---- Log ---------------------------------------------------------------

var $labelLog = document.querySelector(".labelLog");
var $logArea = document.querySelector(".logArea");
var $buttonClearLog = document.querySelector(".buttonClearLog");
var $checkLogEnabled = document.querySelector(".checkLogEnabled");

// ログ表示はチェックが入っているときだけ出す。
async function refreshLogEnabled() {
  var enabled = await Log.isEnabled();
  $checkLogEnabled.checked = enabled;
  $logArea.style.display = enabled ? "block" : "none";
  if (enabled) await refreshLog();
}

on($checkLogEnabled, "change", async () => {
  await Log.setEnabled($checkLogEnabled.checked);
  // OFFにした直後は記録されないので、ONにしたときだけ印が残る。
  await Log.info("Logging enabled");
  await refreshLogEnabled();
});

async function refreshLog() {
  var entries = await Log.getAll();
  $labelLog.textContent = "";
  if (entries.length === 0) {
    $labelLog.textContent = "(no log yet)";
    return;
  }
  // 新しいものを上に表示する。
  for (const entry of entries.slice().reverse()) {
    var time = new Date(entry.time).toLocaleString();
    var $line = document.createElement("div");
    if (entry.level === "ERROR") $line.className = "error";
    $line.textContent = `[${time}] ${entry.level} ${entry.message}`;
    $labelLog.appendChild($line);
  }
}

on($buttonClearLog, "click", async () => {
  await Log.clear();
  await refreshLog();
});

// swがログを書いたら自動で表示を更新する。
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "session" && changes[Log.KEY] != null) refreshLog();
  if (areaName === "session" && changes[Log.ENABLED_KEY] != null) refreshLogEnabled();
  if (areaName === "sync") refreshCurrentCssText();
});

refreshLogEnabled();
