from pydantic import BaseModel


class DeviceRegisterRequest(BaseModel):
    id: str
    model: str
    platform: str
    os_version: str
    connected_by: str


class DeviceView(DeviceRegisterRequest):
    connected_at: str
