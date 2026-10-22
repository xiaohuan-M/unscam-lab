import { test, expect } from "@playwright/test";
test("full article deep link, saved reading and selfcheck plan round trip", async ({
  page,
}) => {
  await page.goto("/#article:373");
  await expect(page.locator("main h1")).toContainText("酒店偷拍");
  await expect(page.locator(".article-body p")).not.toHaveCount(0);
  await expect(page.locator(".reader-references .report")).toHaveCount(4);
  await page.getByRole("button", { name: "标记读完", exact: true }).click();
  await page.getByRole("button", { name: "加入间隔复习", exact: true }).click();
  await page.goto("/#selfcheck");
  await page.locator('[name="check-0"][value="no"]').check();
  await page.locator('[name="check-1"][value="skip"]').check();
  await page.goto("/#selfcheck-plan");
  await expect(page.locator(".action-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".action-row")).toHaveCount(1);
  await page.getByRole("button", { name: "我已做到 ✓" }).click();
  await expect(page.locator(".action-row")).toHaveCount(0);
  await page.goto("/#learn");
  await expect(page.locator("main")).toContainText("已标记读完 1 / 373");
  await page.goto("/#settings");
  const pending = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const download = await pending;
  const stream = await download.createReadStream();
  let text = "";
  for await (const c of stream) text += c;
  const p = JSON.parse(text);
  expect(p.read["373"]).toBeTruthy();
  expect(p.selfcheck).toEqual({ 0: "yes", 1: "skip" });
});
test("documents, glossary, reports and download files are reachable", async ({
  page,
  request,
}) => {
  await page.goto("/#resources");
  await expect(page.locator(".download-card")).toHaveCount(5);
  const paths = await page
    .locator(".download-card")
    .evaluateAll((xs) => xs.map((x) => x.getAttribute("href")));
  for (const path of paths) {
    const r = await request.get("/" + path.replace(/^\.\//, ""));
    expect(r.status(), path).toBe(200);
    expect((await r.body()).byteLength).toBeGreaterThan(1000);
  }
  await page.getByRole("link", { name: /骗子不会催眠/ }).click();
  await expect(page.locator("#document-body")).toContainText("五板斧");
  await page.goto("/#glossary");
  await page.locator("#lc-term").fill("GOIP");
  await expect(page.locator("#term-results")).toContainText("GOIP");
  await page.goto("/#sources");
  await expect(page.locator("#report-results .report")).toHaveCount(120);
});
test("classic games load playable controls in isolated frames", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#classic:chat");
  const chat = page.frameLocator(".classic-frame");
  await expect(chat.locator("body")).toContainText("别被骗了");
  await expect(chat.locator("button").first()).toBeVisible();
  await page.goto("/#classic:logic");
  const logic = page.frameLocator(".classic-frame");
  await expect(logic.locator("#pageHome")).toContainText("0 / 12");
  await logic.getByRole("button", { name: /CH01-01/ }).click();
  await expect(logic.locator("#pagePlay")).toBeVisible();
  expect(errors).toEqual([]);
});
test("full reader, documents and both games remain available offline", async ({
  page,
  context,
}) => {
  await page.goto("/#learn");
  await page.evaluate(async () => await navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  for (const route of [
    "article:373",
    "document:24",
    "classic:chat",
    "classic:logic",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("main")).not.toContainText("基础资源还没加载好");
    if (route.startsWith("document"))
      await expect(page.locator("#document-body")).toContainText("五板斧");
  }
  await expect(
    page.frameLocator(".classic-frame").locator("#pageHome"),
  ).toContainText("0 / 12");
  await context.setOffline(false);
});
for (const width of [320, 390, 768, 1440])
  test(`learning content fits ${width}px and dark mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#learn");
    await page.getByRole("button", { name: "切换明暗主题" }).click();
    for (const route of [
      "learn",
      "library",
      "article:373",
      "selfcheck",
      "games",
      "glossary",
      "resources",
      "document:24",
    ]) {
      await page.goto("/#" + route);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        route,
      ).toBe(false);
    }
    await page.goto("/#learn");
    if (width === 390)
      await page.screenshot({
        path: "test-results/learning-mobile.png",
        fullPage: true,
      });
    if (width === 1440)
      await page.screenshot({
        path: "test-results/learning-desktop.png",
        fullPage: true,
      });
  });
test("a solved classic puzzle joins the unified backup and survives refresh", async ({
  page,
}) => {
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(
    await readFile("public/reference/game/murdoku-puzzles.json", "utf8"),
  );
  const level = data.levels[0];
  await page.goto("/#classic:logic");
  const f = page.frameLocator(".classic-frame");
  await f.getByRole("button", { name: /CH01-01/ }).click();
  for (const role of level.roles.filter(
    (r) => !level.given.some((g) => g.name === r.name),
  )) {
    await f
      .getByRole("button", { name: role.name + " · 选择人物", exact: true })
      .click();
    const p = level.sol[role.name];
    await f.locator(`.cell[data-r="${p.r}"][data-c="${p.c}"]`).click();
  }
  await f.getByRole("button", { name: "提交，锁定答案" }).click();
  await expect(f.getByRole("heading", {name:"✅ 结案",exact:true})).toBeVisible();
  await f.getByRole("button", {name:"最后一步：哪句话露了破绽"}).click();
  await f.locator(".pick").nth(level.pick.answer).click();
  await expect(f.locator("#pickWhy")).toContainText("正是这句");
  await page.goto("/#learn");
  await expect(page.locator("main")).toContainText("推理结案 1 / 12");
  await page.reload();
  await expect(page.locator("main")).toContainText("推理结案 1 / 12");
  await page.goto("/#settings");
  const pending = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const stream = await (await pending).createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  expect(JSON.parse(text).puzzles["ch01-01"].stars).toBe(3);
});
