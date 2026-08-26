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

    static async getAll() {
        var res = await chrome.storage.sync.get();
        return res;
    }
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
