# Install backend dependencies into ..\.venv (run from repo: backend\install-deps.ps1)
# UTF-8 + code page 65001 reduces pip/maturin failures when the project path contains non-ASCII characters.

$ErrorActionPreference = "Stop"
$BackendDir = $PSScriptRoot
$VenvPython = Join-Path $BackendDir "..\.venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "No venv at ..\.venv. Create it first from project root:" -ForegroundColor Yellow
    Write-Host '  cd "...\499-Final-Project"' -ForegroundColor Yellow
    Write-Host "  py -m venv .venv" -ForegroundColor Yellow
    exit 1
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
try { chcp 65001 | Out-Null } catch {}
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch {}

Write-Host "Upgrading pip..."
& $VenvPython -m pip install --upgrade pip

Write-Host "Installing requirements..."
& $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")

Write-Host "Installing Playwright Chromium (for PDF generation)..."
& $VenvPython -m playwright install chromium

Write-Host "Done." -ForegroundColor Green
