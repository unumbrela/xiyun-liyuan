# 戏韵·梨园谱系 — 桌面应用（Electron）

把已完成的京剧可视分析系统封装为**独立桌面软件**：自带窗口/图标/启动页，
后端 FastAPI 作为 sidecar 随应用自动起停，无需浏览器、无需手动开端口。
视觉为「舞台暗场风」（深漆黑底 + 暖金聚光 + 五行当脸谱色）。

```
desktop/
  main.js              主进程：无边框窗口 / 选空闲端口拉起后端 / 生命周期清理
  preload.js           注入后端基址(window.OPERA_API_BASE) + 窗口控制(window.opera)
  prepare-resources.mjs 打包前置：收拢 前端dist / 运行时数据 / pipeline 库 到 resources/
  build/icon.ico       应用图标（脸谱印章·韵）
  package.json         electron + electron-builder（win: nsis 安装版 + portable 绿色版）
```

## 一、开发运行

### Windows 原生

先在项目根目录运行一次 `run_windows.bat`，它会创建 `.venv` 并安装后端/前端依赖。
随后可启动 Electron 开发窗口：

```bat
cd desktop
npm install
npm run dev
```

如需指定 Python，可在启动前设置：

```bat
set OPERA_PYTHON=C:\path\to\python.exe
npm run dev
```

### WSL / Linux（GUI 走 WSLg）

需要 conda `llm` 环境已就绪、`data/processed/` 已由 pipeline 跑出。

```bash
cd desktop
npm install
npm run dev        # 同时起 Vite(5173) + 自动用 conda llm 拉起后端 + Electron 窗口
```

> 提示：`npm run dev` 内部 `wait-on:5173` 后再启动 Electron；Vite 用 `strictPort`，
> 若 5173 被占会直接报错（先清理旧的 `./run.sh` 进程）。WSLg 下可能出现
> `Exiting GPU process` 等告警，为软件渲染回退，不影响使用。

## 二、打包 Windows 安装包（在 **Windows** 上执行）

PyInstaller 产物是平台原生的——必须在 Windows 上构建才能得到 Windows sidecar。
建议把仓库复制到 Windows 本地盘后操作（避免 `\\wsl$` 跨盘 IO 慢）。

**前置**：Windows 上装好 Node.js 与一个含后端运行时依赖的 Python（已在 Node 22 + Python 3.13 实测通过）：

```bat
pip install fastapi uvicorn pandas pyarrow numpy networkx openai httpx pyinstaller
```

如需让发出去的 exe 自带 DeepSeek Key，把配置写在项目根目录 `backend\.env`
或 `desktop\embedded.env` 中。`prepare-resources.mjs` 会只抽取
`DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` 等允许项，
写入 `desktop\resources\config\embedded.env`，最终随 Windows 包内嵌。

> ⚠️ **公开发布注意**：内嵌的 Key 会随 exe 一起被任何人解包取出。若要把 exe 公开发到
> GitHub Releases，请**专门申请一把独立的 Key、在 DeepSeek 后台设好额度上限**再内嵌，
> 切勿使用个人主力 Key；不想暴露 Key 时，把内嵌项留空、让用户在应用设置里自填即可。

**步骤**：

```bat
REM 1) 打包后端 sidecar -> desktop\resources\backend\opera-backend.exe
cd backend
build_backend.bat

REM 2) 构建前端 + 收拢资源 + 出 Windows 安装包/绿色版
cd ..\desktop
npm install
npm run dist:win
```

产物在 `desktop\release\`：
- `戏韵梨园谱系-1.0.1-x64-安装版.exe`（NSIS 安装版，可选安装目录）
- `戏韵梨园谱系-1.0.1-x64-绿色版.exe`（portable 绿色版，双击即用，**推荐发给他人演示**）

> 给别人演示：直接发**绿色版.exe**，对方双击即用（首启会有 Windows SmartScreen
> “未知发布者”提示，点「更多信息 → 仍要运行」即可，因未做代码签名属正常）。
> 应用自带后端与全部数据，**无需对方装 Python/Node**，离线可用；AI 助手需联网+DeepSeek Key（可选）。
> 运行时后端默认只监听 `127.0.0.1`，前端也访问本机回环地址，因此普通演示不依赖局域网入站权限。
> 如果确实要让局域网其他设备访问，可设置 `OPERA_BIND_HOST=0.0.0.0`、`OPERA_SHARE_LAN=1`；
> 多网卡机器可再用 `OPERA_PUBLIC_HOST=192.168.x.x` 指定前端访问地址。

### 在 WSL 上一键驱动 Windows 构建（本仓库实测路径）

若开发在 WSL、但目标是 Windows 包：可借 WSL interop 直接调用 **Windows 侧** 的
`python`/`node` 完成原生构建（PyInstaller 不能交叉编译，必须用 Windows Python）：
把仓库所需文件（backend 源码、pipeline/*.py、已 `npm run build` 的 frontend/dist、
data/processed、desktop 壳）拷到 Windows 本地盘（如 `C:\Users\<you>\opera-build`），
在该目录用 Windows Python 跑 `py -m PyInstaller ... backend\opera-backend.spec`、
再 `npm install` 与 `node prepare-resources.mjs && npx electron-builder --win --x64`。
注意 `frontend/dist` 是平台无关静态文件可直接复用，无需在 Windows 重装前端依赖。

## 运行时数据

sidecar 通过环境变量（由 `main.js` 注入）定位数据，**不内嵌**到 exe：
`OPERA_PORT` 监听端口、`OPERA_BIND_HOST` 监听地址（默认 `0.0.0.0`）、
`OPERA_PUBLIC_HOST` 前端访问地址覆盖、`OPERA_DATA` → `resources/data/processed`、
`OPERA_PIPELINE` → `resources/pipeline`。随包数据约 55MB
（仅 `corpus.jsonl` + 各任务产物；已剔除训练用的 `plays.sqlite`/`instances.parquet`）。
