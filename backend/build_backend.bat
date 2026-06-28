@echo off
chcp 65001 >nul
REM ================================================================
REM  在 Windows 上把 FastAPI 后端打包为 sidecar。
REM  本文件以 UTF-8 保存，第二行 chcp 65001 让中文注释在 cmd 下正确解析。
REM  前置：一个装好运行时依赖的 Python 环境（建议 venv/conda）：
REM    pip install fastapi uvicorn pandas pyarrow numpy networkx openai httpx pyinstaller
REM  用法：双击本文件，或在已激活该环境的命令行中运行。
REM  产物：desktop\resources\backend\opera-backend.exe (+ _internal\)
REM ================================================================
setlocal
cd /d %~dp0..
echo [PyInstaller] 正在打包后端 sidecar ...
py -m PyInstaller --noconfirm --clean --distpath desktop\resources backend\opera-backend.spec
if errorlevel 1 (
  echo.
  echo [失败] 打包出错，请检查上方日志与依赖是否齐全。
  exit /b 1
)
echo.
echo [完成] sidecar 已生成于 desktop\resources\backend\
endlocal
