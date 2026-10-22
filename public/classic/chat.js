import {
  IDENTITIES,
  newRun,
  decide,
  availableChoices,
  currentEvent,
  finishEarly,
  snapshot,
  restoreRun,
  sanitizeClassic,
  localResponse,
} from "./engine.js";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (n) => "¥" + n.toLocaleString("zh-CN");
const KEY = "unscam-v2";
let data,
  run = null,
  view = "start",
  extras = [],
  proposed = null,
  aiOn = false,
  aiBusy = false,
  aiRequest = 0,
  aiTurns = 0;
let speed = "natural",
  playing = false,
  sequence = 0,
  waiters = [],
  pending = [],
  showOptions = true,
  newMessages = false;
let warning = "",
  previousScene = null,
  requestReject = null,
  followLatest = true;
const embed = window.parent !== window;
const rootLink = (hash) => "../index.html#" + hash;
function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
function classicSaved() {
  return sanitizeClassic(readSaved().classic);
}
function toast(t) {
  $("#game-toast").textContent = t;
  $("#game-toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => $("#game-toast").classList.remove("visible"),
    4200,
  );
}
function save() {
  if (!run) return;
  try {
    const root = readSaved(),
      classic = sanitizeClassic(root.classic),
      item = snapshot(run);
    classic.current = item;
    if (run.ended) {
      classic.recent = classic.recent.filter((s) => s.seed !== item.seed);
      classic.recent.push(item);
      classic.recent = classic.recent.slice(-8);
    }
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 3,
        results: {},
        reviews: {},
        ...root,
        classic,
      }),
    );
    if (embed)
      parent.postMessage(
        { type: "UNSCAM_CLASSIC_UPDATED", classic },
        location.origin,
      );
  } catch {
    warning = "本机存储不可用，本次进度只保留到页面关闭。";
    toast(warning);
  }
}
function pref(name, value) {
  try {
    const root = readSaved();
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 3,
        results: {},
        reviews: {},
        ...root,
        [name]: value,
      }),
    );
    if (embed)
      parent.postMessage(
        {
          type: "UNSCAM_CLASSIC_PREFERENCES",
          theme: root.theme || "light",
          large: !!root.large,
          [name]: value,
        },
        location.origin,
      );
  } catch {}
}
function applyPrefs(root) {
  document.documentElement.classList.toggle("dark", root.theme === "dark");
  document.documentElement.classList.toggle("large", !!root.large);
}
function button(text, action, cls = "", attrs = "") {
  return `<button class="btn ${cls}" data-game="${action}" ${attrs}>${text}</button>`;
}
function openDialog(html) {
  $("#dialog-content").innerHTML = html;
  $("#game-dialog").showModal();
}
function abortPlayback() {
  sequence++;
  playing = false;
  for (const [timer, resolve] of waiters) {
    clearTimeout(timer);
    resolve(false);
  }
  waiters = [];
  pending = [];
}
function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w[0] !== timer);
      resolve(true);
    }, ms);
    waiters.push([timer, resolve]);
  });
}
function cancelAI() {
  aiRequest++;
  if (aiBusy && embed)
    parent.postMessage({ type: "UNSCAM_CLASSIC_CANCEL" }, location.origin);
  aiBusy = false;
  requestReject?.(Error("已取消"));
  requestReject = null;
}
function leave() {
  abortPlayback();
  cancelAI();
  save();
  view = "start";
  renderStart();
}
function history() {
  const runs = classicSaved()
    .recent.map((raw) => ({ raw, state: restoreRun(raw, data) }))
    .filter((x) => x.state?.ended)
    .reverse();
  openDialog(
    `<h2>过往复盘</h2><p>保留最近八次结束记录，也会进入学习备份。</p>${
      runs.length
        ? runs
            .map(
              ({ raw, state }) =>
                `<details class="past-run"><summary>${new Date(raw.updated).toLocaleDateString("zh-CN")} · ${state.log.length} 段对话 · 损失 ${fmt(state.lostTotal)}</summary>${state.log
                  .map((row) => {
                    const e = data.events.find((e) => e.id === row.eid);
                    return `<article><h3>${esc(e.title)}</h3><p>${row.choices.map(esc).join(" → ") || "暂停，未作选择"}</p><p>模拟损失 ${fmt(row.loss)}${row.control ? " · 账户 / 资料控制受影响" : ""}${row.risks.length ? " · " + row.risks.map(esc).join("；") : ""}</p><p>${esc(e.guard)}</p></article>`;
                  })
                  .join("")}</details>`,
            )
            .join("")
        : "<p>完成一局或选择“现在结束并复盘”后，会在这里留下记录。</p>"
    }`,
  );
}
function menu() {
  openDialog(
    `<h2>稍微停一下</h2><p class="menu-hint">所有消息、转账和身份都是模拟。聊天输入与 Key 不写入存档。</p><div class="menu-links"><a href="${rootLink("learn")}" target="_top">学习资料 · 全部内容 ↗</a><a href="${rootLink("library")}" target="_top">373 篇原文知识库 ↗</a><a href="${rootLink("classic:logic")}" target="_top">识骗迷局 · 12 个谜题 ↗</a><a href="${rootLink("settings")}" target="_top">${aiOn ? "管理 LLM 与临时 Key" : "接入 LLM，启用 AI 回复"} ↗</a><a href="${rootLink("practice")}" target="_top">扩展的 16 个分支练习 ↗</a><a href="${rootLink("help")}" target="_top">现实中遇到问题，查看求助步骤 ↗</a></div>${button("过往复盘 · 最近八次", "history")}<div class="menu-controls">${button("切换明暗主题", "theme")}${button("切换大字模式", "font")}</div>${run && !run.ended ? button("保存，稍后继续", "pause") + button("现在结束并复盘", "finish") : ""}`,
  );
}
function renderStart() {
  abortPlayback();
  view = "start";
  document.body.dataset.page = "start";
  const role = IDENTITIES.find((r) => r.id === run?.identity);
  $("#app").innerHTML =
    `<div class="start-screen"><div class="wechat-heading"><div><strong>别被骗了啊</strong><small>沿用原作玩法 · 微信式模拟</small></div><button class="more-button" data-game="menu" aria-label="打开游戏菜单">···</button></div><section class="original-intro"><div class="start-chat" aria-hidden="true"><div class="wx-row"><div class="avatar avatar-green">群</div><div class="wx-bubble">有个小忙，想请你帮一下。</div></div><div class="wx-row me"><div class="avatar">我</div><div class="wx-bubble">什么事？</div></div></div><h1>手机响了。</h1><p>你有 <b>${fmt(10000)}</b> 模拟资金。<br>接下来是十二段消息、来电与群聊。<br>照自己的判断回复，最后一起复盘。</p><p class="intro-note">有骗局，也有正常业务。可以随时停下。</p></section>
 ${warning ? `<p class="storage-warning" role="status">${esc(warning)}</p>` : ""}
 ${run && !run.ended ? `<section class="resume-card"><div><strong>上次的对话还在</strong><small>第 ${run.round + 1} / ${run.deck.length} 局 · ${esc(role?.name)} · ${fmt(run.money)}</small></div>${button("继续对话", "resume", "primary")}</section>` : ""}
 <section class="start-controls"><label class="identity-label">这次的生活身份<select id="identity"><option value="random">随机身份</option>${IDENTITIES.map((r) => `<option value="${r.id}">${r.icon} ${r.name}</option>`).join("")}</select></label>${button("手机响了，开始 →", "start:challenge", "primary start-main")}${button("先玩 4 局热身", "start:warmup", "secondary")}<span class="small-note">所有身份都从 ¥10,000 开始 · 不需要 API Key</span></section>
 <details class="scene-picker"><summary>练习一个指定场景 <span>原作 16 个</span></summary><div class="scene-list">${data.events.map((e) => button(`<span class="scene-kind">${e.channel === "call" ? "来电" : e.channel === "live" ? "直播" : e.channel === "sms" ? "短信" : e.channel === "offline" ? "现场" : "聊天"}</span>${esc(e.title)}`, "scene:" + e.id)).join("")}</div></details>
 ${run?.ended ? button("查看上次复盘", "resume", "text-button") : ""}
 <div class="start-links"><a href="${rootLink("learn")}" target="_top">原作全部资料 ↗</a><a href="${rootLink("settings")}" target="_top">${aiOn ? "AI 增强版已连接" : "接入 AI 增强版"} ↗</a></div><p class="attribution">基于 QERSSD / HowToAvoidScams · 虚构训练</p></div>`;
}
function begin(mode, scene = 1, confirmed = false) {
  const identity = $("#identity")?.value || "random";
  if (!confirmed && run && !run.ended) {
    openDialog(
      `<h2>重新开一局？</h2><p>当前对话会结束并保留复盘记录，新的一局重新从 ¥10,000 开始。</p>${button("结束当前对话，开始新局", "confirm:" + mode + ":" + scene + ":" + identity, "primary")}`,
    );
    return;
  }
  startRun(mode, scene, identity);
}
function startRun(mode, scene, identity) {
  abortPlayback();
  cancelAI();
  if (run && !run.ended) {
    run = finishEarly(run);
    save();
  }
  run = newRun(data, { mode, scene, identity });
  extras = [];
  aiTurns = 0;
  previousScene = null;
  proposed = null;
  save();
  renderChat(0);
}
function transcript() {
  const out = [];
  run.messages.forEach((m, i) => {
    out.push(m);
    out.push(...extras.filter((x) => x.after === i + 1).map((x) => x.message));
  });
  return out;
}
function sceneBanner(e) {
  if (e.channel === "call")
    return `<div class="call scene-banner"><div class="call-icon" aria-hidden="true">☎</div><strong>${esc(e.contact)}</strong><div class="voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><small>通话内容以文字呈现 · 模拟来电</small></div>`;
  if (e.channel === "live")
    return `<div class="live scene-banner"><span class="live-label">● 模拟 LIVE</span><strong>${esc(e.contact)}</strong><small>在线人数、评论和收益展示均为剧情</small><div class="danmu"><span>路过的人：先看看</span><span>老粉：跟一把？</span></div></div>`;
  if (e.channel === "notice")
    return `<div class="notice-origin">从原有 App 打开的通知 · 仍需核实具体规则</div>`;
  if (e.channel === "offline")
    return '<div class="notice-origin">现场对话以聊天记录呈现</div>';
  return "";
}
function messageHTML(m, index, e) {
  if (m.kind === "narration")
    return `<div class="system-message message-entry" data-message-index="${index}">${esc(m.text)}</div>`;
  if (m.kind === "transfer")
    return `<div class="wx-row me message-entry" data-message-index="${index}"><div class="avatar">我</div><div class="transfer-bubble"><span aria-hidden="true">↗</span><div><strong>${fmt(m.amount)}</strong><small>模拟转出</small><span>不涉及真实账户</span></div></div></div>`;
  const mine = m.kind === "mine",
    sender = m.sender || e.speakers.at(-1) || e.contact;
  return `<div class="wx-row ${mine ? "me" : ""} message-entry ${m.generated ? "ai-entry" : ""}" data-message-index="${index}"><div class="avatar ${mine ? "" : "avatar-" + (e.id % 4)}" aria-hidden="true">${mine ? "我" : esc((m.sender || e.avatar).slice(0, 1))}</div><div class="bubble-column">${mine ? "" : `<span class="sender-name">${esc(sender)}${m.local ? " · 预设回复" : m.generated ? " · AI 生成" : ""}</span>`}<div class="wx-bubble">${esc(m.text)}</div>${mine ? '<span class="sent-label">已发送 / 已选择</span>' : ""}</div></div>`;
}
function isNearBottom() {
  const m = $("#chatMsgs");
  return !m || m.scrollHeight - m.scrollTop - m.clientHeight < 65;
}
function scrollDown(force = false) {
  const m = $("#chatMsgs");
  if (!m) return;
  if (force || isNearBottom()) {
    m.scrollTop = m.scrollHeight;
    newMessages = false;
    followLatest = true;
  } else newMessages = true;
  $("#new-messages").hidden = !newMessages;
}
function renderBar() {
  if (!$("#chatBar") || !run) return;
  const choices = availableChoices(run, data),
    isAfter = run.node === "after";
  const selected = choices.find((c) => c.id === proposed);
  $("#chatBar").innerHTML =
    `${playing ? `<div class="delivery-controls"><span><i class="typing-dot"></i> 消息正在陆续到达</span>${button("立即看完", "skip", "skip-wait")}</div>` : ""}${selected ? `<div class="intent-confirm"><span>你想表达的是：</span>${button(esc(selected.text), "choice:" + selected.id, "intent-action", playing || aiBusy ? "disabled" : "")}<small>点击确认才会执行这个行动</small></div>` : ""}<div class="reply-panel ${showOptions ? "" : "collapsed"}"><div class="reply-label"><span>${isAfter ? "这段对话暂告一段落" : "你想怎么回复 / 行动？"}</span><span>${aiOn ? "AI 增强版" : "基础版"}</span></div><div class="reply-options" aria-label="回复选项">${choices.map((c) => button(esc(c.text), "choice:" + c.id, isAfter ? "primary" : "", `data-choice="${c.id}" ${playing || aiBusy ? "disabled" : ""}`)).join("")}</div></div>${isAfter ? "" : `<form id="classic-compose" class="wx-compose"><button type="button" class="compose-toggle" data-game="options" aria-label="展开或收起回复选项" aria-expanded="${showOptions}">⌨</button><label class="sr-only" for="classic-message">自己回复一句</label><textarea id="classic-message" rows="1" maxlength="600" placeholder="自己回复一句…" ${playing || aiBusy ? "disabled" : ""}></textarea><button type="submit" class="send-button" ${playing || aiBusy ? "disabled" : ""}>发送</button></form><div class="compose-note">${aiBusy ? `正在等待 AI 回复 ${button("取消", "cancel-ai", "text-button")}` : aiOn ? "AI 生成内容仅供练习 · 不输入真实个人信息" : "基础版使用预设回复，分支选择照常可玩"}</div>`}`;
}
function renderChat(from = 0) {
  if (run.ended) {
    renderReview();
    return;
  }
  const oldLog = $("#chatMsgs"),
    oldTop = oldLog?.scrollTop || 0,
    follow = isNearBottom();
  abortPlayback();
  view = "chat";
  document.body.dataset.page = "chat";
  const e = currentEvent(run, data);
  if (previousScene !== run.round) {
    extras = [];
    aiTurns = 0;
    from = 0;
    previousScene = run.round;
  }
  const all = transcript();
  $("#app").innerHTML =
    `<div class="chat-wrap"><div class="game-wallet"><span>模拟钱包 <b>${fmt(run.money)}</b>${run.debt ? `<small> · 借款 ${fmt(run.debt)}</small>` : ""}</span><span>第 ${run.round + 1} / ${run.deck.length} 局</span></div><div class="wechat-heading"><button class="back-button" data-game="pause" aria-label="保存并离开对话">‹</button><div class="contact-title"><strong>${esc(e.contact)}</strong><small id="contact-status">${esc(e.context)}</small></div><button class="more-button" data-game="menu" aria-label="打开游戏菜单">···</button></div><div class="pace-bar"><span>虚构情境</span><label>消息节奏 <select id="message-speed" aria-label="消息节奏"><option value="natural" ${speed === "natural" ? "selected" : ""}>自然</option><option value="fast" ${speed === "fast" ? "selected" : ""}>快速</option><option value="instant" ${speed === "instant" ? "selected" : ""}>即显</option></select></label></div><div class="messages-area"><div class="chat-msgs channel-${e.channel}" id="chatMsgs" role="log" aria-label="微信模拟对话" aria-live="polite" aria-relevant="additions text" tabindex="0">${sceneBanner(e)}${all
      .slice(0, from)
      .map((m, i) => messageHTML(m, i, e))
      .join(
        "",
      )}</div><button id="new-messages" class="new-messages" data-game="latest" hidden>有新消息 ↓</button></div><div class="chat-bar" id="chatBar"></div></div>`;
  $("#chatMsgs").scrollTop = follow ? $("#chatMsgs").scrollHeight : oldTop;
  $("#chatMsgs").addEventListener("scroll", () => {
    followLatest = isNearBottom();
    if (followLatest) {
      newMessages = false;
      $("#new-messages").hidden = true;
    }
  });
  deliver(all.slice(from), from, e, follow);
}
async function deliver(messages, from, e, follow) {
  const token = sequence;
  playing = messages.length > 0;
  pending = messages.map((m, i) => ({ m, index: from + i }));
  renderBar();
  if (follow) scrollDown(true);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const { m, index } of [...pending]) {
    if (token !== sequence || view !== "chat") return;
    const instant = speed === "instant" || reduced;
    if (!instant && m.kind === "incoming") {
      $("#contact-status").textContent =
        e.channel === "call" ? "对方继续说…" : "对方正在输入…";
      const near = isNearBottom();
      $("#chatMsgs").insertAdjacentHTML(
        "beforeend",
        `<div class="wx-row typing-row" aria-label="对方正在输入"><div class="avatar avatar-${e.id % 4}" aria-hidden="true">${esc(e.avatar)}</div><div class="wx-bubble typing-bubble" aria-hidden="true"><i></i><i></i><i></i></div></div>`,
      );
      if (near) scrollDown(true);
    }
    const wait = instant
      ? 0
      : m.kind === "mine"
        ? 120
        : m.kind === "incoming"
          ? speed === "fast"
            ? 170
            : Math.min(1500, 500 + m.text.length * 13)
          : 180;
    if (wait && !(await delay(wait))) return;
    if (token !== sequence || view !== "chat") return;
    const near = isNearBottom();
    $(".typing-row")?.remove();
    $("#chatMsgs").insertAdjacentHTML("beforeend", messageHTML(m, index, e));
    if (!instant && m.kind !== "narration")
      $("#chatMsgs").lastElementChild.classList.add("message-arrive");
    if (near || follow) {
      scrollDown(true);
      follow = false;
    } else {
      newMessages = true;
      $("#new-messages").hidden = false;
    }
    pending.shift();
  }
  if (token !== sequence) return;
  const stick = isNearBottom();
  playing = false;
  $("#contact-status").textContent = e.context;
  renderBar();
  if (stick) scrollDown(true);
}
function skip() {
  const e = currentEvent(run, data),
    items = [...pending],
    near = isNearBottom();
  abortPlayback();
  $(".typing-row")?.remove();
  for (const { m, index } of items)
    $("#chatMsgs").insertAdjacentHTML("beforeend", messageHTML(m, index, e));
  $("#contact-status").textContent = e.context;
  renderBar();
  if (near) scrollDown(true);
  else {
    $("#new-messages").hidden = false;
    newMessages = true;
  }
}
function choose(id) {
  if (playing || aiBusy || !run || run.ended) return;
  const from = transcript().length,
    round = run.round;
  try {
    run = decide(run, data, id);
  } catch (e) {
    toast(e.message);
    return;
  }
  proposed = null;
  showOptions = true;
  if (run.round !== round) {
    extras = [];
    aiTurns = 0;
  }
  save();
  renderChat(run.round !== round ? 0 : from);
}
function reviewItem(row, i) {
  const e = data.events.find((e) => e.id === row.eid),
    risky = row.loss || row.control || row.risks.length,
    answer = run.answers[i];
  return `<article class="rv ${risky ? "bad" : ""}"><div class="review-row-head"><span>第 ${i + 1} 局</span><span>${row.outcome === "recovered" ? "中途停下了" : risky ? "值得回练" : row.outcome === "verified" ? "完成独立核实" : "暂停或暂不办理"}</span></div><h2>${esc(e.title)}</h2><p class="review-decisions">${row.choices.map(esc).join(" → ") || "尚未选择，已暂停"}</p><div class="review-effects"><span>资金损失 ${fmt(row.loss)}</span>${row.control ? "<span>账户 / 资料控制受影响</span>" : ""}${row.risks.map((r) => `<span>${esc(r)}</span>`).join("")}</div><h3>这段对话里，哪里值得留意？</h3><p>${esc(e.why)}</p><blockquote>${esc(e.guard)}</blockquote><details class="transfer-question"><summary>换个情况，再判断一次</summary><p>${esc(e.transfer.question)}</p>${e.transfer.options.map((t, j) => button(esc(t), "answer:" + i + ":" + j, "", answer !== undefined ? "disabled" : "")).join("")}${answer !== undefined ? `<p role="status">${answer === e.transfer.answer ? "这次判断正确。" : "可以再想想这个核实动作。"}${esc(e.guard)}</p>` : ""}</details><div class="review-links">${button("重玩这个场景", "scene:" + e.id, "text-button")}<a href="${rootLink("library")}" target="_top">查原文与来源 ↗</a></div></article>`;
}
function renderReview() {
  abortPlayback();
  cancelAI();
  view = "review";
  document.body.dataset.page = "review";
  const risks = run.log.filter(
    (r) => r.loss || r.control || r.risks.length,
  ).length;
  $("#app").innerHTML =
    `<div class="review-screen"><div class="wechat-heading"><button class="back-button" data-game="pause" aria-label="返回开始页">‹</button><strong>回看刚才的聊天</strong><button class="more-button" data-game="menu" aria-label="打开游戏菜单">···</button></div><section class="review-intro"><span class="small-note">${run.log.length} 段对话 · ${run.mode === "scene" ? "指定场景" : run.mode === "warmup" ? "四局热身" : "十二局挑战"}</span><h1>${run.money <= 0 ? "这次，钱包见底了。" : risks ? "及时停下，也是一种进步。" : "把这次判断，带到下一条消息里。"}</h1><p>这是一场模拟。受骗不代表不够聪明，分数也不能证明现实中的防骗能力。</p><div class="kpis"><div class="kpi"><b>${fmt(run.money)}</b><span>剩余模拟资金</span></div><div class="kpi"><b>${fmt(run.lostTotal)}</b><span>累计模拟损失</span></div><div class="kpi"><b>${run.debt ? fmt(run.debt) : risks}</b><span>${run.debt ? "待还模拟借款" : "值得再练的场景"}</span></div></div>${button("再来十二局", "start:challenge", "primary")}</section>${run.log.map(reviewItem).join("")}<div class="review-footer">${button("返回开始页", "pause")}<a href="${rootLink("learn")}" target="_top">查看全部学习资料 ↗</a></div></div>`;
}
function addExtra(message) {
  extras.push({ after: run.messages.length, message });
}
async function sendMessage(event) {
  event.preventDefault();
  if (playing || aiBusy || run.ended) return;
  const input = $("#classic-message"),
    text = input.value.trim();
  if (!text) return;
  if (
    text.length > 600 ||
    /\b\d{6,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:sk-|api[_-]?key\s*[:=])\S{8,}/i.test(
      text,
    )
  ) {
    toast("请只讨论虚构情境，移除真实号码、邮箱、验证码或密钥。");
    return;
  }
  const before = transcript().length,
    e = currentEvent(run, data),
    node = run.node,
    round = run.round;
  addExtra({ text, kind: "mine" });
  input.value = "";
  const history = extras
    .slice(0, -1)
    .slice(-6)
    .map((x) => ({
      role: x.message.kind === "mine" ? "user" : "assistant",
      content: x.message.text,
    }));
  let result;
  if (aiOn && embed && aiTurns < 8) {
    aiBusy = true;
    aiTurns++;
    renderChat(before);
    const id = ++aiRequest;
    try {
      result = await new Promise((resolve, reject) => {
        requestReject = (error) => {
          cleanup();
          reject(error);
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(Error("模型回复超时"));
        }, 26000);
        const cleanup = () => {
          clearTimeout(timeout);
          window.removeEventListener("message", receive);
          requestReject = null;
        };
        const receive = (ev) => {
          if (
            ev.source !== parent ||
            ev.origin !== location.origin ||
            ev.data?.type !== "UNSCAM_CLASSIC_REPLY" ||
            ev.data.id !== id
          )
            return;
          cleanup();
          if (ev.data.error) reject(Error(ev.data.error));
          else resolve(ev.data.result);
        };
        window.addEventListener("message", receive);
        parent.postMessage(
          {
            type: "UNSCAM_CLASSIC_CHAT",
            id,
            body: { scenario: "classic:" + e.id, node, message: text, history },
          },
          location.origin,
        );
      });
    } catch (error) {
      if (id !== aiRequest || view !== "chat") return;
      toast("AI 暂不可用，已提供本地回复，仍可继续选择。");
      result = localResponse(e, availableChoices(run, data), text);
    } finally {
      if (id === aiRequest) aiBusy = false;
    }
    if (
      id !== aiRequest ||
      run.round !== round ||
      run.node !== node ||
      view !== "chat"
    )
      return;
  } else {
    if (aiOn && aiTurns >= 8)
      toast("本段对话的 AI 追问已用完，继续使用本地回复。");
    result = localResponse(e, availableChoices(run, data), text);
  }
  const from =
    $("#chatMsgs .message-entry")?.parentElement?.querySelectorAll(
      ".message-entry",
    ).length || before;
  if (typeof result?.reply !== "string" || result.reply.length > 800) {
    toast("回复格式无效，可继续选择行动。");
    renderBar();
    return;
  }
  addExtra({
    text: result.reply,
    kind: "incoming",
    generated: !!result.generated,
    local: !result.generated,
  });
  proposed = availableChoices(run, data).some(
    (c) => c.id === result.suggestedActionId,
  )
    ? result.suggestedActionId
    : null;
  renderChat(from);
}
$("#app").addEventListener("submit", (e) => {
  if (e.target.id === "classic-compose") sendMessage(e);
});
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-game]");
  if (!target || target.disabled) return;
  const [action, a, b, c] = target.dataset.game.split(":");
  if (action === "menu") return menu();
  if (action === "history") {
    $("#game-dialog").close();
    return history();
  }
  if (action === "skip") return skip();
  if (action === "latest") return scrollDown(true);
  if (action === "pause") {
    $("#game-dialog").close();
    leave();
    return;
  }
  if (action === "finish") {
    $("#game-dialog").close();
    abortPlayback();
    cancelAI();
    run = finishEarly(run);
    save();
    renderReview();
    return;
  }
  if (action === "start") return begin(a);
  if (action === "scene") return begin("scene", Number(a));
  if (action === "confirm") {
    $("#game-dialog").close();
    return startRun(a, Number(b), c);
  }
  if (action === "resume") {
    proposed = null;
    extras = [];
    previousScene = run.round;
    return run.ended ? renderReview() : renderChat(run.messages.length);
  }
  if (action === "choice") return choose(a);
  if (action === "options") {
    showOptions = !showOptions;
    renderBar();
    return;
  }
  if (action === "cancel-ai") {
    cancelAI();
    renderBar();
    toast("已取消等待");
    return;
  }
  if (action === "theme") {
    const theme = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    pref("theme", theme);
    return;
  }
  if (action === "font") {
    const large = !document.documentElement.classList.contains("large");
    document.documentElement.classList.toggle("large", large);
    pref("large", large);
    return;
  }
  if (action === "answer" && run.ended && run.answers[a] === undefined) {
    run.answers[a] = Number(b);
    save();
    const top = scrollY;
    renderReview();
    window.scrollTo(0, top);
    document.querySelectorAll(".transfer-question")[Number(a)].open = true;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "message-speed") {
    speed = e.target.value;
    try {
      localStorage.setItem("unscam-message-speed", speed);
    } catch {}
    if (speed === "instant" && playing) skip();
  }
});
window.addEventListener("message", (e) => {
  if (
    e.source !== parent ||
    e.origin !== location.origin ||
    e.data?.type !== "UNSCAM_CLASSIC_CONFIG"
  )
    return;
  aiOn = e.data.enabled === true;
  applyPrefs(e.data);
  if (view === "chat") renderBar();
});
window.addEventListener("resize", () => {
  if (view === "chat" && followLatest)
    requestAnimationFrame(() => scrollDown(true));
});
window.addEventListener("pagehide", () => {
  save();
  abortPlayback();
  cancelAI();
});
try {
  const response = await fetch("../data/classic.json");
  if (!response.ok) throw Error("场景未能加载");
  data = await response.json();
  const saved = readSaved();
  applyPrefs(saved);
  run = restoreRun(saved.classic?.current, data);
  if (saved.classic?.current && !run)
    warning = "上次存档无法还原，已保留其他学习记录，可以重新开局。";
  try {
    speed = localStorage.getItem("unscam-message-speed") || "natural";
  } catch {}
  if (!["natural", "fast", "instant"].includes(speed)) speed = "natural";
  renderStart();
  if (embed)
    parent.postMessage({ type: "UNSCAM_CLASSIC_READY" }, location.origin);
} catch (error) {
  $("#app").innerHTML =
    `<div class="load-error"><h1>消息暂时没有加载好</h1><p>${esc(error.message)}</p><a href="./chat.html">重新打开</a><a href="${rootLink("learn")}" target="_top">返回学习资料</a></div>`;
}
