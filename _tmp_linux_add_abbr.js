'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join('source', '_posts', 'notes', '编程基础', 'Linux');
const crc32 = require('./' + path.join('node_modules', 'hexo-abbrlink', 'lib', 'crc32'));
const EOL = '\r\n';
const files = [
  '2023-08-25 Linux 云服务器.md',
  '2023-08-30 Linux 安装.md',
  '2023-09-04 Linux 忘记密码解决方法.md',
  '2023-09-09 Linux 文件与目录管理.md',
  '2023-09-14 Linux 文件基本属性.md',
  '2023-09-19 Linux 用户和用户组管理.md',
  '2023-09-24 Linux 磁盘管理.md',
  '2023-09-29 Linux 系统启动过程.md',
  '2023-10-04 Linux 系统目录结构.md',
  '2023-10-09 Linux 远程登录.md',
  '2023-10-14 WSL 安装 Linux.md',
];
for (const f of files) {
  const p = path.join(DIR, f);
  let s = fs.readFileSync(p, 'utf8');
  const m = s.match(/^title:\s*"([^"]+)"\r?\n/);
  if (!m) throw new Error('no title in ' + f);
  const title = m[1];
  const abbr = crc32.str(title) >>> 0;
  const needle = 'description: "' + title + '"' + EOL + '---';
  if (!s.includes(needle)) throw new Error('anchor not found in ' + f);
  if (/abbrlink:/.test(s.split('---')[0])) { console.log('already has abbrlink:', f); continue; }
  s = s.replace(needle, 'description: "' + title + '"' + EOL + 'abbrlink: ' + abbr + EOL + '---');
  fs.writeFileSync(p, s, 'utf8');
  console.log('added abbrlink', abbr, '->', f);
}
console.log('done');
