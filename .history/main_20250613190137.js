const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

let mainWindow;
let pythonProcess;

const isDev = !app.isPackaged;

// 파일경로 여기로
const logFilePath = path.join(app.getPath("userData"), "python-log2.txt");

// 운영체제별 Python 실행 파일 경로 설정
function getPythonPath() {
  const platform = os.platform();
  const isWindows = platform === "win32";

  if (isDev) {
    // 개발 환경
    if (isWindows) {
      return path.join(__dirname, ".venv", "Scripts", "python.exe");
    } else {
      return path.join(__dirname, ".venv", "bin", "python");
    }
  } else {
    // 빌드된 환경
    if (isWindows) {
      return path.join(process.resourcesPath, "python", "python.exe");
    } else {
      return path.join(process.resourcesPath, "python", "bin", "python");
    }
  }
}

function getScriptPath() {
  if (isDev) {
    return path.join(__dirname, "TranscriptServer", "pyserver.py");
  } else {
    return path.join(process.resourcesPath, "TranscriptServer", "pyserver.py");
  }
}

function getPythonEnv() {
  const pythonEnv = { ...process.env };

  if (!isDev) {
    const platform = os.platform();
    let sitePkgPath;

    if (platform === "win32") {
      sitePkgPath = path.join(
        process.resourcesPath,
        "python",
        "Lib",
        "site-packages"
      );
    } else {
      sitePkgPath = path.join(
        process.resourcesPath,
        "python",
        "lib",
        "python3.11",
        "site-packages"
      );
    }

    pythonEnv.PYTHONPATH = sitePkgPath;

    // 로그 기록
    fs.appendFileSync(
      logFilePath,
      `📌 [DEBUG] PYTHONPATH: ${pythonEnv.PYTHONPATH}\n`,
      "utf-8"
    );
  }

  return pythonEnv;
}

app.whenReady().then(() => {
  const pythonPath = getPythonPath();
  const scriptPath = getScriptPath();
  const pythonEnv = getPythonEnv();

  // Python 실행 전 경로 확인
  console.log(`📌 [DEBUG] Python Path: ${pythonPath}`);
  console.log(`📌 [DEBUG] Script Path: ${scriptPath}`);

  if (!fs.existsSync(pythonPath)) {
    console.error("🚨 Python 실행 파일이 존재하지 않습니다:", pythonPath);
    fs.appendFileSync(
      logFilePath,
      `🚨 Python 실행 파일이 존재하지 않습니다: ${pythonPath}\n`
    );
  }

  if (!fs.existsSync(scriptPath)) {
    console.error("🚨 Python 스크립트 파일이 존재하지 않습니다:", scriptPath);
    fs.appendFileSync(
      logFilePath,
      `🚨 Python 스크립트 파일이 존재하지 않습니다: ${scriptPath}\n`
    );
  }

  // 🔥 Python 서버 실행 (null 체크 추가)
  try {
    pythonProcess = spawn(pythonPath, [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: pythonEnv,
      detached: false, // Windows에서 문제가 될 수 있음
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

    // pythonProcess.unref(); // 이 줄을 제거하거나 조건부로 사용
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
      contextIsolation: false, // 보안상 권장되지 않지만 기존 코드 호환성을 위해
    },
  });

  // HTML 파일 로드 경로 설정
  const indexPath = isDev
    ? path.join(__dirname, "Frontend", "index.html")
    : path.join(process.resourcesPath, "Frontend", "index.html");

  mainWindow.loadFile(indexPath);

  app.on("window-all-closed", () => {
    if (pythonProcess) {
      pythonProcess.kill("SIGTERM"); // 더 정확한 종료 신호
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // 앱이 종료될 때 Python 프로세스도 확실히 종료
  app.on("before-quit", () => {
    if (pythonProcess) {
      pythonProcess.kill("SIGTERM");
    }
  });
});
