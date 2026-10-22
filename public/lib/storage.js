import { restoreSession } from "../engine.js";
export const STORAGE_KEY = "unscam-v2";
export const emptyProgress = () => ({
  version: 2,
  results: {},
  reviews: {},
  mistakes: {},
  large: false,
  mode: "learn",
  session: null,
});
const record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
const validDate = (v) => finite(v, 0, 8640000000000000);
/** Whitelist fields: imports cannot restore keys, HTML, chat or arbitrary state. */
export function validateProgress(
  raw,
  scenarios,
  knowledge,
  { strict = true } = {},
) {
  if (
    !record(raw) ||
    ![1, 2].includes(raw.version) ||
    !record(raw.results) ||
    !record(raw.reviews)
  )
    throw Error("不支持的备份格式");
  const p = emptyProgress();
  p.large = raw.large === true;
  p.mode = raw.mode === "challenge" ? "challenge" : "learn";
  const invalid = () => {
    if (strict) throw Error("备份记录损坏，请使用有效的导出文件");
  };
  for (const [id, r] of Object.entries(raw.results)) {
    if (
      !scenarios.some((s) => s.id === id) ||
      !record(r) ||
      !finite(r.best, 0, 100) ||
      !Number.isSafeInteger(r.attempts) ||
      !finite(r.attempts, 1, 1000000) ||
      !validDate(r.date)
    ) {
      invalid();
      continue;
    }
    p.results[id] = {
      best: r.best,
      attempts: r.attempts,
      date: r.date,
      last: ["safe", "recovered", "loss", "verified", "missed"].includes(r.last)
        ? r.last
        : "safe",
      endings: [
        ...new Set(
          (Array.isArray(r.endings) ? r.endings : [r.last]).filter((x) =>
            ["safe", "recovered", "loss", "verified", "missed"].includes(x),
          ),
        ),
      ],
    };
  }
  for (const [id, r] of Object.entries(raw.reviews)) {
    if (
      !knowledge.some((k) => String(k.id) === id) ||
      !record(r) ||
      !Number.isInteger(r.level) ||
      !finite(r.level, -1, 4) ||
      !validDate(r.due)
    ) {
      invalid();
      continue;
    }
    p.reviews[id] = { level: r.level, due: r.due };
  }
  if (record(raw.mistakes))
    for (const [id, r] of Object.entries(raw.mistakes)) {
      if (
        !scenarios.some((s) => s.id === id) ||
        !record(r) ||
        !validDate(r.due) ||
        !Number.isInteger(r.level) ||
        !finite(r.level, -1, 4)
      ) {
        invalid();
        continue;
      }
      p.mistakes[id] = { level: r.level, due: r.due };
    }
  p.session = restoreSession(raw.session, scenarios);
  return p;
}
export function loadProgress(storage, scenarios, knowledge) {
  try {
    const raw = storage.getItem(STORAGE_KEY) || storage.getItem("unscam-v1");
    if (!raw) return { data: emptyProgress() };
    return {
      data: validateProgress(JSON.parse(raw), scenarios, knowledge, {
        strict: false,
      }),
    };
  } catch {
    return {
      data: emptyProgress(),
      warning: "本地记录无法读取，本次使用临时进度；你仍可导入备份。",
    };
  }
}
export function mergeProgress(current, incoming) {
  const merged = {
    ...current,
    results: { ...current.results },
    reviews: { ...current.reviews },
    mistakes: { ...current.mistakes },
  };
  for (const [id, r] of Object.entries(incoming.results)) {
    const old = merged.results[id];
    merged.results[id] = old
      ? {
          ...(old.date > r.date ? old : r),
          best: Math.max(old.best, r.best),
          attempts: Math.max(old.attempts, r.attempts),
          endings: [...new Set([...(old.endings || []), ...r.endings])],
        }
      : r;
  }
  for (const kind of ["reviews", "mistakes"])
    for (const [id, r] of Object.entries(incoming[kind])) {
      const old = merged[kind][id];
      merged[kind][id] = old
        ? { level: Math.min(old.level, r.level), due: Math.min(old.due, r.due) }
        : r;
    }
  return merged;
}
export function backup(progress) {
  const { version, results, reviews, mistakes, large, mode } = progress;
  return { version, results, reviews, mistakes, large, mode };
}
