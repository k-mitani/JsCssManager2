const url = new URL(document.URL);
const host = url.host;

chrome.storage.sync.get(host, function(res) {
  var data = res[host];
  console.log(`data of '${host}': ${JSON.stringify(data)}`);
  if (data == null) return;

  applyCss(data.css);

  // JSを追加する。
  if (data.js != null) {
    var script = document.createElement('script');
    script.innerHTML = data.js;
    document.documentElement.appendChild(script);
  }
});

document.addEventListener("updatecss", () => {
  chrome.storage.sync.get(host, function(res) {
    var data = res[host] || {};
    applyCss(data.css, true);
  });
});

function applyCss(css, isUpdate) {
  if (css == null && isUpdate) {
    console.log("delete style element");
    var elStyle = document.getElementById("__usercss__");
    if (elStyle != null) elStyle.remove();
    return;
  }
  if (css == null) return;

  var elStyle = document.getElementById("__usercss__");
  var exists = elStyle != null;
  if (exists) {
    elStyle.innerHTML = "";
  }
  else {
    elStyle = document.createElement("style");
    elStyle.id = "__usercss__";
  }

  cssImportant = css.replace(";", " !important;");
  elStyle.appendChild(document.createTextNode(cssImportant));
  if (!exists) {
    document.documentElement.appendChild(elStyle);
  }
}