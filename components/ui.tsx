import type { ReactNode } from "react";

const DOTS = ["bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-sky-500", "bg-violet-500"];

export const courseDot = (course: string, courses: string[]) => DOTS[Math.max(courses.indexOf(course), 0) % DOTS.length];

export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

export const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-xl border border-zinc-200 bg-white ${className}`}>{children}</section>;
}

export function CardHeader({ title, meta, metaTone, action }: { title: string; meta?: string; metaTone?: "danger"; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {action ?? (meta && <span className={`text-xs tabular-nums ${metaTone === "danger" ? "font-medium text-red-600" : "text-zinc-400"}`}>{meta}</span>)}
    </div>
  );
}
