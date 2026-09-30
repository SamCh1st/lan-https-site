param([string]$Python = '')
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $projectDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    $candidates = if ($Python) { @($Python) } else { @('py', 'python', (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe')) }
    $selected = $null
    foreach ($candidate in $candidates) {
        try {
            & $candidate -c 'import sys; assert sys.version_info >= (3, 11)' 2>$null
            if ($LASTEXITCODE -eq 0) { $selected = $candidate; break }
        } catch { continue }
    }
    if (-not $selected) { throw 'Install Python 3.11 or newer, or pass -Python with the path to python.exe.' }
    & $selected -m venv (Join-Path $projectDir '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
}
& $venvPython -m pip install -r (Join-Path $projectDir 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the connection and retry.' }
Write-Host 'Ready. Select .venv in VS Code (Python: Select Interpreter), then press F5.'
