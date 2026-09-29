import os, re, shutil

ROOT = 'source/_posts'

# 一级中文名 → 目录 slug（文件夹名用中文一级，二级用英文，与侧边栏一致）
# 板块 notes → 技术笔记，thoughts → 行业思考
# 二级英文目录名：与分类 path 里的英文一致（空格/点转连字符，便于作为文件夹名）

def slug(name):
    # 与 Hexo 分类 slug 化一致：空格、点转连字符
    return name.replace(' ', '-').replace('.', '-')

# 解析一篇文章的分类，返回 (板块, 一级中文, 二级英文或None)
def parse_cats(txt):
    m = re.search(r'categories:\s*\n\s*-\s*\[?([^\n\]]+)\]?', txt)
    if not m:
        return None
    raw = m.group(1).strip()
    parts = [p.strip() for p in raw.split(',')]
    # parts 形如 ['编程基础', 'Python'] 或 ['如何学习'] 或 ['技术笔记','编程基础','Python'] 旧格式
    # 去掉可能的板块层
    if parts and parts[0] in ('技术笔记', '行业思考'):
        parts = parts[1:]
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1]

# 一级 → 板块映射
NOTES_L1 = {
    '编程基础', '前端交互', '后端服务', '数据与存储',
    '模型训练与微调', '模型部署与推理', '大模型应用', '工程化与运维'
}

moved = []
skipped = []

for sub in ['notes', 'thoughts']:
    src_dir = os.path.join(ROOT, sub)
    if not os.path.isdir(src_dir):
        continue
    for fn in sorted(os.listdir(src_dir)):
        if not fn.endswith('.md'):
            continue
        src = os.path.join(src_dir, fn)
        txt = open(src, encoding='utf-8').read()
        parsed = parse_cats(txt)
        if not parsed:
            skipped.append((fn, 'no cats'))
            continue
        l1, l2 = parsed
        if sub == 'notes':
            if l1 not in NOTES_L1:
                skipped.append((fn, 'unknown l1 ' + l1))
                continue
            # 二级目录
            l2_slug = slug(l2) if l2 else None
            dest_dir = os.path.join(ROOT, 'notes', l1)
            if l2_slug:
                dest_dir = os.path.join(dest_dir, l2_slug)
        else:
            # thoughts：一级目录直接放
            dest_dir = os.path.join(ROOT, 'thoughts', l1)
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, fn)
        shutil.move(src, dest)
        moved.append((sub, fn, l1, l2, os.path.relpath(dest, ROOT)))

print('=== 迁移', len(moved), '篇 ===')
for sub, fn, l1, l2, rel in moved:
    print(f'{sub} | {fn} -> {rel}')

print('\n=== 跳过', len(skipped), '篇 ===')
for s in skipped:
    print(s)
