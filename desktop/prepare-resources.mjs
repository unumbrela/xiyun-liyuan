// 打包前置：把 前端构建产物 / 运行时数据 / pipeline 库 收拢到 desktop/resources/，
// 供 electron-builder 的 extraResources 打入安装包。跨平台（Windows 打包时亦可运行）。
//
// 注意：PyInstaller 产物 resources/backend/ 由 backend/build_backend.bat 单独生成，
// 本脚本不处理后端可执行文件。
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync, readdirSync, renameSync } from 'node:fs'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const RES = join(__dirname, 'resources')
// 先收拢到临时暂存目录，全部成功并校验后再原子替换 resources/，避免中途失败留下残缺包。
const STAGE = join(__dirname, 'resources.staging')

// 运行时不需要的大文件（仅 pipeline 训练阶段用）
const DATA_SKIP = new Set(['plays.sqlite', 'instances.parquet'])
// 后端 import 的共用库
const PIPELINE_LIBS = ['network_lib.py', 'narrative_lib.py']
// 后端启动必需的产物（缺失则中止打包，避免发布出无法运行的安装包）
const REQUIRED_DATA = [
  'corpus.jsonl', 'predictions.parquet', 'quality_report.json',
  'task1_metrics.json', 'task1_patterns.json', 'task1_temporal.json',
  'task1_subroles.json', 'task2_metrics.parquet', 'task2_typestats.json',
  'task3_topics.json', 'task3_patterns.json', 'task3_play_topics.parquet',
  'task4_metrics.parquet', 'task4_patterns.json',
  'task5_plays.parquet', 'task5_corr.json', 'task5_sankey.json', 'task5_archetypes.json',
]
const EMBEDDED_ENV_KEYS = [
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
  'ZENMUX_API_KEY', 'ZENMUX_BASE_URL', 'ZENMUX_MODEL',
]

const ensure = (d) => mkdirSync(d, { recursive: true })

function copyRenderer() {
  const dist = join(ROOT, 'frontend', 'dist')
  if (!existsSync(dist)) throw new Error('缺少 frontend/dist，请先 npm run build:web')
  cpSync(dist, join(STAGE, 'renderer'), { recursive: true })
  console.log('✓ renderer  <-', dist)
}

function copyData() {
  const src = join(ROOT, 'data', 'processed')
  const dst = join(STAGE, 'data', 'processed')
  ensure(dst)
  let n = 0
  for (const f of readdirSync(src)) {
    if (DATA_SKIP.has(f)) continue
    copyFileSync(join(src, f), join(dst, f))
    n++
  }
  const missing = REQUIRED_DATA.filter((f) => !existsSync(join(dst, f)))
  if (missing.length) {
    throw new Error('缺少必需产物，请先运行 pipeline：' + missing.join('、'))
  }
  console.log(`✓ data       <- ${src} (${n} 个文件，已跳过 ${[...DATA_SKIP].join('/')})`)
}

function copyPipeline() {
  const src = join(ROOT, 'pipeline')
  const dst = join(STAGE, 'pipeline')
  ensure(dst)
  for (const f of PIPELINE_LIBS) {
    if (!existsSync(join(src, f))) throw new Error('缺少 pipeline 库：' + f)
    copyFileSync(join(src, f), join(dst, f))
  }
  console.log('✓ pipeline   <-', PIPELINE_LIBS.join(', '))
}

function readEnvValues(file) {
  const values = {}
  if (!existsSync(file)) return values
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const key = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
    if (EMBEDDED_ENV_KEYS.includes(key) && value) values[key] = value
  }
  return values
}

function copyEmbeddedEnv() {
  const values = {}
  const sources = [
    join(ROOT, 'backend', '.env'),
    join(__dirname, 'embedded.env'),
  ]
  const override = process.env.OPERA_EMBED_ENV
  if (override) sources.push(resolve(ROOT, override))

  for (const src of sources) Object.assign(values, readEnvValues(src))
  for (const key of EMBEDDED_ENV_KEYS) {
    if (process.env[key]) values[key] = process.env[key]
  }

  const keys = EMBEDDED_ENV_KEYS.filter((key) => values[key])
  if (!keys.length) {
    console.log('• embedded   <- 跳过（未找到 DeepSeek/ZenMux 配置）')
    return
  }

  const dst = join(STAGE, 'config', 'embedded.env')
  ensure(dirname(dst))
  writeFileSync(dst, keys.map((key) => `${key}=${values[key]}`).join('\n') + '\n', 'utf8')
  console.log(`✓ embedded   <- AI 配置已内嵌 (${keys.join(', ')})`)
}

try {
  rmSync(STAGE, { recursive: true, force: true })
  ensure(STAGE)
  copyRenderer()
  copyData()
  copyPipeline()
  copyEmbeddedEnv()
  // 保留已由 build_backend.bat 生成的 resources/backend/（本脚本不处理后端可执行文件）。
  const prevBackend = join(RES, 'backend')
  if (existsSync(prevBackend)) cpSync(prevBackend, join(STAGE, 'backend'), { recursive: true })
  // 原子替换：旧 resources 让位，暂存目录顶替。
  rmSync(RES, { recursive: true, force: true })
  renameSync(STAGE, RES)
  console.log('\n资源已就绪（原子替换）：desktop/resources/{renderer,data,pipeline}。')
  console.log('提醒：确认 desktop/resources/backend/ 已由 build_backend.bat 生成后再执行 electron-builder。')
} catch (e) {
  rmSync(STAGE, { recursive: true, force: true })
  console.error('\n✗ 资源收拢失败，已回滚暂存目录：', e.message)
  process.exit(1)
}
