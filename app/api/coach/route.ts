import { NextResponse } from "next/server";
import { coachEnabled, coachPlan } from "@/lib/coach";
import { planFromRequest, type PlanRequest } from "@/lib/plan-service";

export async function POST(req: Request) {
  if (!coachEnabled()) {
    return NextResponse.json(
      { ok: false, error: "AI coach is off.", hint: "Add OPENAI_API_KEY to .env.local and restart." },
      { status: 400 },
    );
  }
  try {
    const { data, ranked, plan } = await planFromRequest((await req.json().catch(() => ({}))) as PlanRequest);
    if (!plan.blocks.length) return NextResponse.json({ ok: false, error: "Nothing scheduled today to coach on." }, { status: 400 });
    const coach = await coachPlan(plan, ranked, data.today);
    return NextResponse.json({ ok: true, coach });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
