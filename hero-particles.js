/**
 * Hero 卡片粒子效果 V14 - 多模式切换版
 * 模式：connect（粒子连线）/ bubble（气泡上升）/ off（关闭）
 */
(function () {
	'use strict';

	var canvas, ctx;
	var particles = [];
	var special = null;
	var running = false;
	var rafId = null;
	var dropParticles = [];
	var mode = 'connect';

	var COUNT = 22;
	var BASE_SPEED = 0.7;
	var CONNECT_DIST = 70;
	var SPECIAL_CONNECT_DIST = 130;
	var DAMPING = 0.94;
	var CORNER_RADIUS = 22;
	var BUBBLE_COUNT = 18;

	function getMode() {
		try {
			var s = JSON.parse(localStorage.getItem('heroAnimMode') || '"connect"');
			return s || 'connect';
		} catch (e) { return 'connect'; }
	}
	function setMode(m) {
		if (mode === 'morph' && m !== 'morph') cleanupMorph();
		mode = m;
		localStorage.setItem('heroAnimMode', JSON.stringify(m));
		particles = [];
		special = null;
		fireworks = [];
		fwRockets = [];
		fwFlashes = [];
		fwTimer = 0;
		fwRocketTimer = 0;
	}

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

	function createConnect() {
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

	function updateConnect() {
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

	function drawConnect() {
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

	function makeBubble(w, h, randomY) {
		var r = 2 + Math.random() * 6;
		return {
			x: 10 + Math.random() * (w - 20),
			y: randomY ? Math.random() * h : h + r + Math.random() * 30,
			r: r,
			speed: 0.3 + (6 / Math.max(r, 1)) * 0.15 + Math.random() * 0.3,
			swing: Math.random() * Math.PI * 2,
			swingSpeed: 0.015 + Math.random() * 0.02,
			swingAmp: 0.3 + Math.random() * 0.8,
			alpha: 0.2 + Math.random() * 0.4,
			color: randomColor()
		};
	}

	function createBubble() {
		particles = [];
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		for (var i = 0; i < BUBBLE_COUNT; i++) {
			particles.push(makeBubble(w, h, true));
		}
	}

	function updateBubble() {
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		for (var i = 0; i < particles.length; i++) {
			var p = particles[i];
			p.swing += p.swingSpeed;
			p.x += Math.sin(p.swing) * p.swingAmp;
			p.y -= p.speed;
			if (p.y + p.r < 0) {
				particles[i] = makeBubble(w, h, false);
			}
			if (p.x - p.r < 0) p.x = p.r;
			if (p.x + p.r > w) p.x = w - p.r;
		}
	}

	function drawBubble() {
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		ctx.clearRect(0, 0, w, h);
		for (var i = 0; i < particles.length; i++) {
			var p = particles[i];
			ctx.globalAlpha = p.alpha;
			ctx.fillStyle = p.color;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = p.alpha * 0.6;
			ctx.fillStyle = 'rgba(255,255,255,0.8)';
			ctx.beginPath();
			ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.3, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	// ===== 烟花模式 =====
	var fireworks = [];
	var fwRockets = [];
	var fwFlashes = [];
	var fwTimer = 0;
	var fwRocketTimer = 35;

	function createFirework() {
		particles = [];
		fireworks = [];
		fwRockets = [];
		fwFlashes = [];
		fwTimer = 0;
		fwRocketTimer = 0;
	}

	function spawnRocket() {
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		var targetX = 30 + Math.random() * (w - 60);
		var targetY = 15 + Math.random() * (h * 0.4);
		var hue = Math.floor(Math.random() * 360);
		var startX = targetX + (Math.random() - 0.5) * 60;
		fwRockets.push({
			x: startX,
			y: h + 5,
			targetX: targetX,
			targetY: targetY,
			vx: (targetX - startX) / 70,
			vy: -(h - targetY) / 70 - Math.random() * 0.3,
			hue: hue,
			trail: []
		});
	}

	function explode(x, y, hue) {
		var type = Math.floor(Math.random() * 9);
		var count, shape;
		if (type === 0) { count = 30 + Math.floor(Math.random() * 20); shape = 'circle'; }
		else if (type === 1) { count = 24 + Math.floor(Math.random() * 12); shape = 'ring'; }
		else if (type === 2) { count = 36; shape = 'heart'; }
		else if (type === 3) { count = 40; shape = 'pentagram'; }
		else if (type === 4) { count = 30; shape = 'flower'; }
		else if (type === 5) { count = 36; shape = 'spiral'; }
		else if (type === 6) { count = 32; shape = 'doubleRing'; }
		else if (type === 7) { count = 30; shape = 'star'; }
		else { count = 25 + Math.floor(Math.random() * 15); shape = 'willow'; }

		for (var i = 0; i < count; i++) {
			var angle, spd;
			if (shape === 'circle') {
				angle = (Math.PI * 2 * i) / count + Math.random() * 0.15;
				spd = 0.8 + Math.random() * 1.8;
			} else if (shape === 'ring') {
				angle = (Math.PI * 2 * i) / count;
				spd = 1.5 + Math.random() * 0.4;
			} else if (shape === 'heart') {
				var t = (i / count) * Math.PI * 2;
				var hx = 16 * Math.pow(Math.sin(t), 3);
				var hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
				angle = Math.atan2(hy, hx);
				spd = Math.hypot(hx, hy) * 0.1 + Math.random() * 0.2;
			} else if (shape === 'star') {
				var starAngle = (i / count) * Math.PI * 2;
				var r = (i % 2 === 0) ? 1 : 0.4;
				angle = starAngle;
				spd = r * (1.2 + Math.random() * 1);
			} else if (shape === 'pentagram') {
				var vertices = 10;
				var vi = i % vertices;
				var outerR = 2.2;
				var innerR = outerR * 0.382;
				var pAngle = -Math.PI / 2 + (vi * Math.PI * 2) / vertices;
				var pR = (vi % 2 === 0) ? outerR : innerR;
				angle = pAngle;
				spd = pR + Math.random() * 0.2;
			} else if (shape === 'flower') {
				var fAngle = (i / count) * Math.PI * 2;
				var fR = 1.8 * Math.abs(Math.cos(2.5 * fAngle)) + 0.4;
				angle = fAngle;
				spd = fR + Math.random() * 0.2;
			} else if (shape === 'spiral') {
				var sAngle = (i / count) * Math.PI * 4;
				var sR = 0.3 + (i / count) * 2.2;
				angle = sAngle;
				spd = sR;
			} else if (shape === 'doubleRing') {
				var isOuter = i < count / 2;
				var dAngle = isOuter ? (i / (count/2)) * Math.PI * 2 : ((i - count/2) / (count/2)) * Math.PI * 2;
				angle = dAngle;
				spd = isOuter ? 2.0 + Math.random() * 0.3 : 1.0 + Math.random() * 0.2;
			} else {
				angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
				spd = 0.6 + Math.random() * 1.2;
			}
			fireworks.push({
				x: x, y: y,
				vx: Math.cos(angle) * spd,
				vy: Math.sin(angle) * spd,
				r: 1.5 + Math.random() * 2,
				alpha: 1,
				hue: hue + Math.random() * 40 - 20,
				gravity: shape === 'willow' ? 0.04 : 0.02,
				decay: 0.005 + Math.random() * 0.005,
				flicker: Math.random() * Math.PI * 2,
				flickerSpeed: 0.1 + Math.random() * 0.2,
				trail: []
			});
		}
		fwFlashes.push({ x: x, y: y, r: 5, maxR: 35 + Math.random() * 20, alpha: 0.8, hue: hue });
		if (Math.random() < 0.3) {
			setTimeout(function() {
				for (var j = 0; j < 12; j++) {
					var a2 = (Math.PI * 2 * j) / 12;
					fireworks.push({
						x: x + (Math.random()-0.5)*20, y: y + (Math.random()-0.5)*20,
						vx: Math.cos(a2) * (1 + Math.random()),
						vy: Math.sin(a2) * (1 + Math.random()),
						r: 1 + Math.random() * 1.5,
						alpha: 1,
						hue: hue + 60 + Math.random() * 30,
						gravity: 0.04,
						decay: 0.015,
						flicker: 0,
						flickerSpeed: 0.15,
						trail: []
					});
				}
			}, 200);
		}
	}

	function updateFirework() {
		fwRocketTimer++;
		if (fwRocketTimer > 80 + Math.random() * 70) {
			spawnRocket();
			fwRocketTimer = 0;
			if (Math.random() < 0.25) setTimeout(spawnRocket, 150);
		}
		for (var i = fwRockets.length - 1; i >= 0; i--) {
			var r = fwRockets[i];
			r.trail.push({ x: r.x, y: r.y });
			if (r.trail.length > 8) r.trail.shift();
			r.x += r.vx;
			r.y += r.vy;
			r.vy += 0.02;
			if (r.y <= r.targetY || r.vy >= 0) {
				explode(r.x, r.y, r.hue);
				fwRockets.splice(i, 1);
			}
		}
		for (var j = fireworks.length - 1; j >= 0; j--) {
			var p = fireworks[j];
			p.trail.push({ x: p.x, y: p.y });
			if (p.trail.length > 5) p.trail.shift();
			p.vy += p.gravity;
			p.x += p.vx;
			p.y += p.vy;
			p.vx *= 0.985;
			p.vy *= 0.985;
			p.alpha -= p.decay;
			p.flicker += p.flickerSpeed;
			if (p.alpha <= 0) fireworks.splice(j, 1);
		}
		for (var k = fwFlashes.length - 1; k >= 0; k--) {
			var fl = fwFlashes[k];
			fl.r += (fl.maxR - fl.r) * 0.2;
			fl.alpha -= 0.06;
			if (fl.alpha <= 0) fwFlashes.splice(k, 1);
		}
	}

	function drawFirework() {
		var w = cw(), h = ch();
		if (w < 10 || h < 10) return;
		ctx.clearRect(0, 0, w, h);
		for (var fi = 0; fi < fwFlashes.length; fi++) {
			var fl = fwFlashes[fi];
			var grad = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, fl.r);
			grad.addColorStop(0, 'hsla(' + fl.hue + ', 80%, 80%, ' + fl.alpha + ')');
			grad.addColorStop(0.5, 'hsla(' + fl.hue + ', 70%, 60%, ' + (fl.alpha * 0.4) + ')');
			grad.addColorStop(1, 'hsla(' + fl.hue + ', 70%, 50%, 0)');
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(fl.x, fl.y, fl.r, 0, Math.PI * 2);
			ctx.fill();
		}
		for (var ri = 0; ri < fwRockets.length; ri++) {
			var r = fwRockets[ri];
			for (var ti = 0; ti < r.trail.length; ti++) {
				var tp = r.trail[ti];
				ctx.globalAlpha = 0.6 * (ti / r.trail.length);
				ctx.fillStyle = 'hsla(' + r.hue + ', 80%, 70%, 1)';
				ctx.beginPath();
				ctx.arc(tp.x, tp.y, 1.5, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
			var rgrad = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 6);
			rgrad.addColorStop(0, 'hsla(' + r.hue + ', 90%, 85%, 1)');
			rgrad.addColorStop(1, 'hsla(' + r.hue + ', 80%, 60%, 0)');
			ctx.fillStyle = rgrad;
			ctx.beginPath();
			ctx.arc(r.x, r.y, 6, 0, Math.PI * 2);
			ctx.fill();
		}
		for (var pi = 0; pi < fireworks.length; pi++) {
			var p = fireworks[pi];
			var flickerAlpha = p.alpha * (0.7 + 0.3 * Math.sin(p.flicker));
			for (var tti = 0; tti < p.trail.length; tti++) {
				var tp2 = p.trail[tti];
				ctx.globalAlpha = flickerAlpha * 0.4 * (tti / p.trail.length);
				ctx.fillStyle = 'hsl(' + p.hue + ', 75%, 65%)';
				ctx.beginPath();
				ctx.arc(tp2.x, tp2.y, p.r * 0.6, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = flickerAlpha;
			ctx.fillStyle = 'hsl(' + p.hue + ', 80%, 68%)';
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = flickerAlpha * 0.3;
			var pgrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
			pgrad.addColorStop(0, 'hsl(' + p.hue + ', 80%, 70%)');
			pgrad.addColorStop(1, 'hsla(' + p.hue + ', 80%, 50%, 0)');
			ctx.fillStyle = pgrad;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}


	// ===== 3D形状变形模式（Three.js） =====
	var morphCanvas = null;
	var morphRenderer = null;
	var morphScene = null;
	var morphCamera = null;
	var morphPoints = null;
	var morphBuffers = [];
	var morphPositions = null;
	var morphCurrent = 0;
	var morphTarget = 0;
	var morphProgress = 1;
	var morphAutoTimer = 0;
	var morphClock = null;
	var MORPH_COUNT = 3000;

	function morphSampleSphere() {
		var u = Math.random() * 2 - 1;
		var a = Math.random() * Math.PI * 2;
		var r = Math.sqrt(1 - u * u) * 1.8;
		return [Math.cos(a) * r, u * 1.8, Math.sin(a) * r];
	}
	function morphSampleGalaxy() {
		var r = Math.pow(Math.random(), 0.6) * 2.8;
		var branch = (Math.floor(Math.random() * 3) / 3) * Math.PI * 2;
		var spin = r * 1.0;
		var j = function() { return Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 0.25 * r; };
		return [Math.cos(branch + spin) * r + j(), j() * 0.35, Math.sin(branch + spin) * r + j()];
	}
	function morphSampleTorus() {
		var a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI * 2;
		var R = 1.8, r = 0.65;
		return [(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)];
	}
	function morphSampleCube() {
		var s = 1.6;
		var face = Math.floor(Math.random() * 3);
		var p = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() < 0.5 ? -1 : 1];
		return [p[face % 3] * s, p[(face + 1) % 3] * s, p[(face + 2) % 3] * s];
	}

	function createMorph() {
		if (!window.THREE) return;
		particles = [];
		// 隐藏2D canvas
		if (canvas) canvas.style.display = 'none';
		// 创建Three.js canvas
		var hero = document.querySelector('.hero-card');
		if (!hero) return;
		hero.style.position = 'relative';
		if (!morphCanvas) {
			morphCanvas = document.createElement('canvas');
			morphCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;display:block;';
		}
		if (morphCanvas.parentElement !== hero) hero.appendChild(morphCanvas);
		// 创建渲染器
		if (!morphRenderer) {
			morphRenderer = new THREE.WebGLRenderer({ canvas: morphCanvas, antialias: true, alpha: true });
			morphRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		}
		var rect = hero.getBoundingClientRect();
		morphRenderer.setSize(rect.width, rect.height, false);
		// 场景
		if (!morphScene) {
			morphScene = new THREE.Scene();
			morphCamera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.1, 100);
			morphCamera.position.set(0, 0.8, 5.5);
			morphCamera.lookAt(0, 0, 0);
			// 生成形状缓冲
			var samplers = [morphSampleSphere, morphSampleGalaxy, morphSampleTorus, morphSampleCube];
			morphBuffers = samplers.map(function(sample) {
				var arr = new Float32Array(MORPH_COUNT * 3);
				for (var i = 0; i < MORPH_COUNT; i++) {
					var p = sample();
					arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2];
				}
				return arr;
			});
			morphPositions = new Float32Array(morphBuffers[0]);
			var colors = new Float32Array(MORPH_COUNT * 3);
			for (var j = 0; j < MORPH_COUNT; j++) {
				var hue = 0.42 + (j / MORPH_COUNT) * 0.2; // 青绿到薄荷绿
				var col = new THREE.Color().setHSL(hue, 0.75, 0.6);
				colors[j * 3] = col.r; colors[j * 3 + 1] = col.g; colors[j * 3 + 2] = col.b;
			}
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.BufferAttribute(morphPositions, 3));
			geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
			var material = new THREE.PointsMaterial({
				size: 0.035,
				vertexColors: true,
				transparent: true,
				opacity: 0.9,
				blending: THREE.AdditiveBlending,
				depthWrite: false
			});
			morphPoints = new THREE.Points(geometry, material);
			morphScene.add(morphPoints);
			morphClock = new THREE.Clock();
		}
		morphCurrent = 0;
		morphTarget = 0;
		morphProgress = 1;
		morphAutoTimer = 0;
	}

	function morphEase(x) {
		return x * x * (3 - 2 * x);
	}

	function updateMorph() {
		if (!morphRenderer || !morphPoints) return;
		// 检查canvas是否还在DOM中（页面重新渲染可能导致丢失）
		var hero = document.querySelector('.hero-card');
		if (hero && morphCanvas && morphCanvas.parentElement !== hero) {
			hero.appendChild(morphCanvas);
			morphCanvas.style.display = 'block';
			var rect = hero.getBoundingClientRect();
			morphRenderer.setSize(rect.width, rect.height, false);
			if (morphCamera) {
				morphCamera.aspect = rect.width / rect.height;
				morphCamera.updateProjectionMatrix();
			}
		}
		// 确保2D canvas保持隐藏
		if (canvas) canvas.style.display = 'none';
		var dt = morphClock.getDelta();
		if (morphProgress < 1) {
			morphProgress = Math.min(1, morphProgress + dt * 0.5);
			var k = morphEase(morphProgress);
			var from = morphBuffers[morphCurrent];
			var to = morphBuffers[morphTarget];
			for (var i = 0; i < morphPositions.length; i++) {
				morphPositions[i] = from[i] + (to[i] - from[i]) * k;
			}
			morphPoints.geometry.attributes.position.needsUpdate = true;
			if (morphProgress >= 1) { morphCurrent = morphTarget; morphAutoTimer = 0; }
		} else if ((morphAutoTimer += dt) > 5) {
			morphTarget = (morphCurrent + 1) % morphBuffers.length;
			morphProgress = 0;
		}
		morphPoints.rotation.y += dt * 0.15;
		morphPoints.rotation.x = Math.sin(morphClock.elapsedTime * 0.3) * 0.15;
	}

	function drawMorph() {
		if (!morphRenderer || !morphScene || !morphCamera) return;
		morphRenderer.render(morphScene, morphCamera);
	}

	function cleanupMorph() {
		if (morphCanvas) morphCanvas.style.display = 'none';
		if (canvas) canvas.style.display = 'block';
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

	function loop() {
		if (!running) return;
		if (ensureCanvas()) {
			if (mode === 'connect') {
				if (particles.length === 0) createConnect();
				if (particles.length > 0) { updateConnect(); drawConnect(); }
			} else if (mode === 'bubble') {
				if (particles.length === 0) createBubble();
				if (particles.length > 0) { updateBubble(); drawBubble(); }
			} else if (mode === 'firework') {
				 if (fwRockets.length === 0 && fireworks.length === 0 && fwFlashes.length === 0 && fwRocketTimer > 30) { spawnRocket(); fwRocketTimer = 0; }
				updateFirework();
				drawFirework();
			} else if (mode === 'morph') {
				if (!morphPoints) createMorph();
				if (morphPoints) { updateMorph(); drawMorph(); }
			} else {
				var w = cw(), h = ch();
				if (w > 10 && h > 10) ctx.clearRect(0, 0, w, h);
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

	mode = getMode();

	document.addEventListener('click', function(e) {
		var btn = e.target.closest('[data-tab]');
		if (!btn) return;
		if (btn.dataset.tab === '消费') start();
		else stop();
	});

	window.addEventListener('heroAnimModeChanged', function(e) {
		setMode(e.detail.mode);
	});

	start();

	window.addEventListener('balanceChanged', function() {
		spawnDropParticles(18 + Math.floor(Math.random() * 12));
	});
})();