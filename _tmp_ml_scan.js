const fs = require('fs');
const path = require('path');
const LOG = [];
function say(s) { LOG.push(s); }

const BASE = 'source/_posts/notes/模型训练与微调';
const dirs = [];
for (const e of fs.readdirSync(BASE, { withFileTypes: true })) {
  if (e.isDirectory()) dirs.push(e.name);
}
dirs.sort();
for (const d of dirs) {
  const dirPath = BASE + '/' + d;
  say('===== ' + d + ' =====');
  for (const f of fs.readdirSync(dirPath).sort()) {
    if (!f.endsWith('.md')) continue;
    const p = dirPath + '/' + f;
    const raw = fs.readFileSync(p, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const h = m ? m[1] : '';
    const title = (h.match(/^title:\s*"?([^"\r\n]+)/m) || [])[1] || '(no-fm)';
    const date = (h.match(/^date:\s*([0-9-]+)/m) || [])[1] || '';
    const body = m ? m[2] : raw;
    const bodyLen = body.replace(/\s/g, '').length;
    const firstBody = body.replace(/^\s+/, '').split(/\r?\n/)[0] || '';
    say(date + ' | ' + f + ' | ' + bodyLen + '字 | ' + title + (bodyLen < 40 ? ' [空占位]' : ''));
  }
}
fs.writeFileSync('_tmp_ml_scan.log', LOG.join('\n'), 'utf8');
