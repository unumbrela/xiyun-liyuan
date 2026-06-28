// 预加载脚本：向渲染进程安全注入后端基址与窗口控制。
const { contextBridge, ipcRenderer } = require('electron')

const apiBaseArg = process.argv.find((a) => a.startsWith('--opera-api-base='))
const portArg = process.argv.find((a) => a.startsWith('--opera-port='))
const port = portArg ? portArg.split('=')[1] : ''
const base = apiBaseArg ? apiBaseArg.slice('--opera-api-base='.length) : (port ? `http://127.0.0.1:${port}` : '')

// 前端 api.js / App.jsx 读取 window.OPERA_API_BASE
contextBridge.exposeInMainWorld('OPERA_API_BASE', base)

// 自定义标题栏窗口控制 + 后端健康事件订阅
contextBridge.exposeInMainWorld('opera', {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  close: () => ipcRenderer.invoke('win:close'),
  // 主进程在后端异常退出/重启耗尽时推送；回调收到 (channel, message)。
  onBackendStatus: (cb) => {
    ipcRenderer.on('backend-error', (_e, m) => cb('backend-error', m))
    ipcRenderer.on('backend-down', (_e, m) => cb('backend-down', m))
  },
})
