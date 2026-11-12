# CardLoop Android

A small, offline-first flashcard app. The interface is HTML, CSS and JavaScript packaged inside a native Android WebView.

## Features
- Create, rename and delete decks.
- Import one or more UTF-8 TXT files into each deck.
- Every non-empty TXT line is one card. The first semicolon separates front from back.
- Formatting tags such as b, strong, i, em, u, br, p, ul, li, code, sub and sup render in the card.
- Unsafe HTML tags and attributes are removed before rendering.
- Tap anywhere on the two-part card to advance. Front is above a horizontal divider; back is below.
- Each deck loops and resumes from its own saved position.
- All Decks mode loops through every card in deck creation order and remembers its own position.
- Decks and progress are stored locally. No login, tracking, analytics or network access.

## TXT format
Use UTF-8. Put one card on each non-empty physical line. The first semicolon is the separator. Use HTML br tags for line breaks inside a card.

Example line:
<b>The girl</b>; <b>das Mädchen</b><br><b>ඩාස් මෙඩ්ෂන්</b><br><b>Das Mädchen ist jung.</b><br><b>ගැහැණු ළමයා තරුණයි.</b>

## Android file access
The app opens Android's system document picker (ACTION_OPEN_DOCUMENT) for TXT import. The user explicitly selects a file. The app does not request broad storage permissions and does not scan the device.

## Build
The GitHub Actions workflow runs on pushes to main and can also be started manually. It runs parser tests, assembles debug and minified release APKs, and uploads both under the CardLoop-APKs artifact.

The release APK is signed with the standard Android debug key so it can be installed for sideload testing. For Play Store publishing, configure a private signing key in GitHub Actions secrets.

Decks and progress stay after normal restarts and app updates that preserve data. Uninstalling or clearing app data removes them.
