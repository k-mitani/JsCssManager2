console.log("start.")
var app = new Vue({
  el: "#app",
  data: {
    host: "",
    hostCss: "",
    hostJs: "",
    hostData: null,
    message: "",
  },
  methods: {
    save: function() {
      console.log("save: click");
      this.message = "saving...";
      var data = {};
      data[this.host] = this.hostData || {};
      data[this.host].css = this.hostCss;
      data[this.host].js = this.hostJs;

      // 空なら削除する。
      if (this.hostCss == "" && this.hostJs == "") {
        chrome.storage.sync.remove(this.host, res => {
          console.log("save: done(remove): " + this.host);
          this.message = "removed.";
          chrome.tabs.executeScript(null, {
            code: "document.dispatchEvent(new Event('updatecss'))",
          });
        });
      }
      // 空でないなら保存する。
      else {
        chrome.storage.sync.set(data, res => {
          console.log("save: done: " + JSON.stringify(data));
          this.message = "saved.";
          chrome.tabs.executeScript(null, {
            code: "document.dispatchEvent(new Event('updatecss'))",
          });
        });
      }
    },
    close: function() {
      window.close();
    },
  },
});

chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  console.log("gethost: start");
  
  var activeTab = tabs[0];
  app.host = new URL(activeTab.url).host;
  console.log("gethost: " + app.host);

  chrome.storage.sync.get(app.host, function(res) {
    var data = res[app.host];
    console.log(`gethost: data of '${app.host}': ${JSON.stringify(data)}`);
    if (data == null) {
      app.message = "(no data)";
      return;
    }
    app.hostCss = data.css;
    app.hostJs = data.js;
    app.hostData = data;
  });
});