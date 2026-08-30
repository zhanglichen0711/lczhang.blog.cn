/* global hexo */
// 构建期把数学公式渲染成静态 HTML（KaTeX），不影响发文方式。
// 文章里用 $$...$$（块级）和 $...$（行内）即可。
const katex = require('katex');

function enc(tex) {
  // base64url 且去掉 padding，避免 = 被 Hexo 转义成实体后正则匹配不到
  return Buffer.from(tex, 'utf8').toString('base64url').replace(/=+$/, '');
}
function dec(b64) {
  // 补回 base64url padding
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64url').toString('utf8');
}

// 在 marked 渲染前，把公式替换成 base64 占位符，避免被 Markdown 解析器破坏
hexo.extend.filter.register('before_post_render', function (data) {
  if (!data || !data.content) return data;
  // 块级 $$...$$
  data.content = data.content.replace(/\$\$([\s\S]+?)\$\$/g, function (m, tex) {
    return '%%KATEXD:' + enc(tex.trim()) + '%%';
  });
  // 行内 $...$
  data.content = data.content.replace(/\$([^\$\n]+?)\$/g, function (m, tex) {
    return '%%KATEXI:' + enc(tex) + '%%';
  });
  return data;
}, 9);

// 渲染后，把占位符还原成 KaTeX 输出
hexo.extend.filter.register('after_post_render', function (data) {
  if (!data || !data.content) return data;
  data.content = data.content.replace(/%%KATEX([DI]):([A-Za-z0-9_-]+)%%/g, function (m, kind, b64) {
    try {
      return katex.renderToString(dec(b64), {
        displayMode: kind === 'D',
        throwOnError: false,
        output: 'htmlAndMathml'
      });
    } catch (e) {
      return '<code>' + dec(b64) + '</code>';
    }
  });
  return data;
}, 9);
