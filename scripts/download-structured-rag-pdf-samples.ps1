param(
  [string]$OutDir = ".cache/structured-rag/pdf-samples",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot $OutDir

function Test-PdfSignature {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return $false
  }

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 4) {
    return $false
  }

  return (
    $bytes[0] -eq 0x25 -and
    $bytes[1] -eq 0x50 -and
    $bytes[2] -eq 0x44 -and
    $bytes[3] -eq 0x46
  )
}

function Download-PdfFile {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Sample,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe `
      --location `
      --fail `
      --silent `
      --show-error `
      --user-agent "Mozilla/5.0" `
      --header "Accept: application/pdf,*/*;q=0.8" `
      --output $TargetPath `
      $Sample.Url
  } else {
    Invoke-WebRequest `
      -Uri $Sample.Url `
      -OutFile $TargetPath `
      -Headers @{ Accept = "application/pdf,*/*;q=0.8" } `
      -UserAgent "Mozilla/5.0"
  }

  if (-not (Test-PdfSignature -Path $TargetPath)) {
    Remove-Item -Force -ErrorAction SilentlyContinue $TargetPath
    throw "Downloaded file is not a valid PDF: $($Sample.FileName)"
  }
}

$externalSamples = @(
  @{
    Id = "book-nist-ai-600-1"
    Category = "book"
    FileName = "book-nist-ai-600-1.pdf"
    Title = "NIST AI 600-1: Generative AI Profile"
    Url = "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf"
  },
  @{
    Id = "manual-postgresql-17"
    Category = "manual"
    FileName = "manual-postgresql-17-a4.pdf"
    Title = "PostgreSQL 17 Documentation (A4 PDF)"
    Url = "https://www.postgresql.org/files/documentation/pdf/17/postgresql-17-A4.pdf"
  },
  @{
    Id = "paper-attention-2017"
    Category = "paper"
    FileName = "paper-attention-is-all-you-need-2017.pdf"
    Title = "Attention Is All You Need"
    Url = "https://papers.nips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf"
  }
)

$syntheticSamples = @(
  @{
    Id = "synthetic-chart-dense-report"
    Category = "report"
    FileName = "synthetic-chart-dense-report.pdf"
    Title = "Synthetic Grid Outlook Report"
    Url = "generated://synthetic-chart-dense-report"
  },
  @{
    Id = "synthetic-mixed-layout-report"
    Category = "report"
    FileName = "synthetic-mixed-layout-report.pdf"
    Title = "Synthetic Mixed Layout Program Review"
    Url = "generated://synthetic-mixed-layout-report"
  }
)

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

Write-Host "Structured RAG PDF sample downloader"
Write-Host "Target directory: $targetDir"
Write-Host ""

$manifest = @()

foreach ($sample in $externalSamples) {
  $targetPath = Join-Path $targetDir $sample.FileName

  if ((Test-Path $targetPath) -and -not $Force -and (Test-PdfSignature -Path $targetPath)) {
    $item = Get-Item $targetPath
    Write-Host "[skip] $($sample.FileName) already exists ($([math]::Round($item.Length / 1MB, 2)) MB)"
  } else {
    if (Test-Path $targetPath) {
      Remove-Item -Force $targetPath
    }
    Write-Host "[download] $($sample.FileName)"
    Download-PdfFile -Sample $sample -TargetPath $targetPath
  }
}

$generatorScript = Join-Path $PSScriptRoot "generate-structured-rag-synthetic-pdfs.py"
if (-not (Test-Path $generatorScript)) {
  throw "Synthetic PDF generator not found: $generatorScript"
}

$generatorArgs = @($generatorScript, "--out-dir", $targetDir)
if ($Force) {
  $generatorArgs += "--force"
}

Write-Host "[generate] synthetic-chart-dense-report.pdf"
Write-Host "[generate] synthetic-mixed-layout-report.pdf"
& python @generatorArgs

if ($LASTEXITCODE -ne 0) {
  throw "Synthetic PDF generation failed with exit code $LASTEXITCODE"
}

foreach ($sample in ($externalSamples + $syntheticSamples)) {
  $targetPath = Join-Path $targetDir $sample.FileName
  if (-not (Test-Path $targetPath)) {
    throw "Expected sample file was not created: $($sample.FileName)"
  }

  if (-not (Test-PdfSignature -Path $targetPath)) {
    throw "Expected sample file is not a valid PDF: $($sample.FileName)"
  }

  $item = Get-Item $targetPath
  $manifest += [pscustomobject]@{
    id = $sample.Id
    category = $sample.Category
    title = $sample.Title
    fileName = $sample.FileName
    url = $sample.Url
    sizeBytes = $item.Length
    downloadedAt = (Get-Date).ToString("s")
  }
}

$manifestPath = Join-Path $targetDir "manifest.json"
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "Downloaded $($manifest.Count) sample PDFs."
Write-Host "Manifest: $manifestPath"
