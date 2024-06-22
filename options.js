function on($el, eventName, method) {
  $el.addEventListener(eventName, method);
}

function addMessageText(text) {
  $labelError.textContent += text + "\n";
}
function setMessageText(text) {
  $labelError.textContent = text + "\n";
}

var $labelChromeDeveloperModeCaution = document.querySelector(".labelChromeDeveloperModeCaution");
(function() {
  try {
    chrome.userScripts;
  } catch {
    $labelChromeDeveloperModeCaution.style.display = "block";
  }
})();

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
      await chrome.userScripts.unregister();
      setMessageText("OK");
    } catch (error) {
      setMessageText(error.stack);
    }
});

var $buttonRegisterAll = document.querySelector(".buttonRegisterAll");
on($buttonRegisterAll, "click", async () => {
    setMessageText("");
    try {
      await chrome.userScripts.unregister();
      setMessageText("Unregistered all");

      var all = await Storage.getAll();
      for (const host in all) {
        const data = all[host];
        const js = data.js;
        if (js == null || js === "") continue;

        await chrome.userScripts.register([{
          id: host,
          matches: [`*://${host}/*`],
          js: [{code: js}],
        }]);
        addMessageText(`Registered: "${host}" | ${JSON.stringify(js)}`);
      }
    } catch (error) {
      addMessageText(error.stack);
    }
});