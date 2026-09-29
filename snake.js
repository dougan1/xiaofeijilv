(function () {
  const STYLE_ID = 'snake-layer-style';

  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #snakeLayer{
        position:absolute;
        inset:0;
        pointer-events:none;
        z-index:5;
        overflow:hidden;
        border-radius:12px
      }
      #snakeCanvas{
        width:100%;
        height:100%;
        display:block;
        pointer-events:none
      }
      #snakeLayer .snakeRipple{
        position:absolute;
        width:8px;
        height:8px;
        border:1px solid rgba(255,255,255,.35);
        border-radius:50%;
        transform:translate(-50%,-50%);
        animation:snakeRipple .65s ease-out forwards;
        pointer-events:none
      }
      @keyframes snakeRipple{
        0%{
          opacity:.8;
          transform:translate(-50%,-50%) scale(.3)
        }
        100%{
          opacity:0;
          transform:translate(-50%,-50%) scale(2.2)
        }
      }
    `;
    document.head.appendChild(st);
  }

  const grid = document.querySelector('#shiftDaysGrid');
  if (!grid) return;

  const card = grid.parentElement;
  if (!card) return;

  let layer = card.querySelector('#snakeLayer');

  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'snakeLayer';

    const canvas = document.createElement('canvas');
    canvas.id = 'snakeCanvas';

    layer.appendChild(canvas);
    card.appendChild(layer);
  }

  const canvas = layer.querySelector('#snakeCanvas');
  const ctx = canvas.getContext('2d');

  const INITIAL_COUNT = 10;
  const MAX_LEN = 500;
  const MAX_FRUITS = 5;
  const BODY_SAFE = 9;

  let W = 0;
  let H = 0;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  let cells = [];
  let vLines = [];
  let hLines = [];
  let nodes = [];

  let headX = 0;
  let headY = 0;

  let currentNode = null;
  let targetNode = null;
  let currentDir = null;

  let history = [];
  let trail = [];
  let fruits = [];

  let lastTime = performance.now();
  let lastRipple = 0;

  const cfg = () => ({
    speed: Math.max(
      0.1,
      Math.min(
        3,
        Number(localStorage.getItem('h5_snake_speed')) || 0.5
      )
    ),
    size: Math.max(
      1,
      Math.min(
        6,
        Number(localStorage.getItem('h5_snake_size')) || 2
      )
    ),
    len: Math.max(
      INITIAL_COUNT,
      Math.min(
        MAX_LEN,
        Number(localStorage.getItem('h5_snake_len')) || INITIAL_COUNT
      )
    )
  });

  function getSpacing() {
    const size = cfg().size;
    return Math.max(2, size * 2);
  }

  function getRadius() {
    return getSpacing() / 2;
  }

  function resize() {
    const rect = card.getBoundingClientRect();

    W = rect.width;
    H = rect.height;

    dpr = Math.max(
      1,
      window.devicePixelRatio || 1
    );

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    buildGrid();
  }

  function getCells() {
    const cardRect = card.getBoundingClientRect();

    return Array.from(grid.children)
      .map(el => {
        const r = el.getBoundingClientRect();

        return {
          left: r.left - cardRect.left,
          right: r.right - cardRect.left,
          top: r.top - cardRect.top,
          bottom: r.bottom - cardRect.top
        };
      })
      .filter(r =>
        r.right > 0 &&
        r.left < W &&
        r.bottom > 0 &&
        r.top < H &&
        r.right > r.left &&
        r.bottom > r.top
      );
  }

  function uniqueSorted(arr) {
    return [
      ...new Set(
        arr.map(v =>
          Math.round(v * 10) / 10
        )
      )
    ].sort((a, b) => a - b);
  }

  function buildGrid() {
    cells = getCells();

    const xs = [];
    const ys = [];

    cells.forEach(c => {
      xs.push(c.left, c.right);
      ys.push(c.top, c.bottom);
    });

    vLines = uniqueSorted(xs);
    hLines = uniqueSorted(ys);

    nodes = [];

    vLines.forEach(x => {
      hLines.forEach(y => {
        if (isGap(x, y)) {
          nodes.push({
            x,
            y
          });
        }
      });
    });

    if (!nodes.length) return;

    if (!currentNode) {
      currentNode = nearestNode(
        W / 2,
        H / 2
      );

      if (!currentNode) return;

      headX = currentNode.x;
      headY = currentNode.y;

      targetNode =
        chooseNextNode(
          currentNode
        );

      currentDir =
        targetNode
          ? direction(
              currentNode,
              targetNode
            )
          : null;

      buildInitialBody();
    }
  }

  function isInsideCell(
    x,
    y,
    padding = 0
  ) {
    for (const c of cells) {
      if (
        x > c.left - padding &&
        x < c.right + padding &&
        y > c.top - padding &&
        y < c.bottom + padding
      ) {
        return true;
      }
    }

    return false;
  }

  function isGap(x, y) {
    return !isInsideCell(
      x,
      y,
      0.5
    );
  }

  function validSegment(
    x1,
    y1,
    x2,
    y2
  ) {
    if (
      Math.abs(x2 - x1) > 0.01 &&
      Math.abs(y2 - y1) > 0.01
    ) {
      return false;
    }

    const steps = Math.max(
      2,
      Math.ceil(
        Math.max(
          Math.abs(x2 - x1),
          Math.abs(y2 - y1)
        ) / 2
      )
    );

    for (
      let i = 0;
      i <= steps;
      i++
    ) {
      const t = i / steps;

      const x =
        x1 +
        (x2 - x1) * t;

      const y =
        y1 +
        (y2 - y1) * t;

      if (!isGap(x, y)) {
        return false;
      }
    }

    return true;
  }

  function nearestNode(x, y) {
    let best = null;
    let bestD = Infinity;

    for (const n of nodes) {
      const d =
        Math.abs(n.x - x) +
        Math.abs(n.y - y);

      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }

    return best;
  }

  function sameNode(a, b) {
    return !!a &&
      !!b &&
      Math.abs(a.x - b.x) < 0.5 &&
      Math.abs(a.y - b.y) < 0.5;
  }

  function direction(a, b) {
    if (!a || !b) return null;

    if (
      Math.abs(b.x - a.x) >
      Math.abs(b.y - a.y)
    ) {
      return b.x > a.x
        ? 'right'
        : 'left';
    }

    if (
      Math.abs(b.y - a.y) > 0
    ) {
      return b.y > a.y
        ? 'down'
        : 'up';
    }

    return null;
  }

  function opposite(dir) {
    if (dir === 'left') return 'right';
    if (dir === 'right') return 'left';
    if (dir === 'up') return 'down';
    if (dir === 'down') return 'up';
    return null;
  }

  function getNeighbors(node) {
    const result = [];

    const left =
      vLines
        .filter(x => x < node.x)
        .pop();

    const right =
      vLines.find(x => x > node.x);

    const up =
      hLines
        .filter(y => y < node.y)
        .pop();

    const down =
      hLines.find(y => y > node.y);

    const candidates = [
      left != null
        ? { x: left, y: node.y }
        : null,
      right != null
        ? { x: right, y: node.y }
        : null,
      up != null
        ? { x: node.x, y: up }
        : null,
      down != null
        ? { x: node.x, y: down }
        : null
    ];

    candidates.forEach(n => {
      if (!n) return;

      const actual =
        nearestNode(
          n.x,
          n.y
        );

      if (
        actual &&
        Math.abs(actual.x - n.x) < 0.5 &&
        Math.abs(actual.y - n.y) < 0.5 &&
        validSegment(
          node.x,
          node.y,
          actual.x,
          actual.y
        )
      ) {
        if (
          !result.some(
            x => sameNode(x, actual)
          )
        ) {
          result.push(actual);
        }
      }
    });

    return result;
  }

  function pointDistance(a, b) {
    return Math.hypot(
      a.x - b.x,
      a.y - b.y
    );
  }

  function bodyDanger(node) {
    const safe =
      BODY_SAFE +
      getRadius();

    for (const p of trail) {
      if (
        Math.hypot(
          node.x - p.x,
          node.y - p.y
        ) < safe
      ) {
        return true;
      }
    }

    return false;
  }

  function findSafePath(
    start,
    target
  ) {
    if (!start || !target)
      return null;

    const open = [{
      node: start,
      g: 0,
      f: pointDistance(
        start,
        target
      ),
      parent: null
    }];

    const visited = new Set();

    while (open.length) {
      open.sort(
        (a, b) => a.f - b.f
      );

      const current =
        open.shift();

      const key =
        Math.round(current.node.x) +
        ',' +
        Math.round(current.node.y);

      if (visited.has(key))
        continue;

      visited.add(key);

      if (
        sameNode(
          current.node,
          target
        )
      ) {
        const path = [];

        let p = current;

        while (p) {
          path.unshift(p.node);
          p = p.parent;
        }

        return path;
      }

      for (
        const n of getNeighbors(
          current.node
        )
      ) {
        if (
          !sameNode(n, target) &&
          bodyDanger(n)
        ) {
          continue;
        }

        const nk =
          Math.round(n.x) +
          ',' +
          Math.round(n.y);

        if (visited.has(nk))
          continue;

        const g =
          current.g +
          pointDistance(
            current.node,
            n
          );

        const f =
          g +
          pointDistance(
            n,
            target
          );

        open.push({
          node: n,
          g,
          f,
          parent: current
        });
      }
    }

    return null;
  }

  function chooseNextNode(node) {
    const neighbors =
      getNeighbors(node);

    if (!neighbors.length)
      return null;

    const safe =
      neighbors.filter(
        n => !bodyDanger(n)
      );

    let candidates =
      safe.length
        ? safe
        : neighbors;

    if (currentDir) {
      const rev =
        opposite(currentDir);

      const filtered =
        candidates.filter(
          n =>
            direction(
              node,
              n
            ) !== rev
        );

      if (filtered.length) {
        candidates = filtered;
      }
    }

    const fruit =
      nearestFruit(node);

    if (fruit) {
      const path =
        findSafePath(
          node,
          fruit.node
        );

      if (
        path &&
        path.length > 1
      ) {
        return path[1];
      }
    }

    if (currentDir) {
      const same =
        candidates.filter(
          n =>
            direction(
              node,
              n
            ) === currentDir
        );

      if (same.length) {
        return same[0];
      }
    }

    candidates.sort(
      (a, b) =>
        bodyDanger(a) -
        bodyDanger(b)
    );

    return candidates[0];
  }

  function nearestFruit(node) {
    if (!fruits.length)
      return null;

    let best = null;
    let bestD = Infinity;

    fruits.forEach(f => {
      const d =
        pointDistance(
          node,
          f.node
        );

      if (d < bestD) {
        bestD = d;
        best = f;
      }
    });

    return best;
  }

  function spawnFruit() {
    if (
      fruits.length >=
      MAX_FRUITS
    ) {
      return;
    }

    const available =
      nodes.filter(n => {
        if (bodyDanger(n))
          return false;

        if (
          Math.hypot(
            n.x - headX,
            n.y - headY
          ) < 20
        ) {
          return false;
        }

        return !fruits.some(
          f =>
            Math.hypot(
              f.node.x - n.x,
              f.node.y - n.y
            ) < 15
        );
      });

    if (!available.length)
      return;

    const node =
      available[
        Math.floor(
          Math.random() *
          available.length
        )
      ];

    fruits.push({
      node
    });
  }

  function getBackwardStart() {
    if (!currentNode)
      return null;

    const neighbors =
      getNeighbors(
        currentNode
      );

    const forbidden =
      targetNode
        ? direction(
            currentNode,
            targetNode
          )
        : null;

    const candidates =
      neighbors.filter(n => {
        const d =
          direction(
            currentNode,
            n
          );

        return d !== forbidden;
      });

    if (candidates.length) {
      return candidates[
        Math.floor(
          Math.random() *
          candidates.length
        )
      ];
    }

    return neighbors[0] || null;
  }

  function buildInitialBody() {
    const spacing =
      getSpacing();

    const bodyCount =
      Math.max(
        0,
        INITIAL_COUNT - 1
      );

    trail = [];
    history = [];

    history.push({
      x: headX,
      y: headY
    });

    let current =
      currentNode;

    let previous =
      targetNode;

    let safety = 0;

    while (
      trail.length < bodyCount &&
      safety < 100
    ) {
      safety++;

      const neighbors =
        getNeighbors(current);

      let candidates =
        neighbors.filter(n => {
          if (
            previous &&
            sameNode(
              n,
              previous
            )
          ) {
            return false;
          }

          return true;
        });

      if (!candidates.length) {
        candidates = neighbors;
      }

      if (!candidates.length)
        break;

      let next =
        candidates[
          Math.floor(
            Math.random() *
            candidates.length
          )
        ];

      const dx =
        next.x - current.x;

      const dy =
        next.y - current.y;

      const distance =
        Math.hypot(
          dx,
          dy
        );

      const steps =
        Math.floor(
          distance / spacing
        );

      for (
        let i = 1;
        i <= steps &&
        trail.length < bodyCount;
        i++
      ) {
        const ratio =
          (i * spacing) /
          distance;

        const p = {
          x:
            current.x +
            dx * ratio,
          y:
            current.y +
            dy * ratio
        };

        trail.push(p);
      }

      previous = current;
      current = next;
    }

    if (
      trail.length <
      bodyCount
    ) {
      const fallback =
        getBackwardStart();

      if (fallback) {
        const dx =
          fallback.x -
          currentNode.x;

        const dy =
          fallback.y -
          currentNode.y;

        const distance =
          Math.hypot(
            dx,
            dy
          );

        for (
          let i = 1;
          i <= bodyCount &&
          trail.length < bodyCount;
          i++
        ) {
          const ratio =
            Math.min(
              1,
              (i * spacing) /
                distance
            );

          trail.push({
            x:
              currentNode.x +
              dx * ratio,
            y:
              currentNode.y +
              dy * ratio
          });
        }
      }
    }

    while (
      trail.length <
      bodyCount
    ) {
      const last =
        trail.length
          ? trail[
              trail.length - 1
            ]
          : {
              x: headX,
              y: headY
            };

      trail.push({
        x: last.x,
        y: last.y
      });
    }

    history =
      trail
        .slice()
        .reverse();

    history.push({
      x: headX,
      y: headY
    });

    trail =
      trail.slice(
        0,
        bodyCount
      );
  }

  function recordHeadHistory() {
    if (!history.length) {
      history.push({
        x: headX,
        y: headY
      });

      return;
    }

    const last =
      history[
        history.length - 1
      ];

    const dx =
      headX - last.x;

    const dy =
      headY - last.y;

    const distance =
      Math.hypot(
        dx,
        dy
      );

    if (distance < 0.5)
      return;

    const steps =
      Math.ceil(
        distance / 0.5
      );

    for (
      let i = 1;
      i <= steps;
      i++
    ) {
      const t =
        i / steps;

      history.push({
        x:
          last.x +
          dx * t,
        y:
          last.y +
          dy * t
      });
    }

    const maxHistory =
      Math.max(
        3000,
        cfg().len * 40
      );

    if (
      history.length >
      maxHistory
    ) {
      history.splice(
        0,
        history.length -
          maxHistory
      );
    }
  }

  function rebuildTrailFromHistory() {
    if (!history.length)
      return;

    const totalCount =
      Math.min(
        MAX_LEN,
        Math.max(
          INITIAL_COUNT,
          cfg().len
        )
      );

    const bodyCount =
      totalCount - 1;

    const spacing =
      getSpacing();

    const result = [];

    let distance = 0;
    let nextDistance =
      spacing;

    for (
      let i =
        history.length - 1;
      i > 0 &&
      result.length < bodyCount;
      i--
    ) {
      const a =
        history[i];

      const b =
        history[i - 1];

      const dx =
        b.x - a.x;

      const dy =
        b.y - a.y;

      const segment =
        Math.hypot(
          dx,
          dy
        );

      if (segment <= 0)
        continue;

      while (
        distance + segment >=
          nextDistance &&
        result.length < bodyCount
      ) {
        const ratio =
          (nextDistance -
            distance) /
          segment;

        result.push({
          x:
            a.x +
            dx * ratio,
          y:
            a.y +
            dy * ratio
        });

        nextDistance +=
          spacing;
      }

      distance += segment;
    }

    trail = result;
  }

  function eatFruit() {
    let ate = false;

    fruits =
      fruits.filter(f => {
        const d =
          Math.hypot(
            headX -
              f.node.x,
            headY -
              f.node.y
          );

        if (d < 6) {
          ate = true;
          return false;
        }

        return true;
      });

    if (ate) {
      spawnFruit();
      spawnFruit();
    }

    while (
      fruits.length <
      MAX_FRUITS
    ) {
      spawnFruit();

      if (
        fruits.length >=
        MAX_FRUITS
      ) {
        break;
      }

      if (!nodes.length)
        break;
    }
  }

  function move(dt) {
    if (!targetNode) {
      targetNode =
        chooseNextNode(
          currentNode
        );

      if (!targetNode)
        return;
    }

    const speed =
      cfg().speed *
      45;

    const dx =
      targetNode.x -
      headX;

    const dy =
      targetNode.y -
      headY;

    let vx = 0;
    let vy = 0;

    if (
      Math.abs(dx) >
      Math.abs(dy)
    ) {
      vx =
        Math.sign(dx) *
        speed *
        dt;
    } else if (
      Math.abs(dy) > 0
    ) {
      vy =
        Math.sign(dy) *
        speed *
        dt;
    }

    const reachX =
      Math.abs(dx) <=
      Math.abs(vx);

    const reachY =
      Math.abs(dy) <=
      Math.abs(vy);

    if (reachX && reachY) {
      headX =
        targetNode.x;

      headY =
        targetNode.y;

      currentDir =
        direction(
          currentNode,
          targetNode
        );

      currentNode =
        targetNode;

      targetNode =
        chooseNextNode(
          currentNode
        );
    } else {
      headX += vx;
      headY += vy;
    }

    recordHeadHistory();
    rebuildTrailFromHistory();
    eatFruit();
  }

  function drawFruits() {
    const size =
      cfg().size;

    fruits.forEach(f => {
      const p =
        f.node;

      ctx.beginPath();
      ctx.fillStyle =
        'rgba(255,80,80,.9)';

      ctx.arc(
        p.x,
        p.y,
        size * 1.15,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle =
        'rgba(255,255,255,.9)';

      ctx.arc(
        p.x - size * 0.35,
        p.y - size * 0.35,
        size * 0.3,
        0,
        Math.PI * 2
      );

      ctx.fill();
    });
  }

  function draw() {
    ctx.clearRect(
      0,
      0,
      W,
      H
    );

    drawFruits();

    const radius =
      getRadius();

    const alpha = 0.9;

    for (
      let i =
        trail.length - 1;
      i >= 0;
      i--
    ) {
      const p =
        trail[i];

      ctx.beginPath();

      ctx.fillStyle =
        `rgba(0,220,120,${alpha})`;

      ctx.arc(
        p.x,
        p.y,
        radius,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    ctx.beginPath();

    ctx.fillStyle =
      `rgba(0,220,120,${alpha})`;

    ctx.arc(
      headX,
      headY,
      radius,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  function checkRipple(now) {
    if (
      now - lastRipple <
      900
    ) {
      return;
    }

    lastRipple = now;

    if (!nodes.length)
      return;

    const n =
      nodes[
        Math.floor(
          Math.random() *
          nodes.length
        )
      ];

    const ripple =
      document.createElement(
        'div'
      );

    ripple.className =
      'snakeRipple';

    ripple.style.left =
      n.x + 'px';

    ripple.style.top =
      n.y + 'px';

    layer.appendChild(
      ripple
    );

    setTimeout(() => {
      ripple.remove();
    }, 700);
  }

  function loop(now) {
    const dt =
      Math.min(
        0.05,
        (now - lastTime) /
          1000
      );

    lastTime = now;

    move(dt);
    draw();
    checkRipple(now);

    requestAnimationFrame(
      loop
    );
  }

  window.addEventListener(
    'resize',
    resize
  );

  resize();

  while (
    fruits.length <
    MAX_FRUITS
  ) {
    spawnFruit();

    if (
      nodes.length < 2
    ) {
      break;
    }
  }

  requestAnimationFrame(
    loop
  );
})();