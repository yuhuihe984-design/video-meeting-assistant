const MeetingPage = (() => {
  let recordingInterval = null;
  let meetingTimer = null;

  function phaseStorageKey(meetingId) {
    return `ma_phase_view_${meetingId}`;
  }

  function inferWorkflowPhase(meeting) {
    if (meeting.status === 'ended') return 3;
    if (meeting.status === 'in_progress' || meeting.status === 'paused') return 2;
    return 1;
  }

  function getViewPhase(meetingId, workflowPhase) {
    try {
      const v = sessionStorage.getItem(phaseStorageKey(meetingId));
      if (v === '1' || v === '2' || v === '3') return parseInt(v, 10);
    } catch (_) {}
    return workflowPhase;
  }

  function setViewPhase(meetingId, phase) {
    try {
      sessionStorage.setItem(phaseStorageKey(meetingId), String(phase));
    } catch (_) {}
  }

  function elapsedEndMs(meeting) {
    if (!meeting?.startedAt) return null;
    if (meeting.endedAt) return new Date(meeting.endedAt).getTime();
    if (meeting.status === 'paused' && meeting.pausedSince)
      return new Date(meeting.pausedSince).getTime();
    return Date.now();
  }

  /** 从开始到当前/暂停点/结束 的已过秒数 */
  function elapsedSecondsMeeting(meeting) {
    if (!meeting?.startedAt) return 0;
    const start = new Date(meeting.startedAt).getTime();
    const endMs = elapsedEndMs(meeting);
    return Math.max(0, Math.floor((endMs - start) / 1000));
  }

  function formatMMSS(sec) {
    const s = Math.max(0, Math.floor(sec));
    const min = Math.floor(s / 60);
    const r = s % 60;
    return `${String(min).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function formatElapsedDigits(meeting) {
    if (!meeting?.startedAt) return '未计时';
    const sec = elapsedSecondsMeeting(meeting);
    return formatMMSS(sec);
  }

  /** 语音转写区：单语或中英双栏（演示） */
  function transcriptBoxInner(m) {
    const zh = (m.transcript || '').trim();
    const en = (m.transcriptEn || '').trim();
    if (!zh && !en) return '<p class="empty-hint">转写内容将显示在这里</p>';
    if (m.transcriptBilingual) {
      return `<div class="transcript-bilingual">
        <div class="transcript-bilingual-col">
          <div class="transcript-bilingual-h">English（演示）</div>
          <pre class="transcript-pre">${Utils.escapeHtml(m.transcriptEn || '')}</pre>
        </div>
        <div class="transcript-bilingual-col">
          <div class="transcript-bilingual-h">中文翻译</div>
          <pre class="transcript-pre">${Utils.escapeHtml(m.transcript || '')}</pre>
        </div>
      </div>`;
    }
    return `<pre class="transcript-pre transcript-pre--solo">${Utils.escapeHtml(m.transcript || '')}</pre>`;
  }

  /** 按计划议程时长计算的剩余可走时间（与同一条「已开会」正计时一致） */
  function planTimeCompareLine(meeting, plannedMin) {
    const pm = plannedMin ?? 60;
    if (!meeting.startedAt) return '';
    const elapsed = elapsedSecondsMeeting(meeting);
    if (meeting.status === 'ended') {
      return `本次会议用时 ${formatMMSS(elapsed)} · 议程计划 ${pm} 分钟`;
    }
    const plannedSec = pm * 60;
    const diff = plannedSec - elapsed;
    if (diff >= 0) return `预计议程结束还有 ${formatMMSS(diff)}`;
    return `已过议程预定结束 ${formatMMSS(-diff)}`;
  }


  /** 仅为邮箱等非团队成员邀请展示列表（避免与上方成员芯片重复） */
  function inviteNonTeamListHtml(meeting) {
    const teamIds = new Set(Store.getTeam().map((t) => t.id));
    const extra = (meeting.invitees || []).filter(
      (inv) => inv && (!inv.id || !teamIds.has(inv.id))
    );
    if (!extra.length) return '';
    const items = extra
      .map(
        (i) =>
          `<li>${Utils.escapeHtml(i.name || i.email || '')}${i.email ? ` <span class="invite-email-muted">(${Utils.escapeHtml(i.email)})</span>` : ''}</li>`
      )
      .join('');
    return `
      <div class="invite-external-wrap">
        <p class="invite-external-label">邮箱 / 外部邀请（非团队成员）</p>
        <ul class="invite-external-list">${items}</ul>
      </div>`;
  }

  function render(meetingId, container) {
    stopTimers();
    const meeting = Store.getMeeting(meetingId);
    if (!meeting) {
      container.innerHTML = `<div class="empty-state"><p>会议不存在</p><a href="#" class="btn btn-primary">返回首页</a></div>`;
      container.querySelector('a').onclick = (e) => { e.preventDefault(); Router.navigate('/'); };
      return;
    }

    const team = Store.getTeam();
    const isLive = meeting.status === 'in_progress';
    const isPaused = meeting.status === 'paused';
    const isEnded = meeting.status === 'ended';
    const workflowPhase = inferWorkflowPhase(meeting);
    const viewPhase = getViewPhase(meetingId, workflowPhase);
    const plannedMin = meeting.plannedDurationMinutes ?? 60;
    const timerDigits =
      meeting.startedAt ? formatElapsedDigits(meeting) : '未计时';
    const planCompareLine = planTimeCompareLine(meeting, plannedMin);
    const planCompareCaption = planCompareLine ? Utils.escapeHtml(planCompareLine) : '';

    container.innerHTML = `
      <div class="meeting-page-root">
      <header class="meeting-header">
        <a href="#" class="back-link" id="back-dashboard">${Icons.el('chevronL', 'icon-sm')} 返回首页</a>
        <div class="meeting-title-row">
          <input type="text" class="meeting-title-input" id="meeting-title" value="${Utils.escapeHtml(meeting.title)}" title="编辑会议标题" />
          <span class="badge ${Utils.statusClass(meeting.status)}">${Utils.statusLabel(meeting.status)}</span>
        </div>
        <p class="meeting-schedule">
          ${Icons.el('calendar', 'icon-sm')} ${Utils.formatDate(meeting.scheduledAt)}
          <span class="meeting-schedule-extra" title="排期时设定的议程目标时长：用于标示与对照，系统不会为它单独走时"> · 议程计划 ${Utils.plannedDurationLabel(plannedMin)}（目标）</span>
        </p>
        <div class="meeting-controls" id="meeting-controls">
          ${!isEnded ? `
            ${meeting.status === 'scheduled' ? `<button type="button" class="btn btn-success" id="btn-start">${Icons.el('play', 'icon-sm')} 开始会议</button>` : ''}
            ${isLive ? `<button type="button" class="btn btn-warning" id="btn-pause">${Icons.el('pause', 'icon-sm')} 暂停</button>` : ''}
            ${isPaused ? `<button type="button" class="btn btn-success" id="btn-resume">${Icons.el('play', 'icon-sm')} 继续</button>` : ''}
            ${(isLive || isPaused) ? `<button type="button" class="btn btn-danger" id="btn-end">${Icons.el('stop', 'icon-sm')} 结束会议</button>` : ''}
          ` : ''}
          <div class="meeting-timer-wrap">
            <span class="timer-display" title="已开会时长（正计时，点开始会议后走时）">${Icons.el('clock', 'icon-sm')}已开会 <span id="timer-value">${timerDigits}</span></span>
            <span class="timer-plan-compare${planCompareLine ? '' : ' is-empty'}" id="timer-plan-compare">${planCompareCaption}</span>
          </div>
        </div>
      </header>

      <div class="phase-tabs-bar">
        <div class="phase-tabs-intro">
          <span class="workflow-pill">当前会议阶段：<strong>${['会前准备', '会议进行中', '会后整理'][workflowPhase - 1]}</strong></span>
        </div>
        <div class="phase-tabs" role="tablist">
          ${[1, 2, 3]
            .map(
              (n) => `
            <button type="button" role="tab"
              class="phase-tab ${viewPhase === n ? 'phase-tab-selected' : ''}${workflowPhase === n ? ' phase-tab-workflow' : ''}"
              aria-selected="${viewPhase === n}" data-phase-view="${n}">
              <span class="phase-tab-num">${n}</span>
              <span class="phase-tab-label">${['会前准备', '会议进行中', '会后整理'][n - 1]}</span>
            </button>`
            )
            .join('')}
        </div>
      </div>

      <div class="meeting-phase-layout" data-visible-phase="${viewPhase}">
        <aside class="panel panel-prep phase-panel" data-phase-panel="1">
          <h2 class="panel-title">${Icons.el('calendar', 'icon-sm')} 会前准备</h2>

          <section class="panel-section">
            <h3>会议议程 <button type="button" class="btn-icon btn-add-agenda" title="添加议程项">+</button></h3>
            <ul class="agenda-list" id="agenda-list">
              ${(meeting.agenda || []).map((item, i) => agendaItem(item, i)).join('') || '<li class="empty-hint">暂无议程</li>'}
            </ul>
          </section>

          <section class="panel-section">
            <h3>资料上传</h3>
            <label class="upload-zone" title="点击上传会议资料">
              <input type="file" id="file-upload" multiple hidden />
              ${Icons.el('upload', 'icon-lg')}
              <span>点击或拖拽上传文件</span>
            </label>
            <ul class="materials-list" id="materials-list">
              ${(meeting.materials || []).map(materialItem).join('')}
            </ul>
          </section>

          <section class="panel-section">
            <h3>会议邀请</h3>
            <div class="invite-input-row">
              <input type="email" class="form-input" id="invite-email" placeholder="输入邮箱邀请" title="输入参会人邮箱" />
              <button type="button" class="btn btn-sm btn-primary" id="btn-invite-email">邀请</button>
            </div>
            <div class="team-chips" id="team-chips">
              ${team.map((t) => `
                <button type="button" class="chip ${meeting.invitees?.some((i) => i.id === t.id) ? 'chip-active' : ''}" data-id="${t.id}" title="邀请 ${Utils.escapeHtml(t.name)}">
                  ${Utils.escapeHtml(t.name)}
                </button>`).join('')}
            </div>
            <p class="invite-subhead invite-subhead--dept">按部门批量邀请（再次点击可移除该部门成员）</p>
            <div class="team-chips team-chips--dept" id="dept-invite-chips">
              ${Utils.INVITE_DEPARTMENTS.map((d) => {
                const active = Utils.inviteDeptFullySelected(team, d, meeting.invitees);
                return `<button type="button" class="chip chip-dept${active ? ' chip-active' : ''}" data-dept="${Utils.escapeHtml(d)}">${Utils.escapeHtml(d)}</button>`;
              }).join('')}
            </div>
            ${inviteNonTeamListHtml(meeting)}
          </section>

          <section class="panel-section">
            <h3>提醒设置</h3>
            <select class="form-input" id="reminder-select" title="会前提醒时间">
              <option value="5" ${meeting.reminderMinutes === 5 ? 'selected' : ''}>提前 5 分钟</option>
              <option value="10" ${meeting.reminderMinutes === 10 ? 'selected' : ''}>提前 10 分钟</option>
              <option value="15" ${meeting.reminderMinutes === 15 ? 'selected' : ''}>提前 15 分钟</option>
              <option value="30" ${meeting.reminderMinutes === 30 ? 'selected' : ''}>提前 30 分钟</option>
              <option value="60" ${meeting.reminderMinutes === 60 ? 'selected' : ''}>提前 1 小时</option>
            </select>
          </section>
        </aside>

        <!-- 中间：会议中 -->
        <main class="panel panel-live phase-panel" data-phase-panel="2">
          <h2 class="panel-title">${Icons.el('video', 'icon-sm')} 会议笔记</h2>

          <div class="note-toolbar">
            <button type="button" class="btn btn-sm btn-secondary tag-btn" data-tag="key">${Icons.el('tag', 'icon-sm')} 重点</button>
            <button type="button" class="btn btn-sm btn-secondary tag-btn" data-tag="action">${Icons.el('zap', 'icon-sm')} 行动点</button>
          </div>

          <textarea class="note-editor" id="note-input" placeholder="在此记录会议内容..." title="实时会议笔记"></textarea>
          <button type="button" class="btn btn-primary btn-block" id="btn-add-note">添加笔记</button>

          <ul class="notes-list" id="notes-list">
            ${(meeting.notes || []).map(noteItem).join('')}
          </ul>

          <section class="recording-section">
            <h3>录音与转写</h3>
            <div class="recording-controls recording-controls--wrap">
              <button type="button" class="btn ${meeting.recording ? 'btn-danger recording-pulse' : 'btn-secondary'}" id="btn-record">
                ${Icons.el('mic', 'icon-sm')} ${meeting.recording ? '停止录音' : '开始录音'}
              </button>
              <label class="recording-simul-toggle">
                <input type="checkbox" id="chk-transcript-simul" ${meeting.transcriptBilingual ? 'checked' : ''} />
                <span>英文同声翻译（演示）</span>
              </label>
              <span class="recording-status">${meeting.recording ? '录音中 · AI 转写中...' : '未录音'}</span>
            </div>
            <div class="transcript-box" id="transcript-box" title="AI 语音转写结果">
              ${transcriptBoxInner(meeting)}
            </div>
          </section>
        </main>

        <!-- 右侧：会后整理 -->
        <aside class="panel panel-post phase-panel" data-phase-panel="3">
          <h2 class="panel-title">${Icons.el('sparkles', 'icon-sm')} 会后整理</h2>

          <section class="panel-section">
            <div class="minutes-header">
              <h3>会议纪要</h3>
              <button type="button" class="btn btn-sm btn-primary" id="btn-gen-minutes">${Icons.el('sparkles', 'icon-sm')} AI 生成</button>
            </div>
            <textarea class="minutes-editor" id="minutes-editor" rows="12" title="编辑会议纪要">${Utils.escapeHtml(meeting.minutes || '')}</textarea>
          </section>

          <section class="panel-section">
            <h3>待办事项 <button type="button" class="btn-icon" id="btn-quick-todo" title="快速添加待办">+</button></h3>
            <ul class="meeting-todos" id="meeting-todos">
              ${Store.getTodos().filter((t) => t.meetingId === meetingId).map(meetingTodoItem).join('') || '<li class="empty-hint">暂无待办</li>'}
            </ul>
          </section>

          <section class="panel-section share-section">
            <h3>分享与导出</h3>
            <div class="share-buttons">
              <button type="button" class="btn btn-secondary" id="btn-share-link">${Icons.el('link', 'icon-sm')} 复制链接</button>
              <button type="button" class="btn btn-secondary" id="btn-export-pdf">${Icons.el('download', 'icon-sm')} 导出 PDF</button>
            </div>
          </section>
        </aside>
      </div>
      </div>
    `;

    bindEvents(meetingId, container);
    if (isLive) startTimer(meetingId, container);
  }

  function agendaItem(item, index) {
    return `
      <li class="agenda-item" data-id="${item.id}">
        <span class="agenda-order">${index + 1}</span>
        <input type="text" class="agenda-title-input" value="${Utils.escapeHtml(item.title)}" />
        <button type="button" class="btn-icon btn-up" title="上移">↑</button>
        <button type="button" class="btn-icon btn-down" title="下移">↓</button>
        <button type="button" class="btn-icon btn-del-agenda" title="删除">×</button>
      </li>`;
  }

  function materialItem(m) {
    return `<li class="material-item">📄 ${Utils.escapeHtml(m.name)} <span class="material-size">${formatSize(m.size)}</span></li>`;
  }

  function noteItem(n) {
    const tagClass = n.tag === 'key' ? 'note-key' : n.tag === 'action' ? 'note-action' : '';
    const hl = n.highlighted ? 'note-highlighted' : '';
    return `
      <li class="note-item ${tagClass} ${hl}" data-id="${n.id}">
        ${n.tag === 'key' ? '<span class="note-tag">重点</span>' : ''}
        ${n.tag === 'action' ? '<span class="note-tag action">行动点</span>' : ''}
        <p>${Utils.escapeHtml(n.text)}</p>
        <button type="button" class="btn-icon btn-del-note" title="删除">×</button>
      </li>`;
  }

  function meetingTodoItem(t) {
    const pr = t.priority || '中';
    const due = t.dueAt ? Utils.formatDateShort(t.dueAt) : '—';
    const statusZh = Utils.todoStatusLabel(t.status);
    return `<li class="meeting-todo-item">
      <div class="meeting-todo-main">
        <span class="priority-tag ${Utils.todoPriorityClass(pr)}">${Utils.escapeHtml(pr)}</span>
        <span class="meeting-todo-title">${Utils.escapeHtml(t.title)}</span>
      </div>
      <div class="meeting-todo-sub">
        ${t.assigneeName ? `<span class="meeting-todo-mention">@${Utils.escapeHtml(t.assigneeName)}</span><span class="meeting-todo-sep">·</span>` : ''}
        <span>${due}</span>
      </div>
      <span class="todo-status-badge meeting-todo-status ${statusZh === '进行中' ? 'todo-status--progress' : statusZh === '已完成' ? 'todo-status--done' : 'todo-status--pending'}">${statusZh}</span>
    </li>`;
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  function bindEvents(meetingId, container) {
    const get = () => Store.getMeeting(meetingId);

    container.querySelector('#back-dashboard').onclick = (e) => {
      e.preventDefault();
      Router.navigate('/');
    };

    container.querySelectorAll('[data-phase-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setViewPhase(meetingId, parseInt(btn.dataset.phaseView, 10));
        render(meetingId, container);
      });
    });

    container.querySelector('#meeting-title').onchange = (e) => {
      Store.updateMeeting(meetingId, { title: e.target.value });
    };

    // Meeting controls
    container.querySelector('#btn-start')?.addEventListener('click', () => {
      Store.updateMeeting(meetingId, {
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        pausedSince: null,
      });
      Utils.showToast('会议已开始', 'success');
      render(meetingId, container);
    });

    container.querySelector('#btn-pause')?.addEventListener('click', () => {
      Store.updateMeeting(meetingId, {
        status: 'paused',
        pausedSince: new Date().toISOString(),
      });
      if (meetingTimer) {
        clearInterval(meetingTimer);
        meetingTimer = null;
      }
      Utils.showToast('会议已暂停', 'info');
      render(meetingId, container);
    });

    container.querySelector('#btn-resume')?.addEventListener('click', () => {
      Store.updateMeeting(meetingId, { status: 'in_progress', pausedSince: null });
      Utils.showToast('会议继续', 'success');
      render(meetingId, container);
    });

    container.querySelector('#btn-end')?.addEventListener('click', () => {
      const m = get();
      const minutes = m.minutes || Utils.generateMinutes(m);
      Store.updateMeeting(meetingId, {
        status: 'ended',
        endedAt: new Date().toISOString(),
        minutes,
        recording: false,
        pausedSince: null,
      });
      stopTimers();
      notifyAssignees(meetingId);
      Utils.showToast('会议已结束，纪要已自动生成', 'success');
      render(meetingId, container);
    });

    // Agenda
    container.querySelector('.btn-add-agenda')?.addEventListener('click', () => {
      const m = get();
      const agenda = [...(m.agenda || []), { id: Store.uid(), title: '新议题', order: m.agenda?.length || 0 }];
      Store.updateMeeting(meetingId, { agenda });
      render(meetingId, container);
    });

    container.querySelectorAll('.agenda-title-input').forEach((input) => {
      input.onchange = () => {
        const m = get();
        const id = input.closest('.agenda-item').dataset.id;
        const agenda = m.agenda.map((a) => (a.id === id ? { ...a, title: input.value } : a));
        Store.updateMeeting(meetingId, { agenda });
      };
    });

    container.querySelectorAll('.btn-del-agenda').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.closest('.agenda-item').dataset.id;
        const m = get();
        Store.updateMeeting(meetingId, { agenda: m.agenda.filter((a) => a.id !== id) });
        render(meetingId, container);
      };
    });

    container.querySelectorAll('.btn-up').forEach((btn) => {
      btn.onclick = () => reorderAgenda(meetingId, btn, -1, container);
    });
    container.querySelectorAll('.btn-down').forEach((btn) => {
      btn.onclick = () => reorderAgenda(meetingId, btn, 1, container);
    });

    // Materials
    container.querySelector('#file-upload')?.addEventListener('change', (e) => {
      const files = [...e.target.files];
      const m = get();
      const materials = [
        ...(m.materials || []),
        ...files.map((f) => ({ id: Store.uid(), name: f.name, size: f.size, uploadedAt: new Date().toISOString() })),
      ];
      Store.updateMeeting(meetingId, { materials });
      Utils.showToast(`已上传 ${files.length} 个文件`, 'success');
      render(meetingId, container);
    });

    // Invites
    container.querySelector('#btn-invite-email')?.addEventListener('click', () => {
      const email = container.querySelector('#invite-email').value.trim();
      if (!email) return;
      const m = get();
      const invitees = [...(m.invitees || []), { email, name: email.split('@')[0] }];
      Store.updateMeeting(meetingId, { invitees });
      Utils.showToast(`已邀请 ${email}（模拟邮件已发送）`, 'success');
      render(meetingId, container);
    });

    container.querySelectorAll('#team-chips .chip').forEach((chip) => {
      chip.onclick = () => {
        const m = get();
        const member = Store.getTeam().find((t) => t.id === chip.dataset.id);
        if (!member) return;
        let invitees = [...(m.invitees || [])];
        const exists = invitees.some((i) => i.id === member.id);
        invitees = exists
          ? invitees.filter((i) => i.id !== member.id)
          : [...invitees, { id: member.id, name: member.name, email: member.email }];
        Store.updateMeeting(meetingId, { invitees });
        render(meetingId, container);
      };
    });

    container.querySelectorAll('#dept-invite-chips .chip-dept').forEach((chip) => {
      chip.onclick = () => {
        const m = get();
        const next = Utils.toggleInviteDepartment(Store.getTeam(), chip.dataset.dept, m.invitees || []);
        Store.updateMeeting(meetingId, { invitees: next });
        render(meetingId, container);
      };
    });

    container.querySelector('#chk-transcript-simul')?.addEventListener('change', (e) => {
      Store.updateMeeting(meetingId, { transcriptBilingual: !!e.target.checked });
      render(meetingId, container);
    });

    container.querySelector('#reminder-select')?.addEventListener('change', (e) => {
      Store.updateMeeting(meetingId, { reminderMinutes: parseInt(e.target.value, 10) });
      Utils.showToast('提醒已更新', 'info');
    });

    // Notes
    let selectedTag = null;
    container.querySelectorAll('.tag-btn').forEach((btn) => {
      btn.onclick = () => {
        selectedTag = selectedTag === btn.dataset.tag ? null : btn.dataset.tag;
        container.querySelectorAll('.tag-btn').forEach((b) => b.classList.toggle('active', b.dataset.tag === selectedTag));
      };
    });

    container.querySelector('#btn-add-note')?.addEventListener('click', () => {
      const text = container.querySelector('#note-input').value.trim();
      if (!text) return;
      const m = get();
      const note = { id: Store.uid(), text, tag: selectedTag, highlighted: false, createdAt: new Date().toISOString() };
      Store.updateMeeting(meetingId, { notes: [...(m.notes || []), note] });
      container.querySelector('#note-input').value = '';
      render(meetingId, container);
    });

    container.querySelectorAll('.btn-del-note').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.closest('.note-item').dataset.id;
        const m = get();
        Store.updateMeeting(meetingId, { notes: m.notes.filter((n) => n.id !== id) });
        render(meetingId, container);
      };
    });

    // Recording
    container.querySelector('#btn-record')?.addEventListener('click', () => {
      const m = get();
      if (m.recording) {
        stopRecording(meetingId);
        render(meetingId, container);
      } else {
        startRecording(meetingId, container);
      }
    });

    // Minutes
    const minutesEditor = container.querySelector('#minutes-editor');
    minutesEditor?.addEventListener(
      'input',
      Utils.debounce(() => {
        Store.updateMeeting(meetingId, { minutes: minutesEditor.value, minutesEdited: true });
      }, 400)
    );

    container.querySelector('#btn-gen-minutes')?.addEventListener('click', () => {
      const m = get();
      const minutes = Utils.generateMinutes(m);
      Store.updateMeeting(meetingId, { minutes });
      Utils.showToast('AI 纪要已生成', 'success');
      render(meetingId, container);
    });

    container.querySelector('#btn-quick-todo')?.addEventListener('click', () => {
      const { overlay, close } = Utils.showModal({
        title: '新建待办事项',
        body: Utils.newTodoFormHTML(meetingId),
        footer: `<button class="btn btn-ghost modal-cancel">取消</button><button class="btn btn-primary" id="save-quick-todo">添加</button>`,
      });
      overlay.querySelector('.modal-cancel').onclick = close;
      overlay.querySelector('#save-quick-todo').onclick = () => {
        const form = overlay.querySelector('#form-todo');
        const r = Utils.saveTodoFromForm(form);
        if (r.error) return Utils.showToast(r.error, 'error');
        close();
        Utils.showToast('待办已添加', 'success');
        render(meetingId, container);
      };
    });

    container.querySelector('#btn-share-link')?.addEventListener('click', () => {
      const m = get();
      if (!m.minutes) Store.updateMeeting(meetingId, { minutes: Utils.generateMinutes(m) });
      Utils.copyShareLink(meetingId);
    });

    container.querySelector('#btn-export-pdf')?.addEventListener('click', () => {
      const m = get();
      if (!m.minutes) {
        Store.updateMeeting(meetingId, { minutes: Utils.generateMinutes(m) });
      }
      Utils.exportPdf(Store.getMeeting(meetingId));
    });
  }

  function reorderAgenda(meetingId, btn, dir, container) {
    const m = Store.getMeeting(meetingId);
    const id = btn.closest('.agenda-item').dataset.id;
    const idx = m.agenda.findIndex((a) => a.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= m.agenda.length) return;
    const agenda = [...m.agenda];
    [agenda[idx], agenda[newIdx]] = [agenda[newIdx], agenda[idx]];
    Store.updateMeeting(meetingId, { agenda });
    render(meetingId, container);
  }

  function startRecording(meetingId, container) {
    Store.updateMeeting(meetingId, { recording: true });
    Utils.showToast('录音已开始，AI 转写中...', 'info');
    render(meetingId, container);

    recordingInterval = setInterval(() => {
      const m = Store.getMeeting(meetingId);
      if (!m?.recording) return;
      const stamp = new Date().toLocaleTimeString('zh-CN');
      if (m.transcriptBilingual) {
        const pair = Utils.randomTranscriptPair();
        const zhLine = `[${stamp}] ${pair.zh}\n`;
        const enLine = `[${stamp}] ${pair.en}\n`;
        Store.updateMeeting(meetingId, {
          transcript: (m.transcript || '') + zhLine,
          transcriptEn: (m.transcriptEn || '') + enLine,
        });
      } else {
        const line = `[${stamp}] ${Utils.randomTranscriptLine()}\n`;
        Store.updateMeeting(meetingId, { transcript: (m.transcript || '') + line });
      }
      const box = document.getElementById('transcript-box');
      const fresh = Store.getMeeting(meetingId);
      if (box) box.innerHTML = transcriptBoxInner(fresh);
    }, 3500);
  }

  function stopRecording(meetingId) {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    Store.updateMeeting(meetingId, { recording: false });
    Utils.showToast('录音已停止', 'info');
  }

  function startTimer(meetingId, container) {
    if (meetingTimer) clearInterval(meetingTimer);
    meetingTimer = setInterval(() => {
      const digits = container.querySelector('#timer-value');
      const compareEl = container.querySelector('#timer-plan-compare');
      const m = Store.getMeeting(meetingId);
      if (
        digits &&
        m?.startedAt &&
        !m?.endedAt &&
        m.status === 'in_progress'
      ) {
        digits.textContent = formatElapsedDigits(m);
        if (compareEl) {
          const line = planTimeCompareLine(m, m.plannedDurationMinutes ?? 60);
          compareEl.textContent = line;
          compareEl.classList.toggle('is-empty', !line);
        }
      }
    }, 1000);
  }

  function stopTimers() {
    if (meetingTimer) clearInterval(meetingTimer);
    if (recordingInterval) clearInterval(recordingInterval);
    meetingTimer = null;
    recordingInterval = null;
  }

  function notifyAssignees(meetingId) {
    const todos = Store.getTodos().filter((t) => t.meetingId === meetingId && t.status !== 'done');
    todos.forEach((t) => {
      if (t.assigneeName) {
        Utils.showToast(`已提醒 ${t.assigneeName}：${t.title}（模拟邮件/App 通知）`, 'info');
      }
    });
  }

  return { render };
})();
