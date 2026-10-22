/** Deterministic story state. LLM output never mutates this state directly. */
export const ENDINGS = ["safe", "recovered", "loss", "verified", "missed"];
export const initial = (id, mode = "learn", seed = Date.now()) => ({
  id,
  node: "start",
  mode,
  seed,
  money: 10000,
  privacy: 100,
  history: [],
  clues: [],
  ended: false,
  turns: 0,
  assessed: false,
});
export function act(state, scenario, choiceId) {
  if (state.id !== scenario.id || state.ended)
    throw new Error("无效或已结束的剧情");
  const node = scenario.nodes[state.node];
  const choice = node?.choices.find((c) => c.id === choiceId);
  if (
    !choice ||
    (!scenario.nodes[choice.next] && !ENDINGS.includes(choice.next))
  )
    throw new Error("无效选项");
  return {
    ...state,
    node: choice.next,
    ended: !scenario.nodes[choice.next],
    history: [
      ...state.history,
      {
        node: state.node,
        choice: choice.id,
        label: choice.text,
        lesson: choice.lesson,
        loss: choice.loss || 0,
        privacy: choice.privacy || 0,
      },
    ],
    money: Math.max(0, state.money - (choice.loss || 0)),
    privacy: Math.max(0, state.privacy - (choice.privacy || 0)),
  };
}
export function reviewDate(level, now = Date.now()) {
  return now + [1, 3, 7, 14, 30][Math.min(4, Math.max(0, level))] * 86400000;
}
export function score(s) {
  return Math.max(
    0,
    100 -
      s.history.reduce(
        (n, h) => n + (h.loss ? 25 : 0) + (h.privacy ? 20 : 0),
        0,
      ) -
      (s.node === "missed" ? 15 : 0),
  );
}
export function shuffled(items, seed) {
  const result = [...items];
  let n = Number(seed) >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = n % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function dailySeed(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(date)
      .replaceAll("-", ""),
  );
}
export function nextReview(card, remembered, now = Date.now()) {
  const level = remembered ? Math.min(4, (card.level ?? -1) + 1) : 0;
  return { level, due: reviewDate(level, now) };
}
export function restoreSession(raw, scenarios) {
  if (!raw || !Array.isArray(raw.history) || raw.history.length > 12)
    return null;
  const scenario = scenarios.find((s) => s.id === raw.id);
  if (!scenario) return null;
  try {
    let state = initial(
      raw.id,
      raw.mode === "challenge" ? "challenge" : "learn",
      Number.isSafeInteger(raw.seed) ? raw.seed : 1,
    );
    for (const h of raw.history) {
      if (h.node !== state.node) return null;
      state = act(state, scenario, h.choice);
    }
    if (state.node !== raw.node) return null;
    state.clues = [
      ...new Set(
        (Array.isArray(raw.clues) ? raw.clues : []).filter(
          (i) => Number.isInteger(i) && i >= 0 && i < scenario.clues.length,
        ),
      ),
    ];
    state.turns = Number.isInteger(raw.turns)
      ? Math.max(0, Math.min(8, raw.turns))
      : 0;
    state.transferAnswer =
      Number.isInteger(raw.transferAnswer) &&
      raw.transferAnswer >= 0 &&
      raw.transferAnswer < scenario.transfer.options.length
        ? raw.transferAnswer
        : null;
    state.assessed = state.transferAnswer !== null;
    state.assessmentCorrect = state.transferAnswer === scenario.transfer.answer;
    return state;
  } catch {
    return null;
  }
}
