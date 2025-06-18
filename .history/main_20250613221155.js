const { app, BrowserWindow } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const util = require("util");

let mainWindow;
let pythonProcess;
let cleanupInProgress = false;
let serverPort = null; // 서버 포트 저장

const isDev = !app.isPackaged;
const platform = os.platform();
const execAsync = util.promisify(exec);

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

function getScriptPath() {
  if (isDev) {
    return path.join(__dirname, "TranscriptServer", "pyserver.py");
  } else {
    return path.join(process.resourcesPath, "TranscriptServer", "pyserver.py");
  }
}

// 강력한 프로세스 정리 함수
async function forceCleanupAllPythonProcesses() {
  if (cleanupInProgress) return;
  cleanupInProgress = true;

  console.log("🧹 Starting comprehensive cleanup...");

  try {
    // 1단계: pyserver.py 프로세스들 종료
    try {
      await execAsync(`pkill -f "python.*pyserver.py"`);
      console.log("✅ Killed Python server processes");
    } catch (error) {
      console.log("ℹ️ No Python server processes found");
    }

    // 2단계: 포트 5000-5100 사용 프로세스들 종료
    try {
      const { stdout } = await execAsync(`lsof -ti:5000-5100`);
      if (stdout.trim()) {
        await execAsync(`lsof -ti:5000-5100 | xargs kill -9`);
        console.log("✅ Freed ports 5000-5100");
      }
    } catch (error) {
      console.log("ℹ️ No processes found on ports 5000-5100");
    }

    // 3단계: Flask 관련 프로세스들 정리
    try {
      await execAsync(`pkill -f "flask"`);
      console.log("✅ Killed Flask processes");
    } catch (error) {
      console.log("ℹ️ No Flask processes found");
    }

    console.log("🎉 Cleanup completed successfully");
  } catch (error) {
    console.log("⚠️ Cleanup completed with minor issues:", error.message);
  } finally {
    cleanupInProgress = false;
  }
}

// 개선된 Python 프로세스 정리 함수
async function cleanupPythonProcess() {
  if (!pythonProcess || pythonProcess.killed) {
    return;
  }

  console.log("🧹 Cleaning up Python process...");

  try {
    const pid = pythonProcess.pid;

    // 1단계: Graceful shutdown 시도
    console.log(`📤 Sending SIGTERM to process ${pid}...`);
    pythonProcess.kill("SIGTERM");

    // 2초 후 강제 종료 확인
    setTimeout(async () => {
      try {
        // 프로세스가 아직 살아있는지 확인
        process.kill(pid, 0); // 시그널 0은 프로세스 존재 확인용

        // 살아있다면 강제 종료
        console.log(`🔨 Force killing process ${pid}...`);
        pythonProcess.kill("SIGKILL");

        // 추가로 시스템 레벨에서 정리
        setTimeout(async () => {
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`💀 System-level kill executed for ${pid}`);
          } catch (error) {
            console.log(`ℹ️ Process ${pid} already terminated`);
          }
        }, 1000);
      } catch (error) {
        console.log(`✅ Process ${pid} already terminated`);
      }
    }, 2000);
  } catch (error) {
    console.error("❌ Error in cleanup:", error);
  } finally {
    pythonProcess = null;
    serverPort = null;
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

    // 타임아웃 설정
    const timeout = setTimeout(() => {
      console.log("⏰ Python server startup timeout");
      cleanupPythonProcess();
      reject(new Error("Python server startup timeout"));
    }, 15000); // 15초 타임아웃

    try {
      pythonProcess = spawn(pythonPath, [scriptPath], {
        cwd: path.dirname(scriptPath),
        env: env,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!pythonProcess || !pythonProcess.pid) {
        clearTimeout(timeout);
        throw new Error("Failed to start Python process");
      }

      console.log(`✅ Python server started with PID: ${pythonProcess.pid}`);

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString().trim();
        console.log(`[Python] ${output}`);

        // 포트 번호 추출
        const portMatch = output.match(/Starting Flask on port (\d+)/);
        if (portMatch) {
          serverPort = parseInt(portMatch[1]);
          console.log(`🔗 Server port detected: ${serverPort}`);

          // Frontend에 포트 정보 전달
          if (mainWindow && mainWindow.webContents) {
            console.log(`📡 Sending port ${serverPort} to frontend`);
            mainWindow.webContents.send("server-port", serverPort);
          }
        }

        // 서버 시작 확인
        if (output.includes("Running on http://")) {
          clearTimeout(timeout);
          resolve(pythonProcess);
        }
      });

      pythonProcess.stderr.on("data", (data) => {
        const output = data.toString().trim();
        console.error(`[Python Error] ${output}`);
      });

      pythonProcess.on("close", (code) => {
        clearTimeout(timeout);
        console.log(`Python process exited with code: ${code}`);
        pythonProcess = null;
        serverPort = null;
      });

      pythonProcess.on("error", (err) => {
        clearTimeout(timeout);
        console.error(`Python process error: ${err}`);
        cleanupPythonProcess();
        reject(err);
      });
    } catch (error) {
      clearTimeout(timeout);
      console.error(`Error starting Python server: ${error}`);
      cleanupPythonProcess();
      reject(error);
    }
  });
}

app.whenReady().then(async () => {
  try {
    console.log("🚀 Starting application...");

    // 앱 시작 전 기존 프로세스 정리
    await forceCleanupAllPythonProcesses();

    // 정리 후 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Python 서버 시작
    await startPythonServer();

    // Electron 창 생성 (preload 스크립트 포함)
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        preload: path.join(__dirname, "preload.js"), // preload 스크립트 추가
      },
      show: false,
    });

    // 창이 닫힐 때 정리
    mainWindow.on("closed", async () => {
      console.log("🪟 Main window closed");
      await cleanupPythonProcess();
      mainWindow = null;
    });

    const indexPath = isDev
      ? path.join(__dirname, "Frontend", "index.html")
      : path.join(process.resourcesPath, "Frontend", "index.html");

    await mainWindow.loadFile(indexPath);

    // 웹 컨텐츠가 로드된 후 포트 정보 전달
    mainWindow.webContents.once("dom-ready", () => {
      if (serverPort) {
        console.log(`📡 Sending port ${serverPort} to frontend (dom-ready)`);
        mainWindow.webContents.send("server-port", serverPort);
      }
    });

    mainWindow.show();

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }

    console.log("🎉 Application started successfully");
  } catch (error) {
    console.error("💥 App initialization failed:", error);
    await forceCleanupAllPythonProcesses();
    app.quit();
  }
});

app.on("window-all-closed", async () => {
  console.log("🔄 All windows closed, cleaning up...");
  await cleanupPythonProcess();
  await forceCleanupAllPythonProcesses();

  if (platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  console.log("🛑 App is quitting, cleanup initiated...");

  if (pythonProcess && !pythonProcess.killed) {
    event.preventDefault(); // 종료를 잠시 막음

    await cleanupPythonProcess();
    await forceCleanupAllPythonProcesses();

    // 정리 완료 후 실제 종료
    setTimeout(() => {
      app.quit();
    }, 2000);
  }
});

app.on("will-quit", async () => {
  console.log("🏁 Final cleanup before quit");
  await forceCleanupAllPythonProcesses();
});

// 치명적인 오류 처리
process.on("uncaughtException", async (error) => {
  console.error("💥 Uncaught Exception:", error);
  await forceCleanupAllPythonProcesses();
  app.quit();
});

process.on("unhandledRejection", async (reason, promise) => {
  console.error("🚫 Unhandled Rejection at:", promise, "reason:", reason);
  await forceCleanupAllPythonProcesses();
});

// SIGINT/SIGTERM 처리 (Ctrl+C 등)
process.on("SIGINT", async () => {
  console.log("🔴 SIGINT received, cleaning up...");
  await forceCleanupAllPythonProcesses();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🔴 SIGTERM received, cleaning up...");
  await forceCleanupAllPythonProcesses();
  process.exit(0);
});
