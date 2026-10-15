import Link from "next/link";
import { store } from "@/content/store";

const cols = [
  { title: "Tienda", links: [["/sellados", "Todos los sellados"], ["/sellados?disp=stock", "En stock"], ["/expansiones", "Expansiones"], ["/mayoristas", "Mayoristas"], ["/carrito", "Carrito"]] },
  { title: "Ayuda", links: [["/como-comprar", "Cómo comprar"], ["/como-comprar#envios", "Envíos y retiros"], ["/cuenta", "Mi cuenta"]] },
  { title: "Legal (borrador)", links: [["/privacidad", "Privacidad"], ["/condiciones", "Condiciones"]] },
] as const;

export function Footer() {
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="display text-4xl italic">{store.name}</p>
          <p className="mono-label mt-2 text-gold">{store.descriptor}</p>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/70">
            Productos Pokémon TCG sellados en Argentina. Armás el carrito y coordinamos por WhatsApp: disponibilidad,
            importe final, pago y entrega se confirman en el chat.
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="eyebrow text-gold">{c.title}</p>
            <ul className="mt-4 space-y-3 text-sm">
              {c.links.map(([href, label]) => (
                <li key={label}>
                  <Link href={href} className="text-paper/80 hover:text-gold hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-paper/15">
        <p className="mx-auto max-w-[1440px] px-4 py-5 text-xs text-paper/70 sm:px-8">
          Pokémon y sus personajes son marcas de sus respectivos titulares; este sitio no es oficial.
          <span className="block pt-1 text-paper/65">Sitio en preparación · precios y disponibilidad a confirmar · los pedidos se confirman por WhatsApp.</span>
        </p>
      </div>
    </footer>
  );
}
