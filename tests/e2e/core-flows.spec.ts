import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ARTIFACT_DIR =
  "C:/Users/lokes/.gemini/antigravity/brain/14028987-ab6a-4ede-9697-725770ca7e56/scratch";

test.describe("Shortly Core E2E Flows", () => {
  test("landing page live shortener, dark mode toggle, and axe accessibility", async ({
    page,
    baseURL,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /short links built for speed/i })
    ).toBeVisible();

    // Axe accessibility audit on landing page
    const axeLanding = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const seriousOrCritical = axeLanding.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(seriousOrCritical).toEqual([]);

    // Dark mode toggle
    const themeBtn = page.getByRole("button", { name: /toggle theme/i });
    await themeBtn.click();
    await themeBtn.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await themeBtn.click(); // back to system

    // Guest live shortener
    const alias = `e2eguest${Date.now().toString(36).slice(-5)}`;
    await page.getByLabel("Destination URL").fill("https://example.com/e2e-guest");
    await page.getByLabel("Custom alias").fill(alias);
    await page.getByRole("button", { name: /shorten url/i }).click();

    await expect(
      page.getByRole("link", { name: `${baseURL}/${alias}` })
    ).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/landing-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // Verify security headers and OpenAPI docs page
    const homeHeadersRes = await page.request.get(`${baseURL}/`);
    expect(homeHeadersRes.headers()["x-content-type-options"]).toBe("nosniff");
    expect(homeHeadersRes.headers()["x-frame-options"]).toBe("DENY");
    expect(homeHeadersRes.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

    await page.goto("/docs");
    await expect(
      page.getByRole("heading", { level: 1, name: /Shortly/i })
    ).toBeVisible();
    await expect(page.getByText("/api/urls").first()).toBeVisible();

    // Bookmarklet ?url= prefill on landing
    await page.goto("/?url=https%3A%2F%2Fexample.com%2Fbookmarklet-test");
    await expect(page.getByLabel("Destination URL")).toHaveValue(
      "https://example.com/bookmarklet-test"
    );

    expect(consoleErrors).toEqual([]);
  });

  test("full lifecycle: register -> create link -> fresh context redirect -> analytics -> edit alias -> disable (410) -> delete -> QR & password unlock", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    const uniq = `${Date.now().toString(36)}-${testInfo.project.name.slice(0, 3)}`;
    const email = `e2e-${uniq}@example.com`;
    const alias1 = `e2e-a-${uniq}`;
    const alias2 = `e2e-b-${uniq}`;

    // 1. Register
    await page.goto("/register");
    const nameInput = page.getByLabel("Full name");
    await nameInput.waitFor({ state: "visible" });
    await nameInput.click();
    await nameInput.fill("E2E Tester");
    await expect(nameInput).toHaveValue("E2E Tester");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel(/Password/).fill("E2EPassword123!");
    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Axe scan on dashboard
    const axeDash = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const dashViolations = axeDash.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(dashViolations).toEqual([]);

    // 2. Create link via modal
    await page.getByRole("button", { name: /new link/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Destination URL/i).fill("https://example.org/e2e-dest");
    await dialog.getByLabel(/Custom alias/i).fill(alias1);
    await dialog.getByRole("button", { name: /create short link/i }).click();

    await expect(
      page.getByRole("link", { name: `/${alias1}` }).and(page.locator(":visible")).first()
    ).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/dashboard-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // 3. Open in a fresh browser context -> assert redirect Location matches exact original URL
    const freshContext = await browser.newContext();
    const redirectRes = await freshContext.request.get(`${baseURL}/${alias1}`, {
      maxRedirects: 0,
    });
    expect(redirectRes.status()).toBe(302);
    expect(redirectRes.headers()["location"]).toBe("https://example.org/e2e-dest");
    await freshContext.close();

    // Wait for Redis batch click flusher (1s interval) before checking link detail analytics
    await page.waitForTimeout(1400);
    await page
      .getByRole("link", { name: `/${alias1}` })
      .and(page.locator(":visible"))
      .first()
      .click();
    await page.waitForURL("**/dashboard/links/**");
    await expect(page.getByText("Total Clicks")).toBeVisible();
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Total Clicks").locator("..")).toContainText("1");
    }).toPass({ timeout: 5000 });
    await expect(page.getByText("QR Code Studio")).toBeVisible();

    // Verify QR PNG & SVG endpoints return valid images
    const pngHref = await page.locator("a[download$='-qr.png']").getAttribute("href");
    expect(pngHref).toBeTruthy();
    const qrPngRes = await page.request.get(`${baseURL}${pngHref}`);
    expect(qrPngRes.status()).toBe(200);
    expect(qrPngRes.headers()["content-type"]).toContain("image/png");

    // 4. Edit alias -> old alias 404s, new alias 302s
    await page.getByLabel(/Custom alias/i).fill(alias2);
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByRole("heading", { name: `/${alias2}` })).toBeVisible();

    const oldRes = await page.request.get(`${baseURL}/${alias1}`, {
      maxRedirects: 0,
    });
    expect(oldRes.status()).toBe(404);

    const newRes = await page.request.get(`${baseURL}/${alias2}`, {
      maxRedirects: 0,
    });
    expect(newRes.status()).toBe(302);

    // 5. Disable link -> 410 Gone
    await page.getByLabel("Link is active").uncheck();
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(300);

    const disabledRes = await page.request.get(`${baseURL}/${alias2}`, {
      maxRedirects: 0,
    });
    expect(disabledRes.status()).toBe(410);

    // 6. Password-protected link unlock flow
    await page.getByLabel("Link is active").check();
    await page.getByLabel(/Replace password|Password protection/i).fill("Secret123");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(300);

    const pwContext = await browser.newContext();
    await pwContext.route("https://example.org/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Destination Reached</h1></body></html>",
      })
    );
    const pwPage = await pwContext.newPage();
    await pwPage.goto(`${baseURL}/${alias2}`);
    await pwPage.waitForURL(`**/unlock/${alias2}`);
    const pwInput = pwPage.getByLabel("Link password");
    await pwInput.waitFor({ state: "visible" });
    await pwInput.click();
    await pwInput.fill("Secret123");
    await expect(pwInput).toHaveValue("Secret123");
    await pwPage.getByRole("button", { name: /unlock & continue/i }).click();
    await pwPage.waitForURL("https://example.org/e2e-dest", {
      waitUntil: "commit",
    });
    expect(pwPage.url()).toBe("https://example.org/e2e-dest");
    await pwContext.close();

    // 7. Settings page & Admin RBAC check (regular user redirected from /admin)
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account Settings" })).toBeVisible();
    await page.goto("/admin");
    await page.waitForURL("**/dashboard");

    // 8. Delete link -> verify gone (404)
    await page
      .getByRole("link", { name: `/${alias2}` })
      .and(page.locator(":visible"))
      .first()
      .click();
    await page.waitForURL("**/dashboard/links/**");
    await page.getByRole("button", { name: /delete link/i }).click();
    await page.waitForURL("**/dashboard");

    const goneRes = await page.request.get(`${baseURL}/${alias2}`, {
      maxRedirects: 0,
    });
    expect(goneRes.status()).toBe(404);
  });
});
