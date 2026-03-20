import axios from "axios";

import { runAppiumTask } from "./appiumExecutor.js";
import { restartAdbServer, scanAndroidDeviceStates } from "./adbScanner.js";

const API_BASE = process.env.API_BASE || "http://localhost:8001/api";
const USERNAME = process.env.AGENT_USER || "local-agent";
const POLL_MS = Number(process.env.POLL_MS || "4000");
const EXECUTE_REAL = process.env.EXECUTE_REAL_APPIUM === "true";
const AGENT_PLATFORM = process.env.AGENT_PLATFORM || "android";
const MAX_RETRY = Number(process.env.TASK_MAX_RETRY || "1");
const RETRY_ON_TYPES = (process.env.RETRY_ON_TYPES || "connection_error,timeout,session_start_failed")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

function classifyFinalFailure(errorMessage) {
  const message = String(errorMessage || "").toLowerCase();
  if (message.includes("no such element") || message.includes("element could not be located")) {
    return "locator_not_found";
  }
  if (message.includes("session") && message.includes("not created")) {
    return "session_start_failed";
  }
  if (message.includes("case not found")) {
    return "case_fetch_failed";
  }
  if (message.includes("timeout")) {
    return "timeout";
  }
  if (message.includes("connection") || message.includes("refused")) {
    return "connection_error";
  }
  return "exception";
}

function canRetryFailure(failureType) {
  return RETRY_ON_TYPES.includes(failureType);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculatePorts(deviceId) {
  const seed = [...deviceId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    appiumPort: 4723 + (seed % 30),
    systemPort: 8200 + (seed % 80),
    chromedriverPort: 9515 + (seed % 50)
  };
}

async function reportTask(taskId, payload) {
  await axios.post(`${API_BASE}/agents/tasks/${taskId}/report`, payload);
}

async function fetchCase(caseId) {
  const res = await axios.get(`${API_BASE}/cases/${caseId}`);
  return res.data;
}

async function executeTask(task) {
  const ports = calculatePorts(task.device_id);
  const testCase = await fetchCase(task.case_id);

  await reportTask(task.id, {
    status: "running",
    progress: 10,
    log_line: `start ${task.id} device=${task.device_id} ports=${JSON.stringify(ports)}`
  });

  let assertions;
  let logs = [];
  let screenshotBase64 = null;
  let pageSource = null;

  let attempt = 0;
  let lastError = null;
  while (attempt <= MAX_RETRY) {
    attempt += 1;
    try {
      await reportTask(task.id, {
        status: "running",
        progress: Math.min(50, 10 + attempt * 10),
        log_line: `attempt ${attempt}/${MAX_RETRY + 1}`
      });

      if (EXECUTE_REAL) {
        const result = await runAppiumTask({ task, testCase, ports });
        assertions = result.assertions;
        logs = result.logs;
        screenshotBase64 = result.screenshotBase64;
        pageSource = result.pageSource;
      } else {
        await sleep(800);
        assertions = [
          {
            type: "text",
            expected: testCase.expected,
            actual: testCase.expected,
            passed: true
          },
          {
            type: "ui_state",
            expected: "Main tab visible",
            actual: "Main tab visible",
            passed: true
          },
          {
            type: "navigation",
            expected: "Splash -> Login -> Home",
            actual: "Splash -> Login -> Home",
            passed: true
          }
        ];
        logs = ["mock execution path"];
        pageSource = `<mock app='${task.app}' case='${task.case_id}'/>`;
      }
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      const failureType = classifyFinalFailure(error.message || error);
      await reportTask(task.id, {
        status: "running",
        progress: Math.min(90, 50 + attempt * 10),
        log_line: `attempt ${attempt} failed [${failureType}]: ${String(error.message || error)}`
      });
      if (!canRetryFailure(failureType)) {
        break;
      }
      if (attempt > MAX_RETRY) {
        break;
      }
      await sleep(1000);
    }
  }

  if (lastError) {
    const failureType = classifyFinalFailure(lastError.message || lastError);
    const failAssertions = [
      {
        type: failureType,
        expected: "no runtime error",
        actual: String(lastError.message || lastError),
        passed: false
      }
    ];
    await reportTask(task.id, {
      status: "failed",
      progress: 100,
      assertions: failAssertions,
      log_line: `task failed after retry: ${String(lastError.message || lastError)}`,
      screenshot_base64: screenshotBase64,
      page_source: pageSource
    });
    return;
  }

  await reportTask(task.id, {
    status: "running",
    progress: 60,
    log_line: `execute app=${task.app} case=${task.case_id} title=${testCase.title} platform=${AGENT_PLATFORM}`
  });

  const failed = assertions.some((it) => it.passed === false);
  for (const line of logs) {
    await reportTask(task.id, {
      status: "running",
      progress: 80,
      log_line: line
    });
  }

  await reportTask(task.id, {
    status: failed ? "failed" : "completed",
    progress: 100,
    assertions,
    log_line: failed ? "assertion failed" : "task completed",
    screenshot_base64: screenshotBase64,
    page_source: pageSource
  });
}

async function syncDevices() {
  const scan = await scanAndroidDeviceStates();
  if (scan.error) {
    console.error(`[agent] adb scan error: ${scan.error}`);
    return [];
  }

  const unauthorized = scan.statuses.filter((d) => d.state === "unauthorized").map((d) => d.id);
  const offline = scan.statuses.filter((d) => d.state === "offline").map((d) => d.id);
  if (unauthorized.length > 0) {
    console.warn(`[agent] unauthorized devices: ${unauthorized.join(", ")} (폰에서 USB 디버깅 권한 허용 필요)`);
  }
  if (offline.length > 0) {
    console.warn(`[agent] offline devices: ${offline.join(", ")} (케이블/adb 재연결 필요)`);
  }

  const deviceIds = scan.connected;
  for (const id of deviceIds) {
    await axios.post(`${API_BASE}/devices`, {
      id,
      model: "android-device",
      platform: "Android",
      os_version: "unknown",
      connected_by: USERNAME
    });
  }
  return deviceIds;
}

async function claimTask(deviceIds) {
  const res = await axios.post(`${API_BASE}/agents/tasks/claim`, {
    agent_name: USERNAME,
    device_ids: deviceIds
  });
  return res.data.task;
}

async function bootstrap() {
  console.log(`[agent] start user=${USERNAME} api=${API_BASE} platform=${AGENT_PLATFORM} real=${EXECUTE_REAL}`);

  const adbRestart = await restartAdbServer();
  if (!adbRestart.ok) {
    console.warn(`[agent] adb restart failed: ${adbRestart.message}`);
  }

  await axios.post(`${API_BASE}/auth/login`, {
    username: USERNAME,
    password: "agent-password"
  });

  setInterval(async () => {
    try {
      const deviceIds = await syncDevices();
      if (deviceIds.length === 0) {
        return;
      }
      const task = await claimTask(deviceIds);
      if (!task) {
        return;
      }
      await executeTask(task);
    } catch (error) {
      console.error("sync failed", error.message);
    }
  }, POLL_MS);
}

bootstrap();
