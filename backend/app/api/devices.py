from fastapi import APIRouter

from app.schemas.device import DeviceRegisterRequest
from app.services.state import Device, store

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("")
async def register_device(body: DeviceRegisterRequest) -> dict:
    device = Device(
        id=body.id,
        model=body.model,
        platform=body.platform,
        os_version=body.os_version,
        connected_by=body.connected_by,
    )
    store.devices[device.id] = device
    payload = {
        "id": device.id,
        "model": device.model,
        "platform": device.platform,
        "os_version": device.os_version,
        "connected_by": device.connected_by,
        "connected_at": device.connected_at.isoformat(),
    }
    await store.broadcast("device_connected", payload)
    return payload


@router.get("")
async def list_devices() -> list[dict]:
    return [
        {
            "id": d.id,
            "model": d.model,
            "platform": d.platform,
            "os_version": d.os_version,
            "connected_by": d.connected_by,
            "connected_at": d.connected_at.isoformat(),
        }
        for d in store.devices.values()
    ]
