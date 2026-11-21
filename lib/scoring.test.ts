import { describe, expect, it } from "vitest";
import {
  buildPlan,
  daysBetween,
  fairShareToday,
  DEFAULT_EFFORT_MINUTES,
  isDone,
  overduePenalty,
  planToMarkdown,
  rankAssignments,
  scoreAssignment,
  urgency,
  weeklyLoad,
} from "./scoring";
import type { Assignment } from "./types";

const TODAY = "2026-11-21";
const make = (over: Partial<Assignment>): Assignment => ({
  id: over.title ?? "x",
  title: "Task",
  course: "CS 101",
  due: "2026-11-25",
  status: "Not started",
  effortMinutes: 60,
  weight: 10,
  ...over,
});

describe("date helpers", () => {
  it("counts whole days and ignores time components", () => {
    expect(daysBetween(TODAY, "2026-11-24")).toBe(3);
    expect(daysBetween(TODAY, "2026-11-20T23:59:00Z")).toBe(-1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("urgency", () => {
  it("rises exponentially as the due date approaches", () => {
    expect(urgency(0)).toBe(10);
    expect(urgency(1)).toBeGreaterThan(urgency(3));
    expect(urgency(3) - urgency(6)).toBeGreaterThan(urgency(6) - urgency(9));
    expect(urgency(30)).toBeCloseTo(1, 0);
  });
  it("treats overdue like due today and missing due dates as lowest", () => {
    expect(urgency(-4)).toBe(10);
    expect(urgency(null)).toBe(1);
  });
});

describe("scoreAssignment", () => {
  it("defaults missing effort to 60 minutes", () => {
    const s = scoreAssignment(make({ effortMinutes: null }), TODAY);
    expect(s.remainingMinutes).toBe(DEFAULT_EFFORT_MINUTES);
    expect(s.factors.find((f) => f.label === "Effort")?.detail).toMatch(/default/);
  });
  it("subtracts effort already done", () => {
    expect(scoreAssignment(make({ effortMinutes: 120, effortDoneMinutes: 90 }), TODAY).remainingMinutes).toBe(30);
  });
  it("weights heavier assignments higher", () => {
    const light = scoreAssignment(make({ weight: 5 }), TODAY);
    const heavy = scoreAssignment(make({ weight: 30 }), TODAY);
    expect(heavy.score).toBeGreaterThan(light.score);
  });
  it("falls back to the priority label when weight is missing", () => {
    const high = scoreAssignment(make({ weight: null, priority: "High" }), TODAY);
    const low = scoreAssignment(make({ weight: null, priority: "Low" }), TODAY);
    expect(high.score).toBeGreaterThan(low.score);
  });
  it("adds a growing, capped penalty for overdue items", () => {
    expect(overduePenalty(2)).toBe(0);
    expect(overduePenalty(-1)).toBe(12);
    expect(overduePenalty(-100)).toBe(30);
    const late = scoreAssignment(make({ due: "2026-11-19" }), TODAY);
    const today = scoreAssignment(make({ due: TODAY }), TODAY);
    expect(late.overdue).toBe(true);
    expect(late.score).toBeGreaterThan(today.score);
    expect(late.factors.map((f) => f.label)).toContain("Overdue penalty");
  });
});

describe("rankAssignments", () => {
  it("drops completed items and sorts by score", () => {
    const ranked = rankAssignments(
      [
        make({ id: "far", title: "Far", due: "2026-12-20" }),
        make({ id: "done", title: "Done", due: TODAY, status: "Done" }),
        make({ id: "soon", title: "Soon", due: "2026-11-22" }),
      ],
      TODAY,
    );
    expect(ranked.map((r) => r.id)).toEqual(["soon", "far"]);
    expect(isDone({ status: " Completed " })).toBe(true);
  });
});

describe("buildPlan", () => {
  it("never exceeds available minutes and splits into <= 60 min blocks", () => {
    const ranked = rankAssignments(
      [
        make({ id: "a", title: "A", course: "Math", effortMinutes: 150, due: "2026-11-22" }),
        make({ id: "b", title: "B", course: "Bio", effortMinutes: 120 }),
      ],
      TODAY,
    );
    const plan = buildPlan(ranked, 180);
    expect(plan.totalMinutes).toBeLessThanOrEqual(180);
    expect(plan.blocks.every((b) => b.minutes <= 60)).toBe(true);
    expect(plan.blocks[0].start).toBe("16:00");
  });

  it("caps a single course at 60% of the day", () => {
    const ranked = rankAssignments(
      [
        make({ id: "a", title: "A", course: "Math", effortMinutes: 120, due: TODAY }),
        make({ id: "b", title: "B", course: "Math", effortMinutes: 120, due: TODAY }),
        make({ id: "c", title: "C", course: "Bio", effortMinutes: 120, due: "2026-12-10" }),
      ],
      TODAY,
    );
    const plan = buildPlan(ranked, 180);
    expect(plan.courseCapMinutes).toBe(108);
    expect(plan.courseMinutes.Math).toBeLessThanOrEqual(108);
    expect(plan.courseMinutes.Bio).toBeGreaterThan(0);
    expect(plan.decisions.find((d) => d.assignmentId === "b")?.reason).toMatch(/cap/);
  });

  it("explains every ranked item, including unscheduled ones", () => {
    const ranked = rankAssignments(
      Array.from({ length: 6 }, (_, i) => make({ id: `t${i}`, title: `T${i}`, course: `C${i}` })),
      TODAY,
    );
    const plan = buildPlan(ranked, 120);
    expect(plan.decisions).toHaveLength(6);
    expect(plan.decisions.filter((d) => d.allocatedMinutes === 0).every((d) => d.reason.length > 0)).toBe(true);
    expect(planToMarkdown(plan, TODAY)).toContain("## Today's study blocks");
  });
});

describe("weeklyLoad", () => {
  it("buckets remaining effort into the next 7 days with overdue on today", () => {
    const load = weeklyLoad(
      [
        make({ due: "2026-11-18", effortMinutes: 30 }),
        make({ due: TODAY, effortMinutes: 60 }),
        make({ due: "2026-11-23", effortMinutes: null }),
        make({ due: "2026-12-30" }),
      ],
      TODAY,
    );
    expect(load).toHaveLength(7);
    expect(load[0]).toEqual({ date: TODAY, minutes: 90, count: 2 });
    expect(load[2].minutes).toBe(60);
  });
});

describe("fairShareToday", () => {
  it("schedules everything for due-today work and spreads the rest until the due date", () => {
    expect(fairShareToday({ daysToDue: 0, remainingMinutes: 200 })).toBe(200);
    expect(fairShareToday({ daysToDue: -3, remainingMinutes: 45 })).toBe(45);
    expect(fairShareToday({ daysToDue: 4, remainingMinutes: 240 })).toBe(60);
    expect(fairShareToday({ daysToDue: 10, remainingMinutes: 30 })).toBe(15);
  });
  it("lets a due-today item into the plan ahead of a bigger far-away project", () => {
    const ranked = rankAssignments(
      [
        make({ id: "big", title: "Big", course: "Bio", effortMinutes: 300, weight: 30, due: "2026-11-24" }),
        make({ id: "today", title: "Today", course: "Hist", effortMinutes: 45, weight: 1, due: TODAY }),
      ],
      TODAY,
    );
    const plan = buildPlan(ranked, 90);
    expect(plan.decisions.find((d) => d.assignmentId === "today")?.allocatedMinutes).toBe(45);
  });
});
