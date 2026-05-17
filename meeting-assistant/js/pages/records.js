/**
 * 会议记录：每场会议一页整合纪要（议程 / 资料 / 笔记 / 转写 / 纪要稿 / 待办）
 */
const RecordsPage = (() => {
  let scopeFilter = 'all';
  /** @type {string|null} */
  let selectedId = null;

  function sortMeetings(list) {
    return [...list].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  }

  function applyScope(meetings) {
    if (scopeFilter === 'ended') return meetings.filter((m) => m.status === 'ended');
    if (scopeFilter === 'open') return meetings.filter((m) => m.status !== 'ended');
    return meetings;
  }

  function selectAfterFilter(list, container) {
    if (!list.length) {
      selectedId = null;
      return;
    }
    const exists = list.some((m) => m.id === selectedId);
    if (!exists) selectedId = list[0].id;
  }

  function meetingTodos(meetingId) {
    return Store.getTodos().filter((t) => t.meetingId === meetingId);
  }

  /** 从历史恢复或导入纪要前静默存档当前整合稿 */
  function snapshotMinutesQuiet(meetingId) {
    Utils.recordHistoryPushSnapshot(meetingId, Utils.currentMinutesFromMeeting(Store.getMeeting(meetingId)), {
      silentToast: true,
    });
  }

  function openRecordsHistoryModal(rootContainer, meetingId) {
    const meetingOrNull = () => Store.getMeeting(meetingId);

    function listMarkup(entries) {
      if (!entries.length)
        return '<p class="record-muted records-hint-p">暂无历史。「保存当前为新版本」会把第六节整合稿存成快照；导入 / 恢复前也会自动存档当前正文。</p>';
      return `
        <ul class="records-history-ul">
          ${entries
            .map(
              (e) => `
            <li class="records-history-li">
              <div class="records-history-li-main">
                <span class="records-history-li-time">${Utils.escapeHtml(Utils.formatDate(e.savedAt))}</span>
                <span class="records-history-li-preview">${Utils.escapeHtml(e.previewLine)}</span>
              </div>
              <span class="records-history-li-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-act="preview" data-hid="${Utils.escapeHtml(
                  e.id
                )}" title="预览该版本正文">预览</button>
                <button type="button" class="btn btn-sm btn-primary" data-act="restore" data-hid="${Utils.escapeHtml(
                  e.id
                )}" title="将该版本写入会议整合稿">恢复</button>
              </span>
            </li>`
            )
            .join('')}
        </ul>`;
    }

    const initial = [...Utils.recordHistoryList(meetingId)];

    const { overlay } = Utils.showModal({
      title: '会议纪要历史版本',
      body: `
        <p class="records-history-lead">
          仅针对<strong>第六节 · 会议纪要（整合稿）</strong>做本地快照，<strong>仅存于本浏览器</strong>，清除站点数据后将丢失。</p>
        <div class="records-history-actions">
          <button type="button" class="btn btn-sm btn-primary" id="rh-save-new">${Icons.el('plus', 'icon-sm')} 保存当前为新版本</button>
          <button type="button" class="btn btn-sm btn-ghost modal-close-alt" aria-label="关闭对话框">关闭</button>
        </div>
        <div id="rh-list-wrap">${listMarkup(initial)}</div>
        <label class="form-label records-history-preview-label">预览</label>
        <pre id="rh-preview-pre" class="records-history-preview" aria-live="polite">选择一条版本后点击「预览」。</pre>`,
    });

    const listWrap = overlay.querySelector('#rh-list-wrap');
    const previewPre = overlay.querySelector('#rh-preview-pre');

    function entryById(id) {
      return Utils.recordHistoryList(meetingId).find((x) => x.id === id);
    }

    function bindListHandlers() {
      listWrap.querySelectorAll('[data-act="preview"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.hid;
          const entry = entryById(id || '');
          previewPre.textContent = entry ? entry.minutes : '（未找到该条目）';
        });
      });

      listWrap.querySelectorAll('[data-act="restore"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.hid;
          const entry = entryById(id || '');
          if (!entry || !entry.minutes.trim()) return;
          if (
            !confirm(
              '将把该快照写回当前会议的整合稿。\n会先静默保存你现在屏幕上的正文，便于在历史列表中找到「上一份」。确定吗？'
            )
          )
            return;
          snapshotMinutesQuiet(meetingId);
          Store.updateMeeting(meetingId, { minutes: entry.minutes, minutesEdited: true });
          overlay.querySelector('.modal-close')?.click();
          Utils.showToast('已恢复为该历史版本的整合稿', 'success');
          render(rootContainer);
        });
      });
    }

    function repaint() {
      const entries = [...Utils.recordHistoryList(meetingId)];
      listWrap.innerHTML = listMarkup(entries);
      bindListHandlers();
    }

    bindListHandlers();

    overlay.querySelector('#rh-save-new')?.addEventListener('click', () => {
      const mm = meetingOrNull();
      if (!mm) return;
      Utils.recordHistoryPushSnapshot(meetingId, Utils.currentMinutesFromMeeting(mm), {});
      repaint();
    });

    overlay.querySelector('.modal-close-alt')?.addEventListener('click', () => {
      overlay.querySelector('.modal-close')?.click();
    });
  }

  function wireRecordsImport(container) {
    const importInput = container.querySelector('#records-import-input');
    if (!importInput || importInput.dataset.bound) return;
    importInput.dataset.bound = '1';
    importInput.addEventListener('change', (ev) => {
      const inp = /** @type {HTMLInputElement} */ (ev.target);
      const file = inp.files && inp.files[0];
      inp.value = '';
      if (!file || !selectedId) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const parsed = Utils.parseMeetingMinutesImport(text, selectedId);
        if (!parsed.ok) {
          Utils.showToast(parsed.error, 'error');
          return;
        }
        let warn = '';
        if (parsed.meta && parsed.meta.foreignMeeting && parsed.meta.foreignMeetingTitle) {
          warn = `文件中标记的会议可能不是当前这条（${parsed.meta.foreignMeetingTitle}）。\n\n`;
        }
        if (
          !confirm(
            `${warn}将导入内容写入当前会议的「整合稿」（第六节），并替换现有正文。\n建议在不确定时先做「导出」备份。`
          )
        )
          return;
        snapshotMinutesQuiet(selectedId);
        Store.updateMeeting(selectedId, { minutes: parsed.minutes, minutesEdited: true });
        Utils.showToast('已导入并完成替换', 'success');
        render(container);
      };
      reader.onerror = () => Utils.showToast('读取文件失败', 'error');
      reader.readAsText(file, 'UTF-8');
    });
  }

  function render(container) {
    const meetings = sortMeetings(applyScope(Store.getMeetings()));
    selectAfterFilter(meetings, container);
    const m = selectedId ? Store.getMeeting(selectedId) : null;
    const detailHtml = m ? Utils.formatMeetingRecordsHtml(m, meetingTodos(m.id)) : '';

    container.innerHTML = `
      <div class="page-scroll records-page-root">
        <div class="dash-header">
          <div>
            <h1 class="dash-title">会议记录</h1>
            <p class="dash-subtitle">单场会议的一体化纪要（与会前 / 会中 / 会后内容汇总）</p>
          </div>
          <button type="button" class="btn btn-ghost" id="records-back">返回首页</button>
        </div>

        <div class="records-layout">
          <aside class="records-sidebar">
            <div class="records-sidebar-tools">
              <label class="sr-only">范围</label>
              <select class="form-input records-scope" id="records-scope-select" aria-label="会议范围筛选">
                <option value="all" ${scopeFilter === 'all' ? 'selected' : ''}>全部会议</option>
                <option value="ended" ${scopeFilter === 'ended' ? 'selected' : ''}>已结束（归档）</option>
                <option value="open" ${scopeFilter === 'open' ? 'selected' : ''}>未结束（进行中）</option>
              </select>
            </div>
            <ul class="records-meeting-nav" role="tablist">
              ${
                meetings.length
                  ? meetings
                      .map(
                        (x) => `
                <li>
                  <button type="button" role="tab" aria-selected="${
                    x.id === selectedId
                  }" class="records-nav-btn${x.id === selectedId ? ' is-active' : ''}" data-mid="${
                          x.id
                        }">
                    <span class="records-nav-title">${Utils.escapeHtml(x.title)}</span>
                    <span class="records-nav-meta">${Utils.escapeHtml(Utils.dashboardStatus(x))} · ${Utils.escapeHtml(
                          Utils.meetingDateParts(x.scheduledAt).dateLabel
                        )}</span>
                  </button>
                </li>`
                      )
                      .join('')
                  : '<li class="records-nav-empty"><p class="record-muted">暂无会议</p></li>'
              }
            </ul>
          </aside>

          <div class="records-main">
            ${
              m
                ? `<div class="records-toolbar card-toolbar">
                     <button type="button" class="btn btn-sm btn-secondary" id="records-open-live">${Icons.el('video', 'icon-sm')} 打开会议详情</button>
                     <button type="button" class="btn btn-sm btn-primary" id="records-copy-plain">${Icons.el('file', 'icon-sm')} 复制全文（纯文本）</button>
                     <button type="button" class="btn btn-sm btn-secondary" id="records-export-pdf">${Icons.el('upload', 'icon-sm')} 导出 PDF</button>
                     <button type="button" class="btn btn-sm btn-secondary" id="records-export-word">${Icons.el('file', 'icon-sm')} 导出 Word</button>
                     <button type="button" class="btn btn-sm btn-secondary" id="records-import-trigger">${Icons.el('download', 'icon-sm')} 导入整合稿…</button>
                     <button type="button" class="btn btn-sm btn-ghost" id="records-history-btn">${Icons.el('clock', 'icon-sm')} 历史版本</button>
                     <input type="file" id="records-import-input" class="records-file-input-hidden" aria-label="选择要导入的文件" accept=".txt,.md,.markdown,.json,.html,.htm,.doc,text/plain,text/markdown,text/html,application/msword,.docx" tabindex="-1" />
                   </div>
                   <article class="records-doc-card">${detailHtml}</article>`
                : `<div class="empty-state-inline empty-state-inline--lg"><p>${Icons.el(
                    'file',
                    'icon-lg'
                  )}</p><p>暂无会议可查</p><a href="#" class="btn btn-primary btn-sm" id="records-to-home-alt">新建或恢复会议</a></div>`
            }
          </div>
        </div>
      </div>`;

    container.querySelector('#records-back')?.addEventListener('click', () => Router.navigate('/'));
    container.querySelector('#records-to-home-alt')?.addEventListener('click', (e) => {
      e.preventDefault();
      Router.navigate('/');
    });

    container.querySelector('#records-scope-select')?.addEventListener('change', (e) => {
      scopeFilter = e.target.value || 'all';
      render(container);
    });

    container.querySelectorAll('.records-nav-btn').forEach((btn) => {
      btn.onclick = () => {
        selectedId = btn.dataset.mid;
        render(container);
      };
    });

    container.querySelector('#records-open-live')?.addEventListener('click', () => {
      if (selectedId) Router.navigate(`meeting/${selectedId}`);
    });

    container.querySelector('#records-copy-plain')?.addEventListener('click', async () => {
      const wrap = container.querySelector('.records-doc-card');
      if (!wrap) return;
      const text = wrap.innerText.trim();
      try {
        await navigator.clipboard.writeText(text);
        Utils.showToast('已复制纪要全文', 'success');
      } catch {
        Utils.showToast('复制失败，请手动全选复制', 'error');
      }
    });

    container.querySelector('#records-export-pdf')?.addEventListener('click', () => {
      const mm = selectedId ? Store.getMeeting(selectedId) : null;
      if (!mm) return;
      Utils.exportMeetingRecordsPdf(mm, meetingTodos(mm.id));
    });

    container.querySelector('#records-export-word')?.addEventListener('click', () => {
      const mm = selectedId ? Store.getMeeting(selectedId) : null;
      if (!mm) return;
      Utils.exportMeetingRecordsWordDoc(mm, meetingTodos(mm.id));
    });

    container.querySelector('#records-import-trigger')?.addEventListener('click', () => {
      container.querySelector('#records-import-input')?.click();
    });

    container.querySelector('#records-history-btn')?.addEventListener('click', () => {
      if (selectedId) openRecordsHistoryModal(container, selectedId);
    });

    wireRecordsImport(container);
  }

  return { render };
})();
