import Link from "next/link";

/** Tarjeta centrada para ingreso, registro y recuperación. */
export function AuthCard({ eyebrow, title, intro, children, footer }: { eyebrow: string; title: string; intro?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="paper-texture">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 sm:px-8 sm:py-16 md:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="eyebrow text-vermilion">{eyebrow}</p>
          <h1 className="display mt-3 text-[clamp(2.6rem,8vw,5rem)] normal-case leading-[.95]">{title}</h1>
          {intro && <p className="mt-4 max-w-md text-lg text-ink/80">{intro}</p>}
          <p className="mt-6 max-w-md border-l-4 border-emerald pl-3 text-sm text-ink/75">
            No hace falta una cuenta para armar el carrito ni para consultar por WhatsApp: podés <Link href="/sellados" className="font-semibold underline">comprar como invitado</Link>.
          </p>
        </div>
        <div>
          <div className="border border-ink/25 bg-white/80 p-5 sm:p-7">{children}</div>
          {footer && <div className="mt-4 text-sm">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

const tabs = [
  { id: "resumen", href: "/cuenta", label: "Resumen" },
  { id: "consultas", href: "/cuenta/consultas", label: "Mis consultas" },
  { id: "avisos", href: "/cuenta/avisos", label: "Mis avisos" },
  { id: "favoritos", href: "/cuenta/favoritos", label: "Favoritos" },
  { id: "perfil", href: "/cuenta/perfil", label: "Perfil" },
] as const;

/** Navegación de la zona privada. */
export function AccountNav({ current }: { current: (typeof tabs)[number]["id"] }) {
  return (
    <nav aria-label="Mi cuenta" className="border-y border-ink/20 bg-paper">
      <ul className="mx-auto flex max-w-[1440px] gap-6 overflow-x-auto px-4 text-sm font-semibold sm:px-8">
        {tabs.map((t) => (
          <li key={t.id} className="shrink-0">
            <Link href={t.href} aria-current={t.id === current ? "page" : undefined} className={`block border-b-2 py-3.5 ${t.id === current ? "border-ink" : "border-transparent text-ink/70 hover:border-ink hover:text-ink"}`}>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AccountHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-[1440px] px-4 pb-6 pt-8 sm:px-8 sm:pt-10">
        <p className="eyebrow text-vermilion">{eyebrow}</p>
        <h1 className="display mt-3 text-[clamp(2.4rem,7vw,4.6rem)] normal-case leading-[.95]">{title}</h1>
        {children}
      </div>
    </div>
  );
}
