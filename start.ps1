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

Write-Host "`n[1/2] 프론트 빌드 (backend 단일 URL 제공용)..." -ForegroundColor Cyan
Set-Location $FRONTEND
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "프론트 빌드 실패. 로그를 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/3] 백엔드 기동 (port 8001)..." -ForegroundColor Cyan
Stop-Job -Name qa-back -ErrorAction SilentlyContinue
Remove-Job -Name qa-back -ErrorAction SilentlyContinue
Stop-Job -Name qa-agent -ErrorAction SilentlyContinue
Remove-Job -Name qa-agent -ErrorAction SilentlyContinue

Start-Job -Name qa-back -ScriptBlock {
    param($uvicorn, $backend)
    Set-Location $backend
    $env:PYTHONPATH = $backend
    & $uvicorn app.main:app --host 0.0.0.0 --port 8001 2>&1
} -ArgumentList $UVICORN, $BACKEND | Out-Null

Start-Sleep -Seconds 3

# Health check
try {
    $health = Invoke-RestMethod http://127.0.0.1:8001/health
    Write-Host "    백엔드 OK: $($health.service)" -ForegroundColor Green
} catch {
    Write-Host "    백엔드 응답 없음 - 로그 확인:" -ForegroundColor Red
    Get-Job -Name qa-back | Receive-Job 2>&1 | Select-Object -Last 10
}

Write-Host "`n[3/3] 에이전트 기동 (단말 자동 동기화)..." -ForegroundColor Cyan
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "    Node.js 미설치 - 에이전트는 시작하지 않습니다." -ForegroundColor Yellow
} elseif (!(Test-Path $AGENT)) {
    Write-Host "    agent 폴더 없음 - 에이전트는 시작하지 않습니다." -ForegroundColor Yellow
} else {
    Start-Job -Name qa-agent -ScriptBlock {
        param($agentDir)
        Set-Location $agentDir
        $env:API_BASE = "http://127.0.0.1:8001/api"
        $env:AGENT_USER = "local-agent"
        if (!(Test-Path (Join-Path $agentDir "node_modules"))) {
            npm install 2>&1 | Out-Null
        }
        node src/index.js 2>&1
    } -ArgumentList $AGENT | Out-Null

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
Write-Host "  대시보드: http://localhost:8001" -ForegroundColor Yellow
Write-Host "  백엔드:   http://localhost:8001/health" -ForegroundColor Yellow
Write-Host "  API 문서: http://localhost:8001/docs" -ForegroundColor Yellow
Write-Host "  에이전트: Get-Job -Name qa-agent | Receive-Job -Keep" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "`n실행 중... (종료: Stop-Job -Name qa-back,qa-agent)" -ForegroundColor Gray
