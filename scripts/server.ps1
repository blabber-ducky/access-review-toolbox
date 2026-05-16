#Requires -Version 5.1
<#
.SYNOPSIS
    Access Review Toolbox — local HTTP server.
    Run via Launch.bat. Listens on http://localhost:8743/
#>

$ErrorActionPreference = 'Stop'
$Port      = 8743
$RootPath  = Split-Path -Parent $PSScriptRoot
$DumpsPath = Join-Path $RootPath 'dumps'

if (-not (Test-Path $DumpsPath)) { New-Item -ItemType Directory -Path $DumpsPath | Out-Null }

$MimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.png'  = 'image/png'
    '.txt'  = 'text/plain; charset=utf-8'
}

# ── Global state ───────────────────────────────────────────────────────────────
$Jobs      = @{}
$LogBuffer = [System.Collections.ArrayList]@()
$MaxLogLines = 800

# ── Log helpers ────────────────────────────────────────────────────────────────
function Add-LogEntry {
    param([string]$Source, [string]$Text)
    $level = 'info'
    if ($Text -match '^PROGRESS:\d+:') { $level = 'progress' }
    elseif ($Text -match '^DONE:')     { $level = 'done' }
    elseif ($Text -match '^ERROR:')    { $level = 'error' }
    elseif ($Text -match '^WARN:')     { $level = 'warn' }

    $entry = @{
        index     = $LogBuffer.Count
        timestamp = (Get-Date -Format 'o')
        source    = $Source
        text      = $Text
        level     = $level
    }
    $LogBuffer.Add($entry) | Out-Null
    if ($LogBuffer.Count -gt $MaxLogLines) {
        $LogBuffer.RemoveAt(0)
        # Re-index
        for ($i = 0; $i -lt $LogBuffer.Count; $i++) { $LogBuffer[$i].index = $i }
    }
}

function Add-SystemLog { param([string]$Text); Add-LogEntry 'system' $Text }

# ── HTTP helpers ───────────────────────────────────────────────────────────────
function Send-Json {
    param($Response, $Data, [int]$StatusCode = 200)
    $json  = $Data | ConvertTo-Json -Depth 20 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.StatusCode        = $StatusCode
    $Response.ContentType       = 'application/json; charset=utf-8'
    $Response.ContentLength64   = $bytes.Length
    $Response.Headers.Add('Access-Control-Allow-Origin', '*')
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Send-Error {
    param($Response, [string]$Message, [int]$StatusCode = 500)
    Send-Json $Response @{ error = $Message } $StatusCode
}

function Send-File {
    param($Response, [string]$FilePath)
    if (-not (Test-Path $FilePath -PathType Leaf)) {
        $Response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        $Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $Response.OutputStream.Close()
        return
    }
    $ext   = [System.IO.Path]::GetExtension($FilePath).ToLower()
    $mime  = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    $Response.StatusCode      = 200
    $Response.ContentType     = $mime
    $Response.ContentLength64 = $bytes.Length
    $Response.Headers.Add('Cache-Control', 'no-cache')
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Get-RequestBody {
    param($Request)
    (New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)).ReadToEnd()
}

# ── Job output drain (call before any status check) ────────────────────────────
function Drain-Jobs {
    foreach ($jobId in @($Jobs.Keys)) {
        $entry    = $Jobs[$jobId]
        $newLines = Receive-Job $entry.Job -ErrorAction SilentlyContinue
        if ($newLines) {
            foreach ($line in $newLines) {
                $entry.Output.Add($line) | Out-Null
                Add-LogEntry $jobId $line
            }
        }
    }
}

# ── Spawn a background PS script ───────────────────────────────────────────────
function Start-ScriptJob {
    param([string]$JobId, [string]$ScriptPath, [string]$DumpPath, [string]$ConfigPath)
    $job = Start-Job -ScriptBlock {
        param($script, $dump, $cfg)
        & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $script -DumpPath $dump -ConfigPath $cfg
    } -ArgumentList $ScriptPath, $DumpPath, $ConfigPath

    $Jobs[$JobId] = @{
        Job      = $job
        DumpPath = $DumpPath
        ScriptPath = $ScriptPath
        Output   = [System.Collections.ArrayList]@()
    }
    Add-SystemLog "Started job $JobId"
}

# ── Resolve a module's script path by operation ────────────────────────────────
function Get-ModuleScriptPath {
    param([string]$ModuleId, [string]$Operation)
    $mfPath = Join-Path $RootPath "modules\$ModuleId\module.json"
    if (-not (Test-Path $mfPath)) { return $null }
    $mf = Get-Content $mfPath -Raw | ConvertFrom-Json

    # Prefer scripts.{operation} then fall back to scriptPath for dump
    if ($mf.scripts -and $mf.scripts.$Operation) {
        return Join-Path $RootPath ($mf.scripts.$Operation.Replace('/', '\'))
    }
    if ($Operation -eq 'dump' -and $mf.scriptPath) {
        return Join-Path $RootPath ($mf.scriptPath.Replace('/', '\'))
    }
    return $null
}

# ── API handlers ───────────────────────────────────────────────────────────────

function Handle-GetModules {
    param($Response)
    $modulesDir = Join-Path $RootPath 'modules'
    $manifests  = @()
    foreach ($dir in Get-ChildItem $modulesDir -Directory) {
        $mf = Join-Path $dir.FullName 'module.json'
        if (Test-Path $mf) { $manifests += Get-Content $mf -Raw | ConvertFrom-Json }
    }
    Send-Json $Response $manifests
}

function Handle-PostDump {
    param($Request, $Response)
    $body       = Get-RequestBody $Request | ConvertFrom-Json
    $moduleId   = $body.module
    $configPath = $body.configPath

    $scriptPath = Get-ModuleScriptPath $moduleId 'dump'
    if (-not $scriptPath) { Send-Error $Response "Module or dump script not found" 404; return }

    $mfPath = Join-Path $RootPath "modules\$moduleId\module.json"
    $mf     = Get-Content $mfPath -Raw | ConvertFrom-Json

    $timestamp  = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $dumpPath   = Join-Path $DumpsPath "$($mf.dumpFolder)\$timestamp"
    New-Item -ItemType Directory -Path $dumpPath -Force | Out-Null

    $epoch = [int][double]::Parse((Get-Date -UFormat '%s'))
    $jobId = "$moduleId-dump-$epoch"

    Start-ScriptJob $jobId $scriptPath $dumpPath $configPath
    Send-Json $Response @{ status = 'started'; jobId = $jobId; dumpPath = $dumpPath }
}

function Handle-PostReview {
    param($Request, $Response)
    $body       = Get-RequestBody $Request | ConvertFrom-Json
    $moduleId   = $body.module
    $dumpPath   = $body.dumpPath
    $configPath = if ($body.configPath) { $body.configPath } else { '' }

    $scriptPath = Get-ModuleScriptPath $moduleId 'review'
    if (-not $scriptPath) { Send-Error $Response "No review script for module '$moduleId'" 404; return }

    $epoch = [int][double]::Parse((Get-Date -UFormat '%s'))
    $jobId = "$moduleId-review-$epoch"

    Start-ScriptJob $jobId $scriptPath $dumpPath $configPath
    Send-Json $Response @{ status = 'started'; jobId = $jobId; dumpPath = $dumpPath }
}

function Handle-PostRefresh {
    param($Request, $Response)
    $body       = Get-RequestBody $Request | ConvertFrom-Json
    $moduleId   = $body.module
    $dumpPath   = $body.dumpPath
    $configPath = if ($body.configPath) { $body.configPath } else { '' }

    $scriptPath = Get-ModuleScriptPath $moduleId 'refresh'
    if (-not $scriptPath) {
        # Fall back to review script
        $scriptPath = Get-ModuleScriptPath $moduleId 'review'
    }
    if (-not $scriptPath) { Send-Error $Response "No refresh script for module '$moduleId'" 404; return }

    $epoch = [int][double]::Parse((Get-Date -UFormat '%s'))
    $jobId = "$moduleId-refresh-$epoch"

    Start-ScriptJob $jobId $scriptPath $dumpPath $configPath
    Send-Json $Response @{ status = 'started'; jobId = $jobId; dumpPath = $dumpPath }
}

function Handle-GetDumpStatus {
    param($Request, $Response)
    $jobId = $Request.QueryString['jobId']
    Drain-Jobs

    if (-not $Jobs.ContainsKey($jobId)) {
        Send-Json $Response @{ status = 'done' }; return
    }
    $entry = $Jobs[$jobId]
    $job   = $entry.Job

    $progress = 0; $message = 'Running...'
    foreach ($line in $entry.Output) {
        if ($line -match '^PROGRESS:(\d+):(.+)$') { $progress = [int]$Matches[1]; $message = $Matches[2] }
    }

    switch ($job.State) {
        'Running'   { Send-Json $Response @{ status = 'running'; progress = $progress; message = $message } }
        'Completed' {
            $lastLine = ($entry.Output | Where-Object { $_ -match '^(DONE|ERROR):' } | Select-Object -Last 1)
            Remove-Job $job -Force
            $Jobs.Remove($jobId)
            Add-SystemLog "Job $jobId completed"
            if ($lastLine -match '^ERROR:(.+)$') {
                Send-Json $Response @{ status = 'error'; message = $Matches[1] }
            } else {
                Send-Json $Response @{ status = 'done'; dumpPath = $entry.DumpPath }
            }
        }
        'Failed'    {
            $errMsg = $job.ChildJobs[0].JobStateInfo.Reason.Message
            Remove-Job $job -Force
            $Jobs.Remove($jobId)
            Add-SystemLog "Job $jobId FAILED: $errMsg"
            Send-Json $Response @{ status = 'error'; message = $errMsg }
        }
        default { Send-Json $Response @{ status = 'running'; progress = $progress; message = $message } }
    }
}

function Handle-GetDumps {
    param($Request, $Response)
    $moduleId  = $Request.QueryString['module']
    $mfPath    = Join-Path $RootPath "modules\$moduleId\module.json"
    if (-not (Test-Path $mfPath)) { Send-Json $Response @(); return }
    $mf        = Get-Content $mfPath -Raw | ConvertFrom-Json
    $moduleDir = Join-Path $DumpsPath $mf.dumpFolder

    $results = [System.Collections.ArrayList]@()
    if (Test-Path $moduleDir) {
        foreach ($d in (Get-ChildItem $moduleDir -Directory | Sort-Object Name -Descending)) {
            $mfFile = Join-Path $d.FullName 'manifest.json'
            if (Test-Path $mfFile) {
                $mfData = Get-Content $mfFile -Raw | ConvertFrom-Json
                $results.Add(@{
                    path               = $d.FullName
                    timestamp          = $mfData.timestamp
                    timestampFormatted = $d.Name
                    status             = $mfData.status
                    fileCount          = ($mfData.files | Measure-Object).Count
                    collectedBy        = $mfData.collectedBy
                    hostname           = $mfData.hostname
                    hasFindings        = (Test-Path (Join-Path $d.FullName 'findings.json'))
                }) | Out-Null
            } else {
                $results.Add(@{
                    path               = $d.FullName
                    timestampFormatted = $d.Name
                    status             = 'invalid'
                    fileCount          = 0
                    hasFindings        = $false
                }) | Out-Null
            }
        }
    }
    Send-Json $Response $results
}

function Handle-GetConfig {
    param($Request, $Response)
    $path = $Request.QueryString['path']
    if (-not $path -or -not (Test-Path $path)) { Send-Error $Response "Config file not found" 404; return }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $Response.StatusCode = 200; $Response.ContentType = 'application/json; charset=utf-8'
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Handle-PostConfig {
    param($Request, $Response)
    $body = Get-RequestBody $Request | ConvertFrom-Json
    $path = $body.path
    $dir  = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    ($body.data | ConvertTo-Json -Depth 10) | Out-File -FilePath $path -Encoding UTF8
    Send-Json $Response @{ ok = $true }
}

function Handle-GetDataAbs {
    param($Request, $Response)
    $absPath = [System.IO.Path]::GetFullPath($Request.QueryString['path'])
    if (-not ($absPath.StartsWith($RootPath) -or $absPath.StartsWith($DumpsPath))) {
        Send-Error $Response "Forbidden" 403; return
    }
    if (-not (Test-Path $absPath -PathType Leaf)) { Send-Error $Response "File not found" 404; return }
    $bytes = [System.IO.File]::ReadAllBytes($absPath)
    $Response.StatusCode = 200; $Response.ContentType = 'application/json; charset=utf-8'
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Handle-GetLogs {
    param($Request, $Response)
    Drain-Jobs   # opportunistically drain output whenever logs are fetched
    $since = [int]($Request.QueryString['since'] ?? '0')
    $slice = @($LogBuffer | Where-Object { $_.index -ge $since })
    Send-Json $Response @{
        lines      = $slice
        total      = $LogBuffer.Count
        activeJobs = $Jobs.Count
    }
}

function Handle-DeleteLogs {
    param($Response)
    $LogBuffer.Clear()
    Add-SystemLog 'Log cleared'
    Send-Json $Response @{ ok = $true }
}

# ── Start listener ─────────────────────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Add-SystemLog "Server started on http://localhost:$Port/"
Write-Host "Access Review Toolbox running at http://localhost:$Port/"
Write-Host "Press Ctrl+C to stop."
Start-Process "http://localhost:$Port/"

try {
    while ($listener.IsListening) {
        $ctx    = $listener.GetContext()
        $req    = $ctx.Request
        $resp   = $ctx.Response
        $method = $req.HttpMethod
        $upath  = $req.Url.AbsolutePath.TrimEnd('/')

        try {
            if     ($upath -eq '/api/modules'      -and $method -eq 'GET')    { Handle-GetModules $resp }
            elseif ($upath -eq '/api/dump'         -and $method -eq 'POST')   { Handle-PostDump $req $resp }
            elseif ($upath -eq '/api/review'       -and $method -eq 'POST')   { Handle-PostReview $req $resp }
            elseif ($upath -eq '/api/refresh'      -and $method -eq 'POST')   { Handle-PostRefresh $req $resp }
            elseif ($upath -eq '/api/dump/status'  -and $method -eq 'GET')    { Handle-GetDumpStatus $req $resp }
            elseif ($upath -eq '/api/dumps'        -and $method -eq 'GET')    { Handle-GetDumps $req $resp }
            elseif ($upath -eq '/api/config/load'  -and $method -eq 'GET')    { Handle-GetConfig $req $resp }
            elseif ($upath -eq '/api/config/save'  -and $method -eq 'POST')   { Handle-PostConfig $req $resp }
            elseif ($upath -eq '/api/data/abs'     -and $method -eq 'GET')    { Handle-GetDataAbs $req $resp }
            elseif ($upath -eq '/api/logs'         -and $method -eq 'GET')    { Handle-GetLogs $req $resp }
            elseif ($upath -eq '/api/logs'         -and $method -eq 'DELETE') { Handle-DeleteLogs $resp }
            else {
                $file = if ($upath -eq '' -or $upath -eq '/') {
                    Join-Path $RootPath 'index.html'
                } else {
                    Join-Path $RootPath ($upath.TrimStart('/').Replace('/', '\'))
                }
                Send-File $resp $file
            }
        } catch {
            try { Send-Error $resp "Server error: $($_.Exception.Message)" } catch {}
        }
    }
} finally {
    $listener.Stop()
    Write-Host "Server stopped."
}
