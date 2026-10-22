import { createLearning } from "./lib/learning.js";
import {
  initial,
  act,
  score,
  shuffled,
  dailySeed,
  nextReview,
} from "./engine.js";
import {
  STORAGE_KEY,
  emptyProgress,
  loadProgress,
  validateProgress,
  mergeProgress,
  backup,
  validatePuzzles,
} from "./lib/storage.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let collection, learning;
let scenarios = [],
  knowledge = [],
  lessons = { cards: [], sources: [] },
  filter = "全部",
  query = "",
  category = "全部",
  page = 0,
  session = null;
let saved = emptyProgress(),
  config = {},
  apiKey = "",
  appToken = "",
  aiEnabled = false,
  aiBusy = false,
  aiController = null,
  requestId = 0,
  chatMessages = [],
  followups = [],
  suggested = null,
  chatOpen = false,
  pendingStart = null;
let storageAvailable = true,
  installPrompt = null,
  swRegistration = null;
const storeKey = STORAGE_KEY;
function persist() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(storeKey, JSON.stringify(saved));
  } catch {
    storageAvailable = false;
    toast("无法保存到浏览器。请在离开前导出备份。");
  }
}
function cancelChat() {
  requestId++;
  aiController?.abort();
  aiBusy = false;
  aiController = null;
}
function sources(ids) {
  return ids
    .map((id) => lessons.sources.find((x) => x.id === id))
    .filter(Boolean)
    .map(
      (x) =>
        `<a class="source-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.publisher)} · ${esc(x.title)} ↗<small>发布 ${x.date} · 核对 ${x.checked}</small></a>`,
    )
    .join("");
}
function visibleClues(s) {
  return s.clues
    .map((c, i) => ({ ...c, index: i }))
    .filter((c) => !c.available || c.available.includes(session.node));
}
function sourceNote(s) {
  return s.sourceIds?.length
    ? `<details><summary>机制参考与来源</summary>${sources(s.sourceIds)}<p class="quiet">剧情为虚构教学改编，来源支持风险机制，不代表发生过完全相同的案件。</p></details>`
    : '<p class="quiet">原创虚构情境，用于练习独立核实，不代表现实案件、机构承诺或专业判断。</p>';
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 4500);
}
function modal(title, text) {
  $("#modal-body").innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
  $("#modal").showModal();
}
const fmt = (n) => "¥" + n.toLocaleString("zh-CN");
function href(route) {
  location.hash = route;
}
function button(text, action, cls = "") {
  return `<button class="${cls}" data-action="${action}">${text}</button>`;
}
const intro = (k, t, p) =>
  `<div class="page-intro"><div class="eyebrow">${k}</div><h1>${t}</h1><p>${p}</p></div>`;
function phoneStatus() {
  return `<div class="phone-status" aria-hidden="true"><span>9:41</span><span class="phone-island"></span><span class="phone-signal">▮▮▮ <i></i></span></div>`;
}
function home() {
  const completed = Object.keys(saved.results).length;
  const today = scenarios[dailySeed() % scenarios.length];
  const list = scenarios.filter(
    (s) =>
      filter === "全部" ||
      s.level === filter ||
      (filter === "未完成" && !saved.results[s.id]),
  );
  const cards = saved.mode === "challenge" ? shuffled(list, dailySeed()) : list;
  const continuing = saved.session && !saved.session.ended;
  return `<div class="phone-stage inbox-stage">
    <section class="phone-intro">
      <div class="eyebrow">UNSCAM LAB · 模拟手机</div>
      <h1>你收到了一条<br><em>新消息。</em></h1>
      <p class="phone-lead">熟悉的聊天窗口，意想不到的下一句。<br>点开一段对话，看看你会怎么回应。</p>
      <div class="phone-start">${continuing ? button("继续上次对话 →", "resume", "primary") : button("打开今日消息 →", "start:" + today.id, "primary")}<span class="quiet">每段约 3–5 分钟 · 进度自动保存</span></div>
      <div class="phone-progress"><span><b>${String(completed).padStart(2, "0")}</b> / ${scenarios.length} 段对话已完成</span><a href="#review">查看复盘 ↗</a></div>
      <p class="phone-footnote">不是每条消息都有问题。先聊一聊、找依据，再做决定。在这里，选错也可以重来。</p>
      <div class="phone-extras"><a href="#classic:chat"><span>↳</span><div><strong>想玩原来的版本？</strong><small>打开原版聊天闯关</small></div><span>↗</span></a><a href="#learn"><span>▤</span><div><strong>聊完，再多学一点</strong><small>373 篇全文 · 自查 · 推理 · 下载</small></div><span>↗</span></a><a href="#settings"><span>✳</span><div><strong>${aiEnabled && config.enabled ? "AI 陪练已开启" : "基础版已就绪"}</strong><small>${aiEnabled && config.enabled ? "管理模型与临时 API Key" : "无需 API Key，也可接入 AI 自由追问"}</small></div><span>↗</span></a></div>
    </section>
    <section class="phone-device inbox-phone" aria-label="模拟手机收件箱">
      ${phoneStatus()}
      <div class="inbox-heading"><div><span class="phone-kicker">模拟收件箱</span><h2>信息<span>${scenarios.length}</span></h2></div><span class="sms-icon" aria-hidden="true">✉</span></div>
      <div class="phone-modes" role="group" aria-label="练习模式"><button data-action="mode:learn" aria-pressed="${saved.mode === "learn"}">陪练<span>随时看提示</span></button><button data-action="mode:challenge" aria-pressed="${saved.mode === "challenge"}">挑战<span>结束后揭晓</span></button></div>
      <div class="filters inbox-filters" role="group" aria-label="筛选对话">${["全部", "入门", "进阶", "未完成"].map((x) => `<button class="chip ${filter === x ? "selected" : ""}" data-action="filter:${x}" aria-pressed="${filter === x}">${x}</button>`).join("")}</div>
      <div class="inbox-list" tabindex="0" aria-label="对话列表，可滚动查看全部情境">${
        cards
          .map((s) => {
            const i = scenarios.indexOf(s);
            const active = continuing && saved.session.id === s.id;
            const done = !!saved.results[s.id];
            return `<article class="case inbox-item"><button class="message-row" data-action="start:${s.id}" aria-label="${esc(s.actor)}，${active ? "继续对话" : done ? "再次体验" : "打开消息"}"><span class="contact-avatar contact-${i % 4}" aria-hidden="true">${esc(s.actor[0])}</span><span class="case-body"><span class="message-top"><strong>${esc(s.actor)}</strong><small>${active ? "进行中" : done ? "已完成" : "新消息"}</small></span><span class="message-preview">${esc(active ? s.nodes[saved.session.node].text : s.nodes.start.text)}</span><span class="message-note">${saved.mode === "challenge" ? "未知情境 " + String(i + 1).padStart(2, "0") : esc(s.category)} · ${s.minutes} 分钟${active ? " · 继续对话" : done ? " · " + saved.results[s.id].endings.length + " 种结局" : ""}</span></span><span class="message-indicator" aria-hidden="true">${active ? "↩" : done ? "✓" : "●"}</span></button></article>`;
          })
          .join("") ||
        '<div class="empty">这组对话已经完成，试试其他情境。</div>'
      }</div>
      <div class="phone-bottom"><span>虚构联系人 · 所有操作仅为模拟</span><div class="home-indicator" aria-hidden="true"></div></div>
    </section>
  </div>`;
}
function start(id, confirmed = false) {
  if (!scenarios.some((s) => s.id === id)) return;
  if (!confirmed && session && !session.ended && session.history.length) {
    pendingStart = id;
    $("#modal-body").innerHTML =
      "<h2>开始新的一局？</h2><p>当前未完成的剧情会被替换，已完成的学习记录会保留。</p>" +
      button("开始新局", "confirm-start", "primary");
    $("#modal").showModal();
    return;
  }
  cancelChat();
  session = initial(id, saved.mode);
  chatMessages = [];
  followups = [];
  suggested = null;
  chatOpen = false;
  saved.session = session;
  persist();
  href("play");
  render();
}
function play() {
  if (!session)
    return `<div class="empty"><h1>打开一条消息开始</h1><a class="button primary" href="#home">回到收件箱</a></div>`;
  const s = scenarios.find((s) => s.id === session.id);
  if (session.ended) return result(s);
  const node = s.nodes[session.node];
  const clues = visibleClues(s);
  const history = session.history
    .map(
      (h, i) =>
        `<div class="message-time">第 ${i + 1} 幕</div><div class="bubble"><small>${h.node === "verify" ? "核实结果" : "剧情消息"}</small>${esc(s.nodes[h.node].text)}</div><div class="bubble mine"><small>你的回复 / 行动</small>${esc(h.label)}</div>`,
    )
    .join("");
  const choices = shuffled(node.choices, session.seed + session.history.length);
  return `<div class="sms-stage">
    <section class="phone-device sms-phone" aria-label="模拟手机对话">
      ${phoneStatus()}
      <div class="chat-head"><a class="phone-back" href="#home" aria-label="保存并返回收件箱">‹</a><div class="chat-contact"><span class="contact-avatar" aria-hidden="true">${esc(s.actor[0])}</span><div><strong>${esc(s.actor)}</strong><small>虚构联系人 · 模拟对话</small></div></div><button class="phone-info" data-action="conversation-tools" aria-label="查看线索与本局信息">···</button></div>
      <div class="thread-status"><span>${session.mode === "challenge" ? "挑战模式" : "陪练模式"}</span><span>${aiEnabled && config.enabled ? "AI 已开启" : "本地模式"} · 第 ${session.history.length + 1} 幕</span></div>
      <div class="chat-log" role="log" aria-label="剧情对话" tabindex="0">${history}<div class="message-time">现在 · 第 ${session.history.length + 1} 幕</div><div class="bubble current"><small>${session.node === "verify" ? "核实结果" : "当前消息"}</small>${esc(node.text)}</div>${chatMessages
        .filter((m) => m.node === session.node)
        .map(
          (m) =>
            `<div class="bubble ${m.role === "user" ? "mine" : m.generated ? "ai" : "local"}"><small>${m.role === "user" ? "你的追问" : m.generated ? "AI 生成 · 仅供练习" : "本地陪练提示"}</small>${esc(m.content)}</div>`,
        )
        .join(
          "",
        )}${aiBusy ? '<p class="hint typing-status" role="status"><span aria-hidden="true">•••</span> 正在等待回复… ' + button("取消等待", "cancel-chat", "text") + "</p>" : ""}</div>
      <div class="reply-area">
        ${suggested ? `<div class="notice">AI 理解你想做：${esc(node.choices.find((c) => c.id === suggested)?.text)}。<br>${button("确认采用这个行动", "choose:" + suggested, "primary")}<span class="quiet"> 也可以选择其他行动。</span></div>` : ""}
        <p class="reply-caption">你会怎么回复或行动？</p>
        <div class="choices" aria-label="选择你的下一步">${choices.map((c, i) => `<button data-action="choose:${c.id}"><b>${String.fromCharCode(65 + i)}</b><span>${esc(c.text)}</span><span class="reply-arrow" aria-hidden="true">↗</span></button>`).join("")}</div>
        <details id="chat-details" ${chatOpen ? "open" : ""}><summary><span class="compose-plus" aria-hidden="true">＋</span>自己输入一句<span class="compose-mode">${aiEnabled && config.enabled ? "AI 对话" : "本地陪练"}</span></summary><p class="hint">${aiEnabled && config.enabled ? "当前场景、最近 6 条对话和这次输入会发送给 " + esc(config.provider) + "。不要输入真实个人信息。" : "本地陪练不上传输入。要获得更灵活的多轮回复，可在设置中启用 AI。"}</p>
        <div class="row followups">${(followups.length ? followups : ["我可以通过什么渠道核实？", "这条消息还缺什么证据？"]).map((t, i) => button(esc(t), "followup:" + i, "chip")).join("")}</div>
        <form id="chat-form" class="compose"><textarea id="message" aria-label="你的回复" placeholder="你想怎么回复？" maxlength="600" required ${aiBusy ? "disabled" : ""}></textarea><button class="primary" ${aiBusy ? "disabled" : ""}>发送</button></form><p class="quiet">输入不会自动推进剧情，需要你确认行动。每局最多 8 次 AI 追问。</p></details>
      </div>
      <div class="phone-bottom"><span>没有真实转账 · 不会联系任何人</span><div class="home-indicator" aria-hidden="true"></div></div>
    </section>
    <aside id="conversation-tools" class="conversation-tools" tabindex="-1">
      <div class="conversation-context"><div class="eyebrow">这一段对话</div><h1 class="game-title">${session.mode === "challenge" ? "先聊一聊，再下结论。" : esc(s.title)}</h1><p>${esc(s.desc)}</p><a class="quiet" href="#home">← 保存并回到收件箱</a></div>
      <section class="phone-wallet"><div><span>模拟余额</span><strong>${fmt(session.money)}</strong></div><div><span>账户控制</span><strong>${session.privacy}%</strong></div><p>都是模拟数字。随时可以停下，不必把这一局玩到底。</p></section>
      <section class="phone-clues"><div class="aside-title">随手记下线索 <span>${session.clues.length} / ${clues.length}</span></div>${clues.map((c) => `<button class="clue ${session.clues.includes(c.index) ? "picked" : ""}" data-action="clue:${c.index}" aria-pressed="${session.clues.includes(c.index)}">${session.clues.includes(c.index) ? "✓" : "＋"} ${esc(c.text)}</button>`).join("") || '<p class="hint">继续观察，新的线索会逐步出现。</p>'}<p class="hint">${session.mode === "challenge" ? "这里只记录观察，结束后再揭晓解析。" : "点开线索，看看它能证明什么、不能证明什么。"}</p></section>
      <div class="conversation-links"><a href="#guide">先学三个核实动作 ↗</a><a href="#settings">${aiEnabled && config.enabled ? "管理 AI 对话" : "接入 LLM，自由追问"} ↗</a></div>
    </aside>
  </div>`;
}
function result(s) {
  const ending = s.outcomes?.[session.node] || {
    title: "这一局结束了。",
    explanation: s.lesson,
  };
  const feedback = session.assessed
    ? `<div class="notice">${session.assessmentCorrect ? "回答正确。" : "已加入错题回练。"}${esc(s.transfer.explanation)}</div>`
    : "";
  return `${intro("THE DEBRIEF", esc(ending.title), esc(ending.explanation))}<div class="result-grid"><section><div class="panel"><span class="badge">${s.kind === "normal" ? "正常业务对照" : "风险情境"} · ${session.mode === "challenge" ? "挑战" : "陪练"}</span><div class="stats"><div class="stat"><b>${fmt(session.money)}</b><span>剩余模拟资金</span></div><div class="stat"><b>${session.privacy}%</b><span>账户控制</span></div><div class="stat"><b>${score(session)}</b><span>练习分 · 非能力评级</span></div></div><h2>带走一个动作</h2><p>${esc(s.lesson)}</p><div class="row">${button("试试另一条路", "start:" + s.id, "primary")}<a class="button" href="#home">下一段故事</a>${button("导出本局复盘", "export-session")}${button("打印复盘", "print")}</div></div>
 <div class="panel"><h2>换个情境，你怎么判断？</h2><p>${esc(s.transfer.question)}</p><div class="choices">${shuffled(
   s.transfer.options.map((text, index) => ({ text, index })),
   session.seed + 9,
 )
   .map(
     (t) =>
       `<button data-action="transfer:${t.index}" ${session.assessed ? "disabled" : ""}>${esc(t.text)}</button>`,
   )
   .join(
     "",
   )}</div><div id="transfer-feedback" role="status">${feedback}</div></div>
 <div class="panel"><h3>你还可以探索的分支</h3><ul class="branch-list">${Object.entries(
   s.outcomes,
 )
   .map(
     ([id, o]) =>
       `<li><span>${(saved.results[s.id]?.endings || []).includes(id) ? "✓ 已经历" : "○ 未探索"}</span>${esc(o.title)}</li>`,
   )
   .join("")}</ul></div></section>
 <section class="panel"><h2>你的决定，逐步拆开看</h2><div class="timeline">${session.history.map((h) => `<div><strong>${esc(h.label)}</strong><p>${esc(h.lesson)}</p><span class="quiet ${h.loss || h.privacy ? "danger" : ""}">${h.loss ? "模拟资金 −" + fmt(h.loss) : h.privacy ? "账户控制 −" + h.privacy + "%" : "没有新增损失"}</span></div>`).join("")}</div><h3>回看线索</h3>${s.clues.map((c, i) => `<details><summary>${session.clues.includes(i) ? "✓ 你标记了" : "○ 未标记"} · ${esc(c.text)}</summary><p>${esc(c.why)}</p></details>`).join("")}${sourceNote(s)}<div class="notice">发现风险后停下，是值得练习的能力。受骗不意味着你不够聪明。</div><a class="button" href="#help">现实中遇到问题怎么办 ↗</a></section></div>`;
}
function library() {
  return learning.library(
    lessons.cards
      .map(
        (c) =>
          `<article class="panel"><span class="tag">行动卡</span><h2>${esc(c.title)}</h2><p>${esc(c.why)}</p><strong>${esc(c.action)}</strong><details><summary>查看依据</summary>${sources([c.sourceId])}</details>${button("进入对应练习 →", "start:" + c.scenario, "text")}</article>`,
      )
      .join(""),
  );
}
function renderKnowledge() {
  learning.results();
}
function review() {
  const entries = Object.entries(saved.results),
    cards = Object.entries(saved.reviews),
    due = cards.filter(([, v]) => v.due <= Date.now()),
    mistakes = Object.entries(saved.mistakes);
  return `${intro("SMALL STEPS COUNT", "把一次练习，变成下次的习惯。", "记录保存在当前浏览器。先复习还没掌握的判断，再探索其他故事。")}<div class="stats"><div class="stat"><b>${entries.length}/${scenarios.length}</b><span>完成场景</span></div><div class="stat"><b>${mistakes.filter(([, r]) => r.due <= Date.now()).length}</b><span>到期错题</span></div><div class="stat"><b>${due.length}</b><span>到期知识卡</span></div></div>
 <section class="panel"><h2>阅读与行动</h2><p>已读 ${Object.keys(saved.read || {}).length} / 373 篇 · 自查 ${Object.keys(saved.selfcheck || {}).length} / 45 项</p><div class="row"><a class="button" href="#learn">继续学习</a><a class="button" href="#selfcheck-plan">查看行动清单</a></div></section>
 <h2>错题与风险回练</h2>${
   mistakes.length
     ? mistakes
         .map(([id, r]) => {
           const s = scenarios.find((s) => s.id === id);
           return `<div class="panel review-card"><div><h3>${esc(s.title)}</h3><span class="quiet">${r.due <= Date.now() ? "现在可复习" : new Date(r.due).toLocaleDateString("zh-CN") + " 再练"} · 在完整故事中重新判断</span></div>${button("回练这个情境 →", "start:" + id, "primary")}</div>`;
         })
         .join("")
     : '<div class="empty">完成故事与迁移题后，需要巩固的情境会自动出现在这里。</div>'
 }
 <div class="section-head"><h2>故事记录</h2><a href="#home" class="quiet">继续探索 ↗</a></div>${
   entries.length
     ? entries
         .map(([id, r]) => {
           const s = scenarios.find((s) => s.id === id);
           return `<div class="panel review-card"><div><h3>${esc(s.title)}</h3><span class="quiet">练习 ${r.attempts} 次 · 最高 ${r.best} 分 · 探索 ${r.endings.length} 种结局</span></div>${button("再练一局 →", "start:" + id)}</div>`;
         })
         .join("")
     : '<div class="empty"><p>从一个短故事开始。</p><a class="button primary" href="#home">去练习</a></div>'
 }
 <div class="section-head"><h2>知识卡复习</h2><a class="quiet" href="#library">添加知识卡 ↗</a></div>${
   cards.length
     ? cards
         .sort((a, b) => a[1].due - b[1].due)
         .map(([id, r]) => {
           const k = knowledge.find((k) => String(k.id) === id);
           return `<div class="panel"><span class="tag">${r.due <= Date.now() ? "今天复习" : new Date(r.due).toLocaleDateString("zh-CN") + " 复习"}</span><h3>${esc(k.title)}</h3><p>先回想：最需要核实什么？你会采取哪个动作？</p><details><summary>查看上游参考答案，再评价掌握程度</summary><ul>${k.guards.map((g) => `<li>${esc(g)}</li>`).join("")}</ul><div class="row">${button("还不熟悉 · 明天再练", "rate:" + id + ":again")}${button("记住了 · 延后复习", "rate:" + id + ":good", "primary")}</div></details>${button("移出复习", "unbookmark:" + id, "text")}</div>`;
         })
         .join("")
     : '<div class="empty">在知识库选择“加入复习”，建立自己的记忆卡。</div>'
 }<div class="row">${button("导出学习记录", "export")}<a class="button" href="#settings">导入与管理数据</a></div>`;
}
function settings() {
  return `${intro("MAKE IT YOURS", "按你的方式练习。", "基础玩法无需模型，也无需账号。AI 对话按需开启。")}<div class="result-grid"><section class="panel form-grid"><h2>AI 对话设置</h2><div class="notice">${config.enabled ? `可用模型：${esc(config.model)}<br>服务商：${esc(config.provider)}` : "本地剧情可用。服务器尚未开启 AI，或当前使用静态站点。"}</div><p class="hint">开启后，当前场景、最近 6 条对话和本次输入将发送到配置的服务商。对话不会写入本地学习备份。不要输入真实个人信息。</p><label>临时 API Key<input id="api-key" type="password" autocomplete="off" placeholder="服务端已配置时可留空" value="${esc(apiKey)}"></label><label>访问口令<input id="app-token" type="password" autocomplete="off" placeholder="公开 AI 服务由管理员提供" value="${esc(appToken)}"></label><label class="inline-check"><input id="ai-enabled" type="checkbox" ${aiEnabled ? "checked" : ""} ${!config.enabled ? "disabled" : ""}> 我理解数据发送范围，启用本次会话 AI</label><div class="row">${button("保存本次设置", "save-settings", "primary")}${button("测试连接", "test-ai")}${button("清除临时凭据", "clear-keys")}</div><div id="connection-result" role="status"></div><p class="quiet">测试连接会发起一次简短模型请求，可能产生费用。刷新后密钥、口令和 AI 开关清空。</p><details><summary>部署者配置说明</summary><p class="hint">复制 .env.example 为 .env，填写 LLM_BASE_URL、LLM_MODEL、LLM_API_KEY 后重启。只支持 OpenAI 兼容 chat/completions 协议；服务地址由服务器配置。公开服务需 APP_MODE=public 和至少 16 字符 APP_TOKEN。详见仓库 README。</p></details></section>
 <section class="panel form-grid"><h2>阅读与数据</h2>${button(saved.theme === "dark" ? "切换浅色模式" : "切换深色模式", "theme")}${button(saved.large ? "关闭大字模式" : "开启大字模式", "font")}<div class="notice">${storageAvailable ? "学习记录保存在这个浏览器。建议定期导出备份。" : "浏览器存储不可用，当前仅保留临时进度。请导出后再离开。"}</div><div class="row">${button("导出备份", "export")}${button("导入备份", "import-file")}<input id="import" type="file" accept="application/json" hidden>${button("清空本地记录", "reset", "danger")}</div><p class="hint">支持导入 v1 / v2 / v3 备份；包含全文已读、自查、推理存档与主题设置，合并时保留较高成绩和已探索结局。不会导入密钥或聊天内容。</p><h3>安装与离线</h3><p class="hint" id="offline-state">${navigator.onLine ? "当前在线" : "当前离线"} · 基础资源完整缓存后可离线练习。AI 仍需要联网。</p>${button("查看离线状态", "offline-status")}${installPrompt ? button("安装到设备", "install") : ""}<p class="quiet">iPhone 可通过 Safari 分享菜单“添加到主屏幕”。安装能力因浏览器而异。</p></section></div>`;
}
function help() {
  return `${intro("PAUSE FIRST", "如果这件事正在现实中发生。", "先退出模拟练习。不要再为“解冻”“认证”“追回”支付任何费用。")}<div class="result-grid"><section class="panel"><h2>现在可以做的四件事</h2><ol><li><strong>停止转账和屏幕共享。</strong>不再按对方指示操作，不继续提供密码或验证码。</li><li><strong>通过独立官方渠道求助。</strong>中国大陆发生诈骗损失或紧急危险时，拨打 110；其他地区联系当地警方。及时联系银行或支付平台官方客服反映风险。</li><li><strong>保存现有证据。</strong>保留聊天、转账凭证、对方账号、时间与金额，不为取证继续与对方纠缠。</li><li><strong>找一个可信的人陪你处理。</strong>不要独自承受，也不要相信陌生人“付费追款”的保证。</li></ol><a class="button primary" href="tel:110">中国大陆：拨打 110</a><p class="hint">电话入口会唤起设备拨号功能；本应用不会自动报警。资金追回无法保证。</p></section><section class="panel checklist"><h3>准备材料（不上传）</h3>${["发生时间与经过", "转账时间、金额及凭证", "对方账号与联系方式", "聊天与页面截图", "已经采取的停止或保护措施"].map((t) => `<label><input type="checkbox">${t}</label>`).join("")}<p class="hint">这些勾选仅用于当前页面提醒。不要在 AI 对话中输入真实账号、身份证或验证码。</p><a class="quiet" href="https://www.gov.cn/xinwen/2016-04/08/content_5062481.htm" target="_blank" rel="noopener noreferrer">公安部接警止付公开说明 ↗</a></section></div>`;
}
function about() {
  return `${intro("ABOUT THE PROJECT", "识局 · Unscam Lab", "一个允许犯错，也鼓励中途停下的防骗练习场。")}<section class="panel"><h3>站在参考项目的基础上，重新设计学习体验</h3><p>参考 <a href="https://github.com/QERSSD/HowToAvoidScams" target="_blank" rel="noopener noreferrer">QERSSD / HowToAvoidScams</a>。完整保留原项目 65 个文件：373 篇全文及所有字段、45 道自查原题、16 个聊天事件、12 个逻辑谜题、42 个术语、120 条报道、3 篇长文、16 个分卷、问答技能与全部下载资料。全文阅读与生活自查进行了交互重构；原版游戏保留规则并适配导航。新增 16 个分支故事和 AI 陪练由本项目实现。<a href="#resources">查看完整内容与校验清单 →</a></p><p>上游快照：43c261f40c2e699f18bbcf3057645c0d8551ec23。参考内容不是本项目逐条独立核验的事实库；尤其是法律门槛、医疗效果、绝对化表述，不应直接用于现实判断。训练内容不复用上游的具体法律定罪断言。</p><p>本项目不收集分析埋点、不展示广告。基础模式不发送学习输入；使用 AI 时会把当前场景、最近六条对话与本次输入发送到配置的模型服务商。</p><h3>许可</h3><p>程序代码：MIT。原作文字与本项目教育文本：CC BY-NC-SA 4.0。含这些内容的版本不能直接用于商业用途；商业化需获得对应授权或独立替换受限内容。</p></section>`;
}
function render() {
  const route = (location.hash || "#home").slice(1);
  document.body.dataset.view =
    route === "play" && session && !session.ended
      ? "phone-play"
      : route === "home"
        ? "phone-home"
        : route;
  $("#main").innerHTML =
    learning?.route(route) ??
    (
      { home, play, library, review, settings, help, about, guide }[route] ||
      home
    )();
  document.documentElement.classList.toggle("large", !!saved.large);
  document.documentElement.dataset.theme = saved.theme || "light";
  document
    .querySelectorAll("nav a")
    .forEach((a) =>
      a.setAttribute(
        "aria-current",
        a.hash === "#" + route ||
          (a.hash === "#home" && route === "play") ||
          (a.hash === "#learn" &&
            /^(article:|document:|selfcheck|games|classic:|glossary|sources|resources)/.test(
              route,
            ))
          ? "page"
          : "false",
      ),
    );
  if (route === "library") renderKnowledge();
  if (route === "play" && session && !session.ended) {
    const log = $(".chat-log");
    log.scrollTop = log.scrollHeight;
  }
}
function download(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function finish() {
  const old = saved.results[session.id];
  saved.results[session.id] = {
    best: Math.max(old?.best || 0, score(session)),
    attempts: (old?.attempts || 0) + 1,
    date: Date.now(),
    last: session.node,
    endings: [...new Set([...(old?.endings || []), session.node])],
  };
  if (["loss", "recovered", "missed"].includes(session.node))
    saved.mistakes[session.id] = { level: -1, due: Date.now() };
  saved.session = session;
  persist();
}
function guide() {
  return `${intro("START HERE", "遇到拿不准的消息，先做三个动作。", "用三分钟熟悉玩法，然后进入一个故事亲自判断。")}<div class="guide-steps"><article class="panel"><span class="step-number">01</span><h2>暂停</h2><p>先不转账，不提交敏感信息。把对方制造的时间压力放到一边。</p></article><article class="panel"><span class="step-number">02</span><h2>换个渠道核实</h2><p>回到原订单、已保存号码或自己找到的官方入口。不要只用对方提供的材料证明对方。</p></article><article class="panel"><span class="step-number">03</span><h2>再作决定</h2><p>有可靠依据再处理；发现矛盾就停下。正常业务也可以核实后继续。</p></article></div><div class="panel"><h2>在这里怎么练？</h2><ol><li>阅读当前消息，观察逐步出现的线索。</li><li>选一个行动；也可以自己输入追问。</li><li>完成复盘与迁移题。判断失误会自动加入回练。</li></ol><div class="row">${button("从第一段故事开始", "start:refund", "primary")}<a class="button" href="#home">自己选择情境</a></div></div>`;
}
async function sendChat(event, preset) {
  event?.preventDefault();
  if (aiBusy || !session || session.ended) return;
  const message = (preset ?? $("#message")?.value ?? "").trim();
  if (!message || message.length > 600) return;
  if (/\b\d{6,}\b|\S+@\S+\.\S+|sk-\S{8,}/i.test(message)) {
    toast("请移除真实号码、邮箱、验证码或密钥后再发。");
    return;
  }
  const active = session,
    node = active.node,
    s = scenarios.find((s) => s.id === active.id);
  chatOpen = true;
  const history = chatMessages
    .slice(-6)
    .map(({ role, content }) => ({ role, content }));
  if (aiEnabled && config.enabled && active.turns >= 8) {
    toast("本局 AI 追问已达上限，请使用行动选项继续。");
    return;
  }
  chatMessages.push({ role: "user", content: message, node });
  suggested = null;
  followups = [];
  if (!aiEnabled || !config.enabled) {
    const clues = visibleClues(s);
    const answer =
      session.mode === "challenge"
        ? "挑战模式暂不提供解析。你可以检查已出现的线索，选择核实、继续或暂停。"
        : clues[0]?.why || "先区分对方的说法与能独立核实的事实，再决定下一步。";
    chatMessages.push({
      role: "assistant",
      content: answer,
      node,
      generated: false,
    });
    chatMessages = chatMessages.slice(-24);
    render();
    return;
  }
  aiBusy = true;
  active.turns++;
  saved.session = active;
  persist();
  const id = ++requestId;
  const controller = new AbortController();
  aiController = controller;
  const timer = setTimeout(() => controller.abort(), 25000);
  render();
  try {
    const r = await fetch("./api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LLM-Key": apiKey,
        "X-App-Token": appToken,
      },
      body: JSON.stringify({ scenario: s.id, node, message, history }),
      signal: controller.signal,
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "回复失败");
    if (id !== requestId || session !== active || active.node !== node) return;
    chatMessages.push({
      role: "assistant",
      content: data.reply,
      node,
      generated: true,
    });
    chatMessages = chatMessages.slice(-24);
    suggested = s.nodes[node].choices.some(
      (c) => c.id === data.suggestedActionId,
    )
      ? data.suggestedActionId
      : null;
    followups = data.followups || [];
  } catch (error) {
    if (id === requestId) {
      chatMessages.push({
        role: "assistant",
        content: "这次 AI 回复未完成。已有剧情和选项仍可继续。",
        node,
        generated: false,
      });
      toast(
        error.name === "AbortError"
          ? "等待已取消或超时，继续本地剧情即可。"
          : error.message,
      );
    }
  } finally {
    clearTimeout(timer);
    if (id === requestId) {
      aiBusy = false;
      aiController = null;
      render();
    }
  }
}
function choose(id) {
  if (!session || session.ended) return;
  cancelChat();
  const s = scenarios.find((s) => s.id === session.id);
  session = act(session, s, id);
  suggested = null;
  followups = [];
  chatOpen = false;
  if (session.ended) finish();
  else {
    saved.session = session;
    persist();
  }
  render();
  $("#main").focus({ preventScroll: true });
}
async function testConnection() {
  if (!config.enabled) {
    toast("服务器尚未开启 AI，请先完成服务配置。");
    return;
  }
  apiKey = $("#api-key").value.trim();
  appToken = $("#app-token").value.trim();
  const target = $("#connection-result");
  target.textContent = "正在测试连接…";
  const btn = $('[data-action="test-ai"]');
  btn.disabled = true;
  try {
    const r = await fetch("./api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LLM-Key": apiKey,
        "X-App-Token": appToken,
      },
      body: "{}",
      signal: AbortSignal.timeout(25000),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    target.textContent = "连接成功。启用上方 AI 开关后即可使用。";
  } catch (e) {
    target.textContent =
      "连接未成功：" + (e.name === "TimeoutError" ? "请求超时" : e.message);
  } finally {
    btn.disabled = false;
  }
}
document.addEventListener("submit", (e) => {
  if (e.target.id === "chat-form") sendChat(e);
});
document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const [action, arg, value] = target.dataset.action.split(":");
  switch (action) {
    case "start":
      if (
        target.classList.contains("message-row") &&
        saved.session?.id === arg &&
        !saved.session.ended
      ) {
        href("play");
        render();
      } else start(arg);
      break;
    case "confirm-start":
      $("#modal").close();
      start(pendingStart, true);
      break;
    case "resume":
      cancelChat();
      session = saved.session;
      chatMessages = [];
      href("play");
      render();
      break;
    case "mode":
      saved.mode = arg === "challenge" ? "challenge" : "learn";
      persist();
      render();
      break;
    case "filter":
      filter = arg;
      render();
      break;
    case "conversation-tools":
      $("#conversation-tools")?.scrollIntoView({ block: "start" });
      $("#conversation-tools")?.focus({ preventScroll: true });
      break;
    case "choose":
      choose(arg);
      break;
    case "clue": {
      if (!session || session.ended) return;
      const s = scenarios.find((s) => s.id === session.id),
        i = Number(arg),
        c = visibleClues(s).find((c) => c.index === i);
      if (!c) return;
      if (!session.clues.includes(i)) session.clues.push(i);
      saved.session = session;
      persist();
      render();
      modal(
        c.text,
        session.mode === "challenge"
          ? "已记录这个观察。完整解释将在本局复盘时揭示。"
          : c.why,
      );
      break;
    }
    case "transfer": {
      if (!session?.ended || session.assessed) return;
      const s = scenarios.find((s) => s.id === session.id),
        correct = Number(arg) === s.transfer.answer;
      session.assessed = true;
      session.transferAnswer = Number(arg);
      session.assessmentCorrect = correct;
      if (!correct) saved.mistakes[s.id] = { level: -1, due: Date.now() };
      else if (saved.mistakes[s.id]) {
        if (["safe", "verified"].includes(session.node))
          saved.mistakes[s.id] = nextReview(saved.mistakes[s.id], true);
      }
      saved.session = session;
      persist();
      render();
      break;
    }
    case "bookmark":
      saved.reviews[arg] ??= { level: -1, due: Date.now() };
      persist();
      renderKnowledge();
      toast("已加入知识卡复习");
      break;
    case "unbookmark":
      delete saved.reviews[arg];
      persist();
      render();
      break;
    case "rate": {
      const card = saved.reviews[arg];
      if (card) {
        saved.reviews[arg] = nextReview(card, value === "good");
        persist();
        render();
        toast("已安排下次复习");
      }
      break;
    }
    case "prev":
      page = Math.max(0, page - 1);
      renderKnowledge();
      $("#knowledge-results").scrollIntoView({ block: "start" });
      break;
    case "next":
      page++;
      renderKnowledge();
      $("#knowledge-results").scrollIntoView({ block: "start" });
      break;
    case "theme":
      saved.theme = saved.theme === "dark" ? "light" : "dark";
      persist();
      render();
      break;
    case "font":
      saved.large = !saved.large;
      persist();
      render();
      break;
    case "save-settings":
      apiKey = $("#api-key").value.trim();
      appToken = $("#app-token").value.trim();
      aiEnabled = !!$("#ai-enabled").checked && !!config.enabled;
      toast("本次设置已保存，刷新页面后会清空。");
      break;
    case "clear-keys":
      apiKey = "";
      appToken = "";
      aiEnabled = false;
      cancelChat();
      render();
      toast("临时凭据已清除");
      break;
    case "test-ai":
      await testConnection();
      break;
    case "cancel-chat":
      cancelChat();
      render();
      toast("已取消等待");
      break;
    case "followup": {
      const text = (
        followups.length
          ? followups
          : ["我可以通过什么渠道核实？", "这条消息还缺什么证据？"]
      )[Number(arg)];
      if (text) sendChat(null, text);
      break;
    }
    case "export":
      download("unscam-progress-v3.json", backup(saved));
      break;
    case "export-session":
      download("unscam-debrief.json", {
        scenario: session.id,
        score: score(session),
        money: session.money,
        privacy: session.privacy,
        history: session.history,
      });
      break;
    case "import-file":
      $("#import").click();
      break;
    case "print":
      window.print();
      break;
    case "reset":
      $("#modal-body").innerHTML =
        "<h2>清空本地学习记录？</h2><p>这会移除当前剧情、成绩、错题、知识卡、全文已读、自查答案和推理存档。建议先导出备份。</p>" +
        button("确认清空", "confirm-reset", "danger");
      $("#modal").showModal();
      break;
    case "confirm-reset": {
      cancelChat();
      saved = emptyProgress();
      session = null;
      chatMessages = [];
      try {
        localStorage.removeItem("unscam-v1");
        localStorage.removeItem("shimian.save.v1");
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      persist();
      $("#modal").close();
      render();
      toast("本地学习记录已清空");
      break;
    }
    case "install":
      if (installPrompt) {
        await installPrompt.prompt();
        installPrompt = null;
        render();
      }
      break;
    case "offline-status": {
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        modal(
          "离线状态",
          registration?.active
            ? "基础资源已安装。首次完成加载后，可在断网时重开本应用。AI 仍需联网。"
            : "当前尚未完成离线安装。请在 HTTPS 或 localhost 打开并保持联网片刻。",
        );
      } catch {
        modal("离线状态", "此浏览器不提供离线缓存能力，在线练习仍然可用。");
      }
      break;
    }
    case "update-app":
      if (swRegistration?.waiting) {
        persist();
        swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      break;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    query = e.target.value;
    page = 0;
    renderKnowledge();
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "category") {
    category = e.target.value;
    page = 0;
    renderKnowledge();
  }
  if (e.target.id === "import")
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1000000) throw Error("文件超过 1 MB");
      const incoming = validateProgress(
        JSON.parse(await file.text()),
        scenarios,
        knowledge,
      );
      saved = mergeProgress(saved, incoming);
      persist();
      render();
      toast("已合并备份，原有较高成绩会保留。");
    } catch (error) {
      toast("导入失败：" + error.message);
    }
});
$("#font").onclick = () => {
  saved.large = !saved.large;
  persist();
  render();
};
window.addEventListener("hashchange", () => {
  cancelChat();
  render();
  window.scrollTo(0, 0);
  $("#main").focus({ preventScroll: true });
});
window.addEventListener("message", (e) => {
  if (
    e.origin !== location.origin ||
    e.source !== document.querySelector(".classic-frame")?.contentWindow ||
    e.data?.type !== "UNSCAM_PUZZLES_UPDATED"
  )
    return;
  saved.puzzles = validatePuzzles(e.data.puzzles);
  persist();
});
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener("offline", () => toast("已离线，基础训练仍可继续。"));
window.addEventListener("online", () => toast("网络已恢复。"));
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY)
    toast("另一个页面更新了学习记录，建议刷新后继续。");
});
async function setupOffline() {
  if (!("serviceWorker" in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register("./sw.js");
    const notify = () => {
      if (swRegistration.waiting && navigator.serviceWorker.controller) {
        $("#update-banner").hidden = false;
      }
    };
    notify();
    swRegistration.addEventListener("updatefound", () => {
      const worker = swRegistration.installing;
      worker?.addEventListener("statechange", notify);
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (
        !reloading &&
        swRegistration.waiting === null &&
        $("#update-banner").hidden === false
      ) {
        reloading = true;
        location.reload();
      }
    });
  } catch {
    /* Online use remains available in browsers that disallow service workers. */
  }
}
try {
  [scenarios, knowledge, lessons, collection] = await Promise.all(
    ["scenarios", "knowledge", "lessons", "collection"].map((n) =>
      fetch(`./data/${n}.json`).then((r) => {
        if (!r.ok) throw Error("资源加载失败");
        return r.json();
      }),
    ),
  );
  let loaded;
  try {
    loaded = loadProgress(localStorage, scenarios, knowledge);
  } catch {
    loaded = {
      data: emptyProgress(),
      warning: "浏览器禁止保存，当前使用临时进度。",
    };
    storageAvailable = false;
  }
  saved = loaded.data;
  session = saved.session;
  learning = createLearning({
    knowledge,
    collection,
    getSaved: () => saved,
    persist,
    render,
    toast,
    esc,
  });
  render();
  if (loaded.warning) toast(loaded.warning);
  setupOffline();
  fetch("./api/config", { signal: AbortSignal.timeout(3000) })
    .then((r) => (r.ok ? r.json() : {}))
    .then((data) => {
      config = data;
      if (location.hash === "#settings") {
        const draftKey = $("#api-key").value,
          draftToken = $("#app-token").value,
          focused = document.activeElement?.id;
        render();
        $("#api-key").value = draftKey;
        $("#app-token").value = draftToken;
        if (["api-key", "app-token"].includes(focused))
          $("#" + focused).focus();
      }
    })
    .catch(() => {});
} catch {
  $("#main").innerHTML =
    '<div class="empty"><h1>基础资源还没加载好</h1><p>首次使用需要联网加载。检查网络后刷新即可重试。</p><a class="button primary" href="./">重新加载</a></div>';
}
