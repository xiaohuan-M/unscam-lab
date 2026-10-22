import { test, expect } from "@playwright/test";

const action = (page, name) => page.locator(`[data-action="${name}"]`);

test("phone inbox resumes the selected conversation without replacing its history", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "模拟手机收件箱" }),
  ).toBeVisible();
  await expect(page.locator(".message-row")).toHaveCount(16);
  await action(page, "filter:进阶").click();
  const advanced = await page.locator(".message-row").count();
  expect(advanced).toBeGreaterThan(0);
  expect(advanced).toBeLessThan(16);
  await action(page, "filter:全部").click();
  await page.locator('.message-row[data-action="start:refund"]').click();
  await action(page, "choose:ask").click();
  await expect(page.locator(".chat-log")).toContainText("理赔截图");
  await page
    .getByRole("link", { name: "保存并返回收件箱", exact: true })
    .click();
  await page.reload();
  const thread = page.locator('.message-row[data-action="start:refund"]');
  await expect(thread).toContainText("进行中");
  await thread.click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator(".chat-log")).toContainText("理赔截图");
  await expect(page.locator(".bubble.mine")).toHaveCount(1);
  await action(page, "conversation-tools").click();
  await expect(page).toHaveURL(/#play$/);
  await expect(page.locator("#conversation-tools")).toBeFocused();
  await expect(page.locator(".clue")).toHaveCount(2);
  await action(page, "choose:challenge").click();
  await expect(page.locator(".bubble.mine")).toHaveCount(2);
});

test("phone presentation stays readable in dark and large-text modes", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".message-row")).toHaveCount(16);
  await page.screenshot({
    path: "test-results/phone-inbox-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator('.message-row[data-action="start:refund"]').click();
  await action(page, "choose:ask").click();
  await page.screenshot({
    path: "test-results/phone-chat-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/phone-chat-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await action(page, "theme").click();
  await page.locator("#font").click();
  await page.locator("#chat-details summary").click();
  await page.getByLabel("你的回复").fill("我可以独立核实吗？");
  await page.locator("#chat-form button").click();
  await expect(page.locator(".chat-log")).toContainText("本地陪练提示");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/phone-chat-dark-large.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("link", { name: "保存并返回收件箱", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
  await expect(
    page.getByRole("link", { name: /打开原版聊天闯关/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
