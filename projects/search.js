// Five searches over one maze, run in lockstep: one cell expanded per algorithm per tick.
(function () {
  const COLS = 31, ROWS = 19, ROUGH = 5;
  const start = [1, 1], goal = [COLS - 2, ROWS - 2];
  const key = (x, y) => y * COLS + x;
  let grid; // 0 open, 1 wall, 2 rough ground (cost ROUGH)

  // Seeded RNG so "New maze" is varied but every maze is reproducible from its seed.
  let seed = (Date.now() % 100000) + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function makeMaze() {
    grid = new Uint8Array(COLS * ROWS).fill(1);
    // Randomized depth-first carving gives a perfect maze (exactly one route)...
    const stack = [start];
    grid[key(...start)] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const nb = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [x + dx, y + dy, x + dx / 2, y + dy / 2])
        .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1 && grid[key(nx, ny)] === 1);
      if (!nb.length) { stack.pop(); continue; }
      const [nx, ny, wx, wy] = nb[Math.floor(rnd() * nb.length)];
      grid[key(wx, wy)] = 0; grid[key(nx, ny)] = 0;
      stack.push([nx, ny]);
    }
    // ...then knock out walls so there are many routes and the choice matters.
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (grid[key(x, y)] === 1 && rnd() < 0.22) {
        const h = grid[key(x - 1, y)] !== 1 && grid[key(x + 1, y)] !== 1;
        const v = grid[key(x, y - 1)] !== 1 && grid[key(x, y + 1)] !== 1;
        if (h !== v) grid[key(x, y)] = 0;
      }
    }
    // Patches of rough ground: passable, but each step costs more.
    for (let b = 0; b < 9; b++) {
      const cx = 3 + Math.floor(rnd() * (COLS - 6)), cy = 3 + Math.floor(rnd() * (ROWS - 6)), r = 2 + rnd() * 3;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        if (grid[key(x, y)] === 0 && (x - cx) ** 2 + (y - cy) ** 2 < r * r) grid[key(x, y)] = 2;
      }
    }
    grid[key(...start)] = 0; grid[key(...goal)] = 0;
  }

  const cost = (k) => (grid[k] === 2 ? ROUGH : 1);
  const h = (x, y) => Math.abs(x - goal[0]) + Math.abs(y - goal[1]); // never overestimates: every step costs >= 1

  function neighbors(k) {
    const x = k % COLS, y = (k / COLS) | 0, out = [];
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && grid[key(nx, ny)] !== 1) out.push(key(nx, ny));
    }
    return out;
  }

  // Binary heap keyed on priority.
  class Heap {
    constructor() { this.a = []; }
    push(p, v) { const a = this.a; a.push([p, v]); let i = a.length - 1; while (i) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } } return top; }
    get size() { return this.a.length; }
  }

  // Each search is a generator that yields after expanding one cell.
  function* search(kind) {
    const s = key(...start), g = key(...goal);
    const prev = new Map([[s, -1]]), dist = new Map([[s, 0]]), done = new Set();
    const st = { done, frontier: new Set([s]), path: null, expanded: 0 };
    let tie = 0;
    const pri = (k, d) => {
      const x = k % COLS, y = (k / COLS) | 0;
      if (kind === "dijkstra") return d;
      if (kind === "astar") return d + h(x, y);
      if (kind === "greedy") return h(x, y);
      return 0;
    };
    const q = [], heap = new Heap();
    if (kind === "bfs" || kind === "dfs") q.push(s); else heap.push(pri(s, 0), s);
    while (kind === "bfs" || kind === "dfs" ? q.length : heap.size) {
      let k;
      if (kind === "bfs") k = q.shift();
      else if (kind === "dfs") k = q.pop();
      else { k = heap.pop()[1]; if (done.has(k)) continue; }
      if (done.has(k)) continue;
      done.add(k); st.frontier.delete(k); st.expanded++;
      if (k === g) break;
      for (const n of neighbors(k)) {
        const nd = dist.get(k) + cost(n);
        if (kind === "bfs" || kind === "dfs") {
          if (done.has(n) || (kind === "bfs" && prev.has(n))) continue;
          prev.set(n, k); dist.set(n, nd); q.push(n); st.frontier.add(n);
        } else if (!done.has(n) && (!dist.has(n) || nd < dist.get(n))) {
          dist.set(n, nd); prev.set(n, k); heap.push(pri(n, nd) + (tie++ * 1e-9), n); st.frontier.add(n);
        }
      }
      yield st;
    }
    if (prev.has(g)) {
      const path = []; let k = g, c = 0;
      while (k !== -1) { path.push(k); if (k !== s) c += cost(k); k = prev.get(k); }
      st.path = path; st.cost = c;
    }
    yield st;
    return st;
  }

  const ALGOS = [
    ["bfs", "Breadth-first", "Knows nothing. Floods outward one step at a time and ignores the cost of rough ground."],
    ["dfs", "Depth-first", "Commits to a direction and backs up only when stuck. Fast or awful, depending on luck."],
    ["dijkstra", "Dijkstra", "Knows what each step costs, nothing about where the goal is. Always finds the cheapest route, eventually."],
    ["greedy", "Greedy best-first", "Knows where the goal is and nothing about cost. Heads straight for it and accepts whatever route it stumbles into."],
    ["astar", "A*", "Knows both, and is disciplined about the guess: the distance estimate never exceeds the true cost. Cheapest route, far less work."],
  ];

  const lanes = document.getElementById("race");
  lanes.innerHTML = ALGOS.map(([k, name, desc]) => `
    <div>
      <div class="lane-title">${name}</div>
      <div class="lane-stat" id="stat-${k}">&nbsp;</div>
      <canvas id="cv-${k}" width="${COLS * 12}" height="${ROWS * 12}" title="${desc}"></canvas>
    </div>`).join("");

  let runs = {}, raf = null, best = null;

  function color(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function draw(kind, st) {
    const cv = document.getElementById("cv-" + kind), ctx = cv.getContext("2d"), c = 12;
    const C = { paper: color("--paper"), ink: color("--ink"), rough: color("--wash"), roughDot: color("--faint"),
      seen: color("--blue-soft"), front: color("--blue"), path: color("--accent") };
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = key(x, y), v = grid[k];
      if (v === 1) { ctx.fillStyle = C.ink; ctx.fillRect(x * c, y * c, c, c); continue; }
      if (v === 2) { ctx.fillStyle = C.rough; ctx.fillRect(x * c, y * c, c, c); ctx.fillStyle = C.roughDot; ctx.fillRect(x * c + 5, y * c + 5, 2, 2); }
      if (st && st.done.has(k)) { ctx.fillStyle = C.seen; ctx.fillRect(x * c, y * c, c, c); }
      else if (st && st.frontier.has(k)) { ctx.fillStyle = C.front; ctx.globalAlpha = 0.5; ctx.fillRect(x * c + 3, y * c + 3, c - 6, c - 6); ctx.globalAlpha = 1; }
    }
    if (st && st.path) {
      ctx.strokeStyle = C.path; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
      st.path.forEach((k, i) => { const x = (k % COLS) * c + c / 2, y = ((k / COLS) | 0) * c + c / 2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    for (const [[x, y], col] of [[start, C.front], [goal, C.path]]) { ctx.fillStyle = col; ctx.fillRect(x * c, y * c, c, c); }
  }

  function stat(kind, st, finished) {
    const el = document.getElementById("stat-" + kind);
    if (!st) { el.innerHTML = "&nbsp;"; return; }
    let s = `${st.expanded.toLocaleString()} cells searched`;
    if (finished && st.path) s += `<br>route cost ${st.cost}${best != null ? (st.cost === best ? " · cheapest" : ` · ${Math.round(100 * (st.cost / best - 1))}% over`) : ""}`;
    el.innerHTML = s;
  }

  function cheapest() {
    const it = search("dijkstra"); let r; for (r of it); return r && r.path ? r.cost : null;
  }

  function reset() {
    cancelAnimationFrame(raf); raf = null; runs = {};
    best = cheapest();
    ALGOS.forEach(([k]) => { draw(k, null); stat(k, null); });
    document.getElementById("run").textContent = "Run";
  }

  function run() {
    if (raf) { cancelAnimationFrame(raf); raf = null; document.getElementById("run").textContent = "Run"; return; }
    if (!Object.keys(runs).length || Object.values(runs).every((r) => r.finished)) {
      runs = Object.fromEntries(ALGOS.map(([k]) => [k, { it: search(k), st: null, finished: false }]));
    }
    document.getElementById("run").textContent = "Pause";
    const speed = () => +document.getElementById("speed").value;
    const tick = () => {
      let live = false;
      for (const [k, r] of Object.entries(runs)) {
        if (r.finished) continue;
        for (let i = 0; i < speed(); i++) {
          const n = r.it.next();
          if (n.done) { r.finished = true; break; }
          r.st = n.value;
          if (r.st.path) { r.finished = true; break; }
        }
        draw(k, r.st); stat(k, r.st, r.finished);
        live = live || !r.finished;
      }
      if (live) raf = requestAnimationFrame(tick);
      else { raf = null; document.getElementById("run").textContent = "Run again"; summarize(); }
    };
    raf = requestAnimationFrame(tick);
  }

  function summarize() {
    const a = runs.astar.st, d = runs.dijkstra.st, b = runs.bfs.st, g = runs.greedy.st;
    if (!a || !d) return;
    const over = (st) => Math.round(100 * (st.cost / best - 1));
    const saved = Math.round(100 * (1 - a.expanded / d.expanded));
    document.getElementById("summary").innerHTML =
      `On this maze A* searched ${a.expanded.toLocaleString()} cells to find the cheapest route, ${saved}% fewer than Dijkstra's ${d.expanded.toLocaleString()}. ` +
      (over(g) > 0 ? `Greedy search looked at only ${g.expanded.toLocaleString()} and settled for a route ${over(g)}% more expensive. `
                   : `Greedy search looked at only ${g.expanded.toLocaleString()} and got lucky: its route was also the cheapest. `) +
      (over(b) > 0 ? `Breadth-first found the route with the fewest steps, which cost ${over(b)}% more because it can't see rough ground.`
                   : `Breadth-first's fewest-steps route happened to avoid rough ground, so it was also the cheapest. Try a new maze.`);
  }

  // Click any panel to toggle a wall; the maze is shared.
  ALGOS.forEach(([k]) => document.getElementById("cv-" + k).addEventListener("click", (ev) => {
    const cv = ev.currentTarget, r = cv.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / r.width * COLS), y = Math.floor((ev.clientY - r.top) / r.height * ROWS);
    if (x <= 0 || y <= 0 || x >= COLS - 1 || y >= ROWS - 1) return;
    if ((x === start[0] && y === start[1]) || (x === goal[0] && y === goal[1])) return;
    grid[key(x, y)] = grid[key(x, y)] === 1 ? 0 : 1;
    reset();
  }));

  document.getElementById("run").addEventListener("click", run);
  document.getElementById("new").addEventListener("click", () => { makeMaze(); reset(); document.getElementById("summary").textContent = ""; });
  new MutationObserver(() => ALGOS.forEach(([k]) => draw(k, runs[k] && runs[k].st))).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  makeMaze(); reset();
  // A link ending in #run starts the race at full speed.
  if (location.hash === "#run") { document.getElementById("speed").value = 12; run(); }
})();
