const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  plan: string;
  is_active: boolean;
}

export interface ParsedOption {
  label: string;
}

export interface ParsedQuestion {
  entry_id: string;
  title: string;
  question_type: "multiple_choice" | "dropdown" | "checkbox";
  options: ParsedOption[];
}

export interface ParsedForm {
  form_id: string;
  title: string;
  questions: ParsedQuestion[];
}

export interface Job {
  id: string;
  user_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  form_url: string;
  form_title: string;
  total_count: number;
  success_count: number;
  fail_count: number;
  delay_ms: number;
  config: Record<string, unknown>;
  celery_task_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobListItem {
  id: string;
  status: Job["status"];
  form_url: string;
  form_title: string;
  total_count: number;
  success_count: number;
  fail_count: number;
  created_at: string;
}

// ── Token storage ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ff_token");
}

export function setToken(token: string): void {
  localStorage.setItem("ff_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("ff_token");
}

// ── Base fetch ────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }

  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function register(email: string, password: string): Promise<User> {
  return apiFetch<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/jwt/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }
  const data = await res.json();
  return data.access_token as string;
}

// ── Forms ─────────────────────────────────────────────────────────────────────

export async function parseForm(url: string): Promise<ParsedForm> {
  return apiFetch<ParsedForm>("/forms/parse", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export interface CreateJobPayload {
  form_url: string;
  form_title: string;
  total_count: number;
  delay_ms: number;
  config: Record<string, unknown>;
}

export async function createJob(payload: CreateJobPayload): Promise<Job> {
  return apiFetch<Job>("/jobs", { method: "POST", body: JSON.stringify(payload) });
}

export async function listJobs(limit = 20, offset = 0): Promise<JobListItem[]> {
  return apiFetch<JobListItem[]>(`/jobs?limit=${limit}&offset=${offset}`);
}

export async function getJob(id: string): Promise<Job> {
  return apiFetch<Job>(`/jobs/${id}`);
}

export async function cancelJob(id: string): Promise<Job> {
  return apiFetch<Job>(`/jobs/${id}/cancel`, { method: "PATCH" });
}
