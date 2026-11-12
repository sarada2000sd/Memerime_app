(function () {
    "use strict";
    var STORAGE_KEY = "cardloop.data.v1";
    var MAX_DECKS = 200;
    var state = loadState();
    var session = null;
    var pendingFileDeckId = "";
    var editingDeckId = "";
    var deletingDeckId = "";
    var toastTimer = 0;
    var advanceLocked = false;

    var el = {
        library: document.getElementById("library-screen"),
        study: document.getElementById("study-screen"),
        deckList: document.getElementById("deck-list"),
        deckTotal: document.getElementById("deck-total"),
        allButton: document.getElementById("all-decks-button"),
        addDeck: document.getElementById("add-deck-button"),
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
        studyTitle: document.getElementById("study-deck-title"),
        studyMode: document.getElementById("study-mode-label"),
        studyCount: document.getElementById("study-count"),
        front: document.getElementById("card-front-content"),
        back: document.getElementById("card-back-content"),
        flashcard: document.getElementById("flashcard"),
        progress: document.getElementById("study-progress"),
        backButton: document.getElementById("back-to-library"),
        exitButton: document.getElementById("exit-study-button"),
        filePicker: document.getElementById("web-file-picker"),
        toast: document.getElementById("toast")
    };

    function makeId() {
        return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
    function loadState() {
        var empty = { version: 1, decks: [], allPosition: 0 };
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return empty;
            var saved = JSON.parse(raw);
            if (!saved || !Array.isArray(saved.decks)) return empty;
            saved.decks = saved.decks.filter(function (deck) {
                return deck && typeof deck.id === "string" && typeof deck.name === "string" && Array.isArray(deck.cards);
            }).map(function (deck) {
                deck.cards = deck.cards.filter(function (card) {
                    return card && typeof card.front === "string" && typeof card.back === "string";
                });
                deck.currentIndex = Math.max(0, Number(deck.currentIndex) || 0);
                deck.currentIndex = deck.cards.length ? deck.currentIndex % deck.cards.length : 0;
                return deck;
            });
            saved.version = 1;
            saved.allPosition = Math.max(0, Number(saved.allPosition) || 0);
            return saved;
        } catch (error) { return empty; }
    }
    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
            card.innerHTML = '<div class="deck-topline"><div class="deck-identity"><div class="deck-icon">' + iconMarkup() +
                '</div><div><div class="deck-name">' + escapeText(deck.name) + '</div><div class="deck-meta">' +
                count + (count === 1 ? ' CARD' : ' CARDS') + (count ? ' · RESUME ' + (deck.currentIndex + 1) : ' · EMPTY') +
                '</div></div></div></div><div class="deck-actions">' + actions + '</div>';
            el.deckList.appendChild(card);
        });
    }

    function showLibrary() {
        session = null;
        el.study.hidden = true;
        el.library.hidden = false;
        el.allButton.hidden = false;
        renderDecks();
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
            state.decks.push({ id: makeId(), name: name, cards: [], currentIndex: 0, createdAt: Date.now() });
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

    function flattenAllCards() {
        var result = [];
        state.decks.forEach(function (deck) {
            deck.cards.forEach(function (card, index) {
                result.push({ deckId: deck.id, deckName: deck.name, card: card, cardIndex: index });
            });
        });
        return result;
    }
    function currentCard() {
        if (!session) return null;
        if (session.mode === "deck") {
            var deck = findDeck(session.deckId);
            if (!deck || !deck.cards.length) return null;
            deck.currentIndex %= deck.cards.length;
            return { deckId: deck.id, deckName: deck.name, card: deck.cards[deck.currentIndex],
                cardIndex: deck.currentIndex, deckCount: deck.cards.length,
                globalIndex: deck.currentIndex, globalCount: deck.cards.length };
        }
        var all = flattenAllCards();
        if (!all.length) return null;
        state.allPosition %= all.length;
        var item = all[state.allPosition];
        var owner = findDeck(item.deckId);
        return { deckId: item.deckId, deckName: item.deckName, card: item.card,
            cardIndex: item.cardIndex, deckCount: owner ? owner.cards.length : 0,
            globalIndex: state.allPosition, globalCount: all.length };
    }
    function estimateLines(element) {
        var text = element.textContent || "";
        var explicit = element.querySelectorAll("br").length + 1;
        var availableChars = Math.max(11, Math.floor((window.innerWidth - 92) / 15));
        return Math.max(1, Math.min(10, Math.max(explicit, Math.ceil(text.length / availableChars))));
    }
    function fitText(element) {
        element.style.fontSize = "";
        var size = Math.min(39, Math.max(28, window.innerWidth * 0.085));
        var minimum = 16;
        element.style.fontSize = size + "px";
        var parent = element.parentElement;
        var guard = 0;
        while (guard < 24 && size > minimum && parent &&
            (element.scrollHeight > parent.clientHeight - 18 || element.scrollWidth > parent.clientWidth - 18)) {
            size -= 1;
            element.style.fontSize = size + "px";
            guard += 1;
        }
    }
    function renderStudy(animate) {
        var item = currentCard();
        if (!item) { showLibrary(); showToast("This deck has no cards."); return; }
        el.studyMode.textContent = session.mode === "all" ? "ALL DECKS" : "STUDYING DECK";
        el.studyTitle.textContent = item.deckName;
        el.studyCount.textContent = session.mode === "all"
            ? (item.globalIndex + 1) + " / " + item.globalCount
            : (item.cardIndex + 1) + " / " + item.deckCount;
        el.front.innerHTML = window.CardLoopCore.sanitizeHtml(item.card.front);
        el.back.innerHTML = window.CardLoopCore.sanitizeHtml(item.card.back);
        el.flashcard.style.setProperty("--front-weight", String(estimateLines(el.front)));
        el.flashcard.style.setProperty("--back-weight", String(estimateLines(el.back)));
        el.progress.style.width = (((item.globalIndex + 1) / item.globalCount) * 100) + "%";
        window.requestAnimationFrame(function () { fitText(el.front); fitText(el.back); });
        if (animate) {
            el.flashcard.classList.remove("is-changing");
            void el.flashcard.offsetWidth;
            el.flashcard.classList.add("is-changing");
        }
    }
    function showStudy() {
        el.library.hidden = true;
        el.study.hidden = false;
        el.allButton.hidden = true;
        renderStudy(false);
    }
    function startDeck(deckId) {
        var deck = findDeck(deckId);
        if (!deck || !deck.cards.length) { showToast("Add a TXT file to this deck first."); return; }
        session = { mode: "deck", deckId: deck.id };
        showStudy();
    }
    function startAllDecks() {
        var all = flattenAllCards();
        if (!all.length) { showToast("Add cards to a deck first."); return; }
        state.allPosition %= all.length;
        session = { mode: "all" };
        saveState();
        showStudy();
    }
    function nextCard() {
        if (advanceLocked || !session) return;
        advanceLocked = true;
        window.setTimeout(function () { advanceLocked = false; }, 180);
        if (session.mode === "deck") {
            var deck = findDeck(session.deckId);
            if (!deck || !deck.cards.length) { showLibrary(); return; }
            deck.currentIndex = (deck.currentIndex + 1) % deck.cards.length;
        } else {
            var all = flattenAllCards();
            if (!all.length) { showLibrary(); return; }
            var active = all[state.allPosition % all.length];
            var owner = findDeck(active.deckId);
            if (owner && owner.cards.length) owner.currentIndex = (active.cardIndex + 1) % owner.cards.length;
            state.allPosition = (state.allPosition + 1) % all.length;
        }
        saveState();
        renderStudy(true);
    }
    function handleBack() {
        if (!el.study.hidden) { showLibrary(); return true; }
        return false;
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
    });
    el.addDeck.addEventListener("click", function () { openDeckDialog(null); });
    el.allButton.addEventListener("click", startAllDecks);
    el.deckForm.addEventListener("submit", function (event) { event.preventDefault(); saveDeckName(); });
    el.deckCancel.addEventListener("click", function () { el.deckDialog.close(); });
    el.deleteCancel.addEventListener("click", function () { el.deleteDialog.close(); });
    el.deleteConfirm.addEventListener("click", deleteDeck);
    el.flashcard.addEventListener("click", nextCard);
    el.flashcard.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); nextCard(); }
    });
    el.backButton.addEventListener("click", showLibrary);
    el.exitButton.addEventListener("click", showLibrary);
    el.filePicker.addEventListener("change", function () {
        var file = el.filePicker.files && el.filePicker.files[0];
        if (!file) { pendingFileDeckId = ""; return; }
        if (file.size > 5 * 1024 * 1024) { pendingFileDeckId = ""; showToast("TXT files must be 5 MB or smaller."); return; }
        var reader = new FileReader();
        reader.onload = function () { importText(String(reader.result || "")); };
        reader.onerror = function () { pendingFileDeckId = ""; showToast("Could not read that TXT file."); };
        reader.readAsText(file, "UTF-8");
    });
    window.addEventListener("resize", function () {
        if (!el.study.hidden) window.requestAnimationFrame(function () { fitText(el.front); fitText(el.back); });
    });

    window.CardLoopApp = { handleBack: handleBack };
    renderDecks();
}());
