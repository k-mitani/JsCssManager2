// マジックボタン: ポップアップから現在のタブで任意のJSを実行する(簡易ブックマークレット)。
// popup.js の on / showMessage / $labelMessage を使う。

const RESULT_HOLD_MS = 3000;

var $magicButtons = document.querySelector(".magicButtons");
var $buttonAddMagic = document.querySelector(".buttonAddMagic");
var $buttonEditMode = document.querySelector(".buttonEditMode");
var $magicEditor = document.querySelector(".magicEditor");
var $textMagicLabel = document.querySelector(".textMagicLabel");
var $textMagicHosts = document.querySelector(".textMagicHosts");
var $selectMagicWorld = document.querySelector(".selectMagicWorld");
var $checkMagicClose = document.querySelector(".checkMagicClose");
var $checkMagicSaveResult = document.querySelector(".checkMagicSaveResult");
var $textMagicJs = document.querySelector(".textMagicJs");
var $buttonMagicSave = document.querySelector(".buttonMagicSave");
var $buttonMagicRun = document.querySelector(".buttonMagicRun");
var $buttonMagicClose = document.querySelector(".buttonMagicClose");
var $labelMagicMessage = document.querySelector(".labelMagicMessage");
var $magicLastResult = document.querySelector(".magicLastResult");
var $labelLastResultTime = document.querySelector(".labelLastResultTime");
var $labelLastResult = document.querySelector(".labelLastResult");
var $buttonCopyLastResult = document.querySelector(".buttonCopyLastResult");
var $sessionResult = document.querySelector(".sessionResult");
var $labelSessionResult = document.querySelector(".labelSessionResult");
var $buttonCopySessionResult = document.querySelector(".buttonCopySessionResult");
var $buttonMagicDelete = document.querySelector(".buttonMagicDelete");

var magicTab = null;
var magicHost = "";
// 編集中のボタン。新規のときは order を持たない。
var editingButton = null;

(async function() {
    var tabs = await chrome.tabs.query({active: true, currentWindow: true});
    magicTab = tabs[0];
    try {
        magicHost = new URL(magicTab.url).host;
    } catch {
        magicHost = "";
    }
    await refreshMagicButtons();
})();

// 表示中のボタン(現在のホストに該当するもの)。表示順。
var visibleButtons = [];

async function refreshMagicButtons() {
    var buttons = await MagicButtons.getAll();
    visibleButtons = buttons.filter(button => MagicButtons.matches(button, magicHost));
    $magicButtons.textContent = "";
    for (const button of visibleButtons) {
        var $button = document.createElement("button");
        $button.className = "magicButton";
        $button.textContent = button.label || "(no name)";
        $button.title = `${button.label}\n[${button.world}] ${button.hosts}\n(Right click or ✎ to edit)`;
        on($button, "click", () => {
            if (isEditMode) openEditor(button);
            else runMagic(button, [$labelMessage]);
        });
        on($button, "contextmenu", (ev) => {
            ev.preventDefault();
            openEditor(button);
        });
        setupDrag($button, button);
        $button.dataset.id = button.id;
        $magicButtons.appendChild($button);
    }
    updateEditingMark();
}

// chrome.userScripts.execute は Chrome 135 以降。
// APIが無効なとき chrome.userScripts は undefined になるので例外で判定する。
function isExecuteAvailable() {
    try {
        return typeof chrome.userScripts.execute === "function";
    } catch {
        return false;
    }
}

function stringifyResult(result, indent) {
    if (result === undefined) return "";
    // 文字列は "" で囲まずにそのまま出す。
    if (typeof result === "string") return result;
    var text;
    try {
        text = JSON.stringify(result, null, indent);
    } catch {
        text = String(result);
    }
    if (text == null) text = String(result);
    return text;
}

const ERROR_MARKER = "__jsCssManagerMagicError__";

// 実行中の例外は userScripts.execute では null になってしまうので、
// try/catch で包んでエラー内容を結果として返す。
// try文の完了値はブロックの最後の式の値になるので、通常の結果はそのまま返る。
// (構文エラーは包んでも捕まえられない。)
function wrapCode(code) {
    // 行番号がずれないように try { は1行目に置く。
    return `try {${code}\n} catch (e) {\n` +
        `({${ERROR_MARKER}: {message: String(e), stack: (e && e.stack) ? String(e.stack) : String(e)}});\n}`;
}

// $statusLabels には done. / error. だけを出し、結果そのものは
// 下部の「今回の実行結果」と、エディタの「最後の実行結果」に出す。
async function runMagic(button, $statusLabels) {
    var finish = async (isError, text, fullText = text) => {
        for (const $label of $statusLabels) {
            showMessage($label, isError ? "error." : "done.", isError, RESULT_HOLD_MS);
        }
        showSessionResult(isError, text, fullText);
        await recordLastResult(button, isError, fullText);
    };
    if (!isExecuteAvailable()) {
        await finish(true,
            "chrome.userScripts.execute is not available. " +
            "Use Chrome 135+ and enable \"Allow User Scripts\" in chrome://extensions.");
        return;
    }
    if (magicTab == null) {
        await finish(true, "No active tab.");
        return;
    }

    var results;
    try {
        results = await chrome.userScripts.execute({
            target: {tabId: magicTab.id},
            js: [{code: wrapCode(button.js || "")}],
            world: normalizeWorld(button.world),
            injectImmediately: true,
        });
    } catch (error) {
        console.error("runMagic: failed", error);
        await finish(true, "Run failed: " + error.message);
        return;
    }

    var first = results && results[0];
    if (first != null && first.error != null) {
        // "Error: ..." の形ならそのまま出す。
        var errorText = String(first.error);
        await finish(true, /^(Uncaught )?\w*Error\b/.test(errorText) ? errorText : "Error: " + errorText);
        return;
    }

    var result = first && first.result;
    // wrapCode で捕まえた例外。
    if (result != null && typeof result === "object" && ERROR_MARKER in result) {
        var caught = result[ERROR_MARKER];
        await finish(true, caught.message, caught.stack || caught.message);
        return;
    }
    if (result === undefined) await finish(false, "(undefined)");
    else await finish(false, stringifyResult(result), stringifyResult(result, 2));

    if (button.closeAfterRun) window.close();
}

// 下部に、このポップアップで最後に実行した結果を1行で出す。(保存はしない。)
var sessionResultText = "";
function showSessionResult(isError, text, fullText) {
    sessionResultText = fullText;
    $sessionResult.hidden = false;
    $labelSessionResult.textContent = text;
    $labelSessionResult.title = fullText;
    $labelSessionResult.classList.toggle("error", isError);
}

on($buttonCopySessionResult, "click", () => copyText(sessionResultText, $labelMessage));

async function copyText(text, $label) {
    try {
        await navigator.clipboard.writeText(text);
        showMessage($label, "copied.");
    } catch (error) {
        showMessage($label, "Copy failed: " + error.message, true);
    }
}

// 保存しない設定でも、編集中ならその場では表示する。
async function recordLastResult(button, isError, text) {
    // v: 文字列を "" で囲まずに保存する形式。
    var lastResult = {v: 2, time: new Date().toISOString(), isError, text};
    if (button.saveResult === true) {
        try {
            await MagicButtons.setLastResult(button.id, lastResult);
        } catch (error) {
            console.error("recordLastResult: storage failed", error);
        }
    }
    if (editingButton != null && editingButton.id === button.id) showLastResult(lastResult);
}

function showLastResult(lastResult) {
    $magicLastResult.hidden = lastResult == null;
    if (lastResult == null) return;
    $labelLastResultTime.textContent = "(" + new Date(lastResult.time).toLocaleString() + ")";
    $labelLastResult.textContent = lastResult.v == null ? unquoteOldResult(lastResult.text) : lastResult.text;
    $labelLastResult.classList.toggle("error", lastResult.isError === true);
}

// 古い形式では文字列の結果を "..." のJSONで保存していたので外す。
function unquoteOldResult(text) {
    if (!/^".*"$/s.test(text)) return text;
    try {
        var value = JSON.parse(text);
        return typeof value === "string" ? value : text;
    } catch {
        return text;
    }
}

async function loadLastResult(id) {
    showLastResult(null);
    var lastResult = await MagicButtons.getLastResult(id);
    // 読み込み中に別のボタンの編集に切り替わっていたら表示しない。
    if (editingButton == null || editingButton.id !== id) return;
    showLastResult(lastResult);
}

// ---- Drag & Drop -------------------------------------------------------

var draggingId = null;

function clearDropMarks() {
    for (const $el of $magicButtons.querySelectorAll(".dropBefore, .dropAfter")) {
        $el.classList.remove("dropBefore", "dropAfter");
    }
}

// 右から左へ並ぶので、ボタンの右半分なら前、左半分なら後ろに入れる。
function isDropAfter($button, ev) {
    var rect = $button.getBoundingClientRect();
    return ev.clientX < rect.left + rect.width / 2;
}

// 並べ替えは編集モード中だけ。(スマホでの誤操作を防ぐ。)
function setupDrag($button, button) {
    $button.draggable = isEditMode;

    on($button, "dragstart", (ev) => {
        draggingId = button.id;
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", button.label || "");
        $button.classList.add("dragging");
    });

    on($button, "dragend", () => {
        draggingId = null;
        $button.classList.remove("dragging");
        clearDropMarks();
    });

    on($button, "dragover", (ev) => {
        if (draggingId == null) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        clearDropMarks();
        if (draggingId === button.id) return;
        $button.classList.add(isDropAfter($button, ev) ? "dropAfter" : "dropBefore");
    });

    on($button, "dragleave", () => {
        $button.classList.remove("dropBefore", "dropAfter");
    });

    on($button, "drop", (ev) => {
        if (draggingId == null) return;
        ev.preventDefault();
        var fromId = draggingId;
        var after = isDropAfter($button, ev);
        clearDropMarks();
        if (fromId === button.id) return;
        moveMagicButton(fromId, button.id, after);
    });
}

async function moveMagicButton(fromId, toId, after) {
    var buttons = visibleButtons.slice();
    var from = buttons.findIndex(b => b.id === fromId);
    if (from < 0) return;
    var [moved] = buttons.splice(from, 1);
    var to = buttons.findIndex(b => b.id === toId);
    if (to < 0) return;
    buttons.splice(after ? to + 1 : to, 0, moved);

    // 表示中のボタンが使っていたorderの値を並べ直して割り当てる。
    // (他のホスト向けで非表示のボタンとの前後関係は崩さない。)
    var orders = visibleButtons.map(b => b.order || 0).sort((a, b) => a - b);
    var prev = -Infinity;
    var changed = buttons.map((b, i) => {
        var order = Math.max(orders[i], prev + 1);
        prev = order;
        return {...b, order};
    });

    // 編集中のボタンを後で保存したときに元の位置に戻らないようにする。
    if (editingButton != null) {
        var edited = changed.find(b => b.id === editingButton.id);
        if (edited != null) editingButton.order = edited.order;
    }

    try {
        await MagicButtons.setMany(changed);
    } catch (error) {
        console.error("moveMagicButton: storage failed", error);
        showMessage($labelMessage, "Move failed: " + error.message, true);
    }
    await refreshMagicButtons();
}

// ---- Editor ------------------------------------------------------------

function openEditor(button) {
    editingButton = button || {
        id: MagicButtons.newId(),
        label: "",
        hosts: magicHost,
        js: "",
        world: DEFAULT_WORLD,
        closeAfterRun: false,
        saveResult: false,
    };
    $textMagicLabel.value = editingButton.label || "";
    $textMagicHosts.value = editingButton.hosts || "";
    $selectMagicWorld.value = normalizeWorld(editingButton.world);
    $checkMagicClose.checked = editingButton.closeAfterRun === true;
    $checkMagicSaveResult.checked = editingButton.saveResult === true;
    $textMagicJs.value = editingButton.js || "";
    // 新規のときは削除できない。
    $buttonMagicDelete.style.display = button ? "" : "none";
    loadLastResult(editingButton.id);
    $magicEditor.hidden = false;
    document.body.classList.add("editingMagic");
    updateEditingMark();
    $textMagicLabel.focus();
}

// 編集画面で開いているボタンに印を付ける。
function updateEditingMark() {
    for (const $button of $magicButtons.querySelectorAll(".magicButton")) {
        $button.classList.toggle("editing", editingButton != null && $button.dataset.id === editingButton.id);
    }
}

function closeEditor() {
    editingButton = null;
    $magicEditor.hidden = true;
    document.body.classList.remove("editingMagic");
    updateEditingMark();
}

function readEditor() {
    return {
        ...editingButton,
        label: $textMagicLabel.value,
        hosts: $textMagicHosts.value.trim(),
        world: $selectMagicWorld.value,
        closeAfterRun: $checkMagicClose.checked,
        saveResult: $checkMagicSaveResult.checked,
        js: $textMagicJs.value,
    };
}

async function saveMagic() {
    if (editingButton == null) return;
    var button = readEditor();
    if (button.label.trim() === "") {
        showMessage($labelMagicMessage, "Text is empty.", true);
        $textMagicLabel.focus();
        return;
    }
    // 新規は末尾に置く。一度決めたら保存し直しても位置は変えない。
    if (!button.order) button.order = Date.now();
    try {
        await MagicButtons.set(button);
        // 保存しない設定にしたら、保存済みの結果も消す。(表示中の結果はそのまま。)
        if (!button.saveResult) await MagicButtons.removeLastResult(button.id);
    } catch (error) {
        // 容量超過(1項目8KB / 全体100KB / 512項目)などで失敗する。
        console.error("saveMagic: storage failed", error);
        showMessage($labelMagicMessage, "Save failed: " + error.message, true);
        return;
    }
    // 保存してもエディタは閉じない。
    editingButton = button;
    $buttonMagicDelete.style.display = "";
    await refreshMagicButtons();
    showMessage($labelMagicMessage, "saved.");
}

on($buttonAddMagic, "click", () => openEditor(null));

// 編集モード: ボタンを押すと実行せずに編集画面を開く。(右クリックできないスマホ向け。)
var isEditMode = false;
on($buttonEditMode, "click", () => {
    isEditMode = !isEditMode;
    document.body.classList.toggle("magicEditMode", isEditMode);
    $buttonEditMode.classList.toggle("active", isEditMode);
    for (const $button of $magicButtons.querySelectorAll(".magicButton")) {
        $button.draggable = isEditMode;
    }
});
on($buttonMagicSave, "click", saveMagic);
on($buttonMagicClose, "click", closeEditor);

on($buttonCopyLastResult, "click", () => copyText($labelLastResult.textContent, $labelMagicMessage));
on($buttonMagicRun, "click", runEditingMagic);

// 保存せずに編集中の内容を試す。
function runEditingMagic() {
    if (editingButton == null) return;
    runMagic({...readEditor(), closeAfterRun: false}, [$labelMagicMessage, $labelMessage]);
}


on($buttonMagicDelete, "click", async () => {
    if (editingButton == null) return;
    if (!confirm(`Delete "${editingButton.label}"?`)) return;
    try {
        await MagicButtons.remove(editingButton.id);
    } catch (error) {
        showMessage($labelMagicMessage, "Delete failed: " + error.message, true);
        return;
    }
    closeEditor();
    await refreshMagicButtons();
    showMessage($labelMessage, "deleted.");
});

on($magicEditor, "keydown", (ev) => {
    if (!ev.ctrlKey || ev.key !== "Enter") return;
    ev.preventDefault();
    // Ctrl + Shift + Enter で実行、Ctrl + Enter で保存する。
    if (ev.shiftKey) runEditingMagic();
    else saveMagic();
});
