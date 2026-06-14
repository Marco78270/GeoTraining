param(
  [string]$Domain = "geotrainer",
  [string]$Token = $env:DUCKDNS_TOKEN,
  [string]$Ip = ""
)

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "DUCKDNS_TOKEN est requis. Passe-le en paramètre -Token ou via la variable d'environnement DUCKDNS_TOKEN."
}

$url = "https://www.duckdns.org/update?domains=$Domain&token=$Token&ip=$Ip"
$response = Invoke-WebRequest -Uri $url -UseBasicParsing

if ($response.Content -is [byte[]]) {
  $body = [System.Text.Encoding]::UTF8.GetString($response.Content).Trim()
} else {
  $body = [string]$response.Content
  $body = $body.Trim()
}

if ($body -ne "OK") {
  throw "Mise à jour DuckDNS échouée: $body"
}

Write-Host "DuckDNS mis à jour avec succès pour $Domain.duckdns.org"
