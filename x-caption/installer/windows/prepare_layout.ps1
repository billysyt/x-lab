param(
    [string]$BuildOutput,
    [string]$StagingDir
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
$repoRoot = (Resolve-Path (Join-Path $scriptRoot '..\..')).Path

if (-not $BuildOutput) {
    $BuildOutput = Join-Path -Path $repoRoot -ChildPath 'dist\XSub'
}

if (-not $StagingDir) {
    $StagingDir = Join-Path -Path $repoRoot -ChildPath 'build\windows\stage'
}

$BuildOutput = (Resolve-Path $BuildOutput).Path

if (-not (Test-Path $BuildOutput)) {
    throw "PyInstaller output not found at '$BuildOutput'. Build the app first using xsub_native.spec."
}

if (Test-Path $StagingDir) {
    Remove-Item $StagingDir -Recurse -Force
}

New-Item -ItemType Directory -Path $StagingDir | Out-Null

Copy-Item -Path $BuildOutput -Destination $StagingDir -Recurse -Force

Write-Host "Prepared staging layout under $StagingDir"
Write-Host "Contents:" -ForegroundColor Cyan
Get-ChildItem -Path $StagingDir
