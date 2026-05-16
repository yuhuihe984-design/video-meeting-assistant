/**
 * 工具函数
 */
const Utils = (() => {
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  function statusLabel(status) {
    const map = {
      scheduled: '即将开始',
      in_progress: '进行中',
      paused: '已暂停',
      ended: '已结束',
    };
    return map[status] || status;
  }

  /** 首页/侧栏展示用状态（对齐原型文案） */
  function dashboardStatus(meeting) {
    if (meeting.status === 'in_progress') return '进行中';
    if (meeting.status === 'ended') return '已结束';
    if (meeting.status === 'paused') return '已暂停';
    return '即将开始';
  }

  function dashboardStatusStyle(status) {
    const map = {
      进行中: { className: 'status-pill--live' },
      已结束: { className: 'status-pill--ended' },
      即将开始: { className: 'status-pill--upcoming' },
      已暂停: { className: 'status-pill--paused' },
    };
    return map[status] || map['即将开始'];
  }

  function meetingDateParts(iso) {
    if (!iso) return { dateLabel: '—', timeLabel: '' };
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((target - today) / 86400000);
    let dateLabel;
    if (diff === 0) dateLabel = '今天';
    else if (diff === 1) dateLabel = '明天';
    else if (diff === -1) dateLabel = '昨天';
    else dateLabel = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeLabel = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return { dateLabel, timeLabel };
  }

  function meetingDuration(meeting) {
    if (meeting.startedAt && meeting.endedAt) {
      const mins = Math.round((new Date(meeting.endedAt) - new Date(meeting.startedAt)) / 60000);
      if (mins >= 60) return `${(mins / 60).toFixed(1).replace(/\.0$/, '')}h`;
      return `${mins}min`;
    }
    const p = meeting.plannedDurationMinutes;
    if (p != null && p > 0) return `${p} 分钟`;
    return '—';
  }

  function plannedDurationLabel(minutes) {
    const m = minutes != null && minutes > 0 ? minutes : 60;
    return `${m} 分钟`;
  }

  function statusClass(status) {
    const map = {
      scheduled: 'badge-scheduled',
      in_progress: 'badge-live',
      paused: 'badge-paused',
      ended: 'badge-ended',
    };
    return map[status] || '';
  }

  function todoStatusLabel(s) {
    return { pending: '未开始', in_progress: '进行中', done: '已完成' }[s] || s;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  function showModal({ title, body, footer, onClose }) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="btn-icon modal-close" aria-label="关闭">×</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;
    const close = () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 200);
      onClose?.();
    };
    overlay.querySelector('.modal-close').onclick = close;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    root.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    return { overlay, close };
  }

  /** 模拟 AI 智能摘要 */
  function generateMinutes(meeting) {
    const notes = meeting.notes || [];
    const transcript = meeting.transcript || '';
    const highlights = meeting.highlights || [];
    const actionNotes = notes.filter((n) => n.tag === 'action');
    const keyNotes = notes.filter((n) => n.tag === 'key' || n.highlighted);

    let summary = `## ${meeting.title}\n`;
    summary += `**会议时间：** ${formatDate(meeting.startedAt || meeting.scheduledAt)}`;
    if (meeting.endedAt) summary += ` — ${formatDate(meeting.endedAt)}`;
    summary += '\n\n';

    if (meeting.agenda?.length) {
      summary += '### 议程回顾\n';
      meeting.agenda.forEach((item, i) => {
        summary += `${i + 1}. ${item.title}\n`;
      });
      summary += '\n';
    }

    summary += '### 会议要点\n';
    if (keyNotes.length) {
      keyNotes.forEach((n) => {
        summary += `- ${n.text}\n`;
      });
    } else if (highlights.length) {
      highlights.forEach((h) => {
        summary += `- ${h}\n`;
      });
    } else if (notes.length) {
      notes.slice(0, 5).forEach((n) => {
        summary += `- ${n.text}\n`;
      });
    } else {
      summary += '- （暂无笔记，请补充）\n';
    }

    if (transcript) {
      summary += '\n### 语音转写摘要\n';
      const lines = transcript.split('\n').filter(Boolean).slice(-8);
      lines.forEach((l) => {
        summary += `- ${l.trim()}\n`;
      });
    }

    summary += '\n### 行动项\n';
    if (actionNotes.length) {
      actionNotes.forEach((n, i) => {
        summary += `${i + 1}. ${n.text}\n`;
      });
    } else {
      summary += '- 待补充行动项\n';
    }

    summary += '\n---\n*本纪要由 AI 根据会议笔记与录音转写自动生成，请核对后发布。*';
    return summary;
  }

  /** 模拟语音转写片段 */
  const TRANSCRIPT_SAMPLES = [
    '好的，我们先过一下本季度的产品路线图。',
    '关于用户反馈的登录问题，开发团队预计下周修复。',
    '设计稿需要在周五前完成评审。',
    '我建议将移动端适配优先级提升。',
    '会议纪要会后发给所有参会人确认。',
    '待办事项：张明负责整理需求文档，截止周三。',
    '下次会议暂定下周一上午十点。',
  ];

  const TRANSCRIPT_SAMPLES_EN = [
    "Alright, let's walk through the product roadmap for this quarter.",
    'Regarding login issues from user feedback, engineering targets a fix by next week.',
    'Designs need review sign-off before Friday.',
    'I suggest raising the priority on mobile responsiveness.',
    'We will circulate meeting minutes after the call for confirmation.',
    'Action item: Zhang Ming owns the requirements doc draft, due Wednesday.',
    "Next sync is tentatively Monday at 10 a.m.",
  ];

  /** 新建 / 会议邀请：与团队页一致的部门全集（不含「全部」） */
  const INVITE_DEPARTMENTS = ['产品部', '研发部', '设计部', '项目部', '运营部', '市场部'];

  function randomTranscriptLine() {
    return TRANSCRIPT_SAMPLES[Math.floor(Math.random() * TRANSCRIPT_SAMPLES.length)];
  }

  function randomTranscriptPair() {
    const i = Math.floor(Math.random() * TRANSCRIPT_SAMPLES.length);
    return { zh: TRANSCRIPT_SAMPLES[i], en: TRANSCRIPT_SAMPLES_EN[i] };
  }

  /** 某日所在自然周的起止（周一起算，与首页「本周」一致） */
  function weekBoundsMs(reference = new Date()) {
    const d = new Date(reference);
    const day = d.getDay();
    const toMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(d);
    start.setDate(d.getDate() + toMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: start.getTime(), end: end.getTime() };
  }

  function meetingsScheduledThisWeek(meetings, reference = new Date()) {
    const { start, end } = weekBoundsMs(reference);
    return meetings.filter((m) => {
      const t = new Date(m.scheduledAt).getTime();
      return !Number.isNaN(t) && t >= start && t < end;
    });
  }

  /** 新建会议「选择集」：部门所含成员是否已全部选中 */
  function inviteDeptFullySelected(team, dept, invitees) {
    const ids = team.filter((m) => (m.department || '') === dept && m.id).map((m) => m.id);
    if (!ids.length) return false;
    const invited = new Set((invitees || []).filter((i) => i?.id).map((i) => i.id));
    return ids.every((id) => invited.has(id));
  }

  /** 会议 invitees：点部门时在「全选该部门」与「清空该部门」之间切换（保留邮箱类无 id 邀请） */
  function toggleInviteDepartment(team, dept, invitees) {
    const deptMembers = team.filter((m) => (m.department || '') === dept && m.id);
    const byId = new Map();
    const externals = [];
    (invitees || []).forEach((i) => {
      if (i?.id) byId.set(i.id, { id: i.id, name: i.name, email: i.email });
      else externals.push(i);
    });
    const allOn = inviteDeptFullySelected(team, dept, invitees);
    if (allOn) {
      const drop = new Set(deptMembers.map((m) => m.id));
      return [...[...byId.entries()].filter(([id]) => !drop.has(id)).map(([, v]) => v), ...externals];
    }
    deptMembers.forEach((m) =>
      byId.set(m.id, { id: m.id, name: m.name, email: m.email })
    );
    return [...byId.values(), ...externals];
  }

  /** 新建会议弹窗 chips：在全选部门与清空部门之间切换 */
  function toggleInviteDeptSelection(team, dept, selected) {
    const ids = team.filter((m) => (m.department || '') === dept && m.id).map((m) => m.id);
    if (!ids.length) return;
    const allOn = ids.every((id) => selected.has(id));
    if (allOn) ids.forEach((id) => selected.delete(id));
    else ids.forEach((id) => selected.add(id));
  }

  function exportPdf(meeting) {
    const content = meeting.minutes || generateMinutes(meeting);
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${escapeHtml(meeting.title)} - 会议纪要</title>
      <style>
        body { font-family: "PingFang SC", sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.7; }
        h2 { color: #1e3a5f; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
        h3 { color: #334155; margin-top: 24px; }
        pre { white-space: pre-wrap; font-family: inherit; }
      </style></head><body>
      <pre>${escapeHtml(content)}</pre>
      <p style="color:#94a3b8;font-size:12px;margin-top:40px;">导出时间：${new Date().toLocaleString('zh-CN')}</p>
      </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
    showToast('请在打印对话框中选择「另存为 PDF」', 'info');
  }

  function copyShareLink(meetingId) {
    const url = `${location.origin}${location.pathname}#meeting/${meetingId}`;
    navigator.clipboard?.writeText(url).then(
      () => showToast('会议纪要链接已复制', 'success'),
      () => showToast(url, 'info')
    );
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function todoPriorityClass(priority) {
    const p = priority || '中';
    if (p === '高') return 'priority-tag--high';
    if (p === '低') return 'priority-tag--low';
    return 'priority-tag--mid';
  }

  function assigneeOptionsForNewTodo(meetingIdFixed) {
    const team = Store.getTeam();
    const seen = new Set();
    const chunks = [];
    chunks.push('<option value="">不设负责人（选填）</option>');
    team.forEach((m) => {
      chunks.push(`<option value="${String(m.id).replace(/"/g, '&quot;')}">${escapeHtml(m.name)}</option>`);
      seen.add(m.id);
    });
    if (meetingIdFixed) {
      const meeting = Store.getMeeting(meetingIdFixed);
      (meeting?.invitees || []).forEach((inv) => {
        const id = inv.id || inv.email;
        if (!id || seen.has(id)) return;
        seen.add(id);
        const label = inv.name || inv.email || id;
        chunks.push(`<option value="${String(id).replace(/"/g, '&quot;')}">${escapeHtml(label)}</option>`);
      });
    }
    return chunks.join('');
  }

  /**
   * 与「待办事项」页新建弹窗一致；meetingIdFixed 时锁定关联会议，负责人含会议邀请成员。
   */
  function newTodoFormHTML(meetingIdFixed = null) {
    const meetings = Store.getMeetings();
    const fixedMeeting = meetingIdFixed ? Store.getMeeting(meetingIdFixed) : null;
    const assigneeOpts = assigneeOptionsForNewTodo(meetingIdFixed);

    let meetingBlock;
    if (meetingIdFixed) {
      meetingBlock = `
        <label class="form-label">关联会议</label>
        <select class="form-input" disabled aria-readonly="true" tabindex="-1">
          <option>${escapeHtml(fixedMeeting?.title || '当前会议')}</option>
        </select>
        <input type="hidden" name="meetingId" value="${escapeHtml(meetingIdFixed)}" />`;
    } else {
      meetingBlock = `
        <label class="form-label">关联会议</label>
        <select name="meetingId" class="form-input">
          <option value="">无</option>
          ${meetings.map((m) => `<option value="${m.id}">${escapeHtml(m.title)}</option>`).join('')}
        </select>`;
    }

    return `
      <form id="form-todo" class="form form-new-todo">
        <label class="form-label">事项描述</label>
        <input type="text" name="title" class="form-input" placeholder="输入待办事项内容…" required />
        <div class="form-row-2">
          <div>
            <label class="form-label">负责人</label>
            <select name="assigneeId" class="form-input">${assigneeOpts}</select>
          </div>
          <div>
            <label class="form-label">优先级</label>
            <select name="priority" class="form-input">
              <option value="高">高</option>
              <option value="中" selected>中</option>
              <option value="低">低</option>
            </select>
          </div>
        </div>
        <label class="form-label">截止时间</label>
        <input type="date" name="dueAt" class="form-input" />
        ${meetingBlock}
      </form>`;
  }

  function resolveAssigneeName(assigneeId, meetingId) {
    const member = Store.getTeam().find((m) => m.id === assigneeId);
    if (member) return member.name;
    if (meetingId) {
      const inv = (Store.getMeeting(meetingId)?.invitees || []).find((i) => i.id === assigneeId);
      if (inv) return inv.name || inv.email || '';
    }
    return '';
  }

  function saveTodoFromForm(form) {
    const fd = new FormData(form);
    const title = fd.get('title')?.toString().trim();
    if (!title) return { error: '请填写事项描述' };
    const assigneeId = fd.get('assigneeId')?.toString() || '';
    const mid = fd.get('meetingId')?.toString().trim() || null;
    const pr = fd.get('priority')?.toString() || '中';
    const priority = ['高', '中', '低'].includes(pr) ? pr : '中';
    Store.createTodo({
      title,
      assigneeId: assigneeId || null,
      assigneeName: resolveAssigneeName(assigneeId, mid),
      meetingId: mid,
      dueAt: fd.get('dueAt') ? new Date(fd.get('dueAt').toString()).toISOString() : null,
      priority,
    });
    return { ok: true };
  }

  const NAV_INTENT_KEY = 'ma_cross_page_nav_v1';

  /** Insights 等与列表联动：单次导航意图（读出后即清除） */
  function stashNavIntent(intent) {
    try {
      sessionStorage.setItem(NAV_INTENT_KEY, JSON.stringify({ ...(intent || {}), _ts: Date.now() }));
    } catch (_) {}
  }

  function consumeNavIntent() {
    try {
      const raw = sessionStorage.getItem(NAV_INTENT_KEY);
      sessionStorage.removeItem(NAV_INTENT_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      if (o._ts != null && Date.now() - o._ts > 15 * 60 * 1000) return null;
      delete o._ts;
      return o;
    } catch (_) {
      return null;
    }
  }

  return {
    formatDate,
    formatDateShort,
    statusLabel,
    statusClass,
    dashboardStatus,
    dashboardStatusStyle,
    meetingDateParts,
    meetingDuration,
    plannedDurationLabel,
    todoStatusLabel,
    escapeHtml,
    showToast,
    showModal,
    generateMinutes,
    randomTranscriptLine,
    randomTranscriptPair,
    INVITE_DEPARTMENTS,
    weekBoundsMs,
    meetingsScheduledThisWeek,
    inviteDeptFullySelected,
    toggleInviteDepartment,
    toggleInviteDeptSelection,
    exportPdf,
    copyShareLink,
    debounce,
    todoPriorityClass,
    newTodoFormHTML,
    saveTodoFromForm,
    stashNavIntent,
    consumeNavIntent,
  };
})();
