(function (root, factory) {
    "use strict";
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.CardLoopCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    function parseText(source) {
        var text = String(source == null ? "" : source).replace(/^\uFEFF/, "");
        var lines = text.replace(/\r\n?/g, "\n").split("\n");
        var cards = [];
        var skippedLines = [];
        var seen = Object.create(null);
        lines.forEach(function (raw, index) {
            var line = raw.trim();
            if (!line) return;
            var separator = line.indexOf(";");
            if (separator < 0) { skippedLines.push(index + 1); return; }
            var front = line.slice(0, separator).trim();
            var back = line.slice(separator + 1).trim();
            if (!front || !back) { skippedLines.push(index + 1); return; }
            var key = front + "\u0000" + back;
            if (seen[key]) return;
            seen[key] = true;
            cards.push({ front: front, back: back });
        });
        return {
            cards: cards,
            skippedLines: skippedLines,
            nonEmptyLines: lines.filter(function (line) { return line.trim().length > 0; }).length
        };
    }

    function sanitizeHtml(input) {
        var value = String(input == null ? "" : input);
        if (typeof DOMParser === "undefined") return value.replace(/<[^>]*>/g, "");
        var parsed = new DOMParser().parseFromString("<body>" + value + "</body>", "text/html");
        var allowed = {
            a: true, b: true, strong: true, i: true, em: true, u: true, s: true,
            del: true, ins: true, br: true, p: true, div: true, span: true,
            small: true, sub: true, sup: true, mark: true, code: true, pre: true,
            ul: true, ol: true, li: true, blockquote: true, ruby: true, rt: true,
            rp: true, hr: true
        };
        var blocked = {
            script: true, style: true, iframe: true, object: true, embed: true,
            svg: true, math: true, form: true, input: true, button: true,
            textarea: true, select: true, option: true, video: true, audio: true,
            link: true, meta: true, base: true, template: true
        };
        function clean(parent) {
            Array.prototype.slice.call(parent.childNodes).forEach(function (child) {
                if (child.nodeType !== 1) return;
                var tag = child.tagName.toLowerCase();
                if (blocked[tag]) { child.remove(); return; }
                clean(child);
                if (!allowed[tag]) {
                    var fragment = document.createDocumentFragment();
                    while (child.firstChild) fragment.appendChild(child.firstChild);
                    child.replaceWith(fragment);
                    return;
                }
                Array.prototype.slice.call(child.attributes).forEach(function (attribute) {
                    var name = attribute.name.toLowerCase();
                    if (name !== "title" && name !== "lang" && name !== "dir") child.removeAttribute(attribute.name);
                });
                if (tag === "a") child.removeAttribute("href");
            });
        }
        clean(parsed.body);
        return parsed.body.innerHTML;
    }
    return { parseText: parseText, sanitizeHtml: sanitizeHtml };
}));
