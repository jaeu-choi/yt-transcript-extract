const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

let mainWindow;
let pythonProcess;

const isDev = !app.isPackaged;
const platform = os.platform();

function getPythonPath() {
  if (isDev) {
    // 개발 환경에서는 로컬 가상환경 사용
    return platform === "darwin"
      ? path.join(__dirname, ".venv", "bin", "python")
      : path.join(__dirname, ".venv", "Scripts", "python.exe");
  } else {
    // 빌드된 앱에서는 번들된 Python 사용
    return platform === "darwin"
      ? path.join(process.resourcesPath, "python", "bin", "python")
      : path.join(process.resourcesPath, "python", "python.exe");
  }
}

function getScriptPath() {
  if (isDev) {
    return path.join(__dirname, "TranscriptServer", "pyserver.py");
  } else {
    return path.join(process.resourcesPath, "TranscriptServer", "pyserver.py");
  }
}

function cleanupPythonProcess() {
  if (pythonProcess && !pythonProcess.killed) {
    console.log("🧹 Cleaning up Python process...");
    try {
      pythonProcess.kill("SIGTERM");
      pythonProcess = null;
      console.log("✅ Python process cleaned up");
    } catch (error) {
      console.error("❌ Error cleaning up Python process:", error);
    }
  }
}

function startPythonServer() {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const scriptPath = getScriptPath();

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

    const env = { ...process.env };
    env.PYTHONUNBUFFERED = "1";
    env.PYTHONDONTWRITEBYTECODE = "1";

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
        pythonProcess = null;
      });

      pythonProcess.on("error", (err) => {
        console.error(`Python process error: ${err}`);
        cleanupPythonProcess();
        reject(err);
      });

      // Python 서버 시작 대기
      setTimeout(() => {
        resolve(pythonProcess);
      }, 2000);
    } catch (error) {
      console.error(`Error starting Python server: ${error}`);
      cleanupPythonProcess();
      reject(error);
    }
  });
}

app.whenReady().then(async () => {
  try {
    // Python 서버를 먼저 시작
    await startPythonServer();

    // Electron 창 생성
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
      },
      show: false,
    });

    const indexPath = isDev
      ? path.join(__dirname, "Frontend", "index.html")
      : path.join(process.resourcesPath, "Frontend", "index.html");

    await mainWindow.loadFile(indexPath);
    mainWindow.show();

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  } catch (error) {
    console.error("App initialization failed:", error);
    cleanupPythonProcess();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  console.log("🔄 All windows closed, cleaning up...");
  cleanupPythonProcess();
  if (platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  console.log("🛑 App is quitting, cleanup initiated...");
  cleanupPythonProcess();
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  cleanupPythonProcess();
  app.quit();
});
