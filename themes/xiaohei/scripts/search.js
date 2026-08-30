/* global hexo */
hexo.extend.generator.register('xiaohei-search', function (locals) {
  const root = hexo.config.root || '/';
  const posts = locals.posts.sort('-date').data.map(function (p) {
    const raw = (p.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      title: p.title,
      url: root + p.path,
      date: p.date,
      // 只留前 1500 字：够做上下文高亮，又能把索引体积压下来
      // （原来 6000 字/篇，78 篇约 180KB；这里约 55KB）
      content: raw.slice(0, 1500),
      tags: p.tags ? p.tags.map(function (t) { return t.name; }) : [],
      categories: p.categories ? p.categories.map(function (c) { return c.name; }) : []
    };
  });
  return {
    path: 'search.json',
    data: JSON.stringify(posts)
  };
});
