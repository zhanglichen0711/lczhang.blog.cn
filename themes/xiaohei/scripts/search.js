/* global hexo */
hexo.extend.generator.register('xiaohei-search', function (locals) {
  const root = hexo.config.root || '/';
  const posts = locals.posts.sort('-date').data.map(function (p) {
    const raw = (p.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      title: p.title,
      url: root + p.path,
      content: raw.slice(0, 6000),
      tags: p.tags ? p.tags.map(function (t) { return t.name; }) : [],
      categories: p.categories ? p.categories.map(function (c) { return c.name; }) : []
    };
  });
  return {
    path: 'search.json',
    data: JSON.stringify(posts)
  };
});
