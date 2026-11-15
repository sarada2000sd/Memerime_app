const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../app/src/main/assets/js/core.js");

test("first semicolon splits front from back", () => {
    const result = core.parseText("<b>Front</b>; <b>Back; continued</b>");
    assert.equal(result.cards.length, 1);
    assert.equal(result.cards[0].front, "<b>Front</b>");
    assert.equal(result.cards[0].back, "<b>Back; continued</b>");
});
test("keeps Sinhala, German letters and HTML formatting", () => {
    const input = "\uFEFF<b>The girl</b>; <b>das Mädchen</b><br><b>ඩාස් මෙඩ්ෂන්</b><br><b>Das Mädchen ist jung.</b><br><b>ගැහැණු ළමයා තරුණයි.</b>";
    const result = core.parseText(input);
    assert.equal(result.cards.length, 1);
    assert.match(result.cards[0].back, /Mädchen/);
    assert.match(result.cards[0].back, /ඩාස් මෙඩ්ෂන්/);
    assert.match(result.cards[0].back, /තරුණයි/);
    assert.match(result.cards[0].back, /<br>/);
});
test("parses multiple card lines and ignores blanks", () => {
    const result = core.parseText(["One;Uno", "", "Two;Dos", " ", "Three;Tres"].join("\n"));
    assert.equal(result.cards.length, 3);
    assert.equal(result.nonEmptyLines, 3);
});
test("reports malformed non-empty lines", () => {
    const result = core.parseText("No separator\nFront only;\n;Back\nGood;Card");
    assert.equal(result.cards.length, 1);
    assert.deepEqual(result.skippedLines, [1, 2, 3]);
});
test("skips duplicate cards in a single file", () => {
    const result = core.parseText("Front;Back\nFront;Back\nFront;Other");
    assert.equal(result.cards.length, 2);
});


test("deck selector returns all cards when customization is off", () => {
    assert.deepEqual(core.selectCardIndices(5, { enabled: false, mode: "selected", selected: [2] }), [0, 1, 2, 3, 4]);
});
test("deck selector uses inclusive one-based ranges", () => {
    assert.deepEqual(core.selectCardIndices(8, { enabled: true, mode: "range", from: 2, to: 5 }), [1, 2, 3, 4]);
    assert.deepEqual(core.selectCardIndices(5, { enabled: true, mode: "range", from: 5, to: 2 }), []);
});
test("deck selector uses unique sorted one-based selected indexes", () => {
    assert.deepEqual(core.selectCardIndices(7, { enabled: true, mode: "selected", selected: [6, 2, 2, 12, 1] }), [0, 1, 5]);
});
test("deck selector All cards mode includes the whole deck", () => {
    assert.deepEqual(core.selectCardIndices(3, { enabled: true, mode: "all" }), [0, 1, 2]);
});
