# Run this once to download nlohmann/json single-header
$url  = "https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp"
$dest = "$PSScriptRoot\third_party\json.hpp"
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\third_party" | Out-Null
Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
Write-Host "Downloaded $((Get-Item $dest).Length) bytes -> $dest"
