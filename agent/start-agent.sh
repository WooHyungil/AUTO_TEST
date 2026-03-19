#!/bin/bash

# Agent 시작 스크립트 (macOS / Linux)
# 
# 사용법: chmod +x start-agent.sh && ./start-agent.sh
# 
# 설명: Appium Agent를 시작합니다.
#       - 의존성 자동 설치
#       - 환경 변수 자동 설정
#       - ADB 스캔 후 에이전트 시작

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 함수
write_status() {
    COLOR=$2
    if [ -z "$COLOR" ]; then COLOR="$CYAN"; fi
    echo -e "${COLOR}$1${NC}"
}

# Step 1: 현재 디렉토리 확인
write_status "=== Appium Agent 시작 ===" "$CYAN"
write_status "작업 디렉토리: $(pwd)" "$GREEN"

# Step 2: Node.js 확인
write_status "\n[1/5] Node.js 확인 중..." "$CYAN"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    write_status "✅ Node.js 버전: $NODE_VERSION" "$GREEN"
else
    write_status "❌ Node.js를 찾을 수 없습니다!" "$RED"
    write_status "   설치: https://nodejs.org/ 또는 brew install node" "$YELLOW"
    exit 1
fi

# Step 3: ADB 확인
write_status "\n[2/5] ADB 확인 중..." "$CYAN"
if command -v adb &> /dev/null; then
    write_status "✅ ADB 연결됨" "$GREEN"
    write_status "   연결된 디바이스:" "$YELLOW"
    adb devices | grep -E "device$" | head -10 | while read line; do
        write_status "   └─ $line" "$GREEN"
    done
else
    write_status "⚠️  ADB를 찾을 수 없습니다" "$YELLOW"
    write_status "   설치 (macOS): brew install android-platform-tools" "$YELLOW"
    write_status "   설치 (Ubuntu): sudo apt-get install android-tools-adb" "$YELLOW"
fi

# Step 4: 의존성 설치
write_status "\n[3/5] npm 패키지 설치 중..." "$CYAN"
if [ -d "node_modules" ]; then
    write_status "✅ 패키지 이미 설치됨" "$GREEN"
else
    npm install
    if [ $? -eq 0 ]; then
        write_status "✅ 패키지 설치 완료" "$GREEN"
    else
        write_status "❌ npm install 실패" "$RED"
        exit 1
    fi
fi

# Step 5: 환경 변수 설정
write_status "\n[4/5] 환경 변수 설정 중..." "$CYAN"
export API_BASE="http://localhost:8001/api"
export AGENT_PLATFORM="android"
export POLL_MS="4000"
export EXECUTE_REAL_APPIUM="false"  # 기본값: 시뮬레이션 모드
export TASK_MAX_RETRY="1"

write_status "✅ 환경 변수 설정 완료:" "$GREEN"
write_status "   API_BASE: $API_BASE" "$YELLOW"
write_status "   PLATFORM: $AGENT_PLATFORM" "$YELLOW"
write_status "   EXECUTE_REAL_APPIUM: $EXECUTE_REAL_APPIUM" "$YELLOW"

write_status "\n💡 팁: 실제 테스트를 실행하려면" "$CYAN"
write_status "   export EXECUTE_REAL_APPIUM=true" "$YELLOW"
write_status "   이후 다시 스크립트를 실행하세요." "$YELLOW"

# Step 6: 에이전트 시작
write_status "\n[5/5] Appium Agent 시작 중..." "$CYAN"
write_status "백엔드 주소: http://localhost:8001" "$GREEN"
write_status "플랫폼: Android" "$GREEN"
write_status "\n⏳ CTRL+C를 눌러 종료합니다..." "$YELLOW"

node src/index.js
