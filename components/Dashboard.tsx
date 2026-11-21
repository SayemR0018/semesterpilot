"use client";

import { useMemo, useState } from "react";
import { buildPlan, rankAssignments, weeklyLoad, type ScoredAssignment } from "@/lib/scoring";
import type { LoadResult } from "@/lib/types";
import type { CoachResult } from "@/lib/types";
import { CoachCard } from "./CoachCard";
import { Card, CardHeader, courseDot, fmtMinutes, weekday } from "./ui";

type PushResult =
  | { ok: true; mode: "mock"; markdown: string; title: string }
  | { ok: true; mode: "notion"; url: string; title: string; updated: number; skipped: string[] }
  | { ok: false; error: string; hint?: string };

export default function Dashboard({ data, aiEnabled }: { data: LoadResult; aiEnabled: boolean }) {
  const { assignments, today, mode, warnings } = data;
  const [minutes, setMinutes] = useState(180);
  const [startTime, setStartTime] = useState("16:00");
  const [pushing, setPushing] = useState(false);
  const [push, setPush] = useState<PushResult | null>(null);
  const [coach, setCoach] = useState<CoachResult | null>(null);

  const ranked = useMemo(() => rankAssignments(assignments, today), [assignments, today]);
  const plan = useMemo(() => buildPlan(ranked, minutes, { startTime }), [ranked, minutes, startTime]);
  const load = useMemo(() => weeklyLoad(assignments, today), [assignments, today]);
  const courses = useMemo(() => [...new Set(assignments.map((a) => a.course))].sort(), [assignments]);
  const overdue = ranked.filter((a) => a.overdue);
  const dueSoon = ranked.filter((a) => a.daysToDue !== null && a.daysToDue >= 0 && a.daysToDue <= 3);
  const weekMinutes = load.reduce((s, d) => s + d.minutes, 0);
  const steps = useMemo(() => new Map(coach?.steps.map((s) => [s.assignmentId, s.firstStep])), [coach]);

  const changePlan = (fn: () => void) => {
    fn();
    setCoach(null);
    setPush(null);
  };

  async function pushPlan() {
    setPushing(true);
    setPush(null);
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, startTime, coach }),
      });
      setPush((await res.json()) as PushResult);
    } catch (err) {
      setPush({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setPushing(false);
    }
  }

  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-md bg-zinc-900 text-[13px] font-semibold text-white">S</div>
            <span className="text-[15px] font-semibold tracking-tight">SemesterPilot</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 sm:flex">
              <span className={`size-1.5 rounded-full ${mode === "mock" ? "bg-amber-500" : "bg-emerald-500"}`} />
              {mode === "mock" ? "Demo data" : "Connected to Notion"}
            </span>
            <button
              onClick={pushPlan}
              disabled={pushing || plan.blocks.length === 0}
              className="h-8 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
            >
              {pushing ? "Pushing…" : "Push to Notion"}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {mode === "mock" && (
          <p className="flex items-center gap-2 text-xs text-zinc-500 sm:hidden">
            <span className="size-1.5 rounded-full bg-amber-500" /> Demo data · set NOTION_API_KEY to use your Notion
          </p>
        )}

        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">{dateLabel}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">Today&apos;s plan</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {plan.blocks.length} focus blocks · {fmtMinutes(plan.totalMinutes)} planned from {ranked.length} open assignments
            </p>
          </div>
          <div className="flex items-end gap-5 rounded-xl border border-zinc-200 bg-white p-3 sm:w-[360px]">
            <label className="flex flex-1 flex-col gap-2">
              <span className="flex justify-between text-xs text-zinc-500">
                Available <span className="font-medium text-zinc-900 tabular-nums">{fmtMinutes(minutes)}</span>
              </span>
              <input
                type="range"
                min={30}
                max={480}
                step={15}
                value={minutes}
                onChange={(e) => changePlan(() => setMinutes(Number(e.target.value)))}
                className="h-1 w-full cursor-pointer accent-zinc-900"
                aria-label="Available study minutes"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Start
              <input
                type="time"
                value={startTime}
                onChange={(e) => changePlan(() => setStartTime(e.target.value || "16:00"))}
                className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-sm text-zinc-900 tabular-nums"
              />
            </label>
          </div>
        </header>

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}

        {push && <PushBanner push={push} onClose={() => setPush(null)} />}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Planned today" value={fmtMinutes(plan.totalMinutes)} sub={`of ${fmtMinutes(minutes)}`} />
          <Stat label="Open" value={String(ranked.length)} sub={`${courses.length} courses`} />
          <Stat label="Overdue" value={String(overdue.length)} sub={overdue.length ? "needs attention" : "all clear"} tone={overdue.length ? "danger" : undefined} />
          <Stat label="Next 7 days" value={fmtMinutes(weekMinutes)} sub="of work due" />
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Schedule" meta={`max ${fmtMinutes(plan.courseCapMinutes)} per course`} />
              {plan.blocks.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-zinc-500">Nothing open. Enjoy the free time.</p>
              ) : (
                <ol className="relative px-5 pb-5">
                  {plan.blocks.map((b, i) => {
                    const step = b.part === 1 ? steps.get(b.assignmentId) : undefined;
                    return (
                      <li key={`${b.assignmentId}-${b.part}`} className="group grid grid-cols-[64px_1fr] gap-4">
                        <div className="pt-3 text-right font-mono text-xs text-zinc-400 tabular-nums">
                          {b.start}
                          <div className="text-[10px] text-zinc-300">{b.end}</div>
                        </div>
                        <div className={`relative border-l border-zinc-200 py-2 pl-5 ${i === plan.blocks.length - 1 ? "pb-0" : ""}`}>
                          <span className={`absolute -left-[5px] top-[18px] size-[9px] rounded-full ring-4 ring-white ${courseDot(b.course, courses)}`} />
                          <div className="rounded-lg border border-zinc-200/80 px-4 py-3 transition group-hover:border-zinc-300 group-hover:bg-zinc-50/60">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-zinc-900">{b.title}</p>
                              <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 tabular-nums">
                                {b.minutes}m
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {b.course}
                              {b.parts > 1 ? ` · part ${b.part} of ${b.parts}` : ""}
                            </p>
                            {step && (
                              <p className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-xs text-zinc-600">
                                <span className="font-medium text-zinc-900">First step:</span> {step}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {Object.keys(plan.courseMinutes).length > 0 && (
                <div className="border-t border-zinc-100 px-5 py-4">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    {Object.entries(plan.courseMinutes).map(([c, m]) => (
                      <div key={c} className={courseDot(c, courses)} style={{ width: `${(m / minutes) * 100}%` }} title={`${c}: ${m} min`} />
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                    {Object.entries(plan.courseMinutes).map(([c, m]) => (
                      <span key={c} className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className={`size-2 rounded-full ${courseDot(c, courses)}`} />
                        {c} <span className="text-zinc-400 tabular-nums">{fmtMinutes(m)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Explain plan={plan} courses={courses} />
          </div>

          <aside className="space-y-6">
            <CoachCard
              enabled={aiEnabled}
              coach={coach}
              onCoach={setCoach}
              minutes={minutes}
              startTime={startTime}
              disabled={plan.blocks.length === 0}
            />

            <Card>
              <CardHeader title="Next 7 days" meta="work due" />
              <div className="flex h-32 items-end gap-2 px-5 pb-4">
                {load.map((d, i) => {
                  const max = Math.max(...load.map((x) => x.minutes), 1);
                  const pct = d.minutes / max;
                  const tone = pct > 0.75 ? "bg-zinc-900" : pct > 0.4 ? "bg-zinc-500" : d.minutes ? "bg-zinc-300" : "bg-zinc-100";
                  return (
                    <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${d.count} due · ${fmtMinutes(d.minutes)}`}>
                      <span className="text-[10px] text-zinc-400 tabular-nums">{d.minutes ? fmtMinutes(d.minutes) : ""}</span>
                      <div className={`w-full rounded-sm ${tone}`} style={{ height: `${Math.max(pct * 70, 4)}%` }} />
                      <span className={`text-[11px] ${i === 0 ? "font-medium text-zinc-900" : "text-zinc-400"}`}>{i === 0 ? "Today" : weekday(d.date)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <ItemList title="Overdue" items={overdue} empty="Nothing overdue." courses={courses} danger />
            <ItemList title="Due in 3 days" items={dueSoon} empty="Nothing due soon." courses={courses} />
          </aside>
        </div>

        <footer className="pt-4 text-center text-xs text-zinc-400">Notion is the source of truth. SemesterPilot stores nothing.</footer>
      </main>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${tone === "danger" ? "text-red-600" : "text-zinc-900"}`}>{value}</p>
      <p className="text-xs text-zinc-400">{sub}</p>
    </div>
  );
}

function Explain({ plan, courses }: { plan: ReturnType<typeof buildPlan>; courses: string[] }) {
  const [open, setOpen] = useState(false);
  const rows = open ? plan.decisions : plan.decisions.slice(0, 5);
  return (
    <Card>
      <CardHeader title="Explain my plan" meta="transparent scoring" />
      <p className="px-5 text-xs leading-relaxed text-zinc-500">
        <span className="font-mono text-zinc-700">score = urgency × weight × effort + overdue</span>. Urgency rises exponentially
        toward the deadline, weight is 1 + grade%/10, effort is √(remaining hours). Deadlines within a day go first, other
        work is spread evenly until due, and no course gets more than 60% of the day.
      </p>
      <ul className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
        {rows.map((d) => (
          <li key={d.assignmentId} className="grid grid-cols-[28px_1fr_auto] items-start gap-3 px-5 py-3.5">
            <span className="pt-0.5 font-mono text-xs text-zinc-400 tabular-nums">{d.rank}</span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <span className={`size-2 shrink-0 rounded-full ${courseDot(d.course, courses)}`} />
                <span className="truncate">{d.title}</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {d.factors.map((f, i) => (
                  <span key={f.label}>
                    {i > 0 && <span className="text-zinc-300"> · </span>}
                    {f.label} <span className="font-medium text-zinc-700 tabular-nums">{f.value}</span>{" "}
                    <span className="text-zinc-400">({f.detail})</span>
                  </span>
                ))}
              </p>
              <p className={`mt-1 text-xs ${d.allocatedMinutes ? "text-emerald-700" : "text-zinc-400"}`}>{d.reason}</p>
            </div>
            <span className="rounded-md border border-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-700 tabular-nums">{d.score.toFixed(1)}</span>
          </li>
        ))}
      </ul>
      {plan.decisions.length > 5 && (
        <button onClick={() => setOpen((v) => !v)} className="w-full border-t border-zinc-100 py-2.5 text-xs font-medium text-zinc-500 hover:text-zinc-900">
          {open ? "Show less" : `Show all ${plan.decisions.length}`}
        </button>
      )}
    </Card>
  );
}

function ItemList({ title, items, empty, courses, danger }: { title: string; items: ScoredAssignment[]; empty: string; courses: string[]; danger?: boolean }) {
  return (
    <Card>
      <CardHeader title={title} meta={String(items.length)} metaTone={danger && items.length ? "danger" : undefined} />
      {items.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-zinc-400">{empty}</p>
      ) : (
        <ul className="px-2 pb-2">
          {items.map((a) => {
            const when = a.daysToDue! < 0 ? `${-a.daysToDue!}d late` : a.daysToDue === 0 ? "Today" : `${a.daysToDue}d`;
            const Title = a.url ? "a" : "span";
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-zinc-50">
                <span className={`size-2 shrink-0 rounded-full ${courseDot(a.course, courses)}`} />
                <div className="min-w-0 flex-1">
                  <Title {...(a.url ? { href: a.url, target: "_blank", rel: "noreferrer" } : {})} className="block truncate text-sm text-zinc-900 hover:underline">
                    {a.title}
                  </Title>
                  <p className="truncate text-xs text-zinc-400">{a.course}</p>
                </div>
                <div className="text-right text-xs tabular-nums">
                  <p className={danger ? "font-medium text-red-600" : "text-zinc-700"}>{when}</p>
                  <p className="text-zinc-400">{fmtMinutes(a.remainingMinutes)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PushBanner({ push, onClose }: { push: PushResult; onClose: () => void }) {
  const close = (
    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700" aria-label="Dismiss">
      ✕
    </button>
  );
  if (!push.ok) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-900">
        <div>
          <p className="font-medium">Couldn&apos;t write to Notion. {push.error}</p>
          {push.hint && <p className="mt-0.5 text-red-800/80">{push.hint}</p>}
        </div>
        {close}
      </div>
    );
  }
  if (push.mode === "mock") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
        <div className="flex items-start justify-between gap-4">
          <p className="text-zinc-700">
            <span className="font-medium text-zinc-900">Demo mode.</span> &ldquo;{push.title}&rdquo; would be created in Notion with this content:
          </p>
          {close}
        </div>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-mono text-xs text-zinc-700">{push.markdown}</pre>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
      <div>
        <p>
          Created{" "}
          <a href={push.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            {push.title}
          </a>{" "}
          in Notion.
        </p>
        <p className="mt-0.5 text-xs text-emerald-800/80">
          Updated {push.updated} assignment(s).{push.skipped.length > 0 && ` Skipped: ${push.skipped.join("; ")}`}
        </p>
      </div>
      {close}
    </div>
  );
}
