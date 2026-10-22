// Reproducible adaptation: never changes the byte-exact upstream reference files.
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
const root = new URL("../", import.meta.url);
const context = vm.createContext({ window: {} });
for (const name of ["data", "replies"])
  vm.runInContext(
    await readFile(
      new URL(`public/reference/game/js/${name}.js`, root),
      "utf8",
    ),
    context,
    { timeout: 1000 },
  );
const patch = JSON.parse(
  await readFile(new URL("content/classic-enhancements.json", root), "utf8"),
);
const merge = (base, delta) => {
  if (Array.isArray(base))
    return base.map((v, i) => (delta?.[i] == null ? v : merge(v, delta[i])));
  if (base && typeof base === "object") {
    const out = { ...base };
    for (const [k, v] of Object.entries(delta || {}))
      out[k] = k in out ? merge(out[k], v) : v;
    return out;
  }
  return delta;
};
const events = JSON.parse(JSON.stringify(context.window.EVENTS)).map((ev) => {
  const edit = patch.events[ev.id],
    replies = context.window.REPLIES[ev.id] || {};
  const {
    distractorPatches = {},
    s2Patches = {},
    escalatePatches = {},
    replies: replyPatch = {},
    ...rest
  } = edit;
  const out = {
    ...ev,
    ...rest,
    replies: merge(JSON.parse(JSON.stringify(replies)), replyPatch),
  };
  out.distractors = ev.distractors.map((d, i) => ({
    ...d,
    ...distractorPatches[i],
  }));
  out.s2opts = (ev.s2opts || []).map((o, i) => [
    s2Patches[i]?.label || o[0],
    o[1],
  ]);
  out.escalate = (ev.escalate || []).map((e, j) => ({
    ...e,
    opts: e.opts.map((o, i) => [escalatePatches[j]?.[i]?.label || o[0], o[1]]),
  }));
  // The training uses qualitative account/identity risk, never a made-up criminal liability score.
  delete out.criminal;
  delete out.credit;
  return out;
});
const data = { version: 1, source: patch.source, events };
await writeFile(
  new URL("public/data/classic.json", root),
  JSON.stringify(data, null, 2) + "\n",
);
console.log(`Prepared ${events.length} original scenes with reviewed branches`);
