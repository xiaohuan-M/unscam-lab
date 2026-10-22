import { test, expect } from "@playwright/test";
const action = (page, name) => page.locator(`[data-action="${name}"]`);
async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".case")).toHaveCount(16);
}
async function start(page, id = "refund") {
  await action(page, "start:" + id)
    .last()
    .click();
  await expect(page.locator(".chat-log")).toBeVisible();
}
async function finishSafe(page) {
  await action(page, "choose:verify").click();
  await action(page, "choose:close").click();
}
test("all routes render without client exceptions; desktop home", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  for (const route of [
    "guide",
    "library",
    "review",
    "settings",
    "help",
    "about",
    "home",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("main")).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});
test("story reveals evidence progressively and preserves complete transcript", async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await expect(page.locator(".clue")).toHaveCount(1);
  await action(page, "choose:ask").click();
  await expect(page.locator(".clue")).toHaveCount(2);
  await expect(page.locator(".chat-log")).toContainText("您的包裹运输中损坏");
  await action(page, "choose:trust").click();
  await action(page, "choose:stop").click();
  await expect(page.locator("main")).toContainText("¥9,500");
  await expect(page.locator("main h1")).toContainText("停了下来");
  await page.reload();
  await expect(page.locator("main")).toContainText("¥9,500");
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("unscam-v2")),
  );
  expect(state.results.refund.attempts).toBe(1);
});
test("normal scenario rewards evidence-based continuation", async ({
  page,
}) => {
  await ready(page);
  await start(page, "order-check");
  await action(page, "choose:verify").click();
  await action(page, "choose:continue").click();
  await expect(page.locator("main")).toContainText("正常业务对照");
  await expect(page.locator("main h1")).toContainText("正常处理");
});
test("challenge hides explanations until debrief", async ({ page }) => {
  await ready(page);
  await action(page, "mode:challenge").click();
  await expect(page.locator(".message-note").first()).toContainText("未知情境");
  await start(page);
  await action(page, "clue:0").click();
  await expect(page.locator("dialog")).toContainText("完整解释将在本局复盘");
  await page.keyboard.press("Escape");
  await finishSafe(page);
  await expect(page.locator("main")).toContainText("回看线索");
});
test("transfer mistakes are saved and first answer cannot be overwritten", async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await finishSafe(page);
  await action(page, "transfer:0").click();
  await expect(page.locator("#transfer-feedback")).toContainText("已加入错题");
  await expect(action(page, "transfer:1")).toBeDisabled();
  await page.reload();
  await expect(page.locator("#transfer-feedback")).toContainText("已加入错题");
  await page.goto("/#review");
  await expect(page.locator("main")).toContainText("回练这个情境");
});
test("correct assessment survives refresh", async ({ page }) => {
  await ready(page);
  await start(page);
  await finishSafe(page);
  await action(page, "transfer:1").click();
  await page.reload();
  await expect(page.locator("#transfer-feedback")).toContainText("回答正确");
});
test("library search, empty state, pagination and review", async ({ page }) => {
  await ready(page);
  await page.goto("/#library");
  await page.getByLabel("搜索知识").fill("验证码");
  await expect(page.locator(".knowledge article").first()).toBeVisible();
  await page.locator('[data-learn^="bookmark:"]').first().click();
  await page.goto("/#review");
  await expect(page.locator("main")).toContainText("知识卡复习");
  await page.locator("summary").first().click();
  await page.locator('[data-action$=":good"]').click();
  await page.goto("/#library");
  await page.getByLabel("搜索知识").fill("不存在的关键词xyz");
  await expect(page.locator("#knowledge-results")).toContainText("没有找到");
  await expect(page.locator('[data-learn="next"]')).toBeDisabled();
});
test("unfinished session replays correctly and replacing it requires confirmation", async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await action(page, "choose:ask").click();
  await page.reload();
  await expect(page.locator(".chat-log")).toContainText("理赔截图");
  await page.goto("/#home");
  await action(page, "start:job").last().click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await action(page, "resume").click();
  await expect(page.locator(".chat-log")).toContainText("理赔截图");
});
test("invalid saved data is ignored, not rendered", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "unscam-v2",
      JSON.stringify({
        version: 2,
        results: { evil: { best: "<script>", attempts: 1, date: 1 } },
        reviews: {},
        session: {
          id: "refund",
          node: "pressure",
          money: 999999,
          history: [],
          clues: [],
        },
      }),
    ),
  );
  await ready(page);
  await expect(action(page, "resume")).toHaveCount(0);
  await page.goto("/#review");
  await expect(page.locator("main")).not.toContainText("evil");
});
test("import validates data and preserves higher prior scores", async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await finishSafe(page);
  await page.goto("/#settings");
  await page.locator("#import").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        results: { refund: { best: 30, attempts: 1, date: 1, last: "loss" } },
        reviews: {},
      }),
    ),
  });
  await expect(page.locator("#toast")).toContainText("已合并");
  let state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("unscam-v2")),
  );
  expect(state.results.refund.best).toBe(100);
  await page.locator("#import").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.locator("#toast")).toContainText("导入失败");
});
test("local coaching is labelled accurately and never stored as chat", async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await page.locator("#chat-details summary").click();
  await page.getByLabel("你的回复").fill("我想核实这件事");
  await page.locator("#chat-form button").click();
  await expect(page.locator(".chat-log")).toContainText("本地陪练提示");
  await expect(page.locator(".chat-log")).not.toContainText("AI 生成");
  const data = await page.evaluate(() => localStorage.getItem("unscam-v2"));
  expect(data || "").not.toContain("我想核实这件事");
});
test("AI contextual reply proposes an action but never advances without confirmation", async ({
  page,
}) => {
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        enabled: true,
        provider: "mock.example",
        model: "mock",
        requiresKey: true,
      },
    }),
  );
  let request;
  await page.route("**/api/chat", (r) => {
    request = r.request().postDataJSON();
    return r.fulfill({
      json: {
        reply: "你可以先核实。",
        suggestedActionId: "verify",
        followups: ["还能看什么证据？"],
      },
    });
  });
  await ready(page);
  await page.goto("/#settings");
  await page.locator("#api-key").fill("test-only-secret");
  await page.locator("#ai-enabled").check();
  await action(page, "save-settings").click();
  await page.goto("/#home");
  await start(page);
  await page.locator("#chat-details summary").click();
  await page.getByLabel("你的回复").fill("我想核实");
  await page.locator("#chat-form button").click();
  await expect(page.locator(".notice").first()).toContainText("AI 理解你想做");
  expect(request.scenario).toBe("refund");
  let state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("unscam-v2")),
  );
  expect(state.session.node).toBe("start");
  expect(JSON.stringify(state)).not.toContain("test-only-secret");
  await action(page, "choose:verify").first().click();
  await expect(page.locator(".chat-log")).toContainText("独立信息不一致");
  await page.goto("/#settings");
  await page.reload();
  await expect(page.locator("#api-key")).toHaveValue("");
});
test("AI failures leave authored choices usable", async ({ page }) => {
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: { enabled: true, provider: "mock.example", model: "mock" },
    }),
  );
  await page.route("**/api/chat", (r) =>
    r.fulfill({ status: 502, json: { error: "模拟服务失败" } }),
  );
  await ready(page);
  await page.goto("/#settings");
  await page.locator("#ai-enabled").check();
  await action(page, "save-settings").click();
  await page.goto("/#home");
  await start(page);
  await page.locator("#chat-details summary").click();
  await page.getByLabel("你的回复").fill("我想核实");
  await page.locator("#chat-form button").click();
  await expect(page.locator("#toast")).toContainText("模拟服务失败");
  await action(page, "choose:verify").click();
  await expect(page.locator(".chat-log")).toContainText("独立信息不一致");
});
test("PWA caches assets and runs an entire story offline", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator(".case")).toHaveCount(16);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".case")).toHaveCount(16);
  await start(page);
  await finishSafe(page);
  await expect(page.locator("main")).toContainText("守住了边界");
  await page.goto("/#library");
  await expect(page.locator(".knowledge article")).toHaveCount(12);
  await context.setOffline(false);
});
for (const width of [320, 390, 768, 1440])
  test(`layout is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    for (const route of [
      "home",
      "library",
      "review",
      "settings",
      "guide",
      "help",
    ]) {
      await page.goto("/#" + route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      expect(overflow, route).toBe(false);
    }
    await page.goto("/#home");
    await start(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
    if (width === 390) {
      await page.screenshot({
        path: "test-results/story-mobile.png",
        fullPage: true,
      });
      await page.goto("/#home");
      await page.screenshot({
        path: "test-results/home-mobile.png",
        fullPage: true,
      });
    }
    await page.locator("#font").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
  });
test("keyboard navigation, dialog close and visible mobile settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "设置", exact: true })
    .click();
  await expect(page.locator("#api-key")).toBeVisible();
  await page.goto("/#home");
  await start(page);
  await action(page, "clue:0").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
});
test("learning backup export has no dialogue or credentials", async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await finishSafe(page);
  await page.goto("/#settings");
  await page.locator("#api-key").fill("secret-not-exported");
  await action(page, "save-settings").click();
  const download = page.waitForEvent("download");
  await action(page, "export").click();
  const file = await download;
  const stream = await file.createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  expect(text).not.toContain("secret-not-exported");
  expect(JSON.parse(text).version).toBe(3);
  expect(JSON.parse(text).results.refund).toBeTruthy();
});

test("delayed configuration preserves unsaved credentials and keyboard focus", async ({
  page,
}) => {
  let releaseConfig;
  const configured = new Promise((resolve) => {
    releaseConfig = resolve;
  });
  await page.route("**/api/config", async (route) => {
    await configured;
    await route.fulfill({
      json: { enabled: true, provider: "mock.example", model: "mock" },
    });
  });
  await ready(page);
  await page.goto("/#settings");
  await page.locator("#api-key").fill("draft-key");
  await page.locator("#app-token").fill("draft-token");
  releaseConfig();
  await expect(page.locator("#ai-enabled")).toBeEnabled();
  await expect(page.locator("#api-key")).toHaveValue("draft-key");
  await expect(page.locator("#app-token")).toHaveValue("draft-token");
  await expect(page.locator("#app-token")).toBeFocused();
});
