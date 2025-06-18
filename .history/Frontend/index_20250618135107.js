let currentServerPort = null;
let isServerReady = false;
let availableLanguages = [];
let currentVideoUrl = "";

// 로딩 상태 표시/숨김
function showLoading(
  show,
  message = "자막을 추출하고 있습니다. 잠시만 기다려주세요..."
) {
  const loading = document.getElementById("loading");
  const loadingMessage = document.getElementById("loading-message");
  if (show) {
    loading.style.display = "block";
    loadingMessage.textContent = message;
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
function updateButtonState(buttonId, enabled, text) {
  const btn = document.getElementById(buttonId);
  if (btn) {
    btn.disabled = !enabled;
    btn.textContent = text;
  }
}

// 언어 선택 섹션 표시/숨김
function showLanguageSelection(show) {
  const languageSection = document.getElementById("language-selection");
  if (show) {
    languageSection.style.display = "block";
  } else {
    languageSection.style.display = "none";
  }
}

// 결과 헤더 업데이트
function updateResultHeader(show, languageName = "") {
  const resultHeader = document.getElementById("result-header");
  const currentLanguage = document.getElementById("current-language");

  if (show && languageName) {
    resultHeader.style.display = "block";
    currentLanguage.textContent = `언어: ${languageName}`;
  } else {
    resultHeader.style.display = "none";
  }
}

// 언어 선택 드롭다운 업데이트
function updateLanguageSelect(languages) {
  const select = document.getElementById("language-select");
  const extractBtn = document.getElementById("extract-btn");

  // 기존 옵션 제거 (첫 번째 기본 옵션 제외)
  while (select.children.length > 1) {
    select.removeChild(select.lastChild);
  }

  // 새 언어 옵션 추가
  languages.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.display_name;
    select.appendChild(option);
  });

  // 언어 선택 변경 이벤트
  select.onchange = function () {
    extractBtn.disabled = !this.value;
  };

  availableLanguages = languages;
  showLanguageSelection(true);
}

// 서버 포트 설정 함수
function setServerPort(port) {
  currentServerPort = port;
  isServerReady = true;
  console.log(`🔗 Server port set to: ${port}`);

  updateServerStatus(`서버 연결됨 (포트: ${port})`, "green");
  updateButtonState("check-languages-btn", true, "언어 확인");
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
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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

// 사용 가능한 언어 목록 가져오기
async function getAvailableLanguages(url) {
  if (!currentServerPort || !isServerReady) {
    alert("서버가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
    return false;
  }

  showLoading(true, "사용 가능한 언어를 확인하고 있습니다...");
  updateServerStatus("언어 목록을 확인하고 있습니다...", "orange");
  updateButtonState("check-languages-btn", false, "확인 중...");

  try {
    const isConnected = await checkServerConnection();
    if (!isConnected) {
      throw new Error(
        "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
      );
    }

    console.log(`📡 Getting languages for: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      `http://127.0.0.1:${currentServerPort}/get-languages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ target_url: url }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP 오류 ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("사용 가능한 언어:", data);

    if (data.languages && data.languages.length > 0) {
      updateLanguageSelect(data.languages);
      updateServerStatus(
        "언어 목록을 가져왔습니다. 언어를 선택해주세요.",
        "green"
      );
      return true;
    } else {
      throw new Error("사용 가능한 한국어 또는 영어 자막이 없습니다.");
    }
  } catch (error) {
    console.error("언어 목록 가져오기 오류:", error);

    let errorMessage = error.message;
    if (error.name === "AbortError") {
      errorMessage = "요청 시간이 초과되었습니다. 다시 시도해주세요.";
    }

    alert(`오류가 발생했습니다: ${errorMessage}`);
    updateServerStatus(`오류: ${errorMessage}`, "red");
    return false;
  } finally {
    showLoading(false);
    updateButtonState("check-languages-btn", true, "언어 확인");
  }
}

// 선택된 언어로 자막 추출
async function extractSubtitles() {
  const languageSelect = document.getElementById("language-select");
  const selectedLanguage = languageSelect.value;

  if (!selectedLanguage) {
    alert("언어를 선택해주세요.");
    return;
  }

  if (!currentVideoUrl) {
    alert("URL을 다시 확인해주세요.");
    return;
  }

  const selectedLangInfo = availableLanguages.find(
    (lang) => lang.code === selectedLanguage
  );

  showLoading(
    true,
    `${selectedLangInfo.display_name} 자막을 추출하고 있습니다...`
  );
  updateServerStatus("자막을 추출하고 있습니다...", "orange");
  updateButtonState("extract-btn", false, "추출 중...");

  try {
    const isConnected = await checkServerConnection();
    if (!isConnected) {
      throw new Error(
        "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
      );
    }

    console.log(`📡 Extracting subtitles for language: ${selectedLanguage}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(
      `http://127.0.0.1:${currentServerPort}/submit-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          target_url: currentVideoUrl,
          format: "json",
          language_code: selectedLanguage,
        }),
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
      updateResultHeader(true, selectedLangInfo.display_name);
      updateServerStatus("자막 추출 완료!", "green");
    } else if (data.error) {
      textBox.value = `오류: ${data.error}`;
      updateResultHeader(false);
      updateServerStatus(`오류: ${data.error}`, "red");
    } else {
      textBox.value = "자막을 찾을 수 없습니다.";
      updateResultHeader(false);
      updateServerStatus("자막을 찾을 수 없습니다.", "orange");
    }
  } catch (error) {
    console.error("자막 추출 오류:", error);

    let errorMessage = error.message;
    if (error.name === "AbortError") {
      errorMessage = "요청 시간이 초과되었습니다. 다시 시도해주세요.";
    }

    alert(`오류가 발생했습니다: ${errorMessage}`);
    updateServerStatus(`오류: ${errorMessage}`, "red");
    updateResultHeader(false);

    const textBox = document.getElementById("codeArea");
    textBox.value = `오류가 발생했습니다:\n${errorMessage}\n\n언어: ${selectedLanguage}\n시간: ${new Date().toLocaleString()}`;
  } finally {
    showLoading(false);
    updateButtonState("extract-btn", true, "자막 추출");
  }
}

// 언어 확인 버튼 이벤트 리스너
document
  .getElementById("check-languages-btn")
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

    currentVideoUrl = url;
    await getAvailableLanguages(url);
  });

// 자막 추출 버튼 이벤트 리스너
document
  .getElementById("extract-btn")
  .addEventListener("click", async function (event) {
    event.preventDefault();
    await extractSubtitles();
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
  showLanguageSelection(false);
  updateResultHeader(false);
  currentVideoUrl = "";
  availableLanguages = [];

  // 언어 선택 초기화
  const languageSelect = document.getElementById("language-select");
  languageSelect.selectedIndex = 0;
  updateButtonState("extract-btn", false, "자막 추출");

  if (isServerReady) {
    updateServerStatus(`서버 연결됨 (포트: ${currentServerPort})`, "green");
  } else {
    updateServerStatus("서버 연결 중...", "orange");
    if (window.electronAPI) {
      window.electronAPI.requestServerPort();
    }
  }
});

// 페이지 로드 시 초기화
window.addEventListener("load", () => {
  console.log("🌐 Page loaded, initializing...");
  updateServerStatus("서버 연결 중...", "orange");
  updateButtonState("check-languages-btn", false, "서버 대기 중...");
  updateButtonState("extract-btn", false, "자막 추출");

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
        updateButtonState("check-languages-btn", false, "서버 연결 끊김");
        isServerReady = false;

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
      updateButtonState("check-languages-btn", false, "서버 연결 실패");
    }
  }, 20000);
});

// 디버깅용 정보 표시
console.log("Frontend loaded. Waiting for server port...");

// 전역 함수로 export (HTML에서 사용)
window.copyToClipboard = copyToClipboard;
