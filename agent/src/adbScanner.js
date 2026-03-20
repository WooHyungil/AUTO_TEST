import { exec } from "node:child_process";

function parseAdbDevices(raw) {
  const lines = raw
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  for (const line of lines) {
    const cols = line.split(/\s+/).filter(Boolean);
    if (cols.length < 2) {
      continue;
    }
    parsed.push({
      id: cols[0],
      state: cols[1]
    });
  }
  return parsed;
}

export function scanConnectedAndroidDevices() {
  return new Promise((resolve) => {
    exec("adb devices", (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }
      const statuses = parseAdbDevices(stdout);
      const connected = statuses.filter((d) => d.state === "device").map((d) => d.id);
      resolve(connected);
    });
  });
}

export function scanAndroidDeviceStates() {
  return new Promise((resolve) => {
    exec("adb devices", (error, stdout) => {
      if (error) {
        resolve({ connected: [], statuses: [], error: String(error.message || error) });
        return;
      }
      const statuses = parseAdbDevices(stdout);
      const connected = statuses.filter((d) => d.state === "device").map((d) => d.id);
      resolve({ connected, statuses, error: null });
    });
  });
}

export function restartAdbServer() {
  return new Promise((resolve) => {
    exec("adb kill-server && adb start-server", (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: String(error.message || error) });
        return;
      }
      resolve({ ok: true, message: `${stdout || ""}${stderr || ""}`.trim() });
    });
  });
}
