import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { go } from "./helpers";

const GROUP = "https://chat.whatsapp.com/J36bbxgvyLvAP1G54N5R5x";
const OUT = "docs/capturas/grupo-home";

for (const width of [360, 390, 430, 1440]) {
  test(`grupo del inicio a ${width}px: visible, sin desborde y abre solo al pulsar`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    const externalRequests: string[] = [];
    // El destino se intercepta: no se contacta WhatsApp ni se entra al grupo durante las pruebas.
    await context.route("https://chat.whatsapp.com/**", async (route) => {
      externalRequests.push(route.request().url());
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><title>Destino de prueba</title><h1>Invitación interceptada</h1>" });
    });
    await go(page, "/");
    const block = page.getByTestId("grupo-whatsapp");
    const link = block.getByRole("link", { name: /Unirme al grupo de WhatsApp/ });
    await expect(block.getByRole("heading", { name: "Sumate al grupo de Vasconcelo" })).toBeVisible();
    await expect(block).toContainText("Enterate de ofertas limitadas, sorteos, cupones y novedades.");
    await expect(link).toHaveAttribute("href", GROUP);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    await block.scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    expect(externalRequests).toEqual([]);
    expect(context.pages()).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const blockBox = await block.boundingBox();
    expect(blockBox!.height).toBeLessThanOrEqual(width < 1024 ? 250 : 150);
    const stockBox = await page.locator('[data-testid="home-en-stock"], [data-testid="home-en-stock-vacio"]').boundingBox();
    expect(blockBox!.y + blockBox!.height).toBeLessThanOrEqual(stockBox!.y + 1);
    expect(await block.evaluate((el) => getComputedStyle(el).position)).toBe("static");
    const a11y = await new AxeBuilder({ page }).include('[data-testid="grupo-whatsapp"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(a11y.violations.map((v) => v.id)).toEqual([]);
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/inicio-${width}.png` });
    await block.screenshot({ path: `${OUT}/grupo-${width}.png` });
    const popupReady = page.waitForEvent("popup");
    await link.click();
    const popup = await popupReady;
    await expect(popup).toHaveURL(GROUP);
    await expect(popup.getByRole("heading", { name: "Invitación interceptada" })).toBeVisible();
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    expect(externalRequests).toEqual([GROUP]);
    expect(new URL(page.url()).pathname).toBe("/");
    await popup.close();
  });
}

test("la invitación también funciona sin JavaScript", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    await ctx.route("https://chat.whatsapp.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><title>Grupo interceptado sin JavaScript</title>Destino ficticio" }));
    const page = await ctx.newPage();
    await page.goto("/");
    const link = page.getByTestId("unirse-grupo-whatsapp");
    await expect(link).toHaveAttribute("href", GROUP);
    const popupReady = page.waitForEvent("popup");
    await link.click();
    const popup = await popupReady;
    await expect(popup).toHaveURL(GROUP);
    expect(new URL(page.url()).pathname).toBe("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  } finally { await ctx.close(); }
});
