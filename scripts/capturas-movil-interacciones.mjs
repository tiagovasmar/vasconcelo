// Interacciones móviles (360, 390 y 430 px): filtros, menú, búsqueda, galería con zoom, barra inferior de la ficha, carrito y teclado abierto.
//   BASE=http://localhost:3501 PREFIJO=despues node scripts/capturas-movil-interacciones.mjs
// Usa un servidor propio con una COPIA de la base. No se envía ningún mensaje real: nunca se pulsa «Continuar por WhatsApp».
// El teclado se emula reduciendo la altura del viewport al enfocar un campo (aproximación: no es un teclado real de teléfono).
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3501";
const P = process.env.PREFIJO ?? "despues";
const out = "docs/capturas/movil";
fs.mkdirSync(out, { recursive: true });
const resultados = [];
const check = (ok, texto) => { resultados.push(`${ok ? "OK  " : "FALLA"} ${texto}`); };
const browser = await chromium.launch();

for (const width of [360, 390, 430]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", baseURL: BASE });
  const page = await ctx.newPage();
  const errores = [];
  page.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errores.push(m.text()));
  const shot = (n, opts = {}) => page.screenshot({ path: `${out}/${P}-${width}-${n}.png`, ...opts });
  const listo = async () => { await page.waitForSelector("html[data-hydrated=true]"); await page.waitForTimeout(400); };
  const sinDesborde = async (n) => check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), `${width}: sin desborde horizontal en ${n}`);

  // --- menú ---
  await page.goto("/"); await listo();
  await page.locator("summary[aria-label=Menú]").click();
  await page.waitForTimeout(300);
  await shot("i-menu-abierto");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(!(await page.locator("details[open]").count()), `${width}: el menú se cierra con Escape`);

  // --- filtros y búsqueda ---
  await page.goto("/sellados"); await listo();
  await page.getByRole("button", { name: /Filtros y orden/ }).click();
  await page.waitForTimeout(300);
  await shot("i-filtros-abiertos");
  const campos = await page.evaluate(() => [...document.querySelectorAll("dialog[open] input:not([type=checkbox]), dialog[open] select")].map((e) => parseFloat(getComputedStyle(e).fontSize)));
  check(campos.length > 0 && campos.every((f) => f >= 16), `${width}: campos de filtros ≥ 16 px (${campos.join(",")})`);
  await page.locator("#f-q").fill("Ninja");
  await page.setViewportSize({ width, height: 420 }); // teclado abierto (emulado)
  await shot("i-filtros-con-teclado");
  const botonVisible = await page.getByRole("button", { name: "Aplicar" }).isVisible();
  check(botonVisible, `${width}: «Aplicar» alcanzable con el teclado abierto (scroll interno del diálogo)`);
  await page.setViewportSize({ width, height: 800 });
  await page.getByRole("button", { name: "Aplicar" }).click();
  await page.waitForURL(/q=Ninja/); await listo();
  await shot("i-busqueda-resultados");
  check((await page.locator("[data-testid=tarjeta]").count()) >= 1, `${width}: la búsqueda devuelve tarjetas`);
  await page.getByRole("button", { name: /Filtros y orden/ }).click();
  await page.getByRole("button", { name: "Cerrar filtros" }).click();
  check(!(await page.locator("dialog[open]").count()), `${width}: los filtros se cierran con el botón ×`);

  // --- tarjetas: textos mínimos y acción junto al precio ---
  await page.goto("/sellados?formato=caja&idioma=ja"); await listo();
  const t = await page.evaluate(() => {
    const menores = [...document.querySelectorAll("[data-testid=tarjeta] *")].filter((e) => e.children.length === 0 && e.textContent.trim() && getComputedStyle(e).fontSize && parseFloat(getComputedStyle(e).fontSize) < 11 && e.offsetParent).map((e) => e.textContent.trim().slice(0, 30));
    const ver = [...document.querySelectorAll("[data-testid=tarjeta] a")].filter((a) => /Ver contenido/.test(a.textContent)).map((a) => Math.round(a.getBoundingClientRect().height));
    return { menores, ver };
  });
  check(t.menores.filter((x) => !/^\d+ \/|BAJO|Bajo/.test(x)).length === 0, `${width}: sin texto menor a 11 px en tarjetas (${t.menores.join("|")})`);
  check(t.ver.every((h) => h < 36), `${width}: «Ver contenido ↗» en una sola línea (alturas ${[...new Set(t.ver)].join(",")})`);
  await sinDesborde("catálogo");
  await shot("i-catalogo-primera-pantalla");

  // --- fichas: disponible, bajo stock, sin stock, título largo ---
  for (const [n, slug] of [["disponible", "abyss-eye-sobre"], ["bajo-stock", "storm-emeralda-caja"], ["sin-stock", "ninja-spinner-caja"], ["titulo-largo", "zh-taijing-shengju-caja"]]) {
    await page.goto(`/productos/${slug}`); await listo();
    await shot(`i-ficha-${n}`);
    await sinDesborde(`ficha ${n}`);
    await page.evaluate(() => window.scrollTo(0, 1800)); await page.waitForTimeout(500);
    await shot(`i-ficha-${n}-scroll`);
    const barra = page.getByTestId("barra-compra");
    check(await barra.count() === 1 && (await barra.isVisible()), `${width}: ficha ${n}: barra inferior visible al bajar`);
    const caja = (await barra.count()) ? await barra.boundingBox() : null;
    check(!!caja && caja.y + caja.height <= 800 + 1 && caja.width <= width, `${width}: ficha ${n}: la barra entra en pantalla`);
    if (n === "sin-stock" || n === "titulo-largo") check(/Consultar encargo/.test(await barra.innerText()) && /antes de cualquier seña/.test(await barra.innerText()), `${width}: ficha ${n}: la barra solo ofrece consultar y avisa que no hay seña antes de confirmar`);
    else check(/\$\s*\d/.test(await barra.innerText()) && /Agregar/.test(await barra.innerText()), `${width}: ficha ${n}: la barra muestra precio y «Agregar»`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
  }
  // cantidad compartida entre la barra y el bloque principal
  await page.goto("/productos/abyss-eye-sobre"); await listo();
  await page.evaluate(() => window.scrollTo(0, 1800)); await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Subir cantidad" }).click();
  check((await page.getByTestId("barra-compra").locator("output").innerText()) === "2", `${width}: la barra sube la cantidad`);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  check((await page.getByRole("group", { name: "Cantidad", exact: true }).locator("output").innerText()) === "2", `${width}: la cantidad se refleja en el bloque principal`);
  await page.evaluate(() => window.scrollTo(0, 1800)); await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Sumar 2 al pedido/ }).click();
  await page.waitForTimeout(300);
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("tienda-carrito-v1")).items.map((i) => [i.productId, i.quantity]));
  check(JSON.stringify(guardado) === JSON.stringify([["abyss-eye-sobre", 2]]), `${width}: «Sumar 2» agrega 2 unidades (${JSON.stringify(guardado)})`);

  // --- galería: miniatura, imagen principal y zoom de las cuatro cajas transparentes ---
  for (const slug of ["ninja-spinner-caja", "nihil-zero-caja", "mega-symphonia-caja", "glory-of-team-rocket-caja"]) {
    await page.goto(`/productos/${slug}`); await listo();
    const imgs = await page.evaluate(() => [...document.querySelectorAll("main img")].filter((i) => /closed/.test(decodeURIComponent(i.currentSrc || i.src))).map((i) => ({ src: decodeURIComponent(i.currentSrc || i.src), ok: i.complete && i.naturalWidth > 0 })));
    check(imgs.length >= 1 && imgs.every((i) => i.ok), `${width}: ${slug}: foto principal y miniatura cargan (${imgs.length} <img> closed)`);
    const crudo = await page.evaluate(() => [...document.querySelectorAll("main img")].map((i) => i.getAttribute("src") ?? "").filter((s) => /closed/.test(s)));
    check(crudo.every((s) => /closed-v\d/.test(decodeURIComponent(s))), `${width}: ${slug}: las referencias usan el nombre nuevo (-v2)`);
    await page.getByRole("button", { name: "Ampliar", exact: true }).click();
    await page.waitForTimeout(500);
    const z = await page.evaluate(() => { const d = document.querySelector("dialog[open] img"); return d ? { ok: d.complete && d.naturalWidth > 0, src: decodeURIComponent(d.currentSrc || d.src) } : null; });
    check(!!z && z.ok && /closed-v\d/.test(z.src), `${width}: ${slug}: el zoom muestra la foto nueva (${z?.src.split("/").pop().slice(0, 60)})`);
    if (slug === "ninja-spinner-caja") await shot("i-galeria-zoom");
    await page.keyboard.press("Escape");
  }

  // --- carrito con productos ---
  await page.goto("/carrito"); await listo();
  await page.evaluate(() => localStorage.setItem("tienda-carrito-v1", JSON.stringify({ items: [{ productId: "storm-caja", quantity: 1, priceMinor: 279000, mode: "buy" }, { productId: "abyss-eye-sobre", quantity: 2, priceMinor: 12400, mode: "buy" }, { productId: "ninja-spinner-caja", quantity: 1, priceMinor: 0, mode: "encargo" }], delivery: { method: "andreani", locality: "", province: "", postalCode: "", pickupPoint: "" }, payment: "coordinar", contactName: "" })));
  await page.reload(); await listo();
  await page.waitForTimeout(1500);
  await shot("i-carrito-arriba");
  await sinDesborde("carrito");
  const barraC = page.getByTestId("barra-carrito");
  check(await barraC.isVisible(), `${width}: carrito: barra inferior con subtotal y próximo paso visible`);
  check(await page.getByTestId("proximo-paso").isVisible(), `${width}: carrito: aviso «Siguiente» visible tras la lista`);
  await page.getByRole("button", { name: "Ver resumen y continuar" }).click();
  await page.waitForTimeout(800);
  await shot("i-carrito-resumen");
  check(await page.evaluate(() => { const r = document.getElementById("resumen-title").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), `${width}: carrito: la barra lleva al resumen`);
  check(!(await barraC.count()), `${width}: carrito: la barra se oculta cuando el resumen ya se ve`);
  // teclado abierto: la barra no debe tapar el campo
  await page.locator("#locality").scrollIntoViewIfNeeded();
  await page.locator("#locality").focus();
  await page.setViewportSize({ width, height: 440 });
  await page.waitForTimeout(400);
  check(!(await barraC.count()), `${width}: carrito: con un campo enfocado (teclado abierto) no hay barra fija`);
  await page.locator("#locality").scrollIntoViewIfNeeded();
  await shot("i-carrito-teclado");
  const fs16 = await page.evaluate(() => [...document.querySelectorAll("#entrega input:not([type=radio]), #entrega select")].map((e) => parseFloat(getComputedStyle(e).fontSize)));
  check(fs16.length > 0 && fs16.every((f) => f >= 16), `${width}: carrito: campos de entrega ≥ 16 px (${fs16.join(",")})`);
  await page.setViewportSize({ width, height: 800 });
  // validación existente: sin completar los datos no se avanza (no se pulsa WhatsApp: el botón queda para continuar solo con datos válidos)
  const cont = page.getByRole("button", { name: /Continuar por WhatsApp|Consultar por encargo por WhatsApp/ });
  check(await cont.count() === 1, `${width}: carrito: existe un único botón de continuar (no se pulsó)`);
  check(errores.length === 0, `${width}: sin errores de consola (${errores.join(" | ")})`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/interacciones-${P}.txt`, resultados.join("\n") + "\n");
console.log(resultados.join("\n"));
if (resultados.some((r) => r.startsWith("FALLA"))) process.exit(1);
