$keyPath = "tmp\bbsns-keys.pem"
if (-Not (Test-Path $keyPath)) {
    Write-Error "Key not found at $keyPath"
    exit 1
}

$acl = Get-Acl $keyPath
$acl.SetAccessRuleProtection($true, $false) # Remove inheritance
$owner = New-Object System.Security.Principal.NTAccount($env:USERNAME)
$acl.SetOwner($owner)

# Remove all existing access rules
$acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) }

# Grant Read access to the current user only
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, "Read", "Allow")
$acl.AddAccessRule($accessRule)

Set-Acl $keyPath $acl
Write-Host "✅ SSH Key permissions hardened for user: $env:USERNAME"
