# 시작 가이드: Appium Agent

이 디렉토리의 에이전트는 실제 안드로이드 단말이나 에뮬레이터에서 테스트를 실행합니다.

## 🚀 빠른 시작

### Windows (PowerShell)
```powershell
.\start-agent.ps1
```

### macOS / Linux
```bash
./start-agent.sh
```

## 🔧 수동 설치 & 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
```powershell
# Windows PowerShell
$env:API_BASE = "http://localhost:8001/api"
$env:AGENT_PLATFORM = "android"
$env:EXECUTE_REAL_APPIUM = "true"          # 실제 실행
# $env:EXECUTE_REAL_APPIUM = "false"       # 시뮬레이션 모드 (테스트용)
```

```bash
# macOS / Linux
export API_BASE="http://localhost:8001/api"
export AGENT_PLATFORM="android"
export EXECUTE_REAL_APPIUM="true"
# export EXECUTE_REAL_APPIUM="false"      # 시뮬레이션 모드
```

### 3. 에이전트 시작
```bash
npm run dev
# 또는
node src/index.js
```

## 📋 환경 변수 설명

| 변수 | 설명 | 기본값 | 예시 |
|------|------|--------|------|
| `API_BASE` | 백엔드 API 서버 주소 | http://localhost:8000/api | http://localhost:8001/api |
| `AGENT_USER` | 이 에이전트의 식별자 | local-agent | qa-agent-01 |
| `AGENT_PLATFORM` | 테스트 플랫폼 | android | android, ios |
| `POLL_MS` | 작업 폴링 간격 (밀리초) | 4000 | 2000, 5000 |
| `EXECUTE_REAL_APPIUM` | 실제 Appium 실행 | false | true, false |
| `TASK_MAX_RETRY` | 실패 시 재시도 횟수 | 1 | 1, 2, 3 |
| `RETRY_ON_TYPES` | 재시도 대상 실패 유형 | connection_error,timeout,session_start_failed | 쉼표 구분 리스트 |

## ✅ 정상 시작 신호

```
[Agent] Platform: android
[Agent] Poll interval: 4000ms
[Agent] API Base: http://localhost:8001/api
[Agent] Scanning devices...
[Agent] Found devices: [emulator-5554, R58M812A5XX]
[Agent] Connected to backend: ✅ OK
[Agent] Waiting for tasks...
```

## ❌ 문제 해결

### 1. "ADB command not found"
**원인:** ADB가 PATH에 없음  
**해결:**
```powershell
# Windows: ENV PATH에 추가
$env:PATH += ";C:\Users\[username]\AppData\Local\Android\Sdk\platform-tools"

# macOS: ~/.zshrc 또는 ~/.bash_profile에 추가
export PATH="$PATH:~/Library/Android/sdk/platform-tools"

# Linux: ~/.bashrc에 추가
export PATH="$PATH:~/Android/Sdk/platform-tools"
```

### 2. "Cannot connect to backend"
**원인:** 백엔드 서버가 실행되지 않음  
**해결:**
```powershell
# 백엔드 포트 확인
netstat -ano | Select-String "8001"

# 없으면 백엔드 시작:
cd ..\backend
.\start-backend.ps1
# 또는
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### 3. "No devices found"
**원인:** ADB에 디바이스가 연결되지 않음  
**해결:**
```powershell
# ADB 디바이스 리스트 확인
adb devices

# USB 재연결 또는 WiFi 다시 설정
adb kill-server
adb start-server
adb devices
```

### 4. Agent가 시작되었지만 작업을 받지 않음
**원인:** 
- 테스트를 시작하지 않았거나
- 디바이스가 등록되지 않았거나
- 타임아웃

**해결:**
1. 대시보드 http://localhost:8001 에서 테스트 시작
2. 디바이스 등록 확인
3. Agent 로그 확인
4. `POLL_MS` 값 낮추기: `$env:POLL_MS = "2000"`

## 🧪 시뮬레이션 모드 (테스트용)

디바이스나 Appium이 없을 때:

```powershell
# Windows
$env:EXECUTE_REAL_APPIUM = "false"
node src/index.js

# macOS / Linux
export EXECUTE_REAL_APPIUM="false"
node src/index.js
```

**결과:** 모든 테스트가 가상 성공을 반환합니다 (본격 개발/테스트용).

## 📝 로그 분석

```
[Agent] Starting task: task-id-123
[Agent] Device: emulator-5554
[Agent] Execution mode: REAL_APPIUM
[Agent] Attempt 1/2
[Agent] Task completed: PASS
[Agent] Reporting to backend...
```

## 🔗 관련 문서

- [README.md](../README.md) - 전체 시스템 가이드
- [Backend 가이드](../backend/README.md) - 백엔드 설정 방법
- [Frontend 가이드](../frontend/README.md) - 웹 UI 가이드
