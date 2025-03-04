function urlParser(url) {
  const regex = /[?&]v=([^"]*)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

document
  .getElementById("submit-btn")
  .addEventListener("click", function (event) {
    event.preventDefault();
    console.log("제출됨");
    const url = document.getElementById("url-input-form").value;
    const parseredUrl = urlParser(url);
    // console.log(parseredUrl);
    // console.log("[Debuggin:url send to python()]", url);
    // Flask 서버로 URL 데이터 전송
    fetch("http://127.0.0.1:5000/submit-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_url: url, format: "json" }), // JSON 형식으로 Python에 전달
    })
      .then((response) => {
        if (!response.ok) throw new Error("HTTP 오류");
        return response.json();
      })
      .then((data) => {
        console.log("서버응답", data);
        const pTag = document.createElement("p");
        pTag.textContent = data.subTitles || "응답없음";
        const textBox = document.getElementById("codeArea");
        // textBox.appendChild(pTag);
        textBox.value = data.subTitles;
      })
      .catch((error) => console.error("에러 발생:", error));
  });

function copyToClipboard() {
  const textarea = document.getElementById("codeArea");
  textarea.select();
  document.execCommand("copy"); // 클립보드에 복사
  alert("Copied!");
}
document.getElementById("clear-btn").addEventListener("click", () => {
  document.getElementById("url-input-form").value = "";
  const textBox = document.getElementById("codeArea");
  textBox.value = "";
});
