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

// Electron API 확인
if (typeof window.electronAPI !== "undefined") {
  console.log("✅ ElectronAPI available");

  // 서버 포트 정보 수신
  window.electronAPI.onServerPort((port) => {
    currentServerPort = port;
    isServerReady = true;
    console.log(`🔗 Received server port: ${port}`);

    updateServerStatus(`서버 연결됨 (포트: ${port})`, "green");

    // 버튼 활성화
    const submitBtn = document.getElementById("submit-btn");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "자막 추출";
    }
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
    const response = await fetch(
      `http://127.0.0.1:${currentServerPort}/health`
    );
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

    const url = document.getElementById("url-input-form").value;
    if (!url) {
      alert("유튜브 URL을 입력해주세요.");
      return;
    }

    if (!currentServerPort || !isServerReady) {
      alert("서버가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    showLoading(true);
    updateServerStatus("자막을 추출하고 있습니다...", "orange");

    try {
      // 서버 연결 확인
      const isConnected = await checkServerConnection();
      if (!isConnected) {
        throw new Error("서버에 연결할 수 없습니다.");
      }

      console.log(`📡 Sending request to port ${currentServerPort}`);

      const response = await fetch(
        `http://127.0.0.1:${currentServerPort}/submit-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ target_url: url, format: "json" }),
        }
      );

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
      alert(`오류가 발생했습니다: ${error.message}`);
      updateServerStatus(`오류: ${error.message}`, "red");

      // 에러 정보를 textarea에도 표시
      const textBox = document.getElementById("codeArea");
      textBox.value = `오류가 발생했습니다:\n${
        error.message
      }\n\n서버 포트: ${currentServerPort}\n서버 상태: ${
        isServerReady ? "연결됨" : "연결 안됨"
      }`;
    } finally {
      showLoading(false);
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
  }
});

// 페이지 로드 시 초기화
window.addEventListener("load", () => {
  console.log("🌐 Page loaded, waiting for server...");
  updateServerStatus("서버 연결 중...", "orange");

  // 버튼 비활성화 (서버 준비될 때까지)
  const submitBtn = document.getElementById("submit-btn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "서버 대기 중...";
  }

  // 5초 후에도 서버 정보가 없으면 재시도
  setTimeout(() => {
    if (!currentServerPort) {
      updateServerStatus("서버 연결 실패 - 앱을 재시작해주세요", "red");
    }
  }, 5000);
});

// 디버깅용 정보 표시
console.log("Frontend loaded. Waiting for server port...");
