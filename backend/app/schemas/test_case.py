from pydantic import BaseModel, Field


class TestCaseCreate(BaseModel):
    app: str = Field(pattern="^(Kia|Hyundai|My Genesis)$")
    title: str
    expected: str
    steps: list[str]
    created_by: str


class TestCaseView(TestCaseCreate):
    id: str
    created_at: str
