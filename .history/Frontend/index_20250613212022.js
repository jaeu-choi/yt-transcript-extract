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

// 기존 submit 이벤트 리스너 수정
document
  .getElementById("submit-btn")
  .addEventListener("click", async function (event) {
    event.preventDefault();

    try {
      const port = await findServerPort();
      const url = document.getElementById("url-input-form").value;

      const response = await fetch(`http://127.0.0.1:${port}/submit-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_url: url, format: "json" }),
      });

      if (!response.ok) throw new Error("HTTP 오류");

      const data = await response.json();
      const textBox = document.getElementById("codeArea");
      textBox.value = data.subTitles || "응답없음";
    } catch (error) {
      console.error("에러 발생:", error);
      alert("서버 연결에 실패했습니다.");
    }
  });
