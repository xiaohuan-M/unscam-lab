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
function home() {
  const completed = Object.keys(saved.results).length,
    today = scenarios[dailySeed() % scenarios.length];
  const list = scenarios.filter(
    (s) =>
      filter === "全部" ||
      s.level === filter ||
      (filter === "未完成" && !saved.results[s.id]),
  );
  const cards = saved.mode === "challenge" ? shuffled(list, dailySeed()) : list;
  return `<section class="hero"><div><div class="eyebrow">UNSCAM LAB / 2.0</div><h1>骗局可以重来，<br><em>生活不必交学费。</em></h1><p>一条消息，一个选择。<br>在可以犯错的故事里，练习核实、判断和及时停下。</p><div class="row hero-actions">${button("开始今日一局 ↗", "start:" + today.id, "primary")}${saved.session && !saved.session.ended ? button("继续上次练习 →", "resume") : ""}<a class="button" href="#guide">先学三个动作</a></div><span class="quiet">16 个虚构情境 · 无需登录 · 本地模式不上传输入</span></div><div class="scene-art" aria-label="模拟消息与独立核实的选择"><div class="floating-card"><div class="card-cap"><span>一条新消息</span><span>刚刚</span></div><p>“这笔退款已经准备好了，<br>我们先核对一下账户……”</p></div><div class="floating-card"><div class="card-cap"><span>你的选择</span><span>↗</span></div><p>先停一下。<br>我从自己找到的入口查一查。</p></div><div class="stamp">保持清醒<br>慢一点也好</div></div></section>
 <section class="stats" aria-label="训练概况"><div class="stat"><b>${scenarios.length}</b><span>个生活情境</span></div><div class="stat"><b>${Object.keys(saved.mistakes).length}</b><span>个待巩固场景</span></div><div class="stat"><b>${String(completed).padStart(2, "0")}</b><span>个已完成故事</span></div></section>
 <div class="section-head"><div><div class="eyebrow">THE PRACTICE ROOM</div><h2>不是每条消息，都是骗局。</h2></div><a class="quiet" href="#review">查看我的成长 ↗</a></div><p class="hint">16 个故事混合风险情境与正常业务。目标是找出可靠依据，而不是一律拒绝。</p>
 <div class="mode-switch" role="group" aria-label="练习模式">${button("陪练模式 · 可查看提示", "mode:learn", saved.mode === "learn" ? "primary" : "")}${button("挑战模式 · 结束后看解析", "mode:challenge", saved.mode === "challenge" ? "primary" : "")}</div>
 <div class="filters">${["全部", "入门", "进阶", "未完成"].map((x) => button(x, "filter:" + x, "chip " + (filter === x ? "selected" : ""))).join("")}</div>
 <section class="grid">${
   cards
     .map((s) => {
       const i = scenarios.indexOf(s);
       return `<article class="case"><div class="case-art" aria-hidden="true"><span class="art-number">CASE ${String(i + 1).padStart(2, "0")}</span><span class="art-icon">${["↗", "¥", "☎", "▤", "%", "§", "＋", "♡", "⌘", "✳", "✉", "↺", "▣", "⌂", "↔", "◷"][i]}</span></div><div class="case-body"><div class="case-meta"><span>${saved.mode === "challenge" ? "生活情境" : esc(s.category)}</span><span>· ${s.minutes} 分钟</span><span>${saved.results[s.id] ? "已练习 ✓" : s.level}</span></div><h3>${saved.mode === "challenge" ? "未知情境 " + String(i + 1).padStart(2, "0") : esc(s.title)}</h3><p>${saved.mode === "challenge" ? "进入故事，收集信息，再决定下一步。" : esc(s.desc)}</p><div class="case-bottom"><span>${saved.results[s.id]?.endings?.length || 0} 种结局已探索</span>${button("进入故事 →", "start:" + s.id)}</div></div></article>`;
     })
     .join("") ||
   '<div class="empty">已完成这一组，试试另一种选择或挑战模式。</div>'
 }</section>
 <div class="notice">练习分不等于真实防骗能力。结束后的迁移题和下一次独立核实，才更值得关注。</div>`;
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
    return `<div class="empty"><h1>选择一个故事开始</h1><a class="button primary" href="#home">回到练习场</a></div>`;
  const s = scenarios.find((s) => s.id === session.id);
  if (session.ended) return result(s);
  const node = s.nodes[session.node],
    clues = visibleClues(s),
    history = session.history
      .map(
        (h) =>
          `<div class="bubble"><small>第 ${session.history.indexOf(h) + 1} 幕 · 剧情</small>${esc(s.nodes[h.node].text)}</div><div class="bubble mine">${esc(h.label)}</div>`,
      )
      .join("");
  const choices = shuffled(node.choices, session.seed + session.history.length);
  return `<div class="section-head"><div><div class="eyebrow">CASE ${String(scenarios.indexOf(s) + 1).padStart(2, "0")} / ${session.mode === "challenge" ? "挑战模式" : "陪练模式"}</div><h1 class="game-title">${session.mode === "challenge" ? "一段待你判断的对话" : esc(s.title)}</h1></div><a class="quiet" href="#home">保存并离开 ↗</a></div><p class="hint">${esc(s.desc)} 所有金额和操作均为虚构。</p>
 <div class="game-layout"><section class="panel chat-panel"><div class="chat-head"><div class="row"><span class="avatar">${esc(s.actor[0])}</span><div>${esc(s.actor)}<small>剧情角色 · 非真实联系人</small></div></div><span class="tag">第 ${session.history.length + 1} 幕</span></div>
 <div class="chat-log" role="log" aria-label="剧情对话">${history}<div class="bubble current"><small>当前消息</small>${esc(node.text)}</div>${chatMessages
   .filter((m) => m.node === session.node)
   .map(
     (m) =>
       `<div class="bubble ${m.role === "user" ? "mine" : m.generated ? "ai" : "local"}"><small>${m.role === "user" ? "你的追问" : m.generated ? "AI 生成 · 仅供练习" : "本地陪练提示"}</small>${esc(m.content)}</div>`,
   )
   .join(
     "",
   )}${aiBusy ? '<p class="hint" role="status">正在等待回复… ' + button("取消等待", "cancel-chat", "text") + "</p>" : ""}</div>
 ${suggested ? `<div class="notice">AI 理解你想做：${esc(node.choices.find((c) => c.id === suggested)?.text)}。<br>${button("确认采用这个行动", "choose:" + suggested, "primary")}<span class="quiet"> 也可以选择下面其他行动。</span></div>` : ""}
 <div class="choices" aria-label="选择你的下一步">${choices.map((c, i) => `<button data-action="choose:${c.id}"><b>${String.fromCharCode(65 + i)}</b>${esc(c.text)}</button>`).join("")}</div>
 <details id="chat-details" ${chatOpen ? "open" : ""}><summary>想自己说一句？${aiEnabled && config.enabled ? "AI 对话" : "本地陪练"}</summary><p class="hint">${aiEnabled && config.enabled ? "当前场景、最近 6 条对话和这次输入会发送给 " + esc(config.provider) + "。不要输入真实个人信息。" : "本地陪练不上传输入。要获得更灵活的多轮回复，可在设置中启用 AI。"}</p>
 <div class="row followups">${(followups.length ? followups : ["我可以通过什么渠道核实？", "这条消息还缺什么证据？"]).map((t, i) => button(esc(t), "followup:" + i, "chip")).join("")}</div>
 <form id="chat-form" class="compose"><textarea id="message" aria-label="你的回复" placeholder="描述你想问什么或接下来想怎么做…" maxlength="600" required ${aiBusy ? "disabled" : ""}></textarea><button class="primary" ${aiBusy ? "disabled" : ""}>发送</button></form><p class="quiet">回复不会自动付款或推进剧情，需要你确认行动。每局最多 8 次 AI 追问。</p></details></section>
 <aside class="game-aside"><section class="panel"><div class="aside-title">你的安全边界</div><strong>${fmt(session.money)}</strong><span class="quiet"> 模拟余额</span><div class="meter"><progress value="${session.money}" max="10000" aria-label="模拟余额"></progress></div><strong>${session.privacy}%</strong><span class="quiet"> 账户控制</span><div class="meter"><progress value="${session.privacy}" max="100" aria-label="账户控制"></progress></div><p class="hint">随时可以暂停。不必为了已经投入的时间或资金继续。</p></section>
 <section class="panel"><div class="aside-title">已出现的线索 · ${clues.length} 条</div>${clues.map((c) => `<button class="clue ${session.clues.includes(c.index) ? "picked" : ""}" data-action="clue:${c.index}">${session.clues.includes(c.index) ? "✓" : "＋"} ${esc(c.text)}</button>`).join("") || '<p class="hint">继续观察对话，更多线索会逐步出现。</p>'}<p class="hint">${session.mode === "challenge" ? "标记你注意到的线索，解析会在复盘中揭示。" : "点击线索，理解它能证明什么、不能证明什么。"}</p></section></aside></div>`;
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
  return `${intro("THE FIELD GUIDE", "先学会核实，再认识更多套路。", "六张行动卡结合公开来源整理；扩展资料保留原项目出处，作为参考阅读。")}<div class="lesson-grid">${lessons.cards.map((c) => `<article class="panel"><span class="tag">行动卡</span><h2>${esc(c.title)}</h2><p>${esc(c.why)}</p><strong>${esc(c.action)}</strong><details><summary>查看依据</summary>${sources([c.sourceId])}</details>${button("进入对应练习 →", "start:" + c.scenario, "text")}</article>`).join("")}</div><div class="section-head"><h2>扩展参考 · ${knowledge.length} 篇</h2><span class="quiet">QERSSD / 人间防骗指南</span></div><p class="notice">以下是保留出处的上游摘录，不是逐条核验的教材。法律门槛、医疗效果与绝对化表述请独立核实。练习评分不依赖这些摘录中的法律断言。</p><div class="searchbar"><input id="search" type="search" placeholder="搜索：兼职、退费、验证码…" aria-label="搜索知识" value="${esc(query)}"><select id="category" aria-label="按类别筛选"><option>全部</option>${[...new Set(knowledge.map((k) => k.cat))].map((c) => `<option ${category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div><div id="knowledge-results"></div>`;
}
function renderKnowledge() {
  const rows = knowledge.filter(
    (k) =>
      (category === "全部" || k.cat === category) &&
      `${k.title} ${k.lead} ${k.points.join(" ")} ${k.guards.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 12));
  page = Math.min(page, pages - 1);
  $("#knowledge-results").innerHTML =
    `<div class="section-head"><span class="quiet">找到 ${rows.length} 篇 · ${page + 1}/${pages} 页</span><div class="row"><button data-action="prev" ${page === 0 ? "disabled" : ""}>上一页</button><button data-action="next" ${page >= pages - 1 ? "disabled" : ""}>下一页</button></div></div><div class="knowledge">${
      rows
        .slice(page * 12, page * 12 + 12)
        .map(
          (k) =>
            `<article><span class="tag">${esc(k.cat)}</span><h3>${esc(k.title)}</h3><p>${esc(k.lead)}</p><details><summary>展开拆解与防护</summary><h4>常见套路</h4><ul>${k.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul><h4>参考防护建议（上游原文）</h4><ul>${k.guards.map((p) => `<li>${esc(p)}</li>`).join("")}</ul><a class="quiet" href="https://github.com/QERSSD/HowToAvoidScams" target="_blank" rel="noopener noreferrer">查看原项目与完整案例来源 ↗</a></details>${button(saved.reviews[k.id] ? "已加入复习 ✓" : "加入复习", "bookmark:" + k.id, "text")}</article>`,
        )
        .join("") ||
      '<div class="empty">没有找到。试试更短的关键词，或选择“全部”类别。</div>'
    }</div>`;
}
function review() {
  const entries = Object.entries(saved.results),
    cards = Object.entries(saved.reviews),
    due = cards.filter(([, v]) => v.due <= Date.now()),
    mistakes = Object.entries(saved.mistakes);
  return `${intro("SMALL STEPS COUNT", "把一次练习，变成下次的习惯。", "记录保存在当前浏览器。先复习还没掌握的判断，再探索其他故事。")}<div class="stats"><div class="stat"><b>${entries.length}/${scenarios.length}</b><span>完成场景</span></div><div class="stat"><b>${mistakes.filter(([, r]) => r.due <= Date.now()).length}</b><span>到期错题</span></div><div class="stat"><b>${due.length}</b><span>到期知识卡</span></div></div>
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
 <section class="panel form-grid"><h2>阅读与数据</h2>${button(saved.large ? "关闭大字模式" : "开启大字模式", "font")}<div class="notice">${storageAvailable ? "学习记录保存在这个浏览器。建议定期导出备份。" : "浏览器存储不可用，当前仅保留临时进度。请导出后再离开。"}</div><div class="row">${button("导出备份", "export")}${button("导入备份", "import-file")}<input id="import" type="file" accept="application/json" hidden>${button("清空本地记录", "reset", "danger")}</div><p class="hint">支持导入 v1 与 v2 备份，合并时保留较高成绩和已探索结局。不会导入密钥或聊天内容。</p><h3>安装与离线</h3><p class="hint" id="offline-state">${navigator.onLine ? "当前在线" : "当前离线"} · 基础资源完整缓存后可离线练习。AI 仍需要联网。</p>${button("查看离线状态", "offline-status")}${installPrompt ? button("安装到设备", "install") : ""}<p class="quiet">iPhone 可通过 Safari 分享菜单“添加到主屏幕”。安装能力因浏览器而异。</p></section></div>`;
}
function help() {
  return `${intro("PAUSE FIRST", "如果这件事正在现实中发生。", "先退出模拟练习。不要再为“解冻”“认证”“追回”支付任何费用。")}<div class="result-grid"><section class="panel"><h2>现在可以做的四件事</h2><ol><li><strong>停止转账和屏幕共享。</strong>不再按对方指示操作，不继续提供密码或验证码。</li><li><strong>通过独立官方渠道求助。</strong>中国大陆发生诈骗损失或紧急危险时，拨打 110；其他地区联系当地警方。及时联系银行或支付平台官方客服反映风险。</li><li><strong>保存现有证据。</strong>保留聊天、转账凭证、对方账号、时间与金额，不为取证继续与对方纠缠。</li><li><strong>找一个可信的人陪你处理。</strong>不要独自承受，也不要相信陌生人“付费追款”的保证。</li></ol><a class="button primary" href="tel:110">中国大陆：拨打 110</a><p class="hint">电话入口会唤起设备拨号功能；本应用不会自动报警。资金追回无法保证。</p></section><section class="panel checklist"><h3>准备材料（不上传）</h3>${["发生时间与经过", "转账时间、金额及凭证", "对方账号与联系方式", "聊天与页面截图", "已经采取的停止或保护措施"].map((t) => `<label><input type="checkbox">${t}</label>`).join("")}<p class="hint">这些勾选仅用于当前页面提醒。不要在 AI 对话中输入真实账号、身份证或验证码。</p><a class="quiet" href="https://www.gov.cn/xinwen/2016-04/08/content_5062481.htm" target="_blank" rel="noopener noreferrer">公安部接警止付公开说明 ↗</a></section></div>`;
}
function about() {
  return `${intro("ABOUT THE PROJECT", "识局 · Unscam Lab", "一个允许犯错，也鼓励中途停下的防骗练习场。")}<section class="panel"><h3>站在参考项目的基础上，重新设计学习体验</h3><p>参考 <a href="https://github.com/QERSSD/HowToAvoidScams" target="_blank" rel="noopener noreferrer">QERSSD / HowToAvoidScams</a>。知识库的 373 篇标题、导语、要点与防护建议摘自其 articles.json；进行了字段筛选和展示重构，保留原作者署名，按 CC BY-NC-SA 4.0 提供。剧情、交互和程序为本项目新实现。</p><p>上游快照：43c261f40c2e699f18bbcf3057645c0d8551ec23。参考内容不是本项目逐条独立核验的事实库；尤其是法律门槛、医疗效果、绝对化表述，不应直接用于现实判断。训练内容不复用上游的具体法律定罪断言。</p><p>本项目不收集分析埋点、不展示广告。基础模式不发送学习输入；使用 AI 时会把当前场景、最近六条对话与本次输入发送到配置的模型服务商。</p><h3>许可</h3><p>程序代码：MIT。知识库摘录与本项目教育文本：CC BY-NC-SA 4.0。含这些内容的版本不能直接用于商业用途；商业化需获得对应授权或独立替换受限内容。</p></section>`;
}
function render() {
  const route = (location.hash || "#home").slice(1);
  $("#main").innerHTML = (
    { home, play, library, review, settings, help, about, guide }[route] || home
  )();
  document.documentElement.classList.toggle("large", !!saved.large);
  document
    .querySelectorAll("nav a")
    .forEach((a) =>
      a.setAttribute("aria-current", a.hash === "#" + route ? "page" : "false"),
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
      start(arg);
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
      download("unscam-progress-v2.json", backup(saved));
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
        "<h2>清空本地学习记录？</h2><p>这会移除当前剧情、成绩、错题和知识卡。建议先导出备份。</p>" +
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
  [scenarios, knowledge, lessons] = await Promise.all(
    ["scenarios", "knowledge", "lessons"].map((n) =>
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
