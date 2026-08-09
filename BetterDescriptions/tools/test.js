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

done();
