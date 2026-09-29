const fs = require('fs');
const path = require('path');
const CRC32 = require(path.join(__dirname, 'node_modules/hexo-abbrlink/lib/crc32'));
const LOG = [];
function say(s) { LOG.push(s); }

// 1) 归档
const ARCHIVE = [
  // MySQL 最新两篇（空占位）
  'source/_posts/notes/数据与存储/MySQL/2026-10-09-mysql-index.md',
  'source/_posts/notes/数据与存储/MySQL/2026-10-11-mysql-transaction.md',
  // Redis 全部 5 篇
  'source/_posts/notes/数据与存储/Redis/2024-04-18-redis-structures.md',
  'source/_posts/notes/数据与存储/Redis/2024-05-12-redis-ttl-session.md',
  'source/_posts/notes/数据与存储/Redis/2024-06-06-redis-cache-boundary.md',
  'source/_posts/notes/数据与存储/Redis/2026-10-13-redis-persistence.md',
  'source/_posts/notes/数据与存储/Redis/2026-10-15-redis-lock.md',
  // Milvus 全部 4 篇
  'source/_posts/notes/数据与存储/Milvus/2026-01-24-milvus-index.md',
  'source/_posts/notes/数据与存储/Milvus/2026-02-16-milvus-ops.md',
  'source/_posts/notes/数据与存储/Milvus/2026-03-11-milvus-hybrid.md',
  'source/_posts/notes/数据与存储/Milvus/2026-10-17-milvus-tuning.md'
];
const bdst = '.workbuddy/backup/storage-old-posts-2026-09-08';
fs.mkdirSync(bdst, { recursive: true });
for (const f of ARCHIVE) {
  if (fs.existsSync(f)) {
    fs.renameSync(f, bdst + '/' + f.split('/').slice(-2).join('_')); // 用目录名_文件名防重名
    say('归档: ' + f);
  }
}

// 2) 全站 abbrlink 集合
function allMd(root) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) out.push(p.split(path.sep).join('/'));
    }
  })(root);
  return out;
}
const used = new Set();
for (const f of allMd('source/_posts')) {
  const h = (fs.readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/) || [, ''])[1];
  const a = h.match(/^abbrlink:\s*(\S+)/m);
  if (a) used.add(a[1]);
}
say('\n当前全站 abbrlink: ' + used.size);

function fmt(dt) {
  const p = function (x) { return String(x).padStart(2, '0'); };
  return dt.getUTCFullYear() + '-' + p(dt.getUTCMonth() + 1) + '-' + p(dt.getUTCDate());
}
const GAPS = [6, 7];

const PLANS = [
  { sec: 'Redis', dir: 'Redis', start: [2024, 3, 15], items: [
    'Redis 简介：AI 应用为什么离不开它|redis-intro',
    'Redis 安装与五大数据类型入门|redis-types',
    'Redis 键操作与过期时间|redis-keys-ttl',
    'Redis List 与消息队列|redis-list-queue',
    'Redis Hash 存储对象与轻量会话|redis-hash',
    'Redis Set 与 ZSet：去重、标签与排行榜|redis-set-zset',
    'Redis 缓存穿透、击穿与雪崩|redis-cache-avalanche',
    'Redis 缓存一致性：Cache Aside 与更新策略|redis-cache-consistency',
    'Redis 分布式锁：SET NX EX 与看门狗|redis-distributed-lock',
    'Redis 持久化：RDB 与 AOF 怎么选|redis-persistence',
    'Redis 实战：AI 问答的会话与 FAQ 缓存|redis-ai-cache'
  ]},
  { sec: 'Milvus', dir: 'Milvus', start: [2025, 12, 6], items: [
    'Milvus 简介：向量数据库在 RAG 里的位置|milvus-intro',
    'Milvus 安装与第一个集合|milvus-setup',
    'Milvus 向量与索引：度量方式与 HNSW/IVF|milvus-vector-index',
    'Milvus 集合与字段设计：主键、向量与标量|milvus-schema',
    'Milvus 数据写入：insert、upsert 与分段管理|milvus-write',
    'Milvus 检索与过滤：search 与 expr 权限下推|milvus-search-filter',
    'Milvus 混合检索：稠密向量 + BM25 稀疏|milvus-hybrid',
    'Milvus 索引与检索调优：从召回率到延迟|milvus-tuning',
    'Milvus Rerank：用精排把召回变成相关|milvus-rerank',
    'Milvus 运维：备份、监控与横向扩展|milvus-ops',
    'Milvus 实战：搭建企业知识库检索服务|milvus-knowledge-base'
  ]}
];

for (const p of PLANS) {
  say('\n===== ' + p.sec + ' =====');
  let d = new Date(Date.UTC(p.start[0], p.start[1], p.start[2]));
  let gi = 0;
  p.items.forEach(function (it) {
    const sp = it.split('|');
    const title = sp[0], slug = sp[1];
    let link = CRC32.str(title) >>> 0;
    while (used.has(String(link))) link++;
    used.add(String(link));
    say(fmt(d) + '|' + title + '|' + slug + '|' + link);
    d = new Date(d.getTime() + GAPS[gi % 2] * 86400000); gi++;
  });
}
fs.writeFileSync('_tmp_plan.log', LOG.join('\n'), 'utf8');
