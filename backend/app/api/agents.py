import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.state import serialize_run, serialize_task, store

router = APIRouter(prefix="/agents", tags=["agents"])
MAX_SERVER_REQUEUE = int(os.getenv("MAX_SERVER_REQUEUE", "1"))


class TaskClaimRequest(BaseModel):
    agent_name: str
    device_ids: list[str]


class TaskReportRequest(BaseModel):
    status: str = Field(pattern="^(running|completed|failed)$")
    progress: int = Field(ge=0, le=100)
    assertions: list[dict] | None = None
    log_line: str | None = None
    screenshot_base64: str | None = None
    page_source: str | None = None


@router.post("/tasks/claim")
async def claim_task(body: TaskClaimRequest) -> dict:
    task = await store.claim_task(agent_name=body.agent_name, device_ids=body.device_ids)
    if not task:
        return {"task": None}

    payload = serialize_task(task)
    await store.broadcast("task_claimed", payload)
    return {"task": payload}


@router.post("/tasks/{task_id}/report")
async def report_task(task_id: str, body: TaskReportRequest) -> dict:
    task = await store.update_task(
        task_id,
        status=body.status,
        progress=body.progress,
        assertions=body.assertions,
        log_line=body.log_line,
        screenshot_base64=body.screenshot_base64,
        page_source=body.page_source,
    )
    if not task:
        raise HTTPException(status_code=404, detail="task not found")

    retry_task = None
    if body.status == "failed":
        retry_task = await store.enqueue_retry_task(task_id, MAX_SERVER_REQUEUE)

    current_task = store.tasks.get(task_id)
    if not current_task:
        raise HTTPException(status_code=404, detail="task not found after update")

    run = store.test_runs[current_task.run_id]
    task_payload = serialize_task(current_task)
    run_payload = serialize_run(run)

    await store.broadcast("task_updated", task_payload)
    if retry_task:
        await store.broadcast("task_requeued", serialize_task(retry_task))
    await store.broadcast("run_update", run_payload)

    if run.status in {"completed", "failed"}:
        await store.broadcast("run_completed", run_payload)

    return {"task": task_payload, "run": run_payload}
