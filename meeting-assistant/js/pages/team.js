const TeamPage = (() => {
  /** 组织架构：筛选与分配 */
  const DEPARTMENTS = ['全部', '产品部', '研发部', '设计部', '项目部', '运营部', '市场部'];
  /** 邀请时可选部门（不含「全部」「未分配」） */
  const DEPARTMENTS_INVITE = DEPARTMENTS.filter((d) => d !== '全部');

  const AVATAR_GRADIENTS = [
    'avatar-grad--blue',
    'avatar-grad--purple',
    'avatar-grad--green',
    'avatar-grad--amber',
    'avatar-grad--red',
    'avatar-grad--teal',
  ];

  let dept = '全部';

  /** 与子串匹配的得分（支持中文 IME；仅用于排序） */
  function subfieldScore(rawField, needle) {
    const n = needle.trim();
    if (!n) return 0;
    const field = rawField ?? '';
    if (!field.length) return 0;
    const fLower = field.toLowerCase();
    const nLower = n.toLowerCase();
    let idx = field.indexOf(n);
    if (idx === -1) idx = fLower.indexOf(nLower);
    if (idx === -1) return 0;
    let base;
    if (field === n || fLower === nLower) base = 520;
    else if (idx === 0) base = 420;
    else base = Math.max(200, 300 - idx * 8);
    const lenBoost = Math.max(40, 120 - field.length);
    return base + lenBoost;
  }

  /** 多名称组合匹配：姓名加权最高 */
  function memberMatchScore(m, needle) {
    const n = needle.trim();
    if (!n) return 1;
    let best = 0;
    best = Math.max(best, subfieldScore(m.name, n) * 1.2);
    best = Math.max(best, subfieldScore(m.jobTitle, n));
    best = Math.max(best, subfieldScore(m.department, n) * 0.95);
    best = Math.max(best, subfieldScore((m.email || '').toLowerCase(), n.toLowerCase()) * 0.92);
    best = Math.max(best, subfieldScore(m.role, n) * 0.55);
    return Math.round(best);
  }

  function membersRankedForView(team, deptFilter, queryRaw) {
    const q = (queryRaw || '').trim();
    const base = team.filter((m) => {
      if (deptFilter !== '全部' && (m.department || '') !== deptFilter) return false;
      return true;
    });
    if (!q) {
      return base.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'));
    }
    return base
      .map((m) => ({ m, s: memberMatchScore(m, q) }))
      .filter((row) => row.s > 0)
      .sort(
        (a, b) => b.s - a.s || (a.m.name || '').localeCompare(b.m.name || '', 'zh-Hans-CN')
      )
      .map((row) => row.m);
  }

  let teamSearchDebounce = null;

  function renderMemberCardsInto(shell, mainContainer, members) {
    const grid = shell.querySelector('#team-grid');
    if (!grid) return;
    grid.innerHTML = members.length
      ? members.map((m, i) => memberCard(m, i)).join('')
      : '<p class="team-grid-empty">无匹配成员，可换一个关键词试试</p>';
    grid.querySelectorAll('[data-delete-member]').forEach((btn) => {
      btn.onclick = () => {
        if (confirm('确定移除该成员？')) {
          Store.deleteTeamMember(btn.dataset.deleteMember);
          Utils.showToast('已移除', 'info');
          render(mainContainer);
        }
      };
    });
  }

  /** 输入法合成期间也能稳定输入：只替换列表，不重绘输入框所在 DOM */
  function bindTeamShellEvents(shell, mainContainer) {
    shell.querySelector('#btn-invite').onclick = () => openInviteModal(mainContainer);

    shell.querySelectorAll('[data-dept]').forEach((btn) => {
      btn.onclick = () => {
        dept = btn.dataset.dept;
        render(mainContainer);
      };
    });

    const searchEl = shell.querySelector('#team-search');
    searchEl?.addEventListener('input', () => {
      window.clearTimeout(teamSearchDebounce);
      teamSearchDebounce = window.setTimeout(() => {
        const q = searchEl.value;
        const ranked = membersRankedForView(Store.getTeam(), dept, q);
        renderMemberCardsInto(shell, mainContainer, ranked);
      }, 200);
    });

    shell.querySelectorAll('[data-delete-member]').forEach((btn) => {
      btn.onclick = () => {
        if (confirm('确定移除该成员？')) {
          Store.deleteTeamMember(btn.dataset.deleteMember);
          Utils.showToast('已移除', 'info');
          render(mainContainer);
        }
      };
    });
  }

  function render(container) {
    const team = Store.getTeam();
    const prevShell = container.querySelector('#ma-team-shell');
    const preservedQuery = prevShell?.querySelector('#team-search')?.value ?? '';
    const filtered = membersRankedForView(team, dept, preservedQuery);

    container.innerHTML = `
      <div class="page-scroll" id="ma-team-shell">
        <div class="dash-header">
          <div>
            <h1 class="dash-title">团队管理</h1>
          </div>
          <button type="button" class="btn btn-primary" id="btn-invite">${Icons.el('plus', 'icon')} 邀请成员</button>
        </div>

        <div class="stats-grid-4 stats-grid-4--compact">
          <div class="stat-card-proto stat-card-proto--center">
            <p class="stat-card-value">${team.length}</p>
            <p class="stat-card-label">总成员</p>
          </div>
          <div class="stat-card-proto stat-card-proto--center">
            <p class="stat-card-value text-blue">${team.filter((m) => (m.role || '') !== '观察者').length}</p>
            <p class="stat-card-label">可协作人数</p>
            <p class="stat-card-sublabel">不含观察者</p>
          </div>
          <div class="stat-card-proto stat-card-proto--center">
            <p class="stat-card-value text-purple">${team.filter((m) => (m.role || '') === '管理员').length}</p>
            <p class="stat-card-label">管理员</p>
          </div>
          <div class="stat-card-proto stat-card-proto--center">
            <p class="stat-card-value">${team.filter((m) => (m.role || '') === '观察者').length}</p>
            <p class="stat-card-label">观察者</p>
          </div>
        </div>

        <div class="filter-row">
          <div class="search-box search-box--inline">
            <span class="icon icon-sm">${Icons.search}</span>
            <input type="search" id="team-search" autocomplete="off" spellcheck="false" placeholder="按姓名、部门、邮箱、岗位等搜索…" />
          </div>
          <div class="dept-pills">
            ${DEPARTMENTS.map(
              (d) =>
                `<button type="button" class="filter-pill${dept === d ? ' active' : ''}" data-dept="${d}">${d}</button>`
            ).join('')}
          </div>
        </div>

        <div class="team-grid-proto" id="team-grid">
          ${filtered.map((m, i) => memberCard(m, i)).join('')}
        </div>
      </div>`;

    const shell = container.querySelector('#ma-team-shell');
    const inp = shell?.querySelector('#team-search');
    if (inp) inp.value = preservedQuery;
    bindTeamShellEvents(shell, container);
  }

  /** _permission：成员 | 管理员 | 观察者（系统权限），非职级头衔 */
  function memberCard(m, idx) {
    const grad = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
    const permission = (m.role || '成员').trim();
    const roleClass =
      permission === '管理员'
        ? 'role-badge--admin'
        : permission === '观察者'
          ? 'role-badge--viewer'
          : 'role-badge--member';

    const dept = (m.department || '').trim() || '—';
    const title = (m.jobTitle || '').trim();
    const orgLine = title ? `${dept} · ${title}` : dept;

    const meetings = Store.getMeetings().filter((mt) => (mt.invitees || []).some((i) => i.id === m.id)).length;
    const todos = Store.getTodos().filter((t) => t.assigneeId === m.id).length;

    return `
      <article class="team-card-proto">
        <div class="team-card-top">
          <div class="team-card-user">
            <div class="team-avatar-wrap">
              <div class="team-avatar-proto ${grad}">${m.name.charAt(0)}</div>
              <span class="team-online-dot"></span>
            </div>
            <div>
              <p class="team-card-name">${Utils.escapeHtml(m.name)}</p>
              <p class="team-card-dept">${Utils.escapeHtml(orgLine)}</p>
            </div>
          </div>
          <button type="button" class="btn-icon" data-delete-member="${m.id}" title="移除">${Icons.el('trash', 'icon-sm')}</button>
        </div>
        <div class="team-card-contact">
          <span>${Icons.el('link', 'icon-sm')} ${Utils.escapeHtml(m.email)}</span>
        </div>
        <div class="team-card-footer">
          <div class="team-card-permission">
            <span class="permission-caption">权限</span>
            <span class="role-badge ${roleClass}">${Utils.escapeHtml(permission)}</span>
          </div>
          <div class="team-card-stats">
            <span>${Icons.el('video', 'icon-sm')} ${meetings}</span>
            <span>${Icons.el('check', 'icon-sm')} ${todos}</span>
          </div>
        </div>
      </article>`;
  }

  function openInviteModal(container) {
    const deptOptions = DEPARTMENTS_INVITE.map(
      (d) => `<option value="${d}">${d}</option>`
    ).join('');

    const { overlay, close } = Utils.showModal({
      title: '邀请团队成员',
      body: `
        <p class="modal-sub">通过邮箱发送邀请。<strong>权限角色</strong>与<strong>所属部门 · 岗位</strong>含义不同，请分别选择。</p>
        <form id="form-invite" class="form">
          <label class="form-label">邮箱地址</label>
          <input type="email" name="email" class="form-input" placeholder="输入邮箱地址…" required />
          <label class="form-label">姓名</label>
          <input type="text" name="name" class="form-input" required />

          <div class="form-row-2">
            <div>
              <label class="form-label">权限角色</label>
              <select name="permission" class="form-input" title="系统在会议等功能中的操作权限">
                <option value="成员" selected>成员</option>
                <option value="管理员">管理员</option>
                <option value="观察者">观察者</option>
              </select>
            </div>
            <div>
              <label class="form-label">所属部门</label>
              <select name="department" class="form-input" title="组织架构，用于筛选与展示">${deptOptions}</select>
            </div>
          </div>

          <label class="form-label">岗位（选填）</label>
          <input type="text" name="jobTitle" class="form-input" placeholder="如：产品经理、前端工程师…" />

          <div class="invite-hint invite-hint-structure">
            <strong>权限</strong>：成员可协同编辑会议；管理员可管理团队；观察者只读。<br />
            <strong>部门 · 岗位</strong>：与权限无关，仅表示组织归属与职务标签。
          </div>
        </form>
      `,
      footer: `
        <button type="button" class="btn btn-ghost modal-cancel">取消</button>
        <button type="button" class="btn btn-primary" id="btn-send-invite">发送邀请</button>
      `,
    });

    overlay.querySelector('.modal-cancel').onclick = close;
    overlay.querySelector('#btn-send-invite').onclick = () => {
      const form = overlay.querySelector('#form-invite');
      const fd = new FormData(form);
      const email = fd.get('email')?.toString().trim();
      const name = fd.get('name')?.toString().trim();
      if (!email || !name) return Utils.showToast('请填写邮箱与姓名', 'error');
      Store.addTeamMember({
        name,
        email,
        role: fd.get('permission')?.toString() || '成员',
        department: fd.get('department')?.toString().trim() || '产品部',
        jobTitle: fd.get('jobTitle')?.toString().trim() || '',
      });
      close();
      Utils.showToast('邀请已发送', 'success');
      render(container);
    };
  }

  return { render };
})();
