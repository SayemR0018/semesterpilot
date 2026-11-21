"use client";
import ErrorPanel from "@/components/ErrorPanel";

export default function Error({ error }: { error: Error }) {
  return <ErrorPanel message={error.message} />;
}
