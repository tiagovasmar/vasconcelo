import type { NextConfig } from "next";

// URLs de los antiguos productos y expansiones de DEMOSTRACIÓN (ya no forman parte del catálogo comercial). Si alguien las
// tenía guardadas, se lo lleva al catálogo en vez de a un 404. Storm Emeralda conserva sus URLs: /expansiones/storm-emeralda,
// /productos/storm-emeralda-caja y /productos/storm-emeralda-sobre. No se aplican con el catálogo de prueba (solo pruebas).
const antiguasDemo = {
  productos: ["storm-emeralda-pack-5-sobres", "set-de-ejemplo-sobre", "set-de-ejemplo-caja", "pack-mixto-de-ejemplo", "set-parcial-de-ejemplo-sobre", "set-parcial-de-ejemplo-bundle"],
  expansiones: ["set-de-ejemplo", "set-parcial-de-ejemplo"],
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Permite correr varias instancias (p. ej. pruebas con y sin WhatsApp configurado) sin pisar la carpeta de build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // `sharp` y `postgres` se cargan desde node_modules en el servidor (no se empaquetan). `better-sqlite3` ya no se usa en el sitio (solo en la herramienta de migración).
  serverExternalPackages: ["sharp", "postgres"],
  // Calidades permitidas del optimizador: 75 (por defecto) y 60 para las FOTOS opacas (de proveedor) de la ficha, que pesan mucho más que el arte con
  // transparencia (medido: la portada de una ficha con foto de proveedor tardaba ~2 s más en 3G).
  images: { qualities: [60, 75] },
  async redirects() {
    if (process.env.CATALOG_FIXTURE === "demo") return [];
    return [
      ...antiguasDemo.productos.map((slug) => ({ source: `/productos/${slug}`, destination: "/sellados", permanent: false })),
      ...antiguasDemo.expansiones.map((slug) => ({ source: `/expansiones/${slug}`, destination: "/expansiones", permanent: false })),
    ];
  },
};

export default nextConfig;
