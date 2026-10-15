"use client";

import { useEffect, useRef } from "react";

/**
 * En escritorio el formulario de filtros se ve en línea; en móvil se abre como hoja modal (<dialog>) con
 * foco gestionado por el navegador, cierre con Escape y botón de cierre.
 */
export function FilterShell({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onChange = (e: Event) => {
      // En escritorio los selectores aplican al cambiar; en móvil se confirma con «Aplicar».
      if (window.matchMedia("(min-width: 1024px)").matches && (e.target as HTMLElement).tagName !== "INPUT") {
        el.querySelector("form")?.requestSubmit();
      }
    };
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === el) el.close();
    };
    el.addEventListener("change", onChange);
    el.addEventListener("click", onBackdrop);
    return () => {
      el.removeEventListener("change", onChange);
      el.removeEventListener("click", onBackdrop);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
        className="flex min-h-12 w-full items-center justify-between border border-ink bg-white px-4 text-sm font-bold lg:hidden"
      >
        <span>Filtros y orden</span>
        <span className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs ${activeCount ? "bg-gold text-ink" : "bg-ink/10"}`}>{activeCount}</span>
      </button>
      <dialog
        ref={dialog}
        aria-label="Filtros"
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto border-t-2 border-ink bg-paper p-0 text-ink backdrop:bg-ink/60 lg:static lg:mt-0 lg:block lg:max-h-none lg:overflow-visible lg:border-0 lg:bg-transparent lg:backdrop:hidden"
      >
        <div className="flex items-center justify-between border-b border-ink/20 px-4 py-3 lg:hidden">
          <p className="display text-3xl normal-case">Filtros</p>
          <button type="button" onClick={() => dialog.current?.close()} className="flex h-11 w-11 items-center justify-center border border-ink text-xl" aria-label="Cerrar filtros">
            ×
          </button>
        </div>
        {children}
      </dialog>
    </>
  );
}
