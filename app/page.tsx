import { connection } from "next/server";
import Dashboard from "@/components/Dashboard";
import ErrorPanel from "@/components/ErrorPanel";
import { coachEnabled } from "@/lib/coach";
import { loadAssignments } from "@/lib/data";
import type { LoadResult } from "@/lib/types";

export default async function Home() {
  await connection();
  let data: LoadResult | null = null;
  let error = "";
  try {
    data = await loadAssignments();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return data ? <Dashboard data={data} aiEnabled={coachEnabled()} /> : <ErrorPanel message={error} />;
}
