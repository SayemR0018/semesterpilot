"use client";

import { useState } from "react";
import type { CoachResult } from "@/lib/types";
import { Card, CardHeader } from "./ui";

type Props = {
  enabled: boolean;
  coach: CoachResult | null;
  onCoach: (c: CoachResult) => void;
  minutes: number;
  startTime: string;
  disabled: boolean;
};

export function CoachCard({ enabled, coach, onCoach, minutes, startTime, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, startTime }),
      });
      const json = (await res.json()) as { ok: boolean; coach?: CoachResult; error?: string; hint?: string };
      if (json.ok && json.coach) onCoach(json.coach);
      else setError([json.error, json.hint].filter(Boolean).join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  const button = (
    <button
      onClick={run}
      disabled={!enabled || loading || disabled}
      className="h-7 rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Thinking…" : coach ? "Regenerate" : "Generate"}
    </button>
  );

  return (
    <Card>
      <CardHeader
        title="AI study coach"
        action={
          <div className="flex items-center gap-2">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">OpenAI</span>
            {button}
          </div>
        }
      />
      <div className="px-5 pb-5 text-sm">
        {loading && (
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-2/3 rounded bg-zinc-100" />
            <div className="h-3 w-full rounded bg-zinc-100" />
            <div className="h-3 w-5/6 rounded bg-zinc-100" />
          </div>
        )}
        {!loading && error && <p className="text-xs text-red-600">{error}</p>}
        {!loading && !error && coach && (
          <div className="space-y-2">
            <p className="font-medium text-zinc-900">{coach.headline}</p>
            <p className="text-zinc-600">{coach.briefing}</p>
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              <span className="font-medium text-zinc-900">Watch out:</span> {coach.watchOut}
            </p>
            <p className="text-xs text-zinc-400">First steps are added to each block and included when you push to Notion.</p>
          </div>
        )}
        {!loading && !error && !coach && (
          <p className="text-zinc-500">
            {enabled
              ? "Get a short briefing for today and a concrete first step for every block."
              : "Add OPENAI_API_KEY to .env.local to get a daily briefing and a first step for every block."}
          </p>
        )}
      </div>
    </Card>
  );
}
