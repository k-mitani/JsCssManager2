importScripts("./storage.js");

Log.watch();

const USER_SCRIPTS_DISABLED_MESSAGE =
  "userScripts API is not available. " +
  "Enable \"Allow User Scripts\" on this extension's details page in chrome://extensions.";

// APIが使えるかどうかを判定する。
// chrome.userScripts はAPIが無効なとき例外ではなく undefined になるため、
// プロパティアクセスではなくメソッド呼び出しで判定する。
// (拡張機能の詳細ページの「ユーザー スクリプトを許可 / Allow User Scripts」が必要。)
function isUserScriptsAvailable() {
  try {
    chrome.userScripts.getScripts();
    return true;
  } catch {
    // Not available.
    return false;
  }
}

function toMatchPattern(host) {
  return `*://${host}/*`;
}

// ストレージの内容に合わせてユーザースクリプトを登録し直す。
async function registerAll() {
  await chrome.userScripts.unregister();
  Log.info("Unregistered all");

  const all = await Storage.getAll();
  for (const host in all) {
    const js = all[host]?.js;
    if (js == null || js === "") continue;
    const world = normalizeWorld(all[host]?.world);

    try {
      await chrome.userScripts.register([{
        id: host,
        matches: [toMatchPattern(host)],
        js: [{code: js}],
        world: world,
      }]);
      Log.info(`Registered: "${host}" (${world}) | ${JSON.stringify(js)}`);
    } catch (error) {
      // 1件失敗しても残りの登録は続ける。
      Log.error(`Register failed: "${host}" | ${error.message}`);
    }
  }
}

async function onInstalledOrStartup(shouldOpenOptions) {
  if (!isUserScriptsAvailable()) {
    Log.error(USER_SCRIPTS_DISABLED_MESSAGE);
    // options.htmlを開く。
    if (shouldOpenOptions) chrome.runtime.openOptionsPage();
    return;
  }
  try {
    await registerAll();
  } catch (error) {
    Log.error(`registerAll failed: ${error.message}`);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install" && details.reason !== "update") return;
  onInstalledOrStartup(true);
});

// 登録は永続化されるが、トグルを後から有効にした場合などのために起動時にも同期する。
chrome.runtime.onStartup.addListener(() => onInstalledOrStartup(false));

async function registerJs(host, js, world) {
  world = normalizeWorld(world);

  if (!isUserScriptsAvailable()) {
    throw new Error(USER_SCRIPTS_DISABLED_MESSAGE);
  }

  try {
    await chrome.userScripts.unregister({ids: [host]});
    Log.info(`Unregistered: "${host}"`);
  } catch (error) {
    // 未登録の場合はここに来るので、失敗しても続行する。
    console.log("unregister skipped", error.message);
  }

  if (js == null || js === "") return;

  await chrome.userScripts.register([{
    id: host,
    matches: [toMatchPattern(host)],
    js: [{code: js}],
    world: world,
  }]);
  Log.info(`Registered: "${host}" (${world}) | ${JSON.stringify(js)}`);
}

// asyncな関数を直接リスナーにするとPromiseを返してしまい応答チャンネルが即閉じるので、
// 同期関数にして true を返す。
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("onMessage", message);
  if (message.type === "registerall") {
    (async () => {
      if (!isUserScriptsAvailable()) throw new Error(USER_SCRIPTS_DISABLED_MESSAGE);
      await registerAll();
    })()
      .then(() => sendResponse({ok: true}))
      .catch((error) => {
        Log.error(`Register all failed: ${error.message}`);
        sendResponse({ok: false, error: error.message});
      });
    return true;
  }

  if (message.type !== "registerjs") return;

  registerJs(message.host, message.js, message.world)
    .then(() => sendResponse({ok: true}))
    .catch((error) => {
      Log.error(`Save failed: "${message.host}" | ${error.message}`);
      sendResponse({ok: false, error: error.message});
    });
  return true;
});
