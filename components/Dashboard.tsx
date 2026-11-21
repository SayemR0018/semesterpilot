"use client";

import { useMemo, useState } from "react";
import { buildPlan, rankAssignments, weeklyLoad, type ScoredAssignment } from "@/lib/scoring";
import type { LoadResult } from "@/lib/types";

const PALETTE = [
  "bg-indigo-100 text-indigo-800 border-indigo-300",
  "bg-emerald-100 text-emerald-800 border-emerald-300",
  "bg-amber-100 text-amber-800 border-amber-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-violet-100 text-violet-800 border-violet-300",
];

function courseColor(course: string, courses: string[]) {
  return PALETTE[Math.max(courses.indexOf(course), 0) % PALETTE.length];
}

const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

type PushResult =
  | { ok: true; mode: "mock"; markdown: string; title: string }
  | { ok: true; mode: "notion"; url: string; title: string; updated: number; skipped: string[] }
  | { ok: false; error: string; hint?: string };

export default function Dashboard({ data }: { data: LoadResult }) {
  const { assignments, today, mode, warnings } = data;
  const [minutes, setMinutes] = useState(180);
  const [startTime, setStartTime] = useState("16:00");
  const [pushing, setPushing] = useState(false);
  const [push, setPush] = useState<PushResult | null>(null);
  const [openExplain, setOpenExplain] = useState(true);

  const ranked = useMemo(() => rankAssignments(assignments, today), [assignments, today]);
  const plan = useMemo(() => buildPlan(ranked, minutes, { startTime }), [ranked, minutes, startTime]);
  const load = useMemo(() => weeklyLoad(assignments, today), [assignments, today]);
  const courses = useMemo(() => [...new Set(assignments.map((a) => a.course))].sort(), [assignments]);
  const overdue = ranked.filter((a) => a.overdue);
  const dueSoon = ranked.filter((a) => a.daysToDue !== null && a.daysToDue >= 0 && a.daysToDue <= 3);
  const maxLoad = Math.max(...load.map((d) => d.minutes), 1);

  async function pushPlan() {
    setPushing(true);
    setPush(null);
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, startTime }),
      });
      setPush((await res.json()) as PushResult);
    } catch (err) {
      setPush({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setPushing(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Semester<span className="text-indigo-600">Pilot</span>
          </h1>
          <p className="text-sm text-slate-500">
            {new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}{" "}
            · {ranked.length} open assignments across {courses.length} courses
          </p>
        </div>
        {mode === "mock" ? (
          <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            Demo data · set NOTION_API_KEY to use your Notion
          </span>
        ) : (
          <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Live from Notion
          </span>
        )}
      </header>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {warnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">
            Time available today: <span className="text-indigo-600">{fmtMinutes(minutes)}</span>
          </span>
          <input
            type="range"
            min={30}
            max={480}
            step={15}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="accent-indigo-600"
            aria-label="Available study minutes"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Start at</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value || "16:00")}
            className="rounded-lg border border-slate-300 px-2 py-1"
          />
        </label>
        <button
          onClick={pushPlan}
          disabled={pushing || plan.blocks.length === 0}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {pushing ? "Pushing…" : "Push plan to Notion"}
        </button>
      </section>

      {push && <PushBanner push={push} />}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Next 7 days workload</h2>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {load.map((d, i) => {
            const intensity = d.minutes / maxLoad;
            const bg =
              d.minutes === 0
                ? "bg-slate-100 text-slate-400"
                : intensity > 0.75
                  ? "bg-rose-500 text-white"
                  : intensity > 0.5
                    ? "bg-orange-400 text-white"
                    : intensity > 0.25
                      ? "bg-amber-300 text-amber-900"
                      : "bg-lime-200 text-lime-900";
            return (
              <div
                key={d.date}
                className={`flex flex-col items-center rounded-lg p-2 text-center ${bg}`}
                title={`${d.count} due · ${fmtMinutes(d.minutes)} of work`}
              >
                <span className="text-[11px] font-semibold uppercase">{i === 0 ? "Today" : weekday(d.date)}</span>
                <span className="text-sm font-bold sm:text-base">{d.minutes ? fmtMinutes(d.minutes) : "–"}</span>
                <span className="text-[10px] opacity-80">{d.count} due</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Today&apos;s plan</h2>
            <span className="text-sm text-slate-500">
              {fmtMinutes(plan.totalMinutes)} of {fmtMinutes(minutes)} · max {fmtMinutes(plan.courseCapMinutes)} per course
            </span>
          </div>
          {plan.blocks.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-6 text-center text-slate-500">Nothing open. Enjoy the free time!</p>
          ) : (
            <ol className="space-y-2">
              {plan.blocks.map((b, i) => (
                <li
                  key={`${b.assignmentId}-${b.part}`}
                  className={`flex items-center gap-3 rounded-xl border-l-4 p-3 ${courseColor(b.course, courses)}`}
                >
                  <div className="w-24 shrink-0 font-mono text-sm font-semibold">
                    {b.start}
                    <span className="opacity-60">–{b.end}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {i + 1}. {b.title}
                    </p>
                    <p className="text-xs opacity-80">
                      {b.course}
                      {b.parts > 1 ? ` · part ${b.part}/${b.parts}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{b.minutes}m</span>
                </li>
              ))}
            </ol>
          )}
          {Object.keys(plan.courseMinutes).length > 0 && (
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="Time per course">
              {Object.entries(plan.courseMinutes).map(([c, m]) => (
                <div
                  key={c}
                  className={`${courseColor(c, courses).split(" ")[0]} border-r border-white`}
                  style={{ width: `${(m / minutes) * 100}%` }}
                  title={`${c}: ${m} min`}
                />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <ItemList title="Overdue" tone="rose" items={overdue} empty="Nothing overdue. Nice." courses={courses} />
          <ItemList title="Due in the next 3 days" tone="amber" items={dueSoon} empty="Nothing due soon." courses={courses} />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          onClick={() => setOpenExplain((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={openExplain}
        >
          <h2 className="text-lg font-semibold">Explain my plan</h2>
          <span className="text-sm text-slate-500">{openExplain ? "Hide" : "Show"}</span>
        </button>
        {openExplain && (
          <>
            <p className="mt-1 text-xs text-slate-500">
              score = urgency (1–10, rises exponentially as the deadline nears) × weight (1 + grade%/10) × effort
              (√(remaining hours)) + overdue penalty. Courses are capped at 60% of your day.
            </p>
            <ol className="mt-3 divide-y divide-slate-100">
              {plan.decisions.map((d) => (
                <li key={d.assignmentId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex items-center gap-2 sm:w-72 sm:shrink-0">
                    <span className="w-8 text-right font-mono text-sm text-slate-400">#{d.rank}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-slate-500">{d.course}</p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1 pl-10 sm:pl-0">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs text-white">
                        {d.score.toFixed(1)}
                      </span>
                      {d.factors.map((f) => (
                        <span key={f.label} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {f.label} <strong>{f.value}</strong> · {f.detail}
                        </span>
                      ))}
                    </div>
                    <p className={`text-xs ${d.allocatedMinutes ? "text-emerald-700" : "text-slate-500"}`}>
                      {d.allocatedMinutes ? `✓ ${d.allocatedMinutes} min today — ` : "⏸ "}
                      {d.reason}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <footer className="pb-4 text-center text-xs text-slate-400">
        SemesterPilot · Notion is the source of truth · no data stored
      </footer>
    </main>
  );
}

function ItemList({
  title,
  tone,
  items,
  empty,
  courses,
}: {
  title: string;
  tone: "rose" | "amber";
  items: ScoredAssignment[];
  empty: string;
  courses: string[];
}) {
  const head = tone === "rose" ? "text-rose-700" : "text-amber-700";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className={`mb-2 font-semibold ${head}`}>
        {title} <span className="text-sm font-normal text-slate-400">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {a.title}
                  </a>
                ) : (
                  <p className="font-medium">{a.title}</p>
                )}
                <span className={`mt-0.5 inline-block rounded border px-1.5 text-[11px] ${courseColor(a.course, courses)}`}>
                  {a.course}
                </span>
              </div>
              <span className="shrink-0 text-xs text-slate-500">
                {a.daysToDue! < 0 ? `${-a.daysToDue!}d late` : a.daysToDue === 0 ? "today" : `in ${a.daysToDue}d`}
                <br />
                {fmtMinutes(a.remainingMinutes)} left
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PushBanner({ push }: { push: PushResult }) {
  if (!push.ok) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        <p className="font-semibold">Couldn&apos;t write to Notion: {push.error}</p>
        {push.hint && <p className="mt-1">{push.hint}</p>}
      </div>
    );
  }
  if (push.mode === "mock") {
    return (
      <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <summary className="cursor-pointer font-semibold">
          Demo mode: &ldquo;{push.title}&rdquo; would be created in Notion. Click to preview the markdown.
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs">
          {push.markdown}
        </pre>
      </details>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="font-semibold">
        ✓ Created{" "}
        <a href={push.url} target="_blank" rel="noreferrer" className="underline">
          {push.title}
        </a>{" "}
        in Notion.
      </p>
      <p className="mt-1 text-xs">
        Updated {push.updated} assignment(s).
        {push.skipped.length > 0 && ` Skipped: ${push.skipped.join("; ")}`}
      </p>
    </div>
  );
}
