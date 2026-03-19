from fastapi import APIRouter
import os
from fastapi import HTTPException
from pydantic import BaseModel, Field
from datetime import datetime

from app.schemas.run import RunStartRequest
from app.services.state import serialize_run, serialize_task, store

router = APIRouter(prefix="/runs", tags=["runs"])
DEFAULT_TASK_SECONDS = int(os.getenv("QUEUE_TASK_SECONDS", "45"))
MANUAL_REQUEUE_MAX = int(os.getenv("MANUAL_REQUEUE_MAX", "3"))


class PriorityUpdateRequest(BaseModel):
    priority: int = Field(ge=1, le=5)
    actor: str | None = None
    reason: str | None = None


class RequeueFailureTypeRequest(BaseModel):
    failure_type: str


@router.post("")
async def start_run(body: RunStartRequest) -> dict:
    run = await store.add_run(
        app=body.app,
        case_ids=body.case_ids,
        device_ids=body.device_ids,
        user=body.started_by,
        priority=body.priority,
    )
    tasks = await store.add_tasks_for_run(run.id, body.app, body.case_ids, body.device_ids)
    payload = serialize_run(run)
    await store.broadcast("run_created", payload)
    await store.broadcast(
        "run_tasks_created",
        {"run_id": run.id, "task_count": len(tasks), "tasks": [serialize_task(task) for task in tasks]},
    )
    return payload


@router.get("")
async def list_runs() -> list[dict]:
    return [serialize_run(run) for run in store.test_runs.values()]


@router.get("/queue/summary")
async def queue_summary() -> dict:
    queued_by_priority = {str(priority): 0 for priority in range(1, 6)}
    busy_devices: set[str] = set()

    for task in store.tasks.values():
        if task.status == "queued":
            run = store.test_runs.get(task.run_id)
            priority = run.priority if run else 3
            queued_by_priority[str(priority)] += 1
        if task.status in {"claimed", "running"}:
            busy_devices.add(task.device_id)

    queued_total = sum(queued_by_priority.values())
    active_workers = max(1, len(busy_devices))
    eta_seconds = int((queued_total * DEFAULT_TASK_SECONDS) / active_workers)
    eta_by_priority: dict[str, int] = {}
    cumulative = 0
    for priority in [5, 4, 3, 2, 1]:
        cumulative += queued_by_priority[str(priority)]
        eta_by_priority[str(priority)] = int((cumulative * DEFAULT_TASK_SECONDS) / active_workers)

    return {
        "queued_by_priority": queued_by_priority,
        "queued_total": queued_total,
        "busy_devices": len(busy_devices),
        "eta_seconds": eta_seconds,
        "eta_by_priority": eta_by_priority,
    }


@router.get("/{run_id}/tasks")
async def list_run_tasks(run_id: str) -> list[dict]:
    tasks = await store.get_tasks_by_run(run_id)
    return [serialize_task(task) for task in tasks]


@router.post("/{run_id}/priority")
async def update_run_priority(run_id: str, body: PriorityUpdateRequest) -> dict:
    run = store.test_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    previous_priority = run.priority
    run.priority = body.priority
    payload = serialize_run(run)
    await store.broadcast("run_priority_updated", payload)
    audit_payload = {
        "run_id": run.id,
        "actor": body.actor or "system",
        "reason": body.reason or "manual_update",
        "previous_priority": previous_priority,
        "new_priority": run.priority,
        "timestamp": datetime.utcnow().isoformat(),
    }
    await store.broadcast("run_priority_audit", audit_payload)
    return {"run": payload, "audit": audit_payload}


@router.post("/{run_id}/requeue-failure-type")
async def requeue_failure_type(run_id: str, body: RequeueFailureTypeRequest) -> dict:
    run = store.test_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    candidate_tasks = [
        task
        for task in store.tasks.values()
        if task.run_id == run_id
        and task.status == "failed"
        and any(assertion.get("type") == body.failure_type and assertion.get("passed") is False for assertion in task.assertions)
    ]

    requeued: list[dict] = []
    for task in candidate_tasks:
        retry_task = await store.enqueue_retry_task(task.id, MANUAL_REQUEUE_MAX)
        if retry_task:
            payload = serialize_task(retry_task)
            requeued.append(payload)
            await store.broadcast("task_requeued_manual", payload)

    run_payload = serialize_run(run)
    await store.broadcast("run_update", run_payload)
    return {"run": run_payload, "requeued_count": len(requeued), "tasks": requeued}
