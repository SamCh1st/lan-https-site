$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDir

$pythonCommand = $null
$pythonArgs = @()
$bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$candidates = @(
    @{ Command = (Join-Path $projectDir '.venv\Scripts\python.exe'); Arguments = @() },
    @{ Command = $bundled; Arguments = @() },
    @{ Command = 'py'; Arguments = @('-3') },
    @{ Command = 'python'; Arguments = @() }
)

foreach ($candidate in $candidates) {
    try {
        # Windows may expose a fake python.exe that only opens the Microsoft Store.
        # Actually running the candidate prevents that alias from being selected.
        & $candidate.Command @($candidate.Arguments) -c 'import sys; assert sys.version_info >= (3, 9)' 2>$null
        if ($LASTEXITCODE -eq 0) {
            $pythonCommand = $candidate.Command
            $pythonArgs = $candidate.Arguments
            break
        }
    } catch {
        continue
    }
}

if (-not $pythonCommand) {
    Write-Host 'Python 3 was not found. Install Python from https://python.org and run this file again.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

try {
    & $pythonCommand @pythonArgs -c 'import cryptography' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'missing' }
} catch {
    Write-Host 'Installing the one required certificate package...' -ForegroundColor Yellow
    & $pythonCommand @pythonArgs -m pip install cryptography
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the cryptography package.' }
}

Write-Host 'Starting the LAN website...' -ForegroundColor Cyan
& $pythonCommand @pythonArgs (Join-Path $projectDir 'server.py')

if ($LASTEXITCODE -ne 0) {
    if ($LASTEXITCODE -ne 2) {
        Write-Host "`nThe server exited with an error." -ForegroundColor Red
    }
    Read-Host 'Press Enter to close'
}
