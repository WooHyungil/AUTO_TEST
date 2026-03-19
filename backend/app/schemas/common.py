from datetime import datetime
from pydantic import BaseModel


class ApiResponse(BaseModel):
    message: str
    timestamp: datetime = datetime.now()
