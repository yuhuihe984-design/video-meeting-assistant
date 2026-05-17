/**
 * 首页统计卡跳转的数据看板 + 基于本地数据的规则化「AI」解读（演示）
 */
const InsightsPage = (() => {
  const KIND_META = {
    meetings: {
      headline: '会议数据看板',
      badge: '排期与会务节奏',
      iconHtml: Icons.el('video', 'icon'),
      tone: 'blue',
    },
    pending: {
      headline: '待处理事项看板',
      badge: '执行与截止日期',
      iconHtml: Icons.el('check', 'icon'),
      tone: 'amber',
    },
    done: {
      headline: '已完成事项看板',
      badge: '产出与结案质量',
      iconHtml: Icons.el('trending', 'icon'),
      tone: 'green',
    },
    team: {
      headline: '团队与成员看板',
      badge: '人力结构与覆盖面',
      iconHtml: Icons.el('users', 'icon'),
      tone: 'purple',
    },
  };

  function safeKind(kind) {
    return KIND_META[kind] ? kind : 'meetings';
  }

  function analysisForMeetings(meetings) {
    const week = Utils.meetingsScheduledThisWeek(meetings);
    const inProg = meetings.filter((m) => m.status === 'in_progress' || m.status === 'paused');
    const sched = meetings.filter((m) => m.status === 'scheduled');
    const ended = meetings.filter((m) => m.status === 'ended');
    const heavy = [...meetings].sort((a, b) => {
      const la = Array.isArray(a.agenda) ? a.agenda.length : 0;
      const lb = Array.isArray(b.agenda) ? b.agenda.length : 0;
      return lb - la;
    })[0];
    const avgPlan =
      meetings.length &&
      meetings.reduce((s, m) => s + (m.plannedDurationMinutes || 60), 0) / meetings.length;

    const lines = [
      `本周已排期的会议 **${week.length}** 场；其中「进行中/暂停」**${inProg.length}** 场、「待召开」**${sched.length}** 场、「已结束」**${ended.length}** 场（全库口径）。`,
      week.length >= 8
        ? '本周会务密度偏高，建议合并评审类会议、错峰关键干系人的参与时长，议程控制在「少而准」三件事以内。'
        : week.length <= 3
          ? '本周会议负载偏低窗口较多，可把跨团队对齐前移，或将规划类议题集中到一场「主题会」提高效率。'
          : '本周会议节奏中等，可把「议程目标时长」与「实际已开会计时」配对复盘，逐步形成稳定节奏。',
      heavy && (heavy.agenda || []).length > 5
        ? `「${heavy.title || '某会议'}」议程项偏多（${(heavy.agenda || []).length} 项），可先固定决策项与信息采集项的顺序，超时部分列入「跟进专题」避免主会场发散。`
        : '议程结构整体紧凑；若单场会议超过 45 分钟，可把「信息采集」移到会前异步完成，主会场只决议与对齐。',
      `全部会议议程目标时长均值约 **${Math.round(avgPlan || 0)}** 分钟；对于超过 75 分钟的排期，可拆成两段或增加明确的中场休息。`,
    ];

    const highlights = [];
    highlights.push(`${week.length} 场`);
    highlights.push(`${inProg.length + sched.length} 场未结束`);

    return { lines, highlights };
  }

  function buildMeetingActions(meetings) {
    const week = Utils.meetingsScheduledThisWeek(meetings);
    const actions = [
      {
        label: '首页会议列表只看「进行中」',
        intent: { target: 'home', activeFilter: '进行中', toastHint: '已筛选：进行中会议' },
      },
      {
        label: '首页只看「即将开始」',
        intent: { target: 'home', activeFilter: '即将开始', toastHint: '已筛选：即将开始' },
      },
      {
        label: '首页只看「已结束」',
        intent: { target: 'home', activeFilter: '已结束', toastHint: '已筛选：已结束' },
      },
      {
        label: `首页仅限本周排期（${week.length} 场）`,
        intent: {
          target: 'home',
          activeFilter: '全部',
          weekScoped: true,
          sortKey: 'time_asc',
          toastHint: '会议列表限定为本周（周一起）内排期的会议',
        },
      },
    ];

    const heavy = [...meetings].sort((a, b) => ((b.agenda || []).length || 0) - ((a.agenda || []).length || 0))[0];
    const titlePiece = (heavy?.title || '').trim().slice(0, 40);
    if (titlePiece && (heavy.agenda || []).length >= 4) {
      actions.push({
        label: `按标题关键字定位议程偏多场次`,
        intent: {
          target: 'home',
          activeFilter: '全部',
          meetingSearchQuery: titlePiece,
          toastHint: '已填入议程较多会议的标题前缀，可在搜索框继续微调',
        },
      });
    }

    return actions;
  }

  function analysisForPending(todos) {
    const open = todos.filter((t) => t.status !== 'done');
    const now = Date.now();
    const d7 = now + 7 * 86400000;
    const overdue = open.filter((t) => {
      const ts = t.dueAt ? new Date(t.dueAt).getTime() : NaN;
      return !Number.isNaN(ts) && ts < now;
    });
    const dueSoon = open.filter((t) => {
      const ts = t.dueAt ? new Date(t.dueAt).getTime() : NaN;
      return !Number.isNaN(ts) && ts >= now && ts <= d7;
    });
    const noDue = open.filter((t) => !t.dueAt);
    const hi = open.filter((t) => String(t.priority) === '高');
    const unassigned = open.filter((t) => !(t.assigneeId || '').toString());

    const lines = [
      `当前未结案待办 **${open.length}** 条（含待定截止），其中已逾期 **${overdue.length}** 条，7 日内到期 **${dueSoon.length}** 条。`,
      overdue.length > 0
        ? '优先清空逾期项：为每条逾期待办写明「卡点 + 下一位 Decision Owner」，避免在周会反复复述同一停滞问题。'
        : '目前没有逾期项窗口，可把精力留给高优先级事项的「收尾验收」和预防性沟通。',
      noDue.length > open.length / 3
        ? `约 **${noDue.length}** 条未设截止时间，易导致隐性拖延；可为「信息采集 / 校对 / 小交付」补上轻量 DDL。`
          : `未设截止的事项占比适中；对「对齐类」可以保持灵活，但对「产出类」仍需明确期望完成日。`,
      hi.length > 0
        ? `高优先级未完成 **${hi.length}** 条——建议集中到一位协调人做一次「优先级冲突」梳理，砍掉伪高优。`
        : '暂无标记高优阻塞项——保持每日短清单复盘即可稳住节奏。',
      unassigned.length > 0
        ? `有 **${unassigned.length}** 条未指定负责人——容易在群内「集体可见无人认领」，请补充 @负责人。`
        : '待办指派覆盖较完整——接下来关注跨人依赖的沟通频率即可。',
    ];

    const highlights = [];
    highlights.push(`${open.length} 条未完成`);
    highlights.push(`${overdue.length} 条逾期`);

    return { lines, highlights };
  }

  function buildPendingActions() {
    return [
      { label: '待办列表：未完成', intent: { target: 'todos', openOnly: true, toastHint: '已筛选未完成待办' } },
      {
        label: '待办列表：已逾期未完成',
        intent: { target: 'todos', openOnly: true, overdueOnly: true, toastHint: '已筛选逾期且未完成' },
      },
      {
        label: '待办列表：未来 7 日内到期未完成',
        intent: { target: 'todos', openOnly: true, dueWithinDays: 7, toastHint: '已筛选未来 7 天内到期（未完成）' },
      },
      {
        label: '待办列表：高优先级未完成',
        intent: { target: 'todos', openOnly: true, highPriorityOnly: true, toastHint: '已筛选高优先级未完成' },
      },
      {
        label: '待办列表：负责人未指派且未完成',
        intent: {
          target: 'todos',
          openOnly: true,
          unassignedOnly: true,
          toastHint: '已筛选未指派负责人的未完成待办',
        },
      },
    ];
  }

  function analysisForDone(todos) {
    const all = todos.length;
    const done = todos.filter((t) => t.status === 'done');
    const open = todos.filter((t) => t.status !== 'done');
    const rate = all ? Math.round((done.length / all) * 100) : 0;
    const withMeeting = done.filter((t) => !!t.meetingId).length;
    const withAssignee = done.filter((t) => !!(t.assigneeId || t.assigneeName)).length;

    const lines = [
      `结案事项 **${done.length}** 条，未完成 **${open.length}** 条，整体结案率 **${rate}%**（口径：本地演示库）。`,
      rate >= 60
        ? '结案率尚可说明「定义清晰 + 收口动作」偏多；可把重复性结论沉淀模板（纪要段落、复盘清单），进一步压缩沟通成本。'
        : '结案率有提升空间：检查是否缺少验收标准或未把「会后 24h 首轮同步」设为固定节奏。',
      withMeeting >= done.length * 0.5 && done.length
        ? '多数已完成事项与会议关联较强——说明会务驱动执行有效；可把「行动中」也尽量挂会议上下文，闭环更直观。'
        : '结案项与会议的关联可以更紧密：建议把会后待办自动生成到对应会议页的「会后整理」，减少口头承诺遗漏。',
      withAssignee >= done.length * 0.7 && done.length
        ? '负责人字段覆盖较好，结案轨迹更利于回溯与绩效讨论。'
          : '部分结案条目缺少责任人记录——在历史回顾时难以归因，可把「谁收口」设为必填。',
    ];

    const highlights = [];
    highlights.push(`${done.length} 条已结案`);
    highlights.push(`${rate}% 结案率`);

    return { lines, highlights };
  }

  function buildDoneActions() {
    return [
      { label: '待办列表只看「已完成」', intent: { target: 'todos', status: '已完成', toastHint: '已筛选已完成' } },
      { label: '待办列表：未完成缺口', intent: { target: 'todos', openOnly: true, toastHint: '已筛选未完成' } },
    ];
  }

  function analysisForTeam(team, todos) {
    const byDept = {};
    team.forEach((m) => {
      const d = m.department || '（未标注部门）';
      byDept[d] = (byDept[d] || 0) + 1;
    });
    const topDept = [...Object.entries(byDept)].sort((a, b) => b[1] - a[1])[0];
    const open = todos.filter((t) => t.status !== 'done');
    let loadHits = [...team].map((m) => ({
      member: m,
      n: open.filter((t) => t.assigneeId === m.id || t.assigneeName === m.name).length,
    }));
    loadHits.sort((a, b) => b.n - a.n);

    const lines = [
      `团队共 **${team.length}** 人覆盖 **${Object.keys(byDept).length}** 个部门标签维度；${
        topDept ? `人数最多的是「${topDept[0]}」（${topDept[1]} 人）。` : ''
      }`,
      Object.keys(byDept).length <= 4
        ? '组织标签略集中——跨职能评审时要特别留意视角单一风险，可周期性邀请边缘角色补充意见。'
        : '部门标签较分散——会务邀请可多用「部门批量」减少漏选新人或协作方。',
      loadHits.length && loadHits[0].n > 4
        ? `「${loadHits[0].member.name}」肩上未结案待办 **${loadHits[0].n}** 条，负载偏高——建议分拆或顺延低优项，并把依赖方拉进对齐。`
        : '负载在成员间相对均衡——适合继续用「认领制 + 例会短清单」维护节奏。',
      `未完成待办中与团队关联的条目（指派到成员或姓名匹配）总计 **${open.filter((t) => t.assigneeId || (t.assigneeName || '').trim()).length}** 条——可用待办页的筛选快速扫尾。`,
    ];

    const highlights = [];
    highlights.push(`${team.length} 成员`);
    if (topDept) highlights.push(`${topDept[0]} ×${topDept[1]}`);

    return { lines, highlights };
  }

  function buildTeamActions(team, todos) {
    const actions = [];
    actions.push({
      label: '待办：负责人未指派且未完成',
      intent: {
        target: 'todos',
        openOnly: true,
        unassignedOnly: true,
        toastHint: '已筛选团队侧未认领的未完成待办',
      },
    });

    const open = todos.filter((t) => t.status !== 'done');
    const loadHits = [...team]
      .map((m) => ({
        member: m,
        n: open.filter((t) => t.assigneeId === m.id || t.assigneeName === m.name).length,
      }))
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n);

    if (loadHits.length && loadHits[0].n >= 3) {
      const { name } = loadHits[0].member;
      actions.push({
        label: `待办：@${name} 名下未完成 (${loadHits[0].n})`,
        intent: {
          target: 'todos',
          assignee: name,
          openOnly: true,
          toastHint: `已按负责人筛选：${name}（未完成）`,
        },
      });
    }

    return actions;
  }

  function renderMarkdownLite(text) {
    return Utils.escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function encodeIntent(intent) {
    return encodeURIComponent(JSON.stringify(intent));
  }

  function render(kind, container) {
    const k = safeKind(kind);
    const meta = KIND_META[k];
    const meetings = Store.getMeetings();
    const todos = Store.getTodos();
    const team = Store.getTeam();

    let analysis = { lines: [], highlights: [] };
    let actions = [];

    if (k === 'meetings') {
      analysis = analysisForMeetings(meetings);
      actions = buildMeetingActions(meetings);
    } else if (k === 'pending') {
      analysis = analysisForPending(todos);
      actions = buildPendingActions();
    } else if (k === 'done') {
      analysis = analysisForDone(todos);
      actions = buildDoneActions();
    } else if (k === 'team') {
      analysis = analysisForTeam(team, todos);
      actions = buildTeamActions(team, todos);
    }

    const bullets = analysis.lines
      .map((line) => `<li class="insights-ai-li">${renderMarkdownLite(line)}</li>`)
      .join('');

    const chips = analysis.highlights
      .slice(0, 6)
      .map((t) => `<span class="insights-mini-chip">${Utils.escapeHtml(t)}</span>`)
      .join('');

    const actionButtons = actions
      .map(
        (a) => `
          <button type="button" class="btn btn-secondary btn-sm insights-action-btn" data-intent="${encodeIntent(a.intent)}">
            ${Icons.el('chevronR', 'icon-sm')} ${Utils.escapeHtml(a.label)}
          </button>`
      )
      .join('');

    container.innerHTML = `
      <div class="page-scroll insights-page-root">
        <a href="#" class="back-link" id="insights-back">${Icons.el('chevronL', 'icon-sm')} 返回首页</a>

        <div class="insights-hero insights-hero--${meta.tone}">
          <div class="insights-hero-icon">${meta.iconHtml}</div>
          <div class="insights-hero-text">
            <h1 class="insights-hero-title">${Utils.escapeHtml(meta.headline)}</h1>
            <p class="insights-hero-sub">${Utils.escapeHtml(meta.badge)} ${chips}</p>
          </div>
        </div>

        <section class="insights-actions-card">
          <div class="insights-actions-head">
            <span class="insights-actions-title">可操作下一步</span>
            <span class="insights-ai-hint">一键带上筛选条件跳到首页会议列表或待办页（本地）</span>
          </div>
          <div class="insights-action-grid">${actionButtons}</div>
        </section>

        <section class="insights-ai-card">
          <div class="insights-ai-head">
            <span class="insights-ai-tag">AI 分析（演示）</span>
            <span class="insights-ai-hint">基于当前本地工作台数据自动生成，不涉及外网推理</span>
          </div>
          <ul class="insights-ai-list">${bullets}</ul>
        </section>

        <section class="insights-links">
          <p class="insights-links-title">更多入口</p>
          <div class="insights-links-row">
            <a href="#records" class="btn btn-secondary btn-sm">${Icons.el('file', 'icon-sm')} 会议记录</a>
            <a href="#todos" class="btn btn-secondary btn-sm">${Icons.el('check', 'icon-sm')} 待办事项</a>
            <a href="#team" class="btn btn-secondary btn-sm">${Icons.el('users', 'icon-sm')} 团队管理</a>
          </div>
        </section>
      </div>
    `;

    container.querySelector('#insights-back')?.addEventListener('click', (e) => {
      e.preventDefault();
      Router.navigate('/');
    });

    container.querySelectorAll('.insights-action-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          const intent = JSON.parse(decodeURIComponent(btn.dataset.intent));
          Utils.stashNavIntent(intent);
          if (intent.target === 'home') Router.navigate('/');
          else if (intent.target === 'todos') Router.navigate('todos');
        } catch (_) {
          Utils.showToast('操作失败（数据格式异常）', 'error');
        }
      });
    });
  }

  return { render };
})();
