import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  initial,
  act,
  restoreSession,
  nextReview,
  shuffled,
  dailySeed,
} from "../public/engine.js";
import {
  emptyProgress,
  validateProgress,
  mergeProgress,
  loadProgress,
  backup,
} from "../public/lib/storage.js";
const scenarios = JSON.parse(
    await readFile(new URL("../public/data/scenarios.json", import.meta.url)),
  ),
  knowledge = JSON.parse(
    await readFile(new URL("../public/data/knowledge.json", import.meta.url)),
  );
test("restore replays authored history and ignores fabricated balance", () => {
  let s = initial("refund");
  s = act(s, scenarios[0], "ask");
  s = act(s, scenarios[0], "trust");
  const restored = restoreSession(
    { ...s, money: 999999, privacy: -5, clues: [0, 99, 0] },
    scenarios,
  );
  assert.equal(restored.money, 9500);
  assert.equal(restored.privacy, 100);
  assert.deepEqual(restored.clues, [0]);
  assert.equal(restoreSession({ ...s, history: [] }, scenarios), null);
});
test("restore retains valid transfer result and turn count", () => {
  let s = initial("refund");
  s = act(s, scenarios[0], "pause");
  s = { ...s, transferAnswer: 1, turns: 8 };
  const restored = restoreSession(s, scenarios);
  assert.equal(restored.assessmentCorrect, true);
  assert.equal(restored.assessed, true);
  assert.equal(restored.turns, 8);
});
test("legacy backup migrates without importing credentials", () => {
  const p = validateProgress(
    {
      version: 1,
      results: { refund: { best: 75, attempts: 2, date: 123, last: "loss" } },
      reviews: { 1: { level: 1, due: 123 } },
      apiKey: "never-import",
    },
    scenarios,
    knowledge,
  );
  assert.equal(p.version, 3);
  assert.deepEqual(p.results.refund.endings, ["loss"]);
  assert.equal(p.apiKey, undefined);
});
test("bad backup cannot inject story records or invalid dates", () => {
  for (const r of [
    null,
    [],
    { version: 99 },
    { version: 2, results: { x: {} }, reviews: {} },
    { version: 2, results: {}, reviews: { 1: { level: 0, due: -1 } } },
  ])
    assert.throws(() => validateProgress(r, scenarios, knowledge));
});
test("imports are idempotent and retain higher performance", () => {
  const a = emptyProgress();
  a.results.refund = {
    best: 100,
    attempts: 3,
    date: 200,
    last: "safe",
    endings: ["safe"],
  };
  const b = emptyProgress();
  b.results.refund = {
    best: 20,
    attempts: 1,
    date: 100,
    last: "loss",
    endings: ["loss"],
  };
  const merged = mergeProgress(a, b);
  assert.equal(merged.results.refund.best, 100);
  assert.equal(merged.results.refund.attempts, 3);
  assert.deepEqual(mergeProgress(merged, b), merged);
});
test("broken storage never prevents rendering", () => {
  const loaded = loadProgress(
    {
      getItem() {
        throw Error("denied");
      },
    },
    scenarios,
    knowledge,
  );
  assert.ok(loaded.warning);
  assert.deepEqual(loaded.data, emptyProgress());
});
test("export excludes dialogue, session and keys", () => {
  const p = {
    ...emptyProgress(),
    session: { messages: ["sensitive"] },
    apiKey: "secret",
  };
  const out = JSON.stringify(backup(p));
  assert.ok(!/secret|sensitive|session/.test(out));
});
test("review sequence starts with one day; remembered cards extend interval", () => {
  const a = nextReview({ level: -1 }, true, 0);
  assert.equal(a.due, 86400000);
  assert.equal(nextReview(a, true, 0).due, 3 * 86400000);
  assert.equal(nextReview(a, false, 0).due, 86400000);
});
test("seeded order is stable, daily seed uses Shanghai calendar", () => {
  assert.deepEqual(shuffled([1, 2, 3, 4], 9), shuffled([1, 2, 3, 4], 9));
  assert.equal(dailySeed(new Date("2026-10-22T17:00:00Z")), 20261023);
});
