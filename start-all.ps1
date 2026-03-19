#!/usr/bin/env PowerShell

# 통합 시작 스크립트 (Windows PowerShell)
# 모든 컴포넌트를 한번에 시작하거나 선택해서 시작

# 색상 정의
$Colors = @{
    Green = 'Green'
    Yellow = 'Yellow'
    Red = 'Red'
    Cyan = 'Cyan'
    Magenta = 'Magenta'
}

function Write-ColoredOutput {
    param(
        [string]$Message,
        [string]$Color = 'White'
    )
    Write-Host $Message -ForegroundColor $Color
}

# 환경 정보 출력
Write-ColoredOutput "╔════════════════════════════════════════════════════╗" $Colors.Cyan
Write-ColoredOutput "║   모바일 자동화 테스트 제어 센터 - 종합 시작     ║" $Colors.Cyan
Write-ColoredOutput "╚════════════════════════════════════════════════════╝" $Colors.Cyan

Write-ColoredOutput "`n📍 작업 디렉토리: $(Get-Location)" $Colors.Green

# 1. Git 상태 확인
Write-ColoredOutput "`n[1] Git 저장소 상태" $Colors.Cyan
try {
    $CurrentBranch = git rev-parse --abbrev-ref HEAD 2>$null
    $CommitCount = (git rev-list --count HEAD 2>$null) -eq "" ? 0 : (git rev-list --count HEAD 2>$null)
    Write-ColoredOutput "✅ Branch: $CurrentBranch | Commits: $CommitCount" $Colors.Green
} catch {
    Write-ColoredOutput "⚠️  Git 정보 없음" $Colors.Yellow
}

# 2. Python 확인
Write-ColoredOutput "`n[2] Python 환경" $Colors.Cyan
try {
    $PythonVersion = python --version 2>&1
    Write-ColoredOutput "✅ $PythonVersion" $Colors.Green
    
    # 가상환경 활성화 상태 확인
    if (Test-Path ".venv/Scripts/activate") {
        Write-ColoredOutput "✅ 가상환경 존재: .venv/" $Colors.Green
    } else {
        Write-ColoredOutput "❌ 가상환경 없음 - 'python -m venv .venv' 실행 필요" $Colors.Red
        exit 1
    }
} catch {
    Write-ColoredOutput "❌ Python 설치 필요" $Colors.Red
    exit 1
}

# 3. Node.js 확인
Write-ColoredOutput "`n[3] Node.js 환경" $Colors.Cyan
try {
    $NodeVersion = node -v
    $NpmVersion = npm -v
    Write-ColoredOutput "✅ Node: $NodeVersion | npm: $NpmVersion" $Colors.Green
} catch {
    Write-ColoredOutput "❌ Node.js 설치 필요" $Colors.Red
    exit 1
}

# 4. ADB 확인
Write-ColoredOutput "`n[4] ADB (Android Debug Bridge)" $Colors.Cyan
try {
    $AdbOutput = adb devices 2>&1
    $DeviceCount = ($AdbOutput | Select-String "device$" | Measure-Object).Count
    
    if ($DeviceCount -gt 0) {
        Write-ColoredOutput "✅ 연결된 디바이스: $DeviceCount개" $Colors.Green
        $AdbOutput | Select-String "device$" | ForEach-Object {
            Write-ColoredOutput "   └─ $_" $Colors.Green
        }
    } else {
        Write-ColoredOutput "⚠️  연결된 디바이스 없음" $Colors.Yellow
    }
} catch {
    Write-ColoredOutput "⚠️  ADB를 찾을 수 없음 (Android 연결 필요)" $Colors.Yellow
}

# 5. 포트 확인
Write-ColoredOutput "`n[5] 포트 상태" $Colors.Cyan
$Ports = @(8001, 3000, 4723, 5173)
foreach ($Port in $Ports) {
    $PortCheck = netstat -ano 2>$null | Select-String ":$Port" | Measure-Object
    if ($PortCheck.Count -gt 0) {
        Write-ColoredOutput "⚠️  포트 $Port 이미 사용 중" $Colors.Yellow
    } else {
        Write-ColoredOutput "✅ 포트 $Port 사용 가능" $Colors.Green
    }
}

# 6. 시작 옵션
Write-ColoredOutput "`n╔════════════════════════════════════════════════════╗" $Colors.Cyan
Write-ColoredOutput "║                  시작 옵션                         ║" $Colors.Cyan
Write-ColoredOutput "╚════════════════════════════════════════════════════╝" $Colors.Cyan

Write-ColoredOutput "`n1️⃣  [전체 시작] 백엔드 + 프론트엔드" $Colors.Magenta
Write-ColoredOutput "2️⃣  [백엔드만] HTTP API 서버" $Colors.Magenta
Write-ColoredOutput "3️⃣  [프론트엔드] 웹 UI (개발 모드)" $Colors.Magenta
Write-ColoredOutput "4️⃣  [에이전트] Appium 에이전트" $Colors.Magenta
Write-ColoredOutput "5️⃣  [전체 + 시뮬레이션] Agent가 가상 테스트 실행" $Colors.Magenta
Write-ColoredOutput "0️⃣  [빠른 체크] 기본 기능 테스트" $Colors.Magenta
Write-ColoredOutput "Q️⃣  [종료]" $Colors.Magenta

$Choice = Read-Host "`n선택하세요 (숫자 입력)"

switch ($Choice) {
    "1" {
        Write-ColoredOutput "`n▶️  전체 시작: 백엔드 + 프론트엔드" $Colors.Green
        
        # 프론트엔드 빌드
        Write-ColoredOutput "`n[단계 1/2] 프론트엔드 빌드..." $Colors.Cyan
        Push-Location frontend
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-ColoredOutput "❌ 빌드 실패" $Colors.Red
            exit 1
        }
        Pop-Location
        Write-ColoredOutput "✅ 빌드 완료" $Colors.Green
        
        # 백엔드 시작
        Write-ColoredOutput "`n[단계 2/2] 백엔드 시작..." $Colors.Cyan
        .\.venv\Scripts\activate.ps1
        Set-Location backend
        $env:PYTHONPATH = "."
        Write-ColoredOutput "`n🟢 백엔드 서버: http://localhost:8001" $Colors.Green
        Write-ColoredOutput "💡 웹브라우저에서 http://localhost:8001 에 접속하세요" $Colors.Yellow
        
        python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
    }
    
    "2" {
        Write-ColoredOutput "`n▶️  백엔드만 시작" $Colors.Green
        .\.venv\Scripts\activate.ps1
        Set-Location backend
        $env:PYTHONPATH = "."
        Write-ColoredOutput "`n🟢 백엔드 서버: http://localhost:8001" $Colors.Green
        python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
    }
    
    "3" {
        Write-ColoredOutput "`n▶️  프론트엔드 개발 모드" $Colors.Green
        Set-Location frontend
        npm run dev
    }
    
    "4" {
        Write-ColoredOutput "`n▶️  에이전트 시작" $Colors.Green
        Write-ColoredOutput "`n⚠️  주의: 백엔드가 실행 중이어야 합니다 (다른 터미널에서)" $Colors.Yellow
        Set-Location agent
        .\start-agent.ps1
    }
    
    "5" {
        Write-ColoredOutput "`n▶️  전체 시작 + 에이전트 시뮬레이션" $Colors.Green
        
        # 프론트엔드 빌드
        Write-ColoredOutput "`n[단계 1/3] 프론트엔드 빌드..." $Colors.Cyan
        Push-Location frontend
        npm run build
        Pop-Location
        
        # 백엔드 시작 (백그라운드)
        Write-ColoredOutput "`n[단계 2/3] 백엔드 시작 중..." $Colors.Cyan
        .\.venv\Scripts\activate.ps1
        $BackendJob = Start-Job -Name "QA-Backend" -ScriptBlock {
            Set-Location $args[0]
            $env:PYTHONPATH = "."
            python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
        } -ArgumentList (Get-Location).Path
        
        Start-Sleep -Seconds 2
        Write-ColoredOutput "✅ 백엔드 시작됨" $Colors.Green
        
        # 에이전트 시작 (백그라운드, 시뮬레이션 모드)
        Write-ColoredOutput "`n[단계 3/3] 에이전트 시작 (시뮬레이션 모드)..." $Colors.Cyan
        $AgentJob = Start-Job -Name "QA-Agent" -ScriptBlock {
            Set-Location $args[0]/agent
            $env:API_BASE = "http://localhost:8001/api"
            $env:EXECUTE_REAL_APPIUM = "false"
            npm run dev
        } -ArgumentList (Get-Location).Path
        
        Start-Sleep -Seconds 2
        Write-ColoredOutput "✅ 에이전트 시작됨 (시뮬레이션 모드)" $Colors.Green
        
        Write-ColoredOutput "`n════════════════════════════════════════════════════" $Colors.Cyan
        Write-ColoredOutput "🟢 모든 서비스 실행 중!" $Colors.Green
        Write-ColoredOutput "════════════════════════════════════════════════════" $Colors.Cyan
        Write-ColoredOutput "`n📍 접속 주소:" $Colors.Yellow
        Write-ColoredOutput "   🌐 Web UI: http://localhost:8001" $Colors.Yellow
        Write-ColoredOutput "   🔌 API: http://localhost:8001/api" $Colors.Yellow
        Write-ColoredOutput "   🤖 Agent: 백그라운드 실행 중 (시뮬레이션 모드)" $Colors.Yellow
        
        Write-ColoredOutput "`n📝 백그라운드 작업 상태:" $Colors.Yellow
        Get-Job | Format-Table Id, Name, State, HasMoreData
        
        Write-ColoredOutput "`n💡 팁:" $Colors.Yellow
        Write-ColoredOutput "   - 백그라운드 로그 보기: Get-Job -Name 'QA-Backend' | Receive-Job -Keep" $Colors.Yellow
        Write-ColoredOutput "   - 서비스 중지: Stop-Job -Name 'QA-*'; Remove-Job -Name 'QA-*'" $Colors.Yellow
        
        Write-ColoredOutput "`n⏳ 웹브라우저에서 http://localhost:8001 에 접속하여 테스트를 시작하세요!" $Colors.Green
        Write-ColoredOutput "`n종료할 때까지 대기 중... (CTRL+C 또는 창 닫기)" $Colors.Yellow
        
        # 대기
        while ($true) {
            Start-Sleep -Seconds 10
            $BackendState = (Get-Job -Name "QA-Backend").State
            $AgentState = (Get-Job -Name "QA-Agent").State
            
            if ($BackendState -ne "Running" -or $AgentState -ne "Running") {
                Write-ColoredOutput "`n⚠️  서비스가 중단되었습니다" $Colors.Red
                break
            }
        }
    }
    
    "0" {
        Write-ColoredOutput "`n▶️  빠른 체크 시작" $Colors.Green
        Write-ColoredOutput "`n[체크 1/3] 백엔드 헬스 체크..." $Colors.Cyan
        try {
            # 백엔드가 이미 실행 중인지 확인
            $HealthCheck = Invoke-WebRequest -Uri "http://localhost:8001/health" -ErrorAction Stop
            Write-ColoredOutput "✅ 백엔드: OK ($($HealthCheck.StatusCode))" $Colors.Green
        } catch {
            Write-ColoredOutput "❌ 백엔드: 미실행 - './start.ps1' 실행 필요" $Colors.Red
            exit 1
        }
        
        Write-ColoredOutput "`n[체크 2/3] 프론트엔드 자산..." $Colors.Cyan
        if (Test-Path "frontend/dist/index.html") {
            Write-ColoredOutput "✅ 프론트엔드 빌드: 존재" $Colors.Green
        } else {
            Write-ColoredOutput "❌ 프론트엔드 빌드: 없음 - '$cd frontend && npm run build' 실행 필요" $Colors.Red
        }
        
        Write-ColoredOutput "`n[체크 3/3] 기본 API 테스트..." $Colors.Cyan
        try {
            $CasesCheck = Invoke-WebRequest -Uri "http://localhost:8001/api/cases" -ErrorAction Stop
            $Cases = $CasesCheck.Content | ConvertFrom-Json
            Write-ColoredOutput "✅ API: OK - 테스트 케이스 $($Cases.Count)개" $Colors.Green
        } catch {
            Write-ColoredOutput "❌ API 호출 실패" $Colors.Red
        }
        
        Write-ColoredOutput "`n════════════════════════════════════════════════════" $Colors.Green
        Write-ColoredOutput "✅ 시스템 준비 완료!" $Colors.Green
        Write-ColoredOutput "════════════════════════════════════════════════════" $Colors.Green
        Write-ColoredOutput "`n🌐 접속: http://localhost:8001" $Colors.Yellow
    }
    
    "Q" {
        Write-ColoredOutput "`n👋 종료합니다" $Colors.Yellow
        exit 0
    }
    
    default {
        Write-ColoredOutput "`n❌ 잘못된 선택" $Colors.Red
        exit 1
    }
}
