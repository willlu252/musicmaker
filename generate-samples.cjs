// Simple HTML5 Audio Sample Generator
// This creates basic audio samples for testing your musicmaker

const fs = require('fs');
const path = require('path');

console.log('🎵 Creating audio samples for MusicMaker...');

// Create sample directories
const voxDir = 'public/samples/vox';
const grimeDir = 'public/samples/grime';

if (!fs.existsSync(voxDir)) fs.mkdirSync(voxDir, { recursive: true });
if (!fs.existsSync(grimeDir)) fs.mkdirSync(grimeDir, { recursive: true });

// Generate simple WAV files programmatically
function generateWAV(frequency, duration, filename) {
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    const amplitude = 0.3;
    
    // WAV header (44 bytes)
    const header = Buffer.alloc(44);
    
    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + samples * 2, 4);
    header.write('WAVE', 8);
    
    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);  // PCM
    header.writeUInt16LE(1, 22);  // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    
    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(samples * 2, 40);
    
    // Generate audio data
    const audioData = Buffer.alloc(samples * 2);
    
    for (let i = 0; i < samples; i++) {
        const t = i / sampleRate;
        const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
        const value = Math.round(sample * 32767);
        audioData.writeInt16LE(value, i * 2);
    }
    
    // Combine header and data
    const wavData = Buffer.concat([header, audioData]);
    fs.writeFileSync(filename, wavData);
    
    console.log(`✅ Created: ${path.basename(filename)}`);
}

// Generate noise-based percussion
function generateNoise(duration, filename) {
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate);
    
    // WAV header
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + samples * 2, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(samples * 2, 40);
    
    // Generate noise with decay envelope
    const audioData = Buffer.alloc(samples * 2);
    
    for (let i = 0; i < samples; i++) {
        const envelope = Math.exp(-i / (sampleRate * 0.1));
        const noise = (Math.random() - 0.5) * 2 * envelope * 0.5;
        const value = Math.round(noise * 32767);
        audioData.writeInt16LE(value, i * 2);
    }
    
    const wavData = Buffer.concat([header, audioData]);
    fs.writeFileSync(filename, wavData);
    
    console.log(`✅ Created: ${path.basename(filename)}`);
}

// Generate all required samples
console.log('\n🎤 Creating choir/vocal samples...');
generateWAV(261.63, 2.0, 'public/samples/vox/ah_C4.mp3');  // C4
generateWAV(392.00, 2.0, 'public/samples/vox/ah_G4.mp3');  // G4
generateWAV(523.25, 2.0, 'public/samples/vox/oo_C5.mp3');  // C5

console.log('\n🔥 Creating grime ad-lib samples...');
generateWAV(200, 0.5, 'public/samples/grime/brap.wav');
generateWAV(300, 0.3, 'public/samples/grime/oi.wav');
generateWAV(150, 0.4, 'public/samples/grime/skeng.wav');
generateWAV(250, 0.6, 'public/samples/grime/pullup.wav');

console.log('\n🥁 Creating drum kit samples...');
generateNoise(0.2, 'public/samples/grime/kick.wav');
generateNoise(0.1, 'public/samples/grime/snare.wav');
generateNoise(0.05, 'public/samples/grime/hihat.wav');

console.log('\n📊 Sample generation complete!');
console.log('✅ All samples created and ready to use');
console.log('\n🚀 Your MusicMaker is ready to run!');
console.log('   Run: npm run dev');
console.log('   Open: http://localhost:5173');
