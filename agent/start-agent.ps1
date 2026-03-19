#!/usr/bin/env node

# Agent 시작 스크립트 (Windows PowerShell)
# 
# 사용법: .\start-agent.ps1
# 
# 설명: Appium Agent를 시작합니다.
#       - 의존성 자동 설치
#       - 환경 변수 자동 설정
#       - ADB 스캔 후 에이전트 시작

# 색상 정의
$Colors = @{
    Green = @{ fore = 'Green' }
    Yellow = @{ fore = 'Yellow' }
    Red = @{ fore = 'Red' }
    Cyan = @{ fore = 'Cyan' }
}

function Write-Status {
    param([string]$Message, [string]$Color = 'Cyan')
    Write-Host $Message -ForegroundColor $Color
}

# Step 1: 현재 디렉토리 확인
Write-Status "=== Appium Agent 시작 ===" "Cyan"
Write-Status "작업 디렉토리: $(Get-Location)" "Green"

# Step 2: Node.js 확인
Write-Status "`n[1/5] Node.js 확인 중..." "Cyan"
try {
    $NodeVersion = node -v
    Write-Status "✅ Node.js 버전: $NodeVersion" "Green"
} catch {
    Write-Status "❌ Node.js를 찾을 수 없습니다!" "Red"
    Write-Status "   설치 방법: https://nodejs.org/" "Yellow"
    exit 1
}

# Step 3: ADB 확인
Write-Status "`n[2/5] ADB 확인 중..." "Cyan"
try {
    $AdbDevices = adb devices
    Write-Status "✅ ADB 연결됨" "Green"
    Write-Status "   연결된 디바이스:" "Yellow"
    $AdbDevices | Select-String "device$" | ForEach-Object { 
        Write-Status "   └─ $_" "Green"
    }
} catch {
    Write-Status "⚠️  ADB를 찾을 수 없습니다" "Yellow"
    Write-Status "   설정: PATH에 Android SDK 추가" "Yellow"
}

# Step 4: 의존성 설치
Write-Status "`n[3/5] npm 패키지 설치 중..." "Cyan"
if (Test-Path "node_modules") {
    Write-Status "✅ 패키지 이미 설치됨" "Green"
} else {
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Status "✅ 패키지 설치 완료" "Green"
    } else {
        Write-Status "❌ npm install 실패" "Red"
        exit 1
    }
}

# Step 5: 환경 변수 설정
Write-Status "`n[4/5] 환경 변수 설정 중..." "Cyan"
$env:API_BASE = "http://localhost:8001/api"
$env:AGENT_PLATFORM = "android"
$env:POLL_MS = "4000"
$env:EXECUTE_REAL_APPIUM = "false"  # 기본값: 시뮬레이션 모드
$env:TASK_MAX_RETRY = "1"

Write-Status "✅ 환경 변수 설정 완료:" "Green"
Write-Status "   API_BASE: $($env:API_BASE)" "Yellow"
Write-Status "   PLATFORM: $($env:AGENT_PLATFORM)" "Yellow"
Write-Status "   EXECUTE_REAL_APPIUM: $($env:EXECUTE_REAL_APPIUM)" "Yellow"

Write-Status "`n💡 팁: 실제 테스트를 실행하려면" "Cyan"
Write-Status "   `$env:EXECUTE_REAL_APPIUM = `"true`"" "Yellow"
Write-Status "   이후 다시 실행하세요." "Yellow"

# Step 6: 에이전트 시작
Write-Status "`n[5/5] Appium Agent 시작 중..." "Cyan"
Write-Status "백엔드 주소: http://localhost:8001" "Green"
Write-Status "플랫폼: Android" "Green"
Write-Status "`n⏳ CTRL+C를 눌러 종료합니다..." "Yellow"

node src/index.js
