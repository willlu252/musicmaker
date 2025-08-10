import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";

/**
 * NEON BEAT LAB — v3
 * Go‑nuts edition with guided vibes & templates
 *
 * New in v3
 * - "Vibes" (prefilled templates): Night Drive, Neon Noir, Arcade Boss, Beach Sunset, Darkwave
 * - Quick Guide actions (one‑click: backbeat, 4‑on‑floor, 16th hats, minor pads, octave bass)
 * - Key picker (minor): transpose scales/chords (C, D#, F, G, A#)
 * - Sub + Bass layering preserved, sidechain duck on kick, master chain, record to WAV
 * - Save/Load persists vibe/key and settings
 */

const STEPS = 16;
const INSTRUMENTS = [
  "kick",
  "snare",
  "hihat",
  "bass",
  "sub",
  "lead",
  "arp",
  "pad",
  "stab",
] as const;

type InstrumentId = typeof INSTRUMENTS[number];

type Pattern = Record<InstrumentId, boolean[]>;

type ActiveMap = Record<InstrumentId, boolean>;

type DensityMap = Record<InstrumentId, number>; // 0..1

type VolMap = Record<InstrumentId, number>; // dB

type Vibe = {
  name: string;
  desc: string;
  bpm: number;
  swing: number;
  fx: { reverbWet: number; delayWet: number };
  active: ActiveMap;
  volumes: VolMap;
  pattern: Pattern;
};

export default function NeonBeatLabV3() {
  // Transport / Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(110);
  const [swing, setSwing] = useState(0.18);
  const [currentStep, setCurrentStep] = useState(-1);
  const [audioStarted, setAudioStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Key (minor only for now)
  const MINOR_KEYS = ["C", "D#", "F", "G", "A#"] as const;
  type MinorKey = typeof MINOR_KEYS[number];
  const [minorKey, setMinorKey] = useState<MinorKey>("C");

  // Mixer / FX
  const [reverbWet, setReverbWet] = useState(0.22);
  const [delayWet, setDelayWet] = useState(0.16);
  const [masterDb, setMasterDb] = useState(-6);

  // Toggles / Volumes / Random density
  const [active, setActive] = useState<ActiveMap>({
    kick: true,
    snare: true,
    hihat: true,
    bass: true,
    sub: true,
    lead: true,
    arp: true,
    pad: true,
    stab: false,
  });

  const [volumes, setVolumes] = useState<VolMap>({
    kick: -8,
    snare: -10,
    hihat: -14,
    bass: -5,
    sub: -6,
    lead: -10,
    arp: -12,
    pad: -8,
    stab: -8,
  });

  const [density, setDensity] = useState<DensityMap>({
    kick: 0.35,
    snare: 0.25,
    hihat: 0.65,
    bass: 0.4,
    sub: 0.4,
    lead: 0.3,
    arp: 0.55,
    pad: 0.18,
    stab: 0.25,
  });

  // Step patterns
  const emptyRow = useMemo(() => new Array<boolean>(STEPS).fill(false), []);
  const emptyPattern = useMemo<Pattern>(
    () => ({
      kick: [...emptyRow],
      snare: [...emptyRow],
      hihat: [...emptyRow],
      bass: [...emptyRow],
      sub: [...emptyRow],
      lead: [...emptyRow],
      arp: [...emptyRow],
      pad: [...emptyRow],
      stab: [...emptyRow],
    }),
    [emptyRow]
  );

  const [pattern, setPattern] = useState<Pattern>({ ...emptyPattern });

  // Refs: audio callback reads latest
  const patternRef = useRef(pattern);
  const activeRef = useRef(active);
  const keyRef = useRef(minorKey);
  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { keyRef.current = minorKey; }, [minorKey]);

  // Audio nodes
  const masterVol = useRef<Tone.Volume | null>(null);
  const eq3 = useRef<Tone.EQ3 | null>(null);
  const comp = useRef<Tone.Compressor | null>(null);
  const limiter = useRef<Tone.Limiter | null>(null);
  const recorder = useRef<Tone.Recorder | null>(null);

  // FX
  const fx = useRef({
    reverb: null as Tone.Reverb | null,
    delay: null as Tone.FeedbackDelay | null,
    chorus: null as Tone.Chorus | null,
    bit: null as Tone.BitCrusher | null,
  });

  // Ducking: musical bus
  const buses = useRef<{ music: Tone.Gain | null }>({ music: null });

  // Instruments
  const synths = useRef<{ [K in InstrumentId]?: any }>({});
  const seq = useRef<Tone.Sequence | null>(null);

  // ---------- Boot / teardown ----------
  useEffect(() => {
    // Load saved state
    try {
      const raw = localStorage.getItem("neonBeatLab:v3");
      if (raw) {
        const s = JSON.parse(raw);
        if (s.pattern) setPattern(s.pattern);
        if (s.active) setActive(s.active);
        if (s.bpm) setBpm(s.bpm);
        if (s.minorKey) setMinorKey(s.minorKey);
        if (typeof s.swing === "number") setSwing(s.swing);
        if (typeof s.reverbWet === "number") setReverbWet(s.reverbWet);
        if (typeof s.delayWet === "number") setDelayWet(s.delayWet);
        if (s.volumes) setVolumes(s.volumes);
      }
    } catch {}
    return () => teardown();
  }, []);

  useEffect(() => {
    const payload = { pattern: patternRef.current, active: activeRef.current, bpm, swing, minorKey, reverbWet, delayWet, volumes };
    try { localStorage.setItem("neonBeatLab:v3", JSON.stringify(payload)); } catch {}
  }, [pattern, active, bpm, swing, minorKey, reverbWet, delayWet, volumes]);

  // ---------- Start audio graph ----------
  const startAudio = async () => {
    if (audioStarted) return true;
    await Tone.start();

    // Master chain
    masterVol.current = new Tone.Volume(masterDb);
    eq3.current = new Tone.EQ3({ low: 3, mid: -1, high: 1 });
    comp.current = new Tone.Compressor({ threshold: -18, ratio: 2.5, attack: 0.01, release: 0.2 });
    limiter.current = new Tone.Limiter(-1);
    recorder.current = new Tone.Recorder();

    masterVol.current.chain(eq3.current, comp.current, limiter.current, Tone.Destination);
    limiter.current.connect(recorder.current);

    buses.current.music = new Tone.Gain(1).connect(masterVol.current);

    // FX
    fx.current.reverb = new Tone.Reverb({ decay: 3.0, wet: reverbWet });
    fx.current.delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.28, wet: delayWet });
    fx.current.chorus = new Tone.Chorus({ frequency: 0.8, delayTime: 4, depth: 0.6, spread: 180 }).start();
    fx.current.bit = new Tone.BitCrusher({ bits: 6 });

    // Drums
    synths.current.kick = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 10,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.42, sustain: 0.01, release: 1.1 },
      volume: volumes.kick,
    }).connect(masterVol.current);

    synths.current.snare = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.2, sustain: 0 }, volume: volumes.snare });
    synths.current.snare.chain(fx.current.bit!, masterVol.current);

    synths.current.hihat = new Tone.MetalSynth({
      frequency: 250,
      envelope: { attack: 0.001, decay: 0.07, release: 0.01 },
      harmonicity: 3.1,
      modulationIndex: 16,
      resonance: 4000,
      octaves: 0.5,
      volume: volumes.hihat,
    }).connect(masterVol.current);

    // Bass + Sub
    const bassDrive = new Tone.Distortion({ distortion: 0.34, wet: 0.42 });
    const bassEq = new Tone.EQ3({ low: 2, mid: 0, high: -1 });
    synths.current.bass = new Tone.MonoSynth({
      oscillator: { type: "fatsawtooth", count: 5, spread: 24 },
      filter: { Q: 1.1, type: "lowpass" },
      envelope: { attack: 0.01, decay: 0.22, sustain: 0.45, release: 0.35 },
      filterEnvelope: { attack: 0.005, decay: 0.08, sustain: 0.6, release: 0.25, baseFrequency: 140, octaves: 2.4 },
      volume: volumes.bass,
    });
    synths.current.bass.chain(bassDrive, bassEq, buses.current.music);

    const subLowpass = new Tone.Filter(120, "lowpass");
    synths.current.sub = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      filter: { type: "lowpass" },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.9, release: 0.25 },
      volume: volumes.sub,
    });
    synths.current.sub.chain(subLowpass, buses.current.music);

    // Leads / Pads / Arp / Stabs
    const hpLead = new Tone.Filter(250, "highpass");
    synths.current.lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 6, spread: 40 },
      envelope: { attack: 0.02, decay: 0.12, sustain: 0.35, release: 0.35 },
      volume: volumes.lead,
    });
    synths.current.lead.chain(hpLead, fx.current.delay!, fx.current.reverb!, fx.current.chorus!, buses.current.music);

    const hpArp = new Tone.Filter(300, "highpass");
    synths.current.arp = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 4, spread: 30 },
      envelope: { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.2 },
      volume: volumes.arp,
    });
    synths.current.arp.chain(hpArp, fx.current.delay!, fx.current.reverb!, buses.current.music);

    const hpStab = new Tone.Filter(220, "highpass");
    synths.current.stab = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.15, release: 0.25 },
      volume: volumes.stab,
    });
    synths.current.stab.chain(hpStab, fx.current.reverb!, buses.current.music);

    synths.current.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.6, decay: 0.6, sustain: 0.85, release: 2.2 },
      volume: volumes.pad,
    });
    synths.current.pad.chain(fx.current.reverb!, fx.current.chorus!, buses.current.music);

    // Transport
    Tone.Transport.bpm.value = bpm;
    Tone.Transport.swing = swing;
    Tone.Transport.swingSubdivision = "8n";

    setAudioStarted(true);
    return true;
  };

  const teardown = () => {
    try {
      if (seq.current) { seq.current.stop(); seq.current.dispose(); seq.current = null; }
      Tone.Transport.stop();
      Tone.Transport.cancel();
      Object.values(synths.current).forEach((n) => n?.dispose?.());
      Object.values(fx.current).forEach((n) => n?.dispose?.());
      buses.current.music?.dispose?.();
      comp.current?.dispose?.();
      eq3.current?.dispose?.();
      limiter.current?.dispose?.();
      masterVol.current?.dispose?.();
      recorder.current = null;
    } catch {}
  };

  // Keep params synced
  useEffect(() => { if (audioStarted) Tone.Transport.bpm.rampTo(bpm, 0.05); }, [bpm, audioStarted]);
  useEffect(() => { if (audioStarted) { Tone.Transport.swing = swing; Tone.Transport.swingSubdivision = "8n"; } }, [swing, audioStarted]);
  useEffect(() => { if (audioStarted && fx.current.reverb) fx.current.reverb.wet.rampTo(reverbWet, 0.1); }, [reverbWet, audioStarted]);
  useEffect(() => { if (audioStarted && fx.current.delay) fx.current.delay.wet.rampTo(delayWet, 0.1); }, [delayWet, audioStarted]);
  useEffect(() => { if (audioStarted) masterVol.current?.volume?.rampTo(masterDb, 0.05); }, [masterDb, audioStarted]);
  useEffect(() => {
    if (!audioStarted) return;
    const v = volumes;
    for (const k of INSTRUMENTS) {
      if (synths.current[k]) synths.current[k].volume.value = (v as any)[k];
    }
  }, [volumes, audioStarted]);

  // ---------- Music Data / Key Transpose ----------
  const rootToSemisFromC: Record<MinorKey, number> = { C: 0, "D#": 3, F: 5, G: 7, "A#": 10 };
  const t = (note: string, semis: number) => Tone.Frequency(note).transpose(semis).toNote();

  const baseBass = ["C2", "C2", "D#2", "F2", "G2", "A#2", "C3", "D#3"]; // C minor
  const baseLead = ["C4", "D#4", "F4", "G4", "A#4", "C5", "D#5", "F5"]; // C minor
  const basePadChords = [
    ["C3", "D#3", "G3"], // i (Cm)
    ["G#2", "C3", "D#3"], // VI (Ab)
    ["A#2", "D3", "F3"], // VII (Bb)
    ["D#3", "G3", "A#3"], // III (Eb)
  ];
  const getBassScale = (key: MinorKey) => baseBass.map((n) => t(n, rootToSemisFromC[key]));
  const getLeadScale = (key: MinorKey) => baseLead.map((n) => t(n, rootToSemisFromC[key]));
  const getPadChords = (key: MinorKey) => basePadChords.map((ch) => ch.map((n) => t(n, rootToSemisFromC[key])));

  // ---------- Sequencer ----------
  const schedule = () => {
    if (seq.current) { seq.current.stop(); seq.current.dispose(); seq.current = null; }

    seq.current = new Tone.Sequence((time, step) => {
      Tone.Draw.schedule(() => setCurrentStep(step), time);

      const patt = patternRef.current;
      const on = activeRef.current;

      // KICK + duck
      if (on.kick && patt.kick[step]) {
        synths.current.kick.triggerAttackRelease("C1", "8n", time);
        if (buses.current.music) {
          const g = buses.current.music.gain;
          const now = time;
          g.cancelAndHoldAtTime(now);
          g.setValueAtTime(0.75, now);
          g.linearRampToValueAtTime(1, now + 0.24);
        }
      }

      if (on.snare && patt.snare[step]) synths.current.snare.triggerAttackRelease("8n", time);
      if (on.hihat && patt.hihat[step]) synths.current.hihat.triggerAttackRelease("32n", time, 0.2);

      // Keyed material
      const k = keyRef.current;
      if (on.bass && patt.bass[step]) {
        const note = getBassScale(k)[step % 8];
        synths.current.bass.triggerAttackRelease(note, "8n", time);
      }
      if (on.sub && patt.sub[step]) {
        const note = getBassScale(k)[step % 8];
        synths.current.sub.triggerAttackRelease(Tone.Frequency(note).transpose(-12).toNote(), "8n", time);
      }
      if (on.lead && patt.lead[step]) {
        const note = getLeadScale(k)[step % 8];
        synths.current.lead.triggerAttackRelease(note, "16n", time);
      }
      if (on.arp && patt.arp[step]) {
        const note = getLeadScale(k)[(step * 3) % 8];
        synths.current.arp.triggerAttackRelease(note, "16n", time);
      }
      if (on.pad && patt.pad[step]) {
        const chord = getPadChords(k)[Math.floor(step / 4) % 4];
        synths.current.pad.triggerAttackRelease(chord, "2n", time);
      }
      if (on.stab && patt.stab[step]) {
        const chord = getPadChords(k)[0];
        synths.current.stab.triggerAttackRelease(chord.map((n) => Tone.Frequency(n).transpose(12).toNote()), "8n", time);
      }
    }, [...Array(STEPS).keys()], "16n");

    seq.current.start(0);
  };

  const handlePlay = async () => {
    await startAudio();
    if (!isPlaying) {
      Tone.Transport.stop();
      Tone.Transport.cancel();
      Tone.Transport.position = 0;
      schedule();
      Tone.Transport.start();
      setIsPlaying(true);
    } else {
      if (seq.current) { seq.current.stop(); seq.current.dispose(); seq.current = null; }
      Tone.Transport.pause();
      setIsPlaying(false);
      setCurrentStep(-1);
    }
  };

  // ---------- Editing ----------
  const toggleStep = (lane: InstrumentId, step: number) => setPattern((p) => ({ ...p, [lane]: p[lane].map((v, i) => (i === step ? !v : v)) }));
  const clearLane = (lane: InstrumentId) => setPattern((p) => ({ ...p, [lane]: p[lane].map(() => false) }));
  const randomiseLane = (lane: InstrumentId) => {
    const d = Math.max(0, Math.min(1, density[lane] ?? 0.3));
    const arr = Array.from({ length: STEPS }, () => Math.random() < d);
    setPattern((p) => ({ ...p, [lane]: arr }));
  };
  const clearAll = () => setPattern({ ...emptyPattern });

  // ---------- Vibes (templates) ----------
  const makeRow = (...steps: number[]) => {
    const r = new Array(STEPS).fill(false);
    steps.forEach((i) => (r[i] = true));
    return r;
  };

  const HATS_16TH = makeRow(1,2,3,5,6,7,9,10,11,13,14,15); // offbeat accents
  const HATS_DRIVE = new Array(STEPS).fill(true).map((_,i)=>!(i%4===0)); // light gap on beats

  const VIBES: Vibe[] = [
    {
      name: "Night Drive",
      desc: "Moody C‑minor, mid tempo, 4‑bar pads, simple kick on 1/3, snare on 2/4.",
      bpm: 100,
      swing: 0.18,
      fx: { reverbWet: 0.22, delayWet: 0.16 },
      active: { kick: true, snare: true, hihat: true, bass: true, sub: true, lead: true, arp: false, pad: true, stab: false },
      volumes,
      pattern: {
        kick: makeRow(0,8), // 1 & 3
        snare: makeRow(4,12), // 2 & 4
        hihat: HATS_16TH,
        bass: makeRow(0,3,8,11),
        sub:  makeRow(0,3,8,11),
        lead: makeRow(6,14),
        arp:  new Array(STEPS).fill(false),
        pad:  makeRow(0,4,8,12),
        stab: new Array(STEPS).fill(false),
      },
    },
    {
      name: "Arcade Boss",
      desc: "Upbeat outrun feel: 4‑on‑floor kick, driving hats, stab hits.",
      bpm: 118,
      swing: 0.14,
      fx: { reverbWet: 0.2, delayWet: 0.18 },
      active: { kick: true, snare: true, hihat: true, bass: true, sub: true, lead: true, arp: true, pad: true, stab: true },
      volumes,
      pattern: {
        kick: makeRow(0,4,8,12), // 4-on-floor
        snare: makeRow(4,12),
        hihat: HATS_DRIVE,
        bass: makeRow(0,2,4,6,8,10,12,14), // 8th drive
        sub:  makeRow(0,4,8,12),
        lead: makeRow(2,6,10,14),
        arp:  makeRow(1,3,5,7,9,11,13,15),
        pad:  makeRow(0,8),
        stab: makeRow(7,15),
      },
    },
    {
      name: "Neon Noir",
      desc: "Slow darkwave swagger; sparse drums, wide pads, occasional lead.",
      bpm: 90,
      swing: 0.22,
      fx: { reverbWet: 0.28, delayWet: 0.14 },
      active: { kick: true, snare: true, hihat: true, bass: true, sub: true, lead: true, arp: false, pad: true, stab: false },
      volumes,
      pattern: {
        kick: makeRow(0,10),
        snare: makeRow(4,12),
        hihat: makeRow(2,6,10,14), // quarters offbeat
        bass: makeRow(0,5,8,13),
        sub:  makeRow(0,8),
        lead: makeRow(6),
        arp:  new Array(STEPS).fill(false),
        pad:  makeRow(0,4,8,12),
        stab: new Array(STEPS).fill(false),
      },
    },
    {
      name: "Beach Sunset",
      desc: "Bright nostalgic cruiser; more arp shimmer, major‑ish vibe (still minor key).",
      bpm: 108,
      swing: 0.16,
      fx: { reverbWet: 0.24, delayWet: 0.2 },
      active: { kick: true, snare: true, hihat: true, bass: true, sub: true, lead: true, arp: true, pad: true, stab: false },
      volumes,
      pattern: {
        kick: makeRow(0,4,8,12),
        snare: makeRow(4,12),
        hihat: HATS_16TH,
        bass: makeRow(0,4,8,12),
        sub:  makeRow(0,8),
        lead: makeRow(1,5,9,13),
        arp:  makeRow(2,6,10,14),
        pad:  makeRow(0,8),
        stab: new Array(STEPS).fill(false),
      },
    },
    {
      name: "Darkwave",
      desc: "Heavier low end, minimal lead, tom‑style drive via bass/sub.",
      bpm: 96,
      swing: 0.2,
      fx: { reverbWet: 0.26, delayWet: 0.12 },
      active: { kick: true, snare: true, hihat: true, bass: true, sub: true, lead: false, arp: false, pad: true, stab: true },
      volumes,
      pattern: {
        kick: makeRow(0,4,8,12),
        snare: makeRow(12), // only on 4 for thwack
        hihat: makeRow(2,6,10,14),
        bass: makeRow(0,3,6,9,12,15),
        sub:  makeRow(0,8,12),
        lead: new Array(STEPS).fill(false),
        arp:  new Array(STEPS).fill(false),
        pad:  makeRow(0,8),
        stab: makeRow(7,15),
      },
    },
  ];

  const [vibeIndex, setVibeIndex] = useState(0);

  const loadVibe = (idx: number) => {
    const v = VIBES[idx];
    setVibeIndex(idx);
    setBpm(v.bpm);
    setSwing(v.swing);
    setReverbWet(v.fx.reverbWet);
    setDelayWet(v.fx.delayWet);
    setActive(v.active);
    setVolumes(v.volumes);
    setPattern(JSON.parse(JSON.stringify(v.pattern)));
  };

  // ---------- Quick Guide actions ----------
  const applyBackbeat = () => setPattern((p) => ({ ...p, snare: makeRow(4,12) }));
  const applyFourOnFloor = () => setPattern((p) => ({ ...p, kick: makeRow(0,4,8,12) }));
  const apply16thHats = () => setPattern((p) => ({ ...p, hihat: HATS_16TH }));
  const applyMinorPads = () => setPattern((p) => ({ ...p, pad: makeRow(0,4,8,12) }));
  const applyOctaveBass = () => setPattern((p) => ({ ...p, bass: makeRow(0,4,8,12), sub: makeRow(0,8) }));

  // Save / Load
  const saveState = () => {
    const payload = { pattern: patternRef.current, active: activeRef.current, bpm, swing, minorKey, reverbWet, delayWet, volumes };
    localStorage.setItem("neonBeatLab:v3", JSON.stringify(payload));
  };
  const loadState = () => {
    const raw = localStorage.getItem("neonBeatLab:v3");
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (s.pattern) setPattern(s.pattern);
      if (s.active) setActive(s.active);
      if (s.bpm) setBpm(s.bpm);
      if (s.minorKey) setMinorKey(s.minorKey);
      if (typeof s.swing === "number") setSwing(s.swing);
      if (typeof s.reverbWet === "number") setReverbWet(s.reverbWet);
      if (typeof s.delayWet === "number") setDelayWet(s.delayWet);
      if (s.volumes) setVolumes(s.volumes);
    } catch {}
  };

  // Recording
  const handleRecord = async () => {
    await startAudio();
    if (!recorder.current) return;
    if (!isRecording) {
      recorder.current.start();
      setIsRecording(true);
    } else {
      const blob = await recorder.current.stop();
      setIsRecording(false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `neon-beat-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // drag paint support
  const dragging = useRef<{ lane: InstrumentId | null; val: boolean | null }>({ lane: null, val: null });
  const onStepMouseDown = (lane: InstrumentId, step: number) => {
    dragging.current = { lane, val: !pattern[lane][step] };
    toggleStep(lane, step);
  };
  const onStepEnter = (lane: InstrumentId, step: number, held: boolean) => {
    if (!held) return;
    if (dragging.current.lane !== lane || dragging.current.val === null) return;
    setPattern((prev) => ({ ...prev, [lane]: prev[lane].map((v, i) => (i === step ? dragging.current!.val! : v)) }));
  };
  useEffect(() => {
    const up = () => (dragging.current = { lane: null, val: null });
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative select-none">
      {/* BG */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-pink-900/20 to-cyan-900/20" />
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,255,0.05) 2px, rgba(255,0,255,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,255,255,0.05) 2px, rgba(0,255,255,0.05) 4px)`, animation: "scan 10s linear infinite" }} />
      </div>
      <style>{`
        @keyframes scan { 0% { transform: translateY(0) } 100% { transform: translateY(24px) } }
        @keyframes sweep { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
        .neon { text-shadow: 0 0 10px currentColor, 0 0 20px currentColor }
        .cell { transition: transform 80ms ease, background 120ms ease, box-shadow 120ms ease }
        .cell:hover { transform: scale(1.06) }
      `}</style>

      <div className="relative z-10 p-6 md:p-10">
        <h1 className="text-center text-5xl md:text-7xl font-black tracking-wider mb-6 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent neon">NEON BEAT LAB — v3</h1>

        {/* Header Controls */}
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-3 md:gap-4 mb-6">
          <HeaderButton onClick={handlePlay} className={isPlaying ? "border-red-500/70 text-red-300" : ""}>{isPlaying ? "⏸ PAUSE" : "▶ PLAY"}</HeaderButton>
          <HeaderButton onClick={async () => { await startAudio(); synths.current.kick?.triggerAttackRelease("C1", "8n"); }}>🔊 TEST</HeaderButton>
          <HeaderButton onClick={clearAll} className="border-red-500/70 text-red-300">🗑 CLEAR</HeaderButton>
          <HeaderButton onClick={handleRecord} className={isRecording ? "border-yellow-500/70 text-yellow-300" : ""}>{isRecording ? "⏺ STOP & SAVE" : "● REC"}</HeaderButton>
        </div>

        {/* Vibes / Key / FX / Tempo */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <Card title="Vibe Templates">
            <div className="flex items-center gap-2 mb-2">
              <select value={vibeIndex} onChange={(e) => loadVibe(Number(e.target.value))} className="bg-black/40 border border-pink-500/40 rounded px-2 py-1 text-sm">
                {VIBES.map((v, i) => (
                  <option key={v.name} value={i}>{v.name}</option>
                ))}
              </select>
              <HeaderButton onClick={() => loadVibe(vibeIndex)}>Load</HeaderButton>
            </div>
            <p className="text-xs text-white/70 leading-relaxed">{VIBES[vibeIndex].desc}</p>
          </Card>

            <Card title="Key & Tempo">
              <Row label={`Key ${minorKey} minor`}>
                <select value={minorKey} onChange={(e)=>setMinorKey(e.target.value as MinorKey)} className="bg-black/40 border border-cyan-500/40 rounded px-2 py-1 text-xs">
                  {MINOR_KEYS.map((k)=>(<option key={k} value={k}>{k}m</option>))}
                </select>
              </Row>
              <Row label={`BPM ${bpm}`}><Slider value={bpm} min={80} max={170} onChange={setBpm} /></Row>
              <Row label={`Swing ${(swing * 100).toFixed(0)}%`}><Slider value={swing} min={0} max={0.6} step={0.01} onChange={setSwing} /></Row>
              <Row label={`Master ${masterDb} dB`}><Slider value={masterDb} min={-24} max={0} step={1} onChange={setMasterDb} /></Row>
              {!audioStarted && <p className="text-yellow-300/80 text-xs mt-2">Click PLAY/TEST to initialise audio</p>}
            </Card>

            <Card title="FX & State">
              <Row label={`Reverb ${(reverbWet * 100).toFixed(0)}%`}><Slider value={reverbWet} min={0} max={1} step={0.01} onChange={setReverbWet} /></Row>
              <Row label={`Delay ${(delayWet * 100).toFixed(0)}%`}><Slider value={delayWet} min={0} max={1} step={0.01} onChange={setDelayWet} /></Row>
              <div className="flex gap-2 mt-2"><HeaderButton onClick={saveState}>💾 Save</HeaderButton><HeaderButton onClick={loadState}>📂 Load</HeaderButton></div>
            </Card>
        </div>

        {/* Quick Guide */}
        <div className="max-w-7xl mx-auto mb-6">
          <Card title="Quick Guide: make it sound like music fast">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              <HeaderButton onClick={applyBackbeat}>Backbeat</HeaderButton>
              <HeaderButton onClick={applyFourOnFloor}>4‑on‑floor</HeaderButton>
              <HeaderButton onClick={apply16thHats}>16th Hats</HeaderButton>
              <HeaderButton onClick={applyMinorPads}>Minor Pads</HeaderButton>
              <HeaderButton onClick={applyOctaveBass}>Octave Bass</HeaderButton>
            </div>
            <p className="text-[11px] text-white/70 mt-2">
              Tip: Start with drums (kick/snare), add hats for movement, hold pads on the bar markers (1/5/9/13), then sprinkle bass/lead.
            </p>
          </Card>
        </div>

        {/* Grid */}
        <div className="max-w-7xl mx-auto bg-black/40 border-2 border-pink-500/30 rounded-2xl p-4 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-44" />
            {[...Array(STEPS)].map((_, i) => (
              <div key={i} className="flex-1 text-center text-[10px] text-cyan-300 font-mono opacity-80">{i + 1}</div>
            ))}
            <div className="w-40" />
            <div className="w-40" />
          </div>

          {INSTRUMENTS.map((lane) => (
            <div key={lane} className={`${!active[lane] ? "opacity-50" : ""} py-1`}>
              <div className="flex items-center gap-3">
                {/* Lane controls */}
                <div className="w-44 flex items-center gap-2">
                  <button onClick={() => setActive((a) => ({ ...a, [lane]: !a[lane] }))} className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider ${active[lane] ? "bg-gradient-to-r from-pink-600 to-purple-600" : "bg-gray-800 text-gray-400 border border-gray-700"}`}>{lane}</button>
                  <button onClick={() => clearLane(lane)} className="px-2 py-1 text-[10px] rounded bg-red-500/20 border border-red-500 text-red-300">CLR</button>
                  <button onClick={() => randomiseLane(lane)} className="px-2 py-1 text-[10px] rounded bg-emerald-500/20 border border-emerald-500 text-emerald-300">RND</button>
                </div>

                {/* Steps */}
                <div className="flex gap-1 flex-1">
                  {pattern[lane].map((on, step) => (
                    <button
                      key={step}
                      onMouseDown={() => onStepMouseDown(lane, step)}
                      onMouseEnter={(e) => onStepEnter(lane, step, (e.buttons & 1) === 1)}
                      disabled={!active[lane]}
                      className={`cell flex-1 h-10 rounded ${on ? "bg-gradient-to-br from-pink-500 to-purple-600 shadow shadow-pink-500/40" : "bg-gray-900/60 border border-white/5"} ${currentStep === step ? "ring-2 ring-cyan-400" : ""} ${step % 4 === 0 ? "border-l-2 border-l-yellow-500/30" : ""} ${!active[lane] ? "cursor-not-allowed" : "cursor-pointer"}`}
                      title={`${lane} • Step ${step + 1}`}
                    />
                  ))}
                </div>

                {/* Volume */}
                <div className="w-40 flex items-center gap-2">
                  <span className="text-[10px] text-white/70 w-10 font-mono">{volumes[lane]} dB</span>
                  <input type="range" min={-24} max={0} step={1} value={volumes[lane]} onChange={(e) => setVolumes((v) => ({ ...v, [lane]: Number(e.target.value) }))} className="w-24 accent-pink-400" />
                </div>

                {/* Density */}
                <div className="w-40 flex items-center gap-2">
                  <span className="text-[10px] text-white/70 w-6 font-mono">{Math.round((density[lane] ?? 0) * 100)}</span>
                  <input type="range" min={0} max={1} step={0.01} value={density[lane] ?? 0.3} onChange={(e) => setDensity((d) => ({ ...d, [lane]: Number(e.target.value) }))} className="w-20 accent-purple-400" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Playhead bar */}
        <div className="max-w-7xl mx-auto mt-6">
          <div className="h-3 bg-gray-900 rounded-full overflow-hidden relative">
            <div className="h-full bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 transition-all duration-100" style={{ width: `${((currentStep + 1) / STEPS) * 100}%`, boxShadow: "0 0 30px rgba(0,255,255,0.6)" }} />
            {isPlaying && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ animation: "sweep 1s linear infinite" }} />}
          </div>
        </div>

        <footer className="text-center mt-8 text-cyan-300/80 font-mono text-xs">
          <p>◄ TEMPLATES + GUIDE ► Load a vibe • Pick a key • Hit the Quick Guide buttons • Drag to paint variations • REC to bounce a WAV</p>
        </footer>
      </div>
    </div>
  );
}

// ---------- UI bits ----------
function HeaderButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "px-4 py-2 rounded-xl font-bold text-sm border-2 transition-all " +
        "bg-black/40 hover:bg-black/60 shadow " +
        "border-fuchsia-500/60 text-fuchsia-300 " +
        className
      }
    >
      {children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-black/40 border-2 border-cyan-500/30 rounded-2xl p-4 shadow-xl">
      <div className="text-sm font-bold tracking-wider text-cyan-300 mb-2 neon">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-white/80 font-mono">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Slider({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <input type="range" className="w-40 accent-cyan-400" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  );
}
