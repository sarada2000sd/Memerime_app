(function () {
    "use strict";
    var STORAGE_KEY = "cardloop.data.v1";
    var MAX_DECKS = 200;
    var state = loadState();
    var pendingFileDeckId = "";
    var editingDeckId = "";
    var deletingDeckId = "";
    var editingOptionsDeckId = "";
    var toastTimer = 0;

    var el = {
        activeBar: document.getElementById("active-widget-bar"),
        activeLabel: document.getElementById("active-widget-label"),
        library: document.getElementById("library-screen"),
        deckList: document.getElementById("deck-list"),
        deckTotal: document.getElementById("deck-total"),
        allButton: document.getElementById("all-decks-button"),
        addDeck: document.getElementById("add-deck-button"),
        addWidget: document.getElementById("add-widget-button"),
        widgetDialog: document.getElementById("widget-dialog"),
        widgetAdd: document.getElementById("widget-add-button"),
        widgetCancel: document.getElementById("widget-cancel-button"),
        deckDialog: document.getElementById("deck-dialog"),
        deckForm: document.getElementById("deck-form"),
        deckName: document.getElementById("deck-name-input"),
        deckError: document.getElementById("deck-form-error"),
        deckDialogTitle: document.getElementById("deck-dialog-title"),
        deckDialogEyebrow: document.getElementById("deck-dialog-eyebrow"),
        deckSave: document.getElementById("deck-save-button"),
        deckCancel: document.getElementById("deck-cancel-button"),
        deleteDialog: document.getElementById("delete-dialog"),
        deleteMessage: document.getElementById("delete-message"),
        deleteCancel: document.getElementById("delete-cancel-button"),
        deleteConfirm: document.getElementById("delete-confirm-button"),
        optionsDialog: document.getElementById("deck-options-dialog"),
        optionsDeckName: document.getElementById("options-deck-name"),
        optionsToggle: document.getElementById("customize-toggle"),
        optionsFieldset: document.getElementById("customize-settings"),
        optionsTableBody: document.getElementById("card-index-table-body"),
        optionsMode: document.querySelectorAll('input[name="card-selection-mode"]'),
        optionsRange: document.getElementById("range-fields"),
        rangeFrom: document.getElementById("range-from"),
        rangeTo: document.getElementById("range-to"),
        selectedFields: document.getElementById("selected-index-fields"),
        addSelectedField: document.getElementById("add-selected-index"),
        optionsError: document.getElementById("options-error"),
        optionsSave: document.getElementById("options-save-button"),
        optionsCancel: document.getElementById("options-cancel-button"),
        optionsCancelBottom: document.getElementById("options-cancel-bottom"),
        filePicker: document.getElementById("web-file-picker"),
        toast: document.getElementById("toast")
    };

    function makeId() {
        return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
    function normalizeState(saved) {
        if (!saved || !Array.isArray(saved.decks)) {
            return { version: 1, decks: [], allPosition: 0, widgetMode: "none", widgetDeckId: "" };
        }
        saved.decks = saved.decks.filter(function (deck) {
            return deck && typeof deck.id === "string" && typeof deck.name === "string" && Array.isArray(deck.cards);
        }).map(function (deck) {
            deck.cards = deck.cards.filter(function (card) {
                return card && typeof card.front === "string" && typeof card.back === "string";
            });
            deck.currentIndex = Math.max(0, Number(deck.currentIndex) || 0);
            deck.currentIndex = deck.cards.length ? deck.currentIndex % deck.cards.length : 0;
            var custom = deck.customCards && typeof deck.customCards === "object" ? deck.customCards : {};
            deck.customCards = {
                enabled: custom.enabled === true,
                mode: ["all", "range", "selected"].indexOf(custom.mode) >= 0 ? custom.mode : "all",
                from: Math.max(1, Math.floor(Number(custom.from) || 1)),
                to: Math.max(1, Math.floor(Number(custom.to) || deck.cards.length || 1)),
                selected: Array.isArray(custom.selected) ? custom.selected.map(Number).filter(function (v) {
                    return Number.isInteger(v) && v >= 1 && v <= deck.cards.length;
                }) : []
            };
            return deck;
        });
        saved.version = 1;
        saved.allPosition = Math.max(0, Number(saved.allPosition) || 0);
        saved.widgetMode = saved.widgetMode === "deck" || saved.widgetMode === "all" ? saved.widgetMode : "none";
        saved.widgetDeckId = typeof saved.widgetDeckId === "string" ? saved.widgetDeckId : "";
        if (saved.widgetMode === "deck") {
            var activeDeck = saved.decks.find(function (deck) {
                return deck.id === saved.widgetDeckId &&
                    window.CardLoopCore.selectCardIndices(deck.cards.length, deck.customCards).length > 0;
            });
            if (!activeDeck) {
                saved.widgetMode = "none";
                saved.widgetDeckId = "";
            }
        }
        if (saved.widgetMode === "all" && !saved.decks.some(function (deck) {
            return window.CardLoopCore.selectCardIndices(deck.cards.length, deck.customCards).length > 0;
        })) {
            saved.widgetMode = "none";
            saved.widgetDeckId = "";
        }
        return saved;
    }
    function loadState() {
        var raw = "";
        try {
            if (window.AndroidBridge && typeof window.AndroidBridge.loadState === "function") {
                raw = window.AndroidBridge.loadState() || "";
            }
            if (!raw) raw = localStorage.getItem(STORAGE_KEY) || "";
            if (!raw) return { version: 1, decks: [], allPosition: 0, widgetMode: "none", widgetDeckId: "" };
            return normalizeState(JSON.parse(raw));
        } catch (error) {
            return { version: 1, decks: [], allPosition: 0, widgetMode: "none", widgetDeckId: "" };
        }
    }
    function saveState() {
        try {
            var serialized = JSON.stringify(state);
            localStorage.setItem(STORAGE_KEY, serialized);
            if (window.AndroidBridge && typeof window.AndroidBridge.saveState === "function") {
                if (window.AndroidBridge.saveState(serialized) === false) return false;
            }
            renderActiveWidgetBar();
            return true;
        } catch (error) {
            showToast("Could not save. Device storage may be full.");
            return false;
        }
    }

    function showToast(message) {
        window.clearTimeout(toastTimer);
        el.toast.textContent = message;
        el.toast.classList.add("visible");
        toastTimer = window.setTimeout(function () { el.toast.classList.remove("visible"); }, 2600);
    }
    function escapeText(value) {
        return String(value).replace(/[&<>"']/g, function (char) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
        });
    }
    function iconMarkup() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10v14H5z"></path><path d="M9 7.5h10v14H9z"></path></svg>';
    }
    function findDeck(id) {
        return state.decks.find(function (deck) { return deck.id === id; }) || null;
    }
    function cardIndices(deck) {
        return window.CardLoopCore.selectCardIndices(deck.cards.length, deck.customCards);
    }
    function buildAllCardRefs() {
        var all = [];
        state.decks.forEach(function (deck) {
            cardIndices(deck).forEach(function (cardIndex) {
                all.push({ deckId: deck.id, cardIndex: cardIndex });
            });
        });
        return all;
    }
    function renderActiveWidgetBar() {
        var label = "";
        if (state.widgetMode === "all") label = "ALL DECKS";
        else if (state.widgetMode === "deck") {
            var activeDeck = findDeck(state.widgetDeckId);
            label = activeDeck ? activeDeck.name : "";
        }
        el.activeBar.hidden = !label;
        if (label) el.activeLabel.textContent = label;
    }

    function renderDecks() {
        var decks = state.decks;
        el.deckTotal.textContent = decks.length + (decks.length === 1 ? " DECK" : " DECKS");
        el.deckList.innerHTML = "";
        if (!decks.length) {
            el.deckList.innerHTML = '<div class="empty-library"><div class="empty-mark">[ ]</div><div class="empty-title">A clean slate.</div><p class="empty-copy">Create your first deck, then add a TXT file to fill it with cards.</p></div>';
            return;
        }
        decks.forEach(function (deck) {
            var count = deck.cards.length;
            var card = document.createElement("article");
            card.className = "deck-card";
            var actions = '<button class="button button-quiet" type="button" data-action="rename" data-id="' + escapeText(deck.id) + '">Rename</button>' +
                '<button class="button button-quiet" type="button" data-action="delete" data-id="' + escapeText(deck.id) + '">Delete</button>';
            if (count === 0) {
                actions += '<button class="button button-add button-quiet" type="button" data-action="import" data-id="' + escapeText(deck.id) + '" aria-label="Add TXT file"><span>+</span></button>';
            } else {
                actions += '<button class="button button-quiet" type="button" data-action="import" data-id="' + escapeText(deck.id) + '">Add TXT</button>' +
                    '<button class="button button-primary" type="button" data-action="use" data-id="' + escapeText(deck.id) + '">Use now <span aria-hidden="true">→</span></button>';
            }
            var customLabel = deck.customCards && deck.customCards.enabled ? '<span class="custom-active-label">CUSTOM</span>' : '';
            card.innerHTML = '<div class="deck-topline"><div class="deck-identity"><div class="deck-icon">' + iconMarkup() +
                '</div><div class="deck-copy"><div class="deck-name">' + escapeText(deck.name) + '</div><div class="deck-meta">' +
                count + (count === 1 ? ' CARD' : ' CARDS') + (count ? ' · RESUME ' + (deck.currentIndex + 1) : ' · EMPTY') +
                customLabel + '</div></div></div><button class="deck-more-button" type="button" data-action="customize" data-id="' +
                escapeText(deck.id) + '" aria-label="Deck options">•••</button></div><div class="deck-actions">' + actions + '</div>';
            el.deckList.appendChild(card);
        });
    }

    function showLibrary() {
        el.library.hidden = false;
        el.allButton.hidden = false;
        renderDecks();
        renderActiveWidgetBar();
    }
    function openDeckDialog(deck) {
        editingDeckId = deck ? deck.id : "";
        el.deckDialogTitle.textContent = deck ? "Rename deck" : "Create a deck";
        el.deckDialogEyebrow.textContent = deck ? "EDIT DECK" : "NEW DECK";
        el.deckSave.textContent = deck ? "Save changes" : "Save deck";
        el.deckName.value = deck ? deck.name : "";
        el.deckError.textContent = "";
        el.deckDialog.showModal();
        window.setTimeout(function () { el.deckName.focus(); }, 80);
    }
    function saveDeckName() {
        var name = el.deckName.value.trim().replace(/\s+/g, " ");
        el.deckError.textContent = "";
        if (!name) { el.deckError.textContent = "Enter a deck name."; return; }
        var duplicate = state.decks.some(function (deck) {
            return deck.id !== editingDeckId && deck.name.toLowerCase() === name.toLowerCase();
        });
        if (duplicate) { el.deckError.textContent = "A deck with this name already exists."; return; }

        var wasEditing = Boolean(editingDeckId);
        if (wasEditing) {
            var existing = findDeck(editingDeckId);
            if (!existing) return;
            existing.name = name;
        } else {
            if (state.decks.length >= MAX_DECKS) { el.deckError.textContent = "You have reached the deck limit."; return; }
            state.decks.push({ id: makeId(), name: name, cards: [], currentIndex: 0,
                customCards: { enabled: false, mode: "all", from: 1, to: 1, selected: [] },
                createdAt: Date.now() });
        }
        if (saveState()) {
            el.deckDialog.close();
            renderDecks();
            showToast(wasEditing ? "Deck name updated." : "Deck created.");
        }
    }
    function openDeleteDialog(deck) {
        deletingDeckId = deck.id;
        el.deleteMessage.textContent = '"' + deck.name + '" and its ' + deck.cards.length + ' cards will be removed from this device.';
        el.deleteDialog.showModal();
    }
    function deleteDeck() {
        state.decks = state.decks.filter(function (deck) { return deck.id !== deletingDeckId; });
        state.allPosition = 0;
        if (state.widgetMode === "deck" && state.widgetDeckId === deletingDeckId) {
            state.widgetMode = "none";
            state.widgetDeckId = "";
        }
        if (state.widgetMode === "all" && !buildAllCardRefs().length) {
            state.widgetMode = "none";
            state.widgetDeckId = "";
        }
        saveState();
        el.deleteDialog.close();
        renderDecks();
        showToast("Deck deleted.");
    }

    function importFile(deckId) {
        if (!findDeck(deckId)) return;
        pendingFileDeckId = deckId;
        if (window.AndroidBridge && typeof window.AndroidBridge.pickTextFile === "function") {
            window.AndroidBridge.pickTextFile(deckId);
        } else {
            el.filePicker.value = "";
            el.filePicker.click();
        }
    }
    function importText(text) {
        var deck = findDeck(pendingFileDeckId);
        pendingFileDeckId = "";
        if (!deck) { showToast("Choose a deck before importing."); return; }
        var parsed = window.CardLoopCore.parseText(text);
        if (!parsed.cards.length) { showToast("No valid cards found. Use one Front ; Back card per line."); return; }

        var existing = Object.create(null);
        deck.cards.forEach(function (card) { existing[card.front + "\u0000" + card.back] = true; });
        var added = 0;
        var duplicates = 0;
        parsed.cards.forEach(function (card) {
            var key = card.front + "\u0000" + card.back;
            if (existing[key]) { duplicates += 1; return; }
            existing[key] = true;
            deck.cards.push({ id: makeId(), front: card.front, back: card.back });
            added += 1;
        });
        deck.updatedAt = Date.now();
        if (deck.cards.length) deck.currentIndex %= deck.cards.length;
        if (saveState()) {
            renderDecks();
            var message = added + " cards added";
            if (duplicates) message += " · " + duplicates + " duplicates skipped";
            if (parsed.skippedLines.length) message += " · " + parsed.skippedLines.length + " invalid lines skipped";
            showToast(message + ".");
        }
    }
    window.onAndroidTextFile = function (content, fileName, error) {
        if (error) {
            pendingFileDeckId = "";
            if (error !== "File selection cancelled.") showToast(error);
            return;
        }
        importText(content);
    };

    function handleBack() {
        if (el.widgetDialog && el.widgetDialog.open) { el.widgetDialog.close(); return true; }
        if (el.deckDialog && el.deckDialog.open) { el.deckDialog.close(); return true; }
        if (el.deleteDialog && el.deleteDialog.open) { el.deleteDialog.close(); return true; }
        return false;
    }


    function selectedInputs() {
        var values = [];
        el.selectedFields.querySelectorAll("input[data-index-value]").forEach(function (input) {
            var value = Math.floor(Number(input.value));
            if (input.value.trim() && Number.isFinite(value) && value > 0) values.push(value);
        });
        return Array.from(new Set(values)).sort(function (a, b) { return a - b; });
    }
    function selectedMode() {
        var active = Array.prototype.find.call(el.optionsMode, function (radio) { return radio.checked; });
        return active ? active.value : "all";
    }
    function addIndexInput(value) {
        var chip = document.createElement("label");
        chip.className = "index-chip";
        chip.innerHTML = '<span>[</span><input type="number" inputmode="numeric" min="1" max="9999" data-index-value="true" aria-label="Card index"><span>]</span><button type="button" class="remove-index-button" aria-label="Remove index">×</button>';
        chip.querySelector("input").value = value === undefined ? "" : String(value);
        el.selectedFields.appendChild(chip);
        return chip.querySelector("input");
    }
    function renderSelectedInputs(values) {
        el.selectedFields.innerHTML = "";
        (values && values.length ? values : [""]).forEach(function (value) { addIndexInput(value); });
    }
    function updateOptionsMode() {
        var enabled = el.optionsToggle.checked;
        el.optionsFieldset.disabled = !enabled;
        el.optionsFieldset.classList.toggle("is-disabled", !enabled);
        var mode = selectedMode();
        el.optionsRange.hidden = mode !== "range";
        el.selectedFields.closest(".selection-fields-wrap").hidden = mode !== "selected";
        var deck = findDeck(editingOptionsDeckId);
        if (deck) {
            var draft = {
                enabled: enabled,
                mode: mode,
                from: Number(el.rangeFrom.value) || 1,
                to: Number(el.rangeTo.value) || deck.cards.length,
                selected: selectedInputs()
            };
            renderOptionsTable(deck, draft);
        }
    }
    function renderOptionsTable(deck, config) {
        el.optionsTableBody.innerHTML = "";
        var selected = Object.create(null);
        if (config.enabled && config.mode === "range") {
            for (var n = Number(config.from); n <= Number(config.to); n++) selected[n] = true;
        } else if (config.enabled && config.mode === "selected") {
            (config.selected || []).forEach(function (n) { selected[n] = true; });
        }
        deck.cards.forEach(function (card, index) {
            var row = document.createElement("tr");
            if (selected[index + 1]) row.className = "selected-row";
            var number = document.createElement("td");
            var front = document.createElement("td");
            var back = document.createElement("td");
            number.className = "index-cell";
            number.textContent = String(index + 1);
            front.innerHTML = window.CardLoopCore.sanitizeHtml(card.front);
            back.innerHTML = window.CardLoopCore.sanitizeHtml(card.back);
            row.appendChild(number);
            row.appendChild(front);
            row.appendChild(back);
            el.optionsTableBody.appendChild(row);
        });
        if (!deck.cards.length) el.optionsTableBody.innerHTML = '<tr><td colspan="3" class="table-empty">No cards in this deck yet.</td></tr>';
    }
    function openOptionsDialog(deck) {
        editingOptionsDeckId = deck.id;
        var config = deck.customCards || { enabled: false, mode: "all", from: 1, to: deck.cards.length || 1, selected: [] };
        el.optionsDeckName.textContent = deck.name;
        el.optionsToggle.checked = config.enabled === true;
        el.rangeFrom.value = String(config.from || 1);
        el.rangeTo.value = String(config.to || deck.cards.length || 1);
        el.optionsError.textContent = "";
        Array.prototype.forEach.call(el.optionsMode, function (radio) {
            radio.checked = radio.value === (config.mode || "all");
        });
        renderSelectedInputs(config.selected || []);
        updateOptionsMode();
        el.optionsDialog.showModal();
    }
    function saveOptions() {
        var deck = findDeck(editingOptionsDeckId);
        if (!deck) return;
        el.optionsError.textContent = "";
        var enabled = el.optionsToggle.checked;
        var mode = selectedMode();
        var config = {
            enabled: enabled,
            mode: mode,
            from: 1,
            to: deck.cards.length || 1,
            selected: []
        };
        if (enabled && mode === "range") {
            var from = Math.floor(Number(el.rangeFrom.value));
            var to = Math.floor(Number(el.rangeTo.value));
            if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 ||
                to < from || to > deck.cards.length) {
                el.optionsError.textContent = "Enter a valid range from 1 to " + deck.cards.length + ".";
                return;
            }
            config.from = from;
            config.to = to;
        } else if (enabled && mode === "selected") {
            config.selected = selectedInputs().filter(function (n) { return n <= deck.cards.length; });
            if (!config.selected.length) {
                el.optionsError.textContent = "Add at least one valid card index.";
                return;
            }
        }
        deck.customCards = config;
        var allowed = cardIndices(deck);
        if (state.widgetMode === "deck" && state.widgetDeckId === deck.id &&
            allowed.length && allowed.indexOf(deck.currentIndex) < 0) {
            deck.currentIndex = allowed[0];
        }
        if (state.widgetMode === "all") {
            var all = buildAllCardRefs();
            if (!all.length) {
                state.widgetMode = "none";
                state.widgetDeckId = "";
                state.allPosition = 0;
            } else state.allPosition %= all.length;
        }
        if (saveState()) {
            el.optionsDialog.close();
            renderDecks();
            renderActiveWidgetBar();
            showToast(enabled ? "Card selection saved." : "All cards enabled for this deck.");
        }
    }

    function requestHomeWidget() {
        if (!window.AndroidBridge || typeof window.AndroidBridge.requestAddWidget !== "function") {
            showToast("Home-screen widgets are available in the Android app.");
            return;
        }
        if (window.AndroidBridge.requestAddWidget()) {
            el.widgetDialog.close();
            showToast("Confirm the Add option in your Android launcher.");
        } else {
            showToast("Your launcher does not support direct widget pinning.");
        }
    }
    function maybeShowWidgetPrompt() {
        if (!window.AndroidBridge || typeof window.AndroidBridge.consumeFirstWidgetPrompt !== "function") return;
        if (window.AndroidBridge.consumeFirstWidgetPrompt()) {
            window.setTimeout(function () {
                if (!el.widgetDialog.open) el.widgetDialog.showModal();
            }, 650);
        }
    }
    function refreshFromNative() {
        try {
            if (!window.AndroidBridge || typeof window.AndroidBridge.loadState !== "function") return false;
            var raw = window.AndroidBridge.loadState();
            if (!raw) return false;
            state = normalizeState(JSON.parse(raw));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                renderDecks();
            renderActiveWidgetBar();
            return true;
        } catch (error) {
            return false;
        }
    }


    el.deckList.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-action]");
        if (!button) return;
        var deck = findDeck(button.getAttribute("data-id"));
        if (!deck) return;
        var action = button.getAttribute("data-action");
        if (action === "use") startDeck(deck.id);
        if (action === "import") importFile(deck.id);
        if (action === "rename") openDeckDialog(deck);
        if (action === "delete") openDeleteDialog(deck);
        if (action === "customize") openOptionsDialog(deck);
    });
    el.addDeck.addEventListener("click", function () { openDeckDialog(null); });
    el.allButton.addEventListener("click", startAllDecks);
    el.addWidget.addEventListener("click", function () { el.widgetDialog.showModal(); });
    el.widgetAdd.addEventListener("click", requestHomeWidget);
    el.widgetCancel.addEventListener("click", function () { el.widgetDialog.close(); });
    el.deckForm.addEventListener("submit", function (event) { event.preventDefault(); saveDeckName(); });
    el.deckCancel.addEventListener("click", function () { el.deckDialog.close(); });
    el.deleteCancel.addEventListener("click", function () { el.deleteDialog.close(); });
    el.deleteConfirm.addEventListener("click", deleteDeck);
    el.optionsToggle.addEventListener("change", updateOptionsMode);
    Array.prototype.forEach.call(el.optionsMode, function (radio) {
        radio.addEventListener("change", updateOptionsMode);
    });
    el.rangeFrom.addEventListener("input", updateOptionsMode);
    el.rangeTo.addEventListener("input", updateOptionsMode);
    el.addSelectedField.addEventListener("click", function () {
        var input = addIndexInput("");
        input.focus();
    });
    el.selectedFields.addEventListener("input", function (event) {
        if (!event.target.matches("input[data-index-value]")) return;
        var inputs = el.selectedFields.querySelectorAll("input[data-index-value]");
        if (inputs.length && event.target === inputs[inputs.length - 1] && event.target.value.trim()) {
            addIndexInput("");
        }
        updateOptionsMode();
    });
    el.selectedFields.addEventListener("click", function (event) {
        var remove = event.target.closest(".remove-index-button");
        if (!remove) return;
        remove.closest(".index-chip").remove();
        if (!el.selectedFields.querySelector("input[data-index-value]")) addIndexInput("");
        updateOptionsMode();
    });
    el.optionsSave.addEventListener("click", saveOptions);
    el.optionsCancel.addEventListener("click", function () { el.optionsDialog.close(); });
    el.optionsCancelBottom.addEventListener("click", function () { el.optionsDialog.close(); });
    el.filePicker.addEventListener("change", function () {
        var file = el.filePicker.files && el.filePicker.files[0];
        if (!file) { pendingFileDeckId = ""; return; }
        if (file.size > 5 * 1024 * 1024) { pendingFileDeckId = ""; showToast("TXT files must be 5 MB or smaller."); return; }
        var reader = new FileReader();
        reader.onload = function () { importText(String(reader.result || "")); };
        reader.onerror = function () { pendingFileDeckId = ""; showToast("Could not read that TXT file."); };
        reader.readAsText(file, "UTF-8");
    });
    window.CardLoopApp = { handleBack: handleBack, refreshFromNative: refreshFromNative };
    renderDecks();
    renderActiveWidgetBar();
    maybeShowWidgetPrompt();
}());
