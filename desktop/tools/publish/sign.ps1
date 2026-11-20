# Authenticode signing for the desktop release (tauri-release.yml). Tauri calls it for Descall.exe,
# the NSIS uninstaller and the NSIS setup (bundle.windows.signCommand); the workflow calls it for
# DescallMigrator.exe and both DescallSetup builds.
#
#   pwsh -NoProfile -File sign.ps1 <file>
#
# Needs DESCALL_SIGN_PFX (path of the .pfx the workflow decoded from the WIN_CSC_LINK secret into
# RUNNER_TEMP) and DESCALL_SIGN_PASSWORD (WIN_CSC_KEY_PASSWORD). Never called without them: the
# workflow only sets the sign command when the certificate loaded.
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = 'Stop'

if (-not $env:DESCALL_SIGN_PFX -or -not (Test-Path -LiteralPath $env:DESCALL_SIGN_PFX)) {
  throw "sign.ps1: DESCALL_SIGN_PFX is not set; the workflow should not have asked for signing"
}
$kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signtool = Get-ChildItem -Path $kits -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.DirectoryName -match '\\x64$' } |
  Sort-Object { [version]($_.Directory.Parent.Name -replace '[^0-9.]', '') } -Descending |
  Select-Object -First 1
if (-not $signtool) { throw "sign.ps1: signtool.exe not found under $kits" }

$timestamps = @('http://timestamp.digicert.com', 'http://timestamp.sectigo.com', 'http://timestamp.globalsign.com/tsa/r6advanced1')
foreach ($ts in $timestamps) {
  & $signtool.FullName sign /fd sha256 /f $env:DESCALL_SIGN_PFX /p $env:DESCALL_SIGN_PASSWORD /tr $ts /td sha256 /d Descall $File
  if ($LASTEXITCODE -eq 0) {
    & $signtool.FullName verify /pa /q $File
    # A certificate whose root this runner does not trust (a test certificate) still signs.
    if ($LASTEXITCODE -ne 0) { Write-Warning "sign.ps1: $File is signed, but its chain does not verify on this runner (untrusted root?)" }
    Write-Host "signed $(Split-Path -Leaf $File) (timestamp $ts)"
    exit 0
  }
  Write-Warning "sign.ps1: signing $File with timestamp $ts failed ($LASTEXITCODE), trying the next server"
}
throw "sign.ps1: could not sign $File"
