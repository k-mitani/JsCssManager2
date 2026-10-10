const WORLDS = ["MAIN", "USER_SCRIPT"];
const DEFAULT_WORLD = "MAIN";

function normalizeWorld(world) {
    return WORLDS.includes(world) ? world : DEFAULT_WORLD;
}

class Storage {
    static async get(host) {
        var res = await chrome.storage.sync.get(host);
        return res[host];
    }

    static async set(host, js, css, world) {
        var data = await this.get(host) || {};
        data.js = js;
        data.css = css;
        data.world = normalizeWorld(world);
        await chrome.storage.sync.set({[host]: data});
    }

    static async remove(host) {
        await chrome.storage.sync.remove(host);
    }

    // ホストごとの設定だけを返す。(マジックボタンのキーは除く。)
    static async getAll() {
        var res = await chrome.storage.sync.get();
        for (const key in res) {
            if (MagicButtons.isKey(key)) delete res[key];
        }
        return res;
    }
}

// ポップアップから手動で実行するJS(簡易ブックマークレット)。
// syncの1項目8KB制限に掛かりにくいように、1ボタン1キーで保存する。
class MagicButtons {
    static PREFIX = "__magic__:";
    // 対象ホストにこれを指定すると全ホストで表示する。
    static ALL_HOSTS = "*";

    static isKey(key) {
        return key.startsWith(MagicButtons.PREFIX);
    }

    static newId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    // 表示順に並べて返す。
    static async getAll() {
        var res = await chrome.storage.sync.get();
        var buttons = [];
        for (const key in res) {
            if (!MagicButtons.isKey(key)) continue;
            buttons.push({...res[key], id: key.slice(MagicButtons.PREFIX.length)});
        }
        buttons.sort((a, b) => (a.order || 0) - (b.order || 0));
        return buttons;
    }

    static toData(button) {
        return {
            label: button.label,
            hosts: button.hosts,
            js: button.js,
            world: normalizeWorld(button.world),
            closeAfterRun: button.closeAfterRun === true,
            // 最後の実行結果をローカルに保存するか。(未設定は保存しない。)
            saveResult: button.saveResult === true,
            order: button.order || Date.now(),
        };
    }

    static async set(button) {
        await MagicButtons.setMany([button]);
    }

    // 書き込み回数の制限に掛からないように、まとめて1回で保存する。
    static async setMany(buttons) {
        var items = {};
        for (const button of buttons) {
            items[MagicButtons.PREFIX + button.id] = MagicButtons.toData(button);
        }
        await chrome.storage.sync.set(items);
    }

    static async remove(id) {
        await chrome.storage.sync.remove(MagicButtons.PREFIX + id);
        await MagicButtons.removeLastResult(id);
    }

    // 最後の実行結果。容量の大きいlocalに保存する。(端末ごとで同期はしない。)
    static RESULT_PREFIX = "__magicResult__:";
    static RESULT_MAX_LENGTH = 4000;

    static async getLastResult(id) {
        var key = MagicButtons.RESULT_PREFIX + id;
        var res = await chrome.storage.local.get(key);
        return res[key];
    }

    // result: {time, isError, text}
    static async setLastResult(id, result) {
        var chars = Array.from(result.text);
        if (chars.length > MagicButtons.RESULT_MAX_LENGTH) {
            result = {...result, text: chars.slice(0, MagicButtons.RESULT_MAX_LENGTH).join("") + "..."};
        }
        await chrome.storage.local.set({[MagicButtons.RESULT_PREFIX + id]: result});
    }

    static async removeLastResult(id) {
        await chrome.storage.local.remove(MagicButtons.RESULT_PREFIX + id);
    }

    // hostsはカンマ/空白区切り。"*" は全ホスト、"*.example.com" のようなワイルドカードも使える。
    static matches(button, host) {
        var patterns = (button.hosts || "").split(/[\s,]+/).filter(p => p !== "");
        if (patterns.length === 0) return true;
        return patterns.some(p => {
            if (p === MagicButtons.ALL_HOSTS) return true;
            var re = new RegExp("^" + p.split("*").map(escapeRegExp).join(".*") + "$", "i");
            return re.test(host);
        });
    }
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Service Workerのログをストレージに残して、options画面から見られるようにする。
class Log {
    static AREA = chrome.storage.session;
    static KEY = "__log__";
    static ENABLED_KEY = "__logEnabled__";
    static MAX = 200;
    // 追記が競合しないように直列化する。
    static _queue = Promise.resolve();
    static _enabled = null;

    static async isEnabled() {
        if (Log._enabled === null) {
            var res = await Log.AREA.get(Log.ENABLED_KEY);
            Log._enabled = res[Log.ENABLED_KEY] === true;
        }
        return Log._enabled;
    }

    static async setEnabled(enabled) {
        Log._enabled = enabled === true;
        await Log.AREA.set({[Log.ENABLED_KEY]: Log._enabled});
    }

    static async getAll() {
        var res = await Log.AREA.get(Log.KEY);
        return res[Log.KEY] || [];
    }

    static add(level, message) {
        Log._queue = Log._queue
            .then(async () => {
                if (!await Log.isEnabled()) return;
                var entries = await Log.getAll();
                entries.push({time: new Date().toISOString(), level, message});
                if (entries.length > Log.MAX) entries = entries.slice(-Log.MAX);
                await Log.AREA.set({[Log.KEY]: entries});
            })
            .catch(() => {});
        return Log._queue;
    }

    static info(message) {
        console.log(message);
        return Log.add("INFO", message);
    }

    static error(message) {
        console.error(message);
        return Log.add("ERROR", message);
    }

    static async clear() {
        await Log.AREA.remove(Log.KEY);
    }

    // 他のコンテキストで切り替えられたときにキャッシュを合わせる。
    // (コンテンツスクリプトでは不要なので、swとoptionsから明示的に呼ぶ。)
    static watch() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "session") return;
            const change = changes[Log.ENABLED_KEY];
            if (change != null) Log._enabled = change.newValue === true;
        });
    }
}
