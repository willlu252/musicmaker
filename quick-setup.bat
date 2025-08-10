@echo off
echo 🎵 MusicMaker Quick Setup - Auto Sample Download
echo ================================================
echo.

cd /d C:\musicmaker

echo 📁 Setting up sample directories...
if not exist "public\samples\vox" mkdir "public\samples\vox"
if not exist "public\samples\grime" mkdir "public\samples\grime"

echo 📦 Installing dependencies...
call npm install

echo 🎤 Downloading samples automatically...
powershell.exe -ExecutionPolicy Bypass -File "download-samples.ps1"

echo.
echo ✅ Setup complete!
echo 🚀 Starting MusicMaker...
echo 🌐 Open browser to: http://localhost:5173
echo.

call npm run dev

pause
