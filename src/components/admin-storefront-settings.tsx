"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontConfig } from "@/features/admin/storefront";

type ProductOption = { id: string; title: string; sku: string; automatic: boolean };

export function AdminStorefrontSettings({ initial, version, options }: { initial: StorefrontConfig; version: number; options: ProductOption[] }) {
  const router = useRouter();
  const [config, setConfig] = useState(initial);
  const [expectedVersion, setVersion] = useState(version);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();
  const query = search.trim().toLowerCase();
  const filtered = options.filter(({ title, sku }) => `${title} ${sku}`.toLowerCase().includes(query));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch("/api/admin/tienda", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, expectedVersion }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice({ error: true, text: result.error?.message ?? "No se pudo guardar la configuración." });
        return;
      }
      setConfig(result.config);
      setVersion(result.version);
      setNotice({ error: false, text: "Configuración guardada." });
      router.refresh();
    } catch {
      setNotice({ error: true, text: "No se pudo confirmar el guardado. Recargá la página para comprobarlo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-6">
      <fieldset disabled={busy} className="grid min-w-0 gap-5">
        <section className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5" aria-labelledby="config-instagram">
          <h2 id="config-instagram" className="text-lg font-semibold">Instagram</h2>
          <label htmlFor="instagram-profile" className="mt-3 block text-sm font-semibold">Usuario o enlace del perfil</label>
          <input id="instagram-profile" value={config.instagram} onChange={(event) => setConfig({ ...config, instagram: event.target.value })} placeholder="@usuario" maxLength={300} className="mt-1 min-h-11 w-full max-w-md rounded-md border border-ink/40 px-3" />
          <p className="mt-1 text-sm text-ink/75">Completalo para mostrar el botón de Instagram al lado de WhatsApp en el inicio.</p>
        </section>
        <section className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5" aria-labelledby="config-proximamente">
          <h2 id="config-proximamente" className="text-lg font-semibold">Próximamente</h2>
          <label className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold">
            <input type="checkbox" className="size-5" checked={config.upcomingEnabled} onChange={(event) => setConfig({ ...config, upcomingEnabled: event.target.checked })} />
            Mostrar «Próximamente» en la tienda
          </label>
          <p className="text-sm text-ink/75">En modo automático, el producto aparece si tiene un ingreso publicado desde Compras. También podés mostrarlo u ocultarlo manualmente. Esto controla los anuncios de próximos ingresos. Las preventas se gestionan desde Compras.</p>
          <label htmlFor="upcoming-search" className="mt-4 block text-sm font-semibold">Buscar producto por nombre o SKU</label>
          <input id="upcoming-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 min-h-11 w-full max-w-md rounded-md border border-ink/40 px-3" />
          <ul className="mt-3 max-h-96 divide-y divide-ink/10 overflow-y-auto rounded-lg border border-ink/15 px-3">
            {filtered.map(({ id, title, sku, automatic }) => <li key={id} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_auto]">
              <label htmlFor={`upcoming-${id}`} className="min-w-0 text-sm font-semibold">
                {title} <span className="block text-xs font-normal text-ink/75">{sku}</span>
              </label>
              <select id={`upcoming-${id}`} className="min-h-11 w-full rounded-md border border-ink/35 bg-white px-2 sm:w-auto" value={config.products[id] ?? ""} onChange={(event) => {
                const choice = event.target.value;
                setConfig((current) => {
                  const products = { ...current.products };
                  if (choice === "mostrar" || choice === "ocultar") products[id] = choice;
                  else delete products[id];
                  return { ...current, products };
                });
              }}>
                <option value="">{automatic ? "Automático · visible" : "Automático · oculto"}</option>
                <option value="mostrar">Mostrar</option>
                <option value="ocultar">Ocultar</option>
              </select>
            </li>)}
            {!filtered.length && <li className="py-3 text-sm text-ink/75">No encontramos productos.</li>}
          </ul>
        </section>
        <button type="submit" className="min-h-11 justify-self-start rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald disabled:opacity-50">{busy ? "Guardando…" : "Guardar configuración"}</button>
      </fieldset>
      {notice && <p className={`mt-2 text-sm font-semibold ${notice.error ? "text-vermilion" : "text-emerald"}`} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
    </form>
  );
}
