/**
 * Hero 卡片粒子效果 V13 - 极简稳定版
 * - 取消牵引效果
 * - 基础粒子运动 + 连线 + 特殊粒子
 * - 循环自动启动，每帧 ensureCanvas
 */
(function () {
	'use strict';

	var canvas, ctx;
	var particles = [];
	var special = null;
	var running = false;
	var rafId = null;
var dropParticles = [];

	var COUNT = 22;
	var BASE_SPEED = 0.7;
	var CONNECT_DIST = 70;
	var SPECIAL_CONNECT_DIST = 130;
	var DAMPING = 0.94;
	var CORNER_RADIUS = 22;

	function randomColor() {
		var h = Math.floor(Math.random() * 360);
		var s = Math.floor(45 + Math.random() * 35);
		var l = Math.floor(50 + Math.random() * 25);
		var a = (0.3 + Math.random() * 0.5).toFixed(2);
		return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';
	}
	function withAlpha(color, alpha) {
		return color.replace(/[\d.]+\)$/, alpha.toFixed(2) + ')');
	}

	function ensureCanvas() {
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.id = 'heroParticles';
			canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;display:block;';
			ctx = canvas.getContext('2d');
		}
		var hero = document.querySelector('.hero-card');
		if (!hero) return false;
		hero.style.position = 'relative';
		if (canvas.parentElement !== hero) hero.appendChild(canvas);
		var rect = hero.getBoundingClientRect();
		if (rect.width < 10 || rect.height < 10) return false;
		var dpr = window.devicePixelRatio || 1;
		var tw = Math.round(rect.width * dpr);
		var th = Math.round(rect.height * dpr);
		if (canvas.width !== tw || canvas.height !== th) {
			canvas.width = tw;
			canvas.height = th;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		return true;
	}

	function cw() { return canvas ? canvas.width / (window.devicePixelRatio || 1) : 0; }
	function ch() { return canvas ? canvas.height / (window.devicePixelRatio || 1) : 0; }

	function create() {
		particles = [];
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		for (var i = 0; i < COUNT; i++) {
			var angle = Math.random() * Math.PI * 2;
			var depth = 0.35 + Math.random() * 0.65;
			var r = (1.0 + Math.random() * 4.5) * depth;
			var sf = Math.min(5 / Math.max(r, 0.5), 2.5);
			var spd = BASE_SPEED * sf * (0.9 + Math.random() * 0.2);
			particles.push({
				x: CORNER_RADIUS + Math.random() * Math.max(1, w - CORNER_RADIUS * 2),
				y: CORNER_RADIUS + Math.random() * Math.max(1, h - CORNER_RADIUS * 2),
				vx: Math.cos(angle) * spd,
				vy: Math.sin(angle) * spd,
				baseSpeed: spd,
				r: r,
				depth: depth,
				color: randomColor(),
				pulse: Math.random() * Math.PI * 2
			});
		}
		var sa = Math.random() * Math.PI * 2;
		special = {
			x: w * 0.5, y: h * 0.5,
			vx: Math.cos(sa) * BASE_SPEED * 0.3,
			vy: Math.sin(sa) * BASE_SPEED * 0.3,
			r: 4, stuckTimer: 0
		};
	}

	function bounce(p) {
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		var cr = CORNER_RADIUS, pr = p.r;
		var corners = [[cr,cr],[w-cr,cr],[cr,h-cr],[w-cr,h-cr]];
		for (var ci = 0; ci < 4; ci++) {
			var cx = corners[ci][0], cy = corners[ci][1];
			var ix = (cx === cr) ? (p.x < cr) : (p.x > w - cr);
			var iy = (cy === cr) ? (p.y < cr) : (p.y > h - cr);
			if (ix && iy) {
				var dx = p.x - cx, dy = p.y - cy;
				var d = Math.hypot(dx, dy);
				var md = cr - pr;
				if (d > md && d > 0.01) {
					var nx = dx/d, ny = dy/d;
					p.x = cx + nx*md; p.y = cy + ny*md;
					var dot = p.vx*nx + p.vy*ny;
					if (dot > 0) { p.vx=(p.vx-2*dot*nx)*DAMPING; p.vy=(p.vy-2*dot*ny)*DAMPING; }
				}
				return;
			}
		}
		if (p.x-pr<0){p.x=pr;p.vx=Math.abs(p.vx)*DAMPING;}
		if (p.x+pr>w){p.x=w-pr;p.vx=-Math.abs(p.vx)*DAMPING;}
		if (p.y-pr<0){p.y=pr;p.vy=Math.abs(p.vy)*DAMPING;}
		if (p.y+pr>h){p.y=h-pr;p.vy=-Math.abs(p.vy)*DAMPING;}
	}

	function update() {
		for (var i = 0; i < particles.length; i++) {
			var p = particles[i];
			p.vx += (Math.random()-0.5)*0.008;
			p.vy += (Math.random()-0.5)*0.008;
			var spd = Math.hypot(p.vx, p.vy);
			var maxSpd = p.baseSpeed * 2.0;
			var minSpd = p.baseSpeed * 0.2;
			if (spd > maxSpd) { p.vx=(p.vx/spd)*maxSpd; p.vy=(p.vy/spd)*maxSpd; }
			else if (spd < minSpd) {
				var a = spd > 0.01 ? Math.atan2(p.vy,p.vx) : Math.random()*Math.PI*2;
				p.vx=Math.cos(a)*minSpd*1.3; p.vy=Math.sin(a)*minSpd*1.3;
			}
			p.x += p.vx; p.y += p.vy;
			bounce(p);
			p.pulse += 0.08;
		}
		if (special) {
			special.vx += (Math.random()-0.5)*0.006;
			special.vy += (Math.random()-0.5)*0.006;
			special.x += special.vx;
			special.y += special.vy;
			bounce(special);
			var h = ch();
			if (special.y < h*0.2) {
				special.stuckTimer++;
				if (special.stuckTimer > 80) { special.vy = Math.abs(special.vy) + BASE_SPEED*0.2; special.stuckTimer = 0; }
			} else special.stuckTimer = 0;
			var ss = Math.hypot(special.vx, special.vy);
			if (ss < BASE_SPEED*0.2) {
				var a2 = Math.random()*Math.PI*2;
				special.vx = Math.cos(a2)*BASE_SPEED*0.26;
				special.vy = Math.sin(a2)*BASE_SPEED*0.26;
			}
		}
	}

	function spawnDropParticles(count) {
		ensureCanvas();
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		for (var i = 0; i < count; i++) {
			var r = 2 + Math.random() * 5;
			dropParticles.push({
				x: 10 + Math.random() * (w - 20),
				y: -10 - Math.random() * 40,
				vx: (Math.random() - 0.5) * 0.8,
				vy: Math.random() * 0.5,
				r: r,
				bounceFactor: 0.35 + (r / 7) * 0.4,
				gravity: 0.1,
				alpha: 1,
				color: randomColor(),
				settled: false
			});
		}
	}

	function updateDropParticles() {
		var h = ch(), w = cw();
		for (var i = dropParticles.length - 1; i >= 0; i--) {
			var p = dropParticles[i];
			if (!p.settled) {
				p.vy += p.gravity;
				p.x += p.vx;
				p.y += p.vy;
				if (p.y + p.r > h) {
					p.y = h - p.r;
					if (Math.abs(p.vy) > 0.5) {
						p.vy = -p.vy * p.bounceFactor;
						p.vx *= 0.75;
					} else {
						p.settled = true;
						p.vy = 0; p.vx = 0;
					}
				}
				if (p.x - p.r < 0) { p.x = p.r; p.vx = -p.vx * 0.7; }
				if (p.x + p.r > w) { p.x = w - p.r; p.vx = -p.vx * 0.7; }
			} else {
				p.alpha -= 0.008;
				if (p.alpha <= 0) dropParticles.splice(i, 1);
			}
		}
	}

	function drawDropParticles() {
		for (var i = 0; i < dropParticles.length; i++) {
			var p = dropParticles[i];
			ctx.globalAlpha = p.alpha;
			ctx.fillStyle = p.color;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	function draw() {
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		ctx.clearRect(0, 0, w, h);
		for (var i = 0; i < particles.length; i++) {
			for (var j = i+1; j < particles.length; j++) {
				var d = Math.hypot(particles[i].x-particles[j].x, particles[i].y-particles[j].y);
				if (d < CONNECT_DIST) {
					var ad = (particles[i].depth+particles[j].depth)/2;
					var al = 0.12*ad*(1-d/CONNECT_DIST);
					ctx.strokeStyle = withAlpha(particles[i].color, al);
					ctx.lineWidth = 0.6*ad;
					ctx.beginPath();
					ctx.moveTo(particles[i].x, particles[i].y);
					ctx.lineTo(particles[j].x, particles[j].y);
					ctx.stroke();
				}
			}
		}
		if (special) {
			for (var k = 0; k < particles.length; k++) {
				var d2 = Math.hypot(special.x-particles[k].x, special.y-particles[k].y);
				if (d2 < SPECIAL_CONNECT_DIST) {
					var al2 = 0.5*(1-d2/SPECIAL_CONNECT_DIST);
					ctx.strokeStyle = withAlpha(particles[k].color, al2);
					ctx.lineWidth = 1.2;
					ctx.beginPath();
					ctx.moveTo(special.x, special.y);
					ctx.lineTo(particles[k].x, particles[k].y);
					ctx.stroke();
				}
			}
		}
		var sorted = particles.slice().sort(function(a,b){return a.depth-b.depth;});
		for (var m = 0; m < sorted.length; m++) {
			var p = sorted[m];
			ctx.fillStyle = p.color;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
			ctx.fill();
		}
		if (special) {
			var glow = ctx.createRadialGradient(special.x, special.y, 0, special.x, special.y, special.r*4);
			glow.addColorStop(0, 'rgba(240,184,120,0.3)');
			glow.addColorStop(1, 'rgba(240,184,120,0)');
			ctx.fillStyle = glow;
			ctx.beginPath();
			ctx.arc(special.x, special.y, special.r*4, 0, Math.PI*2);
			ctx.fill();
			ctx.fillStyle = 'rgba(240,184,120,0.95)';
			ctx.beginPath();
			ctx.arc(special.x, special.y, special.r, 0, Math.PI*2);
			ctx.fill();
		}
	}

	function loop() {
		if (!running) return;
		if (ensureCanvas()) {
			if (particles.length === 0) create();
			if (particles.length > 0) {
				update();
				draw();
			}
			if (dropParticles.length > 0) {
				updateDropParticles();
				drawDropParticles();
			}
		}
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
	}

	document.addEventListener('click', function(e) {
		var btn = e.target.closest('[data-tab]');
		if (!btn) return;
		if (btn.dataset.tab === '消费') start();
		else stop();
	});

	start();

	window.addEventListener('balanceChanged', function() {
		spawnDropParticles(18 + Math.floor(Math.random() * 12));
	});
})();