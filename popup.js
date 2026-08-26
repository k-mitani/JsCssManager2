function on($el, eventName, method) {
    $el.addEventListener(eventName, method);
}

const MESSAGE_HOLD_MS = 500;

var _fadeTimerId = 0;
function setMessage(text, isError) {
    clearTimeout(_fadeTimerId);
    $labelMessage.textContent = text;
    $labelMessage.title = isError ? text : "";
    $labelMessage.classList.toggle("error", !!isError);
    $labelMessage.classList.remove("fade");

    if (isError) return;

    _fadeTimerId = setTimeout(() => $labelMessage.classList.add("fade"), MESSAGE_HOLD_MS);
}

function setErrorMessage(text) {
    setMessage(text, true);
}

var activeTab = null;

var $textHost = document.querySelector(".textHost");
var $labelMessage = document.querySelector(".labelMessage");
var $textCss = document.querySelector(".textCss");
var $textJs = document.querySelector(".textJs");
var $selectWorld = document.querySelector(".selectWorld");
var $buttonSave = document.querySelector(".buttonSave");
var $buttonClose = document.querySelector(".buttonClose");

(async function() {
    var tabs = await chrome.tabs.query({active: true, currentWindow: true});
    activeTab = tabs[0];

    var host = new URL(activeTab.url).host;
    $textHost.value = host;

    var data = await Storage.get(host);
    console.log(`gethost: data of '${host}': ${JSON.stringify(data)}`);
    if (data == null) {
        $selectWorld.value = DEFAULT_WORLD;
        setMessage("no data");
        return;
    }

    $textCss.value = data.css || "";
    $textJs.value = data.js || "";
    $selectWorld.value = normalizeWorld(data.world);
})();

on($buttonSave, "click", save);
on($textCss, "keydown", onKeyDown);
on($textJs, "keydown", onKeyDown);
on($selectWorld, "keydown", onKeyDown);

function onKeyDown(ev) {
    // Ctrl + Enter で保存する。
    if (ev.ctrlKey && ev.key == "Enter") {
        ev.preventDefault();
        save();
    }
}

async function save() {
    console.log("save: click");
    
    var css = $textCss.value;
    var js = $textJs.value;
    var host = $textHost.value;
    var world = $selectWorld.value;

    // 空なら削除する。
    try {
        if (css === "" && js === "") {
            await Storage.remove(host);
            console.log("save: done(remove): " + host);
            setMessage("removed.");
        }
        // 空でないなら保存する。
        else {
            await Storage.set(host, js, css, world);
            console.log("save: done: " + JSON.stringify({host, js, css, world}));
            setMessage("saved.");
        }
    } catch (error) {
        // 容量超過(1項目8KB / 全体100KB / 512項目)などで失敗する。
        console.error("save: storage failed", error);
        setErrorMessage("Save failed: " + error.message);
        return;
    }

    // swに通知する。
    const res = await chrome.runtime.sendMessage({type: "registerjs", host, js, world});
    if (res != null && res.ok === false) {
        console.error("save: registerjs failed: " + res.error);
        setErrorMessage("JS failed: " + res.error);
    }

    // 現在のタブに通知する。
    if (activeTab == null) {
        console.log("save: tab is null");
    }
    else {
        chrome.tabs.sendMessage(activeTab.id, {type: "applycss"});
        console.log("save: sendMessage to tab: " + activeTab.id);
    }
}

on($buttonClose, "click", () => {
    window.close();
});
