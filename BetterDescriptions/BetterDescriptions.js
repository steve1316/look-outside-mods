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

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Derive

    var STATE_TIERS = /\s*\d+$/;
    // How many statuses a resist group names before it falls back to counting the remainder.
    var RESISTS_NAMED = 3;
    // Used when the class table cannot be read, so a sentinel formula still does not reach the player as a figure.
    var MAX_HP_FALLBACK = 9999;
    var maxHpCeiling = null;
    // Note-tag patterns, cached by tag name. See `noteNumber`.
    var notePatterns = {};
    // Glitch-world gear, whose names and descriptions the developers deliberately corrupted ("Vnage ucky tieakeRs",
    // "pr#tcts f1rom#M sT#a4ts##u#sEf#?fct7"). A clean mechanical readout would undo the effect they were going for,
    // so these are skipped outright. There is no property in the data marking them, hence the list of ids.
    var GLITCH_ARMORS = { 225: true, 226: true, 227: true, 228: true, 374: true, 375: true, 376: true };
    // Names for the flat params a code-21 trait multiplies, indexed by trait dataId.
    var PARAM_NAMES = ["max HP", "max STM", "attack", "defense", "ballistics", "ballistic defense", "agility", "luck"];
    // Names for the sp-params a code-23 trait multiplies, indexed by trait dataId.
    var SPARAM_TEXT = { 0: "chance to be targeted", 2: "healing received", 4: "STM costs", 6: "incoming physical damage", 7: "incoming ballistic damage", 9: "EXP gain" };
    // Scopes that point at the player's side. A state applied here is never an affliction.
    var ALLY_SCOPES = { 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1 };
    var SCOPE_TEXT = {
        1: "one enemy", 2: "all enemies", 3: "1 random enemy", 4: "2 random enemies", 5: "3 random enemies", 6: "4 random enemies",
        7: "one ally", 8: "all allies", 9: "one downed ally", 10: "all downed allies", 11: "the user", 12: "one ally", 13: "all allies", 14: "everyone"
    };
    // RPG Maker damage types. This game shows MP as STM. Drains take "from", everything else "to".
    // `kind` is the single place the six type codes are grouped, so nothing has to re-test the numbers.
    var DAMAGE_TEXT = {
        1: { verb: "Deals", unit: "damage", prep: "to", kind: "damage" },
        2: { verb: "Deals", unit: "STM damage", prep: "to", kind: "damage" },
        3: { verb: "Restores", unit: "HP", prep: "to", kind: "restore" },
        4: { verb: "Restores", unit: "STM", prep: "to", kind: "restore" },
        5: { verb: "Drains", unit: "HP", prep: "from", kind: "drain" },
        6: { verb: "Drains", unit: "STM", prep: "from", kind: "drain" }
    };

    /**
     * Escapes a string for safe use inside a regular expression.
     * @param {string} text Text that may contain regex metacharacters.
     * @returns {string} The text with metacharacters escaped.
     */
    function escapeForRegex(text) {
        return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    /**
     * Looks up an element's name. Lowercase is not cosmetic: `colourise` only tints a lowercase element word,
     * so that a capitalised one inside an item name like "Pistol Bullet" is left alone.
     * @param {number} id Element id, from `damage.elementId` or a trait's `dataId`.
     * @returns {string} Lowercased element name, or an empty string when the element does not exist.
     */
    function elementName(id) {
        if (typeof $dataSystem === "undefined" || !$dataSystem.elements) return "";
        return ($dataSystem.elements[id] || "").toLowerCase();
    }

    /**
     * Renders a trait multiplier as a signed percentage away from unchanged, so 1.5 reads "+50%" and 0.5 "-50%".
     * @param {number} value The trait's multiplier, where 1 means no change.
     * @returns {string} A signed percentage.
     */
    function signedPercent(value) {
        return (value > 1 ? "+" : "-") + Math.round(Math.abs(value - 1) * 100) + "%";
    }

    /**
     * Renders how long a state lasts. Equal bounds are a fixed duration rather than a range, because "1-1 turns"
     * is not English, and one turn takes the singular noun.
     * @param {object} state A state record, or null.
     * @param {string} open Text placed before the figure, such as `" ("` or `" for "`.
     * @param {string} close Text placed after it, such as `")"` or an empty string.
     * @returns {string} The wrapped duration, or an empty string when the state never expires on its own.
     */
    function turnRange(state, open, close) {
        if (!state || !state.maxTurns) return "";
        var span = state.minTurns === state.maxTurns
            ? state.minTurns + (state.minTurns === 1 ? " turn" : " turns")
            : state.minTurns + "-" + state.maxTurns + " turns";
        return open + span + close;
    }

    /**
     * Reads the fixed damage a formula states outright.
     * A leading constant only describes the real damage when nothing is ADDED to it, so a formula with an
     * added actor term, game-state call or target term is reported as having no stated amount rather than
     * as its floor. A subtracted term only mitigates, so the constant survives as a legitimate ceiling.
     * @param {string} formula The `damage.formula` expression.
     * @returns {string} The leading constant, or an empty string when there is none or it would mislead.
     */
    function formulaBase(formula) {
        var text = String(formula).trim();
        var m = text.match(/^(\d+)/);
        if (!m || m[1] === "0") return "";
        var rest = text.slice(m[1].length).trim();
        // A number glued to * or / is a coefficient, not a base amount.
        if (/^[*\/]/.test(rest)) return "";
        var terms = rest.split(/(?=[+-])/);
        for (var i = 0; i < terms.length; i++) {
            var term = terms[i].trim();
            if (term.charAt(0) === "+" && /[a-zA-Z]/.test(term)) return "";
        }
        return m[1];
    }

    /**
     * Reports the highest max HP the game's own class curves ever reach. A restore formula at or above that
     * is an engine full-heal sentinel, not a figure, and printing "Restores 99999 HP" states a number the
     * player can never see. Computed once from the class table and cached.
     * @returns {number} The highest max HP any class attains, or `MAX_HP_FALLBACK` when the table is unreadable.
     */
    function maxHpScale() {
        if (maxHpCeiling !== null) return maxHpCeiling;
        maxHpCeiling = 0;
        if (typeof $dataClasses !== "undefined") {
            for (var i = 0; i < $dataClasses.length; i++) {
                var curve = $dataClasses[i] && $dataClasses[i].params ? $dataClasses[i].params[0] : null;
                if (!curve) continue;
                for (var l = 0; l < curve.length; l++) if (curve[l] > maxHpCeiling) maxHpCeiling = curve[l];
            }
        }
        if (!maxHpCeiling) maxHpCeiling = MAX_HP_FALLBACK;
        return maxHpCeiling;
    }

    /**
     * Reports whether a record carries an HP or STM recovery effect, which speaks for itself in `deriveRecovery`.
     * @param {object} record An item or skill record.
     * @returns {boolean} True when a recovery effect will fire.
     */
    function hasRecoveryEffect(record) {
        var effects = record.effects || [];
        for (var i = 0; i < effects.length; i++) if (effects[i].code === 11 || effects[i].code === 12) return true;
        return false;
    }

    /**
     * Describes a record's damage: how much, of what element, at what target, how often and how reliably.
     * @param {object} record An item or skill record.
     * @returns {string|null} A damage sentence, or null when the record deals none.
     */
    function deriveDamage(record) {
        var d = record.damage;
        if (!d || !d.type) return null;
        var spec = DAMAGE_TEXT[d.type] || DAMAGE_TEXT[1];
        // An element only means something for damage and drain types. Stating one on a restore ("Restores cold HP") is nonsense.
        var isRestore = spec.kind === "restore";
        // A drain's element is real, but gluing it in front of the unit reads as draining the substance
        // itself ("Drains shadow HP"). It goes after the clause instead, where it qualifies the damage.
        var isDrain = spec.kind === "drain";
        var element = isRestore ? "" : elementName(d.elementId);
        var base = formulaBase(d.formula);
        var scope = SCOPE_TEXT[record.scope] || "";
        // A restore with no stated amount says nothing the recovery clause does not say better, and saying
        // both leaves the player reading the same fact twice with one half empty.
        if (isRestore && !base && hasRecoveryEffect(record)) return null;
        // A formula at or above the maximum any character can reach is an engine full-heal sentinel, not a figure.
        var isFullRestore = isRestore && base && Number(base) >= maxHpScale();
        var verb = isFullRestore ? "Fully restores" : spec.verb;
        if (isFullRestore) base = "";
        var text = verb + (base ? " " + base : "") + (element && !isDrain ? " " + element : "") + " " + spec.unit;
        if (scope) text += " " + spec.prep + " " + scope;
        if (element && isDrain) text += " as " + element + " damage";
        if (record.repeats > 1) text += ", " + record.repeats + " times";
        text += ".";
        if (record.successRate && record.successRate < 100) text += " " + record.successRate + "% accuracy.";
        return text;
    }

    /**
     * Builds a recovery clause stating flat and percentage parts separately.
     * The developers' "at least N" wording exists because these items restore N plus a percentage of the maximum.
     * When HP and STM share the exact same placeholder rate, it is stated once for both instead of twice, since
     * that mirrors how the devs phrase a shared rate and reads better than restating the same figure.
     * @param {object} record An item record.
     * @returns {string|null} The clause, or null when the item restores nothing.
     */
    function deriveRecovery(record) {
        var hp = null;
        var mp = null;
        var effects = record.effects || [];
        for (var i = 0; i < effects.length; i++) {
            if (effects[i].code === 11) hp = effects[i];
            if (effects[i].code === 12) mp = effects[i];
        }
        var hpIsPlaceholderRate = hp && hp.value1 > 0 && hp.value2 <= 1;
        var mpIsPlaceholderRate = mp && mp.value1 > 0 && mp.value2 <= 1;
        if (hpIsPlaceholderRate && mpIsPlaceholderRate && hp.value1 === mp.value1) {
            return "Recovers " + Math.round(hp.value1 * 100) + "% of max HP and STM.";
        }
        var parts = [];
        if (hp && (hp.value1 || hp.value2)) parts.push(amount(hp, "HP"));
        if (mp && (mp.value1 || mp.value2)) parts.push(amount(mp, "STM"));
        if (!parts.length) return null;
        return "Recovers " + parts.join(", and ") + ".";
    }

    /**
     * Renders one recovery part as flat plus percentage. Every percentage names its own referent, because a
     * bare "+1%" in the second half of a two-part clause is a percentage of nothing the player can identify.
     * @param {object} effect An effect with `value1` as a fraction of maximum and `value2` as a flat amount.
     * @param {string} unit Either `"HP"` or `"STM"`.
     * @returns {string} For example `"16 HP +3% of max HP"` or `"3% of max HP"`.
     */
    function amount(effect, unit) {
        var pct = Math.round(effect.value1 * 100);
        // value2 of 1 alongside a real percentage is an engine placeholder, not a genuine flat amount.
        if (!effect.value2 || (effect.value1 > 0 && effect.value2 <= 1)) return pct + "% of max " + unit;
        return effect.value2 + " " + unit + (pct ? " +" + pct + "% of max " + unit : "");
    }

    /**
     * Collects the skills a player can actually reach, through class learning or an equipment trait.
     * @returns {object} Map of skill id to true.
     */
    function playerSkillIds() {
        var ids = {};
        var i;
        if (typeof $dataClasses !== "undefined") {
            for (i = 0; i < $dataClasses.length; i++) {
                var cls = $dataClasses[i];
                if (!cls || !cls.learnings) continue;
                for (var j = 0; j < cls.learnings.length; j++) ids[cls.learnings[j].skillId] = true;
            }
        }
        var sources = [];
        if (typeof $dataArmors !== "undefined") sources = sources.concat($dataArmors);
        if (typeof $dataWeapons !== "undefined") sources = sources.concat($dataWeapons);
        if (typeof $dataActors !== "undefined") sources = sources.concat($dataActors);
        for (i = 0; i < sources.length; i++) {
            var src = sources[i];
            if (!src || !src.traits) continue;
            for (var t = 0; t < src.traits.length; t++) if (src.traits[t].code === 43) ids[src.traits[t].dataId] = true;
        }
        return ids;
    }

    /**
     * Builds a clause describing a skill's status effects, since those odds appear nowhere in the game's own text.
     * Tiered states such as Bleed1/2/3 are rolled separately, so their combined chance is what the player cares about.
     * The verb comes from the record's scope: allies, downed allies and the user get "apply" since a state
     * applied there is never hostile, everything else gets "inflict". A guaranteed rate drops "chance to"
     * entirely, since stating a certainty as a chance is noise.
     * @param {object} record A skill record.
     * @returns {string|null} The clause, or null when the skill applies or inflicts nothing derivable.
     */
    function deriveSkill(record) {
        var effects = record.effects || [];
        var families = {};
        for (var i = 0; i < effects.length; i++) {
            var e = effects[i];
            if (e.code !== 21 || e.dataId <= 0) continue;
            var state = (typeof $dataStates !== "undefined" && $dataStates[e.dataId]) ? $dataStates[e.dataId] : null;
            if (!state || !state.name) continue;
            var family = stateFamily(e.dataId);
            if (!families[family]) families[family] = { chances: [], turns: "", bestValue: -1, bestMaxTurns: -1 };
            var fam = families[family];
            fam.chances.push(e.value1);
            // The duration comes from the tier most likely to actually land, not from whichever
            // effect happens to be listed first - some records store their tiers worst-first.
            if (state.maxTurns && (e.value1 > fam.bestValue || (e.value1 === fam.bestValue && state.maxTurns > fam.bestMaxTurns))) {
                fam.bestValue = e.value1;
                fam.bestMaxTurns = state.maxTurns;
                fam.turns = turnRange(state, " (", ")");
            }
        }
        var isAlly = !!ALLY_SCOPES[record.scope];
        var verb = isAlly ? "apply" : "inflict";
        var bareVerb = isAlly ? "applies" : "inflicts";
        // Statuses sharing the same odds are grouped under one lead, so a skill rolling many statuses
        // states "X% chance to inflict a, b and c" once instead of repeating the lead for every status.
        var groups = {};
        var order = [];
        for (var name in families) {
            var fam = families[name];
            var chances = fam.chances;
            var combined = 1;
            for (var c = 0; c < chances.length; c++) combined *= (1 - chances[c]);
            var pct = Math.round((1 - combined) * 100);
            if (!pct) continue;
            var upTo = chances.length > 1;
            var key = pct + (upTo ? "u" : "");
            if (!groups[key]) { groups[key] = { pct: pct, upTo: upTo, members: [] }; order.push(key); }
            groups[key].members.push(name + fam.turns);
        }
        var parts = [];
        for (var k = 0; k < order.length; k++) {
            var g = groups[order[k]];
            // Each status is rolled separately, so one lead covering several of them needs "each" or it
            // reads as a single roll that lands the whole list at once.
            var lead = g.pct === 100
                ? bareVerb
                : (g.upTo ? "up to " : "") + g.pct + "% chance" + (g.members.length > 1 ? " each" : "") + " to " + verb;
            parts.push(lead + " " + joinWithAnd(g.members));
        }
        if (!parts.length) return null;
        var text = parts.join(", and ") + ".";
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    /**
     * Looks up a state's display name.
     * @param {number} id State id.
     * @returns {string} Lowercased state name, or an empty string when the state does not exist.
     */
    function stateName(id) {
        if (typeof $dataStates === "undefined" || !$dataStates[id] || !$dataStates[id].name) return "";
        return $dataStates[id].name.toLowerCase();
    }

    /**
     * Looks up a state's family name, with any tier digit stripped. `Bleed1`, `Bleed2` and `Bleed3` are one
     * status at three tiers, so listing them separately triples the entry and tints the tier digit as if it
     * were a figure the player could act on.
     * @param {number} id State id.
     * @returns {string} Lowercased family name, or an empty string when the state does not exist.
     */
    function stateFamily(id) {
        return stateName(id).replace(STATE_TIERS, "").trim();
    }

    /**
     * Renders status entries as one clause per rate, stating each rate once. A record that resists twenty
     * statuses at the same rate used to print that rate twenty times, which buries the one figure that
     * matters. Past `RESISTS_NAMED` + 1 members the group names a few and counts the rest instead.
     * @param {Array<{name: string, rate: number}>} entries Status entries, already tier-collapsed and de-duplicated.
     * @param {string} suffix Unit written after each rate, either `"%"` for a resistance or `"x"` for a multiplier.
     * @returns {string} The joined clause body, without the leading verb or the trailing full stop.
     */
    function groupedRates(entries, suffix) {
        var byRate = {};
        var order = [];
        for (var i = 0; i < entries.length; i++) {
            var rate = entries[i].rate;
            if (!byRate[rate]) { byRate[rate] = []; order.push(rate); }
            byRate[rate].push(entries[i].name);
        }
        var clauses = [];
        for (var k = 0; k < order.length; k++) {
            var names = byRate[order[k]];
            // Only abbreviate when it actually saves something. "a, b, c and 1 other" is longer than naming all four.
            var listed = names.length > RESISTS_NAMED + 1
                ? joinWithAnd(names.slice(0, RESISTS_NAMED).concat([(names.length - RESISTS_NAMED) + " others"]))
                : joinWithAnd(names);
            clauses.push(listed + " " + order[k] + suffix);
        }
        return clauses.join(", ");
    }

    /**
     * Builds a clause for equipment, covering the effects the equip screen never shows: element rates,
     * status immunities, status resistances, param and sp-param multipliers, granted skills and extra
     * actions. Flat `params` deltas are deliberately omitted because the equip screen already displays them.
     * @param {object} record An armor or weapon record.
     * @returns {string|null} The clause, or null when the record has nothing hidden to report.
     */
    function deriveEquipment(record) {
        var traits = record.traits || [];
        var byRate = {};
        var immune = [];
        var resists = [];
        var vulnerable = [];
        var seenRate = {};
        var grants = [];
        var extras = [];
        var rates = [];
        for (var i = 0; i < traits.length; i++) {
            var t = traits[i];
            if (t.code === 11 && t.value !== 1) {
                var element = elementName(t.dataId);
                if (element) {
                    var key = (t.value < 1 ? "less " : "more ") + Math.round(Math.abs(1 - t.value) * 100);
                    if (!byRate[key]) byRate[key] = [];
                    byRate[key].push(element);
                }
            }
            if (t.code === 14) {
                var immuneName = stateFamily(t.dataId);
                if (immuneName && immune.indexOf(immuneName) === -1) immune.push(immuneName);
            }
            if (t.code === 13 && t.value !== 1) {
                var rateName = stateFamily(t.dataId);
                // A state rate above 1 is a drawback the equip screen never shows either, so listing only
                // the resistances would hand the player the record's upsides and hide its cost.
                var into = t.value < 1 ? resists : vulnerable;
                if (rateName && !seenRate[rateName]) {
                    seenRate[rateName] = true;
                    into.push({ name: rateName, rate: t.value < 1 ? Math.round((1 - t.value) * 100) : t.value });
                }
            }
            if (t.code === 43 && typeof $dataSkills !== "undefined" && $dataSkills[t.dataId] && $dataSkills[t.dataId].name) {
                if (grants.indexOf($dataSkills[t.dataId].name) === -1) grants.push($dataSkills[t.dataId].name);
            }
            if (t.code === 61 && t.value) extras.push(Math.round(t.value * 100) + "% chance to act twice per turn");
            if (t.code === 34 && t.value) extras.push(t.value + " extra " + (t.value === 1 ? "hit" : "hits") + " per attack");
            if (t.code === 21 && PARAM_NAMES[t.dataId] && t.value !== 1) rates.push(PARAM_NAMES[t.dataId] + " " + signedPercent(t.value));
            if (t.code === 23 && SPARAM_TEXT[t.dataId] && t.value !== 1) rates.push(SPARAM_TEXT[t.dataId] + " " + signedPercent(t.value));
        }

        var parts = [];
        for (var rate in byRate) {
            var bits = rate.split(" ");
            parts.push("Take " + bits[1] + "% " + bits[0] + " " + joinWithAnd(byRate[rate]) + " damage");
        }
        if (immune.length) parts.push("Immune to " + joinWithAnd(immune));
        if (resists.length) parts.push("Resists " + groupedRates(resists, "%"));
        if (vulnerable.length) parts.push("Vulnerable to " + groupedRates(vulnerable, "x"));
        if (rates.length) parts.push("Changes " + rates.join(", "));
        if (extras.length) parts.push("Grants " + extras.join(" and "));
        if (grants.length) parts.push("Unlocks " + grants.join(", "));

        if (!parts.length) return null;
        return parts.join(". ") + ".";
    }

    /**
     * Reads a numeric note tag from a record.
     * @param {object} record A database record.
     * @param {string} tag The tag name, without angle brackets.
     * @returns {number} The tag's value, or 0 when the tag is absent.
     */
    function noteNumber(record, tag) {
        // Compiled once per tag rather than once per record. Five distinct tags are read across ~1600 records
        // at boot, so building the pattern inline would mean thousands of throwaway compilations.
        if (!notePatterns[tag]) notePatterns[tag] = new RegExp("<" + tag + ":\\s*([0-9.]+)\\s*>", "i");
        var m = String(record.note || "").match(notePatterns[tag]);
        return m ? Number(m[1]) : 0;
    }

    /**
     * Describes everything using a record costs the player.
     * @param {object} record An item or skill record.
     * @returns {string|null} A cost sentence, or null when the record is free.
     */
    function deriveCosts(record) {
        var bits = [];
        if (record.mpCost) bits.push(record.mpCost + " STM");
        var ammo = noteNumber(record, "ammoUse");
        if (ammo) bits.push(ammo + " ammo");
        var hp = noteNumber(record, "hp_cost");
        if (hp) bits.push(hp + " HP");
        var itemId = noteNumber(record, "WithItemId");
        if (itemId && typeof $dataItems !== "undefined" && $dataItems[itemId] && $dataItems[itemId].name) bits.push("1 " + $dataItems[itemId].name);
        if (!bits.length) return null;
        return "Costs " + bits.join(", ") + ".";
    }

    /**
     * Describes the raised chance of breaking the equipped weapon, which the game states only as a note tag.
     * @param {object} record An item or skill record.
     * @returns {string|null} A durability sentence, or null when the record carries no break tag.
     */
    function deriveDurability(record) {
        var rate = noteNumber(record, "breakRate");
        // A rate of 1 is the default the engine already applies, so stating it tells the player nothing.
        if (rate <= 1) return null;
        return rate + "x weapon break chance.";
    }

    /**
     * Describes a state the record applies to its own user, which no effect entry exposes.
     * @param {object} record An item or skill record.
     * @returns {string|null} A self-state sentence, or null when the record applies none.
     */
    function deriveSelfState(record) {
        var id = noteNumber(record, "ApplyState");
        var name = id ? stateName(id) : "";
        if (!name) return null;
        return "Applies " + name + " to you" + turnRange($dataStates[id], " for ", "") + ".";
    }

    /**
     * Joins names with a comma-and-and list, so three or more read as "a, b and c" rather than a
     * trailing comma list.
     * @param {string[]} names Names to join, already lowercased.
     * @returns {string} The joined list.
     */
    function joinWithAnd(names) {
        if (names.length === 1) return names[0];
        return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    }

    /**
     * Describes the statuses a record cures, which is effect code 22. Tiered states such as Bleed1/2/3
     * collapse into one family name, since the player does not think of them as three separate cures.
     * @param {object} record An item or skill record.
     * @returns {string|null} A cure sentence, or null when the record cures nothing.
     */
    function deriveStatesRemoved(record) {
        var names = [];
        var effects = record.effects || [];
        for (var i = 0; i < effects.length; i++) {
            if (effects[i].code !== 22 || effects[i].dataId <= 0) continue;
            var family = stateFamily(effects[i].dataId);
            if (family && names.indexOf(family) === -1) names.push(family);
        }
        if (!names.length) return null;
        return "Cures " + joinWithAnd(names) + ".";
    }

    BetterDescriptions.deriveDamage = deriveDamage;
    BetterDescriptions.deriveRecovery = deriveRecovery;
    BetterDescriptions.deriveSkill = deriveSkill;
    BetterDescriptions.deriveEquipment = deriveEquipment;
    BetterDescriptions.deriveCosts = deriveCosts;
    BetterDescriptions.deriveDurability = deriveDurability;
    BetterDescriptions.deriveSelfState = deriveSelfState;
    BetterDescriptions.deriveStatesRemoved = deriveStatesRemoved;

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Colour

    // Windowskin palette indices, grouped so they can be retuned in one place. This game ships a custom
    // windowskin, so an index may not look the way the RPG Maker defaults suggest. The devs themselves
    // use 10 for a status name, in Blood Madness' "\C[10]bleeding\C[0]".
    var COLOUR_NUMBER = 6;
    var COLOUR_HP = 24;
    var COLOUR_STM = 23;
    var COLOUR_STATUS = 10;
    var COLOUR_ELEMENT = 4;
    var colourPattern = null;
    var statusNameSet = null;
    var elementNameSet = null;

    /**
     * Wraps a fragment in a windowskin colour and resets afterwards.
     * @param {number} index Windowskin palette index.
     * @param {string} text Fragment to colour.
     * @returns {string} The fragment surrounded by colour escape codes.
     */
    function tint(index, text) {
        return "\\C[" + index + "]" + text + "\\C[0]";
    }

    /**
     * Builds the single alternation used to find every colourable token in one pass, and populates
     * `statusNameSet` and `elementNameSet` alongside it so `colourise` can tell the two apart.
     * Both vocabularies come from the database rather than a hand-kept list, so a status or element the
     * game adds later needs no code change. Names are filtered to plain words so one like "attack+25%"
     * cannot disturb the pattern, and sorted longest first so a multi-word name wins over one of its parts.
     * @returns {RegExp} Pattern matching a status or element word, an HP/STM unit, or a number.
     */
    function buildColourPattern() {
        var states = [];
        var elements = [];
        var plain = /^[a-z][a-z ]*$/;
        var i;
        if (typeof $dataStates !== "undefined") {
            for (i = 0; i < $dataStates.length; i++) {
                var name = $dataStates[i] ? stateFamily(i) : "";
                if (plain.test(name) && states.indexOf(name) === -1) states.push(name);
            }
        }
        if (typeof $dataSystem !== "undefined" && $dataSystem.elements) {
            for (i = 0; i < $dataSystem.elements.length; i++) {
                var element = elementName(i);
                if (plain.test(element) && elements.indexOf(element) === -1) elements.push(element);
            }
        }
        statusNameSet = {};
        elementNameSet = {};
        for (i = 0; i < states.length; i++) statusNameSet[states[i]] = true;
        for (i = 0; i < elements.length; i++) elementNameSet[elements[i]] = true;
        var words = states.concat(elements).sort(function(a, b) { return b.length - a.length; });
        var alt = words.map(escapeForRegex).join("|");
        return new RegExp("\\b(" + alt + ")\\b|\\b(HP|STM)\\b|(\\d+%?)", "gi");
    }

    /**
     * Colours the mechanical text this mod generated, in a single pass so an emitted escape code is
     * never rescanned. Call it only on derived text, never on anything the developers wrote.
     * Both element words and status names are only tinted when they appear lowercase, since `deriveDamage`,
     * `deriveSkill` and `stateName` all lowercase these words at the source. A capitalised match (e.g.
     * "Bullet" inside an item name like "Pistol Bullet", or "Acid" inside "Acid Dart") names something
     * else entirely and is left untinted.
     * @param {string} clause A derived clause. Never the developers' own prose.
     * @returns {string} The clause with numbers, HP and STM, status names and element words tinted.
     */
    function colourise(clause) {
        if (!colourPattern) colourPattern = buildColourPattern();
        colourPattern.lastIndex = 0;
        return String(clause).replace(colourPattern, function(match, word, unit, number) {
            if (number) return tint(COLOUR_NUMBER, number);
            if (unit) return tint(unit.toUpperCase() === "HP" ? COLOUR_HP : COLOUR_STM, unit);
            if (elementNameSet[match]) return tint(COLOUR_ELEMENT, match);
            if (statusNameSet[match]) return tint(COLOUR_STATUS, match);
            return match;
        });
    }

    BetterDescriptions.colourise = colourise;

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Apply

    var stats = { covered: 0, bare: 0, skipped: 0 };
    var skipLog = [];
    var applied = false;

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Curated

    // Facts that live only in the game's scripts, so no deriver can read them off the record. Each stores the
    // vanilla text it was written against, so a patch that rewords the entry skips it loudly instead of
    // displaying something untrue. `fact` is one more sentence for the mechanical view, not a whole description.
    var CURATED = [
        {
            kind: "skill",
            id: 142,
            expect: "Attempt to craft a Monty Special - needed for\nspecial attacks.",
            fact: "55% chance to succeed, 9% chance to blow up."
        },
        {
            kind: "armor",
            id: 67,
            expect: "There is a scrape in the shape of the letter J inside.\nWill protect the wearer from death once per battle.",
            fact: "Cheats death 4 times a day on Explorer, 3 on Survival, 2 on Cursed."
        }
    ];

    /**
     * Looks up a hand-written fact for a record, used where the mechanic exists only in game scripts.
     * Each entry stores the vanilla text it was written against, so a patch that rewords the record skips it loudly.
     * The caller's own record is judged rather than one re-read from the live database, because `setEnhanced` puts
     * the mod's mechanical view into `description` once boot finishes, and a later caller must not be told the
     * developers patched a record the mod itself rewrote.
     * @param {object} record The database record the fact would be attached to.
     * @param {string} kind One of `"item"`, `"skill"`, `"armor"` or `"weapon"`.
     * @param {number} id The record's index in its database.
     * @returns {string|null} The curated sentence, or null when there is no entry or the vanilla text changed.
     */
    function curatedFact(record, kind, id) {
        for (var i = 0; i < CURATED.length; i++) {
            var c = CURATED[i];
            if (c.kind !== kind || c.id !== id) continue;
            if (record.description !== c.expect) {
                stats.skipped++;
                skipLog.push(kind + " " + id + " (" + record.name + "): vanilla text changed, entry skipped");
                return null;
            }
            return c.fact;
        }
        return null;
    }

    /** Prints how many records were covered, how many had nothing derivable, and every curated skip. */
    function report() {
        console.log("[BetterDescriptions] covered " + stats.covered + ", bare " + stats.bare + ", skipped " + stats.skipped);
        for (var i = 0; i < skipLog.length; i++) console.log("  skipped: " + skipLog[i]);
    }

    BetterDescriptions.report = report;

})();
