import type { Metadata } from "next";
import Link from "next/link";
import { AdminNavigation } from "@/components/admin-navigation";
import { AdminNotificationsLink } from "@/components/admin-notifications";
import { store } from "@/content/store";

export const metadata: Metadata = { title: "Panel del dueño", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-[1480px]">
        <header className="flex flex-wrap items-center justify-between gap-2 bg-emerald px-4 py-2 text-paper sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="display hidden text-lg italic sm:block">{store.name}</span>
            <span className="eyebrow text-gold">Panel del dueño</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <AdminNotificationsLink />
            <Link href="/" className="inline-flex min-h-10 items-center text-sm underline-offset-4 hover:underline">Ver la tienda ↗</Link>
          </div>
        </header>
        <div className="grid min-w-0 lg:grid-cols-[10rem_minmax(0,1fr)]">
          <AdminNavigation>{children}</AdminNavigation>
        </div>
      </div>
    </div>
  );
}
