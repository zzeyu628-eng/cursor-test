(() => {
  'use strict';

  const SIZE = 4;
  const WIN_VALUE = 2048;
  const MOVE_MS = 110;
  const SWIPE_THRESHOLD = 24;
  const BEST_KEY = '2048.best';

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const cellsEl = document.getElementById('cells');
  const tilesEl = document.getElementById('tiles');
  const boardEl = document.getElementById('board');
  const overlayEl = document.getElementById('overlay');
  const overlayTitleEl = document.getElementById('overlay-title');
  const overlayTextEl = document.getElementById('overlay-text');
  const keepPlayingBtn = document.getElementById('keep-playing');
  const overlayRestartBtn = document.getElementById('overlay-restart');
  const newGameBtn = document.getElementById('new-game');
  const statusEl = document.getElementById('status');

  let grid = [];
  let tiles = new Map();
  let nextId = 1;
  let score = 0;
  let best = readBest();
  let busy = false;
  let won = false;
  let keepPlaying = false;
  let gameOver = false;

  let tileSize = 0;
  let gapPx = 0;

  function readBest() {
    try {
      const parsed = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch (err) {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch (err) {
      /* storage unavailable (private mode, blocked cookies) */
    }
  }

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function forEachCell(fn) {
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        fn(r, c);
      }
    }
  }

  function buildCells() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      fragment.appendChild(cell);
    }
    cellsEl.textContent = '';
    cellsEl.appendChild(fragment);
  }

  function randomEmptyCell() {
    const empties = [];
    forEachCell((r, c) => {
      if (!grid[r][c]) empties.push({ r, c });
    });
    if (empties.length === 0) return null;
    return empties[Math.floor(Math.random() * empties.length)];
  }

  function offsetFor(index) {
    return index * (tileSize + gapPx);
  }

  function positionTile(tile) {
    const transform = `translate(${offsetFor(tile.c)}px, ${offsetFor(tile.r)}px)`;
    tile.el.style.setProperty('--tile-transform', transform);
    tile.el.style.transform = transform;
  }

  function addTile(r, c, value, isNew) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.value = String(value);
    el.textContent = String(value);
    if (value >= 4096) el.classList.add('tile-super');
    if (isNew) el.classList.add('tile-new');

    const tile = { id: nextId, value, r, c, el };
    nextId += 1;
    tiles.set(tile.id, tile);
    grid[r][c] = tile;
    tilesEl.appendChild(el);
    positionTile(tile);

    if (isNew) {
      el.addEventListener('animationend', () => el.classList.remove('tile-new'), { once: true });
    }
    return tile;
  }

  function addRandomTile() {
    const cell = randomEmptyCell();
    if (!cell) return null;
    return addTile(cell.r, cell.c, Math.random() < 0.9 ? 2 : 4, true);
  }

  function measure() {
    const width = tilesEl.clientWidth;
    if (!width) return;
    gapPx = width * 0.022;
    tileSize = (width - gapPx * (SIZE - 1)) / SIZE;
    tilesEl.style.setProperty('--tile-size', `${tileSize}px`);
    tilesEl.style.setProperty('--tile-font', `${(tileSize * 0.42).toFixed(1)}px`);
    tiles.forEach(positionTile);
  }

  function updateScores() {
    scoreEl.textContent = String(score);
    if (score > best) {
      best = score;
      writeBest(best);
    }
    bestEl.textContent = String(best);
  }

  function announce(message) {
    statusEl.textContent = message;
  }

  function clearBoard() {
    tilesEl.textContent = '';
    tiles.clear();
    grid = emptyGrid();
  }

  let moveToken = 0;

  function newGame() {
    // Invalidate any move animation still in flight so its callback cannot
    // touch the fresh board.
    moveToken += 1;
    clearBoard();
    score = 0;
    won = false;
    keepPlaying = false;
    gameOver = false;
    busy = false;
    hideOverlay();
    updateScores();
    measure();
    addRandomTile();
    addRandomTile();
    announce('New game started. Swipe to play.');
  }

  function lineFor(direction, index) {
    const cells = [];
    for (let i = 0; i < SIZE; i += 1) {
      if (direction === 'left' || direction === 'right') {
        const c = direction === 'left' ? i : SIZE - 1 - i;
        cells.push({ r: index, c });
      } else {
        const r = direction === 'up' ? i : SIZE - 1 - i;
        cells.push({ r, c: index });
      }
    }
    return cells;
  }

  function canMove() {
    let open = false;
    forEachCell((r, c) => {
      if (!grid[r][c]) open = true;
    });
    if (open) return true;

    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const value = grid[r][c].value;
        if (c + 1 < SIZE && grid[r][c + 1].value === value) return true;
        if (r + 1 < SIZE && grid[r + 1][c].value === value) return true;
      }
    }
    return false;
  }

  // Work out where every tile ends up before touching any state, so a move
  // that changes nothing can be discarded without side effects.
  function planMove(direction) {
    const placements = [];
    const merges = [];
    const consumed = [];
    let gained = 0;
    let moved = false;

    for (let index = 0; index < SIZE; index += 1) {
      const cells = lineFor(direction, index);
      const present = cells.map(({ r, c }) => grid[r][c]).filter(Boolean);
      let slot = 0;
      let i = 0;

      while (i < present.length) {
        const tile = present[i];
        const partner = present[i + 1];
        const target = cells[slot];

        if (partner && partner.value === tile.value) {
          const value = tile.value * 2;
          gained += value;
          merges.push({ tile, value });
          consumed.push({ tile: partner, target });
          placements.push({ tile, target });
          // A merge always pulls the partner across at least one cell, even
          // when the surviving tile is already against the wall.
          moved = true;
          i += 2;
        } else {
          placements.push({ tile, target });
          i += 1;
        }

        if (tile.r !== target.r || tile.c !== target.c) moved = true;
        slot += 1;
      }
    }

    return { placements, merges, consumed, gained, moved };
  }

  function move(direction) {
    if (busy || gameOver || !overlayEl.hidden) return;

    const plan = planMove(direction);
    if (!plan.moved) return;

    const nextGrid = emptyGrid();
    plan.placements.forEach(({ tile, target }) => {
      tile.r = target.r;
      tile.c = target.c;
      nextGrid[target.r][target.c] = tile;
    });

    grid = nextGrid;
    busy = true;
    score += plan.gained;
    updateScores();
    tiles.forEach(positionTile);

    // The consumed tile slides under the survivor for the merge animation,
    // then is removed once the transition finishes.
    const removed = plan.consumed.map(({ tile, target }) => {
      tile.r = target.r;
      tile.c = target.c;
      tile.el.style.transform = `translate(${offsetFor(tile.c)}px, ${offsetFor(tile.r)}px)`;
      return tile;
    });

    const token = moveToken;

    window.setTimeout(() => {
      // A New Game happened while this move was animating; drop the callback.
      if (token !== moveToken) return;

      removed.forEach((tile) => {
        tiles.delete(tile.id);
        tile.el.remove();
      });

      plan.merges.forEach(({ tile, value }) => {
        tile.value = value;
        tile.el.textContent = String(value);
        tile.el.dataset.value = String(value);
        tile.el.classList.toggle('tile-super', value >= 4096);
        tile.el.classList.remove('tile-merged');
        void tile.el.offsetWidth;
        tile.el.classList.add('tile-merged');
        tile.el.addEventListener('animationend', () => tile.el.classList.remove('tile-merged'), { once: true });
      });

      addRandomTile();
      busy = false;

      if (!won && !keepPlaying && Array.from(tiles.values()).some((tile) => tile.value >= WIN_VALUE)) {
        won = true;
        showOverlay('win');
        announce(`You reached ${WIN_VALUE}. You win!`);
        return;
      }

      if (!canMove()) {
        gameOver = true;
        showOverlay('gameover');
        announce(`Game over. Final score ${score}.`);
      } else if (plan.gained > 0) {
        announce(`Score ${score}. Gained ${plan.gained} points.`);
      }
    }, MOVE_MS);
  }

  function showOverlay(kind) {
    if (kind === 'win') {
      overlayTitleEl.textContent = 'You win!';
      overlayTextEl.textContent = `You made ${WIN_VALUE}. Score: ${score}.`;
      keepPlayingBtn.hidden = false;
    } else {
      overlayTitleEl.textContent = 'Game over';
      overlayTextEl.textContent = `No moves left. Final score: ${score}.`;
      keepPlayingBtn.hidden = true;
    }
    overlayEl.hidden = false;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function keepPlayingNow() {
    keepPlaying = true;
    hideOverlay();
    if (!canMove()) {
      gameOver = true;
      showOverlay('gameover');
      announce(`Game over. Final score ${score}.`);
      return;
    }
    announce('Keep going. Swipe to play.');
  }

  function handleKey(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const map = {
      arrowup: 'up',
      arrowdown: 'down',
      arrowleft: 'left',
      arrowright: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
    };
    const direction = map[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  }

  let pointerStart = null;

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    // Capture is deliberately avoided: it would redirect the pointerup that
    // buttons inside the board overlay need in order to fire clicks.
  }

  function handlePointerUp(event) {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? 'right' : 'left');
    } else {
      move(dy > 0 ? 'down' : 'up');
    }
  }

  function handlePointerCancel() {
    pointerStart = null;
  }

  function bindEvents() {
    document.addEventListener('keydown', handleKey);
    // Swipes are tracked on the board itself; the overlay's buttons are
    // excluded so taps on "New Game" still produce normal clicks.
    boardEl.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      handlePointerDown(event);
    });
    boardEl.addEventListener('pointerup', handlePointerUp);
    boardEl.addEventListener('pointercancel', handlePointerCancel);
    boardEl.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
    newGameBtn.addEventListener('click', newGame);
    overlayRestartBtn.addEventListener('click', newGame);
    keepPlayingBtn.addEventListener('click', keepPlayingNow);

    if ('ResizeObserver' in window) {
      new ResizeObserver(measure).observe(tilesEl);
    } else {
      window.addEventListener('resize', measure);
    }
    window.addEventListener('orientationchange', measure);
  }

  buildCells();
  bindEvents();
  measure();
  newGame();
})();
