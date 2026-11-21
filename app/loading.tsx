export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="h-14 border-b border-zinc-200/80 bg-white" />
      <main className="mx-auto max-w-6xl animate-pulse space-y-6 px-4 py-8 sm:px-6">
        <div className="space-y-2">
          <div className="h-3 w-40 rounded bg-zinc-200" />
          <div className="h-8 w-56 rounded bg-zinc-200" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 rounded-xl border border-zinc-200 bg-white" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-96 rounded-xl border border-zinc-200 bg-white" />
          <div className="h-96 rounded-xl border border-zinc-200 bg-white" />
        </div>
        <p className="text-center text-xs text-zinc-400">Reading your Student OS…</p>
      </main>
    </div>
  );
}
