from pydantic import BaseModel, Field


class RunStartRequest(BaseModel):
    app: str = Field(pattern="^(Kia|Hyundai|My Genesis)$")
    case_ids: list[str]
    device_ids: list[str]
    started_by: str
    priority: int = Field(default=3, ge=1, le=5)


class RunView(BaseModel):
    id: str
    app: str
    case_ids: list[str]
    device_ids: list[str]
    started_by: str
    priority: int = 3
    status: str
    progress: int
    result: str | None
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    started_at: str
    ended_at: str | None
