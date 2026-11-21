import "server-only";
import sample from "@/data/sample.json";
import { addDays } from "./scoring";
import type { Assignment, LoadResult } from "./types";

export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: process.env.PLANNER_TIMEZONE || undefined });
}

export function isMockMode(): boolean {
  return !process.env.NOTION_API_KEY || process.env.USE_MOCK === "true";
}

export function loadMockAssignments(today: string): Assignment[] {
  const courses = new Map(sample.courses.map((c) => [c.id, c.name]));
  return sample.assignments.map((a) => ({
    id: a.id,
    title: a.title,
    course: courses.get(a.courseId) ?? "Unassigned",
    due: addDays(today, a.dueOffsetDays),
    status: a.status,
    effortMinutes: a.effortMinutes,
    effortDoneMinutes: a.effortDoneMinutes ?? null,
    weight: a.weight,
    priority: a.priority,
    url: null,
  }));
}

export async function loadAssignments(): Promise<LoadResult> {
  const today = todayISO();
  return { mode: "mock", assignments: loadMockAssignments(today), today, warnings: [] };
}
