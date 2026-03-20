# ============================================================
# Mobile QA Control Center - 로컬 개발 실행 스크립트
# ============================================================
# 실행 방법:  .\start.ps1
# 종료:       Ctrl+C 후 Stop-Job -Name qa-back
# ============================================================

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$VENV = Join-Path $ROOT ".venv\Scripts"
$UVICORN = Join-Path $VENV "uvicorn.exe"
$BACKEND = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"
$AGENT = Join-Path $ROOT "agent"
$ANDROID_SDK = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$PORT = 8001

$portBusy = netstat -ano | Select-String ":$PORT" | Select-String "LISTENING"
if ($portBusy) {
    Write-Host "기본 포트 8001이 이미 사용 중입니다. 포트 8010으로 자동 전환합니다." -ForegroundColor Yellow
    $PORT = 8010
}

if (!(Test-Path $ANDROID_SDK)) {
    $adbCmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($adbCmd -and $adbCmd.Source) {
        $ptDir = Split-Path -Parent $adbCmd.Source
        if ((Split-Path -Leaf $ptDir) -eq "platform-tools") {
            $candidate = Split-Path -Parent $ptDir
            if (Test-Path $candidate) {
                $ANDROID_SDK = $candidate
            }
        }
    }
}

if (Test-Path $ANDROID_SDK) {
    Write-Host "Android SDK 감지: $ANDROID_SDK" -ForegroundColor Green
} else {
    Write-Host "Android SDK 경로를 찾지 못했습니다: $ANDROID_SDK" -ForegroundColor Yellow
    Write-Host "실제 단말 실행에는 ANDROID_HOME/ANDROID_SDK_ROOT 설정이 필요합니다." -ForegroundColor Yellow
}

Write-Host "`n[1/2] 프론트 빌드 (backend 단일 URL 제공용)..." -ForegroundColor Cyan
Set-Location $FRONTEND
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "프론트 빌드 실패. 로그를 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/3] 백엔드 기동 (port $PORT)..." -ForegroundColor Cyan
Stop-Job -Name qa-back -ErrorAction SilentlyContinue
Remove-Job -Name qa-back -ErrorAction SilentlyContinue
Stop-Job -Name qa-agent -ErrorAction SilentlyContinue
Remove-Job -Name qa-agent -ErrorAction SilentlyContinue
Stop-Job -Name qa-appium -ErrorAction SilentlyContinue
Remove-Job -Name qa-appium -ErrorAction SilentlyContinue

Start-Job -Name qa-back -ScriptBlock {
    param($uvicorn, $backend, $port)
    Set-Location $backend
    $env:PYTHONPATH = $backend
    & $uvicorn app.main:app --host 0.0.0.0 --port $port 2>&1
} -ArgumentList $UVICORN, $BACKEND, $PORT | Out-Null

Start-Sleep -Seconds 3

# Health check
try {
    $health = Invoke-RestMethod "http://127.0.0.1:$PORT/health"
    Write-Host "    백엔드 OK: $($health.service)" -ForegroundColor Green
} catch {
    Write-Host "    백엔드 응답 없음 - 로그 확인:" -ForegroundColor Red
    Get-Job -Name qa-back | Receive-Job 2>&1 | Select-Object -Last 10
}

Write-Host "`n[3/4] Appium 기동 (port 4723)..." -ForegroundColor Cyan
if (!(Get-Command appium -ErrorAction SilentlyContinue)) {
    Write-Host "    appium 명령을 찾지 못했습니다. 전역 설치 필요: npm i -g appium" -ForegroundColor Yellow
} else {
    Start-Job -Name qa-appium -ScriptBlock {
        param($androidSdk)
        if (Test-Path $androidSdk) {
            $env:ANDROID_HOME = $androidSdk
            $env:ANDROID_SDK_ROOT = $androidSdk
            $env:PATH = "$androidSdk\platform-tools;$androidSdk\emulator;$env:PATH"
        }
        appium -p 4723 --base-path /wd/hub --allow-insecure adb_shell 2>&1
    } -ArgumentList $ANDROID_SDK | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "    Appium 시작 시도 완료" -ForegroundColor Green
}

Write-Host "`n[4/4] 에이전트 기동 (단말 자동 동기화)..." -ForegroundColor Cyan
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "    Node.js 미설치 - 에이전트는 시작하지 않습니다." -ForegroundColor Yellow
} elseif (!(Test-Path $AGENT)) {
    Write-Host "    agent 폴더 없음 - 에이전트는 시작하지 않습니다." -ForegroundColor Yellow
} else {
    Start-Job -Name qa-agent -ScriptBlock {
        param($agentDir, $port, $androidSdk)
        Set-Location $agentDir
        $env:API_BASE = "http://127.0.0.1:$port/api"
        $env:AGENT_USER = "local-agent"
        $env:EXECUTE_REAL_APPIUM = "true"
        $env:APPIUM_HOST = "127.0.0.1"
        $env:APPIUM_PORT = "4723"
        $env:APPIUM_PATH = "/wd/hub"
        if (Test-Path $androidSdk) {
            $env:ANDROID_HOME = $androidSdk
            $env:ANDROID_SDK_ROOT = $androidSdk
            $env:PATH = "$androidSdk\platform-tools;$androidSdk\emulator;$env:PATH"
        }
        if (!(Test-Path (Join-Path $agentDir "node_modules"))) {
            npm install 2>&1 | Out-Null
        }
        node src/index.js 2>&1
    } -ArgumentList $AGENT, $PORT, $ANDROID_SDK | Out-Null

    Start-Sleep -Seconds 2
    $agentLogs = Get-Job -Name qa-agent | Receive-Job -Keep 2>&1 | Select-Object -Last 3
    if ($agentLogs) {
        Write-Host "    에이전트 로그:" -ForegroundColor Green
        $agentLogs | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
    } else {
        Write-Host "    에이전트 시작됨 (로그 대기 중)" -ForegroundColor Green
    }
}

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "  대시보드: http://localhost:$PORT" -ForegroundColor Yellow
Write-Host "  백엔드:   http://localhost:$PORT/health" -ForegroundColor Yellow
Write-Host "  API 문서: http://localhost:$PORT/docs" -ForegroundColor Yellow
Write-Host "  에이전트: Get-Job -Name qa-agent | Receive-Job -Keep" -ForegroundColor Yellow
Write-Host "  Appium:   Get-Job -Name qa-appium | Receive-Job -Keep" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "`n실행 중... (종료: Stop-Job -Name qa-back,qa-agent,qa-appium)" -ForegroundColor Gray
