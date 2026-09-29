const fs = require('fs');
const path = require('path');
const LOG = [];

// 保留 4 篇：旧文件名 → 新日期（内容与 abbrlink 不动）
const REBASE = [
  ['2023-07-12-ml-机器学习基本概念.md', '2023-07-12'],
  ['2023-08-08-ml-线性回归问题.md', '2023-07-19'],
  ['2023-09-03-ml-KNN算法.md', '2023-07-27'],
  ['2023-09-25-ml-集成学习与聚类算法.md', '2023-08-03']
];
const dir = 'source/_posts/notes/模型训练与微调/Machine-Learning';

for (const [oldName, newDate] of REBASE) {
  const oldPath = dir + '/' + oldName;
  if (!fs.existsSync(oldPath)) { LOG.push('缺失: ' + oldName); continue; }
  let raw = fs.readFileSync(oldPath, 'utf8');
  // 只替换 front-matter 的 date 行
  raw = raw.replace(/^(date:\s*)\d{4}-\d{2}-\d{2}/m, '$1' + newDate);
  fs.writeFileSync(oldPath, raw, 'utf8');
  const newName = newDate + '-' + oldName.slice(11);
  const newPath = dir + '/' + newName;
  if (oldPath !== newPath) fs.renameSync(oldPath, newPath);
  LOG.push('已重排: ' + oldName + '  ->  ' + newName);
}
fs.writeFileSync('_tmp_run.log', LOG.join('\n'), 'utf8');
