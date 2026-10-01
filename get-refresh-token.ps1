# Auth OAuth2 Google Drive - lance le flow navigateur et sauvegarde les credentials
# Prerequis : gcp-oauth.keys.json (client OAuth "Application de bureau" de console.cloud.google.com)
Set-Location $PSScriptRoot
node "$PSScriptRoot\auth-drive.mjs"
