import Link from "next/link";
import { store } from "@/content/store";
import { PAY_ON_DELIVERY_NOTICE } from "@/content/checkout-options";
import { SearchIcon, TruckIcon, ArrowIcon } from "./icons";
import { AccountLink } from "./account-provider";
import { CartLink } from "./cart-widgets";
import { MobileMenu } from "./mobile-menu";

const nav = [
  { href: "/", label: "Inicio" },
  { href: "/sellados", label: "Explorar" },
  { href: "/sellados?disp=stock", label: "En stock" },
  { href: "/proximamente", label: "Próximamente" },
  { href: "/expansiones", label: "Expansiones" },
  { href: "/como-comprar", label: "Cómo comprar" },
  { href: "/mayoristas", label: "Mayoristas" },
];

export function Header() {
  return (
    <header className="relative z-40">
      <div className="bg-emerald text-paper">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-1 px-4 py-2 text-center text-xs sm:px-8 md:flex-row md:justify-between md:gap-4 md:text-left">
          <p className="font-semibold text-gold">Distribuidora de productos TCG asiáticos</p>
          <p className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="shrink-0"><TruckIcon /></span>
            <span>{PAY_ON_DELIVERY_NOTICE}</span>
          </p>
        </div>
      </div>
      <div className="paper-texture border-b border-ink/15">
        <div className="relative mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-3 sm:px-8 lg:gap-10">
          <Link href="/" className="flex shrink-0 flex-col leading-none" aria-label={`${store.name}, inicio`}>
            <span className="display text-[1.7rem] italic tracking-wide">{store.name}</span>
            <span className="mono-label mt-1 text-[.55rem] text-ink/70">{store.descriptor}</span>
          </Link>
          <nav aria-label="Principal" className="hidden flex-wrap gap-x-4 gap-y-1 text-sm xl:gap-x-7 font-medium lg:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="border-b-2 border-transparent py-1 hover:border-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action="/sellados" role="search" className="ml-auto hidden items-center gap-2 border-b border-ink/40 md:flex">
            <input type="hidden" name="juego" value="todos" />
            <label htmlFor="q-header" className="sr-only">
              Buscar productos
            </label>
            <SearchIcon />
            <input
              id="q-header"
              name="q"
              type="search"
              placeholder="Buscar productos…"
              className="w-52 bg-transparent py-1.5 text-sm outline-none placeholder:text-ink/50"
            />
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <AccountLink />
            <CartLink />
            <MobileMenu>
              <nav aria-label="Móvil" className="absolute inset-x-0 top-full z-50 border-y border-ink bg-paper shadow-[0_14px_0_rgba(18,23,21,.18)]">
                <div className="mx-auto max-w-[1440px] px-4 pb-5 pt-4 sm:px-8">
                  <form action="/sellados" role="search" className="flex items-center gap-3 border border-ink/40 bg-white px-4">
                    <input type="hidden" name="juego" value="todos" />
                    <SearchIcon />
                    <label htmlFor="q-mobile" className="sr-only">
                      Buscar productos
                    </label>
                    <input id="q-mobile" name="q" type="search" placeholder="Buscar productos…" className="h-12 w-full bg-transparent text-base outline-none placeholder:text-ink/50" />
                  </form>
                  <ul className="mt-2 divide-y divide-ink/15">
                    {nav.map((n, i) => (
                      <li key={n.href}>
                        <Link href={n.href} className="flex min-h-14 items-center justify-between gap-4 py-3 text-lg font-semibold hover:text-emerald">
                          <span className="flex items-baseline gap-3">
                            <span className="text-xs font-bold text-vermilion">{String(i + 1).padStart(2, "0")}</span>
                            {n.label}
                          </span>
                          <ArrowIcon />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="mono-label mt-3 text-ink/60">Andreani · Moto CABA y AMBA · Retiro Av. Rivadavia 14600</p>
                </div>
              </nav>
            </MobileMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
