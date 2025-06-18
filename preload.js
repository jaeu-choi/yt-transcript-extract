const { contextBridge, ipcRenderer } = require("electron");

// Frontend에서 사용할 API 노출
contextBridge.exposeInMainWorld("electronAPI", {
  // 서버 포트 정보 수신
  onServerPort: (callback) => {
    ipcRenderer.on("server-port", (event, port) => {
      console.log(`[Preload] Received server port: ${port}`);
      callback(port);
    });
  },

  // 이벤트 리스너 정리
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // 서버 상태 확인 요청
  requestServerPort: () => {
    ipcRenderer.send("request-server-port");
  },
});

console.log("[Preload] ElectronAPI exposed to renderer process");
