/**
 * 最近删除：查看 / 永久删除 / 恢复
 */
const TrashPage = (() => {
  let kindFilter = 'all';

  function kindLabel(k) {
    return ({ todo: '待办事项', member: '团队成员', meeting_bundle: '会议' }[k]) || k;
  }

  function rowTitle(row) {
    if (row.kind === 'todo') return row.snapshot?.title || '待办';
    if (row.kind === 'member') return row.snapshot?.name ? `${row.snapshot.name} · ${row.snapshot.email}` : '成员';
    return row.meeting?.title || '会议';
  }

  function rowMeta(row) {
    if (row.kind === 'meeting_bundle') {
      const n = (row.todosSnapshot || []).length;
      return n ? `附带 ${n} 条关联待办` : '无附带待办';
    }
    return '';
  }

  function render(container) {
    let rows = Store.getTrashBin().sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    if (kindFilter !== 'all') rows = rows.filter((r) => r.kind === kindFilter);

    container.innerHTML = `
      <div class="page-scroll">
        <div class="dash-header">
          <div>
            <h1 class="dash-title">最近删除</h1>
            <p class="dash-subtitle">误删可从此处恢复会议、待办与成员</p>
          </div>
          <button type="button" class="btn btn-ghost" id="btn-trash-back">返回首页</button>
        </div>

        <div class="trash-toolbar">
          <span class="trash-toolbar-label">类别</span>
          ${['all', 'todo', 'meeting_bundle', 'member'].map((k) => {
            const label =
              k === 'all'
                ? '全部'
                : k === 'meeting_bundle'
                  ? '会议'
                  : k === 'todo'
                    ? '待办'
                    : '成员';
            const sel = kindFilter === k ? ' trash-pill-selected' : '';
            return `<button type="button" class="filter-pill${sel}" data-trash-kind="${k}">${label}</button>`;
          }).join('')}
        </div>

        <div class="trash-list-proto">
          ${
            rows.length
              ? rows
                  .map(
                    (r) => `
            <article class="trash-row-proto">
              <div class="trash-row-main">
                <span class="trash-kind-tag">${kindLabel(r.kind)}</span>
                <p class="trash-row-title">${Utils.escapeHtml(rowTitle(r))}</p>
                ${rowMeta(r) ? `<p class="trash-row-meta">${Utils.escapeHtml(rowMeta(r))}</p>` : ''}
                <p class="trash-row-time">${Icons.el('calendar', 'icon-sm')} ${Utils.escapeHtml(Utils.formatDate(r.deletedAt))}</p>
              </div>
              <div class="trash-row-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-restore="${r.id}">恢复</button>
                <button type="button" class="btn btn-sm btn-ghost trash-perma" data-purge="${r.id}">彻底删除</button>
              </div>
            </article>`
                  )
                  .join('')
              : `<div class="empty-state-inline empty-state-inline--lg"><p>回收站是空的</p></div>`
          }
        </div>
      </div>`;

    container.querySelector('#btn-trash-back').onclick = () => Router.navigate('/');
    container.querySelectorAll('[data-trash-kind]').forEach((btn) => {
      btn.onclick = () => {
        kindFilter = btn.dataset.trashKind;
        render(container);
      };
    });

    container.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.onclick = () => {
        const ok = Store.restoreFromTrash(btn.dataset.restore);
        if (!ok) {
          Utils.showToast('无法恢复：可能存在重复成员或条目已移除', 'error');
        } else {
          Utils.showToast('已恢复', 'success');
        }
        render(container);
      };
    });

    container.querySelectorAll('[data-purge]').forEach((btn) => {
      btn.onclick = () => {
        if (confirm('确定从回收站彻底删除该项？将无法恢复。')) {
          Store.purgeTrashPermanent(btn.dataset.purge);
          Utils.showToast('已彻底删除', 'info');
          render(container);
        }
      };
    });
  }

  return { render };
})();
