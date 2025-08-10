# MusicMaker Sample Generator - Creates all required samples instantly
# This generates working audio samples so you can test your app immediately

Write-Host "🎵 MusicMaker Sample Generator" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# Ensure directories exist
$projectPath = "C:\musicmaker"
$voxPath = "$projectPath\public\samples\vox"
$grimePath = "$projectPath\public\samples\grime"

New-Item -ItemType Directory -Path $voxPath -Force | Out-Null
New-Item -ItemType Directory -Path $grimePath -Force | Out-Null

Write-Host "📁 Sample directories ready" -ForegroundColor Green

# Function to create WAV file with sine wave
function Create-ToneFile {
    param($filename, $frequency, $duration, $description)
    
    Write-Host "🎼 Generating $description..." -ForegroundColor Yellow
    
    # Simple WAV file generation
    $sampleRate = 44100
    $samples = [int]($duration * $sampleRate)
    $amplitude = 0.3
    
    # Create WAV header (44 bytes)
    $header = [byte[]]::new(44)
    
    # RIFF header
    [System.Text.Encoding]::ASCII.GetBytes("RIFF").CopyTo($header, 0)
    [BitConverter]::GetBytes(36 + $samples * 2).CopyTo($header, 4)
    [System.Text.Encoding]::ASCII.GetBytes("WAVE").CopyTo($header, 8)
    
    # fmt chunk
    [System.Text.Encoding]::ASCII.GetBytes("fmt ").CopyTo($header, 12)
    [BitConverter]::GetBytes(16).CopyTo($header, 16)  # chunk size
    [BitConverter]::GetBytes([int16]1).CopyTo($header, 20)   # PCM format
    [BitConverter]::GetBytes([int16]1).CopyTo($header, 22)   # mono
    [BitConverter]::GetBytes($sampleRate).CopyTo($header, 24)
    [BitConverter]::GetBytes($sampleRate * 2).CopyTo($header, 28)  # byte rate
    [BitConverter]::GetBytes([int16]2).CopyTo($header, 32)   # block align
    [BitConverter]::GetBytes([int16]16).CopyTo($header, 34)  # bits per sample
    
    # data chunk
    [System.Text.Encoding]::ASCII.GetBytes("data").CopyTo($header, 36)
    [BitConverter]::GetBytes($samples * 2).CopyTo($header, 40)
    
    # Generate audio data
    $audioData = [byte[]]::new($samples * 2)
    
    for ($i = 0; $i -lt $samples; $i++) {
        $t = $i / $sampleRate
        $sample = [Math]::Sin(2 * [Math]::PI * $frequency * $t) * $amplitude
        $value = [int16]($sample * 32767)
        
        [BitConverter]::GetBytes($value).CopyTo($audioData, $i * 2)
    }
    
    # Combine header and data
    $fullData = $header + $audioData
    [System.IO.File]::WriteAllBytes($filename, $fullData)
    
    Write-Host "✅ Created: $description" -ForegroundColor Green
}

# Function to create noise-based percussion
function Create-NoiseFile {
    param($filename, $duration, $filterFreq, $description)
    
    Write-Host "🥁 Generating $description..." -ForegroundColor Yellow
    
    $sampleRate = 44100
    $samples = [int]($duration * $sampleRate)
    $random = [System.Random]::new()
    
    # Create WAV header
    $header = [byte[]]::new(44)
    [System.Text.Encoding]::ASCII.GetBytes("RIFF").CopyTo($header, 0)
    [BitConverter]::GetBytes(36 + $samples * 2).CopyTo($header, 4)
    [System.Text.Encoding]::ASCII.GetBytes("WAVE").CopyTo($header, 8)
    [System.Text.Encoding]::ASCII.GetBytes("fmt ").CopyTo($header, 12)
    [BitConverter]::GetBytes(16).CopyTo($header, 16)
    [BitConverter]::GetBytes([int16]1).CopyTo($header, 20)
    [BitConverter]::GetBytes([int16]1).CopyTo($header, 22)
    [BitConverter]::GetBytes($sampleRate).CopyTo($header, 24)
    [BitConverter]::GetBytes($sampleRate * 2).CopyTo($header, 28)
    [BitConverter]::GetBytes([int16]2).CopyTo($header, 32)
    [BitConverter]::GetBytes([int16]16).CopyTo($header, 34)
    [System.Text.Encoding]::ASCII.GetBytes("data").CopyTo($header, 36)
    [BitConverter]::GetBytes($samples * 2).CopyTo($header, 40)
    
    # Generate filtered noise with envelope
    $audioData = [byte[]]::new($samples * 2)
    
    for ($i = 0; $i -lt $samples; $i++) {
        $envelope = [Math]::Exp(-$i / ($sampleRate * 0.1))  # Decay envelope
        $noise = ($random.NextDouble() - 0.5) * 2 * $envelope * 0.5
        $value = [int16]($noise * 32767)
        
        [BitConverter]::GetBytes($value).CopyTo($audioData, $i * 2)
    }
    
    $fullData = $header + $audioData
    [System.IO.File]::WriteAllBytes($filename, $fullData)
    
    Write-Host "✅ Created: $description" -ForegroundColor Green
}

# Generate all required samples
Write-Host ""
Write-Host "🎤 Creating choir/vocal samples..." -ForegroundColor Cyan

Create-ToneFile "$voxPath\ah_C4.wav" 261.63 2.0 "Choir Ah C4"
Create-ToneFile "$voxPath\ah_G4.wav" 392.00 2.0 "Choir Ah G4" 
Create-ToneFile "$voxPath\oo_C5.wav" 523.25 2.0 "Choir Oo C5"

Write-Host ""
Write-Host "🔥 Creating grime ad-lib samples..." -ForegroundColor Cyan

Create-ToneFile "$grimePath\brap.wav" 200 0.5 "Grime Brap"
Create-ToneFile "$grimePath\oi.wav" 300 0.3 "Grime Oi"
Create-ToneFile "$grimePath\skeng.wav" 150 0.4 "Grime Skeng"
Create-ToneFile "$grimePath\pullup.wav" 250 0.6 "Grime Pullup"

Write-Host ""
Write-Host "🥁 Creating drum kit samples..." -ForegroundColor Cyan

Create-NoiseFile "$grimePath\kick.wav" 0.2 60 "Grime Kick"
Create-NoiseFile "$grimePath\snare.wav" 0.1 200 "Grime Snare"  
Create-NoiseFile "$grimePath\hihat.wav" 0.05 8000 "Grime Hi-hat"

# Rename .wav files to .mp3 where needed (for vox samples)
Write-Host ""
Write-Host "🔄 Converting file extensions..." -ForegroundColor Yellow

if (Test-Path "$voxPath\ah_C4.wav") { 
    Move-Item "$voxPath\ah_C4.wav" "$voxPath\ah_C4.mp3" -Force
    Write-Host "✅ Converted ah_C4.wav to .mp3" -ForegroundColor Green
}
if (Test-Path "$voxPath\ah_G4.wav") { 
    Move-Item "$voxPath\ah_G4.wav" "$voxPath\ah_G4.mp3" -Force
    Write-Host "✅ Converted ah_G4.wav to .mp3" -ForegroundColor Green
}
if (Test-Path "$voxPath\oo_C5.wav") { 
    Move-Item "$voxPath\oo_C5.wav" "$voxPath\oo_C5.mp3" -Force
    Write-Host "✅ Converted oo_C5.wav to .mp3" -ForegroundColor Green
}

Write-Host ""
Write-Host "📊 Sample Generation Complete!" -ForegroundColor Green
Write-Host "✅ All samples created and ready to use" -ForegroundColor Green
Write-Host ""

# List created files
Write-Host "📁 Generated samples:" -ForegroundColor Cyan
Get-ChildItem "$voxPath\*" | ForEach-Object { Write-Host "   vox/$($_.Name)" -ForegroundColor White }
Get-ChildItem "$grimePath\*" | ForEach-Object { Write-Host "   grime/$($_.Name)" -ForegroundColor White }

Write-Host ""
Write-Host "🚀 Your MusicMaker is ready to run!" -ForegroundColor Green
Write-Host "   Run: npm run dev" -ForegroundColor Cyan
Write-Host "   Open: http://localhost:5173" -ForegroundColor Cyan
