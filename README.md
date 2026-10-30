# 2048

A small, self-contained [2048](https://play2048.co/) game built for phones first:
swipe to move, big tiles, and a layout that fits a phone screen without scrolling.
Arrow keys (and W A S D) work too, so you can play on a desktop.

There is no build step and no dependencies — just three static files.

## Play on your phone

### Option 1: open the file directly

1. Copy `index.html`, `styles.css`, and `game.js` into a single folder on the device
   (or the folder itself, if you clone the repo).
2. Open `index.html` in your phone's browser.

Safari and Chrome will both load it from local storage/Downloads. If your phone
blocks local files, use Option 2.

### Option 2: serve the folder over your local network (recommended)

On the computer that has the files:

```bash
cd path/to/this/repo
python3 -m http.server 8000
```

Then find your computer's LAN IP (for example `ipconfig getifaddr en0` on macOS,
or `hostname -I` on Linux) and open this on your phone, on the same Wi-Fi:

```
http://192.168.1.50:8000
```

Replace `192.168.1.50` with your computer's address.

### Option 3: quickest possible check on your own machine

```bash
cd path/to/this/repo
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a desktop browser and use the arrow keys.

## How to play

- **Swipe** up, down, left, or right anywhere on the board. On a keyboard, use the
  arrow keys or `W` `A` `S` `D`.
- Tiles with the same number merge into one when they collide, and the merged value
  is added to your score.
- Reach **2048** to win. You can keep playing after winning.
- The game ends when the board is full and no merges are possible.
- **New Game** restarts at any time. Your **best score** is saved in the browser's
  `localStorage` and survives reloads.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup: header, score boxes, board, overlay, buttons |
| `styles.css` | Responsive layout, tile colors, animations |
| `game.js` | Game state, move/merge rules, swipe and keyboard input |

## Notes on the mobile behavior

- The board tracks pointer events, so a swipe works with a finger or a mouse drag.
- The page disables browser overscroll and board text selection so swipes never
  scroll the page or select text.
- On short screens the tagline and instructions step aside to keep the board large;
  in landscape the board moves left and the scores move to the side.
- Tap targets (buttons, tiles) are at least 44px, per common touch guidelines.
