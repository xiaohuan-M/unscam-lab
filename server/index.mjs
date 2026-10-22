import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import {
  validateBase,
  validateChat,
  promptFor,
  validateReply,
} from "./llm.mjs";
export { validateBase } from "./llm.mjs";
const root = path.resolve(
  fileURLToPath(new URL("../public/", import.meta.url)),
);
const scenarios = JSON.parse(
  await readFile(path.join(root, "data/scenarios.json"), "utf8"),
);
const equal = (a, b) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const httpError = (code, message) =>
  Object.assign(new Error(message), { code });
async function readLimited(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw httpError(413, "输入过长");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function createApp({
  fetcher = fetch,
  env = process.env,
  now = Date.now,
  timeoutMs = 20000,
} = {}) {
  const base = validateBase(env.LLM_BASE_URL || "https://api.openai.com/v1");
  const publicMode =
    env.APP_MODE === "public" ||
    !!(env.HOST && !["127.0.0.1", "localhost", "::1"].includes(env.HOST));
  const enabled =
    !!env.LLM_MODEL && (!publicMode || (env.APP_TOKEN || "").length >= 16);
  const rates = new Map();
  let inFlight = 0,
    day = -1,
    spent = 0;
  const limit = Math.max(1, Number(env.LLM_DAILY_LIMIT) || 200);
  const app = http.createServer(async (req, res) => {
    const send = (code, data) => {
      if (res.writableEnded) return;
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (/^\/(classic|reference)\//.test(url.pathname))
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
        );
      if (url.pathname === "/api/health" && req.method === "GET")
        return send(200, { status: "ok", version: "3.0.0" });
      if (url.pathname === "/api/config" && req.method === "GET")
        return send(200, {
          enabled,
          model: env.LLM_MODEL || "",
          provider: new URL(base).hostname,
          requiresKey: !env.LLM_API_KEY,
          requiresToken: !!env.APP_TOKEN,
          publicMode,
        });
      if (
        ["/api/chat", "/api/test"].includes(url.pathname) &&
        req.method === "POST"
      ) {
        const origin = env.PUBLIC_ORIGIN;
        if (
          req.headers.origin &&
          (origin
            ? req.headers.origin !== origin
            : ![
                `http://${req.headers.host}`,
                `https://${req.headers.host}`,
              ].includes(req.headers.origin))
        )
          return send(403, { error: "来源不允许" });
        if (!String(req.headers["content-type"]).startsWith("application/json"))
          return send(415, { error: "需要 JSON 请求" });
        const current = now(),
          ip = req.socket.remoteAddress;
        for (const [key, v] of rates)
          if (current - v.start >= 60000) rates.delete(key);
        const rate = rates.get(ip) || { start: current, n: 0 };
        rate.n++;
        rates.set(ip, rate);
        if (rate.n > 20) {
          res.setHeader("Retry-After", "60");
          return send(429, { error: "请求过于频繁，一分钟后再试" });
        }
        if (publicMode && (env.APP_TOKEN || "").length < 16)
          return send(503, { error: "公开 AI 服务需要至少 16 字符的访问口令" });
        if (
          env.APP_TOKEN &&
          !equal(String(req.headers["x-app-token"] || ""), env.APP_TOKEN)
        )
          return send(401, { error: "访问口令不正确" });
        if (!enabled)
          return send(503, { error: "尚未配置模型，可继续本地练习" });
        if (Number(req.headers["content-length"]) > 12000)
          return send(413, { error: "输入过长" });
        let body;
        try {
          body = JSON.parse(await readLimited(req, 12000));
        } catch (error) {
          return send(error.code || 400, {
            error: error.code ? error.message : "JSON 格式无效",
          });
        }
        let context;
        try {
          context = validateChat(
            url.pathname === "/api/test"
              ? {
                  scenario: "refund",
                  node: "start",
                  message: "这是连接测试，请简短回应，不要建议任何操作。",
                }
              : body,
            scenarios,
          );
        } catch (e) {
          return send(400, { error: e.message });
        }
        const key = env.LLM_API_KEY || String(req.headers["x-llm-key"] || "");
        if (!key || key.length > 512)
          return send(503, {
            error: "请在设置中填写临时密钥，或由管理员配置 API Key",
          });
        const today = Math.floor(current / 86400000);
        if (day !== today) {
          day = today;
          spent = 0;
        }
        if (spent >= limit)
          return send(429, {
            error: "服务器今日 AI 请求额度已用完，仍可进行本地练习",
          });
        if (inFlight >= 3) return send(429, { error: "AI 正忙，请稍后重试" });
        spent++;
        inFlight++;
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), timeoutMs);
        const closed = () => {
          if (!res.writableEnded) abort.abort();
        };
        res.once("close", closed);
        try {
          const upstream = await fetcher(`${base}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: env.LLM_MODEL,
              messages: promptFor(context),
              temperature: 0.7,
              max_tokens: 600,
            }),
            signal: abort.signal,
            redirect: "error",
          });
          if (!upstream.ok)
            return send(502, {
              error: "模型服务返回错误，请检查模型、密钥与额度",
            });
          const reader = upstream.body?.getReader();
          let raw = "";
          if (reader) {
            const decoder = new TextDecoder();
            let bytes = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              if (bytes > 24000) {
                await reader.cancel();
                throw Error("模型回复过长");
              }
              raw += decoder.decode(value, { stream: true });
            }
            raw += decoder.decode();
          } else throw Error("模型回复为空");
          const data = JSON.parse(raw),
            text = data.choices?.[0]?.message?.content;
          if (typeof text !== "string") throw Error("模型回复格式不正确");
          const output = validateReply(text, context.node);
          return send(
            200,
            url.pathname === "/api/test"
              ? { ok: true, model: env.LLM_MODEL }
              : output,
          );
        } catch (error) {
          return send(abort.signal.aborted ? 504 : 502, {
            error: abort.signal.aborted
              ? "模型回复超时，可以继续本地练习"
              : "模型回复无法使用，可以继续本地练习",
          });
        } finally {
          clearTimeout(timer);
          res.off("close", closed);
          inFlight--;
        }
      }
      if (url.pathname.startsWith("/api/"))
        return send(404, { error: "接口不存在" });
      if (!["GET", "HEAD"].includes(req.method))
        return send(405, { error: "方法不允许" });
      let relative;
      try {
        relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      } catch {
        return send(400, { error: "路径编码无效" });
      }
      if (
        relative.includes("\0") ||
        relative.split("/").some((p) => p.startsWith("."))
      )
        return send(403, { error: "路径不允许" });
      const file = path.resolve(root, relative || "index.html");
      if (!file.startsWith(root + path.sep))
        return send(403, { error: "路径不允许" });
      let bytes;
      try {
        bytes = await readFile(file);
      } catch {
        return send(404, { error: "文件不存在" });
      }
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".webmanifest": "application/manifest+json",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".txt": "text/plain; charset=utf-8",
          ".md": "text/plain; charset=utf-8",
          ".pdf": "application/pdf",
          ".epub": "application/epub+zip",
          ".zip": "application/zip",
        }[path.extname(file)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch {
      send(500, { error: "服务暂不可用，可继续本地训练" });
    }
  });
  app.requestTimeout = 30000;
  app.headersTimeout = 10000;
  app.keepAliveTimeout = 5000;
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000),
    host = process.env.HOST || "127.0.0.1";
  const app = createApp();
  app.listen(port, host, () =>
    console.log(`识局 v3.0.0 · http://${host}:${port}`),
  );
  const shutdown = () => {
    app.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
