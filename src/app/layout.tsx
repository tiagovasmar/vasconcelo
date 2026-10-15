import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { store } from "@/content/store";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/cart-drawer";
import { AccountProvider } from "@/components/account-provider";
import { HydrationMarker } from "@/components/hydration-marker";

// Fuentes locales (licencia OFL, paquetes @fontsource) servidas por Next con precarga y un «fallback» del mismo tamaño:
// evita el salto de diseño al cargarlas.
const anton = localFont({ src: "../../node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2", weight: "400", display: "swap", variable: "--font-anton", adjustFontFallback: "Arial" });
const figtree = localFont({ src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2", weight: "300 900", display: "swap", variable: "--font-figtree", adjustFontFallback: "Arial" });

export const metadata: Metadata = {
  title: { default: `${store.name} · ${store.descriptor}`, template: `%s · ${store.name}` },
  description:
    "Sobres, cajas, kits de mazo y sets Pokémon TCG sellados en ediciones japonesas y en chino simplificado. Armá tu carrito y coordiná por WhatsApp. Sitio en construcción: precios y disponibilidad a confirmar.",
};
export const viewport: Viewport = { themeColor: "#121715", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" data-scroll-behavior="smooth" className={`${anton.variable} ${figtree.variable}`}>
      <body className="min-h-dvh overflow-x-hidden">
        <a
          href="#principal"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:bg-gold focus:px-4 focus:py-2 focus:font-bold"
        >
          Saltar al contenido
        </a>
        <HydrationMarker />
        <AccountProvider>
          <Header />
          <main id="principal">{children}</main>
          <Footer />
          <CartDrawer />
        </AccountProvider>
      </body>
    </html>
  );
}
