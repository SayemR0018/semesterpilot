import { NextResponse } from "next/server";
import { coachToMarkdown, type CoachResult } from "@/lib/coach";
import { isMockMode } from "@/lib/data";
import { describeNotionError, pushPlanToNotion } from "@/lib/notion";
import { planFromRequest, type PlanRequest } from "@/lib/plan-service";
import { planToMarkdown } from "@/lib/scoring";

const clean = (s: unknown, max = 400) => (typeof s === "string" ? s.slice(0, max) : "");

/** Accept coach notes from the client but sanitize them: they are only rendered as text. */
function sanitizeCoach(c: unknown): CoachResult | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Partial<CoachResult>;
  return {
    headline: clean(o.headline, 120),
    briefing: clean(o.briefing),
    watchOut: clean(o.watchOut),
    steps: Array.isArray(o.steps)
      ? o.steps.slice(0, 20).map((s) => ({ assignmentId: clean(s?.assignmentId, 64), firstStep: clean(s?.firstStep, 200) }))
      : [],
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PlanRequest & { coach?: unknown };
  try {
    const { data, plan } = await planFromRequest(body);
    const title = `SemesterPilot Plan - ${data.today}`;
    const coach = sanitizeCoach(body.coach);
    const titles = new Map(plan.decisions.map((d) => [d.assignmentId, d.title]));
    const markdown = [planToMarkdown(plan, data.today), coach ? coachToMarkdown(coach, titles) : ""].filter(Boolean).join("\n\n");
    if (isMockMode()) return NextResponse.json({ ok: true, mode: "mock", title, markdown });
    const result = await pushPlanToNotion(plan, title, markdown, data.today);
    return NextResponse.json({ ok: true, mode: "notion", title, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, ...describeNotionError(err) }, { status: 500 });
  }
}
