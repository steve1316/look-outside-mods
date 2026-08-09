/*=============================================================================
 * BetterDescriptions
 * BetterDescriptions.js
 * Adds a second, purely mechanical description to every record that has one to give,
 * without ever modifying the developers' own text.
 *
 * Version 1.0.0
 * Author  steve1316
 * License GPL-3.0
 * Source  https://github.com/steve1316/look-outside-mods
 *=============================================================================*/

var BetterDescriptions = BetterDescriptions || {};

(function() {

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Config

    var MOD_NAME = "BetterDescriptions";
    var DEFAULTS = { toggleKey: "Tab", toggleButton: 8, buttonLabel: "Select", showHint: true, pageSeconds: 2, mechanicalFontSize: 18 };

    /**
     * Reads a boolean parameter that may arrive as a real boolean or as a string.
     * @param {*} value Raw parameter value from meta.json.
     * @param {boolean} dflt Value to use when the parameter is absent or blank.
     * @returns {boolean} Normalised boolean.
     */
    function readBool(value, dflt) {
        if (value === undefined || value === null || value === "") return dflt;
        return value === true || value === "true";
    }

    /**
     * Reads a numeric parameter that may arrive as a real number or as a string.
     * @param {*} value Raw parameter value from meta.json.
     * @param {number} dflt Value to use when the parameter is absent or blank.
     * @returns {number} Normalised number, or the default when unparseable.
     */
    function readNum(value, dflt) {
        if (value === undefined || value === null || value === "") return dflt;
        var n = Number(value);
        return isNaN(n) ? dflt : n;
    }

    /**
     * Builds the mod's configuration from jsloader-supplied parameters.
     * @returns {object} Config with `toggleKey`, `toggleButton`, `buttonLabel`, `showHint`, `pageSeconds` and `mechanicalFontSize`.
     */
    function readConfig() {
        var p = (typeof PluginManager !== "undefined" && PluginManager.parameters) ? PluginManager.parameters(MOD_NAME) || {} : {};
        return {
            toggleKey: p.toggleKey || DEFAULTS.toggleKey,
            toggleButton: readNum(p.toggleButton, DEFAULTS.toggleButton),
            buttonLabel: p.buttonLabel || DEFAULTS.buttonLabel,
            showHint: readBool(p.showHint, DEFAULTS.showHint),
            pageSeconds: readNum(p.pageSeconds, DEFAULTS.pageSeconds),
            mechanicalFontSize: Math.max(8, readNum(p.mechanicalFontSize, DEFAULTS.mechanicalFontSize) || DEFAULTS.mechanicalFontSize)
        };
    }

    var config = readConfig();

    BetterDescriptions.config = config;

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Toggle

    var entries = [];
    var shownTexts = Object.create(null);
    var counterpart = Object.create(null);
    var showEnhanced = true;

    /**
     * Records a description that can be switched between two wordings.
     * @param {object} target Database record holding the `description` field.
     * @param {string} vanilla The developers' text, exactly as shipped.
     * @param {string} enhanced The sharpened text.
     */
    function register(target, vanilla, enhanced) {
        entries.push({ target: target, vanilla: vanilla, enhanced: enhanced });
    }

    /**
     * Writes one of the two wordings into every registered record and refreshes anything on screen.
     * @param {boolean} on True to show enhanced text, false to show the developers' text.
     */
    function setEnhanced(on) {
        showEnhanced = !!on;
        shownTexts = Object.create(null);
        counterpart = Object.create(null);
        var ambiguous = {};
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var shown = showEnhanced ? e.enhanced : e.vanilla;
            var hidden = showEnhanced ? e.vanilla : e.enhanced;
            e.target.description = shown;
            shownTexts[shown] = true;
            // Two records can share wording. When one string would map to two different counterparts
            // there is no safe answer, so drop it and let the normal help refresh handle that window.
            if (counterpart[hidden] !== undefined && counterpart[hidden] !== shown) ambiguous[hidden] = true;
            else counterpart[hidden] = shown;
        }
        for (var key in ambiguous) delete counterpart[key];
        refreshOpenWindows();
    }

    /**
     * Nudges any on-screen window so a swap is visible immediately.
     * `Window_Help` caches its text and only redraws when it changes, and the list that owns it may not be active.
     */
    function refreshOpenWindows() {
        if (typeof SceneManager === "undefined" || !SceneManager._scene || !SceneManager._scene._windowLayer) return;
        var children = SceneManager._scene._windowLayer.children;
        for (var i = 0; i < children.length; i++) {
            var win = children[i];
            try {
                if (win && typeof win.setText === "function" && counterpart[win._text] !== undefined) win.setText(counterpart[win._text]);
                if (win && typeof win.callUpdateHelp === "function") win.callUpdateHelp();
                if (win && win._text !== undefined && typeof win.refresh === "function") win.refresh();
            } catch (err) {
                // One uncooperative window must not break the toggle.
            }
        }
    }

    if (typeof ConfigManager !== "undefined") {
        Object.defineProperty(ConfigManager, "betterDescriptions", {
            /**
             * Getter: Returns the current view state.
             * @returns {boolean} Current view state.
             */
            get: function() { return showEnhanced; },
            /**
             * Setter: Switches the view when assigned.
             * @param {boolean} value True to show enhanced text, false for the developers' text.
             */
            set: function(value) { setEnhanced(value); },
            configurable: true
        });

        var _makeData = ConfigManager.makeData;
        /**
         * Saves the current view state into the config data.
         * @returns {object} Config object with `betterDescriptions` flag included.
         */
        ConfigManager.makeData = function() {
            var data = _makeData.apply(this, arguments);
            data.betterDescriptions = this.betterDescriptions;
            return data;
        };

        var _applyData = ConfigManager.applyData;
        /**
         * Restores the saved view state from config data, defaulting to enhanced.
         * @param {object} cfg Config object that may contain the `betterDescriptions` flag.
         */
        ConfigManager.applyData = function(cfg) {
            _applyData.apply(this, arguments);
            this.betterDescriptions = this.readFlag(cfg, "betterDescriptions", true);
        };
    }

    BetterDescriptions.entries = entries;
    BetterDescriptions.register = register;
    BetterDescriptions.setEnhanced = setEnhanced;
    /**
     * Returns the current view state.
     * @returns {boolean} True if enhanced text is shown, false if the developers' text is shown.
     */
    BetterDescriptions.isEnhanced = function() { return showEnhanced; };

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Input

    var lastInput = "key";
    var padWasDown = false;

    /**
     * Reports whether a control-remapping scene is open. Those scenes wait for a raw button press to assign it.
     * @returns {boolean} True while Mano_InputConfig's key or gamepad scene is active.
     */
    function isRebindingScene() {
        if (typeof SceneManager === "undefined" || !SceneManager._scene) return false;
        var name = SceneManager._scene.constructor ? SceneManager._scene.constructor.name : "";
        return /InputConfig|GamepadConfig|KeyConfig/i.test(name);
    }

    /**
     * Remembers which device the player last used so the hint can name the right button.
     * @param {string} kind Either `"key"` or `"pad"`.
     */
    function noteInput(kind) {
        if (lastInput === kind) return;
        lastInput = kind;
        refreshOpenWindows();
    }

    /** Flips the view and saves the choice, unless a remapping scene is open. */
    function toggleNow() {
        if (isRebindingScene()) return;
        setEnhanced(!showEnhanced);
        if (typeof ConfigManager !== "undefined" && ConfigManager.save) ConfigManager.save();
    }

    if (typeof document !== "undefined") {
        /**
         * Handles a raw keydown event, tracking the input device and toggling the view on the configured key.
         * The rebinding-scene guard runs before `preventDefault`, so Mano_InputConfig's key-config scene still sees the raw key.
         * @param {KeyboardEvent} event Browser keydown event.
         */
        document.addEventListener("keydown", function(event) {
            noteInput("key");
            if (event.code !== config.toggleKey) return;
            if (isRebindingScene()) return;
            event.preventDefault();
            toggleNow();
        });
    }

    // Polled straight from the Gamepad API rather than registered in Input.gamepadMapper, because
    // Mano_InputConfig replaces that whole object when it loads its saved config and would drop the binding.
    if (config.toggleButton >= 0 && typeof SceneManager !== "undefined" && typeof navigator !== "undefined" && navigator.getGamepads) {
        var _updateInputData = SceneManager.updateInputData;
        /** Polls raw gamepad buttons every frame, tracking the input device and toggling the view on the configured button. */
        SceneManager.updateInputData = function() {
            _updateInputData.apply(this, arguments);
            var down = false;
            var anyButton = false;
            try {
                var pads = navigator.getGamepads();
                for (var i = 0; i < pads.length; i++) {
                    var pad = pads[i];
                    if (!pad || !pad.connected || !pad.buttons) continue;
                    for (var b = 0; b < pad.buttons.length; b++) {
                        if (pad.buttons[b] && pad.buttons[b].pressed) { anyButton = true; break; }
                    }
                    var button = pad.buttons[config.toggleButton];
                    if (button && button.pressed) down = true;
                }
            } catch (err) {
                down = false;
            }
            if (anyButton) noteInput("pad");
            if (down && !padWasDown) toggleNow();
            padWasDown = down;
        };
    }

    /**
     * Returns the last input device used.
     * @returns {string} Either `"key"` or `"pad"`.
     */
    BetterDescriptions.lastInput = function() { return lastInput; };

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Help box

    var GLUE = "\x01";

    /**
     * Builds the hint legend for the device currently in use.
     * @returns {string} For example `"[TAB] original"` or `"[SELECT] enhanced"`.
     */
    function hintLabel() {
        var button = lastInput === "pad" ? config.buttonLabel : config.toggleKey.replace(/^(Key|Digit)/, "");
        return "[" + button.toUpperCase() + "] " + (showEnhanced ? "original" : "enhanced");
    }

    /**
     * Wraps text to a pixel width, keeping colour spans intact.
     * A span split across lines would leave one line tinted with no reset and the next reset with no tint.
     * @param {function} measure Maps a string to its pixel width.
     * @param {string} text Text to wrap, which may contain literal newlines.
     * @param {number} width Maximum pixel width per line.
     * @returns {string[]} Wrapped lines.
     */
    function wrapToWidth(measure, text, width) {
        var out = [];
        var paragraphs = String(text).split("\n");
        for (var p = 0; p < paragraphs.length; p++) {
            var glued = paragraphs[p].replace(/\\C\[(?!0\])\d+\][^\\]*?\\C\[0\]/g, function(m) { return m.split(" ").join(GLUE); });
            var words = glued.split(" ");
            var line = "";
            for (var i = 0; i < words.length; i++) {
                var candidate = line ? line + " " + words[i] : words[i];
                if (line && measure(candidate.split(GLUE).join(" ")) > width) {
                    out.push(line.split(GLUE).join(" "));
                    line = words[i];
                } else {
                    line = candidate;
                }
            }
            if (line) out.push(line.split(GLUE).join(" "));
        }
        return out;
    }

    /**
     * Splits wrapped lines into pages.
     * @param {string[]} lines Wrapped lines.
     * @param {number} perPage Lines the window can show at once.
     * @returns {Array<string[]>} One entry per page.
     */
    function paginate(lines, perPage) {
        var pages = [];
        for (var i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
        return pages.length ? pages : [[]];
    }

    BetterDescriptions.hintLabel = hintLabel;
    BetterDescriptions.wrapToWidth = wrapToWidth;
    BetterDescriptions.paginate = paginate;
    BetterDescriptions.drawCoveredText = drawCoveredText;

    if (config.showHint && typeof Window_Help !== "undefined") {
        var _Window_Help_refresh = Window_Help.prototype.refresh;
        /** Redraws the help window, routing covered descriptions through `drawCoveredText` instead of the original layout. */
        Window_Help.prototype.refresh = function() {
            if (!shownTexts[this._text]) { _Window_Help_refresh.apply(this, arguments); return; }
            this._bdPages = null;
            this._bdPage = 0;
            this._bdTicks = 0;
            drawCoveredText(this);
        };

        var _Window_Help_update = Window_Help.prototype.update;
        /** Advances the paging timer and flips a covered description to its next page once `config.pageSeconds` elapses. */
        Window_Help.prototype.update = function() {
            _Window_Help_update.apply(this, arguments);
            if (!this._bdPages || this._bdPages.length < 2 || config.pageSeconds <= 0) return;
            this._bdTicks = (this._bdTicks || 0) + 1;
            if (this._bdTicks < config.pageSeconds * 60) return;
            this._bdTicks = 0;
            this._bdPage = (this._bdPage + 1) % this._bdPages.length;
            drawCoveredText(this);
        };
    }

    /**
     * Prefixes text with the escape that sets the mechanical view's font size.
     * `textSizeEx` and `drawTextEx` both call `resetFontSettings()` as their first statement, so a
     * `contents.fontSize` assigned beforehand is thrown away before a single glyph is measured or drawn.
     * The `\FS[n]` escape is handled by `processAllText`, which runs after that reset, so it is the only
     * way to get a size through. Measuring and drawing must use the identical prefix or the wrap budget
     * will not match what ends up on screen.
     * The size belongs to the mechanical view alone. `drawCoveredText` also draws the developers' prose,
     * because `setEnhanced` marks whichever wording is currently shown, so the prefix is withheld in the
     * original view - that view keeps the engine's own size, and the shift signals which view is showing.
     * @param {string} text A line of the shown description.
     * @returns {string} The line, with the font-size escape in front of it only in the mechanical view.
     */
    function atMechanicalSize(text) {
        if (!showEnhanced) return text;
        return "\\FS[" + config.mechanicalFontSize + "]" + text;
    }

    /**
     * Draws a covered description into the help window, reserving room for the hint on the last line.
     * @param {object} win The `Window_Help` instance being drawn.
     */
    function drawCoveredText(win) {
        var rect = win.baseTextRect();
        var lineHeight = win.lineHeight();
        var rows = Math.max(1, Math.floor(rect.height / lineHeight));
        win.contents.clear();

        // The hint strip goes through contents.drawText, a Bitmap method that does not reset, so it is
        // sized by assigning contents.fontSize directly. The body is sized by escape instead - see above.
        var hintSize = Math.max(12, config.mechanicalFontSize - 10);
        win.contents.fontSize = hintSize;
        var hint = hintLabel();
        var strip = win.contents.measureTextWidth(hint) + 12;

        if (!win._bdPages) {
            /**
             * Measures the pixel width of formatted text at the mechanical font size, honouring `\C[n]` colour codes.
             * @param {string} s Text to measure.
             * @returns {number} Pixel width of the text.
             */
            var measure = function(s) { return win.textSizeEx(atMechanicalSize(s)).width; };
            win._bdPages = paginate(wrapToWidth(measure, win._text, rect.width - strip), rows);
            win._bdPage = 0;
        }
        var page = win._bdPages[win._bdPage] || [];
        for (var i = 0; i < page.length; i++) win.drawTextEx(atMechanicalSize(page[i]), rect.x, rect.y + i * lineHeight, rect.width - strip);

        win.contents.fontSize = hintSize;
        win.changePaintOpacity(false);
        win.contents.drawText(hint, rect.x, rect.y + (rows - 1) * lineHeight, rect.width, lineHeight, "right");
        win.changePaintOpacity(true);
        win.resetFontSettings();
    }

})();
