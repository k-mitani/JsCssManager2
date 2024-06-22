class Storage {
  static async get(host) {
      var res = await chrome.storage.sync.get(host);
      return res[host];
  }

  static async set(host, js, css) {
      var res = await this.get(host);
      var data = res ? res[host] : {};
      data.js = js || data.js;
      data.css = css || data.css;
      await chrome.storage.sync.set(data);
  }

  static async remove(host) {
      await chrome.storage.sync.remove(host);
  }
}

const url = new URL(document.URL);
const host = url.host;

(async function() {
  var data = await Storage.get(host);
  console.log(`!data of '${host}': ${JSON.stringify(data)}`);
  if (data == null) return;
  
  applyCss(data.css);
})();

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log("received message", request);
  if (request.type == "applycss") {
    console.log("applycss");
    var data = await Storage.get(host) || {};
    applyCss(data.css, true);
  }
});

const USERCSS_ID = "__usercss2__";

function applyCss(css, isUpdate) {
  if (css == null && isUpdate) {
    console.log("delete style element");
    var elStyle = document.getElementById(USERCSS_ID);
    if (elStyle != null) elStyle.remove();
    return;
  }
  if (css == null) return;

  var elStyle = document.getElementById(USERCSS_ID);
  var exists = elStyle != null;
  if (exists) {
    elStyle.innerHTML = "";
  }
  else {
    elStyle = document.createElement("style");
    elStyle.id = USERCSS_ID;
  }

  cssImportant = css.replace(";", " !important;");
  elStyle.appendChild(document.createTextNode(cssImportant));
  if (!exists) {
    document.documentElement.appendChild(elStyle);
  }
}

