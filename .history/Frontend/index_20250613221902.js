let currentServerPort = null;
let isServerReady = false;

// 로딩 상태 표시/숨김
function showLoading(show) {
  const loading = document.getElementById("loading");
  if (show) {
    loading.style.display = "block";
  } else {
    loading.style.display = "none";
  }
}

// 서버 상태 업데이트
function updateServerStatus(message, color) {
  const statusElement = document.getElementById("server-status");
  statusElement.textContent = message;
  statusElement.style.color = color;
}

// 버튼 상태 업데이트
function updateButtonState(enabled, text) {
  const submitBtn = document.getElementById("submit-btn");
  if (submitBtn) {
    submitBtn.disabled = !enabled;
    submitBtn.textContent = text;
  }
}

// 서버 포트 설정 함수
function setServerPort(port) {
  currentServerPort = port;
  isServerReady = true;
  console.log(`🔗 Server port set to: ${port}`);

  updateServerStatus(`서버 연결됨 (포트: ${port})`, "green");
  updateButtonState(true, "자막 추출");
}

// Electron API 확인 및 설정
if (typeof window.electronAPI !== "undefined") {
  console.log("✅ ElectronAPI available");

  // 서버 포트 정보 수신
  window.electronAPI.onServerPort((port) => {
    setServerPort(port);
  });

  // 페이지 로드 후 서버 포트 요청
  window.addEventListener("load", () => {
    console.log("🌐 Page loaded, requesting server port...");
    // 약간의 지연 후 포트 요청 (DOM이 완전히 로드되도록)
    setTimeout(() => {
      window.electronAPI.requestServerPort();
    }, 500);
  });
} else {
  console.error("❌ ElectronAPI not available");
  updateServerStatus("ElectronAPI 연결 실패", "red");
}

// 서버 연결 상태 확인
async function checkServerConnection() {
  if (!currentServerPort) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

    const response = await fetch(
      `http://127.0.0.1:${currentServerPort}/health`,
      {
        signal: controller.signal,
        cache: "no-cache",
      }
    );

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error("Server connection check failed:", error);
    return false;
  }
}

// 자막 추출 함수
document
  .getElementById("submit-btn")
  .addEventListener("click", async function (event) {
    event.preventDefault();

    const url = document.getElementById("url-input-form").value.trim();
    if (!url) {
      alert("유튜브 URL을 입력해주세요.");
      return;
    }

    // 간단한 YouTube URL 검증
    if (!url.includes("youtube.com/watch") && !url.includes("youtu.be/")) {
      alert("올바른 유튜브 URL을 입력해주세요.");
      return;
    }

    if (!currentServerPort || !isServerReady) {
      alert("서버가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");

      // 서버 포트 재요청
      if (window.electronAPI) {
        window.electronAPI.requestServerPort();
      }
      return;
    }

    showLoading(true);
    updateServerStatus("자막을 추출하고 있습니다...", "orange");
    updateButtonState(false, "추출 중...");

    try {
      // 서버 연결 확인
      const isConnected = await checkServerConnection();
      if (!isConnected) {
        throw new Error(
          "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
        );
      }

      console.log(`📡 Sending request to port ${currentServerPort}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃

      const response = await fetch(
        `http://127.0.0.1:${currentServerPort}/submit-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ target_url: url, format: "json" }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP 오류 ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("서버 응답:", data);

      const textBox = document.getElementById("codeArea");
      if (data.subTitles) {
        textBox.value = data.subTitles;
        updateServerStatus("자막 추출 완료!", "green");
      } else if (data.error) {
        textBox.value = `오류: ${data.error}`;
        updateServerStatus(`오류: ${data.error}`, "red");
      } else {
        textBox.value = "자막을 찾을 수 없습니다.";
        updateServerStatus("자막을 찾을 수 없습니다.", "orange");
      }
    } catch (error) {
      console.error("에러 발생:", error);

      let errorMessage = error.message;
      if (error.name === "AbortError") {
        errorMessage = "요청 시간이 초과되었습니다. 다시 시도해주세요.";
      }

      alert(`오류가 발생했습니다: ${errorMessage}`);
      updateServerStatus(`오류: ${errorMessage}`, "red");

      // 에러 정보를 textarea에도 표시
      const textBox = document.getElementById("codeArea");
      textBox.value = `오류가 발생했습니다:\n${errorMessage}\n\n서버 포트: ${currentServerPort}\n서버 상태: ${
        isServerReady ? "연결됨" : "연결 안됨"
      }\n\n시간: ${new Date().toLocaleString()}`;
    } finally {
      showLoading(false);
      updateButtonState(true, "자막 추출");
    }
  });

// 클립보드 복사 함수
function copyToClipboard() {
  const textarea = document.getElementById("codeArea");
  if (!textarea.value) {
    alert("복사할 텍스트가 없습니다.");
    return;
  }

  textarea.select();
  document.execCommand("copy");
  alert("클립보드에 복사되었습니다!");
}

// 초기화 함수
document.getElementById("clear-btn").addEventListener("click", () => {
  document.getElementById("url-input-form").value = "";
  document.getElementById("codeArea").value = "";

  if (isServerReady) {
    updateServerStatus(`서버 연결됨 (포트: ${currentServerPort})`, "green");
  } else {
    updateServerStatus("서버 연결 중...", "orange");
    // 서버 포트 재요청
    if (window.electronAPI) {
      window.electronAPI.requestServerPort();
    }
  }
});

// 페이지 로드 시 초기화
window.addEventListener("load", () => {
  console.log("🌐 Page loaded, initializing...");
  updateServerStatus("서버 연결 중...", "orange");
  updateButtonState(false, "서버 대기 중...");

  // 주기적으로 서버 상태 확인 (10초마다)
  setInterval(async () => {
    if (currentServerPort && isServerReady) {
      const isConnected = await checkServerConnection();
      if (!isConnected) {
        console.warn("⚠️ Server connection lost");
        updateServerStatus(
          `서버 연결 끊김 (포트: ${currentServerPort})`,
          "red"
        );
        updateButtonState(false, "서버 연결 끊김");
        isServerReady = false;

        // 재연결 시도
        if (window.electronAPI) {
          window.electronAPI.requestServerPort();
        }
      }
    }
  }, 10000);

  // 10초 후에도 서버 정보가 없으면 재시도
  setTimeout(() => {
    if (!currentServerPort) {
      updateServerStatus("서버 연결 실패 - 다시 시도 중...", "red");
      if (window.electronAPI) {
        window.electronAPI.requestServerPort();
      }
    }
  }, 10000);

  // 20초 후에도 안되면 최종 에러
  setTimeout(() => {
    if (!currentServerPort) {
      updateServerStatus("서버 연결 실패 - 앱을 재시작해주세요", "red");
      updateButtonState(false, "서버 연결 실패");
    }
  }, 20000);
});

// 디버깅용 정보 표시
console.log("Frontend loaded. Waiting for server port...");

// 전역 함수로 export (HTML에서 사용)
window.copyToClipboard = copyToClipboard;
