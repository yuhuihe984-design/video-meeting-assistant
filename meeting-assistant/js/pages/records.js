const RecordsPage = (() => {
  function render(container) {
    container.innerHTML = `
      <div class="page-scroll page-scroll--center">
        <div class="empty-placeholder">
          <span class="empty-placeholder-icon">${Icons.el('file', 'icon-lg')}</span>
          <p>会议记录功能即将上线</p>
          <a href="#" class="btn btn-secondary btn-sm" id="btn-back-home">返回首页</a>
        </div>
      </div>`;

    container.querySelector('#btn-back-home')?.addEventListener('click', (e) => {
      e.preventDefault();
      Router.navigate('');
    });
  }

  return { render };
})();
