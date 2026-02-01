$imageDir = "c:\Users\alles\Downloads\adaline\public\images"
if (-not (Test-Path $imageDir)) {
    New-Item -ItemType Directory -Path $imageDir -Force | Out-Null
}

$baseUrl = "https://www.adaline.ai/sequence/16x9_281/standard/graded_4K_100_gm_50_1080_3"

for ($i = 1; $i -le 281; $i++) {
    $num = "{0:D3}" -f $i
    $url = "$baseUrl-$num.jpg"
    $filePath = Join-Path $imageDir "$num.jpg"
    
    Write-Host "Downloading image $num ($i/281)..." -ForegroundColor Cyan
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $filePath -TimeoutSec 30 -ErrorAction Stop
        Write-Host "Downloaded: $num" -ForegroundColor Green
    } 
    catch {
        Write-Host "Failed to download $num" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 100
}

Write-Host "Download complete!" -ForegroundColor Green
$count = (Get-ChildItem $imageDir -Filter "*.jpg" | Measure-Object).Count
Write-Host "Total images downloaded: $count"
