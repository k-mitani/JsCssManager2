console.log("start.")
var app = new Vue({
  el: "#app",
  data: {
    host: "",
    hostCss: "",
    importCssText: "",
    exportCssText: "",
    errorText: null,
  },
  computed: {
    hasError: function() {
      return this.errorText != null;
    },
  },
  methods: {
    // 入力された設定をストレージに書き込みます。
    importCss: function() {
      this.errorText = null;
      try {
        // 入力テキストをJSONに変換する。
        var data = JSON.parse(this.importCssText);
        // ストレージに書き込む。
        chrome.storage.sync.set(data, (res) => {
          // 終わったら表示を更新する。
          this.refreshCurrentCssText();
        });
      } catch (error) {
        this.errorText = error.stack;
      }
    },
    // ストレージの内容を表示します。
    refreshCurrentCssText: function() {
      chrome.storage.sync.get((res) => {
        var json = JSON.stringify(res);
        this.exportCssText = json;
      });
    },
    save: function() {
    },
    cancel: function() {
    },
  },
});

app.refreshCurrentCssText();
