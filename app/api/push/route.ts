import { NextResponse } from "next/server";
import { isMockMode, loadAssignments } from "@/lib/data";
import { describeNotionError, pushPlanToNotion } from "@/lib/notion";
import { buildPlan, planToMarkdown, rankAssignments } from "@/lib/scoring";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { minutes?: number; startTime?: string };
  const minutes = Math.min(Math.max(Number(body.minutes) || 180, 15), 960);
  const startTime = /^\d{2}:\d{2}$/.test(body.startTime ?? "") ? body.startTime : "16:00";
  try {
    const data = await loadAssignments();
    const plan = buildPlan(rankAssignments(data.assignments, data.today), minutes, { startTime });
    const title = `SemesterPilot Plan - ${data.today}`;
    const markdown = planToMarkdown(plan, data.today);
    if (isMockMode()) return NextResponse.json({ ok: true, mode: "mock", title, markdown });
    const result = await pushPlanToNotion(plan, title, markdown, data.today);
    return NextResponse.json({ ok: true, mode: "notion", title, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, ...describeNotionError(err) },
      { status: 500 },
    );
  }
}
