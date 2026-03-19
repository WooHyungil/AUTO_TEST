import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCase,
  createRun,
  fetchCases,
  fetchDevices,
  fetchQueueSummary,
  fetchRunTasks,
  fetchRuns,
  fetchSessions,
  login,
  requeueFailureType,
  updateRunPriority,
} from "../services/api";
import { connectStatusSocket } from "../services/ws";
import { EventFeed } from "../components/EventFeed";
import { StatCard } from "../components/StatCard";

export function DashboardPage() {
  const TASK_ROW_HEIGHT = 92;
  const TASK_WINDOW_SIZE = 24;
  const SLA_RUNNING_KEY = "qa.sla.running.min";
  const SLA_QUEUE_KEY = "qa.sla.queue.min";

  const [username, setUsername] = useState("tester1");
  const [sessions, setSessions] = useState([]);
  const [cases, setCases] = useState([]);
  const [runs, setRuns] = useState([]);
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedApp, setSelectedApp] = useState("Kia");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [taskDetails, setTaskDetails] = useState([]);
  const [failureFilterType, setFailureFilterType] = useState("");
  const [deviceFilterId, setDeviceFilterId] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [focusedTaskId, setFocusedTaskId] = useState("");
  const [pendingFocusTaskId, setPendingFocusTaskId] = useState("");
  const [runPriority, setRunPriority] = useState(3);
  const [runningSlaMinutes, setRunningSlaMinutes] = useState(() => {
    const saved = Number(window.localStorage.getItem(SLA_RUNNING_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 15;
  });
  const [queueSlaMinutes, setQueueSlaMinutes] = useState(() => {
    const saved = Number(window.localStorage.getItem(SLA_QUEUE_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 20;
  });
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [auditWindowMinutes, setAuditWindowMinutes] = useState(60);
  const [auditTypeFilter, setAuditTypeFilter] = useState("");
  const [toast, setToast] = useState({ text: "", level: "info" });
  const [queueSummary, setQueueSummary] = useState({
    queued_by_priority: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    queued_total: 0,
    busy_devices: 0,
    eta_seconds: 0,
    eta_by_priority: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
  });
  const [caseTitle, setCaseTitle] = useState("Kia Login Smoke");
  const [caseExpected, setCaseExpected] = useState("Welcome");
  const [caseStepsText, setCaseStepsText] = useState(
    "wait:1500\ntap:accessibility=Login\nexpect:text=Welcome"
  );
  const [caseValidationErrors, setCaseValidationErrors] = useState([]);
  const refreshTimerRef = useRef(null);
  const taskListRef = useRef(null);
  const [taskScrollTop, setTaskScrollTop] = useState(0);

  const failurePriorityRecommendation = {
    locator_not_found: 4,
    session_start_failed: 5,
    timeout: 4,
    connection_error: 5,
    case_fetch_failed: 3,
    execution_error: 3,
    exception: 3
  };

  function extractEventRefs(packet) {
    const payload = packet?.payload || {};
    let runId = payload.run_id || null;
    let taskId = payload.task_id || null;

    if (packet?.event?.startsWith("run_")) {
      runId = runId || payload.id || null;
    }
    if (packet?.event?.startsWith("task_")) {
      taskId = taskId || payload.id || null;
      runId = runId || payload.run_id || null;
    }

    return { runId, taskId };
  }

  function classifyEventType(eventName) {
    if (eventName === "run_priority_audit") {
      return "priority";
    }
    if (eventName === "task_requeued" || eventName === "task_requeued_manual") {
      return "requeue";
    }
    if (eventName.startsWith("run_") || eventName.startsWith("task_")) {
      return "execution";
    }
    return "other";
  }

  function formatDuration(seconds) {
    const safe = Math.max(0, Number(seconds || 0));
    const m = Math.floor(safe / 60)
      .toString()
      .padStart(2, "0");
    const s = Math.floor(safe % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  }

  const caseTemplates = {
    loginSmoke: {
      title: `${selectedApp} Login Smoke`,
      expected: "Welcome",
      steps: ["wait:1500", "tap:accessibility=Login", "expect:text=Welcome"]
    },
    homeLoad: {
      title: `${selectedApp} Home Load`,
      expected: "Home",
      steps: ["wait:1200", "tap:accessibility=Home", "expect:text=Home"]
    },
    vehicleStatus: {
      title: `${selectedApp} Vehicle Status Check`,
      expected: "Vehicle Status",
      steps: [
        "wait:1200",
        "tap:accessibility=Vehicle",
        "wait:800",
        "expect:text=Vehicle Status"
      ]
    }
  };

  async function loadCore() {
    const [sessionData, caseData, runData, deviceData, queueData] = await Promise.all([
      fetchSessions(),
      fetchCases(),
      fetchRuns(),
      fetchDevices(),
      fetchQueueSummary()
    ]);
    setSessions(sessionData);
    setCases(caseData);
    setRuns(runData);
    setDevices(deviceData);
    setQueueSummary(queueData);

    return runData;
  }

  async function refreshTasks(runId) {
    if (!runId) {
      setTaskDetails([]);
      return;
    }
    const tasks = await fetchRunTasks(runId);
    setTaskDetails(tasks);
  }

  async function loadAll() {
    const runData = await loadCore();
    const nextSelected = selectedRunId || runData[0]?.id || "";
    setSelectedRunId(nextSelected);
    await refreshTasks(nextSelected);
  }

  function scheduleRefresh() {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      loadAll();
      refreshTimerRef.current = null;
    }, 250);
  }

  useEffect(() => {
    window.localStorage.setItem(SLA_RUNNING_KEY, String(runningSlaMinutes));
  }, [runningSlaMinutes]);

  useEffect(() => {
    window.localStorage.setItem(SLA_QUEUE_KEY, String(queueSlaMinutes));
  }, [queueSlaMinutes]);

  function showToast(text, level = "info") {
    setToast({ text, level });
  }

  useEffect(() => {
    if (!toast.text) {
      return;
    }
    const timer = setTimeout(() => setToast({ text: "", level: "info" }), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    loadAll();
    const ws = connectStatusSocket((packet) => {
      setEvents((prev) => {
        const now = new Date().toLocaleTimeString();
        const refs = extractEventRefs(packet);
        if (packet.event === "run_priority_audit") {
          const item = {
            event: packet.event,
            type: "priority",
            time: now,
            ts: Date.now(),
            count: 1,
            message: `${packet.payload?.actor || "system"} changed P${packet.payload?.previous_priority} -> P${packet.payload?.new_priority} (${packet.payload?.reason || "manual"})`,
            actor: packet.payload?.actor || "system",
            runId: packet.payload?.run_id || null,
            taskId: null
          };
          return [item, ...prev].slice(0, 20);
        }
        if (packet.event === "task_requeued" || packet.event === "task_requeued_manual") {
          const prevItem = prev[0];
          const failureType = packet.payload?.failure_type || packet.payload?.assertions?.[0]?.type || "unknown";
          if (prevItem && prevItem.event === packet.event && prevItem.failureType === failureType) {
            const merged = {
              ...prevItem,
              count: (prevItem.count || 1) + 1,
              time: now,
              ts: Date.now(),
              message: `${failureType} requeue aggregated`,
              type: "requeue",
              runId: refs.runId || prevItem.runId,
              taskId: refs.taskId || prevItem.taskId
            };
            return [merged, ...prev.slice(1)].slice(0, 20);
          }
          const item = {
            event: packet.event,
            time: now,
            ts: Date.now(),
            count: 1,
            failureType,
            message: `${failureType} requeue triggered`,
            type: "requeue",
            runId: refs.runId,
            taskId: refs.taskId
          };
          return [item, ...prev].slice(0, 20);
        }

        const incoming = {
          event: packet.event,
          time: now,
          ts: Date.now(),
          count: 1,
          message: packet.payload?.status || "",
          type: classifyEventType(packet.event),
          runId: refs.runId,
          taskId: refs.taskId
        };
        return [incoming, ...prev].slice(0, 20);
      });
      scheduleRefresh();
    });
    return () => {
      ws.close();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    refreshTasks(selectedRunId);
  }, [selectedRunId]);

  const activeRuns = useMemo(
    () => runs.filter((r) => r.status === "running" || r.status === "queued").length,
    [runs]
  );

  const reportSummary = useMemo(() => {
    const total = taskDetails.length;
    const passed = taskDetails.filter((t) => t.status === "completed").length;
    const failed = taskDetails.filter((t) => t.status === "failed").length;
    const running = taskDetails.filter((t) => t.status === "running" || t.status === "claimed").length;
    const queued = taskDetails.filter((t) => t.status === "queued").length;
    return { total, passed, failed, running, queued };
  }, [taskDetails]);

  const topFailureTypes = useMemo(() => {
    const counter = {};
    taskDetails.forEach((task) => {
      (task.assertions || []).forEach((a) => {
        if (a.passed === false) {
          const key = a.type || "unknown";
          counter[key] = (counter[key] || 0) + 1;
        }
      });
    });
    return Object.entries(counter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [taskDetails]);

  const runSlaView = useMemo(() => {
    const now = Date.now();
    return runs.map((run) => {
      const started = run.started_at ? new Date(run.started_at).getTime() : now;
      const ageSeconds = Math.max(0, Math.floor((now - started) / 1000));
      let slaLevel = "ok";
      if (run.status === "failed") {
        slaLevel = "critical";
      } else if (run.status === "running" && ageSeconds > runningSlaMinutes * 60) {
        slaLevel = "warning";
      } else if (run.status === "queued" && (queueSummary.eta_seconds || 0) > queueSlaMinutes * 60) {
        slaLevel = "warning";
      }
      return { ...run, slaLevel, ageSeconds };
    });
  }, [runs, queueSummary.eta_seconds, runningSlaMinutes, queueSlaMinutes]);

  const slaBadge = useMemo(() => {
    const critical = runSlaView.filter((run) => run.slaLevel === "critical").length;
    const warning = runSlaView.filter((run) => run.slaLevel === "warning").length;
    if (critical > 0) {
      return { level: "critical", text: `CRIT ${critical}` };
    }
    if (warning > 0) {
      return { level: "warning", text: `WARN ${warning}` };
    }
    return null;
  }, [runSlaView]);

  const onboardingSteps = useMemo(() => {
    const doneLogin = sessions.length > 0;
    const doneCase = cases.length > 0;
    const doneDevice = devices.length > 0;
    const doneRun = runs.some((run) => run.status === "running" || run.status === "queued");
    return [
      {
        key: "login",
        title: "1) 로그인",
        description: "작업자 이름 입력 후 Login 버튼",
        done: doneLogin
      },
      {
        key: "case",
        title: "2) 테스트 케이스 생성",
        description: "Template 선택 후 Quick Add Case",
        done: doneCase
      },
      {
        key: "device",
        title: "3) 단말 연결",
        description: "USB 연결 후 agent가 단말 등록",
        done: doneDevice
      },
      {
        key: "run",
        title: "4) 실행 시작",
        description: "Start Parallel Run 클릭",
        done: doneRun
      }
    ];
  }, [sessions, cases, devices, runs]);

  const filteredTaskDetails = useMemo(() => {
    return taskDetails.filter((task) => {
      const failurePass =
        !failureFilterType ||
        (task.assertions || []).some((a) => a.passed === false && a.type === failureFilterType);
      const devicePass = !deviceFilterId || task.device_id === deviceFilterId;
      const statusPass = !statusFilter || task.status === statusFilter;
      const agentPass = !agentFilter || (task.assigned_to || "") === agentFilter;
      const caseTitle = cases.find((c) => c.id === task.case_id)?.title || "";
      const query = taskQuery.trim().toLowerCase();
      const queryPass =
        !query ||
        [task.case_id, caseTitle, task.device_id, task.assigned_to || "", task.status]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return failurePass && devicePass && statusPass && agentPass && queryPass;
    });
  }, [taskDetails, failureFilterType, deviceFilterId, statusFilter, agentFilter, taskQuery, cases]);

  useEffect(() => {
    if (!pendingFocusTaskId) {
      return;
    }
    setFailureFilterType("");
    setDeviceFilterId("");
    setStatusFilter("");
    setAgentFilter("");
    setTaskQuery("");
    const idx = filteredTaskDetails.findIndex((task) => task.id === pendingFocusTaskId);
    if (idx < 0) {
      return;
    }
    handleFocusTask(pendingFocusTaskId);
    setPendingFocusTaskId("");
    setTimeout(() => {
      setFocusedTaskId("");
    }, 1400);
  }, [pendingFocusTaskId, filteredTaskDetails]);

  const deviceFilterOptions = useMemo(() => {
    return Array.from(new Set(taskDetails.map((task) => task.device_id))).sort();
  }, [taskDetails]);

  const agentFilterOptions = useMemo(() => {
    return Array.from(new Set(taskDetails.map((task) => task.assigned_to).filter(Boolean))).sort();
  }, [taskDetails]);

  const failureGuide = useMemo(() => {
    const guideMap = {
      locator_not_found: [
        "Step locator를 id 우선으로 변경하고 xpath 의존도를 줄이세요.",
        "해당 화면 로딩 대기(wait:ms) 또는 explicit wait step을 앞에 추가하세요.",
        "앱 빌드 버전에 따른 locator 변경 여부를 케이스 메타에 기록하세요."
      ],
      session_start_failed: [
        "Appium 서버/포트와 udid 매핑을 점검하세요.",
        "동일 단말에 기존 세션이 남아 있는지 확인 후 정리하세요.",
        "agent 로그의 capabilities 값을 점검하세요."
      ],
      timeout: [
        "네트워크/로그인 이후 전환 구간에 wait step을 추가하세요.",
        "실패 단계 직전 스크린샷/페이지소스로 지연 원인을 확인하세요.",
        "동일 케이스 반복 실패 시 우선순위를 올려 재현 테스트를 실행하세요."
      ],
      connection_error: [
        "노트북-단말 USB 연결과 adb 상태를 먼저 확인하세요.",
        "Appium endpoint(host/port/path) 환경변수를 재검증하세요.",
        "동일 시각 다른 작업에서 포트 충돌이 발생했는지 확인하세요."
      ],
      case_fetch_failed: [
        "케이스가 삭제/변경되었는지 라이브러리에서 확인하세요.",
        "backend API 상태와 인증 세션을 점검하세요.",
        "해당 run 생성 시 케이스 ID가 유효했는지 로그를 추적하세요."
      ],
      execution_error: [
        "step 문법과 실행 순서를 재검토하세요.",
        "실패 시점 로그와 page source를 대조해 원인 구간을 좁히세요.",
        "동일 케이스를 단일 단말로 먼저 재현해 환경 변수를 제거하세요."
      ]
    };

    if (!failureFilterType) {
      return [
        "실패 유형 카드를 선택하면 해당 유형에 맞는 대응 가이드가 표시됩니다.",
        "우선순위(P4/P5)로 재실행하여 영향도를 빠르게 검증하세요.",
        "Retry Timeline으로 동일 root_task 재시도 흐름을 점검하세요."
      ];
    }
    return guideMap[failureFilterType] || guideMap.execution_error;
  }, [failureFilterType]);

  const retryTimelineGroups = useMemo(() => {
    const groups = {};
    taskDetails.forEach((task) => {
      const rootId = task.root_task_id || task.id;
      if (!groups[rootId]) {
        groups[rootId] = [];
      }
      groups[rootId].push(task);
    });

    return Object.entries(groups)
      .map(([rootId, tasks]) => ({
        rootId,
        tasks: tasks.sort((a, b) => (a.retry_index ?? 0) - (b.retry_index ?? 0))
      }))
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [taskDetails]);

  const feedActorOptions = useMemo(() => {
    return Array.from(new Set(events.map((item) => item.actor).filter(Boolean))).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const windowMs = Math.max(1, auditWindowMinutes) * 60 * 1000;
    return events.filter((item) => {
      const actorPass = !auditActorFilter || item.actor === auditActorFilter;
      const typePass = !auditTypeFilter || item.type === auditTypeFilter;
      const ts = Number(item.ts || now);
      const timePass = now - ts <= windowMs;
      return actorPass && typePass && timePass;
    });
  }, [events, auditActorFilter, auditTypeFilter, auditWindowMinutes]);

  const caseTitleById = useMemo(() => {
    const mapping = {};
    for (const item of cases) {
      mapping[item.id] = item.title;
    }
    return mapping;
  }, [cases]);

  const virtualTaskWindow = useMemo(() => {
    const total = filteredTaskDetails.length;
    const startIndex = Math.max(0, Math.floor(taskScrollTop / TASK_ROW_HEIGHT) - 4);
    const endIndex = Math.min(total, startIndex + TASK_WINDOW_SIZE);
    const items = filteredTaskDetails.slice(startIndex, endIndex);
    const topSpacer = startIndex * TASK_ROW_HEIGHT;
    const bottomSpacer = Math.max(0, (total - endIndex) * TASK_ROW_HEIGHT);
    return { startIndex, endIndex, items, topSpacer, bottomSpacer, total };
  }, [filteredTaskDetails, taskScrollTop]);

  function validateStepText(text) {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const errors = [];
    lines.forEach((line, i) => {
      const index = i + 1;
      if (line.startsWith("wait:")) {
        const ms = Number(line.slice(5));
        if (!Number.isFinite(ms) || ms < 0) {
          errors.push(`line ${index}: wait must be integer >= 0`);
        }
        return;
      }
      if (line.startsWith("tap:id=")) return;
      if (line.startsWith("tap:xpath=")) return;
      if (line.startsWith("tap:accessibility=")) return;
      if (line.startsWith("input:id=") && line.includes("|text=")) return;
      if (line.startsWith("expect:text=")) return;
      errors.push(`line ${index}: unsupported syntax '${line}'`);
    });

    return { lines, errors };
  }

  function applyTemplate(templateKey) {
    const tpl = caseTemplates[templateKey];
    if (!tpl) return;
    setCaseTitle(tpl.title);
    setCaseExpected(tpl.expected);
    setCaseStepsText(tpl.steps.join("\n"));
    setCaseValidationErrors([]);
  }

  async function handleLogin() {
    await login(username, "password");
    await loadAll();
  }

  async function handleCreateCase() {
    const { lines, errors } = validateStepText(caseStepsText);
    if (!caseTitle.trim()) {
      setCaseValidationErrors(["title is required"]);
      return;
    }
    if (!caseExpected.trim()) {
      setCaseValidationErrors(["expected text is required"]);
      return;
    }
    if (errors.length > 0) {
      setCaseValidationErrors(errors);
      return;
    }

    setCaseValidationErrors([]);
    await createCase({
      app: selectedApp,
      title: caseTitle.trim(),
      expected: caseExpected.trim(),
      steps: lines,
      created_by: username
    });
    await loadAll();
  }

  async function handleStartRun() {
    const caseIds = cases.filter((c) => c.app === selectedApp).slice(0, 2).map((c) => c.id);
    const deviceIds = devices.slice(0, 2).map((d) => d.id);
    if (caseIds.length === 0 || deviceIds.length === 0) {
      alert("Need at least 1 case and 1 device.");
      return;
    }
    await createRun({
      app: selectedApp,
      case_ids: caseIds,
      device_ids: deviceIds,
      started_by: username,
      priority: runPriority
    });
    await loadAll();
  }

  function handleFocusTask(taskId) {
    setFocusedTaskId(taskId);
    const idx = filteredTaskDetails.findIndex((task) => task.id === taskId);
    if (idx >= 0 && taskListRef.current) {
      taskListRef.current.scrollTo({
        top: idx * TASK_ROW_HEIGHT,
        behavior: "smooth"
      });
    }
  }

  async function handleSelectRun(runId) {
    setSelectedRunId(runId);
  }

  async function handleBoostPriority() {
    if (!selectedRunId) {
      return;
    }
    const run = runs.find((item) => item.id === selectedRunId);
    const nextPriority = Math.min(5, Number((run?.priority || 3) + 1));
    await updateRunPriority(selectedRunId, nextPriority, {
      actor: username,
      reason: "boost_priority"
    });
    await loadAll();
  }

  async function handleRequeueFailureType(type) {
    if (!selectedRunId || !type) {
      return;
    }
    await requeueFailureType(selectedRunId, type);
    await loadAll();
  }

  async function handleApplyRecommendedPriority(type) {
    if (!selectedRunId || !type) {
      return;
    }
    const recommended = failurePriorityRecommendation[type] || 3;
    await updateRunPriority(selectedRunId, recommended, {
      actor: username,
      reason: `failure_type:${type}`
    });
    setFailureFilterType(type);
    await loadAll();
  }

  async function handleEventNavigate(eventItem) {
    if (!eventItem) {
      return;
    }
    if (eventItem.runId) {
      setSelectedRunId(eventItem.runId);
    }
    if (eventItem.taskId) {
      setDeviceFilterId("");
      setStatusFilter("");
      setAgentFilter("");
      setTaskQuery("");
      setPendingFocusTaskId(eventItem.taskId);
    }
    showToast(`Jumped to ${eventItem.taskId ? "task" : "run"}`, "success");
    scheduleRefresh();
  }

  function handleExportAuditJson() {
    const payload = {
      exported_at: new Date().toISOString(),
      filters: {
        actor: auditActorFilter || null,
        type: auditTypeFilter || null,
        window_minutes: auditWindowMinutes
      },
      events: filteredEvents
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Audit JSON exported", "success");
  }

  function handleExportAuditCsv() {
    const header = ["ts", "time", "event", "type", "actor", "message", "runId", "taskId", "count"];
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = filteredEvents.map((item) =>
      [
        item.ts || "",
        item.time || "",
        item.event || "",
        item.type || "",
        item.actor || "",
        item.message || "",
        item.runId || "",
        item.taskId || "",
        item.count || 1
      ]
        .map(escapeCsv)
        .join(",")
    );

    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-events-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Audit CSV exported", "success");
  }

  return (
    <div className="page">
      {toast.text && <div className={`toast toast-${toast.level}`}>{toast.text}</div>}
      <header>
        <div>
          <p className="overline">INTERNAL QA GRID</p>
          <h1>Mobile Test Command Board</h1>
        </div>
        <div className="actions">
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
          <button onClick={handleLogin}>Login</button>
        </div>
      </header>

      <section className="grid stats">
        <StatCard title="Logged-in Users" value={sessions.length} hint="Realtime worker status" />
        <StatCard title="Connected Devices" value={devices.length} hint="USB-linked endpoints" />
        <StatCard title="Total Test Cases" value={cases.length} hint="No git push required" />
        <StatCard
          title="Active Runs"
          value={activeRuns}
          hint="Parallel execution monitor"
          badge={slaBadge}
        />
      </section>

      <section className="card onboarding-card">
        <div className="onboarding-head">
          <h3>처음 사용 가이드</h3>
          <span className="onboarding-url">단일 접속 URL: http://localhost:8001</span>
        </div>
        <div className="onboarding-steps">
          {onboardingSteps.map((step) => (
            <div key={step.key} className={`onboarding-step ${step.done ? "done" : ""}`}>
              <div className="step-title">{step.title}</div>
              <div className="step-desc">{step.description}</div>
              <div className="step-state">{step.done ? "완료" : "대기"}</div>
            </div>
          ))}
        </div>
        <div className="buttons onboarding-actions">
          <button onClick={handleLogin}>지금 로그인</button>
          <button onClick={() => applyTemplate("loginSmoke")}>로그인 템플릿 적용</button>
          <button onClick={handleCreateCase}>케이스 생성</button>
          <button className="accent" onClick={handleStartRun}>
            실행 시작
          </button>
        </div>
      </section>

      <section className="grid stats">
        <StatCard
          title="Queue Depth"
          value={queueSummary.queued_total}
          hint={`Busy devices ${queueSummary.busy_devices} | ETA ${formatDuration(queueSummary.eta_seconds)}`}
        />
        <StatCard
          title="Priority Mix"
          value={`P5 ${queueSummary.queued_by_priority?.["5"] ?? 0} | P4 ${queueSummary.queued_by_priority?.["4"] ?? 0}`}
          hint={`P3 ${queueSummary.queued_by_priority?.["3"] ?? 0} / P2 ${queueSummary.queued_by_priority?.["2"] ?? 0} / P1 ${queueSummary.queued_by_priority?.["1"] ?? 0}`}
        />
        <StatCard
          title="Priority ETA"
          value={`P5 ${formatDuration(queueSummary.eta_by_priority?.["5"])} | P4 ${formatDuration(queueSummary.eta_by_priority?.["4"])}`}
          hint={`P3 ${formatDuration(queueSummary.eta_by_priority?.["3"])} / P2 ${formatDuration(queueSummary.eta_by_priority?.["2"])} / P1 ${formatDuration(queueSummary.eta_by_priority?.["1"])}`}
        />
      </section>

      <section className="grid main-grid">
        <div className="card">
          <h3>Execution Control</h3>
          <div className="row">
            <label>App</label>
            <select value={selectedApp} onChange={(e) => setSelectedApp(e.target.value)}>
              <option>Kia</option>
              <option>Hyundai</option>
              <option>My Genesis</option>
            </select>
          </div>
          <div className="row">
            <label>Priority</label>
            <select value={runPriority} onChange={(e) => setRunPriority(Number(e.target.value))}>
              <option value={5}>P5 Critical</option>
              <option value={4}>P4 High</option>
              <option value={3}>P3 Normal</option>
              <option value={2}>P2 Low</option>
              <option value={1}>P1 Background</option>
            </select>
          </div>
          <div className="row sla-config">
            <label>Running SLA(min)</label>
            <input
              type="number"
              min={1}
              value={runningSlaMinutes}
              onChange={(e) => setRunningSlaMinutes(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="row sla-config">
            <label>Queue SLA(min)</label>
            <input
              type="number"
              min={1}
              value={queueSlaMinutes}
              onChange={(e) => setQueueSlaMinutes(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="buttons">
            <button onClick={handleCreateCase}>Quick Add Case</button>
            <button className="accent" onClick={handleStartRun}>
              Start Parallel Run
            </button>
          </div>
          <h4>Run Status</h4>
          <ul>
            {runSlaView.map((run) => (
              <li key={run.id} className={`run-row run-${run.slaLevel}`}>
                {run.app} | priority P{run.priority ?? 3} | {run.status} | {run.progress}% | tasks {run.completed_tasks ?? 0}/
                {run.total_tasks ?? 0} | failed {run.failed_tasks ?? 0} | age {formatDuration(run.ageSeconds)} | {run.result ?? "pending"}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Case Builder</h3>
          <div className="template-row">
            <button onClick={() => applyTemplate("loginSmoke")}>Template: Login</button>
            <button onClick={() => applyTemplate("homeLoad")}>Template: Home</button>
            <button onClick={() => applyTemplate("vehicleStatus")}>Template: Vehicle</button>
          </div>
          <div className="case-form">
            <label>Title</label>
            <input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} />
            <label>Expected</label>
            <input value={caseExpected} onChange={(e) => setCaseExpected(e.target.value)} />
            <label>Steps (one line each)</label>
            <textarea
              rows={7}
              value={caseStepsText}
              onChange={(e) => setCaseStepsText(e.target.value)}
              placeholder="wait:1500&#10;tap:accessibility=Login&#10;expect:text=Welcome"
            />
            {caseValidationErrors.length > 0 && (
              <div className="validation-error">
                {caseValidationErrors.map((error, idx) => (
                  <div key={`${error}-${idx}`}>{error}</div>
                ))}
              </div>
            )}
          </div>
          <h4>Test Case Library</h4>
          <ul>
            {cases.map((c) => (
              <li key={c.id}>
                [{c.app}] {c.title}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Result Report</h3>
          <div className="failure-type-grid">
            {topFailureTypes.length === 0 && <div className="failure-card">No failures yet</div>}
            {topFailureTypes.map(([type, count]) => (
              <div
                className={`failure-card ${failureFilterType === type ? "failure-button active" : ""}`}
                key={type}
              >
                <button
                  className="failure-button-inline"
                  onClick={() => setFailureFilterType((prev) => (prev === type ? "" : type))}
                >
                  <strong>{type}</strong>
                  <span>
                    {count} | rec P{failurePriorityRecommendation[type] || 3}
                  </span>
                </button>
                <button
                  className="failure-apply"
                  onClick={() => handleApplyRecommendedPriority(type)}
                  disabled={!selectedRunId}
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
          <div className="buttons">
            <button onClick={handleBoostPriority} disabled={!selectedRunId}>
              Boost Run Priority
            </button>
            <button
              onClick={() => handleRequeueFailureType(failureFilterType)}
              disabled={!selectedRunId || !failureFilterType}
            >
              Requeue Selected Failure Type
            </button>
          </div>
          {failureFilterType && (
            <div className="assertion-line">filter active: {failureFilterType}</div>
          )}
          <div className="guide-card">
            <strong>Auto Response Guide</strong>
            {failureGuide.map((line) => (
              <div className="assertion-line" key={line}>
                - {line}
              </div>
            ))}
          </div>
          <div className="report-bars">
            <div className="bar-row">
              <span>PASS {reportSummary.passed}</span>
              <div className="bar-track">
                <div
                  className="bar-fill pass"
                  style={{ width: `${reportSummary.total ? (reportSummary.passed / reportSummary.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="bar-row">
              <span>FAIL {reportSummary.failed}</span>
              <div className="bar-track">
                <div
                  className="bar-fill fail"
                  style={{ width: `${reportSummary.total ? (reportSummary.failed / reportSummary.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="bar-row">
              <span>RUNNING {reportSummary.running}</span>
              <div className="bar-track">
                <div
                  className="bar-fill running"
                  style={{ width: `${reportSummary.total ? (reportSummary.running / reportSummary.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
          <div className="row">
            <label>Run</label>
            <select value={selectedRunId} onChange={(e) => handleSelectRun(e.target.value)}>
              <option value="">Select run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.app} | {run.status} | {run.progress}%
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <label>Device Filter</label>
            <select value={deviceFilterId} onChange={(e) => setDeviceFilterId(e.target.value)}>
              <option value="">All devices</option>
              {deviceFilterOptions.map((deviceId) => (
                <option key={deviceId} value={deviceId}>
                  {deviceId}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <label>Status Filter</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All status</option>
              <option value="queued">queued</option>
              <option value="claimed">claimed</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="retried">retried</option>
            </select>
          </div>
          <div className="row">
            <label>Agent Filter</label>
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="">All agents</option>
              {agentFilterOptions.map((agentName) => (
                <option key={agentName} value={agentName}>
                  {agentName}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <label>Search</label>
            <input
              value={taskQuery}
              onChange={(e) => setTaskQuery(e.target.value)}
              placeholder="case title, case id, device, agent"
            />
          </div>
          <div
            className="task-virtual-list"
            ref={taskListRef}
            onScroll={(e) => setTaskScrollTop(e.currentTarget.scrollTop)}
          >
            <div style={{ paddingTop: virtualTaskWindow.topSpacer, paddingBottom: virtualTaskWindow.bottomSpacer }}>
              <ul>
                {virtualTaskWindow.items.map((task) => (
                  <li
                    key={task.id}
                    id={`task-row-${task.id}`}
                    className={focusedTaskId === task.id ? "task-row-focused" : ""}
                  >
                    {task.device_id} | agent {task.assigned_to || "-"} | {task.status} | {task.progress}%
                    <div className="assertion-line">case: {caseTitleById[task.case_id] || task.case_id}</div>
                    {typeof task.retry_index === "number" && (
                      <div className="assertion-line">retry #{task.retry_index}</div>
                    )}
                    {task.assertions?.length > 0 && (
                      <div>
                        {task.assertions.map((a, idx) => (
                          <div key={`${task.id}-${idx}`} className="assertion-line">
                            {a.type}: expected "{a.expected}" / actual "{a.actual}" / {a.passed ? "PASS" : "FAIL"}
                          </div>
                        ))}
                      </div>
                    )}
                    {task.logs?.length > 0 && (
                      <div className="assertion-line">log: {task.logs[task.logs.length - 1]}</div>
                    )}
                    {task.screenshot_base64 && (
                      <details className="artifact-source">
                        <summary>screenshot</summary>
                        <img
                          className="artifact-image"
                          alt={`task-${task.id}`}
                          src={`data:image/png;base64,${task.screenshot_base64}`}
                        />
                      </details>
                    )}
                    {task.page_source && (
                      <details className="artifact-source">
                        <summary>page source</summary>
                        <pre>{task.page_source.slice(0, 2000)}</pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h4>Retry Timeline</h4>
          <ul>
            {retryTimelineGroups.map((group) => (
              <li key={group.rootId}>
                root {group.rootId.slice(0, 8)} | attempts {group.tasks.length}
                <div>
                  {group.tasks.map((task) => (
                    <button
                      type="button"
                      className="timeline-item"
                      onClick={() => handleFocusTask(task.id)}
                      key={task.id}
                    >
                      #{task.retry_index ?? 0} {task.status} ({task.device_id})
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <EventFeed events={filteredEvents} onNavigate={handleEventNavigate} />
        <div className="card">
          <h3>Audit Filter</h3>
          <div className="row">
            <label>Actor</label>
            <select value={auditActorFilter} onChange={(e) => setAuditActorFilter(e.target.value)}>
              <option value="">All actors</option>
              {feedActorOptions.map((actorName) => (
                <option value={actorName} key={actorName}>
                  {actorName}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <label>Event Type</label>
            <select value={auditTypeFilter} onChange={(e) => setAuditTypeFilter(e.target.value)}>
              <option value="">All types</option>
              <option value="priority">priority</option>
              <option value="requeue">requeue</option>
              <option value="execution">execution</option>
              <option value="other">other</option>
            </select>
          </div>
          <div className="row">
            <label>Window(min)</label>
            <input
              type="number"
              min={1}
              value={auditWindowMinutes}
              onChange={(e) => setAuditWindowMinutes(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="buttons">
            <button onClick={handleExportAuditJson}>Export JSON</button>
            <button onClick={handleExportAuditCsv}>Export CSV</button>
          </div>
        </div>
      </section>
    </div>
  );
}
