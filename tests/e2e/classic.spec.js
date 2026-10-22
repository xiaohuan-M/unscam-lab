import { test, expect } from "@playwright/test";
const frame = (page) => page.frameLocator("iframe[data-classic-chat]");
const game = (page, action) => frame(page).locator(`[data-game="${action}"]`);
async function scene(page, id, { instant = true } = {}) {
  await page.goto("/");
  await expect(game(page, "start:challenge")).toBeVisible();
  await frame(page).locator(".scene-picker summary").click();
  await game(page, "scene:" + id).click();
  await game(page, "open-scene").click();
  if (instant) await frame(page).getByLabel("消息节奏").selectOption("instant");
  await expect(frame(page).locator("#chatMsgs")).toBeVisible();
}
async function choice(page, id) {
  await game(page, "choice:" + id).click();
}
const saved = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("unscam-v2")).classic.current,
  );

test("original WeChat is the default game and natural messages can be skipped without duplicating them", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await scene(page, 1, { instant: false });
  await expect(frame(page).getByLabel("对方正在输入")).toBeVisible();
  await expect(game(page, "choice:verify")).toBeDisabled();
  await game(page, "skip").click();
  await expect(game(page, "choice:verify")).toBeEnabled();
  const initial = await frame(page).locator(".message-entry").count();
  expect(initial).toBeGreaterThan(2);
  await choice(page, "reply-1");
  await game(page, "skip").click();
  await expect(frame(page).locator(".wx-row.me")).toHaveCount(1);
  await choice(page, "stop");
  await game(page, "skip").click();
  await choice(page, "continue");
  await expect(
    frame(page).getByText("回看刚才的聊天", { exact: true }),
  ).toBeVisible();
  await frame(page).locator(".transfer-question summary").click();
  await game(page, "answer:0:0").click();
  await expect(
    frame(page).locator(".transfer-question button").first(),
  ).toBeDisabled();
  expect((await saved(page)).actions).toEqual(["reply-1", "stop", "continue"]);
});

test("zero-cost exposure stays in the original conversation and resumes after reload", async ({
  page,
}) => {
  await scene(page, 9);
  await choice(page, "reply-0");
  await choice(page, "act-0");
  await expect(game(page, "choice:step-1")).toBeVisible();
  await expect(frame(page).locator(".game-wallet")).toContainText("¥10,000");
  const before = await saved(page);
  await game(page, "pause").click();
  await page.reload();
  await game(page, "resume").click();
  expect((await saved(page)).actions).toEqual(before.actions);
  await expect(game(page, "choice:step-1")).toBeVisible();
  await choice(page, "step-1");
  await choice(page, "continue");
  await expect(frame(page).locator(".review-effects")).toContainText("账户");
  await expect(frame(page).locator(".review-effects")).toContainText("¥0");
});

test("paid choices create one transfer and stopping retains the loss in review", async ({
  page,
}) => {
  await scene(page, 1);
  await choice(page, "reply-0");
  await choice(page, "act-0");
  await game(page, "pay-confirm").click();
  await expect(frame(page).locator(".transfer-bubble")).toHaveCount(1);
  const amount = await frame(page)
    .locator(".transfer-bubble strong")
    .innerText();
  await choice(page, "step-1");
  await choice(page, "continue");
  await expect(frame(page).locator(".review-effects")).toContainText(amount);
  await expect(
    frame(page).getByText("中途停下了", { exact: true }),
  ).toBeVisible();
});

test("AI free replies stay inside WeChat and require explicit confirmation of canonical actions", async ({
  page,
}) => {
  let request;
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        enabled: true,
        requiresKey: true,
        model: "mock",
        provider: "mock",
      },
    }),
  );
  await page.route("**/api/chat", async (r) => {
    request = r.request();
    await r.fulfill({
      json: {
        reply: "那你先核实，我们稍后再聊。",
        suggestedActionId: "verify",
        generated: true,
      },
    });
  });
  await page.goto("/#settings");
  await page.locator("#api-key").fill("test-only-secret");
  await page.locator("#ai-enabled").check();
  await page.locator('[data-action="save-settings"]').click();
  await page.getByRole("link", { name: "微信模拟", exact: true }).click();
  await frame(page).locator(".scene-picker summary").click();
  await game(page, "scene:1").click();
  await game(page, "open-scene").click();
  await frame(page).getByLabel("消息节奏").selectOption("instant");
  await frame(page).getByLabel("自己回复一句").fill("我先自己核实一下再说");
  await frame(page).getByRole("button", { name: "发送", exact: true }).click();
  await expect(frame(page).locator(".ai-entry")).toContainText("稍后再聊");
  await expect(frame(page).locator(".intent-confirm")).toBeVisible();
  expect((await saved(page)).actions).toEqual([]);
  expect(request.postDataJSON().scenario).toBe("classic:1");
  expect(request.headers()["x-llm-key"]).toBe("test-only-secret");
  const raw = await page.evaluate(() => localStorage.getItem("unscam-v2"));
  expect(raw).not.toContain("test-only-secret");
  expect(raw).not.toContain("我先自己核实");
  await frame(page).locator(".intent-confirm button").click();
  expect((await saved(page)).actions).toEqual(["verify"]);
});

test("small, tablet, desktop and landscape layouts keep the composer and reply buttons reachable", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await scene(page, 1);
  await choice(page, "reply-1");
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 1000],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const gameFrame = page
      .frames()
      .find((f) => f.url().includes("/classic/chat.html"));
    const geometry = await gameFrame.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      chat: document.querySelector("#chatMsgs").getBoundingClientRect().height,
      bar: document.querySelector("#chatBar").getBoundingClientRect().bottom,
      height: innerHeight,
    }));
    expect(geometry.overflow).toBe(false);
    expect(geometry.chat).toBeGreaterThan(70);
    expect(geometry.bar).toBeLessThanOrEqual(geometry.height + 1);
    await expect(frame(page).getByLabel("自己回复一句")).toBeVisible();
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-results/wechat-${width === 390 ? "mobile" : "desktop"}.png`,
        animations: "disabled",
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "切换明暗主题", exact: true }).click();
  await expect(game(page, "choice:stop")).toBeVisible();
  await page.getByRole("button", { name: "切换明暗主题", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await game(page, "menu").click();
  await game(page, "theme").click();
  await game(page, "font").click();
  await frame(page).getByRole("button", { name: "关闭", exact: true }).click();
  await expect(frame(page).locator("html")).toHaveClass(/dark/);
  await expect(frame(page).locator("html")).toHaveClass(/large/);
  await page.screenshot({
    path: "test-results/wechat-dark-large.png",
    animations: "disabled",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("the original game remains playable offline and includes all sixteen scene entries", async ({
  page,
  context,
}) => {
  await scene(page, 15);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(frame(page).locator(".scene-list button")).toHaveCount(16);
  await game(page, "resume").click();
  await game(page, "open-scene").click();
  await choice(page, "verify");
  await choice(page, "continue");
  await expect(frame(page).locator(".kpis")).toContainText("¥10,000");
  await context.setOffline(false);
});

test("chapter arrivals preserve progress and only open on an explicit action", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(game(page, "start:warmup")).toBeVisible();
  await page.screenshot({
    path: "test-results/game-start.png",
    fullPage: true,
    animations: "disabled",
  });
  await game(page, "start:warmup").click();
  await expect(frame(page).locator(".chapter-count strong")).toHaveText(
    "01 / 04",
  );
  await expect(frame(page).locator("#chatMsgs")).toHaveCount(0);
  await expect(game(page, "sound")).toHaveAttribute("aria-pressed", "false");
  expect((await saved(page)).actions).toEqual([]);
  await page.screenshot({
    path: "test-results/game-incoming.png",
    fullPage: true,
    animations: "disabled",
  });
  await game(page, "pause").click();
  await page.reload();
  await game(page, "resume").click();
  expect((await saved(page)).actions).toEqual([]);
  await game(page, "open-scene").click();
  await choice(page, "verify");
  await expect(frame(page).locator(".round-receipt")).toBeVisible();
  await choice(page, "continue");
  await expect(frame(page).locator(".chapter-count strong")).toHaveText(
    "02 / 04",
  );
  expect((await saved(page)).actions).toEqual(["verify", "continue"]);
  await game(page, "open-scene").click();
  await expect(frame(page).locator(".round-track .done")).toHaveCount(1);
});

test("simulated payment can be cancelled, escaped and reloaded without spending", async ({
  page,
}) => {
  await scene(page, 1);
  await choice(page, "reply-0");
  const before = (await saved(page)).actions;
  await choice(page, "act-0");
  await expect(
    frame(page).getByRole("dialog", { name: "确认模拟转账" }),
  ).toBeVisible();
  expect((await saved(page)).actions).toEqual(before);
  await expect(frame(page).locator(".game-wallet")).toContainText("¥10,000");
  await page.screenshot({
    path: "test-results/game-payment.png",
    animations: "disabled",
  });
  await game(page, "pay-cancel").click();
  expect((await saved(page)).actions).toEqual(before);
  await choice(page, "act-0");
  await page.keyboard.press("Escape");
  await expect(frame(page).getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).actions).toEqual(before);
  await choice(page, "act-0");
  await page.reload();
  await game(page, "resume").click();
  expect((await saved(page)).actions).toEqual(before);
  await choice(page, "act-0");
  await game(page, "pay-confirm").click({ clickCount: 2 });
  await expect(frame(page).locator(".transfer-bubble")).toHaveCount(1);
  expect((await saved(page)).actions).toEqual([...before, "act-0"]);
  await choice(page, "step-1");
  await choice(page, "continue");
  await expect(frame(page).locator(".earned-badges")).toContainText("及时刹车");
  await expect(frame(page).locator(".earned-badges")).toContainText(
    "完成这一程",
  );
  await page.screenshot({
    path: "test-results/game-review.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("keyboard shortcuts respect text input and reduced motion; audio is opt-in", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await scene(page, 1, { instant: false });
  await expect(game(page, "choice:verify")).toBeEnabled();
  await expect(frame(page).getByLabel("对方正在输入")).toHaveCount(0);
  await expect(game(page, "sound")).toHaveAttribute("aria-pressed", "false");
  await game(page, "sound").click();
  await expect(game(page, "sound")).toHaveAttribute("aria-pressed", "true");
  await game(page, "sound").click();
  await expect(game(page, "sound")).toHaveAttribute("aria-pressed", "false");
  await frame(page).getByLabel("自己回复一句").fill("我想问");
  await frame(page).getByLabel("自己回复一句").press("1");
  expect((await saved(page)).actions).toEqual([]);
  await expect(frame(page).getByLabel("自己回复一句")).toHaveValue("我想问1");
  const first = await frame(page)
    .locator(".reply-options button")
    .first()
    .getAttribute("data-choice");
  await frame(page).locator("#chatMsgs").press("1");
  expect((await saved(page)).actions).toEqual([first]);
});
