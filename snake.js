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
  const MAX_FRUITS = 5;

  let layer, canvas, ctx;
  let W = 0, H = 0;
  let dpr = window.devicePixelRatio || 1;

  let headX = 0;
  let headY = 0;

  let trail = [];
  let fruits = [];
  let cells = [];

  let vLines = [];
  let hLines = [];

  let currentNode = null;
  let targetNode = null;
  let currentDir = null;

  let started = false;
  let fruitTimer = 0;
  let shake = 0;
  let lastKey = '';
  let waveTime = 0;

  let bodyGravity = [];

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

    const card = getCard();
    if (!card) return;

    const cr = card.getBoundingClientRect();

    cells = Array.from(g.children)
      .map(el => {
        const r = el.getBoundingClientRect();

        return {
          el,
          x: r.left - cr.left,
          y: r.top - cr.top,
          w: r.width,
          h: r.height,
          hidden: el.style.visibility === 'hidden'
        };
      })
      .filter(c => !c.hidden && c.w > 20 && c.h > 20);

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

    if (!r.width || !r.height) return;

    W = r.width;
    H = r.height;

    canvas.width = W * dpr;
    canvas.height = H * dpr;

    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    collectCells();

    const n = nearestNode(headX, headY);

    if (n) {
      headX = n.x;
      headY = n.y;
      currentNode = n;
    }

    if (!targetNode) {
      chooseNextNode();
    }
  }

  function isGap(x, y) {
    for (const c of cells) {
      if (
        x > c.x + 2 &&
        x < c.x + c.w - 2 &&
        y > c.y + 2 &&
        y < c.y + c.h - 2
      ) {
        return false;
      }
    }

    return true;
  }

  function validSegment(x1, y1, x2, y2) {
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(4, Math.ceil(distance / 2));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;

      if (!isGap(x, y)) {
        return false;
      }
    }

    return true;
  }

  function nearestNode(x, y) {
    let best = null;
    let bestD = Infinity;

    for (const vx of vLines) {
      for (const hy of hLines) {
        if (!isGap(vx, hy)) continue;

        const d = Math.hypot(vx - x, hy - y);

        if (d < bestD) {
          bestD = d;
          best = {
            x: vx,
            y: hy
          };
        }
      }
    }

    return best;
  }

  function nodeKey(n) {
    return n.x + ',' + n.y;
  }

  function getDir(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return {
        x: Math.sign(dx),
        y: 0
      };
    }

    return {
      x: 0,
      y: Math.sign(dy)
    };
  }

  function reverseDir(a, b) {
    if (!a || !b) return false;

    return (
      a.x === -b.x &&
      a.y === -b.y
    );
  }

  function bodyDanger(x, y, radius) {
    if (trail.length < 8) return false;

    const r2 = radius * radius;

    for (
      let i = 6;
      i < trail.length - 5;
      i += 2
    ) {
      const dx = trail[i].x - x;
      const dy = trail[i].y - y;

      if (dx * dx + dy * dy < r2) {
        return true;
      }
    }

    return false;
  }

  function segmentBodyDanger(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(3, Math.ceil(d / 4));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;

      if (bodyDanger(x, y, 12)) {
        return true;
      }
    }

    return false;
  }

  function getNeighbors(node) {
    const result = [];

    let left = null;
    let right = null;
    let up = null;
    let down = null;

    for (const x of vLines) {
      if (x < node.x) {
        if (left === null || x > left) {
          left = x;
        }
      }

      if (x > node.x) {
        if (right === null || x < right) {
          right = x;
        }
      }
    }

    for (const y of hLines) {
      if (y < node.y) {
        if (up === null || y > up) {
          up = y;
        }
      }

      if (y > node.y) {
        if (down === null || y < down) {
          down = y;
        }
      }
    }

    if (left !== null) {
      result.push({
        x: left,
        y: node.y
      });
    }

    if (right !== null) {
      result.push({
        x: right,
        y: node.y
      });
    }

    if (up !== null) {
      result.push({
        x: node.x,
        y: up
      });
    }

    if (down !== null) {
      result.push({
        x: node.x,
        y: down
      });
    }

    return result.filter(n => {
      return validSegment(
        node.x,
        node.y,
        n.x,
        n.y
      );
    });
  }

  function findPath(start, target) {
    if (!start || !target) return [];

    const open = [{
      node: start,
      g: 0,
      f: Math.hypot(
        target.x - start.x,
        target.y - start.y
      ),
      parent: null,
      dir: currentDir
    }];

    const closed = new Set();

    while (open.length) {
      open.sort((a, b) => a.f - b.f);

      const cur = open.shift();

      const key =
        nodeKey(cur.node) +
        '|' +
        (
          cur.dir
            ? cur.dir.x + ',' + cur.dir.y
            : 'none'
        );

      if (closed.has(key)) continue;

      closed.add(key);

      if (
        cur.node.x === target.x &&
        cur.node.y === target.y
      ) {
        const result = [];
        let p = cur;

        while (p) {
          result.unshift({
            x: p.node.x,
            y: p.node.y
          });

          p = p.parent;
        }

        return result;
      }

      const neighbors = getNeighbors(cur.node);

      for (const n of neighbors) {
        const dir = getDir(cur.node, n);

        if (
          cur.parent === null &&
          currentDir &&
          reverseDir(currentDir, dir)
        ) {
          continue;
        }

        const turn =
          cur.dir &&
          (
            cur.dir.x !== dir.x ||
            cur.dir.y !== dir.y
          )
            ? 15
            : 0;

        const g =
          cur.g +
          Math.hypot(
            n.x - cur.node.x,
            n.y - cur.node.y
          ) +
          turn;

        const h =
          Math.hypot(
            target.x - n.x,
            target.y - n.y
          );

        open.push({
          node: n,
          g,
          f: g + h,
          parent: cur,
          dir
        });
      }
    }

    return [];
  }

  function chooseNextNode() {
    if (!currentNode) {
      currentNode = nearestNode(headX, headY);
    }

    if (!currentNode) {
      targetNode = null;
      return;
    }

    const fruitInfo = nearestFruit();

    if (fruitInfo.f) {
      const fruitNode =
        nearestNode(
          fruitInfo.f.x,
          fruitInfo.f.y
        );

      if (fruitNode) {
        const route =
          findPath(
            currentNode,
            fruitNode
          );

        if (route.length >= 2) {
          const next = route[1];

          const dir =
            getDir(
              currentNode,
              next
            );

          if (
            !currentDir ||
            !reverseDir(
              currentDir,
              dir
            )
          ) {
            targetNode = next;
            return;
          }
        }
      }
    }

    let neighbors =
      getNeighbors(
        currentNode
      );

    if (!neighbors.length) {
      targetNode = null;
      return;
    }

    if (currentDir) {
      const forward =
        neighbors.filter(n => {
          const d =
            getDir(
              currentNode,
              n
            );

          return !reverseDir(
            currentDir,
            d
          );
        });

      if (forward.length) {
        neighbors = forward;
      }
    }

    let best = null;
    let bestScore = -Infinity;

    for (const n of neighbors) {
      const dir =
        getDir(
          currentNode,
          n
        );

      let score = 0;

      if (
        currentDir &&
        dir.x === currentDir.x &&
        dir.y === currentDir.y
      ) {
        score += 100;
      }

      if (
        currentDir &&
        dir.x !== currentDir.x &&
        dir.y !== currentDir.y
      ) {
        score += 20;
      }

      for (const f of fruits) {
        const d =
          Math.hypot(
            f.x - n.x,
            f.y - n.y
          );

        score +=
          Math.max(
            0,
            100 - d
          ) * 0.04;
      }

      if (
        segmentBodyDanger(
          currentNode.x,
          currentNode.y,
          n.x,
          n.y
        )
      ) {
        score -= 800;
      }

      score += Math.random() * 1.5;

      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    if (!best) {
      best = neighbors[0];
    }

    targetNode = best;
  }

  function spawnFruit() {
    if (
      fruits.length >= MAX_FRUITS ||
      !vLines.length ||
      !hLines.length
    ) {
      return;
    }

    const candidates = [];

    for (const vx of vLines) {
      for (const hy of hLines) {
        if (!isGap(vx, hy)) continue;

        let nearBody = false;
        let nearFruit = false;

        for (const t of trail) {
          if (
            Math.hypot(
              t.x - vx,
              t.y - hy
            ) < 14
          ) {
            nearBody = true;
            break;
          }
        }

        if (nearBody) continue;

        for (const f of fruits) {
          if (
            Math.hypot(
              f.x - vx,
              f.y - hy
            ) < 24
          ) {
            nearFruit = true;
            break;
          }
        }

        if (nearFruit) continue;

        candidates.push({
          x: vx,
          y: hy
        });
      }
    }

    if (!candidates.length) return;

    const p =
      candidates[
        Math.floor(
          Math.random() *
          candidates.length
        )
      ];

    fruits.push({
      x: p.x,
      y: p.y,
      r: 4
    });
  }

  function nearestFruit() {
    let best = null;
    let bestD = Infinity;

    for (const f of fruits) {
      const d =
        Math.hypot(
          f.x - headX,
          f.y - headY
        );

      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }

    return {
      f: best,
      d: bestD
    };
  }

  function updateBody() {
    if (!trail.length) return;

    trail[0].x = headX;
    trail[0].y = headY;

    for (
      let i = 1;
      i < trail.length;
      i++
    ) {
      const p = trail[i - 1];
      const c = trail[i];

      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy) || 0.001;

      if (d > SPACING) {
        const targetX =
          p.x +
          dx / d *
          SPACING;

        const targetY =
          p.y +
          dy / d *
          SPACING;

        const follow =
          Math.max(
            0.16,
            0.32 -
            i * 0.002
          );

        c.x +=
          (targetX - c.x) *
          follow;

        c.y +=
          (targetY - c.y) *
          follow;
      }
    }

    if (
      bodyGravity.length !==
      trail.length
    ) {
      bodyGravity =
        new Array(
          trail.length
        ).fill(0);
    }

    for (
      let i = 1;
      i < trail.length;
      i++
    ) {
      const prev =
        trail[
          Math.max(
            0,
            i - 1
          )
        ];

      const next =
        trail[
          Math.min(
            trail.length - 1,
            i + 1
          )
        ];

      const dx =
        next.x - prev.x;

      const dy =
        next.y - prev.y;

      const d =
        Math.hypot(
          dx,
          dy
        ) || 1;

      const verticalWeight =
        Math.abs(dy) > Math.abs(dx)
          ? 0.9
          : 0.45;

      const targetGravity =
        Math.sin(
          waveTime * 0.7 +
          i * 0.18
        ) *
        verticalWeight;

      bodyGravity[i] +=
        (
          targetGravity -
          bodyGravity[i]
        ) *
        0.045;
    }
  }

  function move() {
    const settings = cfg();

    const speed =
      Math.max(
        0.1,
        settings.speed
      );

    if (!currentNode) {
      currentNode =
        nearestNode(
          headX,
          headY
        );
    }

    if (!targetNode) {
      chooseNextNode();
    }

    if (!targetNode) {
      return;
    }

    const dx =
      targetNode.x -
      headX;

    const dy =
      targetNode.y -
      headY;

    const distance =
      Math.hypot(
        dx,
        dy
      );

    if (
      distance <= speed
    ) {
      headX =
        targetNode.x;

      headY =
        targetNode.y;

      currentDir =
        getDir(
          currentNode,
          targetNode
        );

      currentNode = {
        x: targetNode.x,
        y: targetNode.y
      };

      targetNode = null;

      chooseNextNode();
    } else {
      headX +=
        dx /
        distance *
        speed;

      headY +=
        dy /
        distance *
        speed;
    }

    updateBody();

    let ate = false;

    for (
      let i = fruits.length - 1;
      i >= 0;
      i--
    ) {
      const f =
        fruits[i];

      if (
        Math.hypot(
          f.x - headX,
          f.y - headY
        ) < 8
      ) {
        fruits.splice(
          i,
          1
        );

        ate = true;
        shake = 1;

        if (
          trail.length <
          settings.maxLen
        ) {
          const t =
            trail[
              trail.length - 1
            ];

          trail.push({
            x: t.x,
            y: t.y
          });

          bodyGravity.push(0);
        }
      }
    }

    if (ate) {
      fruitTimer = 0;
    }

    fruitTimer++;

    const nextFruitTime =
      75 +
      Math.floor(
        Math.random() * 75
      );

    if (
      fruitTimer >=
      nextFruitTime
    ) {
      fruitTimer = 0;
      spawnFruit();
    }

    if (
      fruits.length < 2 &&
      Math.random() < 0.018
    ) {
      spawnFruit();
    }

    if (shake > 0) {
      shake *= 0.85;
    }

    if (shake < 0.02) {
      shake = 0;
    }

    checkRipple(
      headX,
      headY
    );
  }

  function getWavePoint(i) {
    if (
      i <= 0 ||
      i >= trail.length - 1
    ) {
      return {
        x: trail[i].x,
        y: trail[i].y
      };
    }

    const prev =
      trail[i - 1];

    const next =
      trail[i + 1];

    const dx =
      next.x -
      prev.x;

    const dy =
      next.y -
      prev.y;

    const d =
      Math.hypot(
        dx,
        dy
      ) || 1;

    const nx =
      -dy / d;

    const ny =
      dx / d;

    const size =
      cfg().size;

    const wave =
      Math.sin(
        waveTime * 1.15 -
        i * 0.32
      );

    const ratio =
      i /
      Math.max(
        1,
        trail.length - 1
      );

    const fade =
      Math.sin(
        ratio *
        Math.PI
      );

    const amplitude =
      Math.min(
        1.5,
        0.45 +
        size * 0.42
      ) *
      fade;

    const gravity =
      bodyGravity[i] || 0;

    const gravityStrength =
      Math.min(
        1.8,
        0.65 +
        size * 0.28
      );

    const sag =
      gravity *
      gravityStrength;

    return {
      x:
        trail[i].x +
        nx *
        wave *
        amplitude,

      y:
        trail[i].y +
        ny *
        wave *
        amplitude +
        sag
    };
  }

  function checkRipple(x, y) {
    for (const c of cells) {
      const near =
        Math.abs(
          x - c.x
        ) < 3 ||
        Math.abs(
          x - c.x - c.w
        ) < 3 ||
        Math.abs(
          y - c.y
        ) < 3 ||
        Math.abs(
          y - c.y - c.h
        ) < 3;

      if (
        near &&
        x >= c.x - 3 &&
        x <= c.x + c.w + 3 &&
        y >= c.y - 3 &&
        y <= c.y + c.h + 3
      ) {
        const k =
          c.el.textContent;

        if (
          k === lastKey
        ) {
          return;
        }

        lastKey = k;

        const rp =
          document.createElement(
            'div'
          );

        rp.className =
          'snakeRipple';

        rp.style.cssText =
          `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px`;

        layer.appendChild(rp);

        setTimeout(
          () => rp.remove(),
          700
        );

        return;
      }
    }
  }

  function getColors() {
    const s =
      document.getElementById(
        'todayShiftStatus'
      )?.textContent || '';

    if (
      s.includes('已下班')
    ) {
      return {
        head: '#22b573',
        body: 'rgba(34,181,115,.55)'
      };
    }

    return {
      head: '#f05d5e',
      body: 'rgba(240,93,94,.5)'
    };
  }

  function drawFruits() {
    for (const f of fruits) {
      ctx.beginPath();

      ctx.fillStyle =
        '#ff6b6b';

      ctx.arc(
        f.x,
        f.y,
        f.r,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.fillStyle =
        '#22b573';

      ctx.beginPath();

      ctx.ellipse(
        f.x + 2,
        f.y - 4,
        2,
        1.2,
        -0.5,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(
      0,
      0,
      W,
      H
    );

    if (
      trail.length < 2
    ) {
      return;
    }

    const colors =
      getColors();

    const size =
      cfg().size;

    const sx =
      (Math.random() - 0.5) *
      shake *
      2;

    const sy =
      (Math.random() - 0.5) *
      shake *
      2;

    drawFruits();

    const points = [];

    for (
      let i = trail.length - 1;
      i >= 0;
      i--
    ) {
      const p =
        getWavePoint(i);

      points.push({
        x:
          p.x + sx,
        y:
          p.y + sy
      });
    }

    ctx.beginPath();

    ctx.strokeStyle =
      colors.body;

    ctx.lineWidth =
      2.2 * size;

    ctx.lineCap =
      'round';

    ctx.lineJoin =
      'round';

    ctx.moveTo(
      points[0].x,
      points[0].y
    );

    for (
      let i = 1;
      i < points.length - 1;
      i++
    ) {
      const p =
        points[i];

      const n =
        points[i + 1];

      const mx =
        (p.x + n.x) / 2;

      const my =
        (p.y + n.y) / 2;

      ctx.quadraticCurveTo(
        p.x,
        p.y,
        mx,
        my
      );
    }

    const last =
      points[
        points.length - 1
      ];

    ctx.lineTo(
      last.x,
      last.y
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.fillStyle =
      colors.head;

    ctx.arc(
      trail[0].x + sx,
      trail[0].y + sy,
      1.1 * size,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  function rebuildTrail() {
    trail = [];

    for (
      let i = 0;
      i < INIT_LEN;
      i++
    ) {
      trail.push({
        x: headX,
        y: headY
      });
    }

    bodyGravity =
      new Array(
        trail.length
      ).fill(0);
  }

  function start() {
    if (started) return;

    const card =
      getCard();

    if (!card) return;

    const cr =
      card.getBoundingClientRect();

    if (
      !cr.width ||
      !cr.height
    ) {
      return;
    }

    started = true;

    card.style.position =
      'relative';

    layer =
      document.createElement(
        'div'
      );

    layer.id =
      'snakeLayer';

    canvas =
      document.createElement(
        'canvas'
      );

    canvas.id =
      'snakeCanvas';

    layer.appendChild(
      canvas
    );

    card.appendChild(
      layer
    );

    ctx =
      canvas.getContext(
        '2d'
      );

    resize();

    const startPoint =
      nearestNode(
        W / 2,
        H / 2
      );

    if (startPoint) {
      headX =
        startPoint.x;

      headY =
        startPoint.y;

      currentNode = {
        x: startPoint.x,
        y: startPoint.y
      };
    } else if (
      vLines.length &&
      hLines.length
    ) {
      headX =
        vLines[0];

      headY =
        hLines[0];

      currentNode = {
        x: headX,
        y: headY
      };
    }

    rebuildTrail();

    currentDir = null;
    targetNode = null;

    spawnFruit();
    spawnFruit();

    chooseNextNode();

    loop();
  }

  function loop() {
    waveTime += 0.13;

    move();

    draw();

    requestAnimationFrame(
      loop
    );
  }

  function tryStart() {
    if (started) return;

    const card =
      getCard();

    if (!card) {
      setTimeout(
        tryStart,
        300
      );

      return;
    }

    const cr =
      card.getBoundingClientRect();

    if (
      !cr.width ||
      !cr.height
    ) {
      setTimeout(
        tryStart,
        300
      );

      return;
    }

    start();
  }

  document
    .querySelectorAll(
      '.tabbar button'
    )
    .forEach(b => {
      b.addEventListener(
        'click',
        () => {
          collectCells();

          setTimeout(
            tryStart,
            200
          );
        }
      );
    });

  window.addEventListener(
    'resize',
    () => {
      setTimeout(
        resize,
        100
      );
    }
  );

  setTimeout(
    tryStart,
    500
  );
})();