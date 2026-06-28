// 戏韵·梨园谱系 — Electron 主进程
// 职责：建无边框窗口 / 选空闲端口拉起 FastAPI sidecar / 注入 API 基址 / 生命周期清理。
const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const net = require('net')
const os = require('os')
const fs = require('fs')

const isDev = !app.isPackaged
let backend = null
let backendPort = 0
let backendPublicHost = '127.0.0.1'
let win = null
let quitting = false
let backendRestarts = 0
const MAX_RESTARTS = 2
const backendBindHost = process.env.OPERA_BIND_HOST || process.env.OPERA_HOST || '127.0.0.1'
const EMBEDDED_ENV_KEYS = new Set([
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
  'ZENMUX_API_KEY', 'ZENMUX_BASE_URL', 'ZENMUX_MODEL',
])

function isPrivateIPv4(addr) {
  return /^10\./.test(addr)
    || /^192\.168\./.test(addr)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)
}

function getPublicHost() {
  const override = (process.env.OPERA_PUBLIC_HOST || '').trim()
  if (override && override !== '0.0.0.0') return override
  if (backendBindHost && backendBindHost !== '0.0.0.0' && backendBindHost !== '::') return backendBindHost
  if (process.env.OPERA_SHARE_LAN !== '1') return '127.0.0.1'

  const candidates = []
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const info of addrs || []) {
      if (info.family === 'IPv4' && !info.internal) candidates.push(info.address)
    }
  }
  return candidates.find(isPrivateIPv4) || candidates[0] || '127.0.0.1'
}

// 选一个空闲端口
function freePort(host) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, host, () => {
      const p = srv.address().port
      srv.close(() => resolve(p))
    })
  })
}

function startBackend(port) {
  // 透传全部 process.env（含 AI 助手所需的 DEEPSEEK_API_KEY），再叠加后端专用变量。
  const env = { ...process.env, OPERA_PORT: String(port), OPERA_BIND_HOST: backendBindHost }
  if (isDev) {
    // 开发态：跑源码后端，免打包，热改后端；Windows 优先使用根目录 .venv。
    const root = path.resolve(__dirname, '..')
    const venvPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    const configuredPython = process.env.OPERA_PYTHON || ''
    if (configuredPython || fs.existsSync(venvPython) || process.platform === 'win32') {
      const python = configuredPython || (fs.existsSync(venvPython) ? venvPython : 'python')
      backend = spawn(python, ['backend/server.py'], { cwd: root, env, stdio: 'inherit' })
    } else {
      const cmd = 'source ~/anaconda3/etc/profile.d/conda.sh && conda activate llm && python backend/server.py'
      backend = spawn('bash', ['-lc', cmd], { cwd: root, env, stdio: 'inherit' })
    }
  } else {
    // 生产态：运行打包好的 sidecar，数据指向 resources/*。
    const res = process.resourcesPath
    // 打包时可把 DeepSeek/ZenMux 配置写入 resources/config/embedded.env。
    // 外部环境变量优先；未设置时用内嵌配置兜底。
    for (const [key, value] of Object.entries(loadEmbeddedEnv(res))) {
      if (!env[key]) env[key] = value
    }
    env.OPERA_DATA = path.join(res, 'data', 'processed')
    env.OPERA_PIPELINE = path.join(res, 'pipeline')
    const exe = path.join(res, 'backend',
      process.platform === 'win32' ? 'opera-backend.exe' : 'opera-backend')
    backend = spawn(exe, [], { env, stdio: backendStdio() })
  }
  backend.on('error', (e) => {
    console.error('[backend] 启动失败:', e)
    notifyRenderer('backend-error', String(e && e.message || e))
  })
  // 意外退出（非应用退出触发）时有限次自动重启；前端 /api/health 轮询会同步显示状态。
  backend.on('exit', (code, signal) => {
    if (quitting) return
    console.error(`[backend] 退出 code=${code} signal=${signal}`)
    if (backendRestarts < MAX_RESTARTS) {
      backendRestarts++
      console.log(`[backend] 第 ${backendRestarts} 次自动重启…`)
      setTimeout(() => startBackend(backendPort), 800)
    } else {
      notifyRenderer('backend-down', '后端多次异常退出，请重启应用或检查数据资源。')
    }
  })
}

function backendStdio() {
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const out = fs.openSync(path.join(dir, 'backend.out.log'), 'a')
    const err = fs.openSync(path.join(dir, 'backend.err.log'), 'a')
    return ['ignore', out, err]
  } catch {
    return 'ignore'
  }
}

function loadEmbeddedEnv(resourceRoot) {
  const file = path.join(resourceRoot, 'config', 'embedded.env')
  const out = {}
  if (!fs.existsSync(file)) return out
  try {
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const key = line.slice(0, i).trim()
      const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
      if (EMBEDDED_ENV_KEYS.has(key) && value) out[key] = value
    }
  } catch (e) {
    console.error('[backend] 读取内嵌 AI 配置失败:', e)
  }
  return out
}

function notifyRenderer(channel, message) {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, message) } catch { /* 窗口未就绪 */ }
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1180, minHeight: 740,
    backgroundColor: '#0E0B0C',
    frame: false, titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [
        `--opera-port=${backendPort}`,
        `--opera-api-base=http://${backendPublicHost}:${backendPort}`,
      ],
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(process.resourcesPath, 'renderer', 'index.html'))
  }
}

// 窗口控制（来自 preload 的 IPC）
ipcMain.handle('win:minimize', () => win && win.minimize())
ipcMain.handle('win:toggleMaximize', () => {
  if (!win) return
  win.isMaximized() ? win.unmaximize() : win.maximize()
})
ipcMain.handle('win:close', () => win && win.close())

// 单实例
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })

  app.whenReady().then(async () => {
    backendPublicHost = getPublicHost()
    backendPort = await freePort(backendBindHost)
    console.log(`[backend] bind ${backendBindHost}:${backendPort}; api http://${backendPublicHost}:${backendPort}`)
    startBackend(backendPort)
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
}

function killBackend() {
  quitting = true                       // 阻止 exit 钩子触发自动重启
  if (backend && !backend.killed) {
    try { backend.kill() } catch { /* ignore */ }
    backend = null
  }
}

app.on('window-all-closed', () => { killBackend(); if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', killBackend)
process.on('exit', killBackend)
