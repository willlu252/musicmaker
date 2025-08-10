# 🎵 MusicMaker Automated Sample Downloader
# This script automatically downloads all required samples for your musicmaker project

Write-Host "🎵 MusicMaker Automated Sample Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Create directories if they don't exist
$voxDir = "C:\musicmaker\public\samples\vox"
$grimeDir = "C:\musicmaker\public\samples\grime"

if (!(Test-Path $voxDir)) { New-Item -ItemType Directory -Path $voxDir -Force }
if (!(Test-Path $grimeDir)) { New-Item -ItemType Directory -Path $grimeDir -Force }

Write-Host "📁 Sample directories created" -ForegroundColor Green

# Function to download file with retry
function Download-WithRetry {
    param($url, $output, $description)
    Write-Host "⬇️  Downloading $description..." -ForegroundColor Yellow
    
    try {
        $progressPreference = 'silentlyContinue'
        Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing -TimeoutSec 30
        Write-Host "✅ Downloaded: $description" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ Failed to download: $description" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Download choir samples from free sources
Write-Host ""
Write-Host "🎤 Downloading choir/vocal samples..." -ForegroundColor Cyan

# Free choir samples from various sources (using direct links where available)
$choirSamples = @(
    @{
        url = "https://www.soundjay.com/misc/sounds/choir-14.wav"
        file = "$voxDir\ah_C4.mp3"
        desc = "Choir Ah C4"
    },
    @{
        url = "https://www.soundjay.com/misc/sounds/choir-15.wav" 
        file = "$voxDir\ah_G4.mp3"
        desc = "Choir Ah G4"
    },
    @{
        url = "https://www.soundjay.com/misc/sounds/choir-16.wav"
        file = "$voxDir\oo_C5.mp3"
        desc = "Choir Oo C5"
    }
)

# Download grime ad-lib samples
Write-Host ""
Write-Host "🔥 Downloading grime ad-lib samples..." -ForegroundColor Cyan

$grimeSamples = @(
    @{
        url = "https://www.soundjay.com/human/sounds/guy-yelling-2.wav"
        file = "$grimeDir\brap.wav"
        desc = "Grime Brap"
    },
    @{
        url = "https://www.soundjay.com/human/sounds/guy-yelling-3.wav"
        file = "$grimeDir\oi.wav"
        desc = "Grime Oi"
    },
    @{
        url = "https://www.soundjay.com/human/sounds/guy-yelling-4.wav"
        file = "$grimeDir\skeng.wav"
        desc = "Grime Skeng"
    },
    @{
        url = "https://www.soundjay.com/human/sounds/guy-yelling-5.wav"
        file = "$grimeDir\pullup.wav"
        desc = "Grime Pullup"
    }
)

# Download drum samples
Write-Host ""
Write-Host "🥁 Downloading drum kit samples..." -ForegroundColor Cyan

$drumSamples = @(
    @{
        url = "https://www.soundjay.com/misc/sounds/drums-kick-2.wav"
        file = "$grimeDir\kick.wav"
        desc = "Grime Kick"
    },
    @{
        url = "https://www.soundjay.com/misc/sounds/drums-snare-2.wav"
        file = "$grimeDir\snare.wav"
        desc = "Grime Snare"
    },
    @{
        url = "https://www.soundjay.com/misc/sounds/drums-hihat-2.wav"
        file = "$grimeDir\hihat.wav"
        desc = "Grime Hi-hat"
    }
)

# Attempt downloads
$allSamples = $choirSamples + $grimeSamples + $drumSamples
$successCount = 0

foreach ($sample in $allSamples) {
    if (Download-WithRetry $sample.url $sample.file $sample.desc) {
        $successCount++
    }
}

Write-Host ""
Write-Host "📊 Download Summary:" -ForegroundColor Cyan
Write-Host "   Successful: $successCount / $($allSamples.Count)" -ForegroundColor $(if($successCount -eq $allSamples.Count){"Green"}else{"Yellow"})

# Create backup/fallback samples if downloads failed
Write-Host ""
Write-Host "🔧 Creating fallback samples for testing..." -ForegroundColor Cyan

# Generate simple tone samples using PowerShell audio synthesis
$fallbackScript = @"
Add-Type -TypeDefinition @"
    using System;
    using System.IO;
    using System.Media;
    using System.Collections.Generic;

    public class ToneGenerator {
        public static void GenerateTone(string filename, double frequency, int duration) {
            int sampleRate = 44100;
            int channels = 1;
            int bitsPerSample = 16;
            int samples = duration * sampleRate / 1000;
            
            byte[] header = new byte[44];
            byte[] data = new byte[samples * channels * bitsPerSample / 8];
            
            // Generate sine wave
            for (int i = 0; i < samples; i++) {
                double t = (double)i / sampleRate;
                double sample = Math.Sin(2 * Math.PI * frequency * t) * 0.3;
                short value = (short)(sample * short.MaxValue);
                
                data[i * 2] = (byte)(value & 0xFF);
                data[i * 2 + 1] = (byte)((value >> 8) & 0xFF);
            }
            
            // WAV header
            System.Text.Encoding.ASCII.GetBytes("RIFF").CopyTo(header, 0);
            BitConverter.GetBytes(36 + data.Length).CopyTo(header, 4);
            System.Text.Encoding.ASCII.GetBytes("WAVE").CopyTo(header, 8);
            System.Text.Encoding.ASCII.GetBytes("fmt ").CopyTo(header, 12);
            BitConverter.GetBytes(16).CopyTo(header, 16);
            BitConverter.GetBytes((short)1).CopyTo(header, 20);
            BitConverter.GetBytes((short)channels).CopyTo(header, 22);
            BitConverter.GetBytes(sampleRate).CopyTo(header, 24);
            BitConverter.GetBytes(sampleRate * channels * bitsPerSample / 8).CopyTo(header, 28);
            BitConverter.GetBytes((short)(channels * bitsPerSample / 8)).CopyTo(header, 32);
            BitConverter.GetBytes((short)bitsPerSample).CopyTo(header, 34);
            System.Text.Encoding.ASCII.GetBytes("data").CopyTo(header, 36);
            BitConverter.GetBytes(data.Length).CopyTo(header, 40);
            
            File.WriteAllBytes(filename, header.Concat(data).ToArray());
        }
    }
"@

# Generate fallback samples if originals don't exist
if (!(Test-Path "$voxDir\ah_C4.mp3")) { [ToneGenerator]::GenerateTone("$voxDir\ah_C4.wav", 261.63, 2000) }
if (!(Test-Path "$voxDir\ah_G4.mp3")) { [ToneGenerator]::GenerateTone("$voxDir\ah_G4.wav", 392.00, 2000) }
if (!(Test-Path "$voxDir\oo_C5.mp3")) { [ToneGenerator]::GenerateTone("$voxDir\oo_C5.wav", 523.25, 2000) }
if (!(Test-Path "$grimeDir\brap.wav")) { [ToneGenerator]::GenerateTone("$grimeDir\brap.wav", 200, 500) }
if (!(Test-Path "$grimeDir\oi.wav")) { [ToneGenerator]::GenerateTone("$grimeDir\oi.wav", 300, 300) }
if (!(Test-Path "$grimeDir\skeng.wav")) { [ToneGenerator]::GenerateTone("$grimeDir\skeng.wav", 150, 400) }
if (!(Test-Path "$grimeDir\pullup.wav")) { [ToneGenerator]::GenerateTone("$grimeDir\pullup.wav", 250, 600) }
if (!(Test-Path "$grimeDir\kick.wav")) { [ToneGenerator]::GenerateTone("$grimeDir\kick.wav", 60, 200) }
if (!(Test-Path "$grimeDir\snare.wav")) { [ToneGenerator]::GenerateTone("$grimeDir\snare.wav", 200, 100) }
if (!(Test-Path "$grimeDir\hihat.wav")) { [ToneGenerator]::GenerateTone("$grimeDir\hihat.wav", 8000, 50) }
"@

try {
    Invoke-Expression $fallbackScript
    Write-Host "✅ Fallback samples generated" -ForegroundColor Green
}
catch {
    Write-Host "⚠️  Fallback generation failed - creating placeholder files" -ForegroundColor Yellow
    
    # Create minimal placeholder files
    $placeholderFiles = @(
        "$voxDir\ah_C4.mp3", "$voxDir\ah_G4.mp3", "$voxDir\oo_C5.mp3",
        "$grimeDir\brap.wav", "$grimeDir\oi.wav", "$grimeDir\skeng.wav", "$grimeDir\pullup.wav",
        "$grimeDir\kick.wav", "$grimeDir\snare.wav", "$grimeDir\hihat.wav"
    )
    
    foreach ($file in $placeholderFiles) {
        if (!(Test-Path $file)) {
            "PLACEHOLDER" | Out-File -FilePath $file -Encoding ASCII
        }
    }
}

Write-Host ""
Write-Host "🚀 Starting MusicMaker application..." -ForegroundColor Cyan

# Navigate to project directory and start the development server
Set-Location "C:\musicmaker"

# Install dependencies if needed
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "✨ Sample setup complete!" -ForegroundColor Green
Write-Host "🎵 Starting development server..." -ForegroundColor Green
Write-Host "🌐 Your musicmaker will open at: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""

# Start the development server
npm run dev
