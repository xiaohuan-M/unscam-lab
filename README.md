# 识局 · Unscam Lab

**骗局可以重来，生活不必交学费。** 一个面向中文用户的防骗互动学习应用：故事里做选择，复盘里理解风险，在间隔复习里形成习惯。

基于 [QERSSD/HowToAvoidScams](https://github.com/QERSSD/HowToAvoidScams) 的知识覆盖与教育理念，重新实现交互、剧情引擎和产品界面。不是上游项目的官方版本。

## 已实现

- 12 个原创模拟场景：理赔、刷单、AI 冒充、票务、投资、冒充机关、网贷、情感、账户出借、养老、钓鱼、二次追款。
- 每个故事有独立核验、追问、继续投入、中途止损等分支；三类结局；模拟资金与账户控制变化。
- 可点选线索板、逐步复盘、迁移判断题、重玩和 JSON 复盘导出。
- 373 篇上游知识摘录；全文关键词搜索、分类、分页、收藏与间隔复习。
- 每日场景轮换、自动保存未完成剧情、完成记录、最高练习分、备份导入/导出。
- 响应式桌面/平板/手机布局，大字模式、键盘焦点、减弱动画、PWA 基础离线缓存。
- 可选 OpenAI 兼容 LLM API。自由输入追问，模型生成场景内回复；规则引擎控制实际选项和结局。无 API 时使用本地提示。
- 无运行时第三方依赖、无广告、无分析埋点、无云端学习记录。

## 运行

Node.js 22+（建议 Node.js 24 LTS）。无需 npm install。

```bash
cp .env.example .env
npm start
```

打开 http://127.0.0.1:3000 。基础模式不需要修改 `.env`。

```bash
npm test
npm run check
```

## 接入 AI

编辑 `.env` 后重启：

```dotenv
LLM_BASE_URL=https://你的兼容服务/v1
LLM_MODEL=你的模型名称
LLM_API_KEY=你的密钥
```

使用提供 `POST /chat/completions` 且能按提示输出 JSON 的服务。`LLM_BASE_URL` **不要**包含 `/chat/completions`；服务只追加一次该路径。本地模型允许 `http://localhost:11434/v1` 等本机 HTTP 地址，其他地址必须 HTTPS。

也可仅在 `.env` 配置模型和地址，在应用设置页提供临时 Key。Key 仅保存在前端内存，刷新清空，不进入 localStorage 或备份。服务端 Key 优先于临时 Key。当前输入和场景会发送给所配置的提供商，请勿输入真实身份、账号或验证码。

公开服务还需配置 `APP_TOKEN`、HTTPS、反向代理和组织级限流；在界面输入访问口令。自带限流只用于小规模单实例，不是多租户账单控制系统。应用默认只监听本机；绑定非本机地址且没有口令时，AI 接口主动禁用。

AI 不可用、超时、JSON 错误时不阻断固定剧情。AI 的回复仍可能有误。模型返回的选项不作为可信决策，服务端始终返回已编写的合法动作；不是无限自主生成剧情的系统。

## 多端与部署

- 手机/平板/桌面使用相同 Web 应用。PWA 安装取决于设备和浏览器支持；没有原生 App 安装包。
- `public/` 可以独立放到任意静态站点（包括 GitHub Pages），支持子路径部署。静态部署没有 AI 代理，自动使用本地模式。
- 完整 AI 版使用 `npm start` 或 Docker，并由 HTTPS 反向代理提供服务。
- 首次完整在线加载后可离线使用基础内容；AI 需要联网。更新资源时提升 `public/sw.js` 中缓存版本，关闭旧页面后重新打开。
- 进度只在本机；跨设备迁移请导出/导入 JSON。没有用户账号与自动云同步。

```bash
docker build -t unscam-lab .
docker run --rm -p 3000:3000 --env-file .env -e HOST=0.0.0.0 unscam-lab
```

## 项目结构

```text
public/app.js               页面、交互、本地持久化
public/engine.js            纯函数剧情状态机
public/data/scenarios.json  可编辑场景、节点、选择、结局
public/data/knowledge.json  上游知识摘录
server/index.mjs           静态服务与 LLM 代理
scripts/import-knowledge.py 可复现的上游知识导入
tests/                     分支遍历与 API 回归测试
docs/                      产品方案、内容规范、部署和验证记录
```

## 许可与来源

程序代码 MIT；上游知识摘录和本项目教育文本 CC BY-NC-SA 4.0。包含上游知识的完整产品不可直接商业化；需获得许可或独立替换受限材料。详见 [LICENSE](LICENSE)、[原项目许可](docs/UPSTREAM-LICENSE.md) 与 [内容来源](docs/CONTENT.md)。

知识库保留上游原文防护建议，**不代表本项目逐条独立核验**；其中绝对化法律/健康表述应谨慎使用。训练场景避免直接复制这些断言。产品不替代警方、律师、医生或金融机构的专业处理。

## 验证范围

10 项 Node 原生测试通过，覆盖所有场景所有编写路径、止损资金规则、无效动作、间隔复习、静态服务、认证/跨域限制、LLM 输出限制与失败回退。真实商业模型尚未用付费 Key 联调，浏览器设备端视觉/E2E 验收尚未完成。后续发布前建议按 `docs/QA.md` 的步骤验收。
