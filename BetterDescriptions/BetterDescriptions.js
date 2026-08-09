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

})();
