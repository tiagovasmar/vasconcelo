// Calienta los servidores de desarrollo antes de las pruebas: el modo desarrollo compila cada ruta la primera vez que
// se pide, y con varios navegadores en paralelo esa compilación en frío podía agotar la espera de una prueba que no tenía
// nada que ver. Acá se espera (con tope generoso) a que cada ruta responda; después, las pruebas ya no dependen de eso.
const routes = [
  "/", "/sellados", "/expansiones", "/expansiones/storm-emeralda", "/productos/storm-emeralda-sobre", "/productos/no-existe",
  "/carrito", "/carrito/consulta/TT-AAAAAAAA", "/como-comprar", "/privacidad", "/condiciones",
  "/cuenta", "/cuenta/ingresar", "/cuenta/registro", "/cuenta/recuperar", "/cuenta/restablecer", "/cuenta/verificado",
  "/cuenta/favoritos", "/cuenta/consultas", "/cuenta/perfil", "/api/account", "/api/health",
];
// El servidor con el catálogo real (:3102) tiene otras fichas.
const rutasReales = [...routes, "/productos/storm-emeralda-caja", "/productos/black-bolt-caja", "/productos/30th-celebration-sobre", "/expansiones/black-bolt", "/expansiones/30th-celebration"];

export default async function globalSetup() {
  const tags: Record<string, number> = { demo: 3100, live: 3101, real: 3102, admin: 3103 };
  const only = process.env.E2E_SERVERS?.split(",").map((t) => tags[t]).filter(Boolean);
  for (const port of only?.length ? only : [3100, 3101, 3102, 3103]) {
    for (const route of port === 3102 ? rutasReales : routes) {
      const res = await fetch(`http://localhost:${port}${route}`, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
      if (res.status >= 500) throw new Error(`El servidor :${port} respondió ${res.status} en ${route} durante el calentamiento`);
    }
  }
}
