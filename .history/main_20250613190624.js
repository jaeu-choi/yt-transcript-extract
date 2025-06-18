const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

let mainWindow;
let pythonProcess;

const isDev = !app.isPackaged;
const platform = os.platform();

// macOS 보안 설정
if (platform === "darwin") {
  app.commandLine.appendSwitch("--disable-features", "OutOfBlinkCors");
  app.commandLine.appendSwitch("--disable-web-security");
}

// Python 프로세스 시작 전 지연 시간 추가
const PYTHON_START_DELAY = 1000; // 1초 대기

function getPythonPath() {
  if (isDev) {
    return platform === "darwin"
      ? path.join(__dirname, ".venv", "bin", "python")
      : path.join(__dirname, ".venv", "Scripts", "python.exe");
  } else {
    return platform === "darwin"
      ? path.join(process.resourcesPath, "python", "bin", "python")
      : path.join(process.resourcesPath, "python", "python.exe");
  }
}

function startPythonServer() {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const scriptPath = isDev
      ? path.join(__dirname, "TranscriptServer", "pyserver.py")
      : path.join(process.resourcesPath, "TranscriptServer", "pyserver.py");

    console.log(`🐍 Starting Python server: ${pythonPath}`);
    console.log(`📄 Script path: ${scriptPath}`);

    // 파일 존재 확인
    if (!fs.existsSync(pythonPath)) {
      const error = `Python executable not found: ${pythonPath}`;
      console.error(error);
      reject(new Error(error));
      return;
    }

    if (!fs.existsSync(scriptPath)) {
      const error = `Python script not found: ${scriptPath}`;
      console.error(error);
      reject(new Error(error));
      return;
    }

    // macOS에서 Python 실행 권한 확인
    if (platform === "darwin") {
      try {
        fs.accessSync(pythonPath, fs.constants.X_OK);
      } catch (err) {
        console.error(`Python file is not executable: ${pythonPath}`);
        reject(err);
        return;
      }
    }

    const env = { ...process.env };
    if (!isDev && platform === "darwin") {
      env.PYTHONPATH = path.join(
        process.resourcesPath,
        "python",
        "lib",
        "python3.11",
        "site-packages"
      );
    }

    try {
      pythonProcess = spawn(pythonPath, [scriptPath], {
        cwd: path.dirname(scriptPath),
        env: env,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!pythonProcess || !pythonProcess.pid) {
        throw new Error("Failed to start Python process");
      }

      console.log(`✅ Python server started with PID: ${pythonProcess.pid}`);

      pythonProcess.stdout.on("data", (data) => {
        console.log(`[Python] ${data.toString().trim()}`);
      });

      pythonProcess.stderr.on("data", (data) => {
        console.error(`[Python Error] ${data.toString().trim()}`);
      });

      pythonProcess.on("close", (code) => {
        console.log(`Python process exited with code: ${code}`);
      });

      pythonProcess.on("error", (err) => {
        console.error(`Python process error: ${err}`);
        reject(err);
      });

      // Python 서버 시작 성공
      setTimeout(() => resolve(pythonProcess), PYTHON_START_DELAY);
    } catch (error) {
      console.error(`Error starting Python server: ${error}`);
      reject(error);
    }
  });
}

app.whenReady().then(async () => {
  try {
    // Python 서버를 먼저 시작
    await startPythonServer();

    // 그 다음 Electron 창 생성
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false, // macOS에서 CORS 문제 해결
      },
      show: false, // 준비될 때까지 숨김
    });

    const indexPath = isDev
      ? path.join(__dirname, "Frontend", "index.html")
      : path.join(process.resourcesPath, "Frontend", "index.html");

    await mainWindow.loadFile(indexPath);

    // 모든 준비가 완료되면 창 표시
    mainWindow.show();
  } catch (error) {
    console.error("App initialization failed:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (pythonProcess) {
    pythonProcess.kill("SIGTERM");
  }
  app.quit();
});

app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill("SIGTERM");
  }
});
