import asyncio
from datetime import datetime

from app.services.state import store


async def simulate_run_lifecycle(run_id: str) -> None:
    run = store.test_runs.get(run_id)
    if not run:
        return

    run.status = "running"
    await store.broadcast("run_update", _serialize_run(run_id))

    for p in [15, 35, 55, 75, 90, 100]:
        await asyncio.sleep(1)
        run.progress = p
        await store.broadcast("run_update", _serialize_run(run_id))

    run.status = "completed"
    run.result = "passed"
    run.ended_at = datetime.utcnow()
    await store.broadcast("run_completed", _serialize_run(run_id))


def _serialize_run(run_id: str) -> dict:
    run = store.test_runs[run_id]
    return {
        "id": run.id,
        "app": run.app,
        "case_ids": run.case_ids,
        "device_ids": run.device_ids,
        "started_by": run.started_by,
        "status": run.status,
        "progress": run.progress,
        "result": run.result,
        "started_at": run.started_at.isoformat(),
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
    }
