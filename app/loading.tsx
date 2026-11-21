export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl animate-pulse space-y-4 p-4 sm:p-6">
      <div className="h-10 w-64 rounded-lg bg-slate-200" />
      <div className="h-16 rounded-2xl bg-slate-200" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-96 rounded-2xl bg-slate-200 lg:col-span-2" />
        <div className="h-96 rounded-2xl bg-slate-200" />
      </div>
      <p className="text-center text-sm text-slate-500">Reading your Student OS from Notion…</p>
    </main>
  );
}
