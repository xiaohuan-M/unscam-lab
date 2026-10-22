import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  matchingArticles,
  articleText,
  markdown,
  safeURL,
  selfcheckPlan,
} from "../public/lib/learning.js";
import {
  emptyProgress,
  validateProgress,
  backup,
  mergeProgress,
} from "../public/lib/storage.js";
const read = async (p) =>
  JSON.parse(await readFile(new URL("../public/" + p, import.meta.url)));
const [articles, collection, original, scenarios] = await Promise.all(
  [
    "data/knowledge.json",
    "data/collection.json",
    "reference/tools/articles.json",
    "data/scenarios.json",
  ].map(read),
);
test("every original article field and all 8248 body blocks survive import", () => {
  assert.equal(articles.length, 373);
  assert.equal(collection.counts.bodyBlocks, 8248);
  for (const row of original) {
    const current = articles.find((a) => a.id === row.id);
    for (const key of Object.keys(row))
      assert.deepEqual(current[key], row[key], `#${row.id}.${key}`);
  }
  assert.equal(
    articles.reduce((n, a) => n + a.referenceIds.length, 0),
    1474,
  );
  for (const a of articles)
    for (const id of a.referenceIds) assert.ok(collection.reports[id]?.u);
});
test("all 65 source files remain byte exact, including downloadable binaries", async () => {
  assert.equal(collection.files.length, 65);
  for (const f of collection.files) {
    const bytes = await readFile(
      new URL("../public/reference/" + f.path, import.meta.url),
    );
    assert.equal(bytes.length, f.bytes, f.path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      f.sha256,
      f.path,
    );
  }
  assert.equal(collection.counts.selfcheck, 45);
  assert.equal(collection.counts.events, 16);
  assert.equal(collection.counts.puzzles, 12);
  assert.equal(collection.counts.glossary, 42);
  assert.equal(collection.counts.reports, 120);
  assert.equal(collection.counts.longreads, 3);
  assert.equal(collection.counts.volumes, 16);
  for (const p of collection.puzzles)
    assert.ok(articles.some((a) => a.id === p.article));
  for (const q of collection.selfcheck.questions)
    assert.ok(articles.some((a) => a.id === q[3]));
});
test("search reaches full body text, combines facets, and finds exact article number", () => {
  const a = articles[0],
    query = a.body[8].t;
  assert.ok(matchingArticles(articles, { query }).some((x) => x.id === a.id));
  assert.ok(
    matchingArticles(articles, { query: "373" }).some((x) => x.id === 373),
  );
  assert.ok(
    matchingArticles(articles, {
      category: a.cat,
      risk: a.risks[0],
      target: a.targets[0],
    }).some((x) => x.id === a.id),
  );
  assert.ok(
    !matchingArticles(articles, { unread: true, read: { [a.id]: 1 } }).some(
      (x) => x.id === a.id,
    ),
  );
});
test("full copy includes every paragraph and all source URLs", () => {
  for (const a of articles) {
    const text = articleText(a, collection.reports);
    for (const b of a.body) assert.ok(text.includes(b.t));
    for (const id of a.referenceIds)
      assert.ok(text.includes(collection.reports[id].u));
  }
});
test("source markdown cannot inject HTML or active URLs", () => {
  const html = markdown(
    "<script>alert(1)</script>\n[x](javascript:alert)\n[ok](https://example.com/)\n```html\n<img onerror=x>\n```",
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('href="https://example.com/"'));
  assert.ok(html.includes("&lt;img"));
  assert.equal(safeURL("data:text/html,x"), null);
  assert.equal(safeURL("//example.com"), null);
});
test("selfcheck plan contains only pending actions ordered by priority", () => {
  const p = selfcheckPlan(collection.selfcheck.questions, {
    0: "yes",
    1: "no",
    3: "no",
    4: "skip",
  });
  assert.deepEqual(
    p.map((x) => x.id),
    [1, 3],
  );
});
test("v3 reading/selfcheck survive backup and merge; invalid entries and keys never import", () => {
  const p = emptyProgress();
  p.read = { 373: 1 };
  p.selfcheck = { 0: "no", 44: "yes" };
  p.theme = "dark";
  p.lastArticle = 373;
  p.apiKey = "secret";
  const restored = validateProgress(backup(p), scenarios, articles);
  assert.equal(restored.apiKey, undefined);
  assert.deepEqual(restored.read, p.read);
  assert.deepEqual(restored.selfcheck, p.selfcheck);
  assert.equal(restored.theme, "dark");
  const old = validateProgress(
    { version: 2, results: {}, reviews: {} },
    scenarios,
    articles,
  );
  assert.deepEqual(old.read, {});
  assert.deepEqual(mergeProgress(old, restored).selfcheck, p.selfcheck);
  for (const bad of [
    { selfcheck: { 45: "yes" } },
    { read: { 9999: 1 } },
    { selfcheck: { 0: "html" } },
    { read: { 1: -1 } },
  ])
    assert.throws(() =>
      validateProgress({ ...backup(p), ...bad }, scenarios, articles),
    );
});
test("puzzle records merge best stars and fastest completion without accepting arbitrary levels", () => {
  const a = emptyProgress(),
    b = emptyProgress();
  a.puzzles = { "ch01-01": { solved: true, stars: 2, best: 100 } };
  b.puzzles = { "ch01-01": { solved: true, stars: 3, best: 120 } };
  assert.deepEqual(mergeProgress(a, b).puzzles["ch01-01"], {
    solved: true,
    stars: 3,
    best: 100,
  });
  const restored = validateProgress(backup(b), scenarios, articles);
  assert.deepEqual(restored.puzzles, b.puzzles);
  assert.throws(() =>
    validateProgress(
      { ...backup(a), puzzles: { bad: { solved: true, stars: 99, best: 0 } } },
      scenarios,
      articles,
    ),
  );
});
