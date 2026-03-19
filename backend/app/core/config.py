from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Mobile QA Control Center"
    ws_channel: str = "qa-status"


settings = Settings()
