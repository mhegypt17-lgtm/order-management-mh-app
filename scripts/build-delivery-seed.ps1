$src = "C:\Users\sheltoni\Downloads\Delivery Zones.xlsx"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($src)
$sheet = ($z.Entries | Where-Object { $_.FullName -like "xl/worksheets/sheet1.xml" })
$r = New-Object System.IO.StreamReader($sheet.Open()); $xml = $r.ReadToEnd(); $r.Close()
$shared = ($z.Entries | Where-Object { $_.FullName -eq "xl/sharedStrings.xml" })
$r2 = New-Object System.IO.StreamReader($shared.Open()); $ss = $r2.ReadToEnd(); $r2.Close()
$z.Dispose()
[xml]$shXml = $ss
$strings = @()
foreach ($si in $shXml.sst.si) { $val = ""; if ($si.t -is [string]) { $val = $si.t } elseif ($si.t.'#text') { $val = $si.t.'#text' }; $strings += $val }
[xml]$wsXml = $xml
$out = @("id,zone,area,subArea,averageDistanceKm,deliveryCost,customerDeliveryFee,freeDeliveryValue,createdAt,updatedAt")
$currentZone = 0
$rowIdx = 0
$now = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss+00:00")
foreach ($row in $wsXml.worksheet.sheetData.row) {
  $cells = @{}
  foreach ($c in $row.c) {
    $ref = $c.r; $col = ($ref -replace '[0-9]+', '')
    $v = ""; if ($c.t -eq 's') { $idx = [int]$c.v; $v = $strings[$idx] } else { $v = $c.v }
    $cells[$col] = $v
  }
  $rn = [int]($row.r)
  if ($rn -le 2) { continue }
  $a = $cells['A']; $b = $cells['B']; $c2 = $cells['C']; $d = $cells['D']; $e = $cells['E']; $f = $cells['F']
  if ($a -match '^[Zz]one\s*(\d+)') { $currentZone = [int]$matches[1] }
  $area = if ($b) { $b.Trim() } else { '' }
  $subArea = if ($c2) { $c2.Trim() } else { '' }
  if (-not $area -and -not $subArea) { continue }
  $dist = if ($d) { [math]::Round([double]$d, 1) } else { 0 }
  $cost = if ($e) { [int][double]$e } else { 0 }
  $free = if ($f) { [int][double]$f } else { 0 }
  $rowIdx++
  $id = "zone_seed_{0:D4}" -f $rowIdx
  $line = "$id,$currentZone,$area,$subArea,$dist,$cost,$cost,$free,$now,$now"
  $out += $line
}
$out | Out-File -Encoding UTF8 "C:\Users\sheltoni\OneDrive - Microsoft\Vibe Coding ST\Order Management MH APP\data\import-templates\delivery-zones-seed.csv"
Write-Host "Wrote $($out.Count - 1) data rows"
