import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

let server, address;
const root = path.resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/unscam-lab/")) {
      res.writeHead(404).end();
      return;
    }
    const file = path.resolve(
      root,
      pathname.slice("/unscam-lab/".length) || "index.html",
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const data = await readFile(file);
      res
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] || "application/octet-stream",
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  address = `http://127.0.0.1:${server.address().port}/unscam-lab/`;
});
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("static subpath installs its own cache and completes a story without API or network", async ({
  page,
  context,
}) => {
  await page.goto(address);
  await expect(page.locator(".case")).toHaveCount(16);
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  expect(scope).toBe(address);
  await page.goto(address + "#settings");
  await expect(page.locator("#ai-enabled")).toBeDisabled();
  await page.reload();
  await expect(page.locator("#api-key")).toBeVisible();
  await context.setOffline(true);
  await page.goto(address);
  await expect(page.locator(".case")).toHaveCount(16);
  await page.locator('[data-action="start:refund"]').last().click();
  await page.locator('[data-action="choose:verify"]').click();
  await page.locator('[data-action="choose:close"]').click();
  await expect(page.locator("main h1")).toContainText("守住了边界");
  await context.setOffline(false);
});
