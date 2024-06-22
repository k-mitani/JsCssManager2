function on($el, eventName, method) {
    $el.addEventListener(eventName, method);
}

var _messageAnimationId = 0;
function setMessage(text) {
    var id = ++_messageAnimationId;
    $labelMessage.textContent = text;
    
    var opacity = 1;
    $labelMessage.style.opacity = opacity;
    setTimeout(() => {
        var intervalId = setInterval(() => {
            if (id !== _messageAnimationId) {
                clearInterval(intervalId);
                return;
            }
            opacity -= 0.2;
            $labelMessage.style.opacity = opacity;
            $labelMessage.textContent = text;
        }, 100);
    }, 500);
}

var hostData = {};

var $textHost = document.querySelector(".textHost");
var $labelMessage = document.querySelector(".labelMessage");
var $textCss = document.querySelector(".textCss");
var $textJs = document.querySelector(".textJs");
var $buttonSave = document.querySelector(".buttonSave");
var $buttonClose = document.querySelector(".buttonClose");

(async function() {
    var tabs = await chrome.tabs.query({active: true, currentWindow: true});
    console.log("gethost: start");
    
    var activeTab = tabs[0];
    var host = new URL(activeTab.url).host;
    $textHost.value = host;
    console.log("gethost: " + host);

    var data = await Storage.get(host);
    console.log(`gethost: data of '${host}': ${JSON.stringify(data)}`);
    if (data == null) {
        setMessage("no data");
        return;
    }

    $textCss.value = data.css;
    $textJs.value = data.js;
    hostData = data;
})();

on($buttonSave, "click", save);
on($textCss, "keydown", onKeyDown);
on($textJs, "keydown", onKeyDown);

function onKeyDown(ev) {
    // Ctrl + Enter で保存する。
    if (ev.ctrlKey && ev.key == "Enter") {
        ev.preventDefault();
        save(ev);
    }
}

async function save(ev) {
    console.log("save: click");
    setMessage("saving...");
    
    var css = $textCss.value;
    var js = $textJs.value;
    var host = $textHost.value;

    // 空なら削除する。
    if (css === "" && js === "") {
        await Storage.remove(host);
        console.log("save: done(remove): " + host);
        setMessage("removed.");
    }
    // 空でないなら保存する。
    else {
        await Storage.set(host, js, css);
        console.log("save: done: " + JSON.stringify({host, js, css}));
        setMessage("saved.");
    }

    // swに通知する。
    chrome.runtime.sendMessage({type: "registerjs", host, js});

    // 現在のタブに通知する。
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    if (tab == null) {
        console.log("save: tab is null");
    }
    else {
        chrome.tabs.sendMessage(tab.id, {type: "applycss"});
        console.log("save: sendMessage to tab: " + tab.id);
    }
}

on($buttonClose, "click", () => {
    window.close();
});
