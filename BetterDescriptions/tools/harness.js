const fs = require("fs");
const path = require("path");
const vm = require("vm");

/**
 * Finds the game install, which is wherever `data/System.json` and `js/rmmz_managers.js` sit together.
 * The mod lives in its own repository and reaches the game through a directory junction, and Node resolves
 * `__dirname` through that junction to the real path, so walking up from this file lands outside the game.
 * Set `LOOK_OUTSIDE_ROOT` to override, otherwise run the suite from anywhere inside the game folder.
 * @returns {string} Absolute path to the game install.
 */
function findGame() {
    const candidates = [];
    if (process.env.LOOK_OUTSIDE_ROOT) candidates.push(path.resolve(process.env.LOOK_OUTSIDE_ROOT));
    for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
        candidates.push(dir);
        if (path.dirname(dir) === dir) break;
    }
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, "data", "System.json")) && fs.existsSync(path.join(dir, "js", "rmmz_managers.js"))) return dir;
    }
    throw new Error("Cannot find the Look Outside install. Run the suite from inside the game folder, or set LOOK_OUTSIDE_ROOT.");
}

const GAME = findGame();
const MOD = path.join(GAME, "js/mods/BetterDescriptions/BetterDescriptions.js");

const sourceCache = Object.create(null);

/**
 * Reads one database file from the game's data folder.
 * The file text is cached but re-parsed on every call, because callers mutate what they get back and the
 * whole point of `pristine` is that it stays untouched. The suite loads the mod 17 times, so this turns
 * roughly 150 disk reads into 4 while keeping each caller's copy independent.
 * @param {string} name File name without extension, for example `Items`.
 * @returns {Array} Freshly parsed database array.
 */
function db(name) {
    const file = path.join(GAME, "data", name + ".json");
    if (!sourceCache[file]) sourceCache[file] = fs.readFileSync(file, "utf8");
    return JSON.parse(sourceCache[file]);
}

/**
 * Reads the mod's source, cached so repeated `loadMod` calls do not re-read it from disk.
 * @returns {string} The mod source.
 */
function modSource() {
    if (!sourceCache[MOD]) sourceCache[MOD] = fs.readFileSync(MOD, "utf8");
    return sourceCache[MOD];
}

/**
 * Loads the mod into a sandbox with just enough RPG Maker MZ surface to run headless.
 * @param {object} [options] Overrides. `params` replaces meta.json parameters, `pad` supplies a fake gamepad.
 * @returns {object} `{ sandbox, BD, db, pristine, fire }` where `fire` triggers the captured keydown handler.
 */
function loadMod(options) {
    const opts = options || {};
    const pristine = { items: db("Items"), skills: db("Skills"), armors: db("Armors"), weapons: db("Weapons") };
    const pad = opts.pad || { connected: true, buttons: Array.from({ length: 18 }, () => ({ pressed: false })) };
    let keyHandler = null;

    const sandbox = {
        console,
        navigator: { getGamepads: () => [pad] },
        PluginManager: { parameters: () => opts.params || {} },
        DataManager: { isDatabaseLoaded: () => true },
        SceneManager: { _scene: null, updateInputData() {} },
        ConfigManager: {
            makeData() { return {}; },
            applyData(config) { this._last = config; },
            readFlag(config, name, dflt) { return name in config ? !!config[name] : dflt; },
            save() { this.saveCount = (this.saveCount || 0) + 1; }
        },
        document: { addEventListener: (type, fn) => { if (type === "keydown") keyHandler = fn; } },
        $dataItems: db("Items"),
        $dataSkills: db("Skills"),
        $dataArmors: db("Armors"),
        $dataWeapons: db("Weapons"),
        $dataStates: db("States"),
        $dataCommonEvents: db("CommonEvents"),
        $dataSystem: db("System"),
        $dataClasses: db("Classes"),
        $dataActors: db("Actors")
    };
    vm.createContext(sandbox);
    vm.runInContext(modSource(), sandbox, { filename: "BetterDescriptions.js" });

    return {
        sandbox,
        BD: sandbox.BetterDescriptions,
        db,
        pristine,
        pad,
        fire: (code) => keyHandler && keyHandler({ code: code, preventDefault() {} }),
        boot: () => sandbox.DataManager.isDatabaseLoaded()
    };
}

/**
 * Builds a `Window_Help` stand-in that reproduces the one engine behaviour the mod has to work around:
 * `textSizeEx` and `drawTextEx` both call `resetFontSettings()` as their first statement, which throws away
 * any `contents.fontSize` the caller set beforehand. The stub walks `\FS[n]` and `\C[n]` the way
 * `processAllText` does and records the font size actually in effect for every non-empty run of text, so a
 * test can assert what size the player really sees rather than what the mod intended.
 * @param {object} [options] Overrides. `text` is the description to draw, `width` and `height` size the text
 *     rect, `lineHeight` sets the row height and `mainFontSize` is the engine's `$gameSystem.mainFontSize()`.
 * @returns {object} A window stub with `measuredSizes` and `drawnSizes` recording the sizes runs ran at.
 */
function makeWindowStub(options) {
    const opts = options || {};
    const mainFontSize = opts.mainFontSize === undefined ? 22 : opts.mainFontSize;
    const rect = { x: 4, y: 4, width: opts.width === undefined ? 720 : opts.width, height: opts.height === undefined ? 108 : opts.height };
    const lineHeight = opts.lineHeight === undefined ? 36 : opts.lineHeight;

    const win = {
        _text: opts.text === undefined ? "" : opts.text,
        measuredSizes: [],
        drawnSizes: [],
        drawnText: [],
        hintSizes: [],
        contents: {
            fontSize: mainFontSize,
            clear() {},
            measureTextWidth(text) { return String(text).length * (this.fontSize / 2); },
            drawText(text) { win.hintSizes.push(this.fontSize); win.drawnText.push(text); }
        },
        baseTextRect() { return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; },
        lineHeight() { return lineHeight; },
        resetFontSettings() { this.contents.fontSize = mainFontSize; },
        changePaintOpacity() {},
        textSizeEx(text) { return { width: runText(this, text, this.measuredSizes), height: lineHeight }; },
        drawTextEx(text) { return runText(this, text, this.drawnSizes); }
    };
    return win;
}

/**
 * Walks formatted text the way MZ's `processAllText` does, after the leading `resetFontSettings()`.
 * @param {object} win The window stub doing the drawing.
 * @param {string} text Text that may carry `\FS[n]` and `\C[n]` escapes.
 * @param {number[]} sink Array that collects the font size each non-empty run of text ran at.
 * @returns {number} Total pixel width of the text.
 */
function runText(win, text, sink) {
    win.resetFontSettings();
    const source = String(text);
    const escapes = /\\FS\[(\d+)\]|\\C\[\d+\]/g;
    let width = 0;
    let last = 0;
    let m;
    /**
     * Measures one plain run and records the size it ran at.
     * @param {string} run A stretch of text carrying no escape codes.
     */
    const consume = (run) => {
        if (!run) return;
        sink.push(win.contents.fontSize);
        width += win.contents.measureTextWidth(run);
    };
    while ((m = escapes.exec(source))) {
        consume(source.slice(last, m.index));
        if (m[1] !== undefined) win.contents.fontSize = Number(m[1]);
        last = escapes.lastIndex;
    }
    consume(source.slice(last));
    return width;
}

module.exports = { loadMod, makeWindowStub };
