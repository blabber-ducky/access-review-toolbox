#Requires -Version 5.1
<#
.SYNOPSIS
    AD refresh — re-runs review logic on an existing dump without re-collecting data.
    Delegates to review.ps1.
#>
param(
    [Parameter(Mandatory)][string]$DumpPath,
    [string]$ConfigPath
)

Write-Host 'PROGRESS:2:Starting findings refresh...'
& "$PSScriptRoot\review.ps1" -DumpPath $DumpPath -ConfigPath $ConfigPath
