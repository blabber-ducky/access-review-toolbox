#Requires -Version 5.1
<#
.SYNOPSIS
    Pester test runner for scripts/ad/*.ps1
    Usage: pwsh -NoProfile -File tests/ps/Run-Tests.ps1 [-CI]
#>
param([switch]$CI)

$ErrorActionPreference = 'Stop'

Import-Module Pester -MinimumVersion 5.0 -ErrorAction Stop

$config = New-PesterConfiguration
$config.Run.Path         = $PSScriptRoot
$config.Output.Verbosity = 'Detailed'
$config.Run.Exit         = $CI.IsPresent   # exit non-zero on failure when running in CI

Invoke-Pester -Configuration $config
