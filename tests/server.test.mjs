import test from "node:test";
import assert from "node:assert/strict";
import { createApp, validateBase } from "../server/index.mjs";
async function withApp(fn, options = {}) {
  const app = createApp(options);
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  try {
    await fn(`http://127.0.0.1:${app.address().port}`);
  } finally {
    await new Promise((r) => app.close(r));
  }
}
const env = {
  HOST: "127.0.0.1",
  LLM_MODEL: "test",
  LLM_API_KEY: "secret-test",
  APP_TOKEN: "access-test",
};
const post = (base, body, extra = {}) =>
  fetch(base + "/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": "access-test",
      ...extra,
    },
    body: JSON.stringify(body),
  });
const body = { scenario: "refund", node: "start", message: "我想先核实" };
test("Static assets, CSP and config never expose keys", () =>
  withApp(
    async (base) => {
      const r = await fetch(base);
      assert.equal(r.status, 200);
      assert.match(
        r.headers.get("content-security-policy"),
        /frame-ancestors 'none'/,
      );
      const config = await (await fetch(base + "/api/config")).text();
      assert.ok(!config.includes("secret-test"));
      assert.ok(!config.includes("access-test"));
    },
    { env },
  ));
test("Reject unauthorized, cross-origin and invalid scene requests", () =>
  withApp(
    async (base) => {
      assert.equal(
        (await post(base, body, { "X-App-Token": "wrong" })).status,
        401,
      );
      assert.equal(
        (await post(base, body, { Origin: "https://evil.example" })).status,
        403,
      );
      assert.equal((await post(base, { ...body, node: "forged" })).status, 400);
    },
    { env },
  ));
test("Model cannot inject new actions and key stays server-side", () =>
  withApp(
    async (base) => {
      const r = await post(base, body);
      assert.equal(r.status, 200);
      const data = await r.json();
      assert.deepEqual(
        data.choices.map((c) => c.id),
        ["verify", "ask", "pause"],
      );
      assert.ok(!JSON.stringify(data).includes("secret-test"));
    },
    {
      env,
      fetcher: async (url, init) => {
        assert.equal(url, "https://api.openai.com/v1/chat/completions");
        assert.equal(init.headers.Authorization, "Bearer secret-test");
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "先核实，再决定。",
                  choices: [{ id: "evil", text: "转账" }],
                }),
              },
            },
          ],
        });
      },
    },
  ));
test("Malformed model response fails safely", () =>
  withApp(
    async (base) => {
      assert.equal((await post(base, body)).status, 502);
    },
    {
      env,
      fetcher: async () =>
        Response.json({ choices: [{ message: { content: "broken" } }] }),
    },
  ));
test("Public AI requires access token", () =>
  withApp(
    async (base) => {
      assert.equal((await post(base, body)).status, 503);
    },
    { env: { ...env, HOST: "0.0.0.0", APP_TOKEN: "" } },
  ));
test("Base URL validation prevents insecure remote endpoint and embedded credentials", () => {
  assert.throws(() => validateBase("http://example.com"));
  assert.throws(() => validateBase("https://user:pass@example.com"));
  assert.equal(
    validateBase("http://localhost:11434/v1"),
    "http://localhost:11434/v1",
  );
});
test("health endpoint and malformed payloads are stable", () =>
  withApp(
    async (base) => {
      assert.equal((await fetch(base + "/api/health")).status, 200);
      assert.equal((await post(base, null)).status, 400);
      assert.equal(
        (await post(base, { ...body, message: "a".repeat(14000) })).status,
        413,
      );
    },
    { env },
  ));
test("daily budget is per app instance and never calls provider beyond limit", async () => {
  let calls = 0;
  await withApp(
    async (base) => {
      for (let i = 0; i < 2; i++)
        assert.equal((await post(base, body)).status, 200);
      assert.equal((await post(base, body)).status, 429);
      assert.equal(calls, 2);
    },
    {
      env: { ...env, LLM_DAILY_LIMIT: "2" },
      fetcher: async () => {
        calls++;
        return Response.json({
          choices: [{ message: { content: '{"reply":"先核实"}' } }],
        });
      },
    },
  );
});
test("upstream timeout is bounded and static content stays available", () =>
  withApp(
    async (base) => {
      assert.equal((await post(base, body)).status, 504);
      assert.equal((await fetch(base)).status, 200);
    },
    {
      env,
      timeoutMs: 10,
      fetcher: async (_url, init) =>
        new Promise((_, reject) =>
          init.signal.addEventListener("abort", () => reject(Error("timeout"))),
        ),
    },
  ));
test("request flood receives retry-after and no credentials in error", () =>
  withApp(
    async (base) => {
      let response;
      for (let i = 0; i < 21; i++)
        response = await post(base, body, { "X-App-Token": "wrong" });
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("retry-after"), "60");
      assert.ok(!(await response.text()).includes("secret-test"));
    },
    { env },
  ));
test("configured external origin is enforced behind reverse proxy", () =>
  withApp(
    async (base) => {
      assert.equal(
        (await post(base, body, { Origin: "https://other.example" })).status,
        403,
      );
      assert.equal(
        (await post(base, body, { Origin: "https://learn.example" })).status,
        200,
      );
    },
    {
      env: { ...env, PUBLIC_ORIGIN: "https://learn.example" },
      fetcher: async () =>
        Response.json({
          choices: [{ message: { content: '{"reply":"先核实"}' } }],
        }),
    },
  ));
test("invalid URL encoding is a client error and secrets are never served", () =>
  withApp(async (base) => {
    assert.equal((await fetch(base + "/%zz")).status, 400);
    assert.equal((await fetch(base + "/.env")).status, 403);
    assert.equal((await fetch(base + "/server/index.mjs")).status, 404);
  }));
test("actual HTTP-compatible provider receives context and produces validated output", async () => {
  const { createServer } = await import("node:http");
  let observed;
  const upstream = createServer(async (req, res) => {
    let data = "";
    for await (const chunk of req) data += chunk;
    observed = {
      url: req.url,
      auth: req.headers.authorization,
      body: JSON.parse(data),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "我听到了你的疑问，可以先从原订单核实。",
                suggestedActionId: "verify",
                followups: ["还有哪些信息需要核实？"],
              }),
            },
          },
        ],
      }),
    );
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  try {
    await withApp(
      async (base) => {
        const r = await post(base, {
          ...body,
          history: [{ role: "user", content: "我有一个包裹" }],
        });
        assert.equal(r.status, 200);
        assert.equal((await r.json()).suggestedActionId, "verify");
        assert.equal(observed.url, "/v1/chat/completions");
        assert.equal(observed.auth, "Bearer secret-test");
        assert.equal(observed.body.messages[1].content, "我有一个包裹");
      },
      {
        env: {
          ...env,
          LLM_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
        },
      },
    );
  } finally {
    await new Promise((r) => upstream.close(r));
  }
});
