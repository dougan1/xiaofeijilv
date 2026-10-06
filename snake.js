/**
 * 日历贪吃蛇 V2
 * - 修复：MutationObserver 恢复 canvas 后更新 calendarEl + 重设尺寸，防止轨迹累积
 * - 新增：小蛇与日期格子互动效果（蛇头靠近时格子高亮）
 * - 蛇在日期格子的缝隙中行走
 */
(function () {
	'use strict';

	// ===== 配置 =====
	const CFG = {
		speed: 1.2,
		nodeSpacing: 11,
		initialLength: 3,
		maxFruits: 5,
		fruitRadius: 4.5,
		bodyRadius: 3.5,
		headRadius: 4.5,
		snakeColor: '#45b8a0',
		headColor: '#2f8a74',
		fruitColor: '#f0b878',
		canvasZ: 6
	};

	// ===== 设置读取 =====
	function loadAnimSettings() {
		try { return JSON.parse(localStorage.getItem('animSettings') || '{}'); }
		catch(e) { return {}; }
	}
	function snakeSpeed() { const s = loadAnimSettings(); return s.snake?.speed ?? CFG.speed; }
	function snakeMaxLen() { const s = loadAnimSettings(); return s.snake?.maxLength ?? 20; }
	function snakeColor() { const s = loadAnimSettings(); return s.snake?.color ?? CFG.snakeColor; }
	function snakeHeadColor() {
		const s = loadAnimSettings();
		return s.snake?.color || CFG.headColor;
	}

	// ===== 状态 =====
	let canvas, ctx;
	let calendarEl;
	let grid = null;
	let snake = null;
	let fruits = [];
	let running = false;
	let rafId = null;
	let resizeTimer = null;
	let lastHoveredCell = null;
	let lastHoverDir = null;  // 互动效果：上次的方向

	// ===== 工具函数 =====
	function dist(a, b) {
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function debounce(fn, ms) {
		return function () {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(fn, ms);
		};
	}

	// ===== 路径网格计算 =====
	function computeGrid() {
		calendarEl = document.querySelector('.schedule-calendar-box .calendar');
		if (!calendarEl) return null;

		const cells = calendarEl.querySelectorAll('.day.shift, .blank');
		if (cells.length < 7) return null;

		const containerRect = calendarEl.getBoundingClientRect();
		const cols = 7;
		const rows = Math.ceil(cells.length / cols);

		const cellGrid = [];
		for (let j = 0; j < rows; j++) {
			cellGrid[j] = [];
			for (let i = 0; i < cols; i++) {
				const idx = j * cols + i;
				if (idx < cells.length) {
					const r = cells[idx].getBoundingClientRect();
					cellGrid[j][i] = {
						left: r.left - containerRect.left,
						right: r.right - containerRect.left,
						top: r.top - containerRect.top,
						bottom: r.bottom - containerRect.top,
						el: cells[idx]
					};
				}
			}
		}

		const vLines = [];
		for (let i = 0; i < cols - 1; i++) {
			if (cellGrid[0] && cellGrid[0][i] && cellGrid[0][i + 1]) {
				vLines.push((cellGrid[0][i].right + cellGrid[0][i + 1].left) / 2);
			}
		}

		const hLines = [];
		for (let j = 0; j < rows - 1; j++) {
			if (cellGrid[j] && cellGrid[j][0] && cellGrid[j + 1] && cellGrid[j + 1][0]) {
				hLines.push((cellGrid[j][0].bottom + cellGrid[j + 1][0].top) / 2);
			}
		}

		if (vLines.length < 2 || hLines.length < 1) return null;

		const nodes = [];
		for (let j = 0; j < hLines.length; j++) {
			for (let i = 0; i < vLines.length; i++) {
				nodes.push({
					x: vLines[i],
					y: hLines[j],
					idx: nodes.length,
					vi: i,
					hi: j,
					neighbors: []
				});
			}
		}

		const nodeAt = (vi, hi) => nodes.find(n => n.vi === vi && n.hi === hi);
		for (const n of nodes) {
			const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
			for (const [dvi, dhi] of dirs) {
				const nb = nodeAt(n.vi + dvi, n.hi + dhi);
				if (nb) n.neighbors.push(nb);
			}
		}

		return { vLines, hLines, nodes, cols, rows, width: containerRect.width, height: containerRect.height, cellGrid };
	}

	function findNearestNode(x, y) {
		if (!grid) return null;
		let best = null, bestD = Infinity;
		for (const n of grid.nodes) {
			const d = Math.hypot(n.x - x, n.y - y);
			if (d < bestD) { bestD = d; best = n; }
		}
		return bestD < 30 ? best : null;
	}

	// ===== 蛇 =====
	function createSnake() {
		const startIdx = Math.floor(grid.nodes.length / 2);
		const start = grid.nodes[startIdx];

		snake = {
			x: start.x,
			y: start.y,
			dir: 'right',
			target: null,
			path: [{ x: start.x, y: start.y }],
			length: CFG.initialLength,
			alive: true,
			recent: []
		};

		const right = start.neighbors.find(n => n.x > start.x);
		snake.target = right || start.neighbors[0];
		if (snake.target) {
			snake.dir = getDir(start, snake.target);
		}
	}

	function getDir(from, to) {
		if (Math.abs(to.x - from.x) > Math.abs(to.y - from.y)) {
			return to.x > from.x ? 'right' : 'left';
		}
		return to.y > from.y ? 'down' : 'up';
	}

	function pointAtDistance(distance) {
		if (!snake || snake.path.length < 2) return { x: snake.x, y: snake.y };
		let acc = 0;
		for (let i = snake.path.length - 1; i > 0; i--) {
			const p1 = snake.path[i];
			const p2 = snake.path[i - 1];
			const seg = Math.hypot(p1.x - p2.x, p1.y - p2.y);
			if (acc + seg >= distance) {
				const t = seg > 0 ? (distance - acc) / seg : 0;
				return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
			}
			acc += seg;
		}
		return snake.path[0];
	}

	function getBodyPoints() {
		const pts = [];
		for (let i = 1; i < snake.length; i++) {
			pts.push(pointAtDistance(i * CFG.nodeSpacing));
		}
		return pts;
	}

	// ===== AI =====
	function isNodeOccupied(node, skipHead = false) {
		const body = getBodyPoints();
		const startIdx = skipHead ? 2 : 0;
		for (let i = startIdx; i < body.length; i++) {
			if (Math.hypot(body[i].x - node.x, body[i].y - node.y) < CFG.nodeSpacing * 0.8) {
				return true;
			}
		}
		return false;
	}

	function bfs(start, end) {
		if (!start || !end) return null;
		const visited = new Set([start.idx]);
		const queue = [{ node: start, path: [start] }];
		while (queue.length) {
			const { node, path } = queue.shift();
			if (node.idx === end.idx) return path;
			for (const nb of node.neighbors) {
				if (!visited.has(nb.idx) && !isNodeOccupied(nb, true)) {
					visited.add(nb.idx);
					queue.push({ node: nb, path: [...path, nb] });
				}
			}
		}
		return null;
	}

	function chooseTargetFruit() {
		if (!fruits.length) return null;
		const headNode = findNearestNode(snake.x, snake.y);
		if (!headNode) return fruits[0];

		let best = null, bestLen = Infinity;
		for (const f of fruits) {
			const fNode = findNearestNode(f.x, f.y);
			if (!fNode) continue;
			const path = bfs(headNode, fNode);
			if (path && path.length < bestLen) {
				bestLen = path.length;
				best = f;
			}
		}
		if (!best) { best = fruits[Math.floor(Math.random() * fruits.length)]; }
		return best;
	}

	function chooseNext() {
		const cur = findNearestNode(snake.x, snake.y);
		if (!cur || !cur.neighbors.length) { return; }

		const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

		let candidates = cur.neighbors.filter(nb => {
			return getDir(cur, nb) !== opposite[snake.dir];
		});
		if (!candidates.length) candidates = cur.neighbors;

		const safe = candidates.filter(nb => !isNodeOccupied(nb, true));
		let pool = safe.length ? safe : candidates;
		const withEscape = pool.filter(nb => nb.neighbors.filter(n => n.idx !== cur.idx && !isNodeOccupied(n, true)).length > 0);
		if (withEscape.length > 0) pool = withEscape;

		snake.recent.push(cur.idx);
		if (snake.recent.length > 6) snake.recent.shift();
		const fresh = pool.filter(nb => !snake.recent.includes(nb.idx));
		if (fresh.length > 0) pool = fresh;

		const target = chooseTargetFruit();
		let best = null;

		if (target && Math.random() > 0.3) {
			let bestD = Infinity;
			for (const nb of pool) {
				const d = Math.hypot(nb.x - target.x, nb.y - target.y);
				if (d < bestD) { bestD = d; best = nb; }
			}
		}
		if (!best) best = pool[Math.floor(Math.random() * pool.length)];

		snake.target = best;
		snake.dir = getDir(cur, best);
	}

	// ===== 移动 =====
	function moveSnake() {
		const spd = snakeSpeed();

		let dx = 0, dy = 0;
		switch (snake.dir) {
			case 'up': dy = -spd; break;
			case 'down': dy = spd; break;
			case 'left': dx = -spd; break;
			case 'right': dx = spd; break;
		}

		snake.x += dx;
		snake.y += dy;

		const last = snake.path[snake.path.length - 1];
		const moveDist = Math.hypot(snake.x - last.x, snake.y - last.y);
		if (moveDist > 0.3) {
			const maxStep = CFG.nodeSpacing * 0.4;
			const steps = Math.max(1, Math.ceil(moveDist / maxStep));
			for (let i = 1; i <= steps; i++) {
				const t = i / steps;
				snake.path.push({
					x: last.x + (snake.x - last.x) * t,
					y: last.y + (snake.y - last.y) * t
				});
			}
		}

		if (snake.target) {
			const d = Math.hypot(snake.x - snake.target.x, snake.y - snake.target.y);
			if (d < spd * 1.2) {
				const remaining = spd - d;
				snake.x = snake.target.x;
				snake.y = snake.target.y;
				snake.path.push({ x: snake.x, y: snake.y });
				chooseNext();
				if (snake.target && remaining > 0.1) {
					switch (snake.dir) {
						case 'up': snake.y -= remaining; break;
						case 'down': snake.y += remaining; break;
						case 'left': snake.x -= remaining; break;
						case 'right': snake.x += remaining; break;
					}
				}
			}
		}

		checkFruit();
		updateCellHover();  // 互动效果

		const maxPath = snake.length * CFG.nodeSpacing * 3 + 200;
		while (snake.path.length > maxPath) snake.path.shift();
	}

	// ===== 互动效果：蛇头靠近日期格子时高亮 =====
	function updateCellHover() {
		if (!grid || !snake || !grid.cellGrid) return;

		let nearestCell = null;
		let nearestDist = Infinity;

		for (const row of grid.cellGrid) {
			for (const cell of row) {
				if (!cell) continue;
				const cx = (cell.left + cell.right) / 2;
				const cy = (cell.top + cell.bottom) / 2;
				const d = Math.hypot(snake.x - cx, snake.y - cy);
				if (d < nearestDist) {
					nearestDist = d;
					nearestCell = cell;
				}
			}
		}

		// 蛇头在格子附近（距离格子中心 < 格子宽度的1.2倍）时高亮
		const threshold = nearestCell ? (nearestCell.right - nearestCell.left) * 1.2 : 30;

		if (nearestCell && nearestDist < threshold) {
			if (lastHoveredCell !== nearestCell.el) {
				if (lastHoveredCell) lastHoveredCell.classList.remove('snake-hover');
				nearestCell.el.classList.add('snake-hover');
				lastHoveredCell = nearestCell.el;
			}
		} else {
			if (lastHoveredCell) {
				lastHoveredCell.classList.remove('snake-hover');
				lastHoveredCell = null;
			}
		}
	}

	function clearCellHover() {
		if (lastHoveredCell) {
			lastHoveredCell.classList.remove('snake-hover');
			lastHoveredCell = null;
		}
	}

	// ===== 水果 =====
	function spawnFruit() {
		if (!grid || fruits.length >= CFG.maxFruits) return;
		const body = getBodyPoints();
		const available = grid.nodes.filter(n => {
			for (const b of body) {
				if (Math.hypot(n.x - b.x, n.y - b.y) < CFG.nodeSpacing * 0.7) return false;
			}
			for (const f of fruits) {
				if (Math.hypot(n.x - f.x, n.y - f.y) < CFG.nodeSpacing * 1.2) return false;
			}
			return true;
		});
		if (!available.length) return;
		const n = available[Math.floor(Math.random() * available.length)];
		fruits.push({ x: n.x, y: n.y });
	}

	function spawnFruits() {
		fruits = [];
		for (let i = 0; i < CFG.maxFruits; i++) spawnFruit();
	}

	function checkFruit() {
		for (let i = fruits.length - 1; i >= 0; i--) {
			if (Math.hypot(snake.x - fruits[i].x, snake.y - fruits[i].y) < CFG.nodeSpacing * 1.2) {
				fruits.splice(i, 1);
				if (snake.length < snakeMaxLen()) snake.length++;
				spawnFruit();
			}
		}
	}

	// ===== 渲染 =====
	function setupCanvas() {
		calendarEl = document.querySelector('.schedule-calendar-box .calendar');
		if (!calendarEl) return;

		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;z-index:${CFG.canvasZ};border-radius:inherit;`;
			ctx = canvas.getContext('2d');
		}

		// 确保 canvas 在 calendar 中
		if (canvas.parentElement !== calendarEl) {
			calendarEl.style.position = 'relative';
			calendarEl.appendChild(canvas);
		}

		const rect = calendarEl.getBoundingClientRect();
		if (rect.width < 10 || rect.height < 10) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		canvas.style.width = rect.width + 'px';
		canvas.style.height = rect.height + 'px';
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function render() {
		if (!ctx || !calendarEl) return;

		// 用 canvas 的 CSS 尺寸清除，确保完全清空（修复轨迹累积 bug）
		const w = parseFloat(canvas.style.width) || canvas.width;
		const h = parseFloat(canvas.style.height) || canvas.height;
		ctx.clearRect(0, 0, w, h);

		// 水果
		for (const f of fruits) {
			ctx.fillStyle = CFG.fruitColor;
			ctx.beginPath();
			ctx.arc(f.x, f.y, CFG.fruitRadius, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = 'rgba(255,255,255,.4)';
			ctx.beginPath();
			ctx.arc(f.x - 1.2, f.y - 1.2, 1.5, 0, Math.PI * 2);
			ctx.fill();
		}

		if (!snake) return;

		// 蛇身
		const body = getBodyPoints();
		for (let i = body.length - 1; i >= 0; i--) {
			const p = body[i];
			ctx.fillStyle = snakeColor();
			ctx.globalAlpha = 1;
			ctx.beginPath();
			ctx.arc(p.x, p.y, CFG.bodyRadius, 0, Math.PI * 2);
			ctx.fill();
		}

		// 蛇头
		ctx.globalAlpha = 1;
		ctx.fillStyle = snakeHeadColor();
		ctx.beginPath();
		ctx.arc(snake.x, snake.y, CFG.headRadius, 0, Math.PI * 2);
		ctx.fill();

		// 眼睛
		ctx.fillStyle = '#fff';
		const off = 2;
		let e1, e2;
		switch (snake.dir) {
			case 'up': e1 = { x: snake.x - 2, y: snake.y - off }; e2 = { x: snake.x + 2, y: snake.y - off }; break;
			case 'down': e1 = { x: snake.x - 2, y: snake.y + off }; e2 = { x: snake.x + 2, y: snake.y + off }; break;
			case 'left': e1 = { x: snake.x - off, y: snake.y - 2 }; e2 = { x: snake.x - off, y: snake.y + 2 }; break;
			case 'right': e1 = { x: snake.x + off, y: snake.y - 2 }; e2 = { x: snake.x + off, y: snake.y + 2 }; break;
		}
		ctx.beginPath();
		ctx.arc(e1.x, e1.y, 1.3, 0, Math.PI * 2);
		ctx.arc(e2.x, e2.y, 1.3, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#1a3a35';
		ctx.beginPath();
		ctx.arc(e1.x, e1.y, 0.6, 0, Math.PI * 2);
		ctx.arc(e2.x, e2.y, 0.6, 0, Math.PI * 2);
		ctx.fill();

		ctx.globalAlpha = 1;
	}

	// ===== 游戏循环 =====
	function loop() {
		if (!running) return;
		if (snake) moveSnake();
		render();
		rafId = requestAnimationFrame(loop);
	}

	function start() {
		if (running) return;
		running = true;
		loop();
	}

	function stop() {
		running = false;
		if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
		clearCellHover();
	}

	// ===== 初始化 & 事件 =====
	function init() {
		setTimeout(() => {
			setupCanvas();
			grid = computeGrid();
			if (grid && grid.nodes.length >= 4) {
				createSnake();
				spawnFruits();
				start();
			}
		}, 600);

		// tab 切换
		document.addEventListener('click', (e) => {
			const btn = e.target.closest('[data-tab]');
			if (!btn) return;
			if (btn.dataset.tab === '排班') {
				setTimeout(() => {
					setupCanvas();
					if (!grid) grid = computeGrid();
					if (grid) {
						if (!snake) createSnake();
						if (!fruits.length) spawnFruits();
						start();
					}
				}, 150);
			} else {
				stop();
			}
		});

		// 周期切换
		document.addEventListener('click', (e) => {
			if (e.target.closest('[data-cycle]')) {
				setTimeout(() => {
					grid = computeGrid();
					setupCanvas();
					if (grid && snake) {
						const n = findNearestNode(snake.x, snake.y);
						if (n) { snake.x = n.x; snake.y = n.y; snake.path = [{ x: n.x, y: n.y }]; }
					}
				}, 100);
			}
		});

		// 窗口 resize
		window.addEventListener('resize', debounce(() => {
			if (!running) return;
			setupCanvas();
			grid = computeGrid();
		}, 300));

		// 监听页面重新渲染：canvas 被移除时自动挂回 + 更新尺寸（修复轨迹累积 bug）
		const appEl = document.getElementById('app');
		if (appEl) {
			let snakeObsTimer = null;
			const obs = new MutationObserver(() => {
				if (snakeObsTimer) clearTimeout(snakeObsTimer);
				snakeObsTimer = setTimeout(() => {
					const cal = document.querySelector('.schedule-calendar-box .calendar');
					if (cal && canvas) {
						calendarEl = cal;
						if (canvas.parentElement !== cal) {
							cal.style.position = 'relative';
							cal.appendChild(canvas);
						}
						const rect = cal.getBoundingClientRect();
						if (rect.width > 10 && rect.height > 10) {
							const dpr = window.devicePixelRatio || 1;
							canvas.width = rect.width * dpr;
							canvas.height = rect.height * dpr;
							canvas.style.width = rect.width + 'px';
							canvas.style.height = rect.height + 'px';
							if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
						}
						// 重新计算网格（修复互动效果不触发：旧 grid 的 DOM 引用已失效）
						grid = computeGrid();
					}
				}, 80);
			});
			obs.observe(appEl, { childList: true, subtree: true });
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
