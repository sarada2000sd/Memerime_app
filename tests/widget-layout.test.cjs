const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const layoutDir = path.join(__dirname, "../app/src/main/res/layout");
const names = ["widget_card.xml", "widget_card_balanced.xml", "widget_card_front_long.xml"];
const supportedTags = new Set(["FrameLayout", "LinearLayout", "TextView"]);

test("all home widget layouts use RemoteViews-supported view classes", () => {
    for (const name of names) {
        const xml = fs.readFileSync(path.join(layoutDir, name), "utf8");
        const tags = Array.from(xml.matchAll(/<\/?([A-Za-z][A-Za-z0-9_.]*)\b/g)).map(match => match[1]);
        for (const tag of tags) assert.ok(supportedTags.has(tag), name + " contains unsupported <" + tag + ">");
        for (const id of ["widget_root","widget_brand","widget_count","widget_deck","widget_front_container",
            "widget_front","widget_divider","widget_back_container","widget_back","widget_footer",
            "widget_prev_button","widget_next_button"]) {
            assert.match(xml, new RegExp('android:id="@\\+id/' + id + '"'), name + " missing " + id);
        }
    }
});

test("widget is black with white text and white navigation circles", () => {
    const background = fs.readFileSync(path.join(__dirname, "../app/src/main/res/drawable/widget_background.xml"), "utf8");
    const circles = fs.readFileSync(path.join(__dirname, "../app/src/main/res/drawable/widget_control_circle.xml"), "utf8");
    assert.match(background, /<solid android:color="#000000"/);
    assert.match(circles, /<solid android:color="#FFFFFF"/);
    for (const name of names) {
        const xml = fs.readFileSync(path.join(layoutDir, name), "utf8");
        assert.match(xml, /android:background="@drawable\/widget_background"/);
        for (const id of ["widget_brand","widget_count","widget_deck","widget_front","widget_back"]) {
            const block = xml.match(new RegExp('<TextView\\s+android:id="@\\+id/' + id + '"[\\s\\S]*?/>'));
            assert.ok(block, "missing " + id);
            assert.match(block[0], /android:textColor="#FFFFFF"/);
        }
        assert.match(xml, /android:background="#FFFFFF"/);
        assert.match(xml, /android:textColor="#000000"/);
    }
});

test("navigation buttons are independent overlays without a footer bar", () => {
    for (const name of names) {
        const xml = fs.readFileSync(path.join(layoutDir, name), "utf8");
        assert.ok(xml.includes("<FrameLayout"), name + " should use an overlay-capable root");
        assert.ok(xml.includes('android:layout_gravity="bottom|start"'), name + " missing previous overlay");
        assert.ok(xml.includes('android:layout_gravity="bottom|end"'), name + " missing next overlay");
        assert.ok(!xml.includes("widget_footer"), name + " must not contain a footer strip");
    }
});

test("previous and next controls are initially hidden", () => {
    for (const name of names) {
        const xml = fs.readFileSync(path.join(layoutDir, name), "utf8");
        for (const id of ["widget_prev_button", "widget_next_button"]) {
            const idText = 'android:id="@+id/' + id + '"';
            const start = xml.indexOf(idText);
            assert.notEqual(start, -1, "missing " + id);
            const end = xml.indexOf("/>", start);
            assert.notEqual(end, -1, "unfinished element " + id);
            assert.ok(xml.slice(start, end).includes('android:visibility="gone"'), id + " should start hidden");
        }
    }
});
