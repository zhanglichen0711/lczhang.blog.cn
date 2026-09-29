const fs = require('fs');
const path = require('path');
const CRC32 = require(path.join(__dirname, 'node_modules/hexo-abbrlink/lib/crc32'));
const LOG = [];
function say(s) { LOG.push(s); }

// ===== 1. 归档非 ML 章节旧文 =====
const BASE = 'source/_posts/notes/模型训练与微调';
const ARCHIVE_DIRS = ['Deep-Learning', 'Fine-tuning', 'NLP', 'PyTorch', 'Transformer'];
const bdst = '.workbuddy/backup/mltune-old-posts-2026-09-08';
fs.mkdirSync(bdst, { recursive: true });
let archived = 0;
for (const d of ARCHIVE_DIRS) {
  const dirPath = BASE + '/' + d;
  if (!fs.existsSync(dirPath)) continue;
  for (const f of fs.readdirSync(dirPath)) {
    if (!f.endsWith('.md')) continue;
    fs.renameSync(dirPath + '/' + f, bdst + '/' + d + '__' + f);
    archived++;
  }
}
say('已归档 ' + archived + ' 篇 -> ' + bdst);

// ===== 2. abbrlink 占用 =====
function allMd(root) {
  const out = [];
  (function walk(dd) {
    for (const e of fs.readdirSync(dd, { withFileTypes: true })) {
      const p = path.join(dd, e.name);
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

function fmt(dt) {
  const p = function (x) { return String(x).padStart(2, '0'); };
  return dt.getUTCFullYear() + '-' + p(dt.getUTCMonth() + 1) + '-' + p(dt.getUTCDate());
}
const GAPS = [7, 8];
const SEQUENCE = [];
function addSeq(dir, slug, title) { SEQUENCE.push({ dir: dir, slug: slug, title: title }); }

addSeq('Machine-Learning', 'ml-intro-KEEP', 'KEEP-1');
addSeq('Machine-Learning', 'ml-linear-KEEP', 'KEEP-2');
addSeq('Machine-Learning', 'ml-knn-KEEP', 'KEEP-3');
addSeq('Machine-Learning', 'ml-ensemble-KEEP', 'KEEP-4');
addSeq('Machine-Learning', 'ml-logistic-regression', '逻辑回归与分类问题');
addSeq('Machine-Learning', 'ml-feature-engineering', '特征工程与数据预处理');
addSeq('Machine-Learning', 'ml-model-evaluation', '模型评估与交叉验证');
addSeq('Machine-Learning', 'ml-svm', '支持向量机与核方法');

addSeq('Deep-Learning', 'dl-intro', '深度学习简介：从机器学习到神经网络');
addSeq('Deep-Learning', 'dl-perceptron', '感知机与多层神经网络');
addSeq('Deep-Learning', 'dl-forward-tensor', '前向传播与张量基础');
addSeq('Deep-Learning', 'dl-activation-loss', '激活函数与损失函数');
addSeq('Deep-Learning', 'dl-backpropagation', '反向传播：梯度是怎么算出来的');
addSeq('Deep-Learning', 'dl-optimizers', '梯度下降与优化器');
addSeq('Deep-Learning', 'dl-regularization', '过拟合与正则化');
addSeq('Deep-Learning', 'dl-cnn', '卷积神经网络 CNN');
addSeq('Deep-Learning', 'dl-training-tricks', '训练技巧：BatchNorm、学习率与早停');
addSeq('Deep-Learning', 'dl-project', '深度学习实战：图像分类小项目');

addSeq('PyTorch', 'pytorch-intro', 'PyTorch 简介：动态图与自动求导');
addSeq('PyTorch', 'pytorch-tensors', '张量：创建、运算与索引');
addSeq('PyTorch', 'pytorch-autograd', 'autograd 自动求导');
addSeq('PyTorch', 'pytorch-module', '用 nn.Module 搭建模型');
addSeq('PyTorch', 'pytorch-training-loop', '训练循环：DataLoader 与优化器');
addSeq('PyTorch', 'pytorch-project', 'PyTorch 实战：训练一个分类模型');

addSeq('Transformer', 'transformer-intro', 'Transformer 为什么诞生：从序列模型到注意力');
addSeq('Transformer', 'transformer-attention', '注意力机制原理：Q、K、V 在算什么');
addSeq('Transformer', 'transformer-multihead', '多头注意力与位置编码');
addSeq('Transformer', 'transformer-architecture', '编码器-解码器架构拆解');
addSeq('Transformer', 'transformer-evolution', '从 Transformer 到 BERT 与 GPT');
addSeq('Transformer', 'transformer-handson', '动手实现一个简化 Transformer');

addSeq('NLP', 'nlp-intro', 'NLP 任务全景与文本表示');
addSeq('NLP', 'nlp-preprocess', '文本预处理：分词、清洗与规范化');
addSeq('NLP', 'nlp-word-embedding', '词向量：从独热到 Word2Vec 与 FastText');
addSeq('NLP', 'nlp-text-classification', '文本分类：朴素贝叶斯到 FastText');
addSeq('NLP', 'nlp-rnn', '序列建模：RNN、LSTM 与 GRU');
addSeq('NLP', 'nlp-bert', '预训练模型：BERT 与下游微调');
addSeq('NLP', 'nlp-hierarchical-classification', '层级文本分类实战');
addSeq('NLP', 'nlp-generation', '从分类到生成：大模型时代的 NLP');

addSeq('Fine-tuning', 'fine-tuning-intro', '什么是微调：从预训练到领域模型');
addSeq('Fine-tuning', 'fine-tuning-strategy', '迁移学习与微调策略');
addSeq('Fine-tuning', 'fine-tuning-lora', 'LoRA / QLoRA 高效微调');
addSeq('Fine-tuning', 'fine-tuning-sft', '指令微调 SFT：数据构造与训练');
addSeq('Fine-tuning', 'fine-tuning-rlhf-dpo', '对齐：RLHF 与 DPO');
addSeq('Fine-tuning', 'fine-tuning-evaluation', '微调评测与上线');

say('计划总篇数: ' + SEQUENCE.length);
let d = new Date(Date.UTC(2023, 6, 12));
let gi = 0;
say('idx|date|dir|slug|abbr|title');
SEQUENCE.forEach(function (s, i) {
  const ds = fmt(d);
  d = new Date(d.getTime() + GAPS[gi % 2] * 86400000); gi++;
  if (s.title === 'KEEP-1' || s.title === 'KEEP-2' || s.title === 'KEEP-3' || s.title === 'KEEP-4') {
    say(i + '|' + ds + '|' + s.dir + '|KEEP|KEEP|' + s.title);
  } else {
    let link = CRC32.str(s.title) >>> 0;
    while (used.has(String(link))) link++;
    used.add(String(link));
    say(i + '|' + ds + '|' + s.dir + '|' + s.slug + '|' + link + '|' + s.title);
  }
});
fs.writeFileSync('_tmp_plan.log', LOG.join('\n'), 'utf8');
