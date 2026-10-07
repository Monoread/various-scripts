
# Title: Laptop History Extractor
# Created: 02/01/2026

# Description: This script will extract power on and off events and hibernate/wake from the Windows System event log
# it will then merge it into data.js so history can accumulate over time instead of being lost as Windows purges old event logs regularly
# created as a fun way to visualise in data most busiest periods. I combined this with an offpeak tarrif to see if my server would power on
# during expensive periods. I had plan to further enhance this to possibly do some better budgeting/power calculations!

$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot 'data.js'

# Any existing events?
$existingEvents = @()
if (Test-Path $dataPath) {
    $existingContent = Get-Content $dataPath -Raw
    $jsonMatch = [regex]::Match($existingContent, '(?s)const laptopEvents\s*=\s*(\[.*?\]);')
    if ($jsonMatch.Success) {
        try {
            $existingEvents = $jsonMatch.Groups[1].Value | ConvertFrom-Json
            if ($existingEvents -isnot [array]) { $existingEvents = @($existingEvents) }
        } catch {
            Write-Warning "Could not parse existing data.js, starting fresh: $_"
            $existingEvents = @()
        }
    }
}
Write-Host "Loaded $($existingEvents.Count) existing events from data.js"

# Get the NEW events
$newEvents = @()

# FULL POWER ON
$boots = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-General'; Id=12} -MaxEvents 5000 -ErrorAction SilentlyContinue
foreach ($b in $boots) {
    $newEvents += [PSCustomObject]@{
        type = 'PowerOn'
        time = $b.TimeCreated.ToUniversalTime().ToString('o')
        detail = 'Full system boot'
    }
}

# FULL POWER OFF
$shutdowns = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-General'; Id=13} -MaxEvents 5000 -ErrorAction SilentlyContinue
foreach ($s in $shutdowns) {
    $newEvents += [PSCustomObject]@{
        type = 'PowerOff'
        time = $s.TimeCreated.ToUniversalTime().ToString('o')
        detail = 'Full system shutdown'
    }
}

# Combines both sleep Hibernate cycles 
$sleeps = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Power-Troubleshooter'; Id=1} -MaxEvents 5000 -ErrorAction SilentlyContinue
foreach ($sl in $sleeps) {
    # Got to remove unicode from LEFT TO RIGHT MARK (U+200E) (Windows embeds in these date strings)
    $msg = $sl.Message -replace [char]0x200E, ''
    $sleepMatch = [regex]::Match($msg, 'Sleep Time:\s*([\d\-T:\.]+Z)')
    $wakeMatch  = [regex]::Match($msg, 'Wake Time:\s*([\d\-T:\.]+Z)')
    if ($sleepMatch.Success) {
        $sleepTime = [datetime]::Parse($sleepMatch.Groups[1].Value, $null, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal)
        $newEvents += [PSCustomObject]@{
            type = 'HibernateEnter'
            time = $sleepTime.ToString('o')
            detail = 'Entered low-power/sleep state'
        }
    }
    if ($wakeMatch.Success) {
        $wakeTime = [datetime]::Parse($wakeMatch.Groups[1].Value, $null, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal)
        $newEvents += [PSCustomObject]@{
            type = 'HibernateExit'
            time = $wakeTime.ToString('o')
            detail = 'Resumed from low-power/sleep state'
        }
    }
}

# Getting the reason from Kernel-Power where 506 (enter) and 507 (exit)
$enterReasonLookup = @{}
$exitReasonLookup = @{}
$enterEvents = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=506} -MaxEvents 5000 -ErrorAction SilentlyContinue
foreach ($r in $enterEvents) {
    $reasonMatch = [regex]::Match($r.Message, 'Reason:\s*(.+)')
    $key = $r.TimeCreated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm')
    if ($reasonMatch.Success) {
        $enterReasonLookup[$key] = $reasonMatch.Groups[1].Value.Trim()
    }
}
$exitEvents = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=507} -MaxEvents 5000 -ErrorAction SilentlyContinue
foreach ($r in $exitEvents) {
    $reasonMatch = [regex]::Match($r.Message, 'Reason:\s*(.+)')
    $key = $r.TimeCreated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm')
    if ($reasonMatch.Success) {
        $exitReasonLookup[$key] = $reasonMatch.Groups[1].Value.Trim()
    }
}
foreach ($e in $newEvents) {
    $t = [datetime]::Parse($e.time).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm')
    if ($e.type -eq 'HibernateEnter' -and $enterReasonLookup.ContainsKey($t)) {
        $e.detail = $enterReasonLookup[$t]
    }
    elseif ($e.type -eq 'HibernateExit' -and $exitReasonLookup.ContainsKey($t)) {
        $e.detail = $exitReasonLookup[$t]
    }
}

Write-Host "Extracted $($newEvents.Count) events from the current event log"

# Merge action to combine existing + new, dedupe by type and time, keep forever? database or something better long term?
$merged = @{}
foreach ($e in $existingEvents) {
    $key = "$($e.type)|$($e.time)"
    $merged[$key] = $e
}
foreach ($e in $newEvents) {
    $key = "$($e.type)|$($e.time)"
    $merged[$key] = $e
}

$allEvents = $merged.Values | Sort-Object { [datetime]::Parse($_.time) }

$json = $allEvents | ConvertTo-Json -Depth 3

$jsContent = "`nconst laptopEvents = $json;`n"
Set-Content -Path $dataPath -Value $jsContent -Encoding UTF8

$addedCount = $allEvents.Count - $existingEvents.Count
Write-Host "Merged: $($allEvents.Count) total events ($addedCount new). Range: $($allEvents[0].time) to $($allEvents[-1].time)"
