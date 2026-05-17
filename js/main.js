//=============================================================================
// main.js v1.9.0
//=============================================================================

const scriptUrls = [
    "js/libs/pixi.js",
    "js/libs/pako.min.js",
    "js/libs/localforage.min.js",
    "js/libs/effekseer.min.js",
    "js/libs/vorbisdecoder.js",
    "js/rmmz_core.js",
    "js/rmmz_managers.js",
    "js/rmmz_objects.js",
    "js/rmmz_scenes.js",
    "js/rmmz_sprites.js",
    "js/rmmz_windows.js",
    "js/plugins.js"
];
const effekseerWasmUrl = "js/libs/effekseer.wasm";

class Main {
    constructor() {
        this.xhrSucceeded = false;
        this.xhrCompleted = false;
        this.loadCount = 0;
        this.error = null;
        this._bootFinalized = false;
    }

    run() {
        this.showLoadingSpinner();
        this.testXhr();
        this.hookNwjsClose();
        this.loadMainScripts();
    }

    showLoadingSpinner() {
        const loadingSpinner = document.createElement("div");
        const loadingSpinnerImage = document.createElement("div");
        loadingSpinner.id = "loadingSpinner";
        loadingSpinnerImage.id = "loadingSpinnerImage";
        loadingSpinner.appendChild(loadingSpinnerImage);
        document.body.appendChild(loadingSpinner);
    }

    eraseLoadingSpinner() {
        const loadingSpinner = document.getElementById("loadingSpinner");
        if (loadingSpinner) {
            document.body.removeChild(loadingSpinner);
        }
    }

    testXhr() {
        const xhr = new XMLHttpRequest();
        // 動態插入時 document.currentScript 常為 null，改以同源 js/main.js 探測 XHR。
        const probeUrl =
            (document.currentScript && document.currentScript.src) ||
            new URL("js/main.js", document.baseURI).href;
        xhr.open("GET", probeUrl);
        const done = () => {
            this.xhrCompleted = true;
            this.finalizeBoot();
        };
        xhr.onload = () => {
            this.xhrSucceeded = true;
            done();
        };
        xhr.onerror = xhr.onabort = () => {
            this.xhrSucceeded = false;
            done();
        };
        xhr.send();
    }

    hookNwjsClose() {
        // [Note] When closing the window, the NW.js process sometimes does
        //   not terminate properly. This code is a workaround for that.
        if (typeof nw === "object") {
            nw.Window.get().on("close", () => nw.App.quit());
        }
    }

    loadMainScripts() {
        for (const url of scriptUrls) {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = url;
            script.async = false;
            script.defer = true;
            script.onload = this.onScriptLoad.bind(this);
            script.onerror = this.onScriptError.bind(this);
            script._url = url;
            document.body.appendChild(script);
        }
        this.numScripts = scriptUrls.length;
        window.addEventListener("load", this.onWindowLoad.bind(this));
        window.addEventListener("error", this.onWindowError.bind(this));
    }

    // main.js 若由登入後才插入，window「load」已觸發過；改為腳本與 XHR 都完成再啟動 Effekseer。
    finalizeBoot() {
        if (this._bootFinalized) return;
        if (!this.xhrCompleted || this.loadCount !== this.numScripts) return;

        if (!this.xhrSucceeded) {
            this._bootFinalized = true;
            const message = "Your browser does not allow to read local files.";
            this.printError("Error", message);
            return;
        }
        if (this.isPathRandomized()) {
            this._bootFinalized = true;
            const message = "Please move the Game.app to a different folder.";
            this.printError("Error", message);
            return;
        }
        if (this.error) {
            this._bootFinalized = true;
            this.printError(this.error.name, this.error.message);
            return;
        }
        this._bootFinalized = true;
        this.initEffekseerRuntime();
    }

    onScriptLoad() {
        if (++this.loadCount === this.numScripts) {
            PluginManager.setup($plugins);
        }
        this.finalizeBoot();
    }

    onScriptError(e) {
        this.printError("Failed to load", e.target._url);
    }

    printError(name, message) {
        this.eraseLoadingSpinner();
        if (!document.getElementById("errorPrinter")) {
            const errorPrinter = document.createElement("div");
            errorPrinter.id = "errorPrinter";
            errorPrinter.innerHTML = this.makeErrorHtml(name, message);
            document.body.appendChild(errorPrinter);
        }
    }

    makeErrorHtml(name, message) {
        const nameDiv = document.createElement("div");
        const messageDiv = document.createElement("div");
        nameDiv.id = "errorName";
        messageDiv.id = "errorMessage";
        nameDiv.innerHTML = name;
        messageDiv.innerHTML = message;
        return nameDiv.outerHTML + messageDiv.outerHTML;
    }

    onWindowLoad() {
        this.finalizeBoot();
    }

    onWindowError(event) {
        if (!this.error) {
            this.error = event.error;
        }
    }

    isPathRandomized() {
        // [Note] We cannot save the game properly when Gatekeeper Path
        //   Randomization is in effect.
        return (
            typeof process === "object" &&
            process.mainModule.filename.startsWith("/private/var")
        );
    }

    initEffekseerRuntime() {
        const onLoad = this.onEffekseerLoad.bind(this);
        const onError = this.onEffekseerError.bind(this);
        effekseer.initRuntime(effekseerWasmUrl, onLoad, onError);
    }

    onEffekseerLoad() {
        this.eraseLoadingSpinner();
        SceneManager.run(Scene_Boot);
    }

    onEffekseerError() {
        this.printError("Failed to load", effekseerWasmUrl);
    }
}

const main = new Main();
main.run();

//-----------------------------------------------------------------------------
