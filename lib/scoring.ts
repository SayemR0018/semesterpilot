import type { Assignment } from "./types";

export const DEFAULT_EFFORT_MINUTES = 60;
export const DEFAULT_WEIGHT_PERCENT = 10;
export const MAX_COURSE_SHARE = 0.6;
export const MAX_BLOCK_MINUTES = 60;
export const MIN_BLOCK_MINUTES = 15;
export const BREAK_MINUTES = 10;

const DONE_STATUSES = ["done", "complete", "completed", "submitted", "finished", "graded", "archived"];

export type ScoreFactor = { label: string; value: number; detail: string };

export type ScoredAssignment = Assignment & {
  daysToDue: number | null;
  remainingMinutes: number;
  overdue: boolean;
  score: number;
  factors: ScoreFactor[];
};

export type PlanBlock = {
  assignmentId: string;
  title: string;
  course: string;
  minutes: number;
  start: string;
  end: string;
  part: number;
  parts: number;
};

export type PlanDecision = {
  assignmentId: string;
  title: string;
  course: string;
  rank: number;
  score: number;
  allocatedMinutes: number;
  remainingMinutes: number;
  reason: string;
  factors: ScoreFactor[];
};

export type Plan = {
  blocks: PlanBlock[];
  decisions: PlanDecision[];
  totalMinutes: number;
  availableMinutes: number;
  courseMinutes: Record<string, number>;
  courseCapMinutes: number;
};

export type DayLoad = { date: string; minutes: number; count: number };

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function isDone(a: Pick<Assignment, "status">): boolean {
  return !!a.status && DONE_STATUSES.includes(a.status.trim().toLowerCase());
}

/** Whole days between two ISO dates (b - a), timezone-safe. */
export function daysBetween(a: string, b: string): number {
  const ms =
    Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Urgency rises exponentially as the due date approaches: ~1 (far away) .. 10 (due today / overdue). */
export function urgency(daysToDue: number | null): number {
  if (daysToDue === null) return 1;
  return 1 + 9 * Math.exp(-Math.max(daysToDue, 0) / 3);
}

function priorityFactor(priority?: string | null): number | null {
  const p = priority?.toLowerCase() ?? "";
  if (/high|urgent|critical|p1/.test(p)) return 3;
  if (/med|normal|p2/.test(p)) return 2;
  if (/low|p3/.test(p)) return 1.5;
  return null;
}

export function weightFactor(a: Pick<Assignment, "weight" | "priority">): { value: number; detail: string } {
  if (a.weight !== null && a.weight !== undefined && a.weight >= 0) {
    return { value: 1 + a.weight / 10, detail: `${a.weight}% of grade` };
  }
  const pf = priorityFactor(a.priority);
  if (pf !== null) return { value: pf, detail: `priority "${a.priority}" (no grade weight)` };
  return { value: 1 + DEFAULT_WEIGHT_PERCENT / 10, detail: `no weight set, assumed ${DEFAULT_WEIGHT_PERCENT}%` };
}

export function remainingMinutes(a: Pick<Assignment, "effortMinutes" | "effortDoneMinutes">): number {
  const total = a.effortMinutes && a.effortMinutes > 0 ? a.effortMinutes : DEFAULT_EFFORT_MINUTES;
  return Math.max(total - (a.effortDoneMinutes ?? 0), 0);
}

/** Bigger remaining work should start earlier; sqrt keeps huge projects from dominating. */
export function effortFactor(minutes: number): number {
  return Math.sqrt(Math.max(minutes, MIN_BLOCK_MINUTES) / 60);
}

export function overduePenalty(daysToDue: number | null): number {
  if (daysToDue === null || daysToDue >= 0) return 0;
  return Math.min(10 + 2 * -daysToDue, 30);
}

export function scoreAssignment(a: Assignment, today: string): ScoredAssignment {
  const daysToDue = a.due ? daysBetween(today, a.due) : null;
  const rem = remainingMinutes(a);
  const u = urgency(daysToDue);
  const w = weightFactor(a);
  const e = effortFactor(rem);
  const penalty = overduePenalty(daysToDue);
  const score = round(u * w.value * e + penalty);
  const dueDetail =
    daysToDue === null
      ? "no due date"
      : daysToDue < 0
        ? `${-daysToDue} day(s) overdue`
        : daysToDue === 0
          ? "due today"
          : `due in ${daysToDue} day(s)`;
  const factors: ScoreFactor[] = [
    { label: "Urgency", value: round(u), detail: dueDetail },
    { label: "Weight", value: round(w.value), detail: w.detail },
    {
      label: "Effort",
      value: round(e),
      detail: `${rem} min remaining${a.effortMinutes ? "" : ` (default ${DEFAULT_EFFORT_MINUTES} min estimate)`}`,
    },
  ];
  if (penalty) factors.push({ label: "Overdue penalty", value: penalty, detail: `+${penalty} because it is late` });
  return { ...a, daysToDue, remainingMinutes: rem, overdue: daysToDue !== null && daysToDue < 0, score, factors };
}

/** Score every open assignment and sort by score (desc), ties broken by earliest due date. */
export function rankAssignments(assignments: Assignment[], today: string): ScoredAssignment[] {
  return assignments
    .filter((a) => !isDone(a))
    .map((a) => scoreAssignment(a, today))
    .filter((a) => a.remainingMinutes > 0)
    .sort(
      (x, y) =>
        y.score - x.score ||
        (x.due ?? "9999").localeCompare(y.due ?? "9999") ||
        x.title.localeCompare(y.title),
    );
}

function clock(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type PlanOptions = { startTime?: string; maxCourseShare?: number };

/**
 * Greedily fill the available time in rank order, capping any single course at
 * maxCourseShare of the day and splitting work into <= 60 min blocks with breaks.
 */
export function buildPlan(ranked: ScoredAssignment[], availableMinutes: number, opts: PlanOptions = {}): Plan {
  const cap = Math.floor(availableMinutes * (opts.maxCourseShare ?? MAX_COURSE_SHARE));
  const [h, m] = (opts.startTime ?? "16:00").split(":").map(Number);
  let cursor = h * 60 + m;
  let left = availableMinutes;
  const courseMinutes: Record<string, number> = {};
  const blocks: PlanBlock[] = [];
  const decisions: PlanDecision[] = [];

  ranked.forEach((a, i) => {
    const used = courseMinutes[a.course] ?? 0;
    const courseLeft = cap - used;
    let alloc = Math.min(a.remainingMinutes, left, courseLeft);
    let reason: string;
    if (left < MIN_BLOCK_MINUTES) {
      alloc = 0;
      reason = "No study time left today";
    } else if (courseLeft < MIN_BLOCK_MINUTES) {
      alloc = 0;
      reason = `${a.course} already hit the ${Math.round((opts.maxCourseShare ?? MAX_COURSE_SHARE) * 100)}% daily cap (${used} of ${cap} min)`;
    } else if (alloc < MIN_BLOCK_MINUTES && alloc < a.remainingMinutes) {
      alloc = 0;
      reason = `Less than ${MIN_BLOCK_MINUTES} min would fit; deferred`;
    } else if (alloc < a.remainingMinutes) {
      reason = `Ranked #${i + 1}; got ${alloc} of ${a.remainingMinutes} min (${alloc === courseLeft ? "course cap" : "out of time"})`;
    } else {
      reason = `Ranked #${i + 1}; fully scheduled`;
    }
    if (alloc > 0) {
      const parts = Math.ceil(alloc / MAX_BLOCK_MINUTES);
      let rest = alloc;
      for (let p = 1; p <= parts; p++) {
        const minutes = Math.min(MAX_BLOCK_MINUTES, rest);
        if (blocks.length) cursor += BREAK_MINUTES;
        blocks.push({
          assignmentId: a.id,
          title: a.title,
          course: a.course,
          minutes,
          start: clock(cursor),
          end: clock(cursor + minutes),
          part: p,
          parts,
        });
        cursor += minutes;
        rest -= minutes;
      }
      left -= alloc;
      courseMinutes[a.course] = used + alloc;
    }
    decisions.push({
      assignmentId: a.id,
      title: a.title,
      course: a.course,
      rank: i + 1,
      score: a.score,
      allocatedMinutes: alloc,
      remainingMinutes: a.remainingMinutes,
      reason,
      factors: a.factors,
    });
  });

  return { blocks, decisions, totalMinutes: availableMinutes - left, availableMinutes, courseMinutes, courseCapMinutes: cap };
}

/** Remaining effort due on each of the next `days` days (index 0 = today; overdue folded into today). */
export function weeklyLoad(assignments: Assignment[], today: string, days = 7): DayLoad[] {
  const out: DayLoad[] = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i), minutes: 0, count: 0 }));
  for (const a of assignments) {
    if (isDone(a) || !a.due) continue;
    const idx = Math.max(daysBetween(today, a.due), 0);
    if (idx >= days) continue;
    out[idx].minutes += remainingMinutes(a);
    out[idx].count += 1;
  }
  return out;
}

export function planToMarkdown(plan: Plan, today: string): string {
  return [
    `**${plan.totalMinutes} of ${plan.availableMinutes} min planned** across ${plan.blocks.length} block(s). No course gets more than ${plan.courseCapMinutes} min.`,
    "",
    "## Today's study blocks",
    "",
    ...(plan.blocks.length
      ? plan.blocks.map(
          (b, i) =>
            `${i + 1}. **${b.start}-${b.end}** ${b.title} (${b.course}, ${b.minutes} min${b.parts > 1 ? `, part ${b.part}/${b.parts}` : ""})`,
        )
      : ["Nothing to schedule. Enjoy the free time!"]),
    "",
    "## Why this order",
    "",
    ...plan.decisions.map(
      (d) =>
        `- **#${d.rank} ${d.title}** (score ${d.score}): ${d.reason}. ${d.factors.map((f) => `${f.label} ${f.value} (${f.detail})`).join("; ")}`,
    ),
    "",
    `*Generated by SemesterPilot on ${today}*`,
  ].join("\n");
}
