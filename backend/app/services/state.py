from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from fastapi import WebSocket


@dataclass
class UserSession:
    username: str
    display_name: str
    status: str
    updated_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class TestCase:
    id: str
    app: str
    title: str
    expected: str
    steps: list[str]
    created_by: str
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Device:
    id: str
    model: str
    platform: str
    os_version: str
    connected_by: str
    connected_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class TestRun:
    id: str
    app: str
    case_ids: list[str]
    device_ids: list[str]
    started_by: str
    priority: int = 3
    status: str = "queued"
    progress: int = 0
    result: str | None = None
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    started_at: datetime = field(default_factory=datetime.utcnow)
    ended_at: datetime | None = None


@dataclass
class AgentTask:
    id: str
    run_id: str
    app: str
    case_id: str
    device_id: str
    assigned_to: str | None = None
    status: str = "queued"
    progress: int = 0
    retry_index: int = 0
    root_task_id: str | None = None
    assertions: list[dict[str, Any]] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)
    screenshot_base64: str | None = None
    page_source: str | None = None
    queued_at: datetime = field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    ended_at: datetime | None = None


class InMemoryStore:
    def __init__(self) -> None:
        self.user_sessions: dict[str, UserSession] = {}
        self.test_cases: dict[str, TestCase] = {}
        self.devices: dict[str, Device] = {}
        self.test_runs: dict[str, TestRun] = {}
        self.tasks: dict[str, AgentTask] = {}
        self.agent_status: dict[str, Any] = {
            "agent_name": "",
            "api_base": "",
            "poll_ms": 0,
            "last_seen": None,
            "connected_devices": [],
            "device_states": [],
            "adb_error": None,
        }
        self.active_connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def update_agent_status(
        self,
        *,
        agent_name: str,
        api_base: str,
        poll_ms: int,
        connected_devices: list[str],
        device_states: list[dict[str, str]],
        adb_error: str | None,
    ) -> dict[str, Any]:
        async with self._lock:
            self.agent_status = {
                "agent_name": agent_name,
                "api_base": api_base,
                "poll_ms": poll_ms,
                "last_seen": datetime.utcnow().isoformat(),
                "connected_devices": connected_devices,
                "device_states": device_states,
                "adb_error": adb_error,
            }
            return dict(self.agent_status)

    async def get_agent_status(self) -> dict[str, Any]:
        async with self._lock:
            return dict(self.agent_status)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.active_connections.discard(websocket)

    async def broadcast(self, event: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self.active_connections)
        dead_sockets: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json({"event": event, "payload": payload})
            except Exception:
                dead_sockets.append(ws)
        if dead_sockets:
            async with self._lock:
                for ws in dead_sockets:
                    self.active_connections.discard(ws)

    async def add_run(self, app: str, case_ids: list[str], device_ids: list[str], user: str, priority: int) -> TestRun:
        run = TestRun(
            id=str(uuid.uuid4()),
            app=app,
            case_ids=case_ids,
            device_ids=device_ids,
            started_by=user,
            priority=max(1, min(5, priority)),
        )
        async with self._lock:
            self.test_runs[run.id] = run
        return run

    async def add_tasks_for_run(self, run_id: str, app: str, case_ids: list[str], device_ids: list[str]) -> list[AgentTask]:
        tasks: list[AgentTask] = []
        if not case_ids or not device_ids:
            return tasks

        # Round-robin assignment target (actual claiming still done by agent).
        for idx, case_id in enumerate(case_ids):
            device_id = device_ids[idx % len(device_ids)]
            task = AgentTask(
                id=str(uuid.uuid4()),
                run_id=run_id,
                app=app,
                case_id=case_id,
                device_id=device_id,
                root_task_id=None,
            )
            task.root_task_id = task.id
            tasks.append(task)

        async with self._lock:
            for task in tasks:
                self.tasks[task.id] = task
            run = self.test_runs[run_id]
            run.total_tasks = len(tasks)
            run.progress = 0
            run.status = "queued"
        return tasks

    async def claim_task(self, agent_name: str, device_ids: list[str]) -> AgentTask | None:
        async with self._lock:
            # Recover stale claimed/running tasks so one stuck task does not block the whole device queue.
            now = datetime.utcnow()
            stale_seconds = 180
            for task in self.tasks.values():
                if task.status not in {"claimed", "running"}:
                    continue
                if not task.started_at:
                    continue
                age = (now - task.started_at).total_seconds()
                if age > stale_seconds:
                    task.status = "queued"
                    task.assigned_to = None
                    task.progress = min(task.progress, 10)
                    task.logs.append(f"server recovered stale task after {int(age)}s")

            busy_devices = {
                task.device_id
                for task in self.tasks.values()
                if task.status in {"claimed", "running"}
            }
            queued_candidates = [
                task
                for task in self.tasks.values()
                if task.status == "queued"
                and task.device_id in device_ids
                and task.device_id not in busy_devices
            ]
            queued_candidates.sort(
                key=lambda task: (
                    -self.test_runs[task.run_id].priority,
                    -task.retry_index,
                    task.queued_at,
                )
            )

            for task in queued_candidates:
                task.status = "claimed"
                task.assigned_to = agent_name
                task.started_at = datetime.utcnow()
                run = self.test_runs[task.run_id]
                if run.status in {"queued", "running"}:
                    run.status = "running"
                return task
        return None

    async def update_task(
        self,
        task_id: str,
        *,
        status: str,
        progress: int,
        assertions: list[dict[str, Any]] | None,
        log_line: str | None,
        screenshot_base64: str | None,
        page_source: str | None,
    ) -> AgentTask | None:
        async with self._lock:
            task = self.tasks.get(task_id)
            if not task:
                return None

            task.status = status
            task.progress = max(0, min(100, progress))
            if assertions is not None:
                task.assertions = assertions
            if log_line:
                task.logs.append(log_line)
            if screenshot_base64 is not None:
                task.screenshot_base64 = screenshot_base64
            if page_source is not None:
                task.page_source = page_source
            if status in {"completed", "failed"} and not task.ended_at:
                task.ended_at = datetime.utcnow()

            self._refresh_run_stats_no_lock(task.run_id)
            return task

    def _refresh_run_stats_no_lock(self, run_id: str) -> None:
        run = self.test_runs[run_id]
        related_tasks = [
            task for task in self.tasks.values() if task.run_id == run_id and task.status != "retried"
        ]
        if not related_tasks:
            run.total_tasks = 0
            run.completed_tasks = 0
            run.failed_tasks = 0
            run.progress = 0
            run.status = "queued"
            run.result = None
            return

        completed_tasks = sum(1 for task in related_tasks if task.status == "completed")
        failed_tasks = sum(1 for task in related_tasks if task.status == "failed")
        total_progress = sum(task.progress for task in related_tasks)

        run.total_tasks = len(related_tasks)
        run.completed_tasks = completed_tasks
        run.failed_tasks = failed_tasks
        run.progress = int(total_progress / len(related_tasks))

        finished = completed_tasks + failed_tasks
        if finished == len(related_tasks):
            run.status = "completed" if failed_tasks == 0 else "failed"
            run.result = "passed" if failed_tasks == 0 else "failed"
            if not run.ended_at:
                run.ended_at = datetime.utcnow()
        elif any(task.status in {"running", "claimed"} for task in related_tasks):
            run.status = "running"
        else:
            run.status = "queued"

    async def enqueue_retry_task(self, failed_task_id: str, max_retry: int) -> AgentTask | None:
        async with self._lock:
            failed_task = self.tasks.get(failed_task_id)
            if not failed_task:
                return None
            if failed_task.status != "failed":
                return None
            if failed_task.retry_index >= max_retry:
                return None

            failed_task.status = "retried"
            failed_task.logs.append("server requeue requested")

            retry_task = AgentTask(
                id=str(uuid.uuid4()),
                run_id=failed_task.run_id,
                app=failed_task.app,
                case_id=failed_task.case_id,
                device_id=failed_task.device_id,
                status="queued",
                retry_index=failed_task.retry_index + 1,
                root_task_id=failed_task.root_task_id or failed_task.id,
            )
            self.tasks[retry_task.id] = retry_task
            self._refresh_run_stats_no_lock(failed_task.run_id)
            return retry_task

    async def get_tasks_by_run(self, run_id: str) -> list[AgentTask]:
        async with self._lock:
            return [task for task in self.tasks.values() if task.run_id == run_id]


def serialize_run(run: TestRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "app": run.app,
        "case_ids": run.case_ids,
        "device_ids": run.device_ids,
        "started_by": run.started_by,
        "priority": run.priority,
        "status": run.status,
        "progress": run.progress,
        "result": run.result,
        "total_tasks": run.total_tasks,
        "completed_tasks": run.completed_tasks,
        "failed_tasks": run.failed_tasks,
        "started_at": run.started_at.isoformat(),
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
    }


def serialize_task(task: AgentTask) -> dict[str, Any]:
    return {
        "id": task.id,
        "run_id": task.run_id,
        "app": task.app,
        "case_id": task.case_id,
        "device_id": task.device_id,
        "assigned_to": task.assigned_to,
        "status": task.status,
        "progress": task.progress,
        "retry_index": task.retry_index,
        "root_task_id": task.root_task_id,
        "assertions": task.assertions,
        "logs": task.logs,
        "screenshot_base64": task.screenshot_base64,
        "page_source": task.page_source,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "ended_at": task.ended_at.isoformat() if task.ended_at else None,
    }


store = InMemoryStore()
