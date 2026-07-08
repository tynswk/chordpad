import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { playPad } from "./audio/engine";
import { Select } from "./components/Select";
import {
  CHORD_QUALITIES,
  chordLabel,
  FUNCTION_LABELS,
  getChordFunction,
  getDiatonicChords,
  NOTE_NAMES,
  type ChordDef,
  type ChordQuality,
  type NoteName,
  type ScaleConfig,
} from "./music/theory";
import {
  DEFAULT_PLAYBACK,
  DEFAULT_TIMBRE,
  STROKE_PRESETS,
  type PlaybackSettings,
  type PlayMode,
  type Timbre,
} from "./state/types";

const PAD_COUNT = 16;

interface PadState {
  id: number;
  source: ChordDef | null;
}

function createEmptyPads(): PadState[] {
  return Array.from({ length: PAD_COUNT }, (_, id) => ({ id, source: null }));
}

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("chordpad-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("chordpad-theme", theme);
  }, [theme]);

  const [scale, setScale] = useState<ScaleConfig>({
    root: "C",
    type: "major",
    useHarmonicMinorDominant: false,
    use7thChords: false,
  });
  const [pads, setPads] = useState<PadState[]>(createEmptyPads);
  const [timbre, setTimbre] = useState<Timbre>(DEFAULT_TIMBRE);
  const [playback, setPlayback] = useState<PlaybackSettings>(DEFAULT_PLAYBACK);
  const [builderRoot, setBuilderRoot] = useState<NoteName>("C");
  const [builderQuality, setBuilderQuality] = useState<ChordQuality>("major");

  const diatonicChords = useMemo(() => getDiatonicChords(scale), [scale]);

  function playChord(chord: ChordDef) {
    playPad(chord, timbre, playback);
  }

  function assignToNextEmptyPad(chord: ChordDef) {
    setPads((prev) => {
      const index = prev.findIndex((pad) => pad.source === null);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = { ...next[index], source: chord };
      return next;
    });
  }

  function clearPad(id: number) {
    setPads((prev) => prev.map((pad) => (pad.id === id ? { ...pad, source: null } : pad)));
  }

  function clearAllPads() {
    setPads(createEmptyPads());
  }

  const builderChord: ChordDef = { root: builderRoot, quality: builderQuality, octave: 4 };

  return (
    <div className="app">
      <header className="header">
        <h1>ChordPad</h1>
        <div className="controls">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title="ライト/ダークモード切替"
            aria-label="ライト/ダークモード切替"
          >
            {theme === "light" ? "☀️" : "🌙"}
          </button>
          <label>
            Key
            <Select
              value={scale.root}
              onChange={(v) => setScale((s) => ({ ...s, root: v }))}
              options={NOTE_NAMES.map((note) => ({ value: note, label: note }))}
            />
          </label>
          <label>
            Scale
            <Select
              value={scale.type}
              onChange={(v) => setScale((s) => ({ ...s, type: v }))}
              options={[
                { value: "major", label: "Major" },
                { value: "minor", label: "Minor" },
              ]}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={scale.use7thChords}
              onChange={(e) => setScale((s) => ({ ...s, use7thChords: e.target.checked }))}
            />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">7th chords</span>
          </label>
          {scale.type === "minor" && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={scale.useHarmonicMinorDominant}
                onChange={(e) =>
                  setScale((s) => ({ ...s, useHarmonicMinorDominant: e.target.checked }))
                }
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span className="toggle-label">Strong V (harmonic minor)</span>
            </label>
          )}
        </div>
      </header>

      <div className="layout">
        <div className="layout-sidebar">
          <section className="palette">
            <h2>Diatonic Chords</h2>
            <div className="palette-grid">
              {diatonicChords.map((dc) => (
                <div key={dc.degree} className={`palette-card function-${dc.function}`}>
                  <button className="palette-play" onClick={() => playChord(dc.chord)}>
                    <span className="roman">{dc.romanLabel}</span>
                    <span className="chord-name">{chordLabel(dc.chord)}</span>
                    <span className="function-badge">{FUNCTION_LABELS[dc.function]}</span>
                  </button>
                  <button className="add-to-pad" onClick={() => assignToNextEmptyPad(dc.chord)} title="Add to pad">
                    +
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="builder">
            <h2>Chord Builder</h2>
            <p className="builder-hint">スケール外のコード（ノンダイアトニック）も自由に作成できます</p>
            <div className="builder-row">
              <Select
                value={builderRoot}
                onChange={setBuilderRoot}
                options={NOTE_NAMES.map((note) => ({ value: note, label: note }))}
              />
              <Select
                value={builderQuality}
                onChange={setBuilderQuality}
                options={CHORD_QUALITIES.map((q) => ({ value: q, label: q }))}
              />
              <button className="builder-preview" onClick={() => playChord(builderChord)}>
                ▶ {chordLabel(builderChord)}
              </button>
              <button className="add-to-pad builder-add" onClick={() => assignToNextEmptyPad(builderChord)}>
                + Add to Pad
              </button>
            </div>
          </section>

          <section className="timbre-section">
            <h2>Timbre</h2>
            <div className="instrument-switch">
              <button
                className={`instrument-btn ${timbre.type === "piano" ? "active" : ""}`}
                onClick={() => setTimbre((t) => ({ ...t, type: "piano" }))}
              >
                🎹 Piano
              </button>
              <button
                className={`instrument-btn ${timbre.type === "guitar" ? "active" : ""}`}
                onClick={() => setTimbre((t) => ({ ...t, type: "guitar" }))}
              >
                🎸 Guitar
              </button>
            </div>

            {timbre.type === "guitar" && (
              <div className="knob-row">
                <label className="knob">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={timbre.distortionAmount}
                    onChange={(e) => setTimbre((t) => ({ ...t, distortionAmount: Number(e.target.value) }))}
                  />
                  <span>Distortion</span>
                </label>
                <label className="knob">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    value={timbre.ampEQ.low}
                    onChange={(e) =>
                      setTimbre((t) => ({ ...t, ampEQ: { ...t.ampEQ, low: Number(e.target.value) } }))
                    }
                  />
                  <span>Low</span>
                </label>
                <label className="knob">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    value={timbre.ampEQ.mid}
                    onChange={(e) =>
                      setTimbre((t) => ({ ...t, ampEQ: { ...t.ampEQ, mid: Number(e.target.value) } }))
                    }
                  />
                  <span>Mid</span>
                </label>
                <label className="knob">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    value={timbre.ampEQ.high}
                    onChange={(e) =>
                      setTimbre((t) => ({ ...t, ampEQ: { ...t.ampEQ, high: Number(e.target.value) } }))
                    }
                  />
                  <span>High</span>
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={timbre.cabinetOn}
                    onChange={(e) => setTimbre((t) => ({ ...t, cabinetOn: e.target.checked }))}
                  />
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-label">Cabinet</span>
                </label>
              </div>
            )}
          </section>

          <section className="playback-section">
            <h2>BPM & Stroke</h2>
            <div className="playback-row">
              <label className="bpm-label">
                BPM: {playback.bpm}
                <input
                  type="range"
                  min={40}
                  max={240}
                  value={playback.bpm}
                  onChange={(e) => setPlayback((p) => ({ ...p, bpm: Number(e.target.value) }))}
                />
              </label>
              <div className="mode-switch">
                <button
                  className={`instrument-btn ${playback.mode === "block" ? "active" : ""}`}
                  onClick={() => setPlayback((p) => ({ ...p, mode: "block" as PlayMode }))}
                >
                  一括
                </button>
                <button
                  className={`instrument-btn ${playback.mode === "strum" ? "active" : ""}`}
                  onClick={() => setPlayback((p) => ({ ...p, mode: "strum" as PlayMode }))}
                >
                  ストローク
                </button>
              </div>
              {playback.mode === "strum" && (
                <Select
                  value={playback.strokePatternId}
                  onChange={(v) => setPlayback((p) => ({ ...p, strokePatternId: v }))}
                  options={STROKE_PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))}
                />
              )}
            </div>
          </section>
        </div>

        <div className="layout-main">
          <section className="pad-section">
            <div className="pad-section-header">
              <h2>Pads</h2>
              <button className="clear-all" onClick={clearAllPads}>
                Clear All
              </button>
            </div>
            <div className="pad-grid">
              {pads.map((pad) => {
                const fn = pad.source ? getChordFunction(pad.source, scale) : null;
                return (
                  <div
                    key={pad.id}
                    className={`pad ${fn ? `function-${fn}` : "empty"}`}
                    onClick={() => pad.source && playChord(pad.source)}
                  >
                    {pad.source && fn ? (
                      <>
                        <button
                          className="pad-clear"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearPad(pad.id);
                          }}
                        >
                          ×
                        </button>
                        <span className="chord-name">{chordLabel(pad.source)}</span>
                        <span className="function-badge">{FUNCTION_LABELS[fn]}</span>
                      </>
                    ) : (
                      <span className="empty-label">+</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;
