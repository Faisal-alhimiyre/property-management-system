# Restart FastAPI (uvicorn) on port 8002
#
# Usage:
#   cd "...\499-Final-Project\backend"
#   .\restart-server.ps1
#
# If the port won’t clear, run PowerShell as Administrator, or:
#   .\restart-server.ps1 -KillAllPython
# (closes every Python process on this PC — save other work first.)

param(
    [int]$Port = 8002,
    [switch]$KillAllPython
)

$ErrorActionPreference = "Continue"
$BackendDir = $PSScriptRoot
Set-Location $BackendDir

Write-Host "Working directory: $BackendDir"

function Get-PidsListeningOnPort([int]$P) {
    $set = New-Object System.Collections.Generic.HashSet[String]
    # PowerShell (Listen state only)
    Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object {
            if ($_.OwningProcess -and $_.OwningProcess -ne 0) {
                [void]$set.Add([string]$_.OwningProcess)
            }
        }
    # netstat fallback (lines ending with LISTENING + PID)
    netstat -ano 2>$null | ForEach-Object {
        if ($_ -match ":$P\s.+\sLISTENING\s+(\d+)\s*$") {
            [void]$set.Add($matches[1])
        }
    }
    return @($set)
}

function Stop-PortPids([int]$P) {
    $pids = Get-PidsListeningOnPort -P $P
    foreach ($procId in $pids) {
        Write-Host "  taskkill /F /PID $procId"
        & taskkill.exe /F /PID $procId 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  taskkill failed for PID $procId (try Run as Administrator)" -ForegroundColor Yellow
        }
    }
}

Write-Host "Stopping listeners on port $Port..."
Stop-PortPids -P $Port
Start-Sleep -Seconds 2

$still = Get-PidsListeningOnPort -P $Port
if ($still.Count -gt 0) {
    Write-Host "Second pass (port still busy)..."
    Stop-PortPids -P $Port
    Start-Sleep -Seconds 2
    $still = Get-PidsListeningOnPort -P $Port
}

if ($still.Count -gt 0 -and $KillAllPython) {
    Write-Host "-KillAllPython: ending all python.exe (includes reloader child)..." -ForegroundColor Yellow
    & taskkill.exe /F /IM python.exe /T 2>$null
    Start-Sleep -Seconds 2
    $still = Get-PidsListeningOnPort -P $Port
}

if ($still.Count -gt 0) {
    Write-Host ""
    Write-Host "Port $Port is still in use. PIDs: $($still -join ', ')" -ForegroundColor Red
    Write-Host "Try:"
    Write-Host "  1) Right-click PowerShell -> Run as administrator, then run this script again"
    Write-Host "  2) Task Manager -> Details -> end python.exe rows tied to your project"
    Write-Host "  3) .\restart-server.ps1 -KillAllPython   # kills every Python on the machine"
    exit 1
}

$python = Join-Path $BackendDir "venv312\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = Join-Path $BackendDir "..\.venv\Scripts\python.exe"
}
if (-not (Test-Path $python)) {
    $python = "python"
}

# --reload watches the cwd; venv312 lives under backend, so site-packages churn
# (AV, indexer, pip) otherwise spams reloads and huge WatchFiles warnings.
$venvDir = Join-Path $BackendDir "venv312"
Write-Host "Starting uvicorn on http://127.0.0.1:$Port ..."
& $python -m uvicorn main:app --host 127.0.0.1 --port $Port --reload --reload-exclude $venvDir
