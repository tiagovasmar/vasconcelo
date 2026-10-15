import Link from "next/link";
import { legal } from "@/content/legal";

/** Estructura común de Privacidad y Condiciones: aviso de borrador + secciones numeradas. */
export function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: Array<{ id: string; title: string; body: React.ReactNode }> }) {
  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-16">
        <p className="eyebrow text-vermilion">{eyebrow}</p>
        <h1 className="display mt-3 text-[clamp(2.6rem,8vw,5rem)] normal-case leading-[.95]">{title}</h1>
        {legal.isDraft && (
          <p role="note" className="mt-6 border-l-4 border-vermilion bg-vermilion/10 p-4 text-sm" data-testid="aviso-borrador">
            <b>Borrador.</b> Este texto describe cómo funciona el sitio, pero todavía no es el texto legal definitivo: los datos del comercio y las políticas marcadas como pendientes los completa el titular antes de publicar la tienda. No constituye asesoramiento legal ni afirma el cumplimiento de ninguna norma.
          </p>
        )}
        <p className="mt-6 text-lg text-ink/85">{intro}</p>
        <nav aria-label="Contenido" className="mt-6 border-y border-ink/20 py-3 text-sm">
          <ol className="flex flex-wrap gap-x-5 gap-y-1">
            {sections.map((s, i) => (
              <li key={s.id}><a href={`#${s.id}`} className="underline hover:text-emerald">{i + 1}. {s.title}</a></li>
            ))}
          </ol>
        </nav>
        <div className="mt-8 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`h-${s.id}`} className="scroll-mt-6">
              <h2 id={`h-${s.id}`} className="display text-3xl normal-case sm:text-4xl">{i + 1}. {s.title}</h2>
              <div className="mt-3 space-y-3 leading-relaxed text-ink/90">{s.body}</div>
            </section>
          ))}
        </div>
        <p className="mt-12 text-xs text-ink/60">Última actualización del borrador: {legal.lastUpdated}. <Link href="/como-comprar" className="underline">Cómo comprar</Link></p>
      </div>
    </div>
  );
}
