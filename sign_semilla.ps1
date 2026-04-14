$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$p12Path = $args[0]
$p12Pass = $args[1]
$semillaPath = $args[2]
$outputPath = $args[3]

# Register RSA-SHA256 signature description for .NET Framework
$addAlgSrc = @"
using System.Security.Cryptography;

public class RSAPKCS1SHA256SignatureDescription : SignatureDescription {
    public RSAPKCS1SHA256SignatureDescription() {
        base.KeyAlgorithm = typeof(RSACryptoServiceProvider).FullName;
        base.DigestAlgorithm = typeof(SHA256Managed).FullName;
        base.FormatterAlgorithm = typeof(RSAPKCS1SignatureFormatter).FullName;
        base.DeformatterAlgorithm = typeof(RSAPKCS1SignatureDeformatter).FullName;
    }

    public override AsymmetricSignatureDeformatter CreateDeformatter(AsymmetricAlgorithm key) {
        var df = (AsymmetricSignatureDeformatter)CryptoConfig.CreateFromName(base.DeformatterAlgorithm);
        df.SetKey(key);
        df.SetHashAlgorithm("SHA256");
        return df;
    }

    public override AsymmetricSignatureFormatter CreateFormatter(AsymmetricAlgorithm key) {
        var f = (AsymmetricSignatureFormatter)CryptoConfig.CreateFromName(base.FormatterAlgorithm);
        f.SetKey(key);
        f.SetHashAlgorithm("SHA256");
        return f;
    }
}
"@

Add-Type -TypeDefinition $addAlgSrc

[System.Security.Cryptography.CryptoConfig]::AddAlgorithm(
    [RSAPKCS1SHA256SignatureDescription],
    'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
)

# Load certificate from P12
$p12Bytes = [System.IO.File]::ReadAllBytes($p12Path)
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($p12Bytes, $p12Pass, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)

Write-Host "Cert: $($cert.Subject)"

# Get RSA key with enhanced CSP for SHA256 support
$rsaKey = $cert.PrivateKey
$rsaCsp = New-Object System.Security.Cryptography.RSACryptoServiceProvider
$rsaCsp.ImportParameters($rsaKey.ExportParameters($true))

# Load XML
$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.PreserveWhitespace = $true
$xmlDoc.Load($semillaPath)

# Create SignedXml
$signedXml = New-Object System.Security.Cryptography.Xml.SignedXml($xmlDoc)
$signedXml.SigningKey = $rsaCsp

# Create reference
$reference = New-Object System.Security.Cryptography.Xml.Reference
$reference.Uri = ''

# Add enveloped signature transform
$transform = New-Object System.Security.Cryptography.Xml.XmlDsigEnvelopedSignatureTransform
$reference.AddTransform($transform)

# Set digest method to SHA256
$reference.DigestMethod = 'http://www.w3.org/2001/04/xmlenc#sha256'

$signedXml.AddReference($reference)

# Set signature method to RSA-SHA256
$signedXml.SignedInfo.SignatureMethod = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'

# Set canonicalization method
$signedXml.SignedInfo.CanonicalizationMethod = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'

# Add KeyInfo with X509 certificate
$keyInfo = New-Object System.Security.Cryptography.Xml.KeyInfo
$keyInfoData = New-Object System.Security.Cryptography.Xml.KeyInfoX509Data($cert)
$keyInfo.AddClause($keyInfoData)
$signedXml.KeyInfo = $keyInfo

# Compute signature
$signedXml.ComputeSignature()

# Get signature element and append
$signatureElement = $signedXml.GetXml()
$imported = $xmlDoc.ImportNode($signatureElement, $true)
$xmlDoc.DocumentElement.AppendChild($imported) | Out-Null

# Save
$xmlDoc.Save($outputPath)
Write-Host "Signed XML saved"
