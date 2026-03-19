# 📱 모바일 자동화 테스트 제어 센터

**안드로이드 앱을 자동으로 테스트하는 통합 관리 시스템**

> 테스트 케이스 정의 → 단말 연결 → 자동 실행 → 결과 분석  
> 모든 것을 한 웹 대시보드 `http://localhost:8001`에서!

---

## ⚡ 빠른 시작 (Windows)

### 1단계: 기본 요구 사항 확인
```powershell
# ADB 설치 확인
adb version

# Node.js 설치 확인
node -v  # v16 이상

# Python 설치 확인
python --version  # 3.10 이상
```

### 2단계: 원클릭 시작
```powershell
cd c:\Users\poliot\OneDrive\바탕화면\자동테스트_프로그램
.\start.ps1
```

### 3단계: 브라우저 열기
**http://localhost:8001** 에 접속

---

## 📖 사용 방법 (4단계 가이드)

### 🔑 **1단계: 로그인**
- 사용자명 입력 (예: "test_user")
- 로그인 버튼 클릭
- 대시보드 진입 ✅

### 📝 **2단계: 테스트 케이스 선택**
1. **왼쪽 메뉴** → "테스트 케이스" 클릭
2. **실행할 앱과 테스트 시나리오** 선택
   - 예: "로그인 화면에서 이메일 입력 후 로그인"
3. **선택 완료** ✅

### 🔌 **3단계: 안드로이드 단말 연결 & 등록**

#### A. 단말이 PC에 USB로 연결된 경우
```powershell
# 1. PowerShell에서 확인
adb devices

# 2. 출력 예:
# List of attached devices
# emulator-5554    device
# R58M812A5XX      device
```

**만약 단말이 표시되지 않으면:**
1. **안드로이드 단말 설정**
   - 설정 → 개발자 옵션 → USB 디버깅 **ON**
   - 이 컴퓨터를 항상 허용 **체크**
2. **USB 다시 연결**
3. **윈도우의 ADB 재시작**
   ```powershell
   adb kill-server
   adb start-server
   adb devices
   ```

#### B. 대시보드에 단말 등록
1. **오른쪽 메뉴** → "단말 등록" 클릭
2. **"스캔" 버튼** → 연결된 단말 자동 발견
3. **단말 선택** 후 "등록" 버튼 클릭 ✅

### ▶️ **4단계: 테스트 실행 & 모니터링**
1. 선택한 **케이스✓** + **단말✓** 확인
2. **"테스트 시작"** 버튼 클릭
3. **실시간 진행 상태** 모니터링:
   - 📊 진행률 바 표시
   - 📝 로그 메시지 실시간 출력
   - 📸 스크린샷 자동 캡처
4. **완료 후 결과 분석**:
   - ✅ 성공 / ❌ 실패 여부
   - 🔍 실패 원인 분류 (로케이터 미발견, 타임아웃 등)
   - 📥 CSV 감사 보고서 내보내기

---

## 🔧 고급 설정: 에이전트 (Agent) 수동 구성

### Agent란?
**실제 안드로이드 단말에 명령을 보내고 테스트를 실행하는 프로세스**
- ADB로 단말 스캔
- Appium으로 앱 자동화
- 백엔드와 WebSocket 통신

### Agent 시작하기
```powershell
# 1. 프로젝트 폴더에서
cd c:\Users\poliot\OneDrive\바탕화면\자동테스트_프로그램\agent

# 2. 의존성 설치 (처음 한 번만)
npm install

# 3. 환경 설정
$env:API_BASE = "http://localhost:8001/api"
$env:AGENT_PLATFORM = "android"
$env:EXECUTE_REAL_APPIUM = "true"      # 실제 실행
# $env:EXECUTE_REAL_APPIUM = "false"   # 시뮬레이션 (테스트용)

# 4. 에이전트 시작
node src/index.js

# 출력 예:
# [Agent] Platform: android
# [Agent] Poll interval: 4000ms
# [Agent] Scanning devices...
# [Agent] Found devices: [emulator-5554]
# [Agent] Connected to backend: http://localhost:8001/api
```

### Agent 환경 변수
| 변수 | 설명 | 기본값 |
|------|------|--------|
| `API_BASE` | 백엔드 API 주소 | http://localhost:8000/api |
| `AGENT_USER` | 에이전트 식별자 | local-agent |
| `AGENT_PLATFORM` | 플랫폼 (android\|ios) | android |
| `POLL_MS` | 작업 폴링 간격 (ms) | 4000 |
| `EXECUTE_REAL_APPIUM` | 실제 Appium 실행 여부 | false |
| `TASK_MAX_RETRY` | 실패 시 재시도 횟수 | 1 |

---

## 📱 Android 단말 연결 완전 가이드

### 📌 사전 준비
- 안드로이드 10 이상
- USB 케이블 (USB 3.0 권장)
- PC의 Android SDK 또는 독립 설치 ADB

### 🔌 USB 연결 (권장)

#### 1. PC 준비
```powershell
# ADB 설치 위치 확인
where adb

# PATH에 없으면 추가:
$env:PATH += ";C:\Users\[username]\AppData\Local\Android\Sdk\platform-tools"
```

#### 2. 안드로이드 단말 준비
1. **설정 앱 열기**
2. **휴대전화 정보 또는 빌드 번호로 이동**
   - Q: 설정 → 휴대전화 정보 → **빌드 번호** 7번 탭
   - A: 설정 → 개발자 옵션 (이미 있음)
3. **개발자 옵션** 진입
4. **USB 디버깅** ON
5. **"이 항상 허용"** 체크 (권한 요청 시)
6. **USB Type-C 케이블로 PC 연결**

#### 3. 연결 확인
```powershell
adb devices

# 출력 예:
# List of attached devices
# emulator-5554       device
# 192.168.1.100:5555  device
```

### 🌐 WiFi 연결 (옵션)
```powershell
# 1. USB로 먼저 연결 후 명령 실행
adb tcpip 5555

# 2. USB 뽑기 (선택사항)

# 3. 단말의 IP 확인 후 재연결
adb connect 192.168.1.100:5555
# (단말의 실제 IP로 변경)

# 4. 확인
adb devices
```

### ❌ 연결 문제 해결

| 증상 | 원인 | 해결책 |
|------|------|--------|
| `adb: command not found` | ADB PATH 미설정 | 위의 PATH 추가 참고 |
| `unauthorized` | 권한 거부 | 단말에서 "이 컴퓨터 항상 허용" 선택 |
| `device offline` | USB 연결 끊김 | USB 다시 연결 |
| `no devices found` | 디버그 모드 OFF | 단말: 설정 → 개발자 옵션 → USB 디버깅 ON |

---

## 📊 결과 분석 & 리포팅

### 테스트 상태
| 상태 | 의미 | 대응 |
|------|------|------|
| ✅ **PASS** | 모든 검증 성공 | 완료 |
| ❌ **FAIL** | 일부 검증 실패 | 실패 원인 분석 |
| ⏱️ **TIMEOUT** | 초과 시간 | 네트워크/앱 속도 확인 |
| 🔌 **CONNECTION_ERROR** | 단말 연결 끊김 | USB/WiFi 재확인 |

### 감사 보고서 내보내기
1. 오른쪽 상단 **"감사 보고서"** 클릭
2. **실패 유형별 통계** 확인
3. **"Excel 내보내기"** 버튼 → CSV 다운로드
4. 분석 스프레드시트에서 상세 검토

---

## 🏗️ 프로젝트 구조

```
자동테스트_프로그램/
├── frontend/                    # React 웹 UI
│   ├── src/
│   │   ├── pages/              # 페이지 컴포넌트
│   │   ├── services/           # API/WebSocket 클라이언트
│   │   └── styles.css          # 전역 스타일
│   ├── dist/                   # 프로덕션 빌드 (start.ps1 자동 생성)
│   └── package.json
├── backend/                     # FastAPI 백엔드 서버
│   ├── app/
│   │   ├── api/                # API 라우터
│   │   │   ├── auth.py         # 인증
│   │   │   ├── devices.py      # 단말 관리
│   │   │   ├── cases.py        # 테스트 케이스
│   │   │   ├── runs.py         # 테스트 실행
│   │   │   └── agents.py       # 에이전트 통신
│   │   ├── services/           # 비즈니스 로직
│   │   │   ├── state.py        # 메모리 상태 저장소
│   │   │   └── runner.py       # 테스트 실행 시뮬레이션
│   │   └── schemas/            # 데이터 모델
│   └── requirements.txt
├── agent/                       # Node.js Appium 에이전트
│   ├── src/
│   │   ├── index.js            # 메인 루프 (작업 폴링)
│   │   ├── adbScanner.js       # ADB 디바이스 스캔
│   │   └── appiumExecutor.js   # Appium 실행
│   └── package.json
├── scripts/                     # 유틸리티 스크립트
│   ├── e2e_smoke_test.py       # 기능 테스트
│   └── check_api_routes.py     # API 검증
├── start.ps1                    # [중요] 원클릭 시작 (Windows)
└── README.md                    # 이 파일
```

---

## 🧪 테스트 & 검증

### 전체 기능 E2E 테스트
```powershell
# Python 가상환경 활성화 후:
cd backend
python ..\scripts\e2e_smoke_test.py
```

**성공 시 출력:**
```
✅ Stage 1: Login - PASS
✅ Stage 2: Select Case - PASS
✅ Stage 3: Register Device - PASS
✅ Stage 4: Start Run - PASS
✅ Stage 5: Poll Task Queue - PASS
✅ Stage 6: Fetch Task Details - PASS
```

---

## 💡 FAQ

### Q: 브라우저에서 아무것도 안 보여요
**A:** 다음 확인:
```powershell
# 1. 포트 확인
netstat -ano | Select-String "8001"

# 2. 브라우저 개발자 도구 (F12)
# - Network 탭: 요청 상태 확인
# - Console: 에러 메시지 확인

# 3. 강제 새로고침
Ctrl + Shift + R
```

### Q: 테스트가 "pending" 상태에 멈춰요
**A:** Agent 미실행 또는 단말 미연결:
```powershell
# 1. Agent 프로세스 확인
Get-Process node

# 2. 없으면 Agent 시작
cd agent
$env:EXECUTE_REAL_APPIUM = "false"  # 시뮬레이션 모드
node src/index.js
```

### Q: "단말이 offline" 표시돼요
**A:**
```powershell
# 방법 1: ADB 재시작
adb kill-server
adb start-server
adb devices

# 방법 2: USB 다시 연결

# 방법 3: 안드로이드 단말
# 설정 → 개발자 옵션 → USB 디버깅 ON
```

### Q: 어디서 로그를 봐요?
**A:**
- **브라우저**: 개발자 도구 (F12) → Console 탭
- **PowerShell**: Agent 실행 터미널의 메시지
- **백엔드**: `python -m uvicorn ... --reload` 터미널의 로그

---

## 🚀 개발 모드 (기여자용)

### 프론트엔드 개발 서버 (핫 리로드)
```powershell
cd frontend
npm run dev
# → http://localhost:5173 에서 개발
```

### 백엔드 개발 (자동 재시작)
```powershell
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

---

## 📞 지원

**이슈 신고**: [GitHub Issues](https://github.com/WooHyungil/AUTO_TEST/issues)

---

## 📄 라이선스

비공개 프로젝트

**마지막 업데이트**: 2026-03-19
