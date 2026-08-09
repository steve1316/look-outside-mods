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

done();
