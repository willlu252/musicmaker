import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as Tone from 'tone'
import NeonVisualizer from './NeonVisualizer'

const STEPS = 16 as const
const INSTRUMENTS = [
  'kick','snare','hihat','bass','sub','lead','arp','pad','stab','vox','adlib','flute',
  'gabber','acid','hoover','scream','siren','crush','rage','saw303'
] as const
type InstrumentId = typeof INSTRUMENTS[number]

type Pattern = Record<InstrumentId, boolean[]>
type ActiveMap = Record<InstrumentId, boolean>
type DensityMap = Record<InstrumentId, number>
type VolMap = Record<InstrumentId, number>

type Vibe = {
  name: string
  desc: string
  bpm: number
  swing: number
  fx: { reverbWet: number; delayWet: number }
  active: ActiveMap
  volumes: VolMap
  pattern: Pattern
}

export default function NeonBeatLab(){
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(110)
  const [swing, setSwing] = useState(0.18)
  const [currentStep, setCurrentStep] = useState(-1)
  const [audioStarted, setAudioStarted] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [bassMode, setBassMode] = useState<'FatSaw'|'Donk'|'Acid303'|'Reese'|'Sub808'>('FatSaw')
  const [drumKit, setDrumKit] = useState<'Synth'|'Grime'>('Synth')
  const [ratchetHats, setRatchetHats] = useState(false)

  // Performance macros
  const [macroFilter, setMacroFilter] = useState(0.5) // 0..1 (lead HPF)
  const [macroBassDrive, setMacroBassDrive] = useState(0.3) // 0..1 distortion amount
  const [macroRevDecay, setMacroRevDecay] = useState(0.4) // 0..1 maps to seconds
  const [macroDelayTime, setMacroDelayTime] = useState(0.4) // 0..1 maps to seconds

  const MINOR_KEYS = ['C','D#','F','G','A#'] as const
  type MinorKey = typeof MINOR_KEYS[number]
  const [minorKey, setMinorKey] = useState<MinorKey>('C')

  const [reverbWet, setReverbWet] = useState(0.22)
  const [delayWet, setDelayWet] = useState(0.16)
  const [masterDb, setMasterDb] = useState(-6)

  const [active, setActive] = useState<ActiveMap>({
    kick: true, snare: true, hihat: true, bass: true, sub: true,
    lead: true, arp: true, pad: true, stab: false, vox: false, adlib: false, flute: false,
    gabber: false, acid: false, hoover: false, scream: false, siren: false, crush: false, rage: false, saw303: false,
  })

  const [volumes, setVolumes] = useState<VolMap>({
    kick: -8, snare: -10, hihat: -10, bass: -5, sub: -6,
    lead: -10, arp: -12, pad: -8, stab: -8, vox: -12, adlib: -10, flute: -6,
    gabber: -2, acid: -8, hoover: -6, scream: -8, siren: -10, crush: -6, rage: -4, saw303: -7,
  })

  const [density, setDensity] = useState<DensityMap>({
    kick: 0.35, snare: 0.25, hihat: 0.65, bass: 0.4, sub: 0.4,
    lead: 0.3, arp: 0.55, pad: 0.18, stab: 0.25, vox: 0.15, adlib: 0.1, flute: 0.2,
  })

  // Simple sample manager state (user-provided files via <input type="file">)
  const [voxUrls, setVoxUrls] = useState<{ C4?: string; G4?: string; C5?: string }>({})
  const [adlibUrls, setAdlibUrls] = useState<string[]>([])
  const [kitUrls, setKitUrls] = useState<{ kick?: string; snare?: string; hihat?: string }>({})
  const [voxReady, setVoxReady] = useState(false)

  const emptyRow = useMemo(() => new Array<boolean>(STEPS).fill(false), [])
  const emptyPattern = useMemo<Pattern>(() => ({
    kick: [...emptyRow], snare: [...emptyRow], hihat: [...emptyRow], bass: [...emptyRow], sub: [...emptyRow],
    lead: [...emptyRow], arp: [...emptyRow], pad: [...emptyRow], stab: [...emptyRow], vox: [...emptyRow], adlib: [...emptyRow], flute: [...emptyRow],
    gabber: [...emptyRow], acid: [...emptyRow], hoover: [...emptyRow], scream: [...emptyRow], siren: [...emptyRow], crush: [...emptyRow], rage: [...emptyRow], saw303: [...emptyRow]
  }), [emptyRow])
  const [pattern, setPattern] = useState<Pattern>({ ...emptyPattern })

  // Scenes: store up to 4 patterns and queue scene changes at bar boundaries
  const [scenes, setScenes] = useState<Array<Pattern | null>>([null, null, null, null])
  const [sceneIndex, setSceneIndex] = useState(0)
  const saveScene = (idx: number) => setScenes(s => { const c = [...s]; c[idx] = JSON.parse(JSON.stringify(patternRef.current)); return c })
  const loadScene = (idx: number) => { const p = scenes[idx]; if (p) { setPattern(JSON.parse(JSON.stringify(p))); setSceneIndex(idx) } }
  const queueSceneNextBar = (idx: number) => {
    if (!isPlaying) { loadScene(idx); return }
    Tone.Transport.scheduleOnce(() => loadScene(idx), '+1m')
  }

  const patternRef = useRef(pattern); useEffect(()=>{ patternRef.current = pattern }, [pattern])
  const activeRef = useRef(active); useEffect(()=>{ activeRef.current = active }, [active])
  const keyRef = useRef(minorKey); useEffect(()=>{ keyRef.current = minorKey }, [minorKey])

  const masterVol = useRef<Tone.Volume | null>(null)
  const eq3 = useRef<Tone.EQ3 | null>(null)
  const comp = useRef<Tone.Compressor | null>(null)
  const limiter = useRef<Tone.Limiter | null>(null)
  const recorder = useRef<Tone.Recorder | null>(null)
  const fx = useRef({ reverb: null as Tone.Reverb | null, delay: null as Tone.FeedbackDelay | null, chorus: null as Tone.Chorus | null, bit: null as Tone.BitCrusher | null })
  const buses = useRef<{ music: Tone.Gain | null }>({ music: null })
  const synths = useRef<{ [K in InstrumentId]?: any }>({})
  const seq = useRef<Tone.Sequence | null>(null)
  // Node refs for macros
  const leadHpFilter = useRef<Tone.Filter | null>(null)
  const bassMacroDrive = useRef<Tone.Distortion | null>(null)

  useEffect(()=>{
    try{
      const raw = localStorage.getItem('neonBeatLab:v3')
      if(raw){ const s = JSON.parse(raw); if(s.pattern) setPattern(s.pattern); if(s.active) setActive(s.active); if(s.bpm) setBpm(s.bpm); if(s.minorKey) setMinorKey(s.minorKey); if(typeof s.swing==='number') setSwing(s.swing); if(typeof s.reverbWet==='number') setReverbWet(s.reverbWet); if(typeof s.delayWet==='number') setDelayWet(s.delayWet); if(s.volumes) setVolumes(s.volumes) }
    }catch{}
    return ()=> teardown()
  },[])
  useEffect(()=>{ try{ localStorage.setItem('neonBeatLab:v3', JSON.stringify({ pattern: patternRef.current, active: activeRef.current, bpm, swing, minorKey, reverbWet, delayWet, volumes })) }catch{} }, [pattern, active, bpm, swing, minorKey, reverbWet, delayWet, volumes])

  const startAudio = async () => {
    if (audioStarted) return true
    // Tone.start() is now called in handlePlay to ensure proper user gesture
    masterVol.current = new Tone.Volume(masterDb)
    eq3.current = new Tone.EQ3({ low: 3, mid: -1, high: 1 })
    comp.current = new Tone.Compressor({ threshold: -18, ratio: 2.5, attack: 0.01, release: 0.2 })
    limiter.current = new Tone.Limiter(-1)
    recorder.current = new Tone.Recorder()
    masterVol.current.chain(eq3.current, comp.current, limiter.current, Tone.Destination)
    limiter.current.connect(recorder.current)
    buses.current.music = new Tone.Gain(1).connect(masterVol.current)

    fx.current.reverb = new Tone.Reverb({ decay: 3.0, wet: reverbWet })
    fx.current.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.28, wet: delayWet })
    fx.current.chorus = new Tone.Chorus({ frequency: 0.8, delayTime: 4, depth: 0.6, spread: 180 }).start()
    fx.current.bit = new Tone.BitCrusher({ bits: 6 })

    // Drums (both kits available; we'll choose at trigger time) - PUNCHIER KICK
    synths.current.kick = new Tone.MembraneSynth({ 
      pitchDecay: 0.008, // Faster pitch drop for more punch
      octaves: 8,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.5 },
      volume: volumes.kick 
    })
    // Add distortion and compression for extra punch
    const kickDist = new Tone.Distortion(0.4)
    const kickComp = new Tone.Compressor({ threshold: -12, ratio: 8, attack: 0.001, release: 0.1 })
    synths.current.kick.chain(kickDist, kickComp, masterVol.current)
    synths.current.snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0 }, volume: volumes.snare }); synths.current.snare.chain(fx.current.bit!, masterVol.current)
    synths.current.hihat = new Tone.MetalSynth({ frequency: 250, envelope: { attack: 0.001, decay: 0.07, release: 0.01 }, harmonicity: 3.1, modulationIndex: 16, resonance: 4000, octaves: 0.5, volume: volumes.hihat }).connect(masterVol.current)
    // Grime kit samples (optional presence or uploaded)
    const kickPath = kitUrls.kick ?? '/samples/grime/kick.wav'
    const snarePath = kitUrls.snare ?? '/samples/grime/snare.wav'
    const hatPath = kitUrls.hihat ?? '/samples/grime/hihat.wav'
    synths.current.kickS = new Tone.Player({ url: kickPath, volume: volumes.kick }).connect(masterVol.current)
    synths.current.snareS = new Tone.Player({ url: snarePath, volume: volumes.snare }).connect(masterVol.current)
    synths.current.hihatS = new Tone.Player({ url: hatPath, volume: volumes.hihat }).connect(masterVol.current)

    const makeBass = (mode: typeof bassMode) => {
      if (synths.current.bass) synths.current.bass.dispose?.()
      switch(mode){
        case 'Donk':
          synths.current.bass = new Tone.FMSynth({ modulationIndex: 10, envelope: { attack: 0.005, decay: 0.12, sustain: 0.2, release: 0.2 } }).chain(new Tone.Distortion(0.3), new Tone.EQ3({ low: 3, high: -2 }), buses.current.music)
          break
        case 'Acid303':
          synths.current.bass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { Q: 12, type: 'lowpass' }, envelope: { attack: 0.01, decay: 0.18, sustain: 0.3, release: 0.2 }, filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.0, baseFrequency: 100, octaves: 2.5 } }).chain(new Tone.AutoFilter({ frequency: 8, depth: 0.4 }).start(), new Tone.Distortion(0.6), buses.current.music)
          break
        case 'Reese':
          const a = new Tone.MonoSynth({ oscillator: { type: 'fatsawtooth', count: 8, spread: 50 }})
          synths.current.bass = a; a.chain(new Tone.Chorus({ frequency: 0.6, depth: 0.8 }).start(), new Tone.EQ3({ low: 4, high: -3 }), buses.current.music)
          break
        case 'Sub808':
          synths.current.bass = new Tone.MonoSynth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.4, sustain: 0.9, release: 0.5 } }).chain(new Tone.Distortion(0.2), buses.current.music)
          break
        default:
          synths.current.bass = new Tone.MonoSynth({ oscillator: { type: 'fatsawtooth', count: 5, spread: 24 }, filter: { Q: 1.1, type: 'lowpass' }, envelope: { attack: 0.01, decay: 0.22, sustain: 0.45, release: 0.35 }, filterEnvelope: { attack: 0.005, decay: 0.08, sustain: 0.6, release: 0.25, baseFrequency: 140, octaves: 2.4 } }).chain(new Tone.Distortion({ distortion: 0.34, wet: 0.42 }), new Tone.EQ3({ low: 2, high: -1 }), buses.current.music)
      }
      // Ensure macro drive in chain
      bassMacroDrive.current = new Tone.Distortion(macroBassDrive)
      synths.current.bass.connect(bassMacroDrive.current)
      bassMacroDrive.current.connect(buses.current.music)
      synths.current.bass.volume.value = volumes.bass
    }
    makeBass(bassMode)

    const subLowpass = new Tone.Filter(120, 'lowpass')
    synths.current.sub = new Tone.MonoSynth({ oscillator: { type: 'sine' }, filter: { type: 'lowpass' }, envelope: { attack: 0.005, decay: 0.18, sustain: 0.9, release: 0.25 }, volume: volumes.sub })
    synths.current.sub.chain(subLowpass, buses.current.music)

    const hpLead = new Tone.Filter(250, 'highpass')
    leadHpFilter.current = hpLead
    synths.current.lead = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 6, spread: 40 }, envelope: { attack: 0.02, decay: 0.12, sustain: 0.35, release: 0.35 }, volume: volumes.lead })
    synths.current.lead.chain(hpLead, fx.current.delay!, fx.current.reverb!, fx.current.chorus!, buses.current.music)

    const hpArp = new Tone.Filter(300, 'highpass')
    synths.current.arp = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 4, spread: 30 }, envelope: { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.2 }, volume: volumes.arp })
    synths.current.arp.chain(hpArp, fx.current.delay!, fx.current.reverb!, buses.current.music)

    const hpStab = new Tone.Filter(220, 'highpass')
    synths.current.stab = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.005, decay: 0.15, sustain: 0.15, release: 0.25 }, volume: volumes.stab })
    synths.current.stab.chain(hpStab, fx.current.reverb!, buses.current.music)

    synths.current.pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.6, decay: 0.6, sustain: 0.85, release: 2.2 }, volume: volumes.pad })
    synths.current.pad.chain(fx.current.reverb!, fx.current.chorus!, buses.current.music)

    // Flute (simple synth - removed problematic noise generator)
    synths.current.flute = new Tone.PolySynth(Tone.Synth, { 
      oscillator: { type: 'sine' }, 
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.8 }, 
      volume: volumes.flute 
    })
    synths.current.flute.chain(
      new Tone.Filter(2000, 'highpass'),
      new Tone.Reverb({ decay: 2.5, wet: 0.3 }),
      buses.current.music
    )

    // Opera/Choir sampler (fallback to synth if samples are missing)
    const voxC4 = voxUrls.C4 ?? '/samples/vox/ah_C4.mp3'
    const voxG4 = voxUrls.G4 ?? '/samples/vox/ah_G4.mp3'
    const voxC5 = voxUrls.C5 ?? '/samples/vox/oo_C5.mp3'
    let voxLoaded = false
    const voxSampler = new Tone.Sampler({ urls: { C4: voxC4, G4: voxG4, C5: voxC5 }, release: 1.5, volume: volumes.vox, onload: () => { voxLoaded = true; setVoxReady(true) } })
    synths.current.vox = voxSampler
    voxSampler.chain(new Tone.PitchShift({ pitch: 0, wet: 0.2 }), fx.current.reverb!, buses.current.music)
    // Fallback to synthetic choir if samples fail to load within 2.5s
    setTimeout(() => {
      if (!voxLoaded) {
        try { voxSampler.dispose() } catch {}
        const vib = new Tone.Vibrato(5, 0.2).start()
        const form = new Tone.Filter(1200, 'bandpass')
        const voxSynth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.05, decay: 0.2, sustain: 0.9, release: 1.2 }})
        synths.current.vox = voxSynth
        voxSynth.chain(vib, form, fx.current.reverb!, buses.current.music)
        setVoxReady(true)
      }
    }, 2500)

    // Ad-libs pool
    const defaultAdlibs = {
      brap: '/samples/grime/brap.wav',
      oi: '/samples/grime/oi.wav',
      skeng: '/samples/grime/skeng.wav',
      pullup: '/samples/grime/pullup.wav',
    }
    const urls: Record<string,string> = {}
    if(adlibUrls.length){ adlibUrls.forEach((u,i)=> urls[`u${i}`]=u) } else { Object.assign(urls, defaultAdlibs) }
    synths.current.adlib = new Tone.Players({ urls, volume: volumes.adlib }).connect(masterVol.current)

    // HARD RAVE SOUNDS
    // Gabber kick - ultra distorted 909 style
    synths.current.gabber = new Tone.MembraneSynth({
      pitchDecay: 0.001,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.5, sustain: 0.0, release: 0.1 },
      volume: volumes.gabber
    })
    const gabberDist = new Tone.Distortion(0.95) // Extreme distortion
    const gabberClip = new Tone.Chebyshev(50) // Wave shaping for hardness
    synths.current.gabber.chain(gabberDist, gabberClip, masterVol.current)

    // Acid 303 - classic TB-303 sound
    synths.current.acid = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { 
        Q: 18, // High resonance
        type: 'lowpass',
        rolloff: -24
      },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.2 },
      filterEnvelope: { 
        attack: 0.001, 
        decay: 0.2, 
        sustain: 0.1,
        release: 0.2,
        baseFrequency: 60,
        octaves: 4
      },
      volume: volumes.acid
    })
    const acidDist = new Tone.Distortion(0.8)
    const acidDelay = new Tone.PingPongDelay('16n', 0.3)
    synths.current.acid.chain(acidDist, acidDelay, buses.current.music)

    // Hoover - classic rave hoover sound
    synths.current.hoover = new Tone.PolySynth(Tone.Synth, {
      oscillator: { 
        type: 'sawtooth',
        count: 7, // Detuned saws for thickness
        spread: 40
      },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.4 },
      volume: volumes.hoover
    })
    const hooverChorus = new Tone.Chorus(4, 2.5, 0.5).start()
    const hooverPhaser = new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 350 })
    synths.current.hoover.chain(hooverChorus, hooverPhaser, fx.current.reverb!, buses.current.music)

    // Scream - aggressive vocal-like synth
    synths.current.scream = new Tone.MonoSynth({
      oscillator: { type: 'pwm', modulationFrequency: 2 },
      filter: { Q: 6, type: 'bandpass', frequency: 2000 },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.3 },
      filterEnvelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
        baseFrequency: 800,
        octaves: 2.5
      },
      volume: volumes.scream
    })
    const screamDist = new Tone.Distortion(0.7)
    const screamBit = new Tone.BitCrusher(4)
    synths.current.scream.chain(screamDist, screamBit, fx.current.reverb!, buses.current.music)

    // Siren - police/alarm siren effect
    synths.current.siren = new Tone.Oscillator({
      type: 'sine',
      frequency: 440,
      volume: volumes.siren
    })
    const sirenLFO = new Tone.LFO(2, 400, 800) // Modulate between 400-800 Hz
    sirenLFO.connect(synths.current.siren.frequency)
    sirenLFO.start()
    const sirenDelay = new Tone.FeedbackDelay('8n', 0.5)
    synths.current.siren.chain(sirenDelay, buses.current.music)

    // Crush - heavily bit-crushed synth
    synths.current.crush = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0.2, release: 0.1 },
      volume: volumes.crush
    })
    const crushBit = new Tone.BitCrusher(2) // Extreme bit crushing
    const crushDist = new Tone.Distortion(0.9)
    const crushFilter = new Tone.Filter(1000, 'lowpass')
    synths.current.crush.chain(crushBit, crushDist, crushFilter, buses.current.music)

    // Rage - aggressive distorted lead
    synths.current.rage = new Tone.MonoSynth({
      oscillator: { 
        type: 'fatsawtooth',
        count: 3,
        spread: 30
      },
      filter: { Q: 2, type: 'lowpass' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.6, release: 0.3 },
      filterEnvelope: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
        baseFrequency: 200,
        octaves: 3
      },
      volume: volumes.rage
    })
    const rageDist = new Tone.Distortion(0.8)
    const rageComp = new Tone.Compressor({ threshold: -20, ratio: 10 })
    const rageTrem = new Tone.Tremolo(8, 0.5).start()
    synths.current.rage.chain(rageDist, rageComp, rageTrem, buses.current.music)

    // SAW303 - another acid variant with different character
    synths.current.saw303 = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { 
        Q: 15,
        type: 'lowpass',
        rolloff: -12
      },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.5 },
      filterEnvelope: {
        attack: 0.001,
        decay: 0.4,
        sustain: 0.2,
        release: 0.3,
        baseFrequency: 100,
        octaves: 3.5
      },
      volume: volumes.saw303
    })
    const saw303Auto = new Tone.AutoFilter(4, 100, 4).start()
    const saw303Dist = new Tone.Distortion(0.6)
    synths.current.saw303.chain(saw303Auto, saw303Dist, buses.current.music)

    Tone.Transport.bpm.value = bpm
    Tone.Transport.swing = swing
    Tone.Transport.swingSubdivision = '8n'

    setAudioStarted(true)
    return true
  }

  const teardown = () => {
    try{
      if(seq.current){ seq.current.stop(); seq.current.dispose(); seq.current = null }
      Tone.Transport.stop(); Tone.Transport.cancel()
      Object.values(synths.current).forEach(n => n?.dispose?.())
      Object.values(fx.current).forEach((n:any) => n?.dispose?.())
      buses.current.music?.dispose?.(); comp.current?.dispose?.(); eq3.current?.dispose?.(); limiter.current?.dispose?.(); masterVol.current?.dispose?.(); recorder.current = null
    }catch{}
  }

  useEffect(()=>{ if(audioStarted) Tone.Transport.bpm.rampTo(bpm, 0.05) }, [bpm, audioStarted])
  useEffect(()=>{ if(audioStarted){ Tone.Transport.swing = swing; Tone.Transport.swingSubdivision = '8n' } }, [swing, audioStarted])
  useEffect(()=>{ if(audioStarted && fx.current.reverb) fx.current.reverb.wet.rampTo(reverbWet, 0.1) }, [reverbWet, audioStarted])
  useEffect(()=>{ if(audioStarted && fx.current.delay) fx.current.delay.wet.rampTo(delayWet, 0.1) }, [delayWet, audioStarted])
  useEffect(()=>{ if(audioStarted) masterVol.current?.volume?.rampTo(masterDb, 0.05) }, [masterDb, audioStarted])
  useEffect(()=>{ 
    if(audioStarted){ 
      for(const k of INSTRUMENTS){ 
        if(synths.current[k] && synths.current[k].volume) {
          synths.current[k].volume.value = (volumes as any)[k]
        }
      } 
    } 
  }, [volumes, audioStarted])
  // Macros mapping
  useEffect(()=>{ if(audioStarted && leadHpFilter.current){ const min=150, max=1200; leadHpFilter.current.frequency.rampTo(min + (max-min)*macroFilter, 0.1) } }, [macroFilter, audioStarted])
  useEffect(()=>{ if(audioStarted && bassMacroDrive.current){ bassMacroDrive.current.distortion = Math.max(0, Math.min(1, macroBassDrive)) } }, [macroBassDrive, audioStarted])
  useEffect(()=>{ if(audioStarted && fx.current.reverb){ const min=1.5, max=6.0; fx.current.reverb.set({ decay: min + (max-min)*macroRevDecay }) } }, [macroRevDecay, audioStarted])
  useEffect(()=>{ if(audioStarted && fx.current.delay){ const min=0.08, max=0.45; fx.current.delay.delayTime.rampTo(min + (max-min)*macroDelayTime, 0.1) } }, [macroDelayTime, audioStarted])
  // Rebuild bass on mode change
  useEffect(()=>{ if(!audioStarted) return; try{ if(synths.current.bass){ synths.current.bass.dispose?.() } // simple rebuild similar to start
    switch(bassMode){
      case 'Donk':
        synths.current.bass = new Tone.FMSynth({ modulationIndex: 10, envelope: { attack: 0.005, decay: 0.12, sustain: 0.2, release: 0.2 } })
        break
      case 'Acid303':
        synths.current.bass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { Q: 12, type: 'lowpass' }, envelope: { attack: 0.01, decay: 0.18, sustain: 0.3, release: 0.2 }, filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.0, baseFrequency: 100, octaves: 2.5 } }).chain(new Tone.AutoFilter({ frequency: 8, depth: 0.4 }).start())
        break
      case 'Reese':
        synths.current.bass = new Tone.MonoSynth({ oscillator: { type: 'fatsawtooth', count: 8, spread: 50 }})
        break
      case 'Sub808':
        synths.current.bass = new Tone.MonoSynth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.4, sustain: 0.9, release: 0.5 } })
        break
      default:
        synths.current.bass = new Tone.MonoSynth({ oscillator: { type: 'fatsawtooth', count: 5, spread: 24 }, filter: { Q: 1.1, type: 'lowpass' }, envelope: { attack: 0.01, decay: 0.22, sustain: 0.45, release: 0.35 }, filterEnvelope: { attack: 0.005, decay: 0.08, sustain: 0.6, release: 0.25, baseFrequency: 140, octaves: 2.4 } })
    }
    bassMacroDrive.current = new Tone.Distortion(macroBassDrive)
    synths.current.bass.connect(bassMacroDrive.current)
    bassMacroDrive.current.connect(buses.current.music)
    synths.current.bass.volume.value = volumes.bass
  }catch{} }, [bassMode, audioStarted])

  const rootToSemisFromC: Record<MinorKey, number> = { C: 0, 'D#': 3, F: 5, G: 7, 'A#': 10 }
  const t = (note: string, semis: number) => Tone.Frequency(note).transpose(semis).toNote()
  const baseBass = ['C2','C2','D#2','F2','G2','A#2','C3','D#3']
  const baseLead = ['C4','D#4','F4','G4','A#4','C5','D#5','F5']
  const basePadChords = [ ['C3','D#3','G3'], ['G#2','C3','D#3'], ['A#2','D3','F3'], ['D#3','G3','A#3'] ]
  const getBassScale = (key: MinorKey) => baseBass.map(n => t(n, rootToSemisFromC[key]))
  const getLeadScale = (key: MinorKey) => baseLead.map(n => t(n, rootToSemisFromC[key]))
  const getPadChords = (key: MinorKey) => basePadChords.map(ch => ch.map(n => t(n, rootToSemisFromC[key])))

  const schedule = () => {
    if (seq.current) { seq.current.stop(); seq.current.dispose(); seq.current = null }
    seq.current = new Tone.Sequence((time, step) => {
      Tone.Draw.schedule(()=> setCurrentStep(step), time)
      const patt = patternRef.current
      const on = activeRef.current
      // Drum triggering respects kit
      if(on.kick && patt.kick[step]){
        if(drumKit==='Grime' && synths.current.kickS?._buffer){ synths.current.kickS.start(time) }
        else synths.current.kick.triggerAttackRelease('C1','8n',time)
        if(buses.current.music){ const g = buses.current.music.gain; const now = time as any; g.cancelAndHoldAtTime(now); g.setValueAtTime(0.75, now); g.linearRampToValueAtTime(1, (now as number) + 0.24) }
      }
      if(on.snare && patt.snare[step]){
        if(drumKit==='Grime' && synths.current.snareS?._buffer){ synths.current.snareS.start(time) }
        else synths.current.snare.triggerAttackRelease('8n', time)
      }
      if(on.hihat && patt.hihat[step]){
        if(drumKit==='Grime' && synths.current.hihatS?._buffer){ synths.current.hihatS.start(time) }
        else { 
          synths.current.hihat.triggerAttack(time)
          synths.current.hihat.triggerRelease(time + 0.05)
        }
        if(ratchetHats){ // quick double on hats
          const t1 = (Tone.Time('16n').toSeconds() / 3)
          if(drumKit==='Grime' && synths.current.hihatS?._buffer){ synths.current.hihatS.start(time + t1); synths.current.hihatS.start(time + 2*t1) }
          else { 
            synths.current.hihat.triggerAttack(time + t1)
            synths.current.hihat.triggerRelease(time + t1 + 0.02)
            synths.current.hihat.triggerAttack(time + 2*t1)
            synths.current.hihat.triggerRelease(time + 2*t1 + 0.02)
          }
        }
      }
      const k = keyRef.current
      if(on.bass && patt.bass[step]){ const note = getBassScale(k)[step % 8]; synths.current.bass.triggerAttackRelease(note,'8n',time) }
      if(on.sub && patt.sub[step]){ const note = getBassScale(k)[step % 8]; synths.current.sub.triggerAttackRelease(Tone.Frequency(note).transpose(-12).toNote(),'8n',time) }
      if(on.lead && patt.lead[step]){ const note = getLeadScale(k)[step % 8]; synths.current.lead.triggerAttackRelease(note,'16n',time) }
      if(on.arp && patt.arp[step]){ const note = getLeadScale(k)[(step*3)%8]; synths.current.arp.triggerAttackRelease(note,'16n',time) }
      if(on.flute && patt.flute[step]){ const note = getLeadScale(k)[(step*2)%8]; synths.current.flute.triggerAttackRelease(Tone.Frequency(note).transpose(12).toNote(),'16n',time) }
      if(on.pad && patt.pad[step]){ const chord = getPadChords(k)[Math.floor(step/4)%4]; synths.current.pad.triggerAttackRelease(chord,'2n',time) }
      if(on.stab && patt.stab[step]){ const chord = getPadChords(k)[0]; synths.current.stab.triggerAttackRelease(chord.map(n=>Tone.Frequency(n).transpose(12).toNote()),'8n',time) }
      if(on.vox && patt.vox[step]){ const chord = getPadChords(k)[Math.floor(step/4)%4]; chord.forEach(n => synths.current.vox.triggerAttackRelease(Tone.Frequency(n).transpose(12).toNote(),'4n',time,0.6)) }
      if(on.adlib && patt.adlib[step]){ const keys = ['brap','oi','skeng','pullup'] as const; const key = keys[Math.floor(Math.random()*keys.length)]; (synths.current.adlib.get(key) as Tone.Player).start(time) }
      // HARD RAVE SOUNDS TRIGGERS
      if(on.gabber && patt.gabber[step]){ synths.current.gabber.triggerAttackRelease('C1','8n',time) }
      if(on.acid && patt.acid[step]){ const note = getBassScale(k)[(step*2)%8]; synths.current.acid.triggerAttackRelease(note,'16n',time) }
      if(on.hoover && patt.hoover[step]){ const chord = getPadChords(k)[Math.floor(step/2)%4]; synths.current.hoover.triggerAttackRelease(chord,'8n',time) }
      if(on.scream && patt.scream[step]){ const note = getLeadScale(k)[step%8]; synths.current.scream.triggerAttackRelease(Tone.Frequency(note).transpose(12).toNote(),'8n',time) }
      if(on.siren && patt.siren[step]){ 
        if(!synths.current.siren.state || synths.current.siren.state === 'stopped') {
          synths.current.siren.start(time)
          synths.current.siren.stop(time + Tone.Time('4n').toSeconds())
        }
      }
      if(on.crush && patt.crush[step]){ const chord = getPadChords(k)[0]; synths.current.crush.triggerAttackRelease(chord.map(n=>Tone.Frequency(n).transpose(-12).toNote()),'16n',time) }
      if(on.rage && patt.rage[step]){ const note = getLeadScale(k)[(step*3)%8]; synths.current.rage.triggerAttackRelease(note,'16n',time) }
      if(on.saw303 && patt.saw303[step]){ const note = getBassScale(k)[(step+4)%8]; synths.current.saw303.triggerAttackRelease(note,'16n',time) }
    }, [...Array(STEPS).keys()], '16n')
    seq.current.start(0)
  }

  const handlePlay = async () => {
    // Ensure audio context is started properly with user gesture
    if (!audioStarted) {
      await Tone.start()
    }
    await startAudio()
    if(!isPlaying){ Tone.Transport.stop(); Tone.Transport.cancel(); Tone.Transport.position = 0; schedule(); Tone.Transport.start(); setIsPlaying(true) }
    else { if(seq.current){ seq.current.stop(); seq.current.dispose(); seq.current = null } Tone.Transport.pause(); setIsPlaying(false); setCurrentStep(-1) }
  }

  const toggleStep = (lane: InstrumentId, step: number) => setPattern(p => ({ ...p, [lane]: p[lane].map((v,i)=>(i===step?!v:v)) }))
  const clearLane = (lane: InstrumentId) => setPattern(p => ({ ...p, [lane]: p[lane].map(()=>false) }))
  const randomiseLane = (lane: InstrumentId) => { const d = Math.max(0, Math.min(1, density[lane] ?? 0.3)); const arr = Array.from({ length: STEPS }, () => Math.random() < d); setPattern(p => ({ ...p, [lane]: arr })) }
  const clearAll = () => setPattern({ ...emptyPattern })

  const HATS_16TH = useMemo(()=>{ const r = new Array(Number(STEPS)).fill(false); [1,2,3,5,6,7,9,10,11,13,14,15].forEach(i=>r[i]=true); return r },[])
  const HATS_DRIVE = useMemo(()=> new Array(Number(STEPS)).fill(true).map((_,i)=>!(i%4===0)), [])
  const makeRow = (...steps: number[]) => { const r = new Array(Number(STEPS)).fill(false); steps.forEach(i=>r[i]=true); return r }

  // Mixer blocks (genre components) — lightweight combinators per lane
  const HATS_TRIPLET = useMemo(()=>{ const r = new Array(Number(STEPS)).fill(false); [0,2,3,6,8,10,11,14].forEach(i=>r[i]=true); return r }, [])
  const Blocks = useMemo(()=>({
    kick: {
      Off: new Array(Number(STEPS)).fill(false),
      FourOnFloor: makeRow(0,4,8,12),
      GrimeSync: makeRow(0,7,8,11,12,15),
      Sparse: makeRow(0,8),
    },
    snare: {
      Off: new Array(Number(STEPS)).fill(false),
      Backbeat: makeRow(4,12),
      GrimeThwack: makeRow(12),
      Offbeat: makeRow(2,10),
    },
    hihat: {
      Off: new Array(Number(STEPS)).fill(false),
      Hats16th: HATS_16TH,
      Drive: HATS_DRIVE,
      Triplet: HATS_TRIPLET,
    },
    bass: {
      Off: new Array(Number(STEPS)).fill(false),
      Octave: makeRow(0,4,8,12),
      Drive8th: makeRow(0,2,4,6,8,10,12,14),
      Syncopate: makeRow(0,3,6,9,12,15),
    },
    sub: {
      Off: new Array(Number(STEPS)).fill(false),
      Anchor: makeRow(0,8),
      Floor: makeRow(0,4,8,12),
    },
    pad: {
      Off: new Array(Number(STEPS)).fill(false),
      HoldBars: makeRow(0,4,8,12),
      Long: makeRow(0,8),
    },
    arp: {
      Off: new Array(Number(STEPS)).fill(false),
      Up16th: makeRow(1,3,5,7,9,11,13,15),
      Sparkle: makeRow(2,6,10,14),
    },
    lead: {
      Off: new Array(Number(STEPS)).fill(false),
      Sparse: makeRow(6,14),
      Call: makeRow(2,8,12),
    },
    stab: {
      Off: new Array(Number(STEPS)).fill(false),
      Hits: makeRow(7,15),
    },
    vox: {
      Off: new Array(Number(STEPS)).fill(false),
      Flourish: makeRow(6,14),
    },
    adlib: {
      Off: new Array(Number(STEPS)).fill(false),
      Shouts: makeRow(5,13),
    },
    flute: {
      Off: new Array(Number(STEPS)).fill(false),
      Melody: makeRow(1,5,9,13),
      Sparse: makeRow(4,12),
    },
    // HARD RAVE BLOCKS
    gabber: {
      Off: new Array(Number(STEPS)).fill(false),
      Hardcore: makeRow(0,2,4,6,8,10,12,14), // Every 8th note
      Thunderdome: makeRow(0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15), // 16th notes madness
      Stomp: makeRow(0,4,8,12),
    },
    acid: {
      Off: new Array(Number(STEPS)).fill(false),
      TB303: makeRow(0,2,5,8,10,13),
      Squelch: makeRow(0,3,4,7,8,11,12,15),
      Rolling: makeRow(0,1,2,4,5,6,8,9,10,12,13,14),
    },
    hoover: {
      Off: new Array(Number(STEPS)).fill(false),
      Classic: makeRow(0,8),
      Rave: makeRow(0,4,8,12),
      Anthem: makeRow(0,2,4,6,8,10,12,14),
    },
    scream: {
      Off: new Array(Number(STEPS)).fill(false),
      Terror: makeRow(7,15),
      Mayhem: makeRow(3,7,11,15),
      Chaos: makeRow(1,5,7,9,13,15),
    },
    siren: {
      Off: new Array(Number(STEPS)).fill(false),
      Alert: makeRow(0),
      Police: makeRow(0,8),
      Alarm: makeRow(0,4,8,12),
    },
    crush: {
      Off: new Array(Number(STEPS)).fill(false),
      Digital: makeRow(2,6,10,14),
      Glitch: makeRow(1,3,5,7,9,11,13,15),
      Destroy: makeRow(0,2,3,5,6,8,10,11,13,14),
    },
    rage: {
      Off: new Array(Number(STEPS)).fill(false),
      Lead: makeRow(6,14),
      Assault: makeRow(2,6,10,14),
      Fury: makeRow(0,3,6,9,12,15),
    },
    saw303: {
      Off: new Array(Number(STEPS)).fill(false),
      Acid: makeRow(0,3,6,9,12,15),
      Filter: makeRow(1,4,7,10,13),
      Sweep: makeRow(0,2,4,5,8,10,12,13),
    },
  }), [HATS_16TH, HATS_DRIVE, HATS_TRIPLET])

  type MixerState = {
    kick: keyof typeof Blocks.kick
    snare: keyof typeof Blocks.snare
    hihat: keyof typeof Blocks.hihat
    bass: keyof typeof Blocks.bass
    sub: keyof typeof Blocks.sub
    pad: keyof typeof Blocks.pad
    arp: keyof typeof Blocks.arp
    lead: keyof typeof Blocks.lead
    stab: keyof typeof Blocks.stab
    vox: keyof typeof Blocks.vox
    adlib: keyof typeof Blocks.adlib
    flute: keyof typeof Blocks.flute
    gabber: keyof typeof Blocks.gabber
    acid: keyof typeof Blocks.acid
    hoover: keyof typeof Blocks.hoover
    scream: keyof typeof Blocks.scream
    siren: keyof typeof Blocks.siren
    crush: keyof typeof Blocks.crush
    rage: keyof typeof Blocks.rage
    saw303: keyof typeof Blocks.saw303
  }
  const [mixer, setMixer] = useState<MixerState>({
    kick: 'FourOnFloor', snare: 'Backbeat', hihat: 'Hats16th',
    bass: 'Octave', sub: 'Anchor', pad: 'HoldBars', arp: 'Off', lead: 'Sparse', stab: 'Off', vox: 'Off', adlib: 'Off', flute: 'Off',
    gabber: 'Off', acid: 'Off', hoover: 'Off', scream: 'Off', siren: 'Off', crush: 'Off', rage: 'Off', saw303: 'Off'
  })

  const applyMixer = () => {
    const next: Partial<Pattern> = {
      kick: Blocks.kick[mixer.kick], snare: Blocks.snare[mixer.snare], hihat: Blocks.hihat[mixer.hihat],
      bass: Blocks.bass[mixer.bass], sub: Blocks.sub[mixer.sub], pad: Blocks.pad[mixer.pad],
      arp: Blocks.arp[mixer.arp], lead: Blocks.lead[mixer.lead], stab: Blocks.stab[mixer.stab],
      vox: Blocks.vox[mixer.vox], adlib: Blocks.adlib[mixer.adlib], flute: Blocks.flute[mixer.flute],
      gabber: Blocks.gabber[mixer.gabber], acid: Blocks.acid[mixer.acid], hoover: Blocks.hoover[mixer.hoover],
      scream: Blocks.scream[mixer.scream], siren: Blocks.siren[mixer.siren], crush: Blocks.crush[mixer.crush],
      rage: Blocks.rage[mixer.rage], saw303: Blocks.saw303[mixer.saw303],
    }
    setPattern(p => ({ ...p, ...next }))
    // Auto-activate lanes that aren't Off
    setActive(a => ({ ...a,
      kick: mixer.kick !== 'Off', snare: mixer.snare !== 'Off', hihat: mixer.hihat !== 'Off',
      bass: mixer.bass !== 'Off', sub: mixer.sub !== 'Off', pad: mixer.pad !== 'Off',
      arp: mixer.arp !== 'Off', lead: mixer.lead !== 'Off', stab: mixer.stab !== 'Off',
      vox: mixer.vox !== 'Off', adlib: mixer.adlib !== 'Off', flute: mixer.flute !== 'Off',
      gabber: mixer.gabber !== 'Off', acid: mixer.acid !== 'Off', hoover: mixer.hoover !== 'Off',
      scream: mixer.scream !== 'Off', siren: mixer.siren !== 'Off', crush: mixer.crush !== 'Off',
      rage: mixer.rage !== 'Off', saw303: mixer.saw303 !== 'Off'
    }))
  }

  const morphMixer = () => {
    const pick = <T extends string>(o: Record<T, any>) => Object.keys(o)[Math.floor(Math.random()*Object.keys(o).length)] as T
    setMixer(m => ({
      kick: pick(Blocks.kick), snare: pick(Blocks.snare), hihat: pick(Blocks.hihat),
      bass: pick(Blocks.bass), sub: pick(Blocks.sub), pad: pick(Blocks.pad),
      arp: pick(Blocks.arp), lead: pick(Blocks.lead), stab: pick(Blocks.stab),
      vox: pick(Blocks.vox), adlib: pick(Blocks.adlib), flute: pick(Blocks.flute),
      gabber: pick(Blocks.gabber), acid: pick(Blocks.acid), hoover: pick(Blocks.hoover),
      scream: pick(Blocks.scream), siren: pick(Blocks.siren), crush: pick(Blocks.crush),
      rage: pick(Blocks.rage), saw303: pick(Blocks.saw303)
    }))
  }

  const baseVolumes = volumes
  const VIBES: Vibe[] = [
    { name: 'Night Drive', desc: 'Moody C‑minor, mid tempo, 4‑bar pads, simple kick/snare.', bpm: 100, swing: 0.18, fx: { reverbWet: 0.22, delayWet: 0.16 }, active: { ...active, arp: false, stab: false, vox: false, adlib: false, flute: false }, volumes: baseVolumes, pattern: { kick: makeRow(0,8), snare: makeRow(4,12), hihat: HATS_16TH, bass: makeRow(0,3,8,11), sub: makeRow(0,3,8,11), lead: makeRow(6,14), arp: new Array(Number(STEPS)).fill(false), pad: makeRow(0,4,8,12), stab: new Array(Number(STEPS)).fill(false), vox: new Array(Number(STEPS)).fill(false), adlib: new Array(Number(STEPS)).fill(false), flute: new Array(Number(STEPS)).fill(false), gabber: new Array(Number(STEPS)).fill(false), acid: new Array(Number(STEPS)).fill(false), hoover: new Array(Number(STEPS)).fill(false), scream: new Array(Number(STEPS)).fill(false), siren: new Array(Number(STEPS)).fill(false), crush: new Array(Number(STEPS)).fill(false), rage: new Array(Number(STEPS)).fill(false), saw303: new Array(Number(STEPS)).fill(false) } },
    { name: 'Arcade Boss', desc: 'Upbeat outrun feel with stabs.', bpm: 118, swing: 0.14, fx: { reverbWet: 0.2, delayWet: 0.18 }, active: { ...active, stab: true, arp: true, flute: false }, volumes: baseVolumes, pattern: { kick: makeRow(0,4,8,12), snare: makeRow(4,12), hihat: HATS_DRIVE, bass: makeRow(0,2,4,6,8,10,12,14), sub: makeRow(0,4,8,12), lead: makeRow(2,6,10,14), arp: makeRow(1,3,5,7,9,11,13,15), pad: makeRow(0,8), stab: makeRow(7,15), vox: new Array(Number(STEPS)).fill(false), adlib: new Array(Number(STEPS)).fill(false), flute: new Array(Number(STEPS)).fill(false), gabber: new Array(Number(STEPS)).fill(false), acid: new Array(Number(STEPS)).fill(false), hoover: new Array(Number(STEPS)).fill(false), scream: new Array(Number(STEPS)).fill(false), siren: new Array(Number(STEPS)).fill(false), crush: new Array(Number(STEPS)).fill(false), rage: new Array(Number(STEPS)).fill(false), saw303: new Array(Number(STEPS)).fill(false) } },
    { name: 'Opera Wave', desc: 'Slow cinematic pads with opera vox flourishes.', bpm: 92, swing: 0.2, fx: { reverbWet: 0.3, delayWet: 0.14 }, active: { ...active, vox: true, lead: false, arp: false, stab: false, flute: false }, volumes: baseVolumes, pattern: { kick: makeRow(0,8), snare: makeRow(12), hihat: makeRow(2,6,10,14), bass: makeRow(0,8), sub: makeRow(0,8), lead: new Array(Number(STEPS)).fill(false), arp: new Array(Number(STEPS)).fill(false), pad: makeRow(0,4,8,12), stab: new Array(Number(STEPS)).fill(false), vox: makeRow(6,14), adlib: new Array(Number(STEPS)).fill(false), flute: new Array(Number(STEPS)).fill(false), gabber: new Array(Number(STEPS)).fill(false), acid: new Array(Number(STEPS)).fill(false), hoover: new Array(Number(STEPS)).fill(false), scream: new Array(Number(STEPS)).fill(false), siren: new Array(Number(STEPS)).fill(false), crush: new Array(Number(STEPS)).fill(false), rage: new Array(Number(STEPS)).fill(false), saw303: new Array(Number(STEPS)).fill(false) } },
    { name: 'UK Grime Set', desc: '140 BPM grimey drive with ad‑libs and donk/reese bass.', bpm: 140, swing: 0.12, fx: { reverbWet: 0.18, delayWet: 0.12 }, active: { ...active, adlib: true, hihat: true, flute: false }, volumes: baseVolumes, pattern: { kick: makeRow(0,7,8,11,12,15), snare: makeRow(4,12), hihat: makeRow(2,3,6,7,10,11,14,15), bass: makeRow(0,4,8,12), sub: makeRow(0,8), lead: new Array(Number(STEPS)).fill(false), arp: new Array(Number(STEPS)).fill(false), pad: new Array(Number(STEPS)).fill(false), stab: new Array(Number(STEPS)).fill(false), vox: new Array(Number(STEPS)).fill(false), adlib: makeRow(5,13), flute: new Array(Number(STEPS)).fill(false), gabber: new Array(Number(STEPS)).fill(false), acid: new Array(Number(STEPS)).fill(false), hoover: new Array(Number(STEPS)).fill(false), scream: new Array(Number(STEPS)).fill(false), siren: new Array(Number(STEPS)).fill(false), crush: new Array(Number(STEPS)).fill(false), rage: new Array(Number(STEPS)).fill(false), saw303: new Array(Number(STEPS)).fill(false) } },
    { name: 'Grime Flute', desc: 'Drill/grime style with a haunting flute lead.', bpm: 142, swing: 0.1, fx: { reverbWet: 0.2, delayWet: 0.12 }, active: { ...active, hihat: true, flute: true, bass: true, sub: true }, volumes: baseVolumes, pattern: { kick: makeRow(0,7,8,11,12,15), snare: makeRow(4,12), hihat: makeRow(2,3,6,7,10,11,14,15), bass: makeRow(0,8,12), sub: makeRow(0,8), lead: new Array(Number(STEPS)).fill(false), arp: new Array(Number(STEPS)).fill(false), pad: new Array(Number(STEPS)).fill(false), stab: new Array(Number(STEPS)).fill(false), vox: new Array(Number(STEPS)).fill(false), adlib: new Array(Number(STEPS)).fill(false), flute: makeRow(1,5,9,13), gabber: new Array(Number(STEPS)).fill(false), acid: new Array(Number(STEPS)).fill(false), hoover: new Array(Number(STEPS)).fill(false), scream: new Array(Number(STEPS)).fill(false), siren: new Array(Number(STEPS)).fill(false), crush: new Array(Number(STEPS)).fill(false), rage: new Array(Number(STEPS)).fill(false), saw303: new Array(Number(STEPS)).fill(false) } },
    { name: 'Hardcore Rave', desc: 'Gabber kicks, acid lines, full energy 170 BPM.', bpm: 170, swing: 0, fx: { reverbWet: 0.15, delayWet: 0.1 }, active: { ...active, gabber: true, acid: true, hoover: true, siren: true, hihat: true }, volumes: baseVolumes, pattern: { kick: new Array(Number(STEPS)).fill(false), snare: makeRow(4,12), hihat: makeRow(2,6,10,14), bass: new Array(Number(STEPS)).fill(false), sub: new Array(Number(STEPS)).fill(false), lead: new Array(Number(STEPS)).fill(false), arp: new Array(Number(STEPS)).fill(false), pad: new Array(Number(STEPS)).fill(false), stab: new Array(Number(STEPS)).fill(false), vox: new Array(Number(STEPS)).fill(false), adlib: new Array(Number(STEPS)).fill(false), flute: new Array(Number(STEPS)).fill(false), gabber: makeRow(0,2,4,6,8,10,12,14), acid: makeRow(0,3,4,7,8,11,12,15), hoover: makeRow(0,8), scream: new Array(Number(STEPS)).fill(false), siren: makeRow(0), crush: new Array(Number(STEPS)).fill(false), rage: new Array(Number(STEPS)).fill(false), saw303: new Array(Number(STEPS)).fill(false) } },
    { name: 'Industrial Techno', desc: 'Dark, crushed, distorted at 145 BPM.', bpm: 145, swing: 0.05, fx: { reverbWet: 0.25, delayWet: 0.15 }, active: { ...active, kick: true, crush: true, rage: true, scream: true, saw303: true }, volumes: baseVolumes, pattern: { kick: makeRow(0,4,8,12), snare: makeRow(4,12), hihat: HATS_16TH, bass: new Array(Number(STEPS)).fill(false), sub: new Array(Number(STEPS)).fill(false), lead: new Array(Number(STEPS)).fill(false), arp: new Array(Number(STEPS)).fill(false), pad: new Array(Number(STEPS)).fill(false), stab: new Array(Number(STEPS)).fill(false), vox: new Array(Number(STEPS)).fill(false), adlib: new Array(Number(STEPS)).fill(false), flute: new Array(Number(STEPS)).fill(false), gabber: new Array(Number(STEPS)).fill(false), acid: new Array(Number(STEPS)).fill(false), hoover: new Array(Number(STEPS)).fill(false), scream: makeRow(7,15), siren: new Array(Number(STEPS)).fill(false), crush: makeRow(1,3,5,7,9,11,13,15), rage: makeRow(0,3,6,9,12,15), saw303: makeRow(0,2,4,5,8,10,12,13) } },
    { name: 'Acid Terror', desc: 'TB-303 madness with screaming synths at 155 BPM.', bpm: 155, swing: 0, fx: { reverbWet: 0.18, delayWet: 0.2 }, active: { ...active, gabber: true, acid: true, saw303: true, scream: true, hoover: true }, volumes: baseVolumes, pattern: { kick: new Array(Number(STEPS)).fill(false), snare: makeRow(4,12), hihat: HATS_DRIVE, bass: new Array(Number(STEPS)).fill(false), sub: new Array(Number(STEPS)).fill(false), lead: new Array(Number(STEPS)).fill(false), arp: new Array(Number(STEPS)).fill(false), pad: new Array(Number(STEPS)).fill(false), stab: new Array(Number(STEPS)).fill(false), vox: new Array(Number(STEPS)).fill(false), adlib: new Array(Number(STEPS)).fill(false), flute: new Array(Number(STEPS)).fill(false), gabber: makeRow(0,4,8,12), acid: makeRow(0,2,5,8,10,13), hoover: makeRow(0,4,8,12), scream: makeRow(3,7,11,15), siren: new Array(Number(STEPS)).fill(false), crush: new Array(Number(STEPS)).fill(false), rage: new Array(Number(STEPS)).fill(false), saw303: makeRow(1,4,7,10,13) } },
  ]

  const [vibeIndex, setVibeIndex] = useState(0)
  const loadVibe = (idx: number) => { const v = VIBES[idx]; setVibeIndex(idx); setBpm(v.bpm); setSwing(v.swing); setReverbWet(v.fx.reverbWet); setDelayWet(v.fx.delayWet); setActive(v.active); setVolumes(v.volumes); setPattern(JSON.parse(JSON.stringify(v.pattern))) }

  const saveState = () => { const payload = { pattern: patternRef.current, active: activeRef.current, bpm, swing, minorKey, reverbWet, delayWet, volumes }; localStorage.setItem('neonBeatLab:v3', JSON.stringify(payload)) }
  const loadState = () => { const raw = localStorage.getItem('neonBeatLab:v3'); if(!raw) return; try{ const s = JSON.parse(raw); if (s.pattern) setPattern(s.pattern); if (s.active) setActive(s.active); if (s.bpm) setBpm(s.bpm); if (s.minorKey) setMinorKey(s.minorKey); if (typeof s.swing === 'number') setSwing(s.swing); if (typeof s.reverbWet === 'number') setReverbWet(s.reverbWet); if (typeof s.delayWet === 'number') setDelayWet(s.delayWet); if (s.volumes) setVolumes(s.volumes) }catch{} }

  const handleRecord = async () => { if (!audioStarted) await Tone.start(); await startAudio(); if(!recorder.current) return; if(!isRecording){ recorder.current.start(); setIsRecording(true) } else { const blob = await recorder.current.stop(); setIsRecording(false); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `neon-beat-${Date.now()}.wav`; a.click(); URL.revokeObjectURL(url) } }

  const dragging = useRef<{ lane: InstrumentId | null; val: boolean | null }>({ lane: null, val: null })
  const onStepMouseDown = (lane: InstrumentId, step: number) => { dragging.current = { lane, val: !pattern[lane][step] }; toggleStep(lane, step) }
  const onStepEnter = (lane: InstrumentId, step: number, held: boolean) => { if(!held) return; if(dragging.current.lane !== lane || dragging.current.val === null) return; setPattern(prev => ({ ...prev, [lane]: prev[lane].map((v,i)=>(i===step? dragging.current!.val! : v)) })) }
  useEffect(()=>{ const up = () => (dragging.current = { lane: null, val: null }); window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up) }, [])

  return (
    <div className="relative select-none">
      <style>{`
        @keyframes sweep { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
        .cell { transition: transform 80ms ease, background 120ms ease, box-shadow 120ms ease }
        .cell:hover { transform: scale(1.06) }
      `}</style>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <Card title="Vibe Templates">
          <div className="flex items-center gap-2 mb-2">
            <select value={vibeIndex} onChange={(e)=>loadVibe(Number(e.target.value))} className="bg-black/40 border border-pink-500/40 rounded px-2 py-1 text-sm" title="Pick a template, then click Load to fill the grid">
              {['Night Drive','Arcade Boss','Opera Wave','UK Grime Set'].map((v,i)=>(<option key={v} value={i}>{v}</option>))}
            </select>
            <HeaderButton onClick={()=>loadVibe(vibeIndex)} title="Apply the selected template to the grid">Load</HeaderButton>
          </div>
          <p className="text-xs text-white/70 leading-relaxed">{VIBES[vibeIndex].desc}</p>
          <p className="text-[11px] text-white/50 mt-2">Tip: Click PLAY, then drag across steps to paint notes. Use RND to quickly fill a lane.</p>
        </Card>

        <Card title="Key & Tempo">
          <Row label={`Key ${minorKey} minor`}>
            <select value={minorKey} onChange={(e)=>setMinorKey(e.target.value as any)} className="bg-black/40 border border-cyan-500/40 rounded px-2 py-1 text-xs">
              {MINOR_KEYS.map(k=>(<option key={k} value={k}>{k}m</option>))}
            </select>
          </Row>
          <Row label={`BPM ${bpm}`}><Slider value={bpm} min={80} max={170} onChange={setBpm} /></Row>
          <Row label={`Swing ${(swing*100).toFixed(0)}%`}><Slider value={swing} min={0} max={0.6} step={0.01} onChange={setSwing} /></Row>
          <Row label={`Master ${masterDb} dB`}><Slider value={masterDb} min={-24} max={0} step={1} onChange={setMasterDb} /></Row>
        </Card>

        <Card title="Sound & FX">
          <Row label={`Reverb ${(reverbWet*100).toFixed(0)}%`}><Slider value={reverbWet} min={0} max={1} step={0.01} onChange={setReverbWet} /></Row>
          <Row label={`Delay ${(delayWet*100).toFixed(0)}%`}><Slider value={delayWet} min={0} max={1} step={0.01} onChange={setDelayWet} /></Row>
          <Row label={`Bass: ${bassMode}`}>
            <select value={bassMode} onChange={(e)=>setBassMode(e.target.value as any)} className="bg-black/40 border border-pink-500/40 rounded px-2 py-1 text-xs">
              {['FatSaw','Donk','Acid303','Reese','Sub808'].map(m=>(<option key={m} value={m}>{m}</option>))}
            </select>
          </Row>
          <Row label={`Drums: ${drumKit}`}>
            <select value={drumKit} onChange={(e)=>setDrumKit(e.target.value as any)} className="bg-black/40 border border-pink-500/40 rounded px-2 py-1 text-xs" title="Switch between synthesized and sample-based grime kit (drop your own below)">
              {['Synth','Grime'].map(m=>(<option key={m} value={m}>{m}</option>))}
            </select>
          </Row>
          <Row label={`Hat ratchets`}>
            <input type="checkbox" checked={ratchetHats} onChange={(e)=>setRatchetHats(e.target.checked)} title="Add fast repeats to hats for extra sizzle" />
          </Row>
          <div className="flex gap-2 mt-2"><HeaderButton onClick={saveState}>💾 Save</HeaderButton><HeaderButton onClick={loadState}>📂 Load</HeaderButton></div>
          <div className="mt-3 space-y-2">
            <div className="text-xs text-white/60">Load your own samples (optional):</div>
            <label className="text-[11px] text-white/60 block" title="If you've placed samples in public/samples/vox they will auto-load. You can also upload here.">Choir C4/G4/C5 <input type="file" multiple accept="audio/*" onChange={(e)=>{
              const files = Array.from(e.target.files||[])
              const urlMap: any = {}
              files.forEach(f=>{ const u = URL.createObjectURL(f); if(/C4/i.test(f.name)) urlMap.C4=u; else if(/G4/i.test(f.name)) urlMap.G4=u; else if(/C5/i.test(f.name)) urlMap.C5=u })
              setVoxUrls((prev)=>({ ...prev, ...urlMap }))
            }} /></label>
            <label className="text-[11px] text-white/60 block">Ad‑libs <input type="file" multiple accept="audio/*" onChange={(e)=>{
              const files = Array.from(e.target.files||[])
              const urls = files.map(f=>URL.createObjectURL(f))
              setAdlibUrls(urls)
            }} /></label>
            <label className="text-[11px] text-white/60 block" title="Drop your own grime kit pieces. If files are under public/samples/grime they load automatically.">Grime Kit (kick/snare/hihat) <input type="file" multiple accept="audio/*" onChange={(e)=>{
              const files = Array.from(e.target.files||[])
              const map: any = {}
              files.forEach(f=>{ const u = URL.createObjectURL(f); const n=f.name.toLowerCase(); if(n.includes('kick')) map.kick=u; else if(n.includes('snare')) map.snare=u; else if(n.includes('hat')||n.includes('hihat')||n.includes('hh')) map.hihat=u })
              setKitUrls((prev)=>({ ...prev, ...map }))
            }} /></label>
          </div>
        </Card>
      </div>

      {/* Genre Mixer - quick mashup composer */}
      <div className="max-w-7xl mx-auto mb-6">
        <Card title="Genre Mixer (combine building blocks per lane)">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {INSTRUMENTS.map((lane)=> (
              <div key={lane} className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/70 w-16 capitalize">{lane}</span>
                <select value={(mixer as any)[lane]} onChange={(e)=> setMixer(m=> ({ ...m, [lane]: e.target.value as any }))} className="bg-black/40 border border-purple-500/30 rounded px-2 py-1 text-xs flex-1" title={`Choose a pattern block for ${lane}`}>
                  {Object.keys((Blocks as any)[lane]).map(name => (<option key={name} value={name}>{name}</option>))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <HeaderButton onClick={applyMixer} title="Apply the selected blocks to the grid">Apply Blocks</HeaderButton>
            <HeaderButton onClick={morphMixer} title="Randomize a new combination of blocks">Morph</HeaderButton>
          </div>
        </Card>
      </div>

      {/* Performance Macros */}
      <div className="max-w-7xl mx-auto mb-6">
        <Card title="Performance Macros">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Row label={`Lead HPF`}><Slider value={macroFilter} min={0} max={1} step={0.01} onChange={setMacroFilter} /></Row></div>
            <div><Row label={`Bass Drive`}><Slider value={macroBassDrive} min={0} max={1} step={0.01} onChange={setMacroBassDrive} /></Row></div>
            <div><Row label={`Rev Decay`}><Slider value={macroRevDecay} min={0} max={1} step={0.01} onChange={setMacroRevDecay} /></Row></div>
            <div><Row label={`Delay Time`}><Slider value={macroDelayTime} min={0} max={1} step={0.01} onChange={setMacroDelayTime} /></Row></div>
          </div>
        </Card>
      </div>

      {/* Scenes */}
      <div className="max-w-7xl mx-auto mb-6">
        <Card title="Scenes (1 bar queue)">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {scenes.map((sc, i) => (
              <div key={i} className={`p-2 rounded border ${sceneIndex===i? 'border-cyan-400':'border-white/10'}`} title="Save the current pattern as a scene, Load to jump now, Queue to switch on the next bar">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/70">Scene {i+1}</span>
                  <span className={`text-[10px] ${sc? 'text-emerald-300':'text-gray-500'}`}>{sc? 'Saved':'Empty'}</span>
                </div>
                <div className="flex gap-2">
                  <HeaderButton onClick={()=>saveScene(i)} title="Store the current pattern in this slot">Save</HeaderButton>
                  <HeaderButton onClick={()=>loadScene(i)} title="Immediately switch to this scene">Load Now</HeaderButton>
                  <HeaderButton onClick={()=>queueSceneNextBar(i)} title="Switch to this scene on the next bar boundary">Queue</HeaderButton>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Visualizer positioned just above beat panels */}
      <div className="max-w-7xl mx-auto mb-6">
        <NeonVisualizer isPlaying={isPlaying} bpm={bpm} />
      </div>

      {/* Control buttons positioned below visualizer */}
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-3 md:gap-4 mb-6">
        <HeaderButton onClick={handlePlay} className={isPlaying ? 'border-red-500/70 text-red-300' : ''}>{isPlaying? '⏸ PAUSE' : '▶ PLAY'}</HeaderButton>
        <HeaderButton onClick={async()=>{ if (!audioStarted) await Tone.start(); await startAudio(); synths.current.hihat?.triggerAttack(); setTimeout(() => synths.current.hihat?.triggerRelease(), 50) }}>🔊 TEST</HeaderButton>
        <HeaderButton onClick={clearAll} className="border-red-500/70 text-red-300">🗑 CLEAR</HeaderButton>
        <HeaderButton onClick={handleRecord} className={isRecording ? 'border-yellow-500/70 text-yellow-300' : ''}>{isRecording ? '⏺ STOP & SAVE' : '● REC'}</HeaderButton>
      </div>

      <div className="max-w-7xl mx-auto bg-black/40 border-2 border-pink-500/30 rounded-2xl p-4 backdrop-blur-sm shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-44" />
          {Array.from({length: Number(STEPS)}).map((_, i) => (
            <div key={i} className="flex-1 text-center text-[10px] text-cyan-300 font-mono opacity-80">{i+1}</div>
          ))}
          <div className="w-40" />
          <div className="w-40" />
        </div>

        {INSTRUMENTS.map(lane => (
          <div key={lane} className={`${!active[lane] ? 'opacity-50' : ''} py-1`}>
            <div className="flex items-center gap-3">
              <div className="w-44 flex items-center gap-2">
                <button onClick={()=>setActive(a=>({...a,[lane]:!a[lane]}))} className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider ${active[lane] ? 'bg-gradient-to-r from-pink-600 to-purple-600' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>{lane}</button>
                <button onClick={()=>clearLane(lane)} className="px-2 py-1 text-[10px] rounded bg-red-500/20 border border-red-500 text-red-300">CLR</button>
                <button onClick={()=>randomiseLane(lane)} className="px-2 py-1 text-[10px] rounded bg-emerald-500/20 border border-emerald-500 text-emerald-300">RND</button>
              </div>
              <div className="flex gap-1 flex-1">
                {pattern[lane].map((on, step) => (
                  <button key={step} onMouseDown={()=>onStepMouseDown(lane, step)} onMouseEnter={(e)=>onStepEnter(lane, step, (e.buttons & 1)===1)} disabled={!active[lane]} className={`cell flex-1 h-10 rounded ${on? 'bg-gradient-to-br from-pink-500 to-purple-600 shadow shadow-pink-500/40':'bg-gray-900/60 border border-white/5'} ${currentStep===step?'ring-2 ring-cyan-400':''} ${step%4===0?'border-l-2 border-l-yellow-500/30':''} ${!active[lane]? 'cursor-not-allowed':'cursor-pointer'}`} title={`${lane} • Step ${step+1}`} />
                ))}
              </div>
              <div className="w-40 flex items-center gap-2">
                <span className="text-[10px] text-white/70 w-10 font-mono">{volumes[lane]} dB</span>
                <input type="range" min={-24} max={0} step={1} value={volumes[lane]} onChange={(e)=>setVolumes(v=>({...v,[lane]:Number(e.target.value)}))} className="w-24 accent-pink-400" />
              </div>
              <div className="w-40 flex items-center gap-2">
                <span className="text-[10px] text-white/70 w-6 font-mono">{Math.round((density[lane]??0)*100)}</span>
                <input type="range" min={0} max={1} step={0.01} value={density[lane] ?? 0.3} onChange={(e)=>setDensity(d=>({...d,[lane]:Number(e.target.value)}))} className="w-20 accent-purple-400" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto mt-6">
        <div className="h-3 bg-gray-900 rounded-full overflow-hidden relative">
          <div className="h-full bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 transition-all duration-100" style={{ width: `${((currentStep + 1) / Number(STEPS)) * 100}%`, boxShadow: '0 0 30px rgba(0,255,255,0.6)' }} />
          {isPlaying && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ animation: 'sweep 1s linear infinite' }} />}
        </div>
      </div>
    </div>
  )
}

function HeaderButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`px-4 py-2 rounded-xl font-bold text-sm border-2 transition-all bg-black/40 hover:bg-black/60 shadow border-fuchsia-500/60 text-fuchsia-300 ${className}`}>{children}</button>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }){
  return (
    <div className="bg-black/40 border-2 border-cyan-500/30 rounded-2xl p-4 shadow-xl">
      <div className="text-sm font-bold tracking-wider text-cyan-300 mb-2">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }){
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-white/80 font-mono">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Slider({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void }){
  return (
    <input type="range" className="w-40 accent-cyan-400" min={min} max={max} step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))} />
  )
}


