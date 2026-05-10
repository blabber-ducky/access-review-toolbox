#Requires -Version 5.1
<#
.SYNOPSIS
    Access Review Toolbox — local HTTP server.
    Run via Launch.bat. Listens on http://localhost:8743/
#>

$ErrorActionPreference = 'Stop'
$Port      = 8743
$RootPath  = Split-Path -Parent $PSScriptRoot   # project root (parent of scripts/)
$DumpsPath = Join-Path $RootPath 'dumps'

if (-not (Test-Path $DumpsPath)) {
    New-Item -ItemType Directory -Path $DumpsPath | Out-Null
}

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

$Jobs = @{}

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
    $ext  = [System.IO.Path]::GetExtension($FilePath).ToLower()
    $mime = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { 'application/octet-stream' }
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
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $reader.ReadToEnd()
}

function Handle-GetModules {
    param($Response)
    $modulesDir = Join-Path $RootPath 'modules'
    $manifests  = @()
    foreach ($dir in Get-ChildItem $modulesDir -Directory) {
        $mf = Join-Path $dir.FullName 'module.json'
        if (Test-Path $mf) {
            $manifests += Get-Content $mf -Raw | ConvertFrom-Json
        }
    }
    Send-Json $Response $manifests
}

function Handle-PostDump {
    param($Request, $Response)
    $body       = Get-RequestBody $Request | ConvertFrom-Json
    $moduleId   = $body.module
    $configPath = $body.configPath

    $mfPath = Join-Path $RootPath "modules\$moduleId\module.json"
    if (-not (Test-Path $mfPath)) {
        Send-Error $Response "Module '$moduleId' not found" 404; return
    }
    $manifest   = Get-Content $mfPath -Raw | ConvertFrom-Json
    $dumpFolder = $manifest.dumpFolder
    $scriptPath = Join-Path $RootPath $manifest.scriptPath

    $timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $dumpPath  = Join-Path $DumpsPath "$dumpFolder\$timestamp"
    New-Item -ItemType Directory -Path $dumpPath -Force | Out-Null

    $epoch = [int][double]::Parse((Get-Date -UFormat '%s'))
    $jobId = "$moduleId-$epoch"

    $job = Start-Job -ScriptBlock {
        param($script, $dump, $cfg)
        & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $script -DumpPath $dump -ConfigPath $cfg
    } -ArgumentList $scriptPath, $dumpPath, $configPath

    $Jobs[$jobId] = @{
        Job      = $job
        DumpPath = $dumpPath
        Module   = $moduleId
        Output   = [System.Collections.ArrayList]@()
    }

    Send-Json $Response @{ status = 'started'; jobId = $jobId; dumpPath = $dumpPath }
}

function Handle-GetDumpStatus {
    param($Request, $Response)
    $jobId = $Request.QueryString['jobId']
    if (-not $Jobs.ContainsKey($jobId)) {
        Send-Json $Response @{ status = 'done' }; return
    }
    $entry = $Jobs[$jobId]
    $job   = $entry.Job

    $newLines = Receive-Job $job -ErrorAction SilentlyContinue
    if ($newLines) { foreach ($l in $newLines) { $entry.Output.Add($l) | Out-Null } }

    $progress = 0
    $message  = 'Running...'
    foreach ($line in $entry.Output) {
        if ($line -match '^PROGRESS:(\d+):(.+)$') {
            $progress = [int]$Matches[1]
            $message  = $Matches[2]
        }
    }

    switch ($job.State) {
        'Running'   { Send-Json $Response @{ status = 'running'; progress = $progress; message = $message } }
        'Completed' {
            $lastLine = ($entry.Output | Where-Object { $_ -match '^(DONE|ERROR):' } | Select-Object -Last 1)
            Remove-Job $job -Force
            $Jobs.Remove($jobId)
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
            Send-Json $Response @{ status = 'error'; message = $errMsg }
        }
        default { Send-Json $Response @{ status = 'running'; progress = $progress; message = $message } }
    }
}

function Handle-GetDumps {
    param($Request, $Response)
    $moduleId   = $Request.QueryString['module']
    $mfPath     = Join-Path $RootPath "modules\$moduleId\module.json"
    if (-not (Test-Path $mfPath)) { Send-Json $Response @(); return }

    $manifest   = Get-Content $mfPath -Raw | ConvertFrom-Json
    $moduleDir  = Join-Path $DumpsPath $manifest.dumpFolder

    $results = [System.Collections.ArrayList]@()
    if (Test-Path $moduleDir) {
        foreach ($d in (Get-ChildItem $moduleDir -Directory | Sort-Object Name -Descending)) {
            $mf = Join-Path $d.FullName 'manifest.json'
            if (Test-Path $mf) {
                $mfData = Get-Content $mf -Raw | ConvertFrom-Json
                $results.Add(@{
                    path               = $d.FullName
                    timestamp          = $mfData.timestamp
                    timestampFormatted = $d.Name
                    status             = $mfData.status
                    fileCount          = ($mfData.files | Measure-Object).Count
                    collectedBy        = $mfData.collectedBy
                    hostname           = $mfData.hostname
                }) | Out-Null
            } else {
                $results.Add(@{
                    path               = $d.FullName
                    timestampFormatted = $d.Name
                    status             = 'invalid'
                    fileCount          = 0
                }) | Out-Null
            }
        }
    }
    Send-Json $Response $results
}

function Handle-GetConfig {
    param($Request, $Response)
    $path = $Request.QueryString['path']
    if (-not $path -or -not (Test-Path $path)) {
        Send-Error $Response "Config file not found" 404; return
    }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $Response.StatusCode      = 200
    $Response.ContentType     = 'application/json; charset=utf-8'
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
    if (-not (Test-Path $absPath -PathType Leaf)) {
        Send-Error $Response "File not found" 404; return
    }
    $bytes = [System.IO.File]::ReadAllBytes($absPath)
    $Response.StatusCode      = 200
    $Response.ContentType     = 'application/json; charset=utf-8'
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

# ── Start ─────────────────────────────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
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
            if     ($upath -eq '/api/modules'      -and $method -eq 'GET')  { Handle-GetModules $resp }
            elseif ($upath -eq '/api/dump'         -and $method -eq 'POST') { Handle-PostDump $req $resp }
            elseif ($upath -eq '/api/dump/status'  -and $method -eq 'GET')  { Handle-GetDumpStatus $req $resp }
            elseif ($upath -eq '/api/dumps'        -and $method -eq 'GET')  { Handle-GetDumps $req $resp }
            elseif ($upath -eq '/api/config/load'  -and $method -eq 'GET')  { Handle-GetConfig $req $resp }
            elseif ($upath -eq '/api/config/save'  -and $method -eq 'POST') { Handle-PostConfig $req $resp }
            elseif ($upath -eq '/api/data/abs'     -and $method -eq 'GET')  { Handle-GetDataAbs $req $resp }
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
