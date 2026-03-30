"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseForm, createJob, getToken, type ParsedForm, type ParsedQuestion } from "@/lib/api";

// Distribution config shape per question
interface QuestionConfig {
  type: string;
  distribution: Record<string, number>;
}

function StepIndicator({ current }: { current: number }) {
  const steps = ["Paste URL", "Configure", "Submit"];
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
            ${i < current ? "bg-blue-600 text-white" :
              i === current ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
            {i < current ? "✓" : i + 1}
          </div>
          <span className={`text-sm ${i === current ? "font-medium" : "text-gray-400"}`}>{label}</span>
          {i < steps.length - 1 && <div className="w-8 h-px bg-gray-200 mx-1" />}
        </div>
      ))}
    </div>
  );
}

// Step 1 — URL input
function Step1({ onParsed }: { onParsed: (form: ParsedForm) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleParse() {
    if (!url.trim()) return;
    setError(""); setLoading(true);
    try {
      const form = await parseForm(url.trim());
      onParsed(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse form");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Google Form URL</label>
        <input
          type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://docs.google.com/forms/d/e/..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={e => e.key === "Enter" && handleParse()}
        />
        <p className="text-xs text-gray-400 mt-1">Paste the URL of any public Google Form</p>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        onClick={handleParse} disabled={loading || !url.trim()}
        className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Parsing…" : "Parse form →"}
      </button>
    </div>
  );
}

// Step 2 — distribution config per question
function Step2({
  form, config, onChange, onNext, onBack,
}: {
  form: ParsedForm;
  config: Record<string, QuestionConfig>;
  onChange: (entryId: string, option: string, pct: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  function isValid(q: ParsedQuestion) {
    const c = config[`entry.${q.entry_id}`];
    if (!c) return false;
    const total = Object.values(c.distribution).reduce((a, b) => a + b, 0);
    return total === 100;
  }
  const allValid = form.questions.every(isValid);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Set the distribution for each question. Each question must sum to 100%.
      </p>
      {form.questions.map(q => {
        const key = `entry.${q.entry_id}`;
        const dist = config[key]?.distribution ?? {};
        const total = Object.values(dist).reduce((a, b) => a + b, 0);
        return (
          <div key={q.entry_id} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-sm">{q.title}</p>
              <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0
                ${total === 100 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                {total}%
              </span>
            </div>
            <div className="space-y-2">
              {q.options.map(opt => (
                <div key={opt.label} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-40 truncate">{opt.label}</span>
                  <input
                    type="number" min={0} max={100}
                    value={dist[opt.label] ?? 0}
                    onChange={e => onChange(key, opt.label, Number(e.target.value))}
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
        <button onClick={onNext} disabled={!allValid}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          Continue →
        </button>
      </div>
    </div>
  );
}

// Step 3 — count, delay, and submit
function Step3({
  form, config, onBack, onSubmit, submitting,
}: {
  form: ParsedForm;
  config: Record<string, QuestionConfig>;
  onBack: () => void;
  onSubmit: (count: number, delay: number) => void;
  submitting: boolean;
}) {
  const [count, setCount] = useState(10);
  const [delay, setDelay] = useState(1000);

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1">Number of submissions</label>
        <input type="number" min={1} max={10000} value={count}
          onChange={e => setCount(Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Delay between submissions (ms)</label>
        <input type="number" min={0} max={60000} value={delay}
          onChange={e => setDelay(Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">1000ms = 1 second. Use 0 for no delay.</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
        <p className="font-medium text-gray-700">Summary</p>
        <p className="text-gray-500">Form: <span className="text-gray-800">{form.title}</span></p>
        <p className="text-gray-500">Questions configured: <span className="text-gray-800">{form.questions.length}</span></p>
        <p className="text-gray-500">Submissions: <span className="text-gray-800">{count}</span></p>
        <p className="text-gray-500">Estimated time: <span className="text-gray-800">~{Math.round(count * delay / 1000)}s</span></p>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
        <button onClick={() => onSubmit(count, delay)} disabled={submitting}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "Creating job…" : "Start job →"}
        </button>
      </div>
    </div>
  );
}

// Main page — orchestrates the 3 steps
export default function NewJobPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ParsedForm | null>(null);
  const [config, setConfig] = useState<Record<string, QuestionConfig>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  function handleParsed(parsedForm: ParsedForm) {
    setForm(parsedForm);
    // Initialise config with 0% for all options
    const initial: Record<string, QuestionConfig> = {};
    parsedForm.questions.forEach(q => {
      const key = `entry.${q.entry_id}`;
      initial[key] = {
        type: q.question_type,
        distribution: Object.fromEntries(q.options.map(o => [o.label, 0])),
      };
    });
    setConfig(initial);
    setStep(1);
  }

  function handleDistChange(entryKey: string, option: string, pct: number) {
    setConfig(prev => ({
      ...prev,
      [entryKey]: { ...prev[entryKey], distribution: { ...prev[entryKey].distribution, [option]: pct } },
    }));
  }

  async function handleSubmit(count: number, delay: number) {
    if (!form) return;
    setError(""); setSubmitting(true);
    try {
      const fullConfig = { ...config, form_id: form.form_id };
      const job = await createJob({
        form_url: `https://docs.google.com/forms/d/e/${form.form_id}/viewform`,
        form_title: form.title,
        total_count: count,
        delay_ms: delay,
        config: fullConfig,
      });
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 text-sm">← Dashboard</Link>
        <h1 className="font-semibold">New job</h1>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">
        <StepIndicator current={step} />
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {step === 0 && <Step1 onParsed={handleParsed} />}
        {step === 1 && form && (
          <Step2 form={form} config={config} onChange={handleDistChange}
            onNext={() => setStep(2)} onBack={() => setStep(0)} />
        )}
        {step === 2 && form && (
          <Step3 form={form} config={config} onBack={() => setStep(1)}
            onSubmit={handleSubmit} submitting={submitting} />
        )}
      </main>
    </div>
  );
}
