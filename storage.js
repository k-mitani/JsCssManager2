class Storage {
    static async get(host) {
        var res = await chrome.storage.sync.get(host);
        return res[host];
    }

    static async set(host, js, css) {
        var data = await this.get(host) || {};
        data.js = js;
        data.css = css;
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
