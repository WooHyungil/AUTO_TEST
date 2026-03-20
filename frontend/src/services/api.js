const BASE_URL = "/api";

export async function login(username, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

export async function fetchSessions() {
  const res = await fetch(`${BASE_URL}/auth/sessions`);
  return res.json();
}

export async function fetchCases() {
  const res = await fetch(`${BASE_URL}/cases`);
  return res.json();
}

export async function fetchRuns() {
  const res = await fetch(`${BASE_URL}/runs`);
  return res.json();
}

export async function fetchRunTasks(runId) {
  const res = await fetch(`${BASE_URL}/runs/${runId}/tasks`);
  return res.json();
}

export async function fetchQueueSummary() {
  const res = await fetch(`${BASE_URL}/runs/queue/summary`);
  return res.json();
}

export async function fetchDevices() {
  const res = await fetch(`${BASE_URL}/devices`);
  return res.json();
}

export async function fetchAgentStatus() {
  const res = await fetch(`${BASE_URL}/agents/status`);
  return res.json();
}

export async function registerDevice(payload) {
  const res = await fetch(`${BASE_URL}/devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function createRun(payload) {
  const res = await fetch(`${BASE_URL}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function createCase(payload) {
  const res = await fetch(`${BASE_URL}/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function updateRunPriority(runId, priority, meta = {}) {
  const res = await fetch(`${BASE_URL}/runs/${runId}/priority`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priority, actor: meta.actor, reason: meta.reason })
  });
  return res.json();
}

export async function requeueFailureType(runId, failureType) {
  const res = await fetch(`${BASE_URL}/runs/${runId}/requeue-failure-type`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ failure_type: failureType })
  });
  return res.json();
}
