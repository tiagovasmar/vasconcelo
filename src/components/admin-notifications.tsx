"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const endpoint = "/api/admin/notificaciones";
const changed = "admin-notifications-changed";

export function refreshAdminNotifications() {
  window.dispatchEvent(new Event(changed));
}

export function AdminNotificationsLink() {
  const pathname = usePathname();
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    let request: AbortController | undefined;
    async function update() {
      if (document.hidden) return;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: current.signal });
        if (response.status === 401 || response.status === 403) {
          if (!current.signal.aborted) setUnread(null);
        } else if (response.ok) {
          const { unread } = await response.json();
          if (!current.signal.aborted && typeof unread === "number") setUnread(unread);
        }
      } catch {
        // Conserva el último número confirmado hasta el próximo intento.
      }
    }
    void update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener(changed, update);
    document.addEventListener("visibilitychange", update);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener(changed, update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [pathname]);

  if (unread === null) return null;
  return (
    <Link href="/admin/notificaciones" prefetch={false} aria-current={pathname === "/admin/notificaciones" ? "page" : undefined}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-paper/40 px-3 text-sm font-semibold hover:bg-white/10">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" />
      </svg>
      Notificaciones
      {unread > 0 && <span className="min-w-5 rounded-full bg-gold px-1.5 text-center text-xs font-bold leading-5 text-ink">
        <span aria-hidden="true" data-testid="notificaciones-contador">{unread > 99 ? "99+" : unread}</span>
        <span className="sr-only">{unread} sin leer</span>
      </span>}
    </Link>
  );
}

export function MarkNotificationsRead({ keys, label }: { keys: string[]; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function mark() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys }) });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? "No pudimos marcar los avisos. Reintentá.");
      }
      refreshAdminNotifications();
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No pudimos confirmar el cambio. Reintentá.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" disabled={busy} onClick={mark} className="min-h-11 rounded-md border border-ink/25 bg-white px-3 text-sm font-semibold hover:border-emerald disabled:opacity-50">
        {busy ? "Guardando…" : label}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-vermilion">{error}</p>}
    </div>
  );
}
