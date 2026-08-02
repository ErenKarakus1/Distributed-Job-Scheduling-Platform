const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "change-me-admin-password";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed with ${response.status}: ${text}`);
  }

  return body;
}

async function waitForHealth() {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.SMOKE_HEALTH_TIMEOUT_MS ?? 120000);

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const health = await request("/health");
      if (health?.status === "ok") return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error(`API gateway did not become healthy within ${timeoutMs}ms`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  await waitForHealth();

  const services = await request("/health/services");
  assert(services?.["job-service"]?.statusCode === 200, "Expected healthy job service");
  assert(services?.["execution-service"]?.statusCode === 200, "Expected healthy execution service");
  assert(services?.["scheduler-service"]?.statusCode === 200, "Expected healthy scheduler service");
  assert(services?.["worker-service"]?.statusCode === 200, "Expected healthy worker service");

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
    }),
  });
  assert(login?.token, "Expected login token");

  const authHeaders = { authorization: `Bearer ${login.token}` };

  const apiKey = await request("/internal/api-keys", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: `Smoke key ${new Date().toISOString()}` }),
  });
  assert(apiKey?.apiKey, "Expected created API key");

  const runAt = new Date(Date.now() + 60_000).toISOString();

  const job = await request("/api/jobs", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: `Smoke job ${new Date().toISOString()}`,
      type: "ONE_TIME",
      method: "GET",
      url: `${baseUrl}/health`,
      runAt,
      maxAttempts: 2,
      retryInitialDelayMs: 1000,
      retryMaxDelayMs: 5000,
      backoffType: "FIXED",
    }),
  });
  assert(job?.id, "Expected created job id");

  const manualExecution = await request(`/api/jobs/${job.id}/run`, {
    method: "POST",
    headers: authHeaders,
  });
  assert(manualExecution?.id, "Expected manual execution id");

  await request("/api/schedule/run", {
    method: "POST",
    headers: authHeaders,
  });

  const executions = await request("/api/executions?limit=10", {
    headers: authHeaders,
  });
  assert(Array.isArray(executions?.data), "Expected execution list");

  await request("/api/recover/stalled", {
    method: "POST",
    headers: authHeaders,
  });

  const metrics = await request("/api/metrics/overview", {
    headers: authHeaders,
  });
  assert(metrics, "Expected metrics overview");

  const deadLetters = await request("/api/dead-letter?limit=10", {
    headers: authHeaders,
  });
  assert(Array.isArray(deadLetters?.data), "Expected dead-letter list");

  const auditEvents = await request("/api/audit-events?limit=10", {
    headers: authHeaders,
  });
  assert(Array.isArray(auditEvents?.data), "Expected audit events");

  console.log("Smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
