# Mobile UI Test Control Center

Internal automation manager for Kia, Hyundai, and My Genesis apps.

## What this PoC includes

- FastAPI backend with REST + WebSocket
- React dashboard with live updates
- Laptop agent that auto-discovers USB Android devices via adb
- Agent task queue (claim/report) and live run progress updates
- Assertion-based pass/fail aggregation (expected vs actual)
- Docker compose setup with backend/frontend/postgres/redis

## Architecture overview

1. Dashboard (React)
- Login and worker status board
- Test case list and quick case creation
- Run trigger by app target
- Live events and run progress

2. API Server (FastAPI)
- Auth, session tracking, case CRUD, run control, device registration
- WebSocket event broadcasting for realtime UI updates
- In-memory store in PoC, designed to migrate to PostgreSQL + Redis

3. Agent (Node.js)
- Runs on each employee laptop
- Polls `adb devices` and syncs connected devices to backend
- Can be extended to run Appium server per device and report execution logs

4. Execution model
- Run request includes app + selected case IDs + selected device IDs
- Scheduler creates task queue and assigns cases to device slots
- Each slot maps to dedicated Appium port set (4723, 8200, 9100 etc.)
- Agent claims executable task by connected device list
- Agent reports progress and assertion results (text/ui_state/navigation)
- Progress/result stream to dashboard through WebSocket

## Local run

### 1) Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3) Agent

```bash
cd agent
npm install
npm run dev
```

### 4) Real Appium mode (agent)

If you already run Appium per device, start agent with real mode:

```bash
cd agent
set EXECUTE_REAL_APPIUM=true
set APPIUM_HOST=127.0.0.1
set APPIUM_PATH=/wd/hub
set KIA_APP_PACKAGE=com.kia.app
set KIA_APP_ACTIVITY=com.kia.app.MainActivity
set HYUNDAI_APP_PACKAGE=com.hyundai.app
set HYUNDAI_APP_ACTIVITY=com.hyundai.app.MainActivity
set GENESIS_APP_PACKAGE=com.genesis.app
set GENESIS_APP_ACTIVITY=com.genesis.app.MainActivity
npm run dev
```

Notes:
- `APPIUM_PORT` can be set to force a fixed server port.
- If `APPIUM_PORT` is omitted, agent uses calculated per-device appium port.
- Agent fetches test case via `/api/cases/{case_id}` and evaluates expected text against page source.
- Agent uploads screenshot and page source into task report for dashboard debugging.
- `TASK_MAX_RETRY` controls retry count per task (default: `1`).
- `RETRY_ON_TYPES` controls which failure types are retried by agent.
- `MAX_SERVER_REQUEUE` controls server-side requeue count for failed tasks (default: `1`).

Case step syntax (real mode):
- `wait:1500`
- `tap:id=com.example:id/login_button`
- `tap:xpath=//android.widget.TextView[@text='Login']`
- `tap:accessibility=Home`
- `input:id=com.example:id/id_field|text=user01`
- `expect:text=Welcome`

Validation:
- Backend validates step syntax when creating case and returns `400` for malformed lines.
- Dashboard case builder also validates step lines before submit.

Retry behavior:
- Agent retries locally up to `TASK_MAX_RETRY`.
- Agent retry can be limited to selected failure types via `RETRY_ON_TYPES`.
- If task still fails, server marks original task as `retried` and enqueues a new task up to `MAX_SERVER_REQUEUE`.
- Server prevents concurrent claim on the same device while another task is `claimed` or `running`.

Priority scheduling:
- Run creation accepts `priority` (1 to 5, default 3).
- Agent claim selects queued tasks by higher run priority first, then higher retry index.
- Queue depth can be fetched from `GET /api/runs/queue/summary`.
- Queue summary includes ETA seconds (`eta_seconds`) based on active worker devices.
- Queue summary also includes cumulative ETA by priority (`eta_by_priority`).

Dashboard report extras:
- Failure type Top cards are clickable to filter task list by failed assertion type.
- Retry timeline groups attempts by `root_task_id` to inspect retry history quickly.
- Device filter can be combined with failure-type filter.
- Task filters support failure type + device + status + agent + keyword search.
- Clicking retry timeline item scrolls and focuses the matching task row.
- WebSocket refresh is debounced to reduce repeated full reloads during burst events.
- Task list uses windowed rendering for better performance on large runs.
- Failure type selection shows an auto response guide with actionable steps.
- Failure type cards can trigger manual requeue for the selected run.
- Boost Run Priority action can raise current run priority quickly.
- Failure type cards display recommended run priority (rec Pn).
- Failure type cards provide one-click `Apply` action to set recommended priority.
- Run rows are SLA-highlighted (warning/critical) by status, runtime age, and queue pressure.
- Running/Queue SLA threshold minutes are configurable in execution controls.
- Requeue events are aggregated in live feed to reduce noise.
- Event feed supports jump navigation to related run/task context.
- Priority changes are logged as audit events with actor/reason.
- Audit events can be filtered by actor and time window in dashboard.
- Audit events can be filtered by event type (priority/requeue/execution/other).
- Filtered audit events can be exported as JSON from dashboard.
- SLA minute settings persist in browser local storage.

Failure classification:
- Agent classifies failures into types like `locator_not_found`, `session_start_failed`, `timeout`, `connection_error`.

## Suggested production upgrade path

1. Replace in-memory store with PostgreSQL models and Redis pub/sub.
2. Add JWT auth + RBAC (`admin`, `qa`, `viewer`).
3. Introduce Appium grid manager in agent:
- one Appium instance per USB device
- unique `systemPort`, `chromedriverPort`, `wdaLocalPort` allocation
4. Add durable queue (Celery/RQ/BullMQ/Kafka) for execution scheduling.
5. Add result comparator service:
- text assertion
- UI state assertion
- navigation assertion
6. Add report dashboard widgets:
- pass rate by app/team/member
- flakiness index
- mean time to failure
7. Deploy on Kubernetes with HPA + rolling updates + readiness probes.

## Core API endpoints (PoC)

- `POST /api/auth/login`
- `GET /api/auth/sessions`
- `POST /api/cases`
- `GET /api/cases`
- `POST /api/devices`
- `GET /api/devices`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/queue/summary`
- `GET /api/runs/{run_id}/tasks`
- `POST /api/runs/{run_id}/priority`
- `POST /api/runs/{run_id}/requeue-failure-type`
- `POST /api/agents/tasks/claim`
- `POST /api/agents/tasks/{task_id}/report`
- `GET /health`
- `WS /ws`

## Notes

- This repository is a runnable skeleton and not final production code.
- iOS USB detection and WDA orchestration should be added in a dedicated macOS agent.
