$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
  # Older consoles may not expose OutputEncoding; continuing is harmless.
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Get-CommandPath {
  param([string[]]$Names)
  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return $null
}

function Invoke-Checked {
  param([string]$File, [string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $File $($Arguments -join ' ')"
  }
}

function Test-PortBusy {
  param([int]$Port)
  try {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

$requiredData = @(
  "corpus.jsonl", "predictions.parquet", "quality_report.json",
  "task1_metrics.json", "task1_patterns.json", "task1_temporal.json",
  "task1_subroles.json", "task2_metrics.parquet", "task2_typestats.json",
  "task3_topics.json", "task3_patterns.json", "task3_play_topics.parquet",
  "task4_metrics.parquet", "task4_patterns.json",
  "task5_plays.parquet", "task5_corr.json", "task5_sankey.json", "task5_archetypes.json"
)

$missingData = @()
foreach ($file in $requiredData) {
  if (-not (Test-Path (Join-Path $Root "data\processed\$file"))) {
    $missingData += $file
  }
}
if ($missingData.Count -gt 0) {
  throw "data\processed is incomplete. Missing: $($missingData -join ', '). Run the pipeline first or copy the processed data directory."
}

if (Test-PortBusy 8000) { throw "Port 8000 is already in use. Stop the old backend process first." }
if (Test-PortBusy 5173) { throw "Port 5173 is already in use. Stop the old Vite process first." }

$venvPython = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  Write-Step "Creating Python virtual environment"
  $py = Get-CommandPath @("py.exe", "python.exe", "python")
  if (-not $py) {
    throw "Python was not found. Install Python 3.11+ and select 'Add python.exe to PATH'."
  }

  $leaf = Split-Path -Leaf $py
  if ($leaf -ieq "py.exe") {
    & $py -3.11 -m venv .venv
    if ($LASTEXITCODE -ne 0) {
      & $py -3 -m venv .venv
    }
  } else {
    & $py -m venv .venv
  }

  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $venvPython)) {
    throw "Failed to create .venv. Install Python 3.11+ and retry."
  }
}

$python = $venvPython

Write-Step "Checking Python dependencies"
& $python -c "import fastapi, uvicorn, pandas, pyarrow, numpy, networkx, openai" 2>$null
if ($LASTEXITCODE -ne 0) {
  Invoke-Checked $python @("-m", "pip", "install", "-r", "requirements.txt")
}

$npm = Get-CommandPath @("npm.cmd", "npm")
if (-not $npm) {
  throw "npm was not found. Install Node.js 20+ or 22+ from https://nodejs.org/."
}

if (-not (Test-Path (Join-Path $Root "frontend\node_modules"))) {
  Write-Step "Installing frontend dependencies"
  Invoke-Checked $npm @("--prefix", "frontend", "install")
}

$backendOut = Join-Path $Root "backend-dev.out.log"
$backendErr = Join-Path $Root "backend-dev.err.log"
Remove-Item $backendOut, $backendErr -ErrorAction SilentlyContinue

Write-Step "Starting backend http://127.0.0.1:8000"
$backend = Start-Process -FilePath $python `
  -ArgumentList @("-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000") `
  -WorkingDirectory $Root `
  -RedirectStandardOutput $backendOut `
  -RedirectStandardError $backendErr `
  -PassThru

try {
  $healthy = $false
  for ($i = 0; $i -lt 30; $i++) {
    if ($backend.HasExited) {
      throw "Backend exited during startup. See backend-dev.err.log for details."
    }
    try {
      Invoke-RestMethod "http://127.0.0.1:8000/api/health" -TimeoutSec 1 | Out-Null
      $healthy = $true
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $healthy) {
    Write-Host "Backend is still starting; frontend will keep retrying API requests." -ForegroundColor Yellow
  }

  Write-Step "Starting frontend http://localhost:5173"
  Write-Host "Press Ctrl+C to stop the frontend. This script will also stop the backend it started."
  Invoke-Checked $npm @("--prefix", "frontend", "run", "dev")
} finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
  }
}
