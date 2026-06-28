"""桌面应用后端 sidecar 入口。

由 Electron 主进程以子进程方式拉起，通过环境变量接收监听端口与数据路径：
  OPERA_PORT     监听端口（必填；主进程挑选空闲端口后注入）
  OPERA_BIND_HOST 监听地址（默认 0.0.0.0，允许局域网访问；设 127.0.0.1 可仅限本机）
  OPERA_DATA     data/processed 路径（打包后指向 resources/data/processed）
  OPERA_PIPELINE pipeline 路径（打包后指向 resources/pipeline）

被 PyInstaller 打包为 opera-backend(.exe)；本地开发可直接：
  conda activate llm && OPERA_PORT=8000 OPERA_BIND_HOST=0.0.0.0 python backend/server.py
"""
import os
import sys

# PyInstaller 「窗口化」(console=False) 打包后 sys.stdout/stderr 为 None；
# uvicorn 等库写日志会触发 AttributeError 而令进程在启动时静默退出。
# 在任何会写流的导入之前，把 None 流兜底到 devnull（Linux 下不触发，Windows 必需）。
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")  # noqa: SIM115
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")  # noqa: SIM115

from pathlib import Path

# 让 `import backend.main` 在「源码运行」与「PyInstaller 冻结」两种情形都可用。
if getattr(sys, "frozen", False):
    BASE = Path(sys._MEIPASS)  # type: ignore[attr-defined]
else:
    BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

import uvicorn  # noqa: E402

from backend.main import app  # noqa: E402


def main() -> None:
    port = int(os.environ.get("OPERA_PORT", "8000"))
    host = os.environ.get("OPERA_BIND_HOST") or os.environ.get("OPERA_HOST") or "0.0.0.0"
    # log_config=None：不让 uvicorn 重建指向 std 流的日志处理器，窗口化打包下更稳。
    uvicorn.run(app, host=host, port=port, log_level="warning", log_config=None)


if __name__ == "__main__":
    main()
