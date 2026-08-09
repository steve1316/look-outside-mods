const { group, check, done } = require("./assert.js");
const { loadMod, makeWindowStub } = require("./harness.js");

group("Task 1 - skeleton and config");
{
    const h = loadMod();
    check("mod defines a global BetterDescriptions", !!h.BD);
    check("config defaults toggleKey to Tab", h.BD.config.toggleKey === "Tab", String(h.BD && h.BD.config && h.BD.config.toggleKey));
    check("config defaults toggleButton to 8", h.BD.config.toggleButton === 8);
    check("config defaults buttonLabel to Select", h.BD.config.buttonLabel === "Select");
    check("config defaults showHint to true", h.BD.config.showHint === true);
    check("config defaults pageSeconds to 2", h.BD.config.pageSeconds === 2);
}
{
    const h = loadMod({ params: { toggleKey: "KeyH", toggleButton: 4, showHint: false, pageSeconds: 0 } });
    check("string params are honoured", h.BD.config.toggleKey === "KeyH");
    check("numeric params are honoured", h.BD.config.toggleButton === 4);
    check("boolean false is honoured", h.BD.config.showHint === false);
    check("pageSeconds 0 is honoured, not treated as missing", h.BD.config.pageSeconds === 0);
}
{
    const h = loadMod({ params: { showHint: "true", toggleButton: "8" } });
    check("string 'true' also reads as boolean true", h.BD.config.showHint === true);
    check("string '8' also reads as number 8", h.BD.config.toggleButton === 8);
}

group("Task 2 - toggle core");
{
    const h = loadMod();
    const item = h.sandbox.$dataItems[93];
    const vanilla = h.pristine.items[93].description;
    h.BD.register(item, vanilla, "TEST ENHANCED");
    h.BD.setEnhanced(true);
    check("enhanced view writes the enhanced text", item.description === "TEST ENHANCED", item.description);
    h.BD.setEnhanced(false);
    check("original view restores the devs' text byte for byte", item.description === vanilla, JSON.stringify(item.description));
    check("isEnhanced reflects the view", h.BD.isEnhanced() === false);

    h.sandbox.ConfigManager.betterDescriptions = true;
    check("ConfigManager setter switches the view", item.description === "TEST ENHANCED");
    check("makeData persists the flag", h.sandbox.ConfigManager.makeData().betterDescriptions === true);
    h.sandbox.ConfigManager.applyData({ betterDescriptions: false });
    check("applyData restores the saved view", item.description === vanilla);
    h.sandbox.ConfigManager.applyData({});
    check("a missing flag defaults to enhanced", item.description === "TEST ENHANCED");
}

group("Task 3 - input");
{
    const h = loadMod();
    const item = h.sandbox.$dataItems[93];
    h.BD.register(item, "VAN", "ENH");
    h.BD.setEnhanced(true);

    h.fire("Tab");
    check("Tab toggles", item.description === "VAN", item.description);
    h.fire("KeyZ");
    check("an unrelated key does not toggle", item.description === "VAN");
    h.fire("Tab");
    check("Tab toggles back", item.description === "ENH");
    check("toggling saves the config", h.sandbox.ConfigManager.saveCount >= 2);

    const frame = () => h.sandbox.SceneManager.updateInputData();
    h.pad.buttons[8].pressed = true; frame();
    check("gamepad button 8 toggles", item.description === "VAN");
    frame(); frame();
    check("holding does not repeat", item.description === "VAN");
    h.pad.buttons[8].pressed = false; frame();
    check("releasing does not toggle", item.description === "VAN");

    check("device tracking follows the pad", h.BD.lastInput() === "pad");
    h.fire("KeyM");
    check("device tracking follows the keyboard", h.BD.lastInput() === "key");

    function Scene_GamepadConfig_V() {}
    h.sandbox.SceneManager._scene = new Scene_GamepadConfig_V();
    const before = item.description;
    h.pad.buttons[8].pressed = true; frame();
    check("inert while remapping controls", item.description === before);
    h.pad.buttons[8].pressed = false; frame();
    h.sandbox.SceneManager._scene = null;
}

group("Task 4 - help box");
{
    const h = loadMod();
    const measure = (s) => s.replace(/\\C\[\d+\]/g, "").length * 10;

    check("hint names the keyboard by default", h.BD.hintLabel() === "[TAB] original", h.BD.hintLabel());
    h.pad.buttons[3].pressed = true;
    h.sandbox.SceneManager.updateInputData();
    h.pad.buttons[3].pressed = false;
    check("hint names the pad after pad input", h.BD.hintLabel() === "[SELECT] original", h.BD.hintLabel());
    h.fire("KeyM");
    h.BD.setEnhanced(false);
    check("hint says 'enhanced' while showing the original", h.BD.hintLabel() === "[TAB] enhanced", h.BD.hintLabel());
    h.BD.setEnhanced(true);

    const lines = h.BD.wrapToWidth(measure, "one two three four five six seven eight", 200);
    check("wrapping never exceeds the width", lines.every((l) => measure(l) <= 200), JSON.stringify(lines));
    check("wrapping loses no words", lines.join(" ").split(/\s+/).length === 8, JSON.stringify(lines));

    const glued = h.BD.wrapToWidth(measure, "\\C[24]max HP\\C[0] and more words to force a break here now", 200);
    check("a colour span is never split across lines", glued.every((l) => {
        const opens = (l.match(/\\C\[(?!0\])\d+\]/g) || []).length;
        const closes = (l.match(/\\C\[0\]/g) || []).length;
        return opens === closes;
    }), JSON.stringify(glued));

    check("two lines never paginate", h.BD.paginate(["a", "b"], 2).length === 1);
    const pages = h.BD.paginate(["a", "b", "c"], 2);
    check("three lines make two pages", pages.length === 2, JSON.stringify(pages));
    check("first page holds the first two lines", pages[0].join("|") === "a|b");
}

group("Mechanical view - 18pt rendering");
{
    const h = loadMod();
    check("font size defaults to 18", h.BD.config.mechanicalFontSize === 18, String(h.BD.config.mechanicalFontSize));

    const h2 = loadMod({ params: { mechanicalFontSize: 14 } });
    check("font size is configurable", h2.BD.config.mechanicalFontSize === 14, String(h2.BD.config.mechanicalFontSize));

    const h3 = loadMod({ params: { mechanicalFontSize: 0 } });
    check("a zero font size falls back to the default rather than vanishing", h3.BD.config.mechanicalFontSize === 18, String(h3.BD.config.mechanicalFontSize));

    // MZ calls resetFontSettings() as the first statement of both textSizeEx and drawTextEx, so a
    // contents.fontSize set beforehand never survives. The stub reproduces that, and records the size
    // every run of text actually ran at. Without the \FS escape these come back as the engine's 22.
    const body = "Deals \\C[6]60\\C[0] \\C[4]fire\\C[0] damage to all enemies. Costs \\C[6]6\\C[0] \\C[23]STM\\C[0], 1 Monty Special.";
    const w = makeWindowStub({ text: body, width: 720, height: 108 });
    h.BD.drawCoveredText(w);
    check("every measured run runs at the mechanical font size", w.measuredSizes.length > 0 && w.measuredSizes.every((s) => s === 18), JSON.stringify(w.measuredSizes));
    check("every drawn body run runs at the mechanical font size", w.drawnSizes.length > 0 && w.drawnSizes.every((s) => s === 18), JSON.stringify(w.drawnSizes));
    check("the hint strip stays smaller than the body", w.hintSizes.length === 1 && w.hintSizes[0] < 18, JSON.stringify(w.hintSizes));

    // A configured size must reach the glass too, not just the config object.
    const w2 = makeWindowStub({ text: body, width: 720, height: 108 });
    h2.BD.drawCoveredText(w2);
    check("a configured font size reaches the drawn text", w2.drawnSizes.length > 0 && w2.drawnSizes.every((s) => s === 14), JSON.stringify(w2.drawnSizes));

    // The wrap budget is only honest if measuring and drawing agree on the size.
    check("measuring and drawing agree on the size", w.measuredSizes.concat(w.drawnSizes).every((s) => s === 18), JSON.stringify(w.measuredSizes.concat(w.drawnSizes)));

    // `drawCoveredText` is not mechanical-view-only. `setEnhanced` marks whichever wording is currently
    // shown, so in the original view the hook routes the developers' own prose through it. That text must
    // keep the engine's 22pt - the size shift is what signals which of the two views is showing.
    const hv = loadMod();
    hv.boot();
    const spray = hv.sandbox.$dataItems[2];
    hv.BD.setEnhanced(false);
    const wOriginal = makeWindowStub({ text: spray.description });
    hv.BD.drawCoveredText(wOriginal);
    const vanillaSizes = wOriginal.drawnSizes;
    check("the developers' text draws at the engine size", vanillaSizes.length > 0 && vanillaSizes.every((s) => s === 22), JSON.stringify(vanillaSizes));
    check("and measuring agrees with drawing in the original view", wOriginal.measuredSizes.every((s) => s === 22), JSON.stringify(wOriginal.measuredSizes));

    hv.BD.setEnhanced(true);
    const wMechanical = makeWindowStub({ text: spray.description });
    hv.BD.drawCoveredText(wMechanical);
    const mechSizes = wMechanical.drawnSizes;
    check("the same record still draws at the mechanical size when enhanced", mechSizes.length > 0 && mechSizes.every((s) => s === 18), JSON.stringify(mechSizes));
    check("and measuring agrees with drawing in the enhanced view", wMechanical.measuredSizes.every((s) => s === 18), JSON.stringify(wMechanical.measuredSizes));
    check("the two views really do draw at different sizes", wOriginal.drawnSizes[0] !== wMechanical.drawnSizes[0], wOriginal.drawnSizes[0] + " vs " + wMechanical.drawnSizes[0]);

    // 18pt fits more per line than 22pt, which is the whole point: fewer records need a second page.
    const long = "Resists poison, blind, panic and 19 others 30%. Immune to bleed, burn and acid. Changes max HP +50%, max STM -50%, agility +20%.";
    const wLarge = makeWindowStub({ text: long, width: 480, height: 108, mainFontSize: 22 });
    h.BD.drawCoveredText(wLarge);
    const at18 = wLarge._bdPages.length;
    const wVanilla = makeWindowStub({ text: long, width: 480, height: 108, mainFontSize: 22 });
    wVanilla.textSizeEx = (t) => ({ width: String(t).replace(/\\C\[\d+\]|\\FS\[\d+\]/g, "").length * 11, height: 36 });
    h.BD.drawCoveredText(wVanilla);
    check("18pt needs no more pages than 22pt would", at18 <= wVanilla._bdPages.length, at18 + " vs " + wVanilla._bdPages.length);
}

done();
