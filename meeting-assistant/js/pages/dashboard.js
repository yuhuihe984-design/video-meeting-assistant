const DashboardPage = (() => {
  let activeFilter = '全部';
  let meetingSortKey = 'time_desc';
  let meetingSearchQuery = '';

  const FILTERS = ['全部', '进行中', '即将开始', '已结束'];

  let meetingSearchDebounce = null;

  function sortMeetingList(list, key) {
    const order = ['进行中', '即将开始', '已结束'];
    const rank = (m) => {
      const st = Utils.dashboardStatus(m);
      const i = order.indexOf(st);
      return i === -1 ? 99 : i;
    };
    const ts = (m) => new Date(m.scheduledAt).getTime() || 0;
    const copy = [...list];
    switch (key) {
      case 'time_asc':
        copy.sort((a, b) => ts(a) - ts(b));
        break;
      case 'title':
        copy.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN'));
        break;
      case 'status':
        copy.sort((a, b) => rank(a) - rank(b) || ts(a) - ts(b));
        break;
      case 'time_desc':
      default:
        copy.sort((a, b) => ts(b) - ts(a));
        break;
    }
    return copy;
  }

  function render(container) {
    const navIntent = Utils.consumeNavIntent();
    let weekMeetingListOnly = false;
    if (navIntent?.target === 'home') {
      if (navIntent.activeFilter && FILTERS.includes(navIntent.activeFilter)) activeFilter = navIntent.activeFilter;
      if (typeof navIntent.meetingSearchQuery === 'string') meetingSearchQuery = navIntent.meetingSearchQuery;
      if (['time_asc', 'time_desc', 'title', 'status'].includes(navIntent.sortKey)) meetingSortKey = navIntent.sortKey;
      if (navIntent.weekScoped) weekMeetingListOnly = true;
      if (navIntent.toastHint) Utils.showToast(navIntent.toastHint, 'info');
    }

    const meetingsFull = Store.getMeetings();
    const meetings = weekMeetingListOnly ? Utils.meetingsScheduledThisWeek(meetingsFull) : meetingsFull;

    const todos = Store.getTodos();
    const team = Store.getTeam();
    const pendingTodos = todos.filter((t) => t.status !== 'done').length;
    const doneTodos = todos.filter((t) => t.status === 'done').length;

    const weekMeetings = Utils.meetingsScheduledThisWeek(meetings);

    const filteredBase =
      activeFilter === '全部'
        ? meetings
        : meetings.filter((m) => Utils.dashboardStatus(m) === activeFilter);
    const q = meetingSearchQuery.trim().toLowerCase();
    const filteredRaw = q.length ? filteredBase.filter((m) => (m.title || '').toLowerCase().includes(q)) : filteredBase;
    const filtered = sortMeetingList(filteredRaw, meetingSortKey);

    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

    container.innerHTML = `
      <div class="page-scroll">
        <div class="dash-header">
          <div>
            <h1 class="dash-title">会议助手</h1>
            <p class="dash-subtitle">${dateStr}</p>
          </div>
          <button type="button" class="btn btn-primary btn-new-meeting" id="btn-new-meeting">
            ${Icons.el('plus', 'icon')} 新建会议
          </button>
        </div>

        <div class="stats-grid-4">
          <a href="#insights/meetings" class="stat-card-proto stat-card-proto--clickable">
            <div class="stat-icon-wrap stat-icon-wrap--blue">${Icons.el('video', 'icon')}</div>
            <p class="stat-card-value">${weekMeetings.length}</p>
            <p class="stat-card-label">本周会议</p>
            <span class="stat-card-hint">点击查看数据看板</span>
          </a>
          <a href="#insights/pending" class="stat-card-proto stat-card-proto--clickable">
            <div class="stat-icon-wrap stat-icon-wrap--amber">${Icons.el('check', 'icon')}</div>
            <p class="stat-card-value">${pendingTodos}</p>
            <p class="stat-card-label">待处理事项</p>
            <span class="stat-card-hint">点击查看数据看板</span>
          </a>
          <a href="#insights/done" class="stat-card-proto stat-card-proto--clickable">
            <div class="stat-icon-wrap stat-icon-wrap--green">${Icons.el('trending', 'icon')}</div>
            <p class="stat-card-value">${doneTodos}</p>
            <p class="stat-card-label">已完成事项</p>
            <span class="stat-card-hint">点击查看数据看板</span>
          </a>
          <a href="#insights/team" class="stat-card-proto stat-card-proto--clickable">
            <div class="stat-icon-wrap stat-icon-wrap--purple">${Icons.el('users', 'icon')}</div>
            <p class="stat-card-value">${team.length}</p>
            <p class="stat-card-label">团队成员</p>
            <span class="stat-card-hint">点击查看数据看板</span>
          </a>
        </div>

        <div class="quick-grid-3">
          <a href="#records" class="quick-card-proto">
            <div class="quick-card-icon">${Icons.el('file', 'icon')}</div>
            <div class="quick-card-body">
              <p class="quick-card-title">会议记录</p>
              <p class="quick-card-desc">查看历史纪要</p>
            </div>
            <span class="quick-card-chevron">${Icons.el('chevronR', 'icon-sm')}</span>
          </a>
          <a href="#todos" class="quick-card-proto">
            <div class="quick-card-icon">${Icons.el('check', 'icon')}</div>
            <div class="quick-card-body">
              <p class="quick-card-title">待办事项</p>
              <p class="quick-card-desc">${pendingTodos} 项待处理</p>
            </div>
            <span class="quick-card-chevron">${Icons.el('chevronR', 'icon-sm')}</span>
          </a>
          <a href="#team" class="quick-card-proto">
            <div class="quick-card-icon">${Icons.el('users', 'icon')}</div>
            <div class="quick-card-body">
              <p class="quick-card-title">团队管理</p>
              <p class="quick-card-desc">${team.length} 位成员</p>
            </div>
            <span class="quick-card-chevron">${Icons.el('chevronR', 'icon-sm')}</span>
          </a>
        </div>

        <div class="meeting-list-card">
          <div class="meeting-list-header">
            <h2 class="meeting-list-title">会议列表</h2>
            <div class="filter-pills" id="meeting-filters">
              ${FILTERS.map(
                (f) =>
                  `<button type="button" class="filter-pill${activeFilter === f ? ' active' : ''}" data-filter="${f}">${f}</button>`
              ).join('')}
            </div>
          </div>
          <div class="meeting-list-toolbar">
            <input type="search" class="form-input meeting-list-q" id="meeting-list-q" placeholder="按标题筛选…" value="${Utils.escapeHtml(meetingSearchQuery)}" autocomplete="off" />
            <select class="form-input meeting-list-sort" id="meeting-list-sort" aria-label="排序方式">
              <option value="time_desc" ${meetingSortKey === 'time_desc' ? 'selected' : ''}>时间（新→旧）</option>
              <option value="time_asc" ${meetingSortKey === 'time_asc' ? 'selected' : ''}>时间（旧→新）</option>
              <option value="title" ${meetingSortKey === 'title' ? 'selected' : ''}>标题 A–Z</option>
              <option value="status" ${meetingSortKey === 'status' ? 'selected' : ''}>状态（进行中优先）</option>
            </select>
          </div>
          <div class="meeting-list-body">
            ${
              filtered.length
                ? filtered.map(meetingRow).join('')
                : '<div class="empty-state-inline"><p>暂无会议</p></div>'
            }
          </div>
        </div>
      </div>
    `;

    container.querySelector('#btn-new-meeting')?.addEventListener('click', openNewMeetingModal);
    container.querySelectorAll('.filter-pill').forEach((btn) => {
      btn.onclick = () => {
        activeFilter = btn.dataset.filter;
        render(container);
      };
    });

    const sortEl = container.querySelector('#meeting-list-sort');
    sortEl?.addEventListener('change', () => {
      meetingSortKey = sortEl.value || 'time_desc';
      render(container);
    });

    const qInput = container.querySelector('#meeting-list-q');
    qInput?.addEventListener('input', () => {
      const v = qInput.value;
      if (meetingSearchDebounce) clearTimeout(meetingSearchDebounce);
      meetingSearchDebounce = setTimeout(() => {
        meetingSearchQuery = v;
        meetingSearchDebounce = null;
        render(container);
      }, 280);
    });
    container.querySelectorAll('.meeting-list-item').forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest('.btn-join')) return;
        if (e.target.closest('.meeting-delete-btn')) return;
        Router.navigate(`meeting/${row.dataset.id}`);
      };
    });
    container.querySelectorAll('.btn-join').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        Router.navigate(`meeting/${btn.dataset.id}`);
      };
    });
    container.querySelectorAll('.meeting-delete-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.delete;
        const meet = Store.getMeeting(id);
        if (!meet) return;
        if (
          confirm(
            `确定删除会议「${meet.title}」？\n将移入「最近删除」，可于回收站内恢复。\n本场关联待办一并进入回收关联。`
          )
        ) {
          Store.deleteMeeting(id);
          Utils.showToast('已移入最近删除', 'info');
          render(container);
        }
      };
    });
  }

  function meetingRow(m) {
    const status = Utils.dashboardStatus(m);
    const sc = Utils.dashboardStatusStyle(status);
    const invitees = m.invitees || [];
    const todosCount = Store.getTodos().filter((t) => t.meetingId === m.id && t.status !== 'done').length;
    const { dateLabel, timeLabel } = Utils.meetingDateParts(m.scheduledAt);
    const duration = Utils.meetingDuration(m);

    const avatars = invitees
      .slice(0, 3)
      .map(
        (p) =>
          `<span class="avatar-circle">${Utils.escapeHtml((p.name || p.email || '?').charAt(0))}</span>`
      )
      .join('');
    const overflow =
      invitees.length > 3
        ? `<span class="avatar-circle avatar-circle--more">+${invitees.length - 3}</span>`
        : '';

    return `
      <div class="meeting-list-item" data-id="${m.id}">
        <div class="meeting-item-icon">${Icons.el('video', 'icon')}</div>
        <div class="meeting-item-main">
          <div class="meeting-item-title-row">
            <p class="meeting-item-title">${Utils.escapeHtml(m.title)}</p>
            <span class="status-pill ${sc.className}">
              <span class="status-pill-dot"></span>${status}
            </span>
          </div>
          <div class="meeting-item-meta">
            <span>${Icons.el('calendar', 'icon-sm')} ${dateLabel} ${timeLabel}</span>
            <span>${Icons.el('clock', 'icon-sm')} ${duration}</span>
            <span>${Icons.el('users', 'icon-sm')} ${invitees.length} 人</span>
            ${
              todosCount > 0
                ? `<span class="meeting-item-todos">${Icons.el('check', 'icon-sm')} ${todosCount} 项待办</span>`
                : ''
            }
          </div>
        </div>
        <div class="meeting-item-actions">
          <div class="avatar-stack-proto">${avatars}${overflow}</div>
          ${
            status === '进行中'
              ? `<button type="button" class="btn-join" data-id="${m.id}">${Icons.el('play', 'icon-sm')} 加入</button>`
              : ''
          }
          <button type="button" class="btn-icon meeting-delete-btn" data-delete="${m.id}" title="删除会议（可回收）">${Icons.el('trash', 'icon-sm')}</button>
          <span class="meeting-item-chevron">${Icons.el('chevronR', 'icon-sm')}</span>
        </div>
      </div>`;
  }

  function openNewMeetingModal() {
    const team = Store.getTeam();
    const defaultInvite = team.slice(0, Math.min(3, team.length)).map((t) => t.id);
    const selected = new Set(defaultInvite);

    const defaultTime = new Date(Date.now() + 3600000);
    defaultTime.setMinutes(0, 0, 0);

    const { overlay, close } = Utils.showModal({
      title: '新建会议',
      body: `
        <form id="form-new-meeting" class="form">
          <label class="form-label">会议主题 <span class="required">*</span></label>
          <input type="text" name="title" class="form-input" placeholder="例：Q2 产品规划会议" required />
          <label class="form-label">会议时间</label>
          <input type="datetime-local" name="scheduledAt" class="form-input"
            value="${defaultTime.toISOString().slice(0, 16)}" />
          <label class="form-label">预计时长（分钟）</label>
          <select name="plannedDurationMinutes" class="form-input">
            <option value="15">15 分钟</option>
            <option value="30">30 分钟</option>
            <option value="45">45 分钟</option>
            <option value="60" selected>60 分钟</option>
            <option value="90">90 分钟</option>
            <option value="120">120 分钟</option>
            <option value="180">180 分钟</option>
          </select>
          <label class="form-label">议程（每行一项）</label>
          <textarea name="agenda" class="form-input" rows="4" placeholder="Q2目标回顾&#10;新功能优先级排序"></textarea>
          <label class="form-label">邀请成员</label>
          <div class="chip-group">
            ${team
              .map(
                (t) =>
                  `<button type="button" class="chip${selected.has(t.id) ? ' chip-active' : ''}" data-chip="${t.id}">${Utils.escapeHtml(t.name)}</button>`
              )
              .join('')}
          </div>
          <label class="form-label">按部门批量邀请</label>
          <div class="chip-group chip-group-dept">
            ${Utils.INVITE_DEPARTMENTS.map((d) => {
              const ids = team.filter((m) => (m.department || '') === d && m.id).map((m) => m.id);
              const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
              return `<button type="button" class="chip chip-dept${allOn ? ' chip-active' : ''}" data-dept="${Utils.escapeHtml(d)}">${Utils.escapeHtml(d)}</button>`;
            }).join('')}
          </div>
          <label class="form-label">会前提醒</label>
          <select name="reminderMinutes" class="form-input">
            <option value="5">提前 5 分钟</option>
            <option value="15" selected>提前 15 分钟</option>
            <option value="30">提前 30 分钟</option>
            <option value="60">提前 1 小时</option>
          </select>
        </form>
      `,
      footer: `
        <button type="button" class="btn btn-ghost modal-cancel">取消</button>
        <button type="button" class="btn btn-primary" id="btn-create-meeting">创建会议</button>
      `,
    });

    function refreshInviteChips() {
      overlay.querySelectorAll('.chip[data-chip]').forEach((chip) => {
        chip.classList.toggle('chip-active', selected.has(chip.dataset.chip));
      });
      overlay.querySelectorAll('.chip-dept').forEach((dc) => {
        const dept = dc.dataset.dept;
        const ids = team.filter((m) => (m.department || '') === dept && m.id).map((m) => m.id);
        const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
        dc.classList.toggle('chip-active', allOn);
      });
    }

    overlay.querySelectorAll('.chip[data-chip]').forEach((chip) => {
      chip.onclick = () => {
        chip.classList.toggle('chip-active');
        if (chip.classList.contains('chip-active')) selected.add(chip.dataset.chip);
        else selected.delete(chip.dataset.chip);
        refreshInviteChips();
      };
    });

    overlay.querySelectorAll('.chip-dept').forEach((chip) => {
      chip.onclick = () => {
        Utils.toggleInviteDeptSelection(team, chip.dataset.dept, selected);
        refreshInviteChips();
      };
    });

    refreshInviteChips();

    overlay.querySelector('.modal-cancel').onclick = close;
    overlay.querySelector('#btn-create-meeting').onclick = () => {
      const form = overlay.querySelector('#form-new-meeting');
      const fd = new FormData(form);
      const title = fd.get('title')?.toString().trim();
      if (!title) return Utils.showToast('请填写会议主题', 'error');

      const agenda = (fd.get('agenda')?.toString() || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((line, i) => ({ id: Store.uid(), title: line, order: i }));

      const invitees = [...selected]
        .map((id) => {
          const t = Store.getTeam().find((m) => m.id === id);
          return t ? { id: t.id, name: t.name, email: t.email } : null;
        })
        .filter(Boolean);

      const meeting = Store.createMeeting({
        title,
        scheduledAt: new Date(fd.get('scheduledAt')).toISOString(),
        agenda,
        invitees,
        reminderMinutes: parseInt(fd.get('reminderMinutes'), 10),
        plannedDurationMinutes: parseInt(fd.get('plannedDurationMinutes'), 10) || 60,
      });

      close();
      Utils.showToast('会议已创建', 'success');
      Router.navigate(`meeting/${meeting.id}`);
    };
  }

  return { render };
})();
