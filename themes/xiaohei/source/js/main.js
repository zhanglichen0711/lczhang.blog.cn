(function () {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);

  const themeToggle = $('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('xiaohei-theme', next);
      syncGiscus(next);
    });
  }

  function syncGiscus(theme) {
    const frame = document.querySelector('iframe.giscus-frame');
    if (!frame) return;
    frame.contentWindow.postMessage({
      giscus: { setConfig: { theme: theme === 'dark' ? 'transparent_dark' : 'light' } }
    }, 'https://giscus.app');
  }

  document.querySelectorAll('.side-group').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      var panel = btn.nextElementSibling;
      if (panel) panel.classList.toggle('open', !open);
    });
  });

  const navToggle = $('navToggle');
  const nav = $('siteNav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
  }

  const progress = $('readProgress');
  const article = $('articleBody');
  if (progress && article) {
    progress.hidden = false;
    const onScroll = function () {
      const rect = article.getBoundingClientRect();
      const total = article.offsetHeight - window.innerHeight;
      const passed = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      progress.style.width = (passed / Math.max(total, 1) * 100) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const tocNav = $('tocNav');
  if (tocNav && article) {
    const heads = article.querySelectorAll('h2, h3');
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'h-' + i + '-' + (h.textContent || '').trim().slice(0, 16);
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.className = h.tagName === 'H3' ? 'toc-h3' : 'toc-h2';
      tocNav.appendChild(a);
    });
    if (!heads.length && $('tocBox')) $('tocBox').style.display = 'none';
  }

  function bindOverlay(openId, closeId, modalId, onOpen) {
    const open = $(openId), close = $(closeId), modal = $(modalId);
    if (!modal) return;
    function hide() { modal.hidden = true; }
    function show() { modal.hidden = false; if (onOpen) onOpen(); }
    if (open) open.addEventListener('click', show);
    if (close) close.addEventListener('click', hide);
    modal.addEventListener('click', function (e) { if (e.target === modal) hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }

  bindOverlay('wechatOpen', 'wechatClose', 'wechatModal');

  const results = $('searchResults');
  const input = $('searchInput');
  let index = null;
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      var modal = $('searchModal');
      if (modal) { modal.hidden = false; if (input) setTimeout(function(){input.focus();}, 20); }
    }
  });
  bindOverlay('searchOpen', 'searchClose', 'searchModal', function () {
    if (input) setTimeout(function () { input.focus(); }, 20);
    if (!index) {
      fetch('/search.json')
        .then(function (r) { return r.json(); })
        .then(function (data) { index = data; if (input && input.value) render(input.value); })
        .catch(function () {
          if (results) results.innerHTML = '<p class="excerpt">搜索索引未生成。先运行 hexo generate。</p>';
        });
    }
  });

  function render(q) {
    if (!results) return;
    q = (q || '').trim().toLowerCase();
    if (!q || !index) { results.innerHTML = ''; return; }
    const hits = index.filter(function (p) {
      return (p.title || '').toLowerCase().indexOf(q) !== -1
        || (p.content || '').toLowerCase().indexOf(q) !== -1
        || (p.tags || []).join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 12);
    if (!hits.length) {
      results.innerHTML = '<p class="excerpt">没有找到相关笔记</p>';
      return;
    }
    results.innerHTML = hits.map(function (p) {
      return '<a class="search-item" href="' + p.url + '"><strong>' + p.title + '</strong><br><small>' +
        (p.categories || []).join(' / ') + ' · ' + (p.tags || []).slice(0, 4).join(' ') + '</small></a>';
    }).join('');
  }

  if (input) {
    input.addEventListener('input', function () { render(input.value); });
  }
})();
