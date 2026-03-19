"""
End-to-end smoke test: case → device → run → queue summary → tasks
Run with:  python scripts/e2e_smoke_test.py
"""
import json
import urllib.request

BASE = "http://127.0.0.1:8001/api"


def post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE + path, data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.loads(r.read())


# 1. Login
login = post("/auth/login", {"username": "tester", "password": "test"})
print("[1] Login      :", login["message"])

# 2. Create case
case = post(
    "/cases",
    {
        "title": "로그인 검증",
        "app": "Kia",
        "expected": "로그인 성공 후 홈화면 표시",
        "created_by": "tester",
        "steps": [
            "wait:2000",
            "tap:xpath=//android.widget.Button[@text='로그인']",
            "input:id=com.kia.app:id/username|text=testuser",
            "expect:text=안녕하세요",
        ],
    },
)
print("[2] Case       :", case["id"][:8], "|", case["title"])

# 3. Register device
dev = post(
    "/devices",
    {
        "id": "EMULATOR001",
        "model": "Pixel 7 (Emulator)",
        "platform": "android",
        "os_version": "13",
        "connected_by": "tester",
    },
)
print("[3] Device     :", dev["id"], "|", dev.get("model", "?"))

# 4. Create run (priority 3)
run = post(
    "/runs",
    {
        "app": "Kia",
        "case_ids": [case["id"]],
        "device_ids": [dev["id"]],
        "started_by": "tester",
        "priority": 3,
    },
)
print("[4] Run        :", run["id"][:8], "| status:", run["status"])

# 5. Queue summary
q = get("/runs/queue/summary")
print("[5] Queue total:", q["queued_total"], "| ETA(s):", q.get("eta_seconds"), "| By prio:", q.get("eta_by_priority", {}))

# 6. Tasks
tasks = get(f"/runs/{run['id']}/tasks")
print(f"[6] Tasks ({len(tasks)}):")
for t in tasks:
    dev_key = t.get('device_serial') or t.get('device_id', '?')
    print(f"     {t['id'][:8]} status={t['status']} device={dev_key}")

print("\n✓ All checks passed")
