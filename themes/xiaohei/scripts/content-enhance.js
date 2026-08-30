/* global hexo */
// 构建期增强正文 HTML，不改动任何 markdown 文件：
//   1. 给文章表格包一层 .table-wrap（横向滚动），代码块内的行号表格要跳过
//   2. 给图片补 loading="lazy" / decoding="async"
// priority 10：排在 katex.js（9）之后，处理的是最终 HTML
hexo.extend.filter.register('after_post_render', function (data) {
  if (!data || !data.content) return data;

  var content = data.content;
  var codeBlocks = [];

  // 1) 先把代码块整体抠出来占位，否则里面的行号 <table> 会被误包裹。
  //    注意标签形如 <figure class="highlight python">，语言名夹在 highlight 和引号之间
  content = content.replace(/<figure class="highlight[^"]*"[\s\S]*?<\/figure>/g, function (m) {
    codeBlocks.push(m);
    return '%%XHCB' + (codeBlocks.length - 1) + '%%';
  });

  // 2) 包裹剩余表格
  content = content.replace(/<table[\s\S]*?<\/table>/g, function (m) {
    return '<div class="table-wrap">' + m + '</div>';
  });

  // 3) 还原代码块
  content = content.replace(/%%XHCB(\d+)%%/g, function (m, i) {
    return codeBlocks[Number(i)];
  });

  // 4) 图片懒加载（代码块里的图片已被转义成 &lt;img&gt;，不会误伤）
  content = content.replace(/<img\s([^>]*)>/g, function (m, attrs) {
    if (/\sloading=/.test(attrs)) return m;
    var extra = ' loading="lazy"';
    if (!/\sdecoding=/.test(attrs)) extra += ' decoding="async"';
    return '<img ' + attrs + extra + '>';
  });

  data.content = content;
  return data;
}, 10);
