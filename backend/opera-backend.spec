# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 配置：把 FastAPI 后端打包成 onedir 可执行 sidecar。
# 入口 backend/server.py；运行时数据/pipeline 由 Electron 经环境变量注入（不内嵌）。
#
# 在「项目根目录」运行（见 build_backend.bat）：
#   pyinstaller --noconfirm --clean --distpath desktop/resources backend/opera-backend.spec
# 产物：desktop/resources/backend/opera-backend(.exe) + _internal/
import os
from PyInstaller.utils.hooks import collect_submodules

ROOT = os.getcwd()                            # 项目根目录（从项目根运行 pyinstaller）
BACKEND = os.path.join(ROOT, 'backend')
PIPELINE = os.path.join(ROOT, 'pipeline')

hidden = (
    collect_submodules('uvicorn')
    + collect_submodules('anyio')
    + collect_submodules('openai')             # AI 助手：DeepSeek（OpenAI 兼容）SDK
    + collect_submodules('httpx')
    + collect_submodules('httpcore')
    + ['backend.main', 'llm', 'network_lib', 'narrative_lib', 'h11', 'pyarrow',
       'pandas', 'distro', 'jiter']             # openai 运行时依赖
)

a = Analysis(
    [os.path.join(BACKEND, 'server.py')],
    pathex=[ROOT, BACKEND, PIPELINE],         # 解析 backend.main 与 network_lib/narrative_lib
    binaries=[],
    datas=[],
    hiddenimports=hidden,
    hookspath=[],
    excludes=[
        # 分析阶段才用到的重库（后端只读产物 + 经 HTTP 调 DeepSeek，运行期都不需要）
        'sklearn', 'scipy', 'jieba', 'fitz', 'matplotlib', 'tkinter', 'IPython',
        # llm 训练环境里被误收的巨型 ML 依赖（torch/CUDA/vllm 等，共约 15GB，后端完全不用）
        'torch', 'torchvision', 'torchaudio', 'triton',
        'vllm', 'flash_attn', 'flash_attn_2_cuda', 'selective_scan_cuda', 'mamba_ssm',
        'transformers', 'tokenizers', 'sentence_transformers', 'datasets', 'accelerate',
        'nvidia', 'cupy', 'numba', 'llvmlite', 'tensorflow', 'jax', 'jaxlib',
        'sympy', 'cv2', 'PIL', 'xformers',
        # mysql 连接器（未使用；其 vendored 旧版 OpenSSL 会顶替 conda 的 libcrypto，导致 _ssl 崩溃）
        'mysql', 'mysqlx', '_mysql_connector', 'mysql.connector',
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='opera-backend',
    console=False,                            # 无终端窗口
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe, a.binaries, a.datas,
    strip=False, upx=False,
    name='backend',                           # 输出目录名 -> resources/backend/
)
