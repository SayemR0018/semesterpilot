import Link from "next/link";

export default function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-rose-700">Couldn&apos;t load your Notion Student OS</h1>
        <p className="mt-2 font-mono text-sm break-words text-slate-700">{message}</p>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Checklist</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <code>NOTION_API_KEY</code> is set in <code>.env.local</code> (or Vercel env vars) and is valid.
            </li>
            <li>
              <strong>Share your databases with the integration:</strong> open your Courses and Assignments databases in
              Notion, click <em>•••</em> → <em>Connections</em> → add your integration (personal access tokens can see
              everything you can).
            </li>
            <li>
              If auto-discovery picks the wrong database, set the IDs and property names in <code>notion.config.ts</code>.
            </li>
            <li>
              Want to try it without Notion? Set <code>USE_MOCK=true</code> and restart.
            </li>
          </ol>
        </div>
        <Link href="/" className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Retry
        </Link>
      </div>
    </main>
  );
}
