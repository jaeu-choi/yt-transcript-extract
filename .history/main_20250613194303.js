const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

let mainWindow;
let pythonProcess;

const isDev = !app.isPackaged;
const platform = os.platform();

// 메모리 사용량 모니터링
const MAX_MEMORY_USAGE = 500 * 1024 * 1024; // 500MB 제한

// macOS 보안 설정
if (platform === "darwin") {
  app.commandLine.appendSwitch("--disable-features", "OutOfBlinkCors");
  app.commandLine.appendSwitch("--disable-web-security");
  // Apple Silicon 최적화
  app.commandLine.appendSwitch("--enable-features", "VaapiVideoDecoder");
}

// Python 프로세스 시작 전 지연 시간
const PYTHON_START_DELAY = 1000;
const PYTHON_TIMEOUT = 30000; // 30초 타임아웃

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

function cleanupPythonProcess() {
  if (pythonProcess && !pythonProcess.killed) {
    console.log("🧹 Cleaning up Python process...");

    try {
      // 모든 stdout/stderr 리스너 제거
      pythonProcess.stdout?.removeAllListeners();
      pythonProcess.stderr?.removeAllListeners();
      pythonProcess.removeAllListeners();

      // 프로세스 강제 종료
      if (platform === "win32") {
        spawn("taskkill", ["/pid", pythonProcess.pid, "/f", "/t"]);
      } else {
        pythonProcess.kill("SIGKILL");
      }

      pythonProcess = null;
      console.log("✅ Python process cleaned up");
    } catch (error) {
      console.error("❌ Error cleaning up Python process:", error);
    }
  }
}

function monitorMemoryUsage() {
  const memUsage = process.memoryUsage();
  const totalMemory = memUsage.rss + memUsage.heapUsed + memUsage.external;

  if (totalMemory > MAX_MEMORY_USAGE) {
    console.warn(
      `⚠️ High memory usage detected: ${Math.round(
        totalMemory / 1024 / 1024
      )}MB`
    );

    // 가비지 컬렉션 강제 실행
    if (global.gc) {
      global.gc();
      console.log("🗑️ Forced garbage collection");
    }
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

    // Python 환경 최적화
    env.PYTHONUNBUFFERED = "1"; // 버퍼링 비활성화
    env.PYTHONDONTWRITEBYTECODE = "1"; // .pyc 파일 생성 방지

    if (!isDev && platform === "darwin") {
      env.PYTHONPATH = path.join(
        process.resourcesPath,
        "python",
        "lib",
        "python3.11",
        "site-packages"
      );
    }

    // 타임아웃 설정
    const timeout = setTimeout(() => {
      cleanupPythonProcess();
      reject(new Error("Python server startup timeout"));
    }, PYTHON_TIMEOUT);

    try {
      pythonProcess = spawn(pythonPath, [scriptPath], {
        cwd: path.dirname(scriptPath),
        env: env,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        // Windows에서 프로세스 그룹 생성 방지
        shell: false,
      });

      if (!pythonProcess || !pythonProcess.pid) {
        clearTimeout(timeout);
        throw new Error("Failed to start Python process");
      }

      console.log(`✅ Python server started with PID: ${pythonProcess.pid}`);

      // stdout 데이터 처리 (메모리 누수 방지)
      let stdoutBuffer = "";
      pythonProcess.stdout.on("data", (data) => {
        const chunk = data.toString().trim();
        stdoutBuffer += chunk;

        // 버퍼 크기 제한 (10KB)
        if (stdoutBuffer.length > 10240) {
          stdoutBuffer = stdoutBuffer.slice(-5120); // 뒤쪽 5KB만 유지
        }

        console.log(`[Python] ${chunk}`);
      });

      // stderr 데이터 처리 (메모리 누수 방지)
      let stderrBuffer = "";
      pythonProcess.stderr.on("data", (data) => {
        const chunk = data.toString().trim();
        stderrBuffer += chunk;

        // 버퍼 크기 제한 (10KB)
        if (stderrBuffer.length > 10240) {
          stderrBuffer = stderrBuffer.slice(-5120); // 뒤쪽 5KB만 유지
        }

        console.error(`[Python Error] ${chunk}`);
      });

      pythonProcess.on("close", (code) => {
        clearTimeout(timeout);
        console.log(`Python process exited with code: ${code}`);
        pythonProcess = null;

        // 버퍼 정리
        stdoutBuffer = "";
        stderrBuffer = "";
      });

      pythonProcess.on("error", (err) => {
        clearTimeout(timeout);
        console.error(`Python process error: ${err}`);
        cleanupPythonProcess();
        reject(err);
      });

      // Python 서버 시작 성공
      setTimeout(() => {
        clearTimeout(timeout);
        resolve(pythonProcess);
      }, PYTHON_START_DELAY);
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
    // 메모리 모니터링 시작
    const memoryMonitor = setInterval(monitorMemoryUsage, 10000); // 10초마다

    // Python 서버를 먼저 시작
    await startPythonServer();

    // 그 다음 Electron 창 생성
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false,
        // 메모리 최적화
        backgroundThrottling: false,
        offscreen: false,
      },
      show: false, // 준비될 때까지 숨김
    });

    // 메모리 누수 방지를 위한 이벤트 정리
    mainWindow.on("closed", () => {
      clearInterval(memoryMonitor);
      cleanupPythonProcess();
      mainWindow = null;
    });

    const indexPath = isDev
      ? path.join(__dirname, "Frontend", "index.html")
      : path.join(process.resourcesPath, "Frontend", "index.html");

    await mainWindow.loadFile(indexPath);

    // 모든 준비가 완료되면 창 표시
    mainWindow.show();

    // 개발 환경에서만 DevTools 자동 열기
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

  // macOS에서는 앱이 완전히 종료되지 않을 수 있음
  if (platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  console.log("🛑 App is quitting, cleanup initiated...");

  if (pythonProcess && !pythonProcess.killed) {
    event.preventDefault(); // 종료를 잠시 막음

    cleanupPythonProcess();

    // 정리 후 1초 뒤에 실제 종료
    setTimeout(() => {
      app.quit();
    }, 1000);
  }
});

app.on("will-quit", () => {
  console.log("🏁 Final cleanup before quit");
  cleanupPythonProcess();
});

// 치명적인 오류 처리
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  cleanupPythonProcess();
  app.quit();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🚫 Unhandled Rejection at:", promise, "reason:", reason);
  cleanupPythonProcess();
});

// 메모리 사용량 한계 도달 시 처리
process.on("warning", (warning) => {
  if (warning.name === "MaxListenersExceededWarning") {
    console.warn("⚠️ Too many listeners, cleaning up...");
    cleanupPythonProcess();
  }
});
