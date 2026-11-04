"use client";

import { useId, useState } from "react";
import { formatARS } from "@/lib/format";

type Point = { day: string; total: number };
const oneDay = 86_400_000;
const shortDay = (day: string) => day.slice(5).split("-").reverse().join("/");
const dateAt = (time: number) => new Date(time).toISOString().slice(0, 10);

export function AccountingChart({ title, rows, money = false, empty, from, to }: {
  title: string; rows: Point[]; money?: boolean; empty: string; from?: string; to?: string;
}) {
  const id = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const format = (n: number) => money ? formatARS(n) : n.toLocaleString("es-AR");
  if (rows.length === 0) return <figure className="rounded-xl border border-ink/15 bg-white p-4"><figcaption className="font-semibold">{title}</figcaption><p className="mt-3 text-sm text-ink/70">{empty}</p></figure>;

  const start = Date.parse(from ?? rows[0].day);
  const end = Date.parse(to ?? rows[rows.length - 1].day);
  const span = Math.max(oneDay, end - start);
  const points: Point[] = [];
  let previous = start - oneDay;
  for (const row of rows) {
    const time = Date.parse(row.day);
    if (time - previous > oneDay) {
      points.push({ day: dateAt(previous + oneDay), total: 0 });
      if (time - previous > 2 * oneDay) points.push({ day: dateAt(time - oneDay), total: 0 });
    }
    points.push(row);
    previous = time;
  }
  if (previous < end) {
    points.push({ day: dateAt(previous + oneDay), total: 0 });
    if (previous + oneDay < end) points.push({ day: dateAt(end), total: 0 });
  }
  const peak = rows.reduce((max, row) => Math.max(max, row.total), 1);
  const unit = 10 ** Math.floor(Math.log10(peak));
  const ceiling = Math.ceil(peak / unit) * unit;
  const xy = points.map((point) => ({
    ...point,
    x: start === end ? 300 : (Date.parse(point.day) - start) / span * 600,
    y: 170 - point.total / ceiling * 158,
  }));
  const line = xy.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const selected = hovered === null ? null : xy[hovered];
  return (
    <figure className="min-w-0 rounded-xl border border-ink/15 bg-white p-4 sm:p-5">
      <figcaption className="font-semibold">{title}</figcaption>
      <p className="mt-1 text-2xl font-bold tabular-nums">{format(rows.reduce((sum, row) => sum + row.total, 0))}</p>
      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="flex h-40 flex-col justify-between py-1 text-[10px] text-ink/70 sm:text-xs" aria-hidden="true">
          {[ceiling, ceiling / 2, 0].map((value) => <span key={value}>{format(Math.round(value))}</span>)}
        </div>
        <div className="relative min-w-0">
          <svg viewBox="0 0 600 180" preserveAspectRatio="none" className="block h-40 w-full" aria-hidden="true"
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const x = (event.clientX - box.left) / box.width * 600;
              setHovered(xy.reduce((best, point, index) => Math.abs(point.x - x) < Math.abs(xy[best].x - x) ? index : best, 0));
            }} onPointerLeave={() => setHovered(null)}>
            <defs><linearGradient id={id} x2="0" y2="1"><stop stopColor="#00896b" stopOpacity=".22" /><stop offset="1" stopColor="#00896b" stopOpacity="0" /></linearGradient></defs>
            {[12, 91, 170].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#e5e7eb" vectorEffect="non-scaling-stroke" />)}
            {xy.length > 1 && <path d={`${line} L${xy.at(-1)!.x},170 L${xy[0].x},170 Z`} fill={`url(#${id})`} />}
            <path d={line} fill="none" stroke="#00896b" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            {(xy.length === 1 || selected) && <circle cx={(selected ?? xy[0]).x} cy={(selected ?? xy[0]).y} r="4" fill="#00896b" />}
            {selected && <line x1={selected.x} x2={selected.x} y1="12" y2="170" stroke="#00896b" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          </svg>
          {selected && <div className="pointer-events-none absolute right-1 top-0 rounded-md border border-ink/15 bg-white px-2 py-1 text-xs shadow-sm">{shortDay(selected.day)} · <b>{format(selected.total)}</b></div>}
          <div className="flex justify-between text-xs text-ink/70" aria-hidden="true"><span>{shortDay(dateAt(start))}</span>{start !== end && <span>{shortDay(dateAt(end))}</span>}</div>
        </div>
      </div>
      <details className="mt-3 text-xs"><summary className="cursor-pointer">Ver valores por día</summary><ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">{rows.map((row) => <li key={row.day}><time dateTime={row.day}>{row.day.split("-").reverse().join("/")}</time> · {format(row.total)}</li>)}</ul></details>
    </figure>
  );
}
