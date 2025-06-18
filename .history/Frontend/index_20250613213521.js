// 포트를 5000부터 5100까지 찾아서 연결
async function findServerPort() {
  for (let port = 5000; port <= 5100; port++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return port;
      }
    } catch (error) {
      // 다음 포트 시도
    }
  }
  throw new Error("Python server not found");
}

// 서버 상태 확인 및 표시
async function checkServerStatus() {
  try {
    const port = await findServerPort();
    document.getElementById(
      "server-status"
    ).textContent = `서버 연결됨 (포트: ${port})`;
    document.getElementById("server-status").style.color = "green";
    return port;
  } catch (error) {
    document.getElementById("server-status").textContent = "서버 연결 실패";
    document.getElementById("server-status").style.color = "red";
    return null;
  }
}

// 로딩 상태 표시/숨김
function showLoading(show) {
  const loading = document.getElementById("loading");
  if (show) {
    loading.style.display = "block";
  } else {
    loading.style.display = "none";
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

    showLoading(true);

    try {
      const port = await findServerPort();
      if (!port) {
        throw new Error("서버에 연결할 수 없습니다.");
      }

      const response = await fetch(`http://127.0.0.1:${port}/submit-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_url: url, format: "json" }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP 오류: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("서버응답", data);

      const textBox = document.getElementById("codeArea");
      textBox.value = data.subTitles || "자막을 찾을 수 없습니다.";

      // 성공 메시지
      document.getElementById("server-status").textContent = "자막 추출 완료!";
      document.getElementById("server-status").style.color = "green";
    } catch (error) {
      console.error("에러 발생:", error);
      alert(`오류가 발생했습니다: ${error.message}`);

      // 오류 메시지
      document.getElementById(
        "server-status"
      ).textContent = `오류: ${error.message}`;
      document.getElementById("server-status").style.color = "red";
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
  document.getElementById("server-status").textContent = "서버 연결 중...";
  document.getElementById("server-status").style.color = "orange";
});

// 페이지 로드 시 서버 상태 확인
window.addEventListener("load", () => {
  checkServerStatus();
});
