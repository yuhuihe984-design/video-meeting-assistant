/**
 * 简易 Hash 路由
 */
const Router = (() => {
  const routes = {};
  let currentRoute = null;

  function register(path, handler) {
    routes[path] = handler;
  }

  function parseHash() {
    const hash = location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0) return { path: '/', params: {} };
    if (parts[0] === 'meeting' && parts[1]) {
      return { path: '/meeting/:id', params: { id: parts[1] } };
    }
    if (parts[0] === 'insights' && parts[1]) {
      return { path: '/insights/:kind', params: { kind: parts[1] } };
    }
    return { path: '/' + parts[0], params: {} };
  }

  function navigate(path) {
    location.hash = path.startsWith('#') ? path.slice(1) : path;
  }

  function render() {
    const { path, params } = parseHash();
    currentRoute = path;
    const handler = routes[path] || routes['/'];
    const main = document.getElementById('main-content');
    if (handler) {
      main.innerHTML = '';
      handler(params, main);
    }
    updateNavActive();
  }

  function updateNavActive() {
    const { path } = parseHash();
    const parts = location.hash.slice(1).split('/').filter(Boolean);
    const homeLike = parts.length === 0 || parts[0] === 'insights';

    document.querySelectorAll('.nav-link').forEach((el) => {
      const href = el.getAttribute('data-path');
      const active =
        (href === '/' && (path === '/' || homeLike)) ||
        (href === '/todos' && path === '/todos') ||
        (href === '/records' && path === '/records') ||
        (href === '/team' && path === '/team') ||
        (href === '/trash' && path === '/trash') ||
        (href === '/meeting' && path.startsWith('/meeting'));
      el.classList.toggle('active', active);
    });
  }

  function init() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { register, navigate, init, getCurrentRoute: () => currentRoute };
})();
