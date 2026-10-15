import Link from "next/link";

export default function NotFound() {
  return (
    <section className="paper-texture">
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-8">
        <p className="eyebrow text-vermilion">Error 404</p>
        <h1 className="display mt-4 text-[clamp(2.6rem,9vw,5.5rem)] normal-case">No encontramos esa página.</h1>
        <p className="mt-6 max-w-xl text-lg text-ink/80">El producto o la expansión que buscás no existe o ya no está disponible. Podés seguir explorando el catálogo.</p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/sellados" className="bg-ink px-6 py-3 font-bold text-paper hover:bg-emerald">Ver todos los sellados</Link>
          <Link href="/" className="border border-ink px-6 py-3 font-bold hover:bg-gold">Ir al inicio</Link>
        </div>
      </div>
    </section>
  );
}
