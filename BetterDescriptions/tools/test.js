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

group("Mechanical view - damage");
{
    const h = loadMod();
    const D = h.BD.deriveDamage;
    // Fire Breath: 60 - b.def/2, element Fire, scope 2 (all enemies)
    const fireBreath = D(h.pristine.skills[147]);
    check("states amount, element and scope", /60/.test(fireBreath) && /fire/i.test(fireBreath) && /all enemies/i.test(fireBreath), JSON.stringify(fireBreath));
    // Multibite: scope 6 (4 random enemies), repeats 1
    check("states a random-target scope", /4 random/i.test(D(h.pristine.skills[62])), JSON.stringify(D(h.pristine.skills[62])));
    // Spray and Pray: repeats 2 over 4 random enemies, successRate 85
    check("states repeats and accuracy", /85%/.test(D(h.pristine.skills[258])), JSON.stringify(D(h.pristine.skills[258])));
    // Snowball item: 40 - b.def, element Cold
    check("works on items too", /40/.test(D(h.pristine.items[93])), JSON.stringify(D(h.pristine.items[93])));
    check("a record with no damage yields nothing", D(h.pristine.items[11]) === null, JSON.stringify(D(h.pristine.items[11])));
    check("a drain is described as draining", /drain/i.test(D(h.pristine.skills[715])), JSON.stringify(D(h.pristine.skills[715])));
    // Spray and Pray's formula opens "0 + a.mat*0.75", so a naive leading-integer read prints "Deals 0".
    check("a zero leading constant is not reported as the damage", !/\b0\b/.test(D(h.pristine.skills[258])), JSON.stringify(D(h.pristine.skills[258])));
    // Hecatomb is "100 + a.atk*2 - b.def". The 100 is a floor, not the damage.
    check("a constant is dropped when the formula scales off the user", !/100/.test(D(h.pristine.skills[1038])), JSON.stringify(D(h.pristine.skills[1038])));
    // Vampire Strike is a type 5 HP drain, so its target takes "from", not "to".
    check("a drain takes its target with from", /from one enemy/.test(D(h.pristine.skills[715])), JSON.stringify(D(h.pristine.skills[715])));
    // Every damage sentence names a unit. A bare number is the defect Task 7 hunts for.
    const named = (id) => /HP|STM|damage/.test(D(h.pristine.skills[id]));
    check("no damage sentence states a bare number", named(147) && named(715), JSON.stringify(D(h.pristine.skills[715])));
    // Obliteration is "200+b.hp*0.8" - an execute move. Stating 200 understates it without bound.
    check("an added target term drops the constant", !/200/.test(D(h.pristine.skills[940])), JSON.stringify(D(h.pristine.skills[940])));
    // Healing is "32 + 24*danViewers()", which reads live game state rather than an actor stat.
    check("an added game-state call drops the constant", !/32/.test(D(h.pristine.skills[350])), JSON.stringify(D(h.pristine.skills[350])));
    // Cash Sock is "10+coinSockCalc() - b.def/2" - added dynamic term wins over the subtracted one.
    check("one added dynamic term is enough to drop the constant", !/10/.test(D(h.pristine.skills[412])), JSON.stringify(D(h.pristine.skills[412])));
    // A subtracted term only mitigates, so the constant survives as a ceiling.
    check("a subtracted term keeps the constant", /60/.test(D(h.pristine.skills[147])), JSON.stringify(D(h.pristine.skills[147])));
}

group("Mechanical view - costs, durability, self states");
{
    const h = loadMod();
    // Spray and Pray: mpCost 4, <ammoUse:8>
    const spray = h.BD.deriveCosts(h.pristine.skills[258]);
    check("states STM and ammo cost", /4 STM/.test(spray) && /8 ammo/.test(spray), JSON.stringify(spray));
    // Fire Breath: mpCost 6, <WithItemId:114> Monty Special
    check("names a consumed item", /Monty Special/.test(h.BD.deriveCosts(h.pristine.skills[147])), JSON.stringify(h.BD.deriveCosts(h.pristine.skills[147])));
    // Jaw Revolver reload: <hp_cost:15>
    check("states an HP cost", /15 HP/.test(h.BD.deriveCosts(h.pristine.skills[810])), JSON.stringify(h.BD.deriveCosts(h.pristine.skills[810])));
    // Toss Garbage (163) is genuinely costless: mpCost 0 and no ammoUse, hp_cost or WithItemId tag.
    // Do not use a gun skill here - Pistol Shot looks free but carries <ammoUse:1>.
    check("a free skill has no cost sentence", h.BD.deriveCosts(h.pristine.skills[163]) === null, JSON.stringify(h.BD.deriveCosts(h.pristine.skills[163])));
    // Hecatomb: <breakRate:3>
    check("states weapon break risk", /3x/.test(h.BD.deriveDurability(h.pristine.skills[1038])), JSON.stringify(h.BD.deriveDurability(h.pristine.skills[1038])));
    // Spray and Pray is a gun skill with no breakRate tag. Do not use Moss Flow here - it has <breakRate:2>.
    check("no break tag means no sentence", h.BD.deriveDurability(h.pristine.skills[258]) === null, JSON.stringify(h.BD.deriveDurability(h.pristine.skills[258])));
    // Fire Breath: <ApplyState:120> Catatonic, 2-3 turns
    const catatonic = h.BD.deriveSelfState(h.pristine.skills[147]);
    check("states a self-applied state with its duration", /Catatonic/i.test(catatonic) && /2-3/.test(catatonic), JSON.stringify(catatonic));

    // 19 skills have a self-state whose bounds are equal. "for 1-1 turns" is not English.
    check("an equal turn range is not written as a range", / for 1 turn\./.test(h.BD.deriveSelfState(h.pristine.skills[77])), JSON.stringify(h.BD.deriveSelfState(h.pristine.skills[77])));
    // "Bullet" in "Pistol Bullet" names the ammo, not a damage type. Only lowercase element words are tinted.
    const bullet = h.BD.colourise("Costs 1 Pistol Bullet.");
    check("an element word inside an item name is not tinted", bullet.indexOf("Bullet") !== -1 && bullet.indexOf("[4]Bullet") === -1, JSON.stringify(bullet));
    // A derived element word is lowercased at the source, so it must still be tinted.
    check("a lowercase element word is still tinted", h.BD.colourise("Deals 60 fire damage.").indexOf("[4]fire") !== -1, JSON.stringify(h.BD.colourise("Deals 60 fire damage.")));
    // An element on a heal is meaningless. "Restores cold HP" is nonsense.
    check("a heal states no element", !/cold/.test(h.BD.deriveDamage(h.pristine.items[47])), JSON.stringify(h.BD.deriveDamage(h.pristine.items[47])));

    // "Acid" in "Acid Dart" names the ammo, not the status. Only lowercase status names are tinted.
    const dart = h.BD.colourise("Costs 1 Acid Dart.");
    check("a status word inside an item name is not tinted", dart.indexOf("[10]Acid") === -1 && dart.indexOf("[4]Acid") === -1, JSON.stringify(dart));
    // A derived status name is lowercased at the source, so it must still be tinted.
    check("a lowercase status name is still tinted", h.BD.colourise("80% chance to inflict poison.").indexOf("[10]poison") !== -1, JSON.stringify(h.BD.colourise("80% chance to inflict poison.")));
}

group("Mechanical view - states removed and durations");
{
    const h = loadMod();
    // Balm cures bleeding, burns and acid - effect code 22 entries
    const balm = h.BD.deriveStatesRemoved(h.pristine.items[10]);
    check("names every cured status", /bleed/i.test(balm) && /burn/i.test(balm) && /acid/i.test(balm), JSON.stringify(balm));
    check("a record that cures nothing yields nothing", h.BD.deriveStatesRemoved(h.pristine.items[18]) === null);
    // Moss Flow inflicts Poison, which lasts 8-20 turns
    const moss = h.BD.deriveSkill(h.pristine.skills[36]);
    check("an inflicted state carries its duration", /turns/.test(moss), JSON.stringify(moss));
    // Balm cures Bleed1, Bleed2 and Bleed3, which are one status at three tiers, not three cures.
    check("cured tier families collapse to one name", !/bleed\d/.test(balm) && (balm.match(/bleed/g) || []).length === 1, JSON.stringify(balm));

    // Eye Drops applies Anti-blind to an ally (scope 7). Nobody inflicts a cure on themselves.
    const drops = h.BD.deriveSkill(h.pristine.items[6]);
    check("an ally-targeted state is applied, not inflicted", /appl/i.test(drops) && !/inflict/i.test(drops), JSON.stringify(drops));
    // Moss Flow targets all enemies (scope 2), so its poison is still inflicted.
    check("an enemy-targeted state is still inflicted", /inflict/i.test(h.BD.deriveSkill(h.pristine.skills[36])), JSON.stringify(h.BD.deriveSkill(h.pristine.skills[36])));
    // A guaranteed rate needs no percentage in front of it.
    check("a certainty is not written as a chance", !/100% chance/.test(drops), JSON.stringify(drops));
    // Trap items hand an ally a harmful state. The neutral verb must still be used.
    check("a trap item is described neutrally, not as an affliction", /appl/i.test(h.BD.deriveSkill(h.pristine.items[30])), JSON.stringify(h.BD.deriveSkill(h.pristine.items[30])));

    // Roach Cannon's tiers are stored worst-first: Swarm 3 at 5% for 2-3 turns, Swarm 1 at 100% for 4-5.
    // The duration must come from the tier that drives the rate, not from whichever effect is listed first.
    const roach = h.BD.deriveSkill(h.pristine.skills[383]);
    check("a tier duration comes from the likeliest member", /4-5 turns/.test(roach) && !/2-3 turns/.test(roach), JSON.stringify(roach));
    // The same record is guaranteed, so it must also take the bare-verb form.
    check("and the guaranteed tier still reads as a certainty", /^Inflicts swarm/.test(roach), JSON.stringify(roach));
    // Roach Wave is the same shape at 80%, so the combined rate keeps its percentage but gains the right duration.
    check("a partial tier rate also takes the likeliest member's duration", /4-5 turns/.test(h.BD.deriveSkill(h.pristine.skills[384])), JSON.stringify(h.BD.deriveSkill(h.pristine.skills[384])));
}

group("Mechanical view - equipment stats and grants");
{
    const h = loadMod();
    const E = h.BD.deriveEquipment;
    // Tank Tracks grant Ground Anchor (trait code 43)
    check("names a granted skill", /Ground Anchor/i.test(E(h.pristine.armors[356])), JSON.stringify(E(h.pristine.armors[356])));
    // Coat of Arms: trait 61, a 50% chance of a second action
    check("states extra actions", /act twice|extra action/i.test(E(h.pristine.armors[280])), JSON.stringify(E(h.pristine.armors[280])));
    // Cowardly Boots: sparam 0 at 0.5, halving the chance of being targeted
    check("states a target-rate change", /target/i.test(E(h.pristine.armors[272])), JSON.stringify(E(h.pristine.armors[272])));
    // Training Belt: trait 21, maxHP x1.5 and maxSTM x0.5
    check("states a multiplied stat", /50%/.test(E(h.pristine.armors[76])), JSON.stringify(E(h.pristine.armors[76])));
    // Kevlar Suit keeps its element rates
    check("element rates still reported", /40%/.test(E(h.pristine.armors[20])) && /bullet/i.test(E(h.pristine.armors[20])), JSON.stringify(E(h.pristine.armors[20])));

    // "Taken" is a real status (state 165), so the plain English word inside an sp-param phrase used to
    // get tinted as if it named that status. Odd Necklace is one of the five armors that showed it.
    const necklace = h.BD.colourise(h.BD.deriveEquipment(h.pristine.armors[100]));
    check("an sp-param phrase does not collide with a status name", necklace.indexOf("[10]taken") === -1, JSON.stringify(necklace));
    check("and the sp-param change is still stated", /25%/.test(necklace) && /physical damage/.test(necklace), JSON.stringify(necklace));
}

done();
