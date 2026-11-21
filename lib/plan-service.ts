import "server-only";
import { loadAssignments } from "./data";
import { buildPlan, rankAssignments } from "./scoring";

export type PlanRequest = { minutes?: number; startTime?: string };

/** Validate client input, reload data server-side, and rebuild the plan (never trust a client-sent plan). */
export async function planFromRequest(body: PlanRequest) {
  const minutes = Math.min(Math.max(Number(body.minutes) || 180, 15), 960);
  const startTime = /^\d{2}:\d{2}$/.test(body.startTime ?? "") ? body.startTime : "16:00";
  const data = await loadAssignments();
  const ranked = rankAssignments(data.assignments, data.today);
  return { data, ranked, plan: buildPlan(ranked, minutes, { startTime }) };
}
