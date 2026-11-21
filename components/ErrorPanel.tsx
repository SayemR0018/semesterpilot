import Link from "next/link";

export default function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-lg place-items-center p-6">
      <div className="w-full rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-md bg-zinc-900 text-[13px] font-semibold text-white">S</div>
          <span className="text-[15px] font-semibold tracking-tight">SemesterPilot</span>
        </div>
        <h1 className="mt-6 text-lg font-semibold text-zinc-900">Couldn&apos;t load your Notion Student OS</h1>
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 font-mono text-xs break-words text-red-700">{message}</p>
        <ol className="mt-5 space-y-3 text-sm text-zinc-600">
          {[
            <>
              <code className="text-zinc-900">NOTION_API_KEY</code> is set in <code>.env.local</code> (or Vercel env vars) and valid.
            </>,
            <>
              <strong className="font-medium text-zinc-900">Share your databases with the integration.</strong> Open Courses and
              Assignments in Notion, then ••• → Connections → add your integration.
            </>,
            <>
              Wrong database picked? Set IDs or property names in <code className="text-zinc-900">notion.config.ts</code>.
            </>,
            <>
              Just exploring? Set <code className="text-zinc-900">USE_MOCK=true</code> and restart.
            </>,
          ].map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-zinc-200 text-[11px] text-zinc-500">{i + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
        <Link href="/" className="mt-6 inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700">
          Try again
        </Link>
      </div>
    </main>
  );
}
