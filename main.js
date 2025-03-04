const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let mainWindow;
let pythonProcess;

const isDev = !app.isPackaged; // 개발 모드 감지

// const scriptPath = isDev
//   ? path.join(__dirname, "pyserver.py")
//   : path.join(process.resourcesPath, "pyserver.py");

// const pythonPath = isDev
//   ? path.join(__dirname, ".venv", "Scripts", "python.exe") // 개발 환경
//   : path.join(process.resourcesPath, ".venv", "Scripts", "python.exe"); // 빌드 후 환경
// 로그 파일 경로 (예: 사용자 데이터 폴더 내에 app.log 파일 생성)

const scriptPath = isDev
  ? path.join(__dirname, "TranscriptServer/pyserver.py")
  : path.join(process.resourcesPath, "TransscriptServer/pyserver.py");

const pythonPath = isDev
  ? path.join(__dirname, ".venv", "Scripts", "python.exe") // 개발 환경
  : path.join(process.resourcesPath, ".venv", "Scripts", "python.exe"); // 빌드 후 환경

console.log(`📌 [DEBUG] Python Path: ${pythonPath}`);
console.log(`📌 [DEBUG] Script Path: ${scriptPath}`);

const logFilePath = path.join(app.getPath("userData"), "python-log.txt");

app.whenReady().then(() => {
  // 🔥 Python 서버 실행
  const pythonEnv = { ...process.env };
  if (!isDev) {
    // 가상 환경의 site-packages 경로를 PYTHONPATH에 추가
    const sitePkgPath = path.join(
      process.resourcesPath,
      ".venv",
      "Lib",
      "site-packages"
    );
    pythonEnv.PYTHONPATH = sitePkgPath;

    // 로그 추가
    fs.appendFileSync(
      buildLogFilePath,
      `📌 [DEBUG] PYTHONPATH: ${pythonEnv.PYTHONPATH}\n`,
      "utf-8"
    );
  }

  pythonProcess = spawn(pythonPath, [scriptPath], {
    cwd: path.dirname(scriptPath), // Python 스크립트가 있는 디렉토리에서 실행
    env: pythonEnv, // 수정된 환경 변수 적용
  });

  pythonProcess.stdout.on("data", (data) => {
    console.log(`[Log()] Python Output: ${data}`);
    fs.appendFileSync(logFilePath, `Python Output: ${data}\n`);
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error(`[Log()] Python Error: ${data}`);
    fs.appendFileSync(logFilePath, `Python Error: ${data}\n`);
  });

  pythonProcess.on("close", (code) => {
    console.log(`[Log()] Python process exited with code ${code}`);
    fs.appendFileSync(logFilePath, `Python process exited with code ${code}\n`);
  });
  pythonProcess.on("error", (err) => {
    console.error(`[Log()] Python Spawn Error: ${err}`);
    fs.appendFileSync(logFilePath, `Python Spawn Error: ${err}\n`);
  });

  // Electron 창 생성
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, "assets/icon.ico"),
    webPreferences: {
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile("Frontend/index.html");

  app.on("window-all-closed", () => {
    if (pythonProcess) {
      pythonProcess.kill(); // 🔥 Electron 종료 시 Python 프로세스도 종료
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
});
