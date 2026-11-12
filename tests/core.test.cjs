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
