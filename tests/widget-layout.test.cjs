const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const layoutDir = path.join(__dirname, "../app/src/main/res/layout");
const names = ["widget_card.xml", "widget_card_balanced.xml", "widget_card_front_long.xml"];
const supportedTags = new Set(["LinearLayout", "TextView"]);

test("all home widget layouts use RemoteViews-supported view classes", () => {
    for (const name of names) {
        const xml = fs.readFileSync(path.join(layoutDir, name), "utf8");
        const tags = Array.from(xml.matchAll(/<\/?([A-Za-z][A-Za-z0-9_.]*)\b/g)).map(match => match[1]);
        for (const tag of tags) {
            assert.ok(supportedTags.has(tag), name + " contains unsupported RemoteViews element <" + tag + ">");
        }
        for (const id of ["widget_root", "widget_brand", "widget_count", "widget_deck",
            "widget_front_container", "widget_front", "widget_divider",
            "widget_back_container", "widget_back"]) {
            assert.match(xml, new RegExp('android:id="@\\+id/' + id + '"'), name + " is missing " + id);
        }
    }
});

test("widget card background and all text are strict black and white", () => {
    const background = fs.readFileSync(path.join(__dirname, "../app/src/main/res/drawable/widget_background.xml"), "utf8");
    assert.match(background, /<solid android:color="#000000"/);
    for (const name of names) {
        const xml = fs.readFileSync(path.join(layoutDir, name), "utf8");
        assert.match(xml, /android:background="@drawable\/widget_background"/);
        assert.doesNotMatch(xml, /android:textColor="#(?!FFFFFF)[0-9A-Fa-f]{6}"/);
        assert.match(xml, /android:background="#FFFFFF"/);
    }
});
