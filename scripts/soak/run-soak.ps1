# Phase 1 soak test against a real PLC. Run from the repository root:
#
#   powershell -ExecutionPolicy Bypass -File scripts\soak\run-soak.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\soak\run-soak.ps1 -Hours 0.1   # a 6-minute trial
#
# OPC UA runs SignAndEncrypt and both datasources pin the controller's
# certificates. Run once without -OpcuaFingerprint / -RestFingerprint: it
# prints the fingerprints the controller presents and writes nothing. Check
# them, then pass them in. The OPC UA client certificate is kept in
# soak-runs\opcua-cert.pem / opcua-key.pem and reused by every run, so the
# controller has to trust it only once (the first run creates it).
#
# It builds the runtime from the current checkout, keeps the PC awake for
# the run, starts the runtime on 127.0.0.1 with its own databases in
# soak-runs\<time>\, and runs scripts\soak\soak.mjs, which deploys a soak
# project, watches every tag, writes the PLC test variables every minute
# and restores them at the end. During an outage (unplug the PLC for a
# minute to cause one) it also writes once and expects a fast refusal.
# Results: soak-runs\<time>\summary.json and events.jsonl. Ctrl+C stops
# early and still restores the variables.
param(
    [string]$Plc = "10.0.0.210",
    [double]$Hours = 24,
    [int]$Port = 3095,
    [int]$WriteEverySec = 60,
    [string]$OpcuaFingerprint = "",
    [string]$RestFingerprint = ""
)
$ErrorActionPreference = "Stop"

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$runs = Join-Path $root "soak-runs"
$out = Join-Path $runs (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Force $out | Out-Null
Write-Host "Soak output: $out"

# The runtime looks for its OPC UA client certificate in its working folder.
$clientCert = @("opcua-cert.pem", "opcua-key.pem")
$haveClientCert = (Test-Path "$runs\opcua-cert.pem") -and (Test-Path "$runs\opcua-key.pem")
if ($haveClientCert) {
    foreach ($f in $clientCert) { Copy-Item "$runs\$f" "$out\$f" }
} else {
    Write-Host "No OPC UA client certificate in $runs yet; the runtime makes one. The controller must trust it (PLCnext WBM, OPC UA certificates) before OPC UA can connect."
}

Push-Location $root
try {
    go build -o "$out\speths-screens.exe" .\cmd\speths-screens
    if ($LASTEXITCODE -ne 0) { throw "go build failed" }
} finally { Pop-Location }

# Keep the PC (and network) awake while this script runs.
Add-Type -Namespace Soak -Name Power -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
$ES_CONTINUOUS = [uint32]"0x80000000"; $ES_SYSTEM_REQUIRED = [uint32]"0x00000001"
[void][Soak.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)

$runtimeArgs = @(
    "--mode=dev", "--addr=127.0.0.1:$Port",
    "--history=$out\history.db", "--alarm-db=$out\alarms.db", "--version-db=$out\versions.db",
    "--security-db=$out\security.db", "--recipe-db=$out\recipes.db"
)
$runtime = Start-Process -FilePath "$out\speths-screens.exe" -ArgumentList $runtimeArgs -WorkingDirectory $out `
    -RedirectStandardOutput "$out\runtime.out.log" -RedirectStandardError "$out\runtime.log" -PassThru -WindowStyle Hidden
Write-Host "Runtime PID $($runtime.Id) on http://127.0.0.1:$Port"

$code = 1
try {
    node "$root\scripts\soak\soak.mjs" "--runtime=http://127.0.0.1:$Port" "--plc=$Plc" "--hours=$Hours" `
        "--out=$out" "--pid=$($runtime.Id)" "--write-every=$WriteEverySec" `
        "--opcua-fingerprint=$OpcuaFingerprint" "--rest-fingerprint=$RestFingerprint"
    $code = $LASTEXITCODE
} finally {
    if (-not $runtime.HasExited) { Stop-Process -Id $runtime.Id -Force }
    if (-not $haveClientCert -and (Test-Path "$out\opcua-cert.pem") -and (Test-Path "$out\opcua-key.pem")) {
        foreach ($f in $clientCert) { Copy-Item "$out\$f" "$runs\$f" }
        Write-Host "Kept the new OPC UA client certificate in $runs for later runs."
    }
    [void][Soak.Power]::SetThreadExecutionState($ES_CONTINUOUS)
    Write-Host "Runtime stopped. Results in $out"
}
exit $code
