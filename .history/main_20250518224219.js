const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let mainWindow;
let pythonProcess;

const isDev = !app.isPackaged;

// 파일경로 여기로
const logFilePath = path.join(app.getPath("userData"), "python-log2.txt");

// const pythonPath = isDev ?
//     path.join(__dirname, '.venv', 'Scripts', 'python.exe') :
//     path.join(process.resourcesPath, '.venv', 'Scripts', 'python.exe');
const pythonPath = isDev
  ? path.join(__dirname, ".venv", "bin", "python")
  : path.join(process.resourcesPath, ".venv", "Scripts", "python.exe");
const scriptPath = isDev
  ? path.join(__dirname, "TranscriptServer", "pyserver.py")
  : path.join(process.resourcesPath, "TranscriptServer", "pyserver.py");
app.whenReady().then(() => {
  // 🔥 Python 환경 변수 설정
  const pythonEnv = { ...process.env };
  if (!isDev) {
    const sitePkgPath = path.join(process.resourcesPath, "python-packages");
    pythonEnv.PYTHONPATH = sitePkgPath;

    // 로그 기록
    fs.appendFileSync(
      logFilePath,
      `📌 [DEBUG] PYTHONPATH: ${pythonEnv.PYTHONPATH}\n`,
      "utf-8"
    );
  }

  // Python 실행 전 경로 확인
  console.log(`📌 [DEBUG] Python Path: ${pythonPath}`);
  if (!fs.existsSync(pythonPath)) {
    console.error("🚨 Python 실행 파일이 존재하지 않습니다:", pythonPath);
  }
  console.log(`📌 [DEBUG] Script Path: ${scriptPath}`);

  // 🔥 Python 서버 실행 (null 체크 추가)
  try {
    pythonProcess = spawn(pythonPath, [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: pythonEnv,
      detached: true,
      windowsHide: true, // 추가: 콘솔 창 숨김
      stdio: ["ignore", "pipe", "pipe"], // stdout, stderr 활성화
    });

    if (!pythonProcess) {
      throw new Error("🚨 [ERROR] Python 프로세스를 시작할 수 없습니다.");
    }

    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      console.log(`[Log()] Python Output: ${output}`);
      fs.appendFileSync(logFilePath, `Python Output: ${output}\n`);
    });

    pythonProcess.stderr.on("data", (data) => {
      const error = data.toString().trim();
      console.error(`[Log()] Python Error: ${error}`);
      fs.appendFileSync(logFilePath, `Python Error: ${error}\n`);
    });

    pythonProcess.on("close", (code) => {
      console.log(`[Log()] Python process exited with code ${code}`);
      fs.appendFileSync(
        logFilePath,
        `Python process exited with code ${code}\n`
      );
    });

    pythonProcess.on("error", (err) => {
      console.error(`[Log()] Python Spawn Error: ${err}`);
      fs.appendFileSync(logFilePath, `Python Spawn Error: ${err}\n`);
    });

    pythonProcess.unref(); // 프로세스 분리
  } catch (error) {
    console.error("🚨 Python 실행 중 오류 발생:", error);
    fs.appendFileSync(logFilePath, `🚨 Python 실행 중 오류 발생: ${error}\n`);
  }

  // Electron 창 생성
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
  });

  // ✅ 빌드 후 HTML 파일 로드 경로 설정
  // const indexPath = isDev
  //   ? path.join(__dirname, "Frontend", "index.html")
  //   : path.join(process.resourcesPath, "Frontend", "index.html");
  const indexPath = path.join(__dirname, "Frontend", "index.html");

  mainWindow.loadFile(indexPath);

  app.on("window-all-closed", () => {
    if (pythonProcess) {
      pythonProcess.kill(); // 🔥 Electron 종료 시 Python 프로세스도 종료
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
});
