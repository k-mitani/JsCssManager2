const url = new URL(document.URL);
const host = url.host;

(async function() {
  var data = await Storage.get(host);
  if (data == null) return;

  applyCss(data.css);
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== "applycss") return;

  (async () => {
    var data = await Storage.get(host) || {};
    applyCss(data.css, true);
    sendResponse({ok: true});
  })();
  return true;
});

const USERCSS_ID = "__usercss2__";

function applyCss(css, isUpdate) {
  var elStyle = document.getElementById(USERCSS_ID);

  if (css == null) {
    if (isUpdate && elStyle != null) elStyle.remove();
    return;
  }

  if (elStyle == null) {
    elStyle = document.createElement("style");
    elStyle.id = USERCSS_ID;
    document.documentElement.appendChild(elStyle);
  }

  // すべての宣言に !important を付ける。
  elStyle.textContent = css.replace(/;/g, " !important;");
}
