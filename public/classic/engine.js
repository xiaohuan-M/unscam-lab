// Mechanics adapted from the original 16-event / 12-round game. Rendering and LLMs never own balances.
export const IDENTITIES = [
  {
    id: "student",
    name: "学生党",
    icon: "🎓",
    desc: "生活费有限，想找一点副业",
  },
  {
    id: "worker",
    name: "上班族",
    icon: "💼",
    desc: "工作忙，平时习惯在线办事",
  },
  {
    id: "parent",
    name: "带娃家长",
    icon: "👶",
    desc: "兼顾家庭，想找灵活的工作",
  },
  {
    id: "retired",
    name: "退休生活",
    icon: "🌿",
    desc: "关心健康，也常收到群消息",
  },
  {
    id: "shop",
    name: "商家店主",
    icon: "🏪",
    desc: "每天会接触陌生客户和订单",
  },
  {
    id: "debtor",
    name: "还款中的人",
    icon: "💳",
    desc: "预算紧张，想尽快缓解压力",
  },
];
export function shuffled(items, seed) {
  const list = [...items];
  let n = seed >>> 0;
  for (let i = list.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = n % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
const msg = (text, kind = "incoming", extra = {}) => ({
  text: String(text || ""),
  kind,
  ...extra,
});
const reply = (text) =>
  msg(
    text,
    /^(你|对方把你|客服发来|老伴|朋友|家人|邻居)/.test(text || "")
      ? "narration"
      : "incoming",
  );
const safeReply =
  "你暂停了这段对话，没有继续付款或交出账户信息，准备通过自己找到的渠道核实。";
function stageEffect(e, index) {
  const risk = {};
  if (e.id === 2 && index < 2) risk.control = index === 0 ? 45 : 65;
  if (e.id === 3 && (index === 0 || index === 2)) risk.control = 45;
  if (e.id === 9 && index === 0) risk.control = 60;
  if (e.id === 9 && index === 2)
    risk.exposure = "把未核实的领取页面转给朋友，朋友的账号受到影响";
  if (e.id === 10 && index === 0)
    risk.exposure = "向未核实的招聘方交出了出行安排与证件控制权";
  if (e.id === 16 && index === 2)
    risk.exposure = "把未经核实的健康产品推荐给了亲友";
  return risk;
}
function firstEffect(e, i) {
  return {
    control: e.id === 11 && i === 1 ? 5 : 0,
    cost:
      e.id === 4 && i === 0
        ? 1000
        : e.id === 12 && i === 2
          ? 5000
          : e.id === 13 && i === 0
            ? 2000
            : e.id === 16 && i === 0
              ? 298
              : 0,
  };
}
export function nodesFor(e) {
  const nodes = {};
  if (["real", "tool", "familytool"].includes(e.arch)) {
    nodes.start = {
      messages: e.lines.map((t, i) =>
        msg(t, "incoming", { sender: e.speakers[i] }),
      ),
      choices: [
        {
          id: "verify",
          text: e.correct,
          reply: e.replies.opt?.[0] || safeReply,
          next: "after",
          outcome: "verified",
        },
        {
          id: "later",
          text: "暂时不办，之后有需要再从官方入口了解",
          reply: e.replies.opt?.[1] || "你暂时关闭了消息。",
          next: "after",
          outcome: "paused",
        },
      ],
    };
  } else {
    nodes.start = {
      messages: e.lines.map((t, i) =>
        t.startsWith("§")
          ? msg(t.slice(1), "narration")
          : msg(t, "incoming", { sender: e.speakers[i] }),
      ),
      choices: [
        {
          id: "verify",
          text: e.correct,
          reply: e.replies.ok || safeReply,
          next: "after",
          outcome: "verified",
        },
        ...e.distractors.map((d, i) => ({
          id: "reply-" + i,
          text: d.t,
          reply: d.back,
          next: "followup-" + i,
          ...firstEffect(e, i),
        })),
      ],
    };
    for (let p = 0; p < e.distractors.length; p++) {
      nodes["followup-" + p] = {
        messages: [],
        context: e.distractors[p].back,
        choices: [
          ...e.s2opts.map((o, i) => {
            const effects = stageEffect(e, i),
              cost = o[1];
            const stays =
              cost > 0 ||
              effects.control ||
              effects.exposure ||
              (e.id === 11 && i !== 1);
            return {
              id: "act-" + i,
              text: o[0],
              cost,
              ...effects,
              reply: e.replies.s2?.[i] || "对方继续等待你的决定。",
              next: stays && e.escalate.length ? "escalate-0" : "after",
              outcome: stays ? "exposed" : "stopped",
            };
          }),
          {
            id: "stop",
            text: "先停一下，离开对话自行核实",
            reply: safeReply,
            next: "after",
            outcome: "stopped",
          },
        ],
      };
    }
    e.escalate.forEach((step, j) => {
      nodes["escalate-" + j] = {
        messages: [reply(step.back)],
        choices: step.opts.map((o, i) => ({
          id: "step-" + i,
          text: o[0],
          cost: o[1],
          control: e.id === 11 && j === 0 && i === 0 ? 15 : 0,
          reply: e.replies.esc?.[j]?.[i] || safeReply,
          next:
            i === 0
              ? j + 1 < e.escalate.length
                ? "escalate-" + (j + 1)
                : "after"
              : "after",
          outcome: i === 0 ? "exposed" : "stopped",
        })),
      };
    });
  }
  nodes.after = {
    messages: [],
    choices: [{ id: "continue", text: "继续，看看下一条消息", next: "next" }],
  };
  // A debt prompt refers to a canonical action; the browser never supplies an amount.
  for (const [nodeId, node] of Object.entries(nodes))
    for (const c of node.choices)
      if (c.cost > 0) {
        nodes["loan-" + nodeId + "-" + c.id] = {
          loan: { node: nodeId, choice: c.id },
          messages: [
            msg("对方发来新的说法：“钱不够可以先借，补上这一笔就能继续。”"),
          ],
          choices: [
            { id: "borrow", text: "借款补足并继续（仅为模拟）" },
            { id: "stop", text: "不借了，先停下来" },
          ],
        };
      }
  return nodes;
}
export function classicsForLLM(data) {
  return data.events.map((e) => ({
    id: "classic:" + e.id,
    title: e.title,
    lesson: e.guard,
    nodes: Object.fromEntries(
      Object.entries(nodesFor(e)).map(([id, n]) => [
        id,
        {
          text: [e.context, n.context, ...n.messages.map((m) => m.text)]
            .filter(Boolean)
            .join("\n"),
          choices: n.choices.map((c) => ({ id: c.id, text: c.text })),
        },
      ]),
    ),
  }));
}
function buildDeck(data, seed, mode, scene) {
  if (mode === "scene") {
    if (!data.events.some((e) => e.id === scene)) throw Error("场景不存在");
    return [scene];
  }
  if (mode === "warmup") return shuffled([1, 3, 9, 15], seed);
  const deck = shuffled(
    data.events.filter((e) => e.arch !== "chain").map((e) => e.id),
    seed,
  ).slice(0, 12);
  if (!deck.some((id) => [14, 15].includes(id))) deck[deck.length - 1] = 15;
  return deck;
}
export function newRun(
  data,
  {
    seed = Date.now() >>> 0,
    mode = "challenge",
    scene = 1,
    identity = "random",
  } = {},
) {
  if (
    !["challenge", "warmup", "scene"].includes(mode) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 4294967295
  )
    throw Error("开局参数无效");
  const role =
    IDENTITIES.find((i) => i.id === identity) ||
    IDENTITIES[seed % IDENTITIES.length];
  const state = {
    schema: 1,
    seed,
    mode,
    scene,
    identity: role.id,
    deck: buildDeck(data, seed, mode, scene),
    round: 0,
    money: 10000,
    debt: 0,
    lostTotal: 0,
    control: 100,
    actions: [],
    messages: [],
    log: [],
    risks: [],
    node: "start",
    ended: false,
    answers: {},
  };
  enterScene(state, data);
  return state;
}
function eventFor(state, data) {
  const e = data.events.find((e) => e.id === state.deck[state.round]);
  if (!e) throw Error("场景不存在");
  return e;
}
export function currentEvent(state, data) {
  return eventFor(state, data);
}
export function availableChoices(state, data) {
  if (state.ended) return [];
  const node = nodesFor(eventFor(state, data))[state.node];
  if (!node) throw Error("节点不存在");
  const cs =
    state.node === "after"
      ? node.choices.map((c) => ({
          ...c,
          text:
            state.money <= 0 || state.round + 1 >= state.deck.length
              ? "结束，回看刚才的选择"
              : "继续，看看下一条消息",
        }))
      : node.choices;
  return shuffled(
    cs,
    state.seed + state.round * 997 + state.actions.length * 13,
  );
}
function enterScene(s, data) {
  const e = eventFor(s, data);
  s.node = "start";
  s.messages = [
    msg(`第 ${s.round + 1} / ${s.deck.length} 局 · ${e.context}`, "narration"),
  ];
  s.messages.push(...nodesFor(e).start.messages);
  s.log.push({
    eid: e.id,
    title: e.title,
    choices: [],
    loss: 0,
    control: 0,
    risks: [],
    outcome: "pending",
  });
}
function applyChoice(s, e, n, c, borrow = false) {
  const row = s.log[s.log.length - 1];
  if (borrow) {
    const extra = Math.max(0, c.cost - s.money);
    s.money += extra;
    s.debt += extra;
    s.messages.push(
      msg(
        `模拟借款 ¥${extra.toLocaleString("zh-CN")}，这笔债务不会因止损消失。`,
        "narration",
      ),
    );
  }
  const cost = c.cost || 0;
  s.money -= cost;
  s.lostTotal += cost;
  row.loss += cost;
  if (c.control) {
    s.control = Math.max(0, s.control - c.control);
    row.control += c.control;
    row.risks.push("账户或资料的控制权受损");
  }
  if (c.exposure) row.risks.push(c.exposure);
  if (cost) s.messages.push(msg("模拟转出", "transfer", { amount: cost }));
  if (c.reply) s.messages.push(reply(c.reply));
  s.node = c.next || "after";
  if (s.node === "after") {
    row.outcome =
      row.loss || row.control || row.risks.length
        ? c.outcome === "stopped"
          ? "recovered"
          : "exposed"
        : c.outcome || "paused";
    if (
      s.mode === "challenge" &&
      c.outcome === "exposed" &&
      row.loss > 0 &&
      s.round + 1 < s.deck.length &&
      !s.deck.slice(0, s.round + 1).includes(13) &&
      (s.seed + s.round) % 2 === 0
    )
      s.deck[s.round + 1] = 13;
  } else s.messages.push(...n[s.node].messages);
}
export function decide(state, data, choiceId) {
  if (state.ended) throw Error("这一局已经结束");
  const e = eventFor(state, data),
    nodes = nodesFor(e),
    node = nodes[state.node];
  const c = node?.choices.find((c) => c.id === choiceId);
  if (!c) throw Error("无效行动");
  const s = structuredClone(state);
  s.actions.push(choiceId);
  if (choiceId === "continue" && s.node === "after") {
    if (s.money <= 0 || s.round + 1 >= s.deck.length) {
      s.ended = true;
      return s;
    }
    s.round++;
    enterScene(s, data);
    return s;
  }
  s.messages.push(msg(c.text, "mine"));
  const row = s.log[s.log.length - 1];
  row.choices.push(c.text);
  if (node.loan) {
    if (choiceId === "stop") {
      s.node = "after";
      row.outcome =
        row.loss || row.control || row.risks.length ? "recovered" : "stopped";
      s.messages.push(
        msg(
          "你关闭了借款流程，没有继续支付。之前已经发生的损失仍然存在。",
          "narration",
        ),
      );
      return s;
    }
    const original = nodes[node.loan.node].choices.find(
      (x) => x.id === node.loan.choice,
    );
    applyChoice(s, e, nodes, original, true);
    return s;
  }
  if (c.cost > s.money) {
    s.node = "loan-" + s.node + "-" + c.id;
    s.messages.push(...nodes[s.node].messages);
    return s;
  }
  applyChoice(s, e, nodes, c);
  return s;
}
export function finishEarly(state) {
  const s = structuredClone(state);
  if (!s.ended) {
    s.actions.push("finish");
    s.ended = true;
    s.log.at(-1).outcome =
      s.log.at(-1).outcome === "pending" ? "paused" : s.log.at(-1).outcome;
  }
  return s;
}
export function snapshot(state, updated = Date.now()) {
  return {
    schema: 1,
    seed: state.seed,
    mode: state.mode,
    scene: state.scene,
    identity: state.identity,
    actions: [...state.actions],
    answers: { ...state.answers },
    updated,
  };
}
export function sanitizeSnapshot(raw) {
  if (
    !raw ||
    raw.schema !== 1 ||
    !Number.isInteger(raw.seed) ||
    raw.seed < 0 ||
    raw.seed > 4294967295 ||
    !["challenge", "warmup", "scene"].includes(raw.mode) ||
    !Number.isInteger(raw.scene) ||
    raw.scene < 1 ||
    raw.scene > 16 ||
    !IDENTITIES.some((i) => i.id === raw.identity) ||
    !Array.isArray(raw.actions) ||
    raw.actions.length > 200 ||
    raw.actions.some(
      (a) =>
        typeof a !== "string" ||
        !/^(verify|later|reply-[0-2]|act-[0-2]|step-[01]|stop|borrow|continue|finish)$/.test(
          a,
        ),
    )
  )
    return null;
  const answers = {};
  for (const [key, value] of Object.entries(raw.answers || {}))
    if (/^(?:[0-9]|1[01])$/.test(key) && [0, 1].includes(value))
      answers[key] = value;
  return {
    schema: 1,
    seed: raw.seed,
    mode: raw.mode,
    scene: raw.scene,
    identity: raw.identity,
    actions: [...raw.actions],
    answers,
    updated:
      Number.isSafeInteger(raw.updated) && raw.updated >= 0 ? raw.updated : 0,
  };
}
export function restoreRun(raw, data) {
  const clean = sanitizeSnapshot(raw);
  if (!clean) return null;
  try {
    let s = newRun(data, clean);
    for (const action of clean.actions)
      s = action === "finish" ? finishEarly(s) : decide(s, data, action);
    if (!s.ended && Object.keys(clean.answers).length) return null;
    s.answers = clean.answers;
    return s;
  } catch {
    return null;
  }
}
export function sanitizeClassic(raw) {
  const current = sanitizeSnapshot(raw?.current);
  const recent = (Array.isArray(raw?.recent) ? raw.recent : [])
    .map(sanitizeSnapshot)
    .filter(Boolean)
    .slice(-8);
  return { current, recent };
}
export function localResponse(e, choices, text) {
  const wantsStop = /(暂停|先停|不要|不转|不借|不买|核实|官方|自己查)/.test(
    text,
  );
  const suggested = wantsStop
    ? choices.find((c) => ["stop", "verify", "later"].includes(c.id))
    : null;
  const detail = /(证|执照|身份|公司|来源)/.test(text);
  return {
    reply: wantsStop
      ? e.localReplies.pause
      : detail
        ? e.distractors[1]?.back || e.localReplies.default
        : e.localReplies.default,
    suggestedActionId: suggested?.id || null,
    generated: false,
  };
}
export function mergeClassic(left, right) {
  const a = sanitizeClassic(left),
    b = sanitizeClassic(right),
    items = new Map();
  for (const s of [...a.recent, ...b.recent]) {
    const old = items.get(s.seed);
    if (!old || s.updated >= old.updated) items.set(s.seed, s);
  }
  return {
    current: !a.current
      ? b.current
      : !b.current
        ? a.current
        : a.current.updated >= b.current.updated
          ? a.current
          : b.current,
    recent: [...items.values()].sort((x, y) => x.updated - y.updated).slice(-8),
  };
}
