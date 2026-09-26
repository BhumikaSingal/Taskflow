const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${API_URL}/api/csrf`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Could not establish a secure session");
  const data = await response.json();
  csrfToken = data.csrf_token;
  return csrfToken;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !path.startsWith("/auth/")) {
    const token = await ensureCsrf();
    if (token) {
      headers["X-CSRF-Token"] = token;
    } else {
      headers["X-CSRF-Token"] = ""; // Fallback value if null
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

export function googleLoginUrl() {
  return `${API_URL}/auth/google`;
}

export function resetCsrf() {
  csrfToken = null;
}
