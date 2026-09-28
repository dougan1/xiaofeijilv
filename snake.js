/* 排班日历小蛇 - 只走格子缝隙 */
(function () {
  const STYLE_ID = 'snake-layer-style';
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #snakeLayer{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden;border-radius:12px}
      #snakeCanvas{width:100%;height:100%;display:block;pointer-events:none}
      .snakeRipple{position:absolute;pointer-events:none;border:1.5px solid rgba(120,140,255,.5);border-radius:10px;animation:snakeRipple .7s ease-out forwards}
      @keyframes snakeRipple{0%{transform:scale(.9);opacity:.5}100%{transform:scale(1.08);opacity:0}}
    `;
    document.head.appendChild(st);
  }

  const SPACING = 4;
  const INIT_LEN = 5;

  let layer, canvas, ctx, W = 0, H = 0, dpr = window.devicePixelRatio || 1;
  let headX = 0, headY = 0, angle = 0;
  let trail = [];
  let fruits = [];
  let shake = 0, lastKey = '', fruitTimer = 0;
  let started = false;
  let cells = [];
  let stuckFrames = 0, lastHeadX = 0, lastHeadY = 0;
  // 缝隙线
  let vLines = []; // 垂直缝隙 x 坐标数组
  let hLines = []; // 水平缝隙 y 坐标数组
  let curVX = 0, curHY = 0; // 当前所在缝隙线索引

  function cfg() {
    return {
      speed: parseFloat(localStorage.getItem('h5_snake_speed')) || 0.5,
      size: parseFloat(localStorage.getItem('h5_snake_size')) || 2,
      maxLen: parseInt(localStorage.getItem('h5_snake_len')) || 40
    };
  }
  function getCard() {
    const g = document.getElementById('shiftDaysGrid');
    return g ? g.parentElement : null;
  }
  function collectCells() {
    const g = document.getElementById('shiftDaysGrid');
    if (!g) return;
    const card = getCard(), cr = card.getBoundingClientRect();
    cells = Array.from(g.children).map(el => {
      const r = el.getBoundingClientRect();
      return { el, x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height, hidden: el.style.visibility === 'hidden' };
    }).filter(c => !c.hidden && c.w > 20 && c.h > 20);
    // 计算缝隙线
    // 垂直缝隙：每列的左边界 + 最后一列的右边界
    const xs = new Set();
    const ys = new Set();
    for (const c of cells) {
      xs.add(Math.round(c.x));
      xs.add(Math.round(c.x + c.w));
      ys.add(Math.round(c.y));
      ys.add(Math.round(c.y + c.h));
    }
    vLines = Array.from(xs).sort((a, b) => a - b);
    hLines = Array.from(ys).sort((a, b) => a - b);
  }
  function resize() {
    if (!layer) return;
    const r = layer.getBoundingClientRect();
    if (r.width === 0) return;
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    collectCells();
  }
  function spawnFruit() {
    if (fruits.length >= 3 || vLines.length < 2 || hLines.length < 2) return;
    // 水果放在缝隙交点上
    const vx = vLines[Math.floor(Math.random() * vLines.length)];
    const hy = hLines[Math.floor(Math.random() * hLines.length)];
    fruits.push({ x: vx, y: hy, r: 4 });
  }
  function nearestLine(arr, v) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - v);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function rebuildTrail() {
    trail = [];
    for (let i = 0; i < INIT_LEN; i++) {
      trail.push({ x: headX - Math.cos(angle) * i * SPACING, y: headY - Math.sin(angle) * i * SPACING });
    }
    curVX = nearestLine(vLines, headX);
    curHY = nearestLine(hLines, headY);
  }
  function start() {
    if (started) return;
    const card = getCard();
    if (!card) return;
    const cr = card.getBoundingClientRect();
    if (cr.width === 0) return;
    started = true;
    card.style.position = 'relative';
    layer = document.createElement('div'); layer.id = 'snakeLayer';
    canvas = document.createElement('canvas'); canvas.id = 'snakeCanvas';
    layer.appendChild(canvas); card.appendChild(layer);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    if (cells.length && vLines.length && hLines.length) {
      // 起点放在某个缝隙交点
      curVX = Math.floor(Math.random() * vLines.length);
      curHY = Math.floor(Math.random() * hLines.length);
      headX = vLines[curVX];
      headY = hLines[curHY];
    }
    angle = Math.random() * Math.PI * 2;
    rebuildTrail();
    spawnFruit();
    loop();
  }

  function nearestFruit() {
    let best = null, bd = 1e9;
    for (const f of fruits) {
      const dx = f.x - headX, dy = f.y - headY;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = f; }
    }
    return { f: best, d: Math.sqrt(bd) };
  }

  function move() {
    const { speed } = cfg();
    const { f, d } = nearestFruit();

    // 目标方向：有苹果就追，但太近/太挤时不追
    let targetAngle;
    if (f && d < 180) {
      // 先看追苹果的方向是否开阔
      const chaseAngle = Math.atan2(f.y - headY, f.x - headX);
      const cx = headX + Math.cos(chaseAngle) * 15;
      const cy = headY + Math.sin(chaseAngle) * 15;
      let open = true;
      for (let i = 5; i < trail.length; i++) {
        const dx = trail[i].x - cx, dy = trail[i].y - cy;
        if (dx * dx + dy * dy < 100) { open = false; break; }
      }
      targetAngle = open ? chaseAngle : angle + (Math.random() - 0.5) * 0.6;
    } else {
      targetAngle = angle + (Math.random() - 0.5) * 0.5;
    }

    // 平滑转向（最大每帧转30度，不原地掉头）
    let diff = targetAngle - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = 0.5; // 约28度/帧
    if (diff > maxTurn) diff = maxTurn;
    if (diff < -maxTurn) diff = -maxTurn;
    angle += diff;

    // 恒速前进，不因转弯减速
    let nx = headX + Math.cos(angle) * speed;
    let ny = headY + Math.sin(angle) * speed;

    // 自避障：下一步如果离身体太近，右转避开
    function tooClose(x, y) {
      for (let i = 5; i < trail.length; i++) {
        const dx = trail[i].x - x, dy = trail[i].y - y;
        if (dx * dx + dy * dy < (SPACING * 1.5) * (SPACING * 1.5)) return true;
      }
      return false;
    }
    if (tooClose(nx, ny)) {
      // 尝试多个角度，找一个不撞身体且在边界内的
      let found = false;
      for (let t = 0.2; t <= Math.PI; t += 0.2) {
        for (const sign of [1, -1]) {
          const a = angle + t * sign;
          const tx = headX + Math.cos(a) * speed;
          const ty = headY + Math.sin(a) * speed;
          if (!tooClose(tx, ty) && tx > 4 && tx < W - 4 && ty > 4 && ty < H - 4) {
            angle = a; nx = tx; ny = ty;
            found = true; break;
          }
        }
        if (found) break;
      }
    }

    // 约束：不能进入格子内部。如果进入了，沿最近的缝隙线滑动，不硬改方向
    for (const c of cells) {
      if (nx > c.x + 1 && nx < c.x + c.w - 1 && ny > c.y + 1 && ny < c.y + c.h - 1) {
        // 进入格子内部，推到最近的边
        const dl = Math.abs(nx - c.x);
        const dr = Math.abs(nx - c.x - c.w);
        const dt = Math.abs(ny - c.y);
        const db = Math.abs(ny - c.y - c.h);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) nx = c.x;
        else if (m === dr) nx = c.x + c.w;
        else if (m === dt) ny = c.y;
        else ny = c.y + c.h;
        // 沿边滑行，不重新算角度
      }
    }

    // 边界
    if (nx < 4 || nx > W - 4 || ny < 4 || ny > H - 4) {
      angle = Math.atan2(H / 2 - headY, W / 2 - headX);
      nx = headX + Math.cos(angle) * speed;
      ny = headY + Math.sin(angle) * speed;
    }

    headX = nx; headY = ny;

    // 卡死检测：连续10帧没动就强制掉头
    const moved = Math.hypot(headX - lastHeadX, headY - lastHeadY);
    if (moved < 0.5) {
      stuckFrames++;
      if (stuckFrames > 10) {
        angle += Math.PI / 2;
        stuckFrames = 0;
      }
    } else {
      stuckFrames = 0;
    }
    lastHeadX = headX; lastHeadY = headY;

    trail[0].x = headX; trail[0].y = headY;
    for (let i = 1; i < trail.length; i++) {
      const p = trail[i - 1], c = trail[i];
      const dx = c.x - p.x, dy = c.y - p.y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 0.001;
      if (dd > SPACING) {
        c.x = p.x + (dx / dd) * SPACING;
        c.y = p.y + (dy / dd) * SPACING;
      }
    }

    // 吃水果
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      const dx = f.x - headX, dy = f.y - headY;
      if (dx * dx + dy * dy < 64) {
        fruits.splice(i, 1); shake = 1;
        if (trail.length < cfg().maxLen) {
          const t = trail[trail.length - 1];
          trail.push({ x: t.x, y: t.y });
        }
      }
    }
    fruitTimer++;
    if (fruitTimer > 300) { fruitTimer = 0; spawnFruit(); }
    if (shake > 0) shake *= 0.85;
    if (shake < 0.02) shake = 0;
    checkRipple(headX, headY);
  }

  function checkRipple(x, y) {
    // 蛇在缝隙上，碰到格子边缘时触发涟漪
    for (const c of cells) {
      // 检查是否靠近格子边缘
      const near = (Math.abs(x - c.x) < 3 || Math.abs(x - c.x - c.w) < 3 || Math.abs(y - c.y) < 3 || Math.abs(y - c.y - c.h) < 3);
      if (near && x >= c.x - 3 && x <= c.x + c.w + 3 && y >= c.y - 3 && y <= c.y + c.h + 3) {
        const k = c.el.textContent;
        if (k === lastKey) return;
        lastKey = k;
        const rp = document.createElement('div');
        rp.className = 'snakeRipple';
        rp.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px`;
        layer.appendChild(rp);
        setTimeout(() => rp.remove(), 700);
        return;
      }
    }
  }
  function getColors() {
    const s = document.getElementById('todayShiftStatus')?.textContent || '';
    if (s.includes('已下班')) return { head: '#22b573', body: 'rgba(34,181,115,.55)' };
    return { head: '#f05d5e', body: 'rgba(240,93,94,.5)' };
  }
  function drawFruits() {
    for (const f of fruits) {
      ctx.beginPath(); ctx.fillStyle = '#ff6b6b';
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#22b573';
      ctx.beginPath(); ctx.ellipse(f.x + 2, f.y - 4, 2, 1.2, -0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (trail.length < 2) return;
    const c = getColors(), sz = cfg().size;
    const sx = (Math.random() - 0.5) * shake * 4, sy = (Math.random() - 0.5) * shake * 4;
    drawFruits();
    for (let i = trail.length - 1; i >= 1; i--) {
      ctx.beginPath();
      ctx.strokeStyle = c.body;
      ctx.lineWidth = 2.2 * sz;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(trail[i].x + sx, trail[i].y + sy);
      ctx.lineTo(trail[i - 1].x + sx, trail[i - 1].y + sy);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.fillStyle = c.head;
    ctx.arc(trail[0].x + sx, trail[0].y + sy, 1.1 * sz, 0, Math.PI * 2); ctx.fill();
  }
  function loop() { move(); draw(); requestAnimationFrame(loop); }
  function tryStart() {
    if (started) return;
    const card = getCard(); if (!card) return;
    const cr = card.getBoundingClientRect();
    if (cr.width === 0) { setTimeout(tryStart, 300); return; }
    start();
  }
  document.querySelectorAll('.tabbar button').forEach(b => {
    b.addEventListener('click', () => { collectCells(); setTimeout(tryStart, 200); });
  });
  setTimeout(tryStart, 500);
})();
