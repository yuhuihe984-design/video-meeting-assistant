const TodosPage = (() => {
  let filters = {
    assignee: '全部',
    status: '全部',
    priority: '全部',
    search: '',
    openOnly: false,
    overdueOnly: false,
    dueWithinDays: null,
    highPriorityOnly: false,
    unassignedOnly: false,
  };

  const PRIORITIES = ['全部', '高', '中', '低'];
  const STATUS_OPTIONS = ['全部', '未开始', '进行中', '已完成'];

  function resetInsightTodoFlags() {
    filters.openOnly = false;
    filters.overdueOnly = false;
    filters.dueWithinDays = null;
    filters.highPriorityOnly = false;
    filters.unassignedOnly = false;
  }

  function render(container) {
    resetInsightTodoFlags();

    const navIntent = Utils.consumeNavIntent();
    if (navIntent?.target === 'todos') {
      filters.openOnly = !!navIntent.openOnly;
      filters.overdueOnly = !!navIntent.overdueOnly;
      filters.highPriorityOnly = !!navIntent.highPriorityOnly;
      filters.unassignedOnly = !!navIntent.unassignedOnly;
      filters.dueWithinDays =
        navIntent.dueWithinDays != null && Number.isFinite(Number(navIntent.dueWithinDays))
          ? Number(navIntent.dueWithinDays)
          : null;
      if (typeof navIntent.assignee === 'string') filters.assignee = navIntent.assignee;
      if (typeof navIntent.search === 'string') filters.search = navIntent.search;
      if (typeof navIntent.status === 'string' && STATUS_OPTIONS.includes(navIntent.status))
        filters.status = navIntent.status;
      if (typeof navIntent.priority === 'string' && PRIORITIES.includes(navIntent.priority))
        filters.priority = navIntent.priority;
      if (navIntent.toastHint) Utils.showToast(navIntent.toastHint, 'info');
    }

    const team = Store.getTeam();
    const members = ['全部', '未设负责人', ...team.map((t) => t.name)];
    const statuses = [...STATUS_OPTIONS];
    const todos = getFilteredTodos();
    const all = Store.getTodos();
    const today = new Date().toISOString().slice(0, 10);

    const counts = {
      total: all.length,
      pending: all.filter((t) => t.status !== 'done').length,
      completed: all.filter((t) => t.status === 'done').length,
      overdue: all.filter((t) => t.status !== 'done' && t.dueAt && t.dueAt.slice(0, 10) < today).length,
    };

    container.innerHTML = `
      <div class="page-scroll">
        <div class="dash-header">
          <div>
            <h1 class="dash-title">待办事项</h1>
            <p class="dash-subtitle">跟进会议行动项</p>
          </div>
          <button type="button" class="btn btn-primary" id="btn-add-todo">${Icons.el('plus', 'icon')} 新建待办</button>
        </div>

        <div class="stats-grid-4 stats-grid-4--compact">
          <div class="stat-card-proto stat-card-proto--center">
            <p class="stat-card-value">${counts.total}</p>
            <p class="stat-card-label">全部</p>
          </div>
          <div class="stat-card-proto stat-card-proto--center">
            <p class="stat-card-value text-blue">${counts.pending}</p>
            <p class="stat-card-label">待处理</p>
          </div>
          <div class="stat-card-proto stat-card-proto--center">
            <p class="stat-card-value text-green">${counts.completed}</p>
            <p class="stat-card-label">已完成</p>
          </div>
          <div class="stat-card-proto stat-card-proto--center">
            <p class="stat-card-value text-red">${counts.overdue}</p>
            <p class="stat-card-label">已逾期</p>
          </div>
        </div>

        <div class="filter-row">
          <div class="search-box search-box--inline">
            <span class="icon icon-sm">${Icons.search}</span>
            <input type="search" id="todo-search" placeholder="搜索待办事项…" value="${Utils.escapeHtml(filters.search)}" />
          </div>
          ${selectFilter('负责人', 'filter-assignee', members, filters.assignee)}
          ${selectFilter('状态', 'filter-status', statuses, filters.status)}
          ${selectFilter('优先级', 'filter-priority', PRIORITIES, filters.priority)}
          <span class="filter-count">共 ${todos.length} 项</span>
        </div>

        <div class="todo-list-proto">
          ${
            todos.length
              ? todos.map((t) => todoRow(t, today)).join('')
              : `<div class="empty-state-inline empty-state-inline--lg">${Icons.el('check', 'icon-lg')}<p>暂无待办事项</p></div>`
          }
        </div>
      </div>`;

    container.querySelector('#btn-add-todo').onclick = () => openTodoModal(container);
    container.querySelector('#todo-search').oninput = Utils.debounce((e) => {
      resetInsightTodoFlags();
      filters.search = e.target.value;
      render(container);
    }, 200);
    ['filter-assignee', 'filter-status', 'filter-priority'].forEach((id) => {
      container.querySelector(`#${id}`)?.addEventListener('change', (e) => {
        resetInsightTodoFlags();
        const key = id.replace('filter-', '');
        filters[key === 'assignee' ? 'assignee' : key] = e.target.value;
        render(container);
      });
    });

    container.querySelectorAll('[data-cycle]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.cycle;
        const t = Store.getTodos().find((x) => x.id === id);
        if (!t) return;
        const next = { pending: 'in_progress', in_progress: 'done', done: 'pending' };
        Store.updateTodo(id, { status: next[t.status] || 'pending' });
        render(container);
      };
    });
    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.onclick = () => {
        Store.deleteTodo(btn.dataset.delete);
        Utils.showToast('已删除', 'info');
        render(container);
      };
    });
  }

  function selectFilter(label, id, options, value) {
    return `
      <label class="filter-select-wrap">
        <select id="${id}" class="form-input filter-select-proto" title="${label}">
          ${options.map((o) => `<option value="${o}"${o === value ? ' selected' : ''}>${o}</option>`).join('')}
        </select>
      </label>`;
  }

  function mapStatus(s) {
    return { pending: '未开始', in_progress: '进行中', done: '已完成' }[s] || s;
  }

  function openTodoModal(container) {
    const { overlay, close } = Utils.showModal({
      title: '新建待办事项',
      body: Utils.newTodoFormHTML(null),
      footer: `
        <button type="button" class="btn btn-ghost modal-cancel">取消</button>
        <button type="button" class="btn btn-primary" id="btn-save-todo">添加</button>
      `,
    });

    overlay.querySelector('.modal-cancel').onclick = close;
    overlay.querySelector('#btn-save-todo').onclick = () => {
      const form = overlay.querySelector('#form-todo');
      const r = Utils.saveTodoFromForm(form);
      if (r.error) return Utils.showToast(r.error, 'error');
      close();
      Utils.showToast('待办已添加', 'success');
      render(container);
    };
  }

  function getFilteredTodos() {
    const today = new Date().toISOString().slice(0, 10);
    const nowMs = Date.now();
    return Store.getTodos().filter((t) => {
      const label = mapStatus(t.status);
      const pr = t.priority || '中';

      if (filters.overdueOnly) {
        if (t.status === 'done') return false;
        if (!t.dueAt || t.dueAt.slice(0, 10) >= today) return false;
      }

      if (filters.openOnly && t.status === 'done') return false;

      if (filters.dueWithinDays != null && Number.isFinite(filters.dueWithinDays)) {
        if (t.status === 'done') return false;
        if (!t.dueAt) return false;
        const tt = new Date(t.dueAt).getTime();
        const endMs = nowMs + filters.dueWithinDays * 86400000;
        if (!(tt >= nowMs && tt <= endMs)) return false;
      }

      if (filters.highPriorityOnly) {
        if (t.status === 'done') return false;
        if (String(pr) !== '高') return false;
      }

      if (filters.unassignedOnly) {
        if (t.status === 'done') return false;
        if ((t.assigneeId || '').toString()) return false;
        if ((t.assigneeName || '').trim()) return false;
      }

      if (filters.assignee !== '全部') {
        if (filters.assignee === '未设负责人') {
          if (t.assigneeName) return false;
        } else if (t.assigneeName !== filters.assignee) return false;
      }
      if (filters.status !== '全部' && label !== filters.status) return false;
      if (filters.priority !== '全部' && pr !== filters.priority) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(t.assigneeName || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function todoRow(t, today) {
    const label = mapStatus(t.status);
    const overdue = t.status !== 'done' && t.dueAt && t.dueAt.slice(0, 10) < today;
    const meeting = Store.getMeeting(t.meetingId);
    const statusClass =
      label === '进行中' ? 'todo-status--progress' : label === '已完成' ? 'todo-status--done' : 'todo-status--pending';

    return `
      <article class="todo-row-proto${overdue ? ' todo-row-proto--overdue' : ''}">
        <button type="button" class="todo-cycle-btn" data-cycle="${t.id}" title="切换状态">${Icons.el('check', 'icon')}</button>
        <div class="todo-row-body">
          <div class="todo-row-title-line">
            <p class="todo-row-title${t.status === 'done' ? ' is-done' : ''}">${Utils.escapeHtml(t.title)}</p>
            <span class="priority-tag ${Utils.todoPriorityClass(t.priority)}">${t.priority || '中'}</span>
            ${overdue ? '<span class="overdue-tag">已逾期</span>' : ''}
          </div>
          <div class="todo-row-meta">
            <span>${Icons.el('users', 'icon-sm')} ${Utils.escapeHtml(t.assigneeName || '未设负责人')}</span>
            <span>${Icons.el('calendar', 'icon-sm')} ${t.dueAt ? Utils.formatDateShort(t.dueAt) : '—'}</span>
            ${meeting ? `<span class="todo-meeting-ref">来自：${Utils.escapeHtml(meeting.title)}</span>` : ''}
          </div>
        </div>
        <span class="todo-status-badge ${statusClass}">${label}</span>
        <button type="button" class="btn-icon" data-delete="${t.id}" title="删除">${Icons.el('trash', 'icon-sm')}</button>
      </article>`;
  }

  return { render };
})();
