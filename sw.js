importScripts("./storage.js");

function isUserScriptsAvailable() {
  try {
    // Property access which throws if developer mode is not enabled.
    chrome.userScripts;
    return true;
  } catch {
    // Not available.
    return false;
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if(details.reason !== "install" && details.reason !== "update") return;

  if (!isUserScriptsAvailable()) {
    console.log("userScripts API is not available.");
    // options.htmlを開く。
    chrome.runtime.openOptionsPage();
    return;
  }

  await chrome.userScripts.unregister();
  console.log("Unregistered all");

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
    console.log(`Registered: "${host}" | ${JSON.stringify(js)}`);
  }
});


chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log("onMessage", message);
  if (message.type === "registerjs") {
    if (!isUserScriptsAvailable()) {
      console.log("userScripts API is not available.");
      return;
    }


    var host = message.host;
    var js = message.js;

    try {
      await chrome.userScripts.unregister({
        ids: [host],
      });
      console.log(`Unregistered: "${host}"`);
    }
    catch (error) {
      console.error("unregister error", error);
    }

    if (js == null || js === "") {
      return;
    }

    await chrome.userScripts.register([{
      id: host,
      matches: [`*://${host}/*`],
      js: [{code: js}],
    }]);
    console.log(`Registered: "${host}" | ${JSON.stringify(js)}`);
  }
});