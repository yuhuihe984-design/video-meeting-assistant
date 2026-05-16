/**
 * 应用入口 — 对齐 Generate Chinese Prototype
 */
(function initApp() {
  const NAV_ITEMS = [
    { path: '/', label: '首页', icon: 'home' },
    { path: '/todos', label: '待办事项', icon: 'check' },
    { path: '/team', label: '团队', icon: 'users' },
  ];

  const KEY_SIDEBAR_RECENT_EXPANDED = 'ma_sidebar_recent_expanded';
  const LS_DISMISSED_REMINDERS = 'ma_dismiss_reminders';

  function readDismissedReminderIds() {
    try {
      const raw = localStorage.getItem(LS_DISMISSED_REMINDERS);
      const arr = JSON.parse(raw || '[]');
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function persistDismissReminder(id) {
    const key = String(id);
    const set = readDismissedReminderIds();
    if (set.has(key)) return;
    set.add(key);
    localStorage.setItem(LS_DISMISSED_REMINDERS, JSON.stringify([...set]));
  }

  let notifyPopoverOpen = false;

  /** 右上角提醒：临近会议与待截止/逾期待办 */
  function collectReminderModels() {
    const now = Date.now();
    const horizon = now + 14 * 86400000;
    const items = [];
    const dismissed = readDismissedReminderIds();

    Store.getMeetings().forEach((m) => {
      if (m.status === 'ended') return;
      const t = new Date(m.scheduledAt).getTime();
      if (Number.isNaN(t)) return;
      if (t < now - 86400000) return;
      const st = Utils.dashboardStatus(m);
      const dot = st === '进行中' ? 'dot-live' : st === '已结束' ? 'dot-ended' : 'dot-upcoming';
      items.push({
        id: `m:${m.id}`,
        sortKey: t,
        dot,
        text: `${m.title} · ${st}`,
        timeLabel: Utils.formatDate(m.scheduledAt),
        href: `#meeting/${m.id}`,
      });
    });

    Store.getTodos()
      .filter((td) => td.status !== 'done')
      .forEach((td) => {
        if (!td.dueAt) return;
        const tt = new Date(td.dueAt).getTime();
        if (Number.isNaN(tt) || tt > horizon) return;
        const overdue = tt < now;
        items.push({
          id: `t:${td.id}`,
          sortKey: tt,
          dot: overdue ? 'dot-ended' : 'dot-amber',
          text: td.assigneeName ? `${td.title} (@${td.assigneeName})` : td.title,
          timeLabel: Utils.formatDate(td.dueAt),
          href: '#todos',
        });
      });

    items.sort((a, b) => a.sortKey - b.sortKey);
    return items.filter((row) => !dismissed.has(row.id)).slice(0, 14);
  }

  function renderNotifyDropdownMarkup() {
    const models = collectReminderModels();
    if (!models.length) {
      return '<p class="notify-dropdown-empty">近期暂无临近会议或截止日期内的待办</p>';
    }
    return `
      <p class="notify-dropdown-title">最近提醒</p>
      <ul class="notify-dropdown-list">
        ${models
          .map(
            (row) => `
          <li class="notify-dropdown-row">
            <a href="${Utils.escapeHtml(row.href)}" class="notify-dropdown-item notify-close-on-navigate">
              <span class="recent-dot ${row.dot}"></span>
              <span class="notify-dropdown-text">
                <span class="notify-dropdown-main">${Utils.escapeHtml(row.text)}</span>
                <span class="notify-dropdown-time">${Utils.escapeHtml(row.timeLabel)}</span>
              </span>
            </a>
            <button type="button" class="notify-dismiss-btn" title="不再显示" aria-label="不再显示此提醒" data-dismiss-reminder="${Utils.escapeHtml(row.id)}">×</button>
          </li>`
          )
          .join('')}
      </ul>`;
  }

  function syncNotifyFromState() {
    notifyCount = collectReminderModels().length;
    const badge = document.getElementById('notify-badge');
    if (badge) {
      badge.hidden = notifyCount <= 0;
      badge.textContent = notifyCount > 9 ? '9+' : String(notifyCount);
    }
    const dropEl = document.getElementById('notify-dropdown');
    if (notifyPopoverOpen && dropEl) dropEl.innerHTML = renderNotifyDropdownMarkup();
  }

  function setNotifyPopoverOpen(open) {
    notifyPopoverOpen = open;
    const drop = document.getElementById('notify-dropdown');
    const btn = document.getElementById('btn-notify');
    if (!drop || !btn) return;
    drop.hidden = !open;
    drop.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    drop.classList.toggle('notify-dropdown--open', open);
  }

  function closeNotifyPopover() {
    setNotifyPopoverOpen(false);
    document.removeEventListener('click', notifyOutsideCloser, true);
  }

  function notifyOutsideCloser(e) {
    const wrap = document.getElementById('notify-wrap');
    if (!wrap || wrap.contains(e.target)) return;
    closeNotifyPopover();
  }

  function toggleNotifyPopover() {
    const next = !notifyPopoverOpen;
    if (next) {
      const drop = document.getElementById('notify-dropdown');
      if (drop) drop.innerHTML = renderNotifyDropdownMarkup();
      setNotifyPopoverOpen(true);
      queueMicrotask(() => document.addEventListener('click', notifyOutsideCloser, true));
    } else {
      closeNotifyPopover();
    }
  }

  let notifyInteractionsBound = false;
  function setupNotifyBellInteraction() {
    if (notifyInteractionsBound) return;
    notifyInteractionsBound = true;
    document.getElementById('btn-notify')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotifyPopover();
    });
    document.getElementById('notify-dropdown')?.addEventListener('click', (e) => {
      const dismissBtn = e.target.closest('[data-dismiss-reminder]');
      if (dismissBtn) {
        e.preventDefault();
        e.stopPropagation();
        persistDismissReminder(dismissBtn.dataset.dismissReminder);
        syncNotifyFromState();
        return;
      }
      if (e.target.closest('.notify-close-on-navigate')) closeNotifyPopover();
    });
  }

  let notifyCount = 0;

  function applyUIPrefsDOM() {
    try {
      const p = Store.getUIPrefs();
      document.documentElement.setAttribute('data-font-scale', p.fontScale || 'm');
      document.documentElement.setAttribute('data-tone', p.tone || 'default');
    } catch (_) {}
  }

  function sidebarRecentExpanded() {
    try {
      const v = sessionStorage.getItem(KEY_SIDEBAR_RECENT_EXPANDED);
      if (v === null || v === undefined) return false;
      return v === '1' || v === 'true';
    } catch (_) {
      return false;
    }
  }

  function toggleSidebarRecent() {
    const next = sidebarRecentExpanded() ? '0' : '1';
    try {
      sessionStorage.setItem(KEY_SIDEBAR_RECENT_EXPANDED, next);
    } catch (_) {}
    renderRecentMeetings();
  }

  function renderNav() {
    const hash = location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    let activePath;
    if (parts[0] === 'meeting') activePath = '/';
    else if (parts[0] === 'trash') activePath = '/trash';
    else if (parts[0] === 'insights') activePath = '/';
    else activePath = parts[0] ? '/' + parts[0] : '/';

    const nav = document.getElementById('main-nav');
    nav.innerHTML = NAV_ITEMS.map(
      (item) => `
      <a href="#${item.path === '/' ? '' : item.path.slice(1)}" class="nav-link${activePath === item.path ? ' active' : ''}" data-path="${item.path}">
        ${Icons.el(item.icon, 'nav-icon icon')}
        <span class="nav-label">${item.label}</span>
      </a>`
    ).join('');
  }

  function renderRecentMeetings() {
    const el = document.getElementById('sidebar-recent');
    if (!el) return;

    const meetings = Store.getMeetings().slice(0, 3);
    const hash = location.hash.slice(1) || '/';
    const activeMeetingId = hash.startsWith('meeting/') ? hash.split('/')[1] : null;
    const expanded = sidebarRecentExpanded();

    const listMarkup =
      !meetings.length
        ? '<p class="sidebar-recent-empty">暂无会议</p>'
        : meetings
            .map((m) => {
              const display = Utils.dashboardStatus(m);
              const dotClass =
                display === '进行中' ? 'dot-live' : display === '已结束' ? 'dot-ended' : 'dot-upcoming';
              const active = activeMeetingId === m.id ? ' active' : '';
              return `
            <a href="#meeting/${m.id}" class="recent-meeting-item${active}" data-id="${m.id}">
              <span class="recent-dot ${dotClass}"></span>
              <span class="recent-meeting-text">
                <span class="recent-meeting-title">${Utils.escapeHtml(m.title)}</span>
                <span class="recent-meeting-status">${display}</span>
              </span>
            </a>`;
            })
            .join('');

    el.innerHTML = `
      <div class="sidebar-recent-section">
        <button type="button" class="sidebar-recent-toggle" aria-expanded="${expanded}" id="sidebar-recent-toggle">
          <span class="sidebar-recent-chevron">${expanded ? '▾' : '▸'}</span>
          <span>最近会议</span>
          <span class="sidebar-recent-count">${meetings.length}</span>
        </button>
        <div class="sidebar-recent-scroll${expanded ? '' : ' is-collapsed'}">${listMarkup}</div>
        <a href="#trash" class="sidebar-soft-link">${Icons.el('trash', 'icon-sm')} 最近删除</a>
      </div>`;

    document.getElementById('sidebar-recent-toggle')?.addEventListener('click', toggleSidebarRecent);
  }

  function openSettingsModal() {
    const p = Store.getUIPrefs();
    const logged = p.loggedInMock !== false;

    const body = `
      <div class="settings-section">
        <h4 class="settings-h">账号（演示）</h4>
        <p class="settings-desc">张三 · ${Utils.escapeHtml((Store.getTeam().find((m) => m.email === 'zhangsan@company.com') || {}).email || 'zhangsan@company.com')}</p>
        <button type="button" class="btn btn-secondary btn-block" id="btn-settings-logout"${logged ? '' : ' disabled'}>退出演示账号</button>
        <p class="settings-hint">本地演示：退出后不删除数据；再次打开可继续使用。</p>
      </div>
      <form id="form-settings" class="form">
        <h4 class="settings-h">显示</h4>
        <label class="form-label">字号</label>
        <select name="fontScale" class="form-input">
          <option value="s" ${p.fontScale === 's' ? 'selected' : ''}>较小</option>
          <option value="m" ${p.fontScale === 'm' || !p.fontScale ? 'selected' : ''}>标准</option>
          <option value="l" ${p.fontScale === 'l' ? 'selected' : ''}>较大</option>
        </select>
        <label class="form-label">色调</label>
        <select name="tone" class="form-input">
          <option value="default" ${p.tone !== 'warm' && p.tone !== 'cool' ? 'selected' : ''}>清爽蓝（默认）</option>
          <option value="warm" ${p.tone === 'warm' ? 'selected' : ''}>暖色纸张</option>
          <option value="cool" ${p.tone === 'cool' ? 'selected' : ''}>冷静灰蓝</option>
        </select>
      </form>
      <div class="settings-section">
        <h4 class="settings-h">问题反馈</h4>
        <textarea id="settings-feedback" class="form-input" rows="3" placeholder="描述问题或建议…"></textarea>
        <button type="button" class="btn btn-primary btn-block" style="margin-top:10px" id="btn-feedback-submit">提交反馈（演示）</button>
      </div>`;

    const { overlay, close } = Utils.showModal({
      title: '设置',
      body,
      footer: `
        <button type="button" class="btn btn-ghost modal-cancel">关闭</button>
        <button type="button" class="btn btn-primary" id="btn-settings-save">保存显示偏好</button>
      `,
    });

    overlay.querySelector('.modal-cancel').onclick = close;
    overlay.querySelector('#btn-settings-logout').onclick = () => {
      Store.updateUIPrefs({ loggedInMock: false });
      Utils.showToast('已退出演示账号', 'success');
      close();
    };
    overlay.querySelector('#btn-settings-save').onclick = () => {
      const fd = new FormData(overlay.querySelector('#form-settings'));
      Store.updateUIPrefs({
        fontScale: fd.get('fontScale'),
        tone: fd.get('tone'),
      });
      applyUIPrefsDOM();
      Utils.showToast('已保存', 'success');
      close();
    };
    overlay.querySelector('#btn-feedback-submit').onclick = () => {
      const t = overlay.querySelector('#settings-feedback').value.trim();
      if (!t.length) return Utils.showToast('请填写反馈内容', 'error');
      Utils.showToast('感谢反馈（演示环境未联网发送）', 'success');
      overlay.querySelector('#settings-feedback').value = '';
    };
  }

  function setupSidebarUserCard() {
    const card = document.querySelector('.sidebar-user-card');
    if (!card || card.dataset.settingsBound === '1') return;
    card.dataset.settingsBound = '1';
    card.addEventListener('click', () => openSettingsModal());
  }

  function updateChrome() {
    const hash = location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    const isMeeting = parts[0] === 'meeting';

    const topbar = document.getElementById('topbar');
    if (topbar) topbar.classList.toggle('hidden', isMeeting);

    const main = document.querySelector('.main-content');
    if (main) main.classList.toggle('main-content--full', isMeeting);

    const searchIcon = document.getElementById('search-icon-slot');
    if (searchIcon) searchIcon.innerHTML = Icons.search;

    const bellSlot = document.getElementById('notify-bell-slot');
    if (bellSlot) bellSlot.innerHTML = Icons.bell;

    syncNotifyFromState();

    setupNotifyBellInteraction();

    const brandLogo = document.getElementById('brand-logo-slot');
    if (brandLogo) brandLogo.innerHTML = Icons.el('video', 'icon-sm');

    const sparkles = document.getElementById('sparkles-icon');
    if (sparkles) sparkles.innerHTML = Icons.sparkles;

    const settingsSlot = document.getElementById('settings-icon-slot');
    if (settingsSlot) settingsSlot.innerHTML = Icons.settings;

    renderNav();
    renderRecentMeetings();
    setupSidebarUserCard();
    applyUIPrefsDOM();
  }

  function setupGlobalSearch() {
    const input = document.getElementById('global-search');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const q = input.value.trim().toLowerCase();
        const meeting = Store.getMeetings().find((m) => m.title.toLowerCase().includes(q));
        if (meeting) Router.navigate(`meeting/${meeting.id}`);
        else Router.navigate('todos');
      }
    });
  }

  function rerender() {
    const hash = location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    const main = document.getElementById('main-content');
    updateChrome();
    if (parts[0] === 'meeting' && parts[1]) MeetingPage.render(parts[1], main);
    else if (parts[0] === 'trash') TrashPage.render(main);
    else if (parts[0] === 'records') RecordsPage.render(main);
    else if (parts[0] === 'todos') TodosPage.render(main);
    else if (parts[0] === 'team') TeamPage.render(main);
    else if (parts[0] === 'insights' && parts[1]) InsightsPage.render(parts[1], main);
    else DashboardPage.render(main);
  }

  Router.register('/', (params, el) => {
    updateChrome();
    DashboardPage.render(el);
  });
  Router.register('/meeting/:id', (params, el) => {
    updateChrome();
    MeetingPage.render(params.id, el);
  });
  Router.register('/todos', (params, el) => {
    updateChrome();
    TodosPage.render(el);
  });
  Router.register('/team', (params, el) => {
    updateChrome();
    TeamPage.render(el);
  });
  Router.register('/records', (params, el) => {
    updateChrome();
    RecordsPage.render(el);
  });
  Router.register('/trash', (params, el) => {
    updateChrome();
    TrashPage.render(el);
  });
  Router.register('/insights/:kind', (params, el) => {
    updateChrome();
    InsightsPage.render(params.kind, el);
  });

  window.addEventListener('store-updated', () => {
    applyUIPrefsDOM();
    rerender();
  });
  window.addEventListener('hashchange', () => {
    updateChrome();
    rerender();
  });

  setupGlobalSearch();
  Router.init();
  updateChrome();
  setupSidebarUserCard();

  const SEED_VERSION = '6';
  if (localStorage.getItem('meeting_assistant_seed_v') !== SEED_VERSION) {
    localStorage.removeItem('meeting_assistant_data');
    localStorage.removeItem('meeting_assistant_seeded');
    seedDemoData();
    localStorage.setItem('meeting_assistant_seeded', '1');
    localStorage.setItem('meeting_assistant_seed_v', SEED_VERSION);
  }
})();

function seedDemoData() {
  const team = Store.getTeam();
  const invitees = team.slice(0, 4).map((t) => ({ id: t.id, name: t.name, email: t.email }));

  const m1 = Store.createMeeting({
    title: 'Q2 产品规划会议',
    scheduledAt: new Date().toISOString(),
    status: 'in_progress',
    plannedDurationMinutes: 90,
    startedAt: new Date().toISOString(),
    agenda: [
      { id: Store.uid(), title: 'Q2目标回顾', order: 0 },
      { id: Store.uid(), title: '新功能优先级排序', order: 1 },
    ],
    invitees,
    reminderMinutes: 10,
    notes: [{ id: Store.uid(), text: '用户增长目标：新增注册用户30%', tag: 'key', highlighted: true }],
  });

  Store.createMeeting({
    title: '用户体验优化评审',
    scheduledAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'ended',
    plannedDurationMinutes: 60,
    invitees: invitees.slice(0, 3),
    startedAt: new Date(Date.now() - 86400000).toISOString(),
    endedAt: new Date(Date.now() - 86400000 + 2700000).toISOString(),
  });

  Store.createMeeting({
    title: '技术架构讨论',
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    status: 'scheduled',
    plannedDurationMinutes: 45,
    invitees: team.slice(2, 6).map((t) => ({ id: t.id, name: t.name, email: t.email })),
  });

  Store.createTodo({
    title: '完成竞品分析报告',
    meetingId: m1.id,
    assigneeId: team[0]?.id,
    assigneeName: team[0]?.name || '张三',
    dueAt: new Date(Date.now() + 432000000).toISOString(),
    priority: 'high',
  });
  Store.createTodo({
    title: '更新产品路线图文档',
    meetingId: m1.id,
    assigneeId: team[1]?.id,
    assigneeName: team[1]?.name || '李四',
    dueAt: new Date(Date.now() + 518400000).toISOString(),
  });

  Store.createTodo({
    title: '提醒自己整理本周会议纪要',
    meetingId: null,
    assigneeId: null,
    assigneeName: '',
    dueAt: new Date(Date.now() + 172800000).toISOString(),
    priority: '中',
  });
}
