// Prueba de humo contra un servidor ya iniciado (desarrollo o producción): páginas, API de carrito y consulta de invitado.
//   BASE=http://localhost:3000 node scripts/smoke.mjs      (por defecto http://localhost:3000)
// Crea UNA consulta de prueba en la base del servidor que apuntes (usá una base de desarrollo, no la de producción).
const BASE = process.env.BASE ?? "http://localhost:3000";
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); console.log(`${cond ? "✔" : "✘"} ${msg}`); };

const pages = ["/", "/sellados", "/sellados?q=caja", "/expansiones", "/expansiones/storm-emeralda", "/productos/storm-emeralda-caja", "/carrito", "/como-comprar", "/privacidad", "/condiciones", "/cuenta", "/cuenta/ingresar"];
for (const p of pages) {
  const r = await fetch(BASE + p, { redirect: "manual" });
  ok(r.status === 200, `GET ${p} → ${r.status}`);
}
ok((await fetch(BASE + "/productos/no-existe")).status === 404, "GET /productos/no-existe → 404");
const health = await fetch(BASE + "/api/health");
ok(health.status === 200 && (await health.json()).database === "ok", "GET /api/health → base accesible");
for (const p of ["/cuenta/consultas", "/cuenta/favoritos", "/cuenta/perfil"]) {
  const r = await fetch(BASE + p, { redirect: "manual" });
  ok([307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes("/cuenta/ingresar"), `GET ${p} sin sesión → redirige al ingreso`);
}

const headers = { "Content-Type": "application/json", Origin: BASE };
const v = await (await fetch(BASE + "/api/cart/validate", { method: "POST", headers, body: JSON.stringify({ items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 1 }] }) })).json();
// Dos modos: catálogo REAL (precios y stock pendientes: nada se puede consultar con importe) o catálogo de PRUEBA (CATALOG_FIXTURE=demo).
const real = v.lines?.[0]?.status === "pending_commercial";
console.log(real ? "Modo: catálogo real (precios pendientes)" : "Modo: catálogo de prueba");
if (real) ok(v.lines[0].unitPriceMinor === null, "validar carrito: SKU pendiente sin precio inventado");
else ok(v.lines?.[0]?.status === "price_changed" && v.lines[0].unitPriceMinor === 950000, "validar carrito: el precio vigente sale del servidor");

// la cookie de sesión de invitado se crea al entrar al carrito
const cart = await fetch(BASE + "/carrito");
const cookie = (cart.headers.get("set-cookie") ?? "").split(";")[0];
ok(cookie.startsWith("consulta_sid="), "cookie de sesión de invitado al entrar al carrito");
const body = { items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 950000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", idempotencyKey: `humo-${Date.now()}-${Math.random().toString(36).slice(2)}aaaa` };
if (real) {
  const rej = await fetch(BASE + "/api/inquiries", { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify(body) });
  ok(rej.status === 409 && (await rej.json()).error?.code === "pending_commercial", "SKU pendiente: el servidor rechaza la consulta con importe (409 pending_commercial)");
  console.log(problems.length ? `\n${problems.length} problema(s).` : "\nPrueba de humo OK.");
  process.exit(problems.length ? 1 : 0);
}
const first = await fetch(BASE + "/api/inquiries", { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify(body) });
const created = await first.json();
ok(first.status === 201 && /^TT-[A-Z2-9]{8}$/.test(created.reference ?? ""), `crear consulta → ${first.status} ${created.reference ?? ""}`);
ok(created.subtotalMinor === 1900000 && (created.message ?? "").includes("Envío: a coordinar"), "subtotal $19.000 y envío «a coordinar»");
const again = await fetch(BASE + "/api/inquiries", { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify(body) });
ok(again.status === 200 && (await again.json()).reference === created.reference, "repetir con la misma clave devuelve la misma consulta");
const page = await fetch(`${BASE}/carrito/consulta/${created.reference}`, { headers: { Cookie: cookie } });
ok(page.status === 200, "la consulta se abre con su sesión de invitado");
const other = await fetch(`${BASE}/carrito/consulta/${created.reference}`);
ok(other.status === 404, "sin la sesión de invitado, la referencia sola no abre la consulta (404)");

console.log(problems.length ? `\n${problems.length} problema(s).` : "\nPrueba de humo OK.");
process.exit(problems.length ? 1 : 0);
