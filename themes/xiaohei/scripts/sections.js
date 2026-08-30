/* global hexo */
// 生成两个板块页：/notes/（学习笔记）与 /thoughts/（行业思考）。
// 依据 _posts 下的子目录区分，不修改任何 markdown 文件，也不依赖标签。
//
// 注意：不要试图在 before_post_render 里读写 data.tags ——
// tags 是 Warehouse 的虚拟属性，此时访问会抛 "property 'tags' closes the circle"。
hexo.extend.generator.register('xiaohei-sections', function (locals) {
  const sections = [
    { dir: 'notes', path: 'notes/', title: '学习笔记', eyebrow: 'Notes' },
    { dir: 'thoughts', path: 'thoughts/', title: '行业思考', eyebrow: 'Thoughts' }
  ];

  return sections.map(function (s) {
    const posts = locals.posts
      .filter(function (p) {
        const src = String(p.source || '').replace(/\\/g, '/');
        return src.indexOf('_posts/' + s.dir + '/') === 0;
      })
      .sort('-date')
      .toArray();

    return {
      path: s.path,
      layout: ['section', 'archive', 'index'],
      data: {
        title: s.title,
        eyebrow: s.eyebrow,
        posts: posts,
        is_section: true
      }
    };
  });
});
