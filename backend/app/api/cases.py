import uuid

from fastapi import APIRouter, HTTPException

from app.schemas.test_case import TestCaseCreate
from app.services.state import TestCase, store

router = APIRouter(prefix="/cases", tags=["cases"])


STEP_HINTS = (
    "wait:1500",
    "tap:id=com.example:id/login_button",
    "tap:xpath=//android.widget.TextView[@text='Login']",
    "tap:accessibility=Home",
    "input:id=com.example:id/id_field|text=user01",
    "expect:text=Welcome",
)


def _validate_steps(steps: list[str]) -> None:
    invalid_lines: list[str] = []
    for idx, raw in enumerate(steps, start=1):
        step = str(raw).strip()
        if not step:
            invalid_lines.append(f"line {idx}: empty")
            continue
        if step.startswith("wait:"):
            try:
                if int(step.split(":", 1)[1]) < 0:
                    invalid_lines.append(f"line {idx}: wait must be >= 0")
            except ValueError:
                invalid_lines.append(f"line {idx}: wait must be integer")
            continue
        if step.startswith("tap:id="):
            continue
        if step.startswith("tap:xpath="):
            continue
        if step.startswith("tap:accessibility="):
            continue
        if step.startswith("input:id=") and "|text=" in step:
            continue
        if step.startswith("expect:text="):
            continue
        invalid_lines.append(f"line {idx}: unsupported syntax '{step}'")

    if invalid_lines:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "invalid step syntax",
                "errors": invalid_lines,
                "supported_examples": list(STEP_HINTS),
            },
        )


def _serialize_case(case: TestCase) -> dict:
    return {
        "id": case.id,
        "app": case.app,
        "title": case.title,
        "expected": case.expected,
        "steps": case.steps,
        "created_by": case.created_by,
        "created_at": case.created_at.isoformat(),
    }


@router.post("")
async def create_case(body: TestCaseCreate) -> dict:
    _validate_steps(body.steps)
    case = TestCase(
        id=str(uuid.uuid4()),
        app=body.app,
        title=body.title,
        expected=body.expected,
        steps=body.steps,
        created_by=body.created_by,
    )
    store.test_cases[case.id] = case
    payload = _serialize_case(case)
    await store.broadcast("case_created", payload)
    return payload


@router.get("")
async def list_cases() -> list[dict]:
    return [_serialize_case(c) for c in store.test_cases.values()]


@router.get("/{case_id}")
async def get_case(case_id: str) -> dict:
    case = store.test_cases.get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="case not found")
    return _serialize_case(case)
