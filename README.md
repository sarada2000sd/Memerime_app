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
- Native Android home-screen widget with launcher pin prompt, tap-to-next-card, and resize-aware card layout.
- The widget shows only the CardLoop name until a deck or All Decks session is selected.
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

## Home-screen widget

On the first launch, CardLoop offers the Android launcher pin flow. The same action is available from the app's library screen. After selecting Use now on a deck or All Decks, the home widget displays that session's current card. Tap it to advance. Widget mode and card positions are stored in app-private SharedPreferences and survive normal app restarts and device reboots. The app has no foreground service, periodic widget refresh, alarm or background worker; a one-shot BOOT_COMPLETED receiver redraws existing widgets after a device reboot. the widget updates on user actions and Android widget lifecycle events. It can be resized horizontally and vertically by the launcher.
