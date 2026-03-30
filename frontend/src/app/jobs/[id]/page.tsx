"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getJob, cancelJob, getToken, type Job } from "@/lib/api";

const DONE = ["completed", "failed", "cancelled"];

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
      <div
        className="bg-blue-500 h-3 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: Job["status"] }) {
  const colors: Record<string, string> = {
    pending:   "bg-gray-100 text-gray-600",
    running:   "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed:    "bg-red-100 text-red-700",
    cancelled: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status]}`}>
      {status}
    </span>
  );
}

export default function JobPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const fetchJob = useCallback(async () => {
    try {
      const data = await getJob(id);
      setJob(data);
      return data;
    } catch {
      setError("Failed to load job");
      return null;
    }
  }, [id]);

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }

    fetchJob().then(data => {
      if (!data || DONE.includes(data.status)) return;

      const interval = setInterval(async () => {
        const updated = await fetchJob();
        if (updated && DONE.includes(updated.status)) clearInterval(interval);
      }, 3000);

      return () => clearInterval(interval);
    });
  }, [router, fetchJob]);

  async function handleCancel() {
    if (!job) return;
    setCancelling(true);
    try {
      const updated = await cancelJob(job.id);
      setJob(updated);
    } catch {
      setError("Failed to cancel job");
    } finally {
      setCancelling(false);
    }
  }

  if (!job) return <div className="p-8 text-gray-500">{error || "Loading…"}</div>;

  const pct = job.total_count > 0
    ? Math.round(((job.success_count + job.fail_count) / job.total_count) * 100)
    : 0;
  const done = DONE.includes(job.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 text-sm">← Dashboard</Link>
        <h1 className="font-semibold">{job.form_title}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

          <div className="flex items-center justify-between">
            <StatusBadge status={job.status} />
            {!done && job.status === "running" && (
              <button
                onClick={handleCancel} disabled={cancelling}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {cancelling ? "Cancelling…" : "Cancel job"}
              </button>
            )}
          </div>

          <div>
            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <span>{job.success_count + job.fail_count} / {job.total_count} processed</span>
              <span>{pct}%</span>
            </div>
            <ProgressBar value={job.success_count + job.fail_count} total={job.total_count} />
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{job.success_count}</div>
              <div className="text-xs text-gray-400 mt-1">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{job.fail_count}</div>
              <div className="text-xs text-gray-400 mt-1">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-400">
                {job.total_count - job.success_count - job.fail_count}
              </div>
              <div className="text-xs text-gray-400 mt-1">Remaining</div>
            </div>
          </div>

          {!done && (
            <p className="text-xs text-gray-400 text-center">Refreshing every 3 seconds…</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Form URL</span>
            <a href={job.form_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate ml-4 max-w-xs">{job.form_url}</a>
          </div>
          <div className="flex justify-between"><span className="text-gray-500">Total submissions</span><span>{job.total_count}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Delay between sends</span><span>{job.delay_ms}ms</span></div>
          {job.started_at && <div className="flex justify-between"><span className="text-gray-500">Started</span><span>{new Date(job.started_at).toLocaleString()}</span></div>}
          {job.completed_at && <div className="flex justify-between"><span className="text-gray-500">Completed</span><span>{new Date(job.completed_at).toLocaleString()}</span></div>}
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </main>
    </div>
  );
}
