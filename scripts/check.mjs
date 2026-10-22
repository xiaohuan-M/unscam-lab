import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ENDINGS } from "../public/engine.js";
async function check(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = dir + "/" + e.name;
    if (e.isDirectory()) await check(p);
    else if (/\.(js|mjs)$/.test(e.name))
      execFileSync(process.execPath, ["--check", p]);
  }
}
for (const dir of ["public", "server", "scripts", "tests"]) await check(dir);
const scenarios = JSON.parse(await readFile("public/data/scenarios.json"));
const ids = new Set();
for (const s of scenarios) {
  if (ids.has(s.id)) throw Error("Duplicate story");
  ids.add(s.id);
  if (!s.nodes.start) throw Error("Missing start");
  for (const n of Object.values(s.nodes)) {
    if (
      !n.text ||
      !n.choices.length ||
      new Set(n.choices.map((c) => c.id)).size !== n.choices.length
    )
      throw Error("Invalid node");
    for (const c of n.choices) {
      if (
        !s.nodes[c.next] &&
        (!ENDINGS.includes(c.next) || !s.outcomes[c.next])
      )
        throw Error("Dangling choice " + s.id);
      if ((c.loss || 0) < 0 || (c.privacy || 0) < 0)
        throw Error("Invalid loss");
    }
  }
  if (!s.transfer.options[s.transfer.answer]) throw Error("Invalid assessment");
}
console.log(
  "Syntax and content graph checks passed · " + scenarios.length + " scenarios",
);
