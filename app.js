(function() {
	'use strict';
	const KEY = 'planner_app_v2';
	const todayISO = () => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
	};
	const fmt = n => Number(n || 0).toFixed(2);
	const parseDate = s => new Date(s + 'T00:00:00');
	const iso = d =>
		`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
	const addDays = (s, n) => {
		const d = parseDate(s);
		d.setDate(d.getDate() + n);
		return iso(d)
	};
	const diffDays = (a, b) => Math.floor((parseDate(b) - parseDate(a)) / 86400000) + 1;
	const money = n => '¥' + fmt(n);
	let lastTouch = {
		time: 0,
		x: 0,
		y: 0
	};
	document.addEventListener('touchend', e => {
		if (e.target.closest?.('input,textarea,select')) {
			lastTouch.time = 0;
			return;
		}
		const touch = e.changedTouches && e.changedTouches[0];
		if (!touch) return;
		const now = Date.now();
		const dx = Math.abs(touch.clientX - lastTouch.x);
		const dy = Math.abs(touch.clientY - lastTouch.y);
		if (now - lastTouch.time <= 320 && dx < 28 && dy < 28) e.preventDefault();
		lastTouch = {
			time: now,
			x: touch.clientX,
			y: touch.clientY
		};
	}, {
		passive: false
	});
	const defaultState = () => ({
		tab: '消费',
		periodStart: todayISO(),
		periodEnd: addDays(todayISO(), 29),
		budget: 5000,
		cycleBudgets: {},
		consumeStart: '',
		consumeEnd: '',
		scheduleStart: '',
		scheduleEnd: '',
		categories: ['购物', '加油', '停车', '买菜', '餐饮', '交通', '生活'],
		records: [],
		selectedDate: '',
		expectedAllocations: {},
		schedule: {
			mode: 'normal',
			startDate: todayISO(),
			cycle: ['白班', '夜班', '休', '白班', '夜班', '休', '休', '休'],
			dayStart: '08:00',
			dayEnd: '20:00',
			nightStart: '20:00',
			nightEnd: '08:00',
			overrides: {},
			locks: {},
			calendarLocked: false,
			selectedDate: ''
		},
		tools: [{
			id: 'baidu',
			name: '百度',
			url: 'https://www.baidu.com',
			icon: '🔎'
		}]
	});
	let state = (() => {
		try {
			return Object.assign(defaultState(), JSON.parse(localStorage.getItem(KEY) || '{}'))
		} catch (e) {
			return defaultState()
		}
	})();
	state.tab = '消费';
	state.schedule = Object.assign(defaultState().schedule, state.schedule || {});
	state.schedule.overrides = state.schedule.overrides && typeof state.schedule.overrides === 'object' ? state
		.schedule.overrides : {};
	state.schedule.calendarLocked = state.schedule.calendarLocked === true;
	state.schedule.selectedDate = state.schedule.selectedDate || '';
	state.cloud = Object.assign({
		binId: '6ac3ab79ffd5d160534f4cc5',
		accessKey: '$2a$10$ef1OKmYSovwETwPIThsBouQdqVGAN.ldYlML6Wi5sDYfa46feUv/.',
		autoSync: true,
		autoPull: true,
		status: '未连接',
		lastSync: '',
		dirty: false,
		initialized: false
	}, state.cloud || {});
	// Force the newly created Bin ID so an older localStorage value cannot reconnect to the previous Bin.
	state.cloud.binId = '6ac3ab79ffd5d160534f4cc5';
	state.cloud.accessKey = '$2a$10$ef1OKmYSovwETwPIThsBouQdqVGAN.ldYlML6Wi5sDYfa46feUv/.';
	state.cloud.autoSync = true;
	state.cloud.autoPull = true;
	const APP_VERSION = 'V145';
	const oldDefaultCategories = ['餐饮', '交通', '购物', '娱乐', '生活', '其他'];
	if (!Array.isArray(state.categories) || !state.categories.length || state.categories.length ===
		oldDefaultCategories.length && state.categories.every(x => oldDefaultCategories.includes(x))) state
		.categories = defaultState().categories;
	state.records = Array.isArray(state.records) ? state.records : [];
	state.tools = Array.isArray(state.tools) ? state.tools : [];
	state.cycleBudgets = state.cycleBudgets && typeof state.cycleBudgets === 'object' ? state.cycleBudgets : {};
	state.expectedAllocations = state.expectedAllocations && typeof state.expectedAllocations === 'object' ? state
		.expectedAllocations : {};
	if (state.expectedAllocationsVersion !== 2) {
		state.expectedAllocations = {};
		state.expectedAllocationsVersion = 2;
	}
	state.consumeStart = state.consumeStart || state.periodStart;
	state.consumeEnd = state.consumeEnd || state.periodEnd;
	state.scheduleStart = state.scheduleStart || state.periodStart;
	state.scheduleEnd = state.scheduleEnd || state.periodEnd;

	function validISO(v) {
		return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseDate(v).getTime())
	}

	function firstValid(...vs) {
		return vs.find(validISO) || ''
	}

	function normalizeCloudData(d, previous) {
		const base = defaultState();
		const prev = previous || {};
		const settings = d?.settings && typeof d.settings === 'object' ? d.settings : {};
		const next = {
			...d
		};
		next.periodStart = firstValid(d?.periodStart, d?.consumeStart, settings.consumeStart, prev.periodStart, base
			.periodStart);
		next.periodEnd = firstValid(d?.periodEnd, d?.consumeEnd, settings.consumeEnd, prev.periodEnd, base
			.periodEnd);
		if (!validISO(next.periodStart)) next.periodStart = base.periodStart;
		if (!validISO(next.periodEnd) || next.periodEnd < next.periodStart) next.periodEnd = addDays(next
			.periodStart, 29);
		next.consumeStart = firstValid(d?.consumeStart, settings.consumeStart, next.periodStart, prev.consumeStart,
			next.periodStart);
		next.consumeEnd = firstValid(d?.consumeEnd, settings.consumeEnd, next.periodEnd, prev.consumeEnd, next
			.periodEnd);
		if (!validISO(next.consumeStart)) next.consumeStart = next.periodStart;
		if (!validISO(next.consumeEnd) || next.consumeEnd < next.consumeStart) next.consumeEnd = next.periodEnd;
		next.scheduleStart = firstValid(d?.scheduleStart, settings.scheduleStart, prev.scheduleStart, next
			.periodStart);
		next.scheduleEnd = firstValid(d?.scheduleEnd, settings.scheduleEnd, prev.scheduleEnd, next.periodEnd);
		if (!validISO(next.scheduleStart)) next.scheduleStart = next.periodStart;
		if (!validISO(next.scheduleEnd) || next.scheduleEnd < next.scheduleStart) next.scheduleEnd = next.periodEnd;
		next.budget = Number(d?.budget ?? settings.budget ?? prev.budget ?? base.budget);
		if (!Number.isFinite(next.budget)) next.budget = base.budget;
		next.cycleBudgets = d?.cycleBudgets && typeof d.cycleBudgets === 'object' ? d.cycleBudgets : (prev
			.cycleBudgets || {});
		next.categories = Array.isArray(d?.categories) && d.categories.length ? d.categories : (prev.categories
			?.length ? prev.categories : base.categories);
		next.records = Array.isArray(d?.records) ? d.records : [];
		next.records = next.records.map((r, i) => ({
			...r,
			id: r?.id != null ? String(r.id) : String(Date.now() + i),
			date: validISO(r?.date) ? r.date : next.consumeStart,
			amount: Number.isFinite(Number(r?.amount)) ? Number(r.amount) : 0,
			category: r?.category || '其他',
			name: r?.name || ''
		}));
		next.expectedAllocations = d?.expectedAllocations && typeof d.expectedAllocations === 'object' ? d
			.expectedAllocations : {};
		next.expectedAllocationsVersion = Number(d?.expectedAllocationsVersion || 2);
		next.schedule = Object.assign(base.schedule, prev.schedule || {}, d?.schedule || {});
		next.schedule.startDate = firstValid(next.schedule.startDate, next.scheduleStart, next.periodStart, base
			.schedule.startDate);
		next.schedule.overrides = next.schedule.overrides && typeof next.schedule.overrides === 'object' ? next
			.schedule.overrides : {};
		next.schedule.cycle = Array.isArray(next.schedule.cycle) && next.schedule.cycle.length ? next.schedule
			.cycle : base.schedule.cycle;
		next.tools = Array.isArray(d?.tools) ? d.tools : (Array.isArray(prev.tools) ? prev.tools : base.tools);
		return next;
	}

	const cycleKey = (s, e) => `${s}_${e}`;
	if (state.cycleBudgets[cycleKey(state.periodStart, state.periodEnd)] == null) state.cycleBudgets[cycleKey(state
		.periodStart, state.periodEnd)] = Number(state.budget || 0);
	state.budget = Number(state.cycleBudgets[cycleKey(state.consumeStart, state.consumeEnd)] ?? state.budget ?? 0);
	const activeStart = () => state.tab === '排班' ? state.scheduleStart : state.consumeStart;
	const activeEnd = () => state.tab === '排班' ? state.scheduleEnd : state.consumeEnd;
	const activeKey = () => cycleKey(activeStart(), activeEnd());

	function setActiveCycle(s, e) {
		if (state.tab === '排班') {
			state.scheduleStart = s;
			state.scheduleEnd = e;
			state.schedule.selectedDate = ''
		} else {
			state.consumeStart = s;
			state.consumeEnd = e;
			state.budget = Number(state.cycleBudgets[cycleKey(s, e)] ?? state.budget ?? 0)
		}
		state.selectedDate = '';
		save()
	}

	function shiftCycle(delta) {
		const len = Math.max(1, diffDays(activeStart(), activeEnd()));
		const s = addDays(activeStart(), delta * len);
		setActiveCycle(s, addDays(s, len - 1));
		render()
	}

	function cycleBudget() {
		return Number(state.cycleBudgets[cycleKey(state.consumeStart, state.consumeEnd)] ?? state.budget ?? 0)
	}

	function allocationKey() {
		return cycleKey(state.consumeStart, state.consumeEnd)
	}

	function getAlloc() {
		const k = allocationKey();
		if (!state.expectedAllocations[k] || typeof state.expectedAllocations[k] !== 'object' || Array.isArray(state
				.expectedAllocations[k])) state.expectedAllocations[k] = {};
		return state.expectedAllocations[k];
	}

	function buildLockedAllocations(existing = {}) {
		const ds = periodDates();
		const alloc = {};
		if (!ds.length) return alloc;
		const today = todayISO();
		let remaining = cycleBudget();

		// 只从“用户设置的消费周期起始日”开始逐天结算。
		// 历史/当天的预计值一旦形成就锁定；未来日期统一按当天结算后的剩余预算分摊。
		let lastPastIndex = -1;
		for (let i = 0; i < ds.length; i++) {
			const d = ds[i];
			if (d > today) break;
			if (existing[d] != null && Number.isFinite(Number(existing[d]))) {
				alloc[d] = Number(existing[d]);
			} else {
				const daysLeft = ds.length - i;
				alloc[d] = daysLeft > 0 ? Math.max(0, remaining) / daysLeft : 0;
			}
			remaining -= spent(d);
			lastPastIndex = i;
		}

		// 如果今天还没进入本周期，则整个周期按起始日平均；进入周期后只计算今天之后。
		if (lastPastIndex < 0) {
			const v = ds.length > 0 ? Math.max(0, remaining) / ds.length : 0;
			ds.forEach(d => alloc[d] = v);
		} else {
			const futureCount = ds.length - lastPastIndex - 1;
			const v = futureCount > 0 ? Math.max(0, remaining) / futureCount : 0;
			for (let i = lastPastIndex + 1; i < ds.length; i++) alloc[ds[i]] = v;
		}
		return alloc;
	}

	function initAllocations() {
		const k = allocationKey();
		const old = getAlloc();
		const rebuilt = buildLockedAllocations(old);
		state.expectedAllocations[k] = rebuilt;
	}

	function recalcAllocationsFromCycle() {
		const k = allocationKey();
		state.expectedAllocations[k] = buildLockedAllocations({});
	}

	function recalcAfterConsumption(changedDate) {
		const ds = periodDates();
		if (!ds.length) return;
		const k = allocationKey();
		const old = getAlloc();
		const today = todayISO();
		const next = {};

		// 已经发生过的日期（包含今天）的预计金额全部锁定；没有旧值的日期按“周期起始日开始逐天平均”补齐。
		let remaining = cycleBudget();
		let lastPastIndex = -1;
		for (let i = 0; i < ds.length; i++) {
			const d = ds[i];
			if (d > today) break;
			const daysLeft = ds.length - i;
			next[d] = old[d] != null && Number.isFinite(Number(old[d])) ? Number(old[d]) : (daysLeft > 0 ? Math.max(
				0, remaining) / daysLeft : 0);
			remaining -= spent(d);
			lastPastIndex = i;
		}

		if (lastPastIndex < 0) {
			const v = ds.length ? Math.max(0, remaining) / ds.length : 0;
			ds.forEach(d => next[d] = v);
		} else {
			const futureCount = ds.length - lastPastIndex - 1;
			const v = futureCount > 0 ? Math.max(0, remaining) / futureCount : 0;
			for (let i = lastPastIndex + 1; i < ds.length; i++) next[ds[i]] = v;
		}
		state.expectedAllocations[k] = next;
	}

	function expectedForDate(d) {
		if (!d) return null;
		const ds = periodDates();
		if (!ds.includes(d)) return null;
		initAllocations();
		const alloc = getAlloc();
		return alloc[d] == null ? null : Number(alloc[d]);
	}

	function currentExpected() {
		return expectedForDate(todayISO())
	}

	function expectedForDisplayDate(d) {
		return expectedForDate(d)
	}

	let cloudPushTimer = null;
	let cloudBusy = false;
	const rawLocalSave = () => localStorage.setItem(KEY, JSON.stringify(state));

	function cloudPayload() {
		return {
			schemaVersion: 1,
			appVersion: APP_VERSION,
			updatedAt: new Date().toISOString(),
			data: {
				periodStart: state.periodStart,
				periodEnd: state.periodEnd,
				budget: state.budget,
				cycleBudgets: state.cycleBudgets,
				categories: state.categories,
				records: state.records,
				expectedAllocations: state.expectedAllocations,
				expectedAllocationsVersion: state.expectedAllocationsVersion,
				consumeStart: state.consumeStart,
				consumeEnd: state.consumeEnd,
				scheduleStart: state.scheduleStart,
				scheduleEnd: state.scheduleEnd,
				schedule: state.schedule,
				tools: state.tools
			}
		}
	}

	function cloudHeaders() {
		return {
			'Content-Type': 'application/json',
			'X-Access-Key': state.cloud.accessKey
		}
	}
	async function cloudRead() {
		const id = String(state.cloud?.binId || '').trim();
		const key = String(state.cloud?.accessKey || '').trim();
		if (!id || !key) throw new Error('请填写 Bin ID 和 Access Key');
		const r = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(id)}/latest`, {
			headers: {
				'X-Access-Key': key
			}
		});
		if (!r.ok) throw new Error(`读取失败 HTTP ${r.status}`);
		return r.json()
	}
	async function cloudPush() {
		const id = String(state.cloud?.binId || '').trim();
		const key = String(state.cloud?.accessKey || '').trim();
		if (!id || !key) return false;
		const payload = cloudPayload();
		const r = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(id)}`, {
			method: 'PUT',
			headers: cloudHeaders(),
			body: JSON.stringify(payload)
		});
		if (!r.ok) throw new Error(`上传失败 HTTP ${r.status}`);
		state.cloud.lastSync = new Date().toLocaleString('zh-CN', {
			hour12: false
		});
		state.cloud.status = '已连接';
		state.cloud.dirty = false;
		state.cloud.initialized = true;
		rawLocalSave();
		return true
	}
	async function cloudCreateBin() {
		const key = String(state.cloud?.accessKey || '').trim();
		if (!key) throw new Error('请先填写 Access Key');
		const payload = cloudPayload();
		const r = await fetch('https://api.jsonbin.io/v3/b', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Access-Key': key,
				'X-Bin-Private': 'true',
				'X-Bin-Name': '消费记录H5'
			},
			body: JSON.stringify(payload)
		});
		let out = null;
		try {
			out = await r.json()
		} catch (e) {}
		if (!r.ok) throw new Error(out?.message || `创建数据库失败 HTTP ${r.status}`);
		const newId = String(out?.metadata?.id || out?.metadata?.record || '').trim();
		if (!newId) throw new Error('创建成功但没有返回新的 Bin ID');
		state.cloud.binId = newId;
		state.cloud.status = '已连接';
		state.cloud.lastSync = new Date().toLocaleString('zh-CN', {
			hour12: false
		});
		state.cloud.initialized = true;
		state.cloud.dirty = false;
		rawLocalSave();
		return newId;
	}

	function hasLocalUserData() {
		const d = defaultState();
		const localRecords = Array.isArray(state.records) && state.records.length > 0;
		const localTools = Array.isArray(state.tools) && state.tools.length > 0;
		const localOverrides = state.schedule?.overrides && Object.keys(state.schedule.overrides).length > 0;
		const customCats = JSON.stringify(state.categories) !== JSON.stringify(d.categories);
		const changedBudget = Number(state.budget || 0) !== Number(d.budget || 0);
		const changedPeriod = state.periodStart !== d.periodStart || state.periodEnd !== d.periodEnd || state
			.consumeStart !== d.periodStart || state.consumeEnd !== d.periodEnd;
		const cycleKeys = state.cycleBudgets && Object.keys(state.cycleBudgets).length > 1;
		return !!(localRecords || localTools || localOverrides || customCats || changedBudget || changedPeriod ||
			cycleKeys)
	}

	function hasCloudUserData(d) {
		if (!d || typeof d !== 'object') return false;
		const base = defaultState();
		const records = Array.isArray(d.records) && d.records.length > 0;
		const tools = Array.isArray(d.tools) && d.tools.length > 0;
		const overrides = d.schedule?.overrides && Object.keys(d.schedule.overrides).length > 0;
		const cats = JSON.stringify(d.categories || base.categories) !== JSON.stringify(base.categories);
		const budget = Number(d.budget ?? base.budget) !== Number(base.budget);
		const hasPeriod = Boolean(d.periodStart && d.periodEnd);
		const hasConsumePeriod = Boolean(d.consumeStart && d.consumeEnd);
		const period = hasPeriod && (d.periodStart !== base.periodStart || d.periodEnd !== base.periodEnd) ||
			hasConsumePeriod && (d.consumeStart !== base.periodStart || d.consumeEnd !== base.periodEnd);
		return !!(records || tools || overrides || cats || budget || period)
	}

	function scheduleCloudPush() {
		if (!state.cloud?.autoSync || cloudBusy) return;
		clearTimeout(cloudPushTimer);
		cloudPushTimer = setTimeout(async () => {
			cloudBusy = true;
			try {
				await cloudPush()
			} catch (e) {
				state.cloud.status = '同步失败';
				rawLocalSave()
			} finally {
				cloudBusy = false;
				if (state.cloud?.dirty && state.cloud?.autoSync) setTimeout(() => scheduleCloudPush(),
					180);
			}
		}, 700);
	}
	async function cloudPull(reRender = true, quiet = false) {
		if (cloudBusy) return false;
		cloudBusy = true;
		state.cloud.status = '连接中';
		rawLocalSave();
		try {
			const res = await cloudRead();
			const payload = res?.record ?? res;
			const d = payload?.data;
			if (!d) throw new Error('云端数据格式不正确');
			const previous = JSON.parse(JSON.stringify(state));
			Object.assign(state, normalizeCloudData(d, previous));
			state.cloud = Object.assign(state.cloud || {}, {
				binId: '6ac3ab79ffd5d160534f4cc5',
				accessKey: '$2a$10$ef1OKmYSovwETwPIThsBouQdqVGAN.ldYlML6Wi5sDYfa46feUv/.',
				autoSync: true,
				autoPull: true,
				status: '已连接',
				lastSync: new Date().toLocaleString('zh-CN', {
					hour12: false
				}),
				dirty: false,
				initialized: true
			});
			rawLocalSave();
			if (reRender) render();
			return true;
		} catch (e) {
			state.cloud.status = '连接失败';
			rawLocalSave();
			if (!quiet && reRender) alert(e.message || '云端连接失败');
			return false
		} finally {
			cloudBusy = false;
			if (state.cloud?.dirty && state.cloud?.autoSync) setTimeout(() => scheduleCloudPush(), 180)
		}
	}
	async function cloudAutoConnect() {
		if (!state.cloud?.autoPull || !state.cloud?.binId || !state.cloud?.accessKey || cloudBusy) return;
		cloudBusy = true;
		state.cloud.status = '自动连接中';
		rawLocalSave();
		render();
		try {
			const res = await cloudRead();
			const payload = res?.record ?? res;
			const d = payload?.data;
			if (!d) throw new Error('云端数据格式不正确');
			const previous = JSON.parse(JSON.stringify(state));
			const normalized = normalizeCloudData(d, previous);
			// 新 Bin 还是空模板且本机已经有数据：优先保留本机并首次上传，避免自动登录把本机数据覆盖掉。
			if (!hasCloudUserData(d) && hasLocalUserData()) {
				state.cloud.status = '首次同步';
				rawLocalSave();
				cloudBusy = false;
				await cloudPush();
				render();
			} else {
				Object.assign(state, normalized);
				state.cloud = Object.assign(state.cloud || {}, {
					binId: '6ac3ab79ffd5d160534f4cc5',
					accessKey: '$2a$10$ef1OKmYSovwETwPIThsBouQdqVGAN.ldYlML6Wi5sDYfa46feUv/.',
					autoSync: true,
					autoPull: true,
					status: '已连接',
					lastSync: new Date().toLocaleString('zh-CN', {
						hour12: false
					}),
					dirty: false,
					initialized: true
				});
				rawLocalSave();
				render();
			}
		} catch (e) {
			state.cloud.status = '离线 · 使用本机数据';
			rawLocalSave();
			render()
		} finally {
			if (cloudBusy) cloudBusy = false;
			if (state.cloud?.dirty && state.cloud?.autoSync) setTimeout(() => scheduleCloudPush(), 180)
		}
	}
	async function cloudTest(showAlert = true) {
		if (cloudBusy) return;
		cloudBusy = true;
		state.cloud.status = '连接中';
		try {
			await cloudRead();
			state.cloud.status = '已连接';
			state.cloud.lastSync = new Date().toLocaleString('zh-CN', {
				hour12: false
			});
			rawLocalSave();
			if (showAlert) alert('数据库连接成功');
			return true
		} catch (e) {
			state.cloud.status = '连接失败';
			rawLocalSave();
			if (showAlert) alert(e.message || '连接失败');
			return false
		} finally {
			cloudBusy = false;
			render()
		}
	}

	function cloudModal() {
		const c = state.cloud || {};
		const m = modal('云端数据库',
			`<div class="cloud-status-card"><span>连接状态</span><b id="cloudStatus">${escapeHtml(c.status||'自动连接')}</b></div><div class="cloud-auto-card"><b>自动登录</b><small>打开应用后自动读取云端；有修改会自动同步</small></div><label>Bin ID<input id="cloudBinId" value="${escapeHtml(c.binId||'')}" placeholder="JSONBin Bin ID"></label><label>Access Key<input id="cloudAccessKey" value="${escapeHtml(c.accessKey||'')}" placeholder="JSONBin Access Key"></label><label class="cloud-switch"><span><b>自动同步</b><small>新增、删除、修改数据后自动上传</small></span><input id="cloudAuto" type="checkbox" ${c.autoSync!==false?'checked':''}></label><p class="tip">使用 JSONBin v3 的 X-Access-Key。连接信息已保存，不需要每次重新填写。</p>`,
			`<button class="secondary" id="cloudTestBtn">测试连接</button><button class="secondary" id="cloudPullBtn">立即读取</button><button class="primary" id="cloudSaveBtn">保存连接</button>`
			);
		m.querySelector('#cloudTestBtn').onclick = async () => {
			state.cloud.binId = m.querySelector('#cloudBinId').value.trim();
			state.cloud.accessKey = m.querySelector('#cloudAccessKey').value.trim();
			state.cloud.autoSync = m.querySelector('#cloudAuto').checked;
			state.cloud.autoPull = true;
			rawLocalSave();
			await cloudTest(true);
			closeModal(m)
		};
		m.querySelector('#cloudPullBtn').onclick = async () => {
			state.cloud.binId = m.querySelector('#cloudBinId').value.trim();
			state.cloud.accessKey = m.querySelector('#cloudAccessKey').value.trim();
			state.cloud.autoSync = m.querySelector('#cloudAuto').checked;
			state.cloud.autoPull = true;
			rawLocalSave();
			closeModal(m);
			await cloudPull(true, false)
		};
		m.querySelector('#cloudSaveBtn').onclick = async () => {
			state.cloud.binId = m.querySelector('#cloudBinId').value.trim();
			state.cloud.accessKey = m.querySelector('#cloudAccessKey').value.trim();
			state.cloud.autoSync = m.querySelector('#cloudAuto').checked;
			state.cloud.autoPull = true;
			state.cloud.status = '自动连接已开启';
			rawLocalSave();
			closeModal(m);
					render();
					window.scrollTo({top:0, behavior:'smooth'});;
			await cloudAutoConnect()
		}
	}
	const save = () => {
		if (state.cloud) state.cloud.dirty = true;
		rawLocalSave();
		scheduleCloudPush();
	};

	function periodDates() {
		let a = parseDate(activeStart()),
			e = parseDate(activeEnd()),
			out = [];
		if (isNaN(a) || isNaN(e) || a > e) return out;
		for (let d = new Date(a); d <= e; d.setDate(d.getDate() + 1)) out.push(iso(d));
		return out
	}

	function weekday(d) {
		return parseDate(d).getDay();
	}

	function monthLabel(d) {
		const x = parseDate(d);
		return `${x.getFullYear()}年${x.getMonth()+1}月`
	}

	function spent(d) {
		return state.records.filter(r => r.date === d).reduce((s, r) => s + Number(r.amount || 0), 0)
	}

	function totalSpent() {
		return state.records.reduce((s, r) => s + Number(r.amount || 0), 0)
	}

	function periodSpent() {
		const ds = new Set(periodDates());
		return state.records.filter(r => ds.has(r.date)).reduce((s, r) => s + Number(r.amount || 0), 0)
	}

	function remaining() {
		return cycleBudget() - periodSpent()
	}

	function futureDays() {
		return periodDates().filter(d => d >= todayISO()).length || 1
	}

	function dailyEstimate() {
		return expectedForDisplayDate(state.selectedDate || todayISO())
	}

	function escapeHtml(s) {
		return String(s ?? '').replace(/[&<>'"]/g, c => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			"'": '&#39;',
			'"': '&quot;'
		} [c]))
	}

	function dateText(d) {
		const x = parseDate(d);
		return `${x.getMonth()+1}/${x.getDate()}`
	}

	function moneyCal(n) {
		const v = Number(n || 0);
		if (v >= 10000) return '¥' + (v / 10000).toFixed(1) + 'w';
		if (v >= 1000) return '¥' + (v / 1000).toFixed(1) + 'k';
		return '¥' + Math.round(v);
	}

	function daysGrid() {
		const ds = periodDates();
		if (!ds.length) return '<div class="empty">请先设置有效消费周期</div>';
		initAllocations();
		const alloc = getAlloc();
		let html = '';
		for (const d of ds) {
			const amount = spent(d),
				expected = alloc[d] == null ? null : Number(alloc[d]),
				hasSpend = amount > 0,
				sel = state.selectedDate === d ? ' selected' : '',
				today = d === todayISO() ? ' today' : '',
				pastZero = d < todayISO() && !hasSpend;
			const over = expected != null && amount > expected + 0.005;
			const status = over ? ' over' : (hasSpend ? ' spent' : (pastZero ? ' past-zero' : ' no-spend'));
			const face = hasSpend ? (over ? '😣' : '😊') : '🥺';
			const faceClass = over ? 'day-face face-wobble' : 'day-face';
			html +=
				`<button class="day expense-day${status}${sel}${today}" data-date="${d}"><div class="day-top"><b>${dateText(d)}</b></div><div class="${faceClass}">${face}</div><strong class="day-actual">${moneyCal(amount)}</strong></button>`;
		}
		return html;
	}

	function cycleNav(label) {
		return `<div class="cycle-nav"><button class="cycle-arrow" data-cycle="-1" aria-label="上一周期">‹</button><div><b>${monthLabel(activeStart())} · ${label}</b></div><button class="cycle-arrow" data-cycle="1" aria-label="下一周期">›</button></div>`
	}

	function categoryIcon(c) {
		return ({
			'购物': '🛍️',
			'加油': '⛽',
			'停车': '🅿️',
			'买菜': '🥬',
			'餐饮': '🍜',
			'交通': '🚌',
			'生活': '🏠',
			'娱乐': '🎮',
			'其他': '🏷️'
		})[c] || '🏷️'
	}

	function recordList() {
		const currentSet = new Set(periodDates());
		const rs = (state.selectedDate ? state.records.filter(r => r.date === state.selectedDate) : state.records
			.filter(r => currentSet.has(r.date))).slice().sort((a, b) => {
				const dc = b.date.localeCompare(a.date);
				return dc !== 0 ? dc : b.id.localeCompare(a.id);
			});
		if (!rs.length) return '<div class="empty">暂无消费记录</div>';
		return rs.map(r => {
			const cat = r.category || '其他',
				icon = categoryIcon(cat);
			return `<article class="record" data-id="${r.id}"><div class="record-icon">${icon}</div><div class="record-main"><b>${escapeHtml(r.name||'未命名消费')}</b><div class="record-meta"><span>${escapeHtml(r.date)}</span><span>${escapeHtml(cat)}</span></div></div><strong class="record-amount">${money(r.amount)}</strong><button class="trash" data-delete-expense="${r.id}" aria-label="删除消费">🗑️</button></article>`
		}).join('')
	}

	function shiftFor(date) {
		if (state.schedule.overrides && state.schedule.overrides[date]) return state.schedule.overrides[date];
		if (state.schedule.mode === 'normal') return [1, 2, 3, 4, 5].includes(weekday(date)) ? '白班' : '休';
		const n = diffDays(state.schedule.startDate, date);
		const idx = ((n - 1) % state.schedule.cycle.length + state.schedule.cycle.length) % state.schedule.cycle
			.length;
		return state.schedule.cycle[idx] || '休'
	}

	function shiftCalendar() {
		const ds = periodDates();
		if (!ds.length) return '';
		const today = todayISO();
		let html = Array((weekday(ds[0]) + 6) % 7).fill('<span class="blank"></span>').join('');
		for (const d of ds) {
			const sh = shiftFor(d),
				shortSh = sh === '白班' ? '白' : sh === '夜班' ? '夜' : sh,
				todayClass = d === today ? ' today' : '',
				selected = state.schedule.selectedDate === d ? ' selected' : '';
			html +=
				`<button class="day shift ${sh==='休'?'rest':''}${todayClass}${selected}" data-shift-date="${d}"><div class="day-top"><b>${dateText(d)}</b></div><span>${shortSh}</span></button>`
		}
		return html
	}

	function currentShift() {
		return shiftFor(todayISO())
	}

	function timeProgress() {
		const sh = currentShift(),
			now = new Date();
		if (sh === '休') return 0;
		const [aH, aM] = (sh === '白班' ? state.schedule.dayStart : state.schedule.nightStart).split(':').map(Number);
		const [bH, bM] = (sh === '白班' ? state.schedule.dayEnd : state.schedule.nightEnd).split(':').map(Number);
		const start = aH * 60 + aM,
			endRaw = bH * 60 + bM,
			cur = now.getHours() * 60 + now.getMinutes();
		if (endRaw > start) return cur < start ? 0 : Math.max(0, Math.min(100, ((cur - start) / (endRaw - start)) *
			100));
		if (cur >= start) return Math.max(0, Math.min(100, ((cur - start) / ((endRaw + 1440) - start)) * 100));
		if (cur < endRaw) return Math.max(0, Math.min(100, ((cur + 1440 - start) / ((endRaw + 1440) - start)) *
			100));
		return 0
	}

	function isAfterShiftEnd(sh, dateObj = new Date()) {
		if (sh === '休') return false;
		const end = (sh === '白班' ? state.schedule.dayEnd : state.schedule.nightEnd) || '00:00';
		const [h, m] = end.split(':').map(Number);
		const cur = dateObj.getHours() * 60 + dateObj.getMinutes();
		const endMin = h * 60 + m;
		if (sh === '夜班' && state.schedule.nightEnd < state.schedule.nightStart) {
			// 跨天夜班（如20:00→次日08:00）：当天08:00-20:00是待上班时段，
			// 夜班结束是次日，当天不存在"已下班"状态，应显示夜班动画
			return false;
		}
		return cur >= endMin;
	}

	function nav() {
		return `<nav>${[['消费','⌂'],['排班','▦'],['工具','⌘'],['设置','⚙']].map(([x,ic])=>`<button class="${state.tab===x?'on':''}" data-tab="${x}"><i>${ic}</i><span>${x}</span></button>`).join('')}</nav>`
	}

	function header(title, action = '') {
		return `<header><div><h1>${title}</h1><p>${title==='消费'?'记录每一笔，让预算更清楚':title==='排班'?'今天上什么班，一眼就知道':title==='工具'?'常用网址，一点即达':'像手机系统设置一样简单'}</p></div>${action}</header>`
	}

	function renderTools() {
		return `<main class="page-main tools-page"><div class="page-topbar"><div><h2 class="tools-title">工具</h2><small>常用网址，一点即达</small></div><button class="text-btn" id="addTool">＋ 添加</button></div><section class="card"><div class="tools-grid">${state.tools.length?state.tools.map(t=>`<button class="tool-card" data-tool="${escapeHtml(t.id)}"><span>${escapeHtml(t.icon||'🔗')}</span><b>${escapeHtml(t.name||'未命名工具')}</b><small>${escapeHtml(t.url||'')}</small></button>`).join(''):'<div class="empty">暂无工具，点击右上角添加</div>'}</div><div class="hint">长按工具可删除</div></section></main>`
	}

	function categoryModal() {
		const m = modal('消费分类',
			`<div class="category-list">${state.categories.map(c=>`<div class="category-row"><span>${escapeHtml(categoryIcon(c))} ${escapeHtml(c)}</span><button data-del-cat="${escapeHtml(c)}">删除</button></div>`).join('')}</div><div class="add-line"><input id="newCat" placeholder="新增分类"><button id="addCatBtn">添加</button></div>`
			);
		m.querySelectorAll('[data-del-cat]').forEach(b => b.onclick = () => {
			if (state.categories.length <= 1) return;
			state.categories = state.categories.filter(x => x !== b.dataset.delCat);
			save();
			categoryModalReplace(m)
		});
		m.querySelector('#addCatBtn').onclick = () => {
			const v = m.querySelector('#newCat').value.trim();
			if (v && !state.categories.includes(v)) {
				state.categories.push(v);
				save();
				categoryModalReplace(m)
			}
		}
	}

	function categoryModalReplace(oldModal) {
	oldModal.remove();
	categoryModal()
}

function modal(title, body, footer = '') {
	const overlay = document.createElement('div');
	overlay.className = 'modal-mask';
	overlay.innerHTML = `<div class="modal"><div class="modal-head"><b>${title}</b><button class="close" data-close>×</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-actions">${footer}</div>` : ''}</div>`;
	document.body.appendChild(overlay);
	overlay.addEventListener('click', e => {
		if (e.target === overlay || e.target.closest('[data-close]')) closeModal(overlay);
	});
	
	return overlay;
}

function closeModal(el) {
	if (!el) return;
	el.classList.add('closing');
	setTimeout(() => el.remove(), 220);
}

function editShift(date) {
	const current = shiftFor(date),
		options = ['白班', '夜班', '休', '早班', '中班', '晚班'];
	const m = modal(dateText(date) + ' 班次',
		`<div class="shift-options">${options.map(x=>`<button class="${x===current?'on':''}" data-pick="${x}">${x}</button>`).join('')}</div><button class="clear-override" id="autoShift">恢复自动排班</button>`
	);
	m.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
		state.schedule.overrides[date] = b.dataset.pick;
		save();
		closeModal(m);
		render();
	});
	m.querySelector('#autoShift').onclick = () => {
		delete state.schedule.overrides[date];
		save();
		closeModal(m);
		render();
	};
}

function expenseModal(id = null, originEl = null) {
	const r = id ? state.records.find(x => x.id === id) : null;
	const m = modal(id ? '编辑消费' : '添加消费',
		'<label>消费物品名称 <span class="optional">可不填</span><input id="eName" value="' + escapeHtml(r?.name||'') + '" placeholder="例如：午餐、加油、买菜"></label>' +
		'<div class="expense-grid expense-main-row">' +
		'<label>金额<input id="eAmount" type="text" readonly class="amount-input" value="' + (r?.amount||'') + '" placeholder="请输入金额"></label>' +
		'<label>分类<input id="eCat" type="text" readonly class="cat-input" value="' + escapeHtml(r?.category||'') + '" placeholder="请选择分类"></label>' +
		'</div>' +
		'<label class="expense-date-row">日期<div class="date-row"><input id="eDate" type="date" value="' + (r?.date||todayISO()) + '"><button type="button" class="today-btn" id="eDateToday">今日</button></div></label>',
		'<button class="secondary" data-close>取消</button>' + (id?'<button class="danger" id="deleteExpense">删除</button>':'') + '<button class="primary" id="saveExpense">保存</button>'
	);
	const num = m.querySelector('#eAmount');
	const catInput = m.querySelector('#eCat');
	num.addEventListener('focus', () => num.blur());
	catInput.addEventListener('focus', () => catInput.blur());

	// ===== 完全独立的小键盘弹窗，不用modal函数 =====
	let kp = null;
	function closeKp() {
		if (kp && kp.parentNode) kp.parentNode.removeChild(kp);
		kp = null;
	}
	function openKp() {
		if (kp) return;
		kp = document.createElement('div');
		kp.className = 'kp-overlay';
		kp.innerHTML =
			'<div class="kp-box">' +
				'<div class="kp-head"><span id="kpTitle">输入金额</span><button class="kp-x" id="kpX">×</button></div>' +
				'<div class="kp-body" id="kpBody"></div>' +
			'</div>';
		document.body.appendChild(kp);
		showAmountPanel();
		kp.querySelector('#kpX').onclick = closeKp;
		kp.addEventListener('click', (e) => { if (e.target === kp) closeKp(); });
	}
	function showAmountPanel() {
		const amount = num.value || '';
		kp.querySelector('#kpTitle').textContent = '输入金额';
		const body = kp.querySelector('#kpBody');
		body.innerHTML =
			'<div class="kp-display" id="kpDisp">' + (amount || '0') + '</div>' +
			'<div class="kp-keys">' +
				'<button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button>' +
				'<button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button>' +
				'<button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button>' +
				'<button data-k=".">.</button><button data-k="0">0</button><button data-k="back">⌫</button>' +
				'<button data-k="next" class="kp-ok">下一步</button>' +
			'</div>';
		const disp = body.querySelector('#kpDisp');
		// 数字键用 pointerdown，支持连续快速输入
		body.querySelectorAll('[data-k]:not([data-k="next"])').forEach(btn => {
			btn.addEventListener('pointerdown', (e) => {
				e.preventDefault();
				const k = btn.dataset.k;
				let v = num.value || '';
				if (k === 'back') v = v.slice(0, -1);
				else if (k === '.') { if (!v.includes('.')) v += '.'; }
				else {
					if (v.includes('.')) { const p = v.split('.'); if (p[1].length < 2) v += k; }
					else { if (v.length < 8) v += k; }
				}
				num.value = v;
				disp.textContent = v || '0';
			});
		});
		// 下一步按钮用 click，避免切换面板后误触分类
		const nextBtn = body.querySelector('[data-k="next"]');
		if (nextBtn) nextBtn.onclick = () => {
			const v = num.value || '';
			if (!v || parseFloat(v) <= 0) { alert('请输入金额'); return; }
			showCatPanel();
		};
	}
	function showCatPanel() {
		kp.querySelector('#kpTitle').textContent = '选择分类';
		const body = kp.querySelector('#kpBody');
		body.innerHTML =
			'<div class="kp-cats">' +
				state.categories.map(cat =>
					'<button class="kp-cat" data-cat="' + escapeHtml(cat) + '">' + categoryIcon(cat) + ' ' + escapeHtml(cat) + '</button>'
				).join('') +
			'</div>' +
			'<button class="kp-back" id="kpBack">← 返回金额</button>';
		body.querySelectorAll('.kp-cat').forEach(btn => {
			btn.onclick = () => {
				catInput.value = btn.dataset.cat;
				// 显示成功动画
				const body2 = kp.querySelector('#kpBody');
				body2.innerHTML = '<div class="kp-success"><div id="kpSuccessAnim"></div></div>';
				kp.querySelector('.kp-head').style.display = 'none';
				if (window.lottie) {
					lottie.loadAnimation({
						container: document.getElementById('kpSuccessAnim'),
						renderer: 'svg',
						loop: false,
						autoplay: true,
						path: 'Success.json'
					});
				}
				setTimeout(closeKp, 1200);
			};
		});
		body.querySelector('#kpBack').onclick = showAmountPanel;
	}
	num.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); num.blur(); openKp(); });

	// 关闭添加消费弹窗时关掉小键盘
	const origClose = closeModal;
	closeModal = function(el) {
		closeKp();
		origClose(el);
	};

	// ===== 今日按钮 =====
	const todayBtn = m.querySelector('#eDateToday');
	const dateInput = m.querySelector('#eDate');
	if (todayBtn && dateInput) {
		const updateTodayBtn = () => {
			if (dateInput.value === todayISO()) {
				todayBtn.textContent = '已选今日';
				todayBtn.classList.add('on');
				todayBtn.style.display = '';
			} else {
				todayBtn.style.display = 'none';
			}
		};
		todayBtn.addEventListener('click', () => { dateInput.value = todayISO(); updateTodayBtn(); });
		dateInput.addEventListener('change', updateTodayBtn);
		updateTodayBtn();
	}

	// ===== 保存/删除 =====
	if (id) m.querySelector('#deleteExpense').onclick = () => {
		state.records = state.records.filter(x => x.id !== id);
		recalcAfterConsumption(r.date);
		save();
		closeModal(m);
		render();
	};
	m.querySelector('#saveExpense').onclick = () => {
		const amount = parseFloat(num.value);
		if (!amount || amount <= 0) { alert('请输入有效金额'); return; }
		const cat = catInput.value.trim();
		if (!cat) { alert('请选择分类'); return; }
		const name = m.querySelector('#eName').value.trim();
		const date = dateInput.value;
		if (id) {
			const old = state.records.find(x => x.id === id);
			if (old) { old.name = name; old.amount = amount; old.category = cat; old.date = date; }
			recalcAfterConsumption(r.date);
		} else {
			state.records.push({ id: Date.now().toString(), name, amount, category: cat, date });
			recalcAfterConsumption(date);
		}
		save();
		closeModal(m);
		render();
	};
}

function consumeSettingsModal() {
	const m = modal('消费设置',
		`<button class="setting-item" id="mPeriod"><span class="setting-icon">📅</span><div><b>消费周期</b><small>${state.consumeStart} 至 ${state.consumeEnd}</small></div><em>›</em></button><button class="setting-item" id="mBudget"><span class="setting-icon">💰</span><div><b>周期可使用</b><small>${money(cycleBudget())}</small></div><em>›</em></button><button class="setting-item" id="mCategory"><span class="setting-icon">🏷</span><div><b>消费分类</b><small>${state.categories.length} 个分类</small></div><em>›</em></button>`
	);
	m.querySelector('#mPeriod').onclick = () => { closeModal(m); periodModal(); };
	m.querySelector('#mBudget').onclick = () => { closeModal(m); budgetModal(); };
	m.querySelector('#mCategory').onclick = () => { closeModal(m); categoryModal(); };
}

function budgetModal() {
	const cur = Math.min(cycleBudget(), 5000);
	const max = 5000;
	const marks = [0, 1000, 2000, 3000, 4000, 5000];
	let curVal = cur;

	const m = modal('周期预算',
		'<div class="budget-setting">' +
			'<div class="budget-amount" id="bAmountDisplay">¥' + curVal.toLocaleString() + '</div>' +
			'<div class="budget-slider" id="bSlider">' +
				'<div class="budget-track"><div class="budget-fill" id="bFill"></div></div>' +
				'<div class="budget-marks">' +
					marks.map(v => '<div class="budget-mark" data-val="' + v + '" style="left:' + (v/max*100) + '%">' +
						'<div class="budget-mark-dot"></div>' +
						'<span>' + (v === 0 ? '0' : v/1000 + 'k') + '</span>' +
					'</div>').join('') +
				'</div>' +
			'</div>' +
			
		'</div>',
		'<button class="secondary" data-close>取消</button><button class="primary" id="saveBudget">保存</button>'
	);

	const slider = m.querySelector('#bSlider');
	const fill = m.querySelector('#bFill');
	const display = m.querySelector('#bAmountDisplay');
	let dragging = false;

	function updateUI(v) {
		curVal = Math.max(0, Math.min(max, v));
		fill.style.width = (curVal / max * 100) + '%';
		display.textContent = '¥' + curVal.toLocaleString();
		slider.querySelectorAll('.budget-mark').forEach(mk => {
			mk.classList.toggle('active', parseInt(mk.dataset.val) === curVal);
		});
	}
	updateUI(curVal);

	function getValFromEvent(e) {
		const rect = slider.getBoundingClientRect();
		const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
		const pct = Math.max(0, Math.min(1, x / rect.width));
		return Math.round(pct * max / 100) * 100;
	}

	// 统一用pointerdown处理点击和拖动
	slider.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		dragging = true;
		updateUI(getValFromEvent(e));
	});
	document.addEventListener('pointermove', (e) => {
		if (!dragging) return;
		updateUI(getValFromEvent(e));
	});
	document.addEventListener('pointerup', () => { dragging = false; });

	m.querySelector('#saveBudget').onclick = () => {
		const v = curVal;
		if (isNaN(v) || v < 0) { alert('请输入有效金额'); return; }
		const k = cycleKey(state.consumeStart, state.consumeEnd);
		state.cycleBudgets = state.cycleBudgets || {};
		state.cycleBudgets[k] = v;
		state.budget = v;
		save();
		closeModal(m);
		render();
	};
}

function heroAnimModal() {
	const modes = [
		{ id: 'connect', name: '粒子连线', desc: '彩色粒子漂浮，距离近时自动连线', icon: '🔗' },
		{ id: 'bubble', name: '气泡上升', desc: '彩色气泡从底部缓缓上升，左右轻摆', icon: '🫧' },
		{ id: 'firework', name: '迷你烟花', desc: '周期性在卡片中绽放彩色小烟花', icon: '🎆' },
		{ id: 'morph', name: '3D形状变形', desc: '粒子在球体/星系/圆环/立方体间变形', icon: '🔮' },
		{ id: 'off', name: '关闭动画', desc: '纯净背景，无粒子效果', icon: '🚫' }
	];
	let current = 'connect';
	try { current = JSON.parse(localStorage.getItem('heroAnimMode') || '"connect"'); } catch(e) {}
	const m = modal('剩余金额动画',
		'<div class="anim-mode-list">' +
			modes.map(mode =>
				'<button class="anim-mode-item' + (current === mode.id ? ' active' : '') + '" data-mode="' + mode.id + '">' +
					'<span class="anim-mode-icon">' + mode.icon + '</span>' +
					'<div class="anim-mode-info"><b>' + mode.name + '</b><small>' + mode.desc + '</small></div>' +
					'<span class="anim-mode-check">' + (current === mode.id ? '✓' : '') + '</span>' +
				'</button>'
			).join('') +
		'</div>',
		'<button class="secondary" data-close>关闭</button>'
	);
	m.querySelectorAll('.anim-mode-item').forEach(btn => {
		btn.onclick = () => {
			const mode = btn.dataset.mode;
			localStorage.setItem('heroAnimMode', JSON.stringify(mode));
			window.dispatchEvent(new CustomEvent('heroAnimModeChanged', { detail: { mode: mode } }));
			m.querySelectorAll('.anim-mode-item').forEach(b => {
				b.classList.toggle('active', b.dataset.mode === mode);
				b.querySelector('.anim-mode-check').textContent = b.dataset.mode === mode ? '✓' : '';
			});
			const label = document.getElementById('heroAnimCurrent');
			if (label) {
				const found = modes.find(md => md.id === mode);
				label.textContent = found ? found.name : mode;
			}
			setTimeout(() => closeModal(m), 300);
		};
	});
}

function scheduleModal() {
	const m = modal('排班设置',
		`<div class="setting-group"><div class="group-title">排班模式</div><div class="shift-mode-row"><button class="${state.schedule.mode==='normal'?'on':''}" data-mode="normal">正常班</button><button class="${state.schedule.mode==='shift'?'on':''}" data-mode="shift">倒班</button></div></div>${state.schedule.mode==='shift'?`<label>倒班周期（逗号分隔）<input id="sCycle" value="${(state.schedule.cycle||[]).join(',')}" placeholder="白班,夜班,休"></label><label>周期开始日期<input id="sStart" type="date" value="${state.schedule.startDate||todayISO()}"></label>`:''}`,
		`<button class="secondary" data-close>取消</button><button class="primary" id="saveSchedule">保存</button>`
	);
	m.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
		m.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('on'));
		b.classList.add('on');
	});
	m.querySelector('#saveSchedule').onclick = () => {
		const mode = m.querySelector('[data-mode].on')?.dataset.mode || 'normal';
		state.schedule.mode = mode;
		if (mode === 'shift') {
			state.schedule.cycle = m.querySelector('#sCycle').value.split(',').map(s => s.trim()).filter(Boolean);
			state.schedule.startDate = m.querySelector('#sStart').value;
		}
		save();
		closeModal(m);
		render();
	};
}

function addToolModal() {
	const m = modal('添加工具',
		`<div class="tool-icon-picks"><button data-icon="🔎">🔎</button><button data-icon="💰">💰</button><button data-icon="📊">📊</button><button data-icon="🔗">🔗</button><button data-icon="🧰">🧰</button></div><label>名称<input id="tName" placeholder="例如：币安、邮箱、公司系统"></label><label>网址<input id="tUrl" placeholder="https://"></label>`,
		`<button class="secondary" data-close>取消</button><button class="primary" id="saveTool">添加</button>`);
	let icon = '🔗';
	m.querySelectorAll('[data-icon]').forEach(b => b.onclick = () => {
		icon = b.dataset.icon;
		m.querySelectorAll('[data-icon]').forEach(x => x.classList.remove('on'));
		b.classList.add('on');
	});
	m.querySelector('#saveTool').onclick = () => {
		let u = m.querySelector('#tUrl').value.trim();
		if (!u) return alert('请输入网址');
		if (!new RegExp('^https?://', 'i').test(u)) u = 'https://' + u;
		state.tools.push({
			id: Date.now().toString(),
			name: m.querySelector('#tName').value.trim() || '未命名工具',
			url: u,
			icon
		});
		save();
		closeModal(m);
		render();
	};
}

function periodModal() {
	const m = modal('消费周期',
		`<label>开始日期<input id="pStart" type="date" value="${state.consumeStart}"></label><label>结束日期<input id="pEnd" type="date" value="${state.consumeEnd}"></label>`,
		`<button class="secondary" data-close>取消</button><button class="primary" id="savePeriod">保存</button>`
	);
	m.querySelector('#savePeriod').onclick = () => {
		const s = m.querySelector('#pStart').value;
		const e = m.querySelector('#pEnd').value;
		if (!s || !e || s > e) { alert('请选择有效日期范围'); return; }
		setActiveCycle(s, e);
		closeModal(m);
		render();
	};
}

var __lastBalance = null;
	function updateNavIndicator() {
		const navEl = document.querySelector('nav');
		const indicator = navEl?.querySelector('.nav-indicator');
		const active = navEl?.querySelector('button.on');
		if (navEl && indicator && active) {
			requestAnimationFrame(() => {
				indicator.style.left = active.offsetLeft + 'px';
				indicator.style.width = active.offsetWidth + 'px';
			});
		}
	}
	function render() {
		let body = '';
		if (state.tab === '消费') body = renderConsume();
		else if (state.tab === '排班') body = renderSchedule();
		else if (state.tab === '工具') body = renderTools();
		else if (state.tab === '设置') body = renderSettings();
		else body = renderConsume();
		document.getElementById('app').innerHTML = body + nav();
		bind();
		updateNavIndicator();
		if (state.tab === '消费') {
			var curBal = remaining();
			if (__lastBalance !== null && curBal !== __lastBalance) {
				window.dispatchEvent(new CustomEvent('balanceChanged'));
			}
			__lastBalance = curBal;
		}
	}

	function renderSettings() {
		return `<main class="page-main"><div class="page-topbar"><div class="page-period">设置</div></div>
	<section class="setting-group"><div class="group-title">消费</div><button class="setting-item" id="openCategorySetting"><span class="setting-icon">🏷</span><div><b>消费分类</b><small>${state.categories.length} 个分类</small></div><em>›</em></button><button class="setting-item" id="openBudgetSetting"><span class="setting-icon">💰</span><div><b>周期预算</b><small>${money(cycleBudget())}</small></div><em>›</em></button><button class="setting-item" id="openPeriodSetting"><span class="setting-icon">📅</span><div><b>消费周期</b><small>${state.consumeStart} 至 ${state.consumeEnd}</small></div><em>›</em></button></section>
	<section class="setting-group"><div class="group-title">排班</div><button class="setting-item" id="openScheduleSetting"><span class="setting-icon">🗓</span><div><b>排班设置</b><small>${state.schedule.mode === 'shift' ? '倒班模式' : '正常班模式'}</small></div><em>›</em></button></section>
	<section class="setting-group"><div class="group-title">数据</div><button class="setting-item" id="openCloudSetting"><span class="setting-icon">☁️</span><div><b>云同步</b><small>${state.cloud.status}</small></div><em>›</em></button><button class="setting-item danger" id="openReset"><span class="setting-icon">⚠️</span><div><b>恢复默认数据</b><small>清除本机测试记录</small></div><em>›</em></button></section>
	<section class="setting-group"><div class="group-title">动画与特效</div><button class="setting-item" id="openHeroAnimSetting"><span class="setting-icon">✨</span><div><b>剩余金额动画</b><small id="heroAnimCurrent">粒子连线</small></div><em>›</em></button><button class="setting-item" id="openSnakeSetting"><span class="setting-icon">🐍</span><div><b>小蛇设置</b><small>速度、长度、颜色</small></div><em>›</em></button></section>
	<section class="setting-group"><div class="group-title">关于</div><div class="setting-item"><span class="setting-icon">📌</span><div><b>版本</b><small>点击刷新</small></div><button class="version-btn" id="versionRefresh">${APP_VERSION}</button></div></section>
	</main>`;
	}

	function renderConsume() {
		const rem = remaining(),
			pct = cycleBudget() ? Math.max(0, Math.min(100, rem / cycleBudget() * 100)) : 0;
		const displayDate = state.selectedDate || todayISO(),
			displayActual = spent(displayDate),
			displayExpected = expectedForDisplayDate(displayDate),
			displayOver = displayExpected != null && displayActual > displayExpected + 0.005;
		const barClass = pct > 50 ? 'green' : pct > 20 ? 'yellow' : 'red';
		return `<main class="page-main"><div class="page-topbar"><div class="page-period">${activeStart()} 至 ${activeEnd()}</div><button class="top-setting" id="consumeSettings">⚙</button></div>
<section class="hero-card" id="heroCard"><div class="hero-bg-animate" aria-hidden="true"></div><div class="hero-top"><div><small>本周期剩余金额</small><strong>${money(rem)}</strong></div></div><div class="budget-bar ${barClass}"><i style="width:${pct}%"></i></div><div class="hero-foot"><span>剩余 ${futureDays()} 天</span><span>剩余 ${fmt(pct)}%</span></div></section>
	<div class="stats"><button class="stat-card" id="periodBudgetCard"><small>周期可使用</small><b>${money(cycleBudget())}</b><span>点击修改金额</span></button><button class="stat-card daily-card" id="dailyStatCard"><small>每日消费 · ${dateText(displayDate)}</small><div class="daily-values"><div><em>预计</em><b>${displayExpected==null?'—':money(displayExpected)}</b></div><div class="daily-divider"></div><div class="${displayOver?'danger-text':''}"><em>实际</em><b>${money(displayActual)}</b></div></div></button><button class="stat-card actual-card"><div class="actual-head"><small>实际消费</small><span>${state.records.filter(r=>periodDates().includes(r.date)).length} 笔</span></div><b>${money(periodSpent())}</b><em>当前周期累计</em></button></div>
<section class="card calendar-card"><div class="section-head">${cycleNav('消费周期')}</div><div class="calendar">${daysGrid()}</div></section>
<section class="card" id="expenseDetailSection"><div class="section-head"><div><h2>${state.selectedDate?dateText(state.selectedDate)+' 消费明细':'消费明细'}</h2><small>${state.selectedDate?'当前仅显示当天':'当前周期记录按日期倒序'}</small></div></div>${recordList()}</section><button class="fab" id="addExpense">＋</button></main>`
	}

	function updateDateSelection() {
	const displayDate = state.selectedDate || todayISO(),
		displayActual = spent(displayDate),
		displayExpected = expectedForDisplayDate(displayDate),
		displayOver = displayExpected != null && displayActual > displayExpected + 0.005;
	// 更新日期格子选中状态
	document.querySelectorAll('[data-date]').forEach(b => {
		b.classList.toggle('selected', b.dataset.date === state.selectedDate);
	});
	// 更新每日消费统计卡片
	const dailyCard = document.getElementById('dailyStatCard');
	if (dailyCard) {
		dailyCard.innerHTML = '<small>每日消费 · ' + dateText(displayDate) + '</small><div class="daily-values"><div><em>预计</em><b>' + (displayExpected==null?'—':money(displayExpected)) + '</b></div><div class="daily-divider"></div><div class="' + (displayOver?'danger-text':'') + '"><em>实际</em><b>' + money(displayActual) + '</b></div></div>';
	}
	// 更新消费明细
	const detailSection = document.getElementById('expenseDetailSection');
	if (detailSection) {
		detailSection.innerHTML = '<div class="section-head"><div><h2>' + (state.selectedDate?dateText(state.selectedDate)+' 消费明细':'消费明细') + '</h2><small>' + (state.selectedDate?'当前仅显示当天':'当前周期记录按日期倒序') + '</small></div></div>' + recordList();
	}
	// 重新绑定事件
	bindExpenseListEvents();
}

function updateAfterExpenseChange() {
	const rem = remaining(),
		pct = cycleBudget() ? Math.max(0, Math.min(100, rem / cycleBudget() * 100)) : 0;
	const barClass = pct > 50 ? 'green' : pct > 20 ? 'yellow' : 'red';
	const displayDate = state.selectedDate || todayISO(),
		displayActual = spent(displayDate),
		displayExpected = expectedForDisplayDate(displayDate),
		displayOver = displayExpected != null && displayActual > displayExpected + 0.005;
	const hero = document.getElementById('heroCard');
	if (hero) {
		hero.querySelector('.hero-top strong').textContent = money(rem);
		const bar = hero.querySelector('.budget-bar');
		bar.className = 'budget-bar ' + barClass;
		bar.querySelector('i').style.width = pct + '%';
		hero.querySelector('.hero-foot span:last-child').textContent = '剩余 ' + fmt(pct) + '%';
	}
	const dailyCard = document.getElementById('dailyStatCard');
	if (dailyCard) {
		dailyCard.innerHTML = '<small>每日消费 · ' + dateText(displayDate) + '</small><div class="daily-values"><div><em>预计</em><b>' + (displayExpected==null?'—':money(displayExpected)) + '</b></div><div class="daily-divider"></div><div class="' + (displayOver?'danger-text':'') + '"><em>实际</em><b>' + money(displayActual) + '</b></div></div>';
	}
	const actualCard = document.querySelector('.actual-card');
	if (actualCard) {
		const periodRecords = state.records.filter(r => periodDates().includes(r.date));
		actualCard.querySelector('span').textContent = periodRecords.length + ' 笔';
		actualCard.querySelector('b').textContent = money(periodSpent());
	}
	const detailSection = document.getElementById('expenseDetailSection');
	if (detailSection) {
		detailSection.innerHTML = '<div class="section-head"><div><h2>' + (state.selectedDate?dateText(state.selectedDate)+' 消费明细':'消费明细') + '</h2><small>' + (state.selectedDate?'当前仅显示当天':'当前周期记录按日期倒序') + '</small></div></div>' + recordList();
	}
	bindExpenseListEvents();
}

function bindExpenseListEvents() {
	document.querySelectorAll('.record[data-id]').forEach(r => r.onclick = (e) => {
		if (e.target.closest('.trash')) return;
		expenseModal(r.dataset.id);
	});
	document.querySelectorAll('[data-delete-expense]').forEach(b => b.onclick = () => {
		const id = b.dataset.deleteExpense;
		const old = state.records.find(x => x.id === id);
		if (!old) return;
		const row = b.closest('.record');
		row?.classList.add('expense-delete-out');
		state.records = state.records.filter(x => x.id !== id);
		recalcAfterConsumption(old.date);
		save();
		setTimeout(updateAfterExpenseChange, 220);
	});
}

function renderSchedule() {
	const viewDate = state.schedule.selectedDate && periodDates().includes(state.schedule.selectedDate) ? state.schedule.selectedDate : todayISO();
	const afterWork = viewDate === todayISO() && shiftFor(viewDate) !== '休' && isAfterShiftEnd(shiftFor(viewDate));
	const sh = shiftFor(viewDate),
		p = viewDate === todayISO() ? (afterWork ? 100 : timeProgress()) : 0,
		shiftClass = afterWork ? 'shift-off' : sh === '白班' ? 'shift-day' : sh === '夜班' ? 'shift-night' : 'shift-rest',
		shortSh = afterWork ? '下班' : sh === '白班' ? '白' : sh === '夜班' ? '夜' : '休';
	const progressHtml = (sh === '休' || afterWork) ? '' :
		`<div class="shift-progress"><div class="progress"><i style="width:${p}%"></i></div><div class="progress-foot ${viewDate===todayISO()?'':'only-pct'}">${viewDate===todayISO()?'<span>当前进度</span>':''}<b>${Math.round(p)}%</b></div></div>`;
	return `<main class="page-main"><div class="page-topbar"><div class="page-period">${activeStart()} 至 ${activeEnd()}</div><button class="top-setting" id="scheduleSettings">⚙</button></div><section class="shift-hero ${shiftClass}" id="shiftHeroCard"><div class="shift-world" aria-hidden="true"><div class="world-sky"></div><div class="world-sun"></div><div class="world-moon"></div><div class="world-stars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="world-meteors"><i></i><i></i><i></i></div><div class="world-cloud cloud-a"></div><div class="world-cloud cloud-b"></div><div class="world-birds"><i></i><i></i></div><div class="world-z">Z<span>Z</span><b>Z</b></div><div class="world-offwork" aria-hidden="true">
<div class="offwork-scenery">
  <div class="offwork-sky-shape sky-cloud-1"></div><div class="offwork-sky-shape sky-cloud-2"></div>
  <div class="offwork-horizon horizon-a"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="offwork-horizon horizon-b"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="offwork-road"><span></span><span></span><span></span><span></span><span></span><span></span></div>
</div>
<div class="offwork-car" role="img" aria-label="下班小汽车动画">
  <svg viewBox="0 0 180 86" class="offwork-car-svg" aria-hidden="true">
    <g class="car-exhaust" aria-hidden="true">
      <circle class="exhaust-puff puff-a" cx="14" cy="60" r="2.2"/>
      <circle class="exhaust-puff puff-b" cx="11" cy="63" r="1.7"/>
      <circle class="exhaust-puff puff-c" cx="14" cy="66" r="1.4"/>
    </g>
    <g class="car-body">
      <path d="M25 54h130c7 0 11 4 11 10v4H14v-4c0-6 4-10 11-10Z"/>
      <path d="M45 54 58 34c2-3 5-5 9-5h44c4 0 7 2 10 5l14 20Z"/>
      <path class="car-window" d="M64 34h42c3 0 5 1 7 4l9 13H55l7-13c1-2 2-4 2-4Z"/>
      <path class="car-line" d="M82 34v17M117 39l5 11"/>
      <rect class="car-light" x="151" y="55" width="7" height="5" rx="2"/>
      <rect class="car-light rear" x="22" y="55" width="7" height="5" rx="2"/>
      <rect class="car-bumper" x="9" y="64" width="10" height="5" rx="2"/>
      <rect class="car-bumper" x="158" y="64" width="10" height="5" rx="2"/>
    </g>
    <g class="car-wheel wheel-a"><circle cx="46" cy="70" r="14"/><circle class="wheel-hub" cx="46" cy="70" r="4"/><g class="wheel-spokes"><path d="M46 56v28M32 70h28M36 60l20 20M56 60 36 80"/></g></g>
    <g class="car-wheel wheel-b"><circle cx="137" cy="70" r="14"/><circle class="wheel-hub" cx="137" cy="70" r="4"/><g class="wheel-spokes"><path d="M137 56v28M123 70h28M127 60l20 20M147 60l-20 20"/></g></g>
  </svg>
  <div class="car-exhaust-html" aria-hidden="true"><i class="exhaust-html-puff puff-1"></i><i class="exhaust-html-puff puff-2"></i><i class="exhaust-html-puff puff-3"></i></div>
</div>
</div></div><strong>${shortSh}</strong>${sh==='休'?'<p>今天不用上班，好好休息</p>':afterWork?'<p>收工啦，今天辛苦了</p>':''}${progressHtml}</section><section class="card"><div class="section-head">${cycleNav('排班周期')}</div><div class="schedule-calendar-box"><div class="week">${['一','二','三','四','五','六','日'].map(x=>`<i>${x}</i>`).join('')}</div><div class="calendar">${shiftCalendar()}</div><button class="schedule-lock ${state.schedule.calendarLocked?'on':''}" id="scheduleCalendarLock" aria-label="${state.schedule.calendarLocked?'解锁日期表':'锁定日期表'}">${state.schedule.calendarLocked?'🔒':'🔓'}</button></div><div class="legend"><span>${state.schedule.calendarLocked?'🔒日期表已锁定，点击日期查看动画':'🔓点击日期修改班次'}</span></div></section></main>`;
}

function updateScheduleSelection() {
	const viewDate = state.schedule.selectedDate && periodDates().includes(state.schedule.selectedDate) ? state.schedule.selectedDate : todayISO();
	const afterWork = viewDate === todayISO() && shiftFor(viewDate) !== '休' && isAfterShiftEnd(shiftFor(viewDate));
	const sh = shiftFor(viewDate),
		p = viewDate === todayISO() ? (afterWork ? 100 : timeProgress()) : 0,
		shiftClass = afterWork ? 'shift-off' : sh === '白班' ? 'shift-day' : sh === '夜班' ? 'shift-night' : 'shift-rest',
		shortSh = afterWork ? '下班' : sh === '白班' ? '白' : sh === '夜班' ? '夜' : '休';
	const progressHtml = (sh === '休' || afterWork) ? '' :
		'<div class="shift-progress"><div class="progress"><i style="width:' + p + '%"></i></div><div class="progress-foot ' + (viewDate===todayISO()?'':'only-pct') + '">' + (viewDate===todayISO()?'<span>当前进度</span>':'') + '<b>' + Math.round(p) + '%</b></div></div>';
	document.querySelectorAll('[data-shift-date]').forEach(b => {
		b.classList.toggle('selected', b.dataset.shiftDate === state.schedule.selectedDate);
	});
	const hero = document.getElementById('shiftHeroCard');
	if (hero) {
		hero.className = 'shift-hero ' + shiftClass;
		const strong = hero.querySelector('strong');
		if (strong) strong.textContent = shortSh;
		const pEl = hero.querySelector('p');
		const tipText = sh==='休' ? '今天不用上班，好好休息' : afterWork ? '收工啦，今天辛苦了' : '';
		if (pEl) { pEl.textContent = tipText; pEl.style.display = tipText ? '' : 'none'; }
		const oldProgress = hero.querySelector('.shift-progress');
		if (oldProgress) oldProgress.remove();
		if (progressHtml) hero.insertAdjacentHTML('beforeend', progressHtml);
	}
}

function bind() {
	// 底部导航栏切换
	document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
		state.tab = b.dataset.tab;
		render();
	});
	// 消费页面事件
	document.querySelectorAll('[data-date]').forEach(b => b.onclick = () => {
		state.selectedDate = state.selectedDate === b.dataset.date ? '' : b.dataset.date;
		updateDateSelection();
	});
	document.querySelectorAll('[data-cycle]').forEach(b => b.onclick = () => shiftCycle(Number(b.dataset.cycle)));
	document.getElementById('addExpense')?.addEventListener('click', e => expenseModal(null, e.currentTarget));
	document.getElementById('consumeSettings')?.addEventListener('click', consumeSettingsModal);
	document.getElementById('periodBudgetCard')?.addEventListener('click', budgetModal);
	bindExpenseListEvents();
	document.getElementById('versionRefresh')?.addEventListener('click', () => location.reload());
	// 排班页面事件
	document.getElementById('scheduleSettings')?.addEventListener('click', scheduleModal);
		document.getElementById('scheduleCalendarLock')?.addEventListener('click', () => {
			state.schedule.calendarLocked = !state.schedule.calendarLocked;
			save();
			render()
		});
		document.querySelectorAll('[data-shift-date]').forEach(b => b.onclick = () => {
			const d = b.dataset.shiftDate;
			state.schedule.selectedDate = d;
			save();
			if (state.schedule.calendarLocked) {
				updateScheduleSelection();
			}
			else editShift(d)
		});
		document.getElementById('addTool')?.addEventListener('click', addToolModal);
		document.querySelectorAll('[data-tool]').forEach(b => {
			let timer;
			b.onclick = () => {
				const t = state.tools.find(x => x.id === b.dataset.tool);
				if (t) window.open(t.url, '_blank')
			};
			b.oncontextmenu = e => {
				e.preventDefault();
				const t = state.tools.find(x => x.id === b.dataset.tool);
				if (t && confirm(`删除“${t.name}”？`)) {
					state.tools = state.tools.filter(x => x.id !== t.id);
					save();
					render()
				}
			};
			b.ontouchstart = () => {
				timer = setTimeout(() => {
					const t = state.tools.find(x => x.id === b.dataset.tool);
					if (t && confirm(`删除“${t.name}”？`)) {
						state.tools = state.tools.filter(x => x.id !== t.id);
						save();
						render()
					}
				}, 650)
			};
			b.ontouchend = () => clearTimeout(timer)
		});
		document.getElementById('openCategorySetting')?.addEventListener('click', categoryModal);
		document.getElementById('openBudgetSetting')?.addEventListener('click', budgetModal);
		document.getElementById('openPeriodSetting')?.addEventListener('click', periodModal);
		document.getElementById('openHeroAnimSetting')?.addEventListener('click', heroAnimModal);
		document.getElementById('openSnakeSetting')?.addEventListener('click', () => {
			const anim = JSON.parse(localStorage.getItem('animSettings') || '{}');
			const snake = anim.snake || {};
			const m = modal('小蛇设置',
				'<label>移动速度 <span id="sSpeedVal">' + (snake.speed || 1.2).toFixed(1) + '</span><input id="sSpeed" type="range" min="0.5" max="3" step="0.1" value="' + (snake.speed || 1.2) + '"></label>' +
				'<label>最大长度 <span id="sMaxLenVal">' + (snake.maxLength || 15) + '</span><input id="sMaxLen" type="range" min="3" max="30" step="1" value="' + (snake.maxLength || 15) + '"></label>' +
				'<label>颜色 <input id="sColor" type="color" value="' + (snake.color || '#45b8a0') + '"></label>',
				'<button class="secondary" data-close>关闭</button>'
			);
			m.querySelector('#sSpeed')?.addEventListener('input', function(e) {
				var v = parseFloat(e.target.value);
				var el = document.getElementById('sSpeedVal');
				if (el) el.textContent = v.toFixed(1);
				saveAnimSettings({ snake: { speed: v } });
			});
			m.querySelector('#sMaxLen')?.addEventListener('input', function(e) {
				var v = parseInt(e.target.value);
				var el = document.getElementById('sMaxLenVal');
				if (el) el.textContent = v;
				saveAnimSettings({ snake: { maxLength: v } });
			});
			m.querySelector('#sColor')?.addEventListener('input', function(e) {
				saveAnimSettings({ snake: { color: e.target.value } });
			});
		});		document.getElementById('openScheduleSetting')?.addEventListener('click', scheduleModal);
		document.getElementById('openCloudSetting')?.addEventListener('click', cloudModal);
		document.getElementById('openReset')?.addEventListener('click', () => {
			if (confirm('确定恢复默认数据？这会清除当前本机测试记录。')) {
				state = defaultState();
				save();
				render()
			}
		});

			// ===== 动画设置 =====
			function saveAnimSettings(updates) {
				let anim = {};
				try { anim = JSON.parse(localStorage.getItem('animSettings') || '{}'); } catch(e) {}
				if (updates.particles) anim.particles = Object.assign(anim.particles || {}, updates.particles);
				if (updates.snake) anim.snake = Object.assign(anim.snake || {}, updates.snake);
				localStorage.setItem('animSettings', JSON.stringify(anim));
				window.dispatchEvent(new CustomEvent('animSettingsChanged'));
			}
						document.getElementById('sSpeed')?.addEventListener('input', function(e) {
				var v = parseFloat(e.target.value);
				var el = document.getElementById('sSpeedVal');
				if (el) el.textContent = v.toFixed(1);
				saveAnimSettings({ snake: { speed: v } });
			});
			document.getElementById('sMaxLen')?.addEventListener('input', function(e) {
				var v = parseInt(e.target.value);
				var el = document.getElementById('sMaxLenVal');
				if (el) el.textContent = v;
				saveAnimSettings({ snake: { maxLength: v } });
			});
			document.getElementById('sColor')?.addEventListener('input', function(e) {
				saveAnimSettings({ snake: { color: e.target.value } });
			});
	}
	render();
	setTimeout(() => {
		if (state.cloud?.binId && state.cloud?.accessKey) {
			cloudAutoConnect();
		}
	}, 300);
})();
