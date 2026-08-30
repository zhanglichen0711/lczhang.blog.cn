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
  const navBackdrop = $('navBackdrop');
  if (navToggle && nav) {
    function setNav(open) {
      nav.classList.toggle('open', open);
      if (navBackdrop) navBackdrop.hidden = !open;
      // 抽屉打开时锁住背景滚动
      document.body.style.overflow = open ? 'hidden' : '';
    }
    navToggle.addEventListener('click', function () {
      setNav(!nav.classList.contains('open'));
    });
    if (navBackdrop) {
      navBackdrop.addEventListener('click', function () { setNav(false); });
    }
    // 点侧栏里的链接跳转后，抽屉不会自己收起，这里补上
    nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setNav(false);
    });
    // 视口放大回桌面布局时复位，避免残留锁滚动
    window.addEventListener('resize', function () {
      if (window.innerWidth > 960) setNav(false);
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

  const tocNav = $('tocNav');            // 桌面端右侧目录
  const tocNavM = $('tocNavMobile');     // 移动端折叠目录
  if ((tocNav || tocNavM) && article) {
    const heads = article.querySelectorAll('h2, h3');
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'h-' + i + '-' + (h.textContent || '').trim().slice(0, 16);
      [tocNav, tocNavM].forEach(function (navTarget) {
        if (!navTarget) return;
        const a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        a.className = h.tagName === 'H3' ? 'toc-h3' : 'toc-h2';
        navTarget.appendChild(a);
      });
    });
    // 没有小标题的文章（比如短笔记）直接收掉两个目录容器，避免留下空壳
    if (!heads.length) {
      if ($('tocBox')) $('tocBox').style.display = 'none';
      if ($('tocMobile')) $('tocMobile').style.display = 'none';
    }
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

  /* ===== TOC 滚动高亮（scroll-spy，桌面端与移动端目录同步） ===== */
  if (tocNav || tocNavM) {
    const links = [tocNav, tocNavM].reduce(function (acc, navTarget) {
      return navTarget
        ? acc.concat(Array.prototype.slice.call(navTarget.querySelectorAll('a')))
        : acc;
    }, []);
    // 同一个标题在两个目录里各有一个 <a>，所以 map 的值是数组
    const map = {};
    links.forEach(function (a) {
      const id = (a.getAttribute('href') || '').replace('#', '');
      if (id) (map[id] = map[id] || []).push(a);
    });
    const heads = Object.keys(map).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (heads.length) {
      const spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          const as = map[en.target.id];
          if (as && en.isIntersecting) {
            links.forEach(function (l) { l.classList.remove('active'); });
            as.forEach(function (a) { a.classList.add('active'); });
          }
        });
      }, { rootMargin: '-90px 0px -72% 0px', threshold: 0 });
      heads.forEach(function (h) { spy.observe(h); });
    }
  }

  /* ===== Mermaid 架构图（将 ```mermaid 代码块渲染成图） ===== */
  (function () {
    const mer = document.querySelectorAll('.article-body code.mermaid');
    if (!mer.length) return;
    const divs = [];
    mer.forEach(function (code) {
      const pre = code.parentElement;
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = code.textContent;
      pre.parentNode.replaceChild(div, pre);
      divs.push(div);
    });
    function run() {
      if (!window.mermaid) return;
      window.mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default'
      });
      window.mermaid.run({ nodes: divs });
    }
    if (window.mermaid) return run();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
    s.onload = run;
    document.head.appendChild(s);
  })();

  /* ===== 代码块复制按钮 ===== */
  document.querySelectorAll('.article-body figure.highlight, .article-body pre').forEach(function (host) {
    // figure.highlight 内部有两个 <pre>（行号 gutter + 代码本体），跳过它们：
    // ① gutter 的 <pre> 里没有 <code>，会让外层 figure 提前 return，导致按钮挂不上
    // ② 不跳过就会挂出重复按钮
    if (host.tagName === 'PRE' && host.closest('figure.highlight')) return;

    const code = host.querySelector('code');
    if (!code) return;

    // 包一层 .code-host：figure 自带 overflow:auto，
    // 按钮若挂在它内部，横向滚动长代码时会跟着滚出视野
    const wrap = document.createElement('div');
    wrap.className = 'code-host';
    host.parentNode.insertBefore(wrap, host);
    wrap.appendChild(host);

    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', '复制代码');
    btn.addEventListener('click', function () {
      const text = code.textContent;
      const done = function () {
        btn.textContent = 'Copied'; btn.classList.add('copied');
        setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else { fallback(); }
      function fallback() {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
    wrap.appendChild(btn);
  });
})();
