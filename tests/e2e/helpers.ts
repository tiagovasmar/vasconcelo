import type { Page } from "@playwright/test";

/**
 * Navega y espera a que la página esté lista de verdad: documento cargado y React hidratado (`data-hydrated`),
 * es decir, los botones ya responden. Es una condición observable de la aplicación, no una espera por tiempo.
 */
export async function go(page: Page, url: string) {
  const response = await page.goto(url);
  await page.locator("html[data-hydrated='true']").waitFor();
  return response;
}
