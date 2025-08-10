# Sample Download & Setup Guide for MusicMaker

## 🎵 Required Samples Structure:
```
public/samples/vox/
├── ah_C4.mp3    (Choir "ah" sound around C4 note)
├── ah_G4.mp3    (Choir "ah" sound around G4 note)
└── oo_C5.mp3    (Choir "oo" sound around C5 note)

public/samples/grime/
├── brap.wav     (UK grime ad-lib)
├── oi.wav       (UK grime ad-lib)
├── skeng.wav    (UK grime ad-lib)
├── pullup.wav   (UK grime ad-lib)
├── kick.wav     (Optional: grime-style kick)
├── snare.wav    (Optional: grime-style snare)
└── hihat.wav    (Optional: grime-style hi-hat)
```

## 📥 Download Sources & Instructions:

### 1. University of Iowa MIS (Choir Samples)
- Visit: https://theremin.music.uiowa.edu/MIS.html
- Look for vocal or choir instruments
- Download .aiff files and convert to .mp3
- Rename to match ah_C4.mp3, ah_G4.mp3, oo_C5.mp3

### 2. Cymatics Free Vault (Drum Samples)
- Visit: https://cymatics.fm/pages/free-download-vault
- Sign up for free account
- Download "Orchid Premium Sample Collection" (3GB)
- Download "Oracle" trap pack for 808s
- Extract and find suitable kick.wav, snare.wav, hihat.wav

### 3. Freesound (Grime Ad-libs)
- Visit: https://freesound.org
- Search terms: "brap", "oi", "skeng", "pullup", "grime adlib"
- Filter by: CC0 license (Creative Commons)
- Download short vocal snippets and rename appropriately

## 🛠️ Sample Preparation Tips:
- Prefer mono, 44.1kHz samples
- Trim silence from start/end
- Normalize to -1 dBFS
- Keep samples short (1-3 seconds for ad-libs)
- For choir samples, sustained vowels work best

## 🚀 Quick Start Alternative:
If you want to test the app immediately, create placeholder files:
- Any short audio files renamed to the required names
- Even using duplicate files temporarily will let you test the interface

## 🎹 Testing Your Setup:
1. Place samples in correct folders
2. Run: npm run dev
3. Open browser to localhost:5173
4. Test each sample trigger in the interface

## 📧 Need Help?
If any samples don't work or you need format conversion help, let me know!
