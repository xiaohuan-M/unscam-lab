// Native learning views. Reference text is always escaped, never executed as HTML.
export const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function matchingArticles(
  rows,
  {
    query = "",
    category = "全部",
    risk = "全部",
    target = "全部",
    unread = false,
    read = {},
  } = {},
) {
  const term = query.trim().toLocaleLowerCase();
  return rows.filter(
    (a) =>
      (category === "全部" || a.cat === category) &&
      (risk === "全部" || a.risks.includes(risk)) &&
      (target === "全部" || a.targets.includes(target)) &&
      (!unread || !read[a.id]) &&
      (!term ||
        String(a.id) === term ||
        [a.title, a.lead, ...a.tags, ...a.body.map((b) => b.t)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term)),
  );
}
export function articleText(a, reports) {
  return `${a.title}\n编号 #${a.id} · ${a.cat}\n风险标签：${a.risks.join("、")}\n关联人群：${a.targets.join("、")}\n\n${a.body.map((b) => b.t).join("\n\n")}\n\n相关同类案例（不代表同一案件）\n${a.referenceIds
    .map((i) => {
      const r = reports[i];
      return `${r.t}\n${r.s} · ${r.n}\n${r.u}`;
    })
    .join(
      "\n\n",
    )}\n\n来源：QERSSD / 人间防骗指南 · CC BY-NC-SA 4.0\nhttps://github.com/QERSSD/HowToAvoidScams\n原文保留，未经本项目逐条事实核验。`;
}
export function safeURL(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function markdown(text, resolve = () => null) {
  const inline = (raw) =>
    escape(raw)
      .replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_, label, url) => {
        const decoded = url.replace(/&amp;/g, "&");
        const href = safeURL(decoded) || resolve(decoded);
        return href
          ? `<a href="${escape(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`
          : `${label} (${url})`;
      })
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>");
  let inCode = false;
  return (
    text
      .split("\n")
      .map((line) => {
        if (line.startsWith("```")) {
          inCode = !inCode;
          return inCode ? "<pre><code>" : "</code></pre>";
        }
        if (inCode) return escape(line) + "\n";
        if (/^#{1,6} /.test(line)) {
          const n = Math.min(4, line.match(/^#+/)[0].length + 1);
          return `<h${n}>${inline(line.replace(/^#+ /, ""))}</h${n}>`;
        }
        if (/^[-*_]{3,}\s*$/.test(line)) return "<hr>";
        if (line.startsWith("> "))
          return `<blockquote>${inline(line.slice(2))}</blockquote>`;
        if (/^[-*] /.test(line))
          return `<p class="md-list">• ${inline(line.slice(2))}</p>`;
        return line ? `<p>${inline(line)}</p>` : "";
      })
      .join("\n") + (inCode ? "</code></pre>" : "")
  );
}
export function selfcheckPlan(questions, answers) {
  return questions
    .map((q, i) => ({
      id: i,
      priority: q[2],
      article: q[3],
      answer: answers[i],
    }))
    .filter((q) => q.answer === "no")
    .sort((a, b) => a.priority - b.priority || a.id - b.id);
}
const actions = [
  "了解国家反诈中心 App 的预警功能，从官方渠道安装并按需设置权限",
  "重视反诈预警；遇到可疑来电，用自己查到的官方渠道核实身份",
  "发生诈骗损失后及时联系当地警方和银行或支付平台，不因取证而拖延求助",
  "遇到陌生要求时，先暂停、保护个人信息，再从独立渠道核实",
  "遇到自称公检法要求转入“安全账户”，停止转账并独立核实",
  "为支付账户设置独立的强密码，并使用设备支持的安全验证",
  "为社交账号开启登录保护，定期检查登录设备",
  "收到 ETC、医保等停用短信，通过自己找到的官方入口查业务",
  "不按陌生来电指示开启屏幕共享；核对是否真正停止共享",
  "不向来电者或陌生人提供验证码、密码等敏感信息",
  "不在陌生链接和二维码页面提交身份证、银行卡或人脸信息",
  "不出租、出借或出售银行卡、电话卡与收款码",
  "不替不明人员代收转款或“走流水”赚佣金",
  "了解银行卡的转账限额，并按日常需要设置",
  "转账前通过已知可靠渠道核实；了解到账规则，不假定可以随时撤回",
  "购买充值服务时核实商家与资金来源，警惕不明渠道的异常低价",
  "与长辈一起检查手机预警和来电设置，确保能接到重要联系",
  "定期和家人讨论保健品、收藏品、养老项目与冒充亲友的风险",
  "和家人约定额外核验方式，遇到紧急借款仍通过已知联系方式确认",
  "面对养老投资和高收益推介，先核实资质、规则与风险",
  "和家人商量大额转账前的提醒机制，尊重彼此决定",
  "丢弃快递包装前处理姓名、号码和地址",
  "扫码领礼品前检查索取的权限和信息，不为小礼品交出敏感资料",
  "分享照片前检查证件、票据、住址与孩子学校等信息",
  "收到自称客服、航司或银行的联系后，通过独立官方渠道核实",
  "了解官方名下电话卡查询渠道，并核查异常电话卡",
  "通过银行官方渠道核查名下银行卡，及时处理异常账户",
  "求职遇到押金、培训费或服装费要求时，先核实招聘与费用依据",
  "对要求先垫付后返佣的兼职停止投入，不因小额返利继续",
  "从可信官方渠道获取软件，检查权限，不安装陌生人发来的安装包",
  "投递简历前核实企业和招聘渠道，只提供求职必要信息",
  "面对境外高薪工作，独立核实企业、地点与工作内容",
  "网恋或交友对象引导投资、充值时，暂停并向可信的人求助",
  "不因荐股群里的收益截图、老师身份或“内幕”作投资决定",
  "熟人通过视频或语音借款时，仍用已知号码或当面确认",
  "不随意打开陌生网友发送的链接、文件和安装包",
  "遇到私密影像威胁时停止付款、保存已有证据并寻求警方帮助",
  "收到航班取消或改签消息时，从航司官方入口核实",
  "快递理赔从原订单或官方客服处理，不按陌生电话要求转账验证",
  "对不明快递中的奖卡、券和二维码保持警惕，不提供敏感信息",
  "通过票务官方渠道了解购票和转让规则，核实所谓“内部渠道”",
  "对“百万保障到期扣费”等来电，回到支付平台官方入口核实",
  "对“注销校园贷否则影响征信”的来电，从机构官方渠道核实",
  "不相信付费保证删除信用记录；异议通过正式渠道处理",
  "培训退费要求先买理财或垫付时，暂停并向原机构核实",
];
export function createLearning(ctx) {
  const { knowledge: k, collection: c, esc = escape } = ctx;
  let query = "",
    category = "全部",
    risk = "全部",
    target = "全部",
    page = 0,
    unread = false,
    group = 0,
    term = "",
    docToken = 0;
  const get = () => ctx.getSaved(),
    save = () => ctx.persist();
  const link = (route, text, cls = "button") =>
    `<a class="${cls}" href="#${route}">${esc(text)}</a>`;
  const btn = (action, text, cls = "") =>
    `<button data-learn="${action}" class="${cls}">${esc(text)}</button>`;
  const intro = (label, title, text) =>
    `<div class="page-intro"><div class="eyebrow">${label}</div><h1>${title}</h1><p>${text}</p></div>`;
  const bar = () =>
    `<nav class="learning-nav" aria-label="学习中心导航">${[
      ["learn", "学习地图"],
      ["library", "全文知识库"],
      ["selfcheck", "生活自查"],
      ["games", "经典游戏"],
      ["glossary", "术语"],
      ["sources", "报道"],
      ["resources", "资料下载"],
    ]
      .map(([r, t]) => link(r, t, "chip"))
      .join("")}</nav>`;
  const sourceNote = () =>
    `<p class="reference-note">原作参考 · QERSSD《人间防骗指南》 · CC BY-NC-SA 4.0。保留完整原文，不代表已逐条核实。风险标签不是法律认定；法律、医疗及时效性表述须以专业机构和原始来源为准。</p>`;
  const docLink = (d) => link("document:" + d.id, d.title, "resource-link");
  function home() {
    const n = c.counts;
    return (
      bar() +
      intro(
        "THE COMPLETE COLLECTION / 3.0",
        "把识骗，练成生活习惯。",
        "从一个行动开始，用故事练判断，再回到全文查依据。原项目的内容都在这里。",
      ) +
      `<section class="learning-path"><a href="#selfcheck"><b>01</b><h2>先看看自己</h2><p>45 项生活自查<br>把“知道”变成行动清单</p><span>开始自查 ↗</span></a><a href="#home"><b>02</b><h2>进入一个故事</h2><p>16 个新版分支情境<br>本地陪练或可选 AI 对话</p><span>去练习 ↗</span></a><a href="#library"><b>03</b><h2>读懂背后的套路</h2><p>373 篇完整拆解<br>按场景、风险、人群查找</p><span>打开知识库 ↗</span></a><a href="#games"><b>04</b><h2>换一种方式挑战</h2><p>原版聊天闯关 + 12 个逻辑谜题<br>观察、排除、验证</p><span>去游戏室 ↗</span></a></section><div class="collection-band"><strong>完整内容，认真保留。</strong><p>${n.articles} 篇全文 · ${n.categories} 个分类 · ${n.glossary} 个术语 · ${n.reports} 条报道 · ${n.longreads} 篇长文 · ${n.volumes} 个分卷</p>${link("resources", "查看全部资料与离线下载 ↗", "text-link")}</div><div class="section-head"><h2>值得慢慢读的三篇长文</h2><span class="quiet">原作专题</span></div><section class="lesson-grid">${c.documents
        .filter((d) => d.kind === "长文")
        .map(
          (d) =>
            `<article class="panel"><span class="tag">深度阅读</span><h3>${esc(d.title)}</h3>${link("document:"+d.id,"阅读全文 →","text-link")}</article>`,
        )
        .join(
          "",
        )}</section><section class="panel"><h2>继续上次阅读</h2><p>已标记读完 ${Object.keys(get().read || {}).length} / 373 篇；自查已回答 ${Object.keys(get().selfcheck || {}).length} / 45 项；推理结案 ${Object.keys(get().puzzles || {}).length} / 12 关。</p>${get().lastArticle && k.some((a) => a.id === get().lastArticle) ? link("article:" + get().lastArticle, k.find((a) => a.id === get().lastArticle).title) : link("library", "选一篇开始")}${link("review", "查看复习计划")}</section>`
    );
  }
  function library(cards = "") {
    return (
      bar() +
      intro(
        "THE FIELD GUIDE",
        "不止认出套路，还要看清过程。",
        "373 篇原文完整保留。支持正文搜索、风险与人群组合筛选，阅读后可加入复习。",
      ) +
      `<details class="panel"><summary>先学六个有来源的行动</summary><div class="lesson-grid">${cards}</div></details>${sourceNote()}<div class="catalog-filters"><label class="search-label">搜索全文 / 编号<input id="lc-query" aria-label="搜索知识" type="search" value="${esc(query)}" placeholder="输入线索、关键词，或文章编号…"></label>${select("lc-cat", "骗局类型", category, [...new Set(k.map((a) => a.cat))])}${select("lc-risk", "风险标签", risk, [...new Set(k.flatMap((a) => a.risks))])}${select("lc-target", "关联人群", target, [...new Set(k.flatMap((a) => a.targets))])}<label class="inline-check"><input id="lc-unread" type="checkbox" ${unread ? "checked" : ""}>只看未读</label>${btn("clear", "重置筛选", "text")}</div><details class="panel"><summary>按分类浏览 · 16 个分卷</summary><div class="category-directory">${[...new Set(k.map((a) => a.cat))].map((cat, i) => btn("category:" + i, cat + " · " + k.filter((a) => a.cat === cat).length, "chip")).join("")}</div></details><div id="knowledge-results" aria-live="polite"></div>`
    );
  }
  function select(id, label, value, values) {
    return `<label>${label}<select id="${id}">${["全部", ...values].map((v) => `<option ${value === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
  }
  function results() {
    const box = document.querySelector("#knowledge-results");
    if (!box) return;
    const rows = matchingArticles(k, {
        query,
        category,
        risk,
        target,
        unread,
        read: get().read,
      }),
      pages = Math.max(1, Math.ceil(rows.length / 12));
    page = Math.min(page, pages - 1);
    box.innerHTML = `<div class="section-head"><p>${rows.length} 篇匹配 · 第 ${page + 1} / ${pages} 页</p><div class="row">${btn("prev", "上一页")}${btn("next", "下一页")}</div></div><section class="knowledge knowledge-grid">${
      rows
        .slice(page * 12, page * 12 + 12)
        .map(
          (a) =>
            `<article><div class="case-meta"><span>#${a.id} · ${esc(a.cat)}</span><span>${get().read?.[a.id] ? "已读 ✓" : "全文"}</span></div><h3><a href="#article:${a.id}">${esc(a.title)}</a></h3><p>${esc(a.lead)}</p><div class="row tags">${a.risks.map((r) => `<span class="tag">${esc(r)}</span>`).join("")}</div><div class="row">${link("article:" + a.id, "阅读全文 →", "text-link")}${btn("bookmark:" + a.id, get().reviews[a.id] ? "已加入复习 ✓" : "加入复习", "text")}</div></article>`,
        )
        .join("") ||
      '<div class="empty">没有找到匹配的内容。试试缩短关键词或清空筛选。</div>'
    }</section>`;
    box.querySelector('[data-learn="prev"]').disabled = page === 0;
    box.querySelector('[data-learn="next"]').disabled = page >= pages - 1;
  }
  function article(id) {
    const a = k.find((a) => a.id === +id);
    if (!a) return missing();
    get().lastArticle = a.id;
    save();
    const index = k.indexOf(a);
    return (
      bar() +
      `<article class="reader"><div class="reader-toolbar">${link("library", "← 返回筛选结果", "text-link")}<div class="row">${btn("copy:" + a.id, "复制全文")}${btn("share", "复制链接")}${btn("print", "打印")}</div></div><div class="eyebrow">ORIGINAL TEXT / ${String(a.id).padStart(3, "0")}</div><h1>${esc(a.title)}</h1><div class="row tags"><span class="tag">${esc(a.cat)}</span>${[...a.risks, ...a.targets].map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>${sourceNote()}<details class="reader-toc"><summary>本文目录</summary>${a.body
        .map((b, i) =>
          ["sec", "law", "end", "step"].includes(b.k)
            ? btn("jump:" + i, b.t, "text")
            : null,
        )
        .filter(Boolean)
        .join("")}</details><div class="article-body">${a.body
        .map((b, i) => {
          const t = esc(b.t);
          return ["sec", "law", "end"].includes(b.k)
            ? `<h2 id="part-${i}" class="${b.k === "law" ? "law-heading" : ""}">${t}</h2>`
            : b.k === "step"
              ? `<h3 id="part-${i}">${t}</h3>`
              : b.k === "warn"
                ? `<blockquote>${t}</blockquote>`
                : `<p>${t}</p>`;
        })
        .join(
          "",
        )}</div><section class="reader-references"><h2>相关案例与公开报道</h2><p class="hint">沿用原项目匹配：以下是同类案例，并不证明本文叙述的具体事件。</p>${a.referenceIds.map((i) => report(c.reports[i])).join("")}</section><div class="reader-actions">${btn("read:" + a.id, get().read?.[a.id] ? "已标记读完 ✓" : "标记读完", "primary")}${btn("bookmark:" + a.id, get().reviews[a.id] ? "已加入复习 ✓" : "加入间隔复习")}${btn("share", "分享这篇")}</div><div class="reader-pagination">${index > 0 ? link("article:" + k[index - 1].id, "← 上一篇", "text-link") : ""}${index < k.length - 1 ? link("article:" + k[index + 1].id, "下一篇 →", "text-link") : ""}</div></article>`
    );
  }
  function report(r) {
    const url = safeURL(r.u);
    return `<article class="report"><span class="tag">${esc(r.s)}</span><h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(r.t)} ↗</a>` : esc(r.t)}</h3><p>${esc(r.n)}</p></article>`;
  }
  function selfcheck() {
    const q = c.selfcheck.questions,
      answers = get().selfcheck || {},
      items = q.map((row, i) => ({ row, i })).filter((x) => x.row[0] === group),
      plan = selfcheckPlan(q, answers);
    return (
      bar() +
      intro(
        "SMALL ACTIONS / 45",
        "把防骗知识，变成你做到的事。",
        "行动版逐条对应原作 45 题，改写绝对化用语；原题与说明可展开对照。不计能力分，也不保证能避免所有风险。",
      ) +
      `<div class="selfcheck-progress"><strong>${Object.keys(answers).length} / 45 项已回答</strong><progress value="${Object.keys(answers).length}" max="45" aria-label="自查完成度"></progress><span>已做到 ${Object.values(answers).filter((a) => a === "yes").length} 项</span></div><div class="selfcheck-layout"><aside class="panel selfcheck-groups">${c.selfcheck.groups.map((g, i) => btn("group:" + i, `${i + 1}. ${g[1]} · ${q.filter((x, j) => x[0] === i && answers[j]).length}/${q.filter((x) => x[0] === i).length}`, group === i ? "selected" : "")).join("")}</aside><section><h2>${esc(c.selfcheck.groups[group][1])}</h2>${items
        .map(
          ({ row, i }) =>
            `<article class="selfcheck-item panel" id="check-${i}"><span class="quiet">第 ${i + 1} 项 · ${["", "优先关注", "近期安排", "日常习惯"][row[2]]}</span><h3>${esc(actions[i])}</h3><fieldset><legend class="sr-only">第 ${i + 1} 项状态</legend>${[
              ["yes", "已做到"],
              ["no", "待行动"],
              ["skip", "暂不适用"],
            ]
              .map(
                ([v, t]) =>
                  `<label class="answer-choice ${answers[i] === v ? "chosen" : ""}"><input type="radio" name="check-${i}" value="${v}" data-selfcheck="${i}" ${answers[i] === v ? "checked" : ""}>${t}</label>`,
              )
              .join(
                "",
              )}</fieldset><details><summary>原题与原作说明</summary><p>${esc(row[1])}</p><p>${esc(row[4])}</p><p class="hint">此处为原作原文，含概括性表述；行动版不采用其确定性承诺或法律结论。</p></details>${link("article:" + row[3], "阅读关联全文 #" + row[3], "text-link")}</article>`,
        )
        .join(
          "",
        )}<div class="row">${group > 0 ? btn("group:" + (group - 1), "上一组") : ""}${group < 7 ? btn("group:" + (group + 1), "下一组 →", "primary") : link("selfcheck-plan", "查看行动清单 →", "button primary")}</div></section></div><div class="panel"><h2>我的行动清单 · ${plan.length} 项</h2><p>标记“待行动”的项目会按优先级整理。你可以中途保存，之后继续。</p>${link("selfcheck-plan", "查看并打印行动清单")}${btn("reset-check", "重新自查", "text")}</div>`
    );
  }
  function plan() {
    const rows = selfcheckPlan(c.selfcheck.questions, get().selfcheck || {});
    return (
      bar() +
      intro(
        "YOUR NEXT STEP",
        "从一件小事开始。",
        "清单来自你选择的“待行动”。按自己的实际情况安排，不是风险诊断。",
      ) +
      `<div class="row no-print">${link("selfcheck", "← 返回自查")}${btn("print", "打印清单")}</div>${[
        1, 2, 3,
      ]
        .map(
          (p) =>
            `<section class="panel"><h2>${["", "优先关注", "近期安排", "保持习惯"][p]}</h2>${
              rows
                .filter((r) => r.priority === p)
                .map(
                  (r) =>
                    `<div class="action-row"><p>${esc(actions[r.id])}</p><div>${link("article:" + r.article, "查看依据", "text-link")}${btn("done:" + r.id, "我已做到 ✓")}</div></div>`,
                )
                .join("") || '<p class="quiet">这一组没有待行动项目。</p>'
            }</section>`,
        )
        .join("")}`
    );
  }
  function games() {
    return (
      bar() +
      intro(
        "THE CLASSIC ARCADE",
        "观察线索，再下判断。",
        "原项目两种玩法完整保留。新版分支故事继续支持本地和 AI 陪练；经典玩法保持原作规则。",
      ) +
      `<div class="arcade-grid"><article class="arcade-card chat"><span class="eyebrow">CHAT SIMULATION</span><h2>别被骗了啊</h2><div class="arcade-symbol" aria-hidden="true">“？”</div><p>16 个事件池 · 每局 12 轮<br>随机身份、专属回应、逐层加码、结束复盘。</p>${link("classic:chat", "开始经典闯关 →", "button primary")}<details><summary>查看完整事件池</summary><ol>${c.events.map((e) => `<li>${esc(e.title)}</li>`).join("")}</ol></details></article><article class="arcade-card logic"><span class="eyebrow">LOGIC MYSTERY</span><h2>识骗迷局</h2><div class="arcade-symbol logic-symbol" aria-hidden="true">▦</div><p>2 个章节 · 12 个谜题<br>9×9 场景、人物定位、逻辑线索、两级提示。</p>${link("classic:logic", "打开推理档案 →", "button primary")}<details><summary>查看全部谜题</summary><ol>${c.puzzles.map((p) => `<li>${esc(p.title)} · ${link("article:" + p.article, "关联原文", "text-link")}</li>`).join("")}</ol></details></article></div><div class="notice">经典游戏中的数值、身份和剧情均为模拟。原作的复盘措辞与新版教学可能不同，现实问题请以可靠渠道核实。聊天闯关离开页面后会重新开局；推理结案进度保存在本机，并随新版学习备份导出。</div>${link("home", "体验新版分支故事与 AI 陪练 →")}`
    );
  }
  function classic(type) {
    if (!["chat", "logic"].includes(type)) return missing();
    const path = `./classic/${type}.html`;
    return (
      bar() +
      `<div class="section-head"><h1>${type === "chat" ? "别被骗了啊 · 经典闯关" : "识骗迷局 · 逻辑推理"}</h1>${link("games", "← 返回游戏室")}</div><p class="hint">QERSSD 原作；适配站内导航与统一存档。需要更大操作空间可<a class="text-link" href="${path}" target="_blank" rel="noopener">单独打开游戏 ↗</a>。</p><iframe class="classic-frame" title="${type === "chat" ? "经典聊天闯关" : "识骗迷局"}" src="${path}" sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" loading="eager"></iframe>`
    );
  }
  function glossary() {
    const rows = c.glossary.filter((g) =>
      (g.term + g.kind + g.description).includes(term),
    );
    return (
      bar() +
      intro(
        "A LANGUAGE OF CLUES",
        "黑话听懂了，套路就少一层伪装。",
        "42 个原作术语，保留定义与关联分类。",
      ) +
      sourceNote() +
      `<label class="search-label">查术语<input id="lc-term" type="search" placeholder="跑分、GOIP、杀猪盘…" value="${esc(term)}"></label><div id="term-results">${glossaryRows(rows)}</div>`
    );
  }
  function glossaryRows(rows) {
    return `<p class="quiet">${rows.length} 个匹配</p><section class="lesson-grid">${rows.map((g) => `<article class="panel"><span class="tag">${esc(g.kind)}</span><h2>${esc(g.term)}</h2><p>${esc(g.description)}</p><div class="row">${g.categories.map((cat) => btn("term-category:" + encodeURIComponent(cat), cat, "chip")).join("")}</div></article>`).join("")}</section>`;
  }
  function sources() {
    return (
      bar() +
      intro(
        "TRACE THE SOURCE",
        "120 条报道，一个查证入口。",
        "保留原项目报道标题、摘要与原始链接。关联的是同类风险机制，来源更新与失效情况请在原发布页面核对。",
      ) +
      `<label class="search-label">搜索报道<input id="lc-report" type="search" placeholder="机构、案件、关键词…"></label><div id="report-results">${c.reports.map(report).join("")}</div>`
    );
  }
  function resources() {
    return (
      bar() +
      intro(
        "READ, KEEP, SHARE",
        "好内容，也应该能带走。",
        "原项目的正文、专题、分卷、工具和下载材料完整保留。下载后可在自己的阅读器使用。",
      ) +
      `<div class="download-grid">${[
        ["PDF", "适合打印与阅读", "reference/downloads/人间防骗指南.pdf"],
        ["EPUB", "适合电子书阅读器", "reference/downloads/人间防骗指南.epub"],
        [
          "Anki 卡包",
          "文章卡 + 术语卡",
          "reference/downloads/人间防骗指南.apkg",
        ],
        ["单文件阅读器", "下载后可离线打开全文", "reference/人间防骗指南.html"],
        [
          "完整原项目 ZIP",
          "65 个原始文件，含代码与构建工具",
          "downloads/howtoavoidscams-source.zip",
        ],
      ]
        .map(
          ([name, desc, path]) =>
            `<a class="panel download-card" href="./${path}" download><span class="tag">下载 ↓</span><h2>${name}</h2><p>${desc}</p></a>`,
        )
        .join(
          "",
        )}</div><p class="hint">下载文件按需获取，不在首次打开时全部预缓存。Anki 卡包需要 Anki 兼容客户端。原版单文件阅读器内的外部资源与游戏链接仍需完整 ZIP 或联网。</p>${[
        "长文",
        "分卷",
        "资料",
        "问答技能",
      ]
        .map(
          (kind) =>
            `<section><h2>${kind === "问答技能" ? "AI 防骗问答技能（原文与下载）" : kind === "资料" ? "目录、案例与核实记录" : kind === "分卷" ? "16 个完整分卷" : "3 篇深度长文"}</h2><div class="resource-list">${c.documents
              .filter((d) => d.kind === kind)
              .map(docLink)
              .join("")}</div></section>`,
        )
        .join(
          "",
        )}<section class="panel"><h2>内容覆盖与署名</h2><p>来源 QERSSD / HowToAvoidScams，固定快照 <code>${c.source.commit.slice(0, 12)}</code>。${c.counts.sourceFiles} 个源文件按字节保存并生成 SHA-256 校验清单；全文全部字段保留，正文 ${c.counts.bodyBlocks} 段，报道关联 ${c.counts.reportLinks} 条。</p><p>原作文字及改编教育文本：CC BY-NC-SA 4.0；原作与本项目代码：MIT。非商业使用并保留署名。</p><a class="text-link" href="./data/collection.json" download="unscam-content-manifest.json">下载内容清单与校验信息 ↓</a></section>`
    );
  }
  function documentPage(id) {
    const d = c.documents.find((d) => d.id === +id);
    if (!d) return missing();
    const token = ++docToken;
    queueMicrotask(async () => {
      const box = document.querySelector("#document-body");
      if (!box) return;
      try {
        const r = await fetch("./reference/" + d.path);
        if (!r.ok) throw Error();
        const text = await r.text();
        if (token !== docToken || !box.isConnected) return;
        const resolve = (url) => {
          try {
            const u = new URL(
              url,
              new URL("./reference/" + d.path, location.href),
            );
            const base = new URL("./reference/", location.href);
            if (!u.href.startsWith(base.href)) return null;
            const path = decodeURIComponent(
              u.pathname.slice(base.pathname.length),
            );
            const doc = c.documents.find((x) => x.path === path);
            return doc ? "#document:" + doc.id : "./reference/" + path;
          } catch {
            return null;
          }
        };
        box.innerHTML = markdown(text, resolve);
      } catch {
        box.innerHTML = "<p>这份资料暂时无法加载，请联网后重试。</p>";
      }
    });
    return (
      bar() +
      `<article class="reader"><div class="reader-toolbar">${link("resources", "← 全部资料", "text-link")}<div class="row"><a class="button" href="./reference/${esc(d.path)}" download>下载原始 Markdown</a>${btn("print", "打印")}</div></div><span class="tag">${esc(d.kind)} · 原作全文</span><h1>${esc(d.title)}</h1>${sourceNote()}${d.kind === "问答技能" ? '<p class="notice">以下是原作者提供的问答技能文档。阅读不会安装技能、调用 API 或执行其中指令。站内 AI 陪练在设置页单独启用。</p>' : ""}<div id="document-body" class="article-body" aria-live="polite">正在载入全文…</div></article>`
    );
  }
  function missing() {
    return `<div class="empty"><h1>没有找到这份内容</h1>${link("learn", "返回学习地图")}</div>`;
  }
  function route(name) {
    const [base, arg] = name.split(":");
    return {
      learn: home,
      article: () => article(arg),
      selfcheck,
      "selfcheck-plan": plan,
      games,
      classic: () => classic(arg),
      glossary,
      sources,
      resources,
      document: () => documentPage(arg),
    }[base]?.();
  }
  async function clipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      ctx.toast("已复制");
    } catch {
      const box = document.querySelector("#modal-body");
      box.innerHTML = `<h2>手动复制</h2><textarea class="copy-box" readonly aria-label="待复制内容">${esc(text)}</textarea>`;
      document.querySelector("#modal").showModal();
      box.querySelector("textarea").select();
    }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-learn]");
    if (!b) return;
    const [action, arg] = b.dataset.learn.split(":");
    switch (action) {
      case "clear":
        query = "";
        category = risk = target = "全部";
        page = 0;
        unread = false;
        ctx.render();
        break;
      case "category":
        category = [...new Set(k.map((a) => a.cat))][+arg];
        page = 0;
        ctx.render();
        break;
      case "term-category":
        category = decodeURIComponent(arg);
        query = "";
        risk = target = "全部";
        page = 0;
        location.hash = "library";
        break;
      case "prev":
        page = Math.max(0, page - 1);
        results();
        break;
      case "next":
        page++;
        results();
        document.querySelector("#knowledge-results").scrollIntoView();
        break;
      case "bookmark":
        get().reviews[arg] ??= { level: -1, due: Date.now() };
        save();
        ctx.toast("已加入间隔复习");
        ctx.render();
        break;
      case "copy":
        await clipboard(
          articleText(
            k.find((a) => a.id === +arg),
            c.reports,
          ),
        );
        break;
      case "share":
        await clipboard(location.href);
        break;
      case "print":
        window.print();
        break;
      case "read":
        get().read ??= {};
        get().read[arg] = Date.now();
        save();
        ctx.render();
        break;
      case "jump":
        document
          .querySelector("#part-" + Number(arg))
          ?.scrollIntoView({ behavior: "smooth" });
        break;
      case "group":
        group = Number(arg);
        ctx.render();
        window.scrollTo(0, 0);
        break;
      case "done":
        get().selfcheck[arg] = "yes";
        save();
        ctx.render();
        break;
      case "reset-check":
        document.querySelector("#modal-body").innerHTML =
          "<h2>重新自查？</h2><p>这会清空 45 项自查答案，其他学习记录保留。</p>" +
          btn("confirm-reset-check", "确认重新自查", "danger");
        document.querySelector("#modal").showModal();
        break;
      case "confirm-reset-check":
        get().selfcheck = {};
        save();
        document.querySelector("#modal").close();
        ctx.render();
        break;
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "lc-query") {
      query = e.target.value;
      page = 0;
      results();
    }
    if (e.target.id === "lc-term") {
      term = e.target.value;
      document.querySelector("#term-results").innerHTML = glossaryRows(
        c.glossary.filter((g) =>
          (g.term + g.kind + g.description).includes(term),
        ),
      );
    }
    if (e.target.id === "lc-report") {
      const t = e.target.value;
      document.querySelector("#report-results").innerHTML =
        c.reports
          .filter((r) => (r.t + r.s + r.n).includes(t))
          .map(report)
          .join("") || "<p>没有匹配的报道。</p>";
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "lc-cat") category = e.target.value;
    else if (e.target.id === "lc-risk") risk = e.target.value;
    else if (e.target.id === "lc-target") target = e.target.value;
    else if (e.target.id === "lc-unread") unread = e.target.checked;
    else if (e.target.dataset.selfcheck !== undefined) {
      const i = +e.target.dataset.selfcheck;
      get().selfcheck ??= {};
      get().selfcheck[i] = e.target.value;
      save();
      const y = window.scrollY;
      ctx.render();
      window.scrollTo(0, y);
      document
        .querySelector(`[name="check-${i}"]:checked`)
        ?.focus({ preventScroll: true });
      return;
    } else return;
    page = 0;
    results();
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
    ) {
      const search = document.querySelector("#lc-query");
      if (search) {
        e.preventDefault();
        search.focus();
      }
    }
  });
  return { home, library, results, route };
}
