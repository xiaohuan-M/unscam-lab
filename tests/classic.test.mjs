import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  newRun,
  decide,
  availableChoices,
  nodesFor,
  snapshot,
  restoreRun,
  finishEarly,
  mergeClassic,
  classicsForLLM,
} from "../public/classic/engine.js";
import {
  emptyProgress,
  backup,
  validateProgress,
} from "../public/lib/storage.js";
import { validateChat, validateReply, promptFor } from "../server/llm.mjs";
const data = JSON.parse(
  readFileSync(new URL("../public/data/classic.json", import.meta.url)),
);
const start = (id) => newRun(data, { mode: "scene", scene: id, seed: 2 });
const play = (id, actions) =>
  actions.reduce((s, a) => decide(s, data, a), start(id));
test("all 16 original scenes keep finite playable paths and consistent balances", () => {
  assert.equal(data.events.length, 16);
  let ends = 0;
  function walk(s, depth = 0) {
    assert.ok(depth < 13);
    assert.ok(
      s.money >= 0 && s.control >= 0 && s.control <= 100 && s.debt >= 0,
    );
    assert.equal(s.money, 10000 + s.debt - s.lostTotal);
    if (s.ended) {
      ends++;
      return;
    }
    const choices = availableChoices(s, data);
    assert.ok(choices.length);
    if (s.node.startsWith("followup"))
      assert.ok(choices.some((c) => c.id === "stop"));
    for (const c of choices) walk(decide(s, data, c.id), depth + 1);
  }
  for (const e of data.events) {
    assert.ok(e.transfer.options[e.transfer.answer]);
    walk(start(e.id));
  }
  assert.equal(ends, 395);
});
test("zero-price account exposure continues the original escalation instead of claiming safety", () => {
  for (const id of [2, 9]) {
    const s = play(id, ["reply-0", "act-0"]);
    assert.equal(s.node, "escalate-0");
    assert.equal(s.money, 10000);
    assert.ok(s.control < 100);
    assert.ok(s.log[0].risks.length);
  }
  const s = play(10, ["reply-0", "act-0"]);
  assert.equal(s.node, "escalate-0");
  assert.ok(s.log[0].risks.length);
});
test("stopping preserves real simulated losses and borrowing needs a separate decision", () => {
  let s = play(1, ["reply-0", "act-0"]);
  const spent = s.lostTotal;
  assert.ok(spent > 0);
  s = decide(s, data, "step-1");
  assert.equal(s.lostTotal, spent);
  assert.equal(s.log[0].outcome, "recovered");
  let visited = false;
  function find(s, depth = 0) {
    if (visited || s.ended || depth > 11) return;
    if (s.node.startsWith("loan-")) {
      visited = true;
      const before = snapshot(s, 1);
      const stop = decide(s, data, "stop");
      assert.equal(stop.money, s.money);
      assert.equal(stop.debt, s.debt);
      const yes = decide(s, data, "borrow");
      assert.ok(yes.debt > s.debt);
      assert.equal(yes.money, 10000 + yes.debt - yes.lostTotal);
      assert.deepEqual(snapshot(s, 1), before);
      return;
    }
    for (const c of availableChoices(s, data))
      find(decide(s, data, c.id), depth + 1);
  }
  for (const e of data.events) find(start(e.id));
  assert.ok(visited);
});
test("replay validates the authored path and ignores injected money, messages and credentials", () => {
  const state = play(9, ["reply-0", "act-0"]),
    raw = {
      ...snapshot(state),
      money: 999999,
      apiKey: "secret",
      messages: ["injected"],
    };
  assert.deepEqual(restoreRun(raw, data), state);
  assert.equal(restoreRun({ ...raw, actions: ["borrow"] }, data), null);
  assert.equal(
    restoreRun({ ...raw, actions: ["verify", "step-0"] }, data),
    null,
  );
  assert.equal(restoreRun({ ...raw, answers: { 0: 1 } }, data), null);
});
test("twelve-round deck, warmup and secondary fraud remain deterministic", () => {
  for (let seed = 0; seed < 50; seed++) {
    let s = newRun(data, { seed });
    assert.equal(s.deck.length, 12);
    assert.equal(new Set(s.deck).size, 12);
    assert.ok(s.deck.some((i) => [14, 15].includes(i)));
    assert.deepEqual(newRun(data, { seed }).deck, s.deck);
    while (!s.ended)
      s = decide(s, data, s.node === "after" ? "continue" : "verify");
    assert.equal(s.log.length, 12);
    assert.equal(s.money, 10000);
  }
  let s = newRun(data, { seed: 2 });
  let limit = 100;
  while (!s.ended && limit--) {
    const n = nodesFor(data.events.find((e) => e.id === s.deck[s.round]))[
      s.node
    ];
    const id =
      s.node === "after"
        ? "continue"
        : n.loan
          ? "borrow"
          : s.node === "start"
            ? n.choices.some((c) => c.id === "reply-0")
              ? "reply-0"
              : "verify"
            : s.node.startsWith("followup")
              ? "act-0"
              : "step-0";
    s = decide(s, data, id);
  }
  assert.ok(limit > 0);
  assert.ok(s.deck.includes(13));
  assert.equal(s.deck.filter((i) => i === 13).length, 1);
  assert.equal(newRun(data, { mode: "warmup", seed: 1 }).deck.length, 4);
});
test("normal notifications and optional protection tools neither pay fixed rewards nor punish postponing", () => {
  for (const id of [14, 15])
    for (const action of ["verify", "later"]) {
      const s = play(id, [action, "continue"]);
      assert.equal(s.money, 10000);
      assert.equal(s.lostTotal, 0);
      assert.ok(s.ended);
      assert.equal(s.log[0].risks.length, 0);
    }
});
test("unified backups preserve resumable decisions and bounded reviews, excluding free text and keys", () => {
  const run = finishEarly(play(3, ["reply-0"])),
    item = { ...snapshot(run, 10), chat: "private", apiKey: "key" };
  const p = emptyProgress();
  p.classic = { current: item, recent: [item] };
  const exported = backup(p);
  assert.ok(!JSON.stringify(exported).includes("private"));
  assert.ok(!JSON.stringify(exported).includes("apiKey"));
  const restored = validateProgress(exported, [], []);
  assert.deepEqual(restoreRun(restored.classic.current, data), run);
  const old = { current: snapshot(run, 2), recent: [] };
  assert.equal(mergeClassic(old, restored.classic).current.updated, 10);
});
test("original chat LLM accepts only canonical context and proposes an existing explicit action", () => {
  const scenes = classicsForLLM(data);
  const c = validateChat(
    { scenario: "classic:9", node: "followup-0", message: "我先核实一下" },
    scenes,
  );
  assert.match(promptFor(c)[0].content, /局中不揭晓/);
  assert.match(promptFor(c)[0].content, /先停一下/);
  const valid = validateReply(
    JSON.stringify({ reply: "你可以先了解情况。", suggestedActionId: "stop" }),
    c.node,
  );
  assert.equal(valid.suggestedActionId, "stop");
  const forged = validateReply(
    JSON.stringify({
      reply: "再想想吧。",
      suggestedActionId: "send-money-now",
    }),
    c.node,
  );
  assert.equal(forged.suggestedActionId, null);
  assert.throws(() =>
    validateChat(
      { scenario: "classic:17", node: "start", message: "你好" },
      scenes,
    ),
  );
});
