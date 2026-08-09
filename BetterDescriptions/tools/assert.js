// Minimal test helper. No dependencies, because the game folder is not an npm project.
let failures = 0;
let current = "";

/**
 * Starts a named group of checks.
 * @param {string} name Group heading printed above its checks.
 */
function group(name) {
    current = name;
    console.log("\n--- " + name + " ---");
}

/**
 * Records one check.
 * @param {string} name What is being asserted.
 * @param {boolean} condition Truthy when the check passes.
 * @param {string} [detail] Extra text printed when the check fails.
 */
function check(name, condition, detail) {
    console.log("  " + (condition ? "PASS" : "FAIL") + "  " + name + (condition ? "" : "\n        " + (detail || "")));
    if (!condition) failures++;
}

/**
 * Prints the tally and sets the process exit code.
 * @returns {number} Number of failed checks.
 */
function done() {
    console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
    process.exitCode = failures ? 1 : 0;
    return failures;
}

module.exports = { group, check, done };
