# 3.0 原项目内容覆盖清单

来源快照：`QERSSD/HowToAvoidScams@43c261f40c2e699f18bbcf3057645c0d8551ec23`。

| 原项目 | 原始文件保留 | 新版入口与处理 |
| --- | --- | --- |
| 373 篇正文 / 16 类 | tools/articles.json、16 个 book 分卷、离线 HTML | 知识库全文阅读，所有字段不丢失；8,248 正文块 |
| 120 报道 / 1,474 关联 | tools/news.json、案例与报道、核实记录 | 报道检索、文章尾部同类报道；算法对齐原作 |
| 42 术语 | glossary.py、术语表.md、Anki | 原文检索与分类导航 |
| 45 项 / 8 组自查 | selfcheck.html | 行动版、原题对照、三态记录、优先级清单、备份 |
| 经典聊天游戏 | game/index.html、data.js、replies.js、game.js、style.css | 16 事件全部保留；原作每局 12 轮 |
| 12 推理关卡 / 2 章 | murdoku.html、题库、背景数据、引擎与验证工具 | 原题、线索、提示、背景、人物与问答；增加键盘和统一存档 |
| 3 篇长文 | docs/长文-*.md | 原文阅读与 Markdown 下载 |
| 目录、核实、标注口径 | docs 全部文件 | 资料中心可阅读、下载 |
| 防骗问答技能 | skill/防骗问答/SKILL.md | 文本阅读、下载；不自动执行 |
| PDF / EPUB / Anki | downloads/ 下三个原始文件 | 下载中心按需下载 |
| 两份离线 HTML | index.html、人间防骗指南.html | 保留原始文件；单文件下载与完整 ZIP |
| README / LICENSE / assets | 所有原始字节保留 | 资料阅读、源码 ZIP 和完整校验信息 |
| 构建与校验脚本、仓库配置 | 全部 tools 文件及原 .gitignore | 保存在 reference/ 与 ZIP，未删减 |

## 可复核性

`public/data/collection.json` 含全部 65 个原始源文件的路径、长度、SHA-256 与 Git blob SHA。2026-10-22 通过 GitHub 递归树核对，65 项与上游快照一致。完整 ZIP 包含这 65 个原始文件；不含 .git 目录，也不镜像第三方报道网页。

`tests/content.test.mjs` 检查全文所有字段、正文块、来源引用、文件哈希、题库关联、搜索、复制、Markdown 转义、备份迁移。浏览器测试覆盖文章深链、自查、完整下载、经典游戏、推理结案、离线、多种屏宽与主题。

12 关使用原作 count_solutions 与 propagate 独立重算，均为唯一解且可用约束传播解出。原版脚本含旧输出目录，验证时直接读取已提交的 game/murdoku-puzzles.json 调用 check_puzzles。

## 重新导入

```bash
python scripts/import-knowledge.py /path/to/clean/HowToAvoidScams
npm run verify
```

要求上游工作树干净；脚本生成全文、资料索引、逐文件清单及确定性 ZIP。导入后人工检查新增内容数量、站内游戏适配差异与许可，更新这里的固定快照。不要格式化 public/reference 下的文件，否则字节校验会失败。

## 进度范围

新版故事 / 错题 / 知识卡 / 已读 / 自查 / 推理结案统一使用 v3 备份。旧版推理结案记录会在可用时迁移。经典聊天游戏按原作规则运行，其进行中的随机单局不跨刷新保存；完整新版故事支持自动续玩。
