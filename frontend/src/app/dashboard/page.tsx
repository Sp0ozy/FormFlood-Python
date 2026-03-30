"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listJobs, createJob, getToken, clearToken, type JobListItem } from "@/lib/api";

function StatusBadge({ status }: { status: JobListItem["status"] }) {
  const colors: Record<string, string> = {
    pending:   "bg-gray-100 text-gray-600",
    running:   "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed:    "bg-red-100 text-red-700",
    cancelled: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rerunning, setRerunning] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    listJobs()
      .then(setJobs)
      .catch(() => setError("Failed to load jobs"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleRerun(job: JobListItem) {
    setRerunning(job.id);
    try {
      const fullJob = await import("@/lib/api").then(m => m.getJob(job.id));
      const newJob = await createJob({
        form_url: fullJob.form_url,
        form_title: fullJob.form_title,
        total_count: fullJob.total_count,
        delay_ms: fullJob.delay_ms,
        config: fullJob.config as Record<string, unknown>,
      });
      router.push(`/jobs/${newJob.id}`);
    } catch {
      setError("Failed to re-run job");
      setRerunning(null);
    }
  }

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="font-bold text-lg">FormFlood</h1>
        <div className="flex items-center gap-4">
          <Link href="/new" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
            New job
          </Link>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold mb-6">Your jobs</h2>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {jobs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="mb-4">No jobs yet.</p>
            <Link href="/new" className="text-blue-600 hover:underline text-sm">Create your first job →</Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Form</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Progress</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map(job => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${job.id}`} className="font-medium hover:text-blue-600 truncate block max-w-xs">
                        {job.form_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-3 text-gray-500">
                      {job.success_count}/{job.total_count}
                      {job.fail_count > 0 && <span className="text-red-500 ml-1">({job.fail_count} failed)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRerun(job)}
                        disabled={rerunning === job.id}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        {rerunning === job.id ? "Starting…" : "Re-run"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
