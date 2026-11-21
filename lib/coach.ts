import "server-only";
import type { Plan, ScoredAssignment } from "./scoring";
import type { CoachResult } from "./types";

export type { CoachResult, CoachStep } from "./types";

export const coachEnabled = () => Boolean(process.env.OPENAI_API_KEY);
const MODEL = () => process.env.OPENAI_MODEL || "gpt-6-luna";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "briefing", "steps", "watchOut"],
  properties: {
    headline: { type: "string", description: "Max 8 words, encouraging, specific to today's plan" },
    briefing: { type: "string", description: "2 short sentences: what today is about and why this order" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["assignmentId", "firstStep"],
        properties: {
          assignmentId: { type: "string" },
          firstStep: { type: "string", description: "One concrete action for the first 10 minutes, max 18 words" },
        },
      },
    },
    watchOut: { type: "string", description: "One sentence about the biggest risk this week (unscheduled or heavy days)" },
  },
} as const;

/** Only titles, course names, minutes and due offsets are sent to OpenAI; no Notion IDs beyond opaque row IDs. */
export async function coachPlan(plan: Plan, ranked: ScoredAssignment[], today: string): Promise<CoachResult> {
  const byId = new Map(ranked.map((a) => [a.id, a]));
  const scheduled = plan.decisions.filter((d) => d.allocatedMinutes > 0);
  const payload = {
    today,
    availableMinutes: plan.availableMinutes,
    blocks: scheduled.map((d) => ({
      assignmentId: d.assignmentId,
      title: d.title,
      course: d.course,
      minutesToday: d.allocatedMinutes,
      minutesRemaining: d.remainingMinutes,
      daysToDue: byId.get(d.assignmentId)?.daysToDue ?? null,
      reason: d.reason,
    })),
    notScheduledToday: plan.decisions
      .filter((d) => d.allocatedMinutes === 0)
      .slice(0, 6)
      .map((d) => ({ title: d.title, course: d.course, daysToDue: byId.get(d.assignmentId)?.daysToDue ?? null, minutes: d.remainingMinutes })),
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL(),
      input: [
        {
          role: "system",
          content:
            "You are a calm, practical study coach for a university student. The schedule is already decided by a deterministic planner; do not reorder or add items. Give one concrete first step per scheduled block (use the exact assignmentId). Be specific to the assignment title. No emojis.",
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
      text: { format: { type: "json_schema", name: "study_coach", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  };
  if (!res.ok) throw new Error(json.error?.message ?? `OpenAI request failed (${res.status})`);
  const content = json.output?.flatMap((o) => (o.type === "message" ? (o.content ?? []) : [])) ?? [];
  const refusal = content.find((c) => c.type === "refusal")?.refusal;
  if (refusal) throw new Error(`The model declined: ${refusal}`);
  const text = content.find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no text");
  const parsed = JSON.parse(text) as CoachResult;
  const valid = new Set(scheduled.map((d) => d.assignmentId));
  return { ...parsed, steps: parsed.steps.filter((s) => valid.has(s.assignmentId)) };
}

export function coachToMarkdown(c: CoachResult, titles: Map<string, string>): string {
  return [
    "## Coach notes",
    "",
    `**${c.headline}**`,
    "",
    c.briefing,
    "",
    ...c.steps.map((s) => `- **${titles.get(s.assignmentId) ?? "Task"}**: ${s.firstStep}`),
    "",
    `> ${c.watchOut}`,
  ].join("\n");
}
