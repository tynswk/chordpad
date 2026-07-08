import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { playPad } from "./audio/engine";
import { Select } from "./components/Select";
import {
  CHORD_QUALITIES,
  chordLabel,
  FUNCTION_LABELS,
  getChordFunctionDetail,
  getDiatonicChords,
  NOTE_NAMES,
  type ChordDef,
  type ChordQuality,
  type DiatonicChord,
  type NoteName,
  type ScaleConfig,
} from "./music/theory";
import { DEFAULT_PLAYBACK, DEFAULT_TIMBRE, MAX_BPM, MIN_BPM, type Timbre } from "./state/types";

const PAD_COUNT = 16;

type PadSource = { kind: "diatonic"; degree: number } | { kind: "custom"; chord: ChordDef };

interface PadState {
  /** Stable identity for this slot, independent of its position in the grid
   * (which changes as pads are reordered). Never reassigned. */
  key: number;
  source: PadSource | null;
}

interface ResolvedPad {
  chord: ChordDef;
  function: ReturnType<typeof getChordFunctionDetail>["function"];
  detail?: string;
}

let padKeySeq = 0;

function createEmptyPads(): PadState[] {
  return Array.from({ length: PAD_COUNT }, () => ({ key: padKeySeq++, source: null }));
}

function resolvePadSource(
  source: PadSource,
  diatonicChords: DiatonicChord[],
  scale: ScaleConfig,
): ResolvedPad | null {
  if (source.kind === "diatonic") {
    const dc = diatonicChords[source.degree];
    return dc ? { chord: dc.chord, function: dc.function } : null;
  }
  const detail = getChordFunctionDetail(source.chord, scale);
  return { chord: source.chord, function: detail.function, detail: detail.detail };
}

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("chordpad-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function clampBpm(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_PLAYBACK.bpm;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
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
  const [playback, setPlayback] = useState(DEFAULT_PLAYBACK);
  const [builderRoot, setBuilderRoot] = useState<NoteName>("C");
  const [builderQuality, setBuilderQuality] = useState<ChordQuality>("major");
  const [editMode, setEditMode] = useState(false);
  const [draggingKey, setDraggingKey] = useState<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  const diatonicChords = useMemo(() => getDiatonicChords(scale), [scale]);

  function playChord(chord: ChordDef) {
    playPad(chord, timbre, playback);
  }

  function assignToNextEmptyPad(source: PadSource) {
    setPads((prev) => {
      const index = prev.findIndex((pad) => pad.source === null);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = { ...next[index], source };
      return next;
    });
  }

  function clearPad(key: number) {
    setPads((prev) => prev.map((pad) => (pad.key === key ? { ...pad, source: null } : pad)));
  }

  function clearAllPads() {
    setPads(createEmptyPads());
  }

  function adjustBpm(delta: number) {
    setPlayback((p) => ({ ...p, bpm: clampBpm(p.bpm + delta) }));
  }

  function handleBpmInput(value: string) {
    const parsed = Number(value);
    if (value === "" || Number.isNaN(parsed)) return;
    setPlayback((p) => ({ ...p, bpm: clampBpm(parsed) }));
  }

  function handleTapTempo() {
    const now = performance.now();
    const taps = tapTimesRef.current;
    const last = taps[taps.length - 1];
    if (last !== undefined && now - last > 2000) {
      taps.length = 0;
    }
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setPlayback((p) => ({ ...p, bpm: clampBpm(60000 / avgMs) }));
    }
  }

  useEffect(() => {
    if (draggingKey === null) return;

    function handleMove(e: PointerEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const padEl = el?.closest<HTMLElement>("[data-pad-index]");
      if (!padEl) return;
      const overIndex = Number(padEl.dataset.padIndex);
      if (Number.isNaN(overIndex)) return;
      setPads((prev) => {
        const fromIndex = prev.findIndex((p) => p.key === draggingKey);
        if (fromIndex === -1 || fromIndex === overIndex) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(overIndex, 0, moved);
        return next;
      });
    }

    function handleUp() {
      setDraggingKey(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [draggingKey]);

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
            <div className="palette-header">
              <h2>Diatonic Chords</h2>
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
            </div>
            <div className="palette-grid">
              {diatonicChords.map((dc) => (
                <div key={dc.degree} className={`palette-card function-${dc.function}`}>
                  <button className="palette-play" onClick={() => playChord(dc.chord)}>
                    <span className="roman">{dc.romanLabel}</span>
                    <span className="chord-name">{chordLabel(dc.chord)}</span>
                    <span className="function-badge">{FUNCTION_LABELS[dc.function]}</span>
                  </button>
                  <button
                    className="add-to-pad"
                    onClick={() => assignToNextEmptyPad({ kind: "diatonic", degree: dc.degree })}
                    title="Add to pad"
                  >
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
              <button
                className="add-to-pad builder-add"
                onClick={() => assignToNextEmptyPad({ kind: "custom", chord: builderChord })}
              >
                + Add to Pad
              </button>
            </div>
          </section>

          <section className="timbre-section">
            <h2>Timbre</h2>
            <div className="instrument-switch">
              <button
                className={`instrument-btn emoji-only ${timbre.type === "piano" ? "active" : ""}`}
                onClick={() => setTimbre((t) => ({ ...t, type: "piano" }))}
                aria-label="Piano"
                title="Piano"
              >
                🎹
              </button>
              <button
                className={`instrument-btn emoji-only ${timbre.type === "guitar" ? "active" : ""}`}
                onClick={() => setTimbre((t) => ({ ...t, type: "guitar" }))}
                aria-label="Guitar"
                title="Guitar"
              >
                🎸
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
                  <span>Overdrive</span>
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
              </div>
            )}
          </section>

          <section className="playback-section">
            <h2>BPM</h2>
            <div className="bpm-row">
              <div className="stepper">
                <button type="button" onClick={() => adjustBpm(-1)} aria-label="BPMを下げる">
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_BPM}
                  max={MAX_BPM}
                  value={playback.bpm}
                  onChange={(e) => handleBpmInput(e.target.value)}
                />
                <button type="button" onClick={() => adjustBpm(1)} aria-label="BPMを上げる">
                  +
                </button>
              </div>
              <button type="button" className="tap-tempo" onClick={handleTapTempo}>
                TAP
              </button>
            </div>
          </section>
        </div>

        <div className="layout-main">
          <section className="pad-section">
            <div className="pad-section-header">
              <h2>Pads</h2>
              <div className="pad-section-actions">
                <button
                  className={`edit-toggle ${editMode ? "active" : ""}`}
                  onClick={() => setEditMode((e) => !e)}
                >
                  {editMode ? "完了" : "編集"}
                </button>
                <button className="clear-all" onClick={clearAllPads}>
                  Clear All
                </button>
              </div>
            </div>
            <div className="pad-grid">
              {pads.map((pad, index) => {
                const resolved = pad.source ? resolvePadSource(pad.source, diatonicChords, scale) : null;
                return (
                  <div
                    key={pad.key}
                    data-pad-index={index}
                    className={`pad ${resolved ? `function-${resolved.function}` : "empty"} ${
                      editMode && resolved ? "jiggle" : ""
                    } ${draggingKey === pad.key ? "dragging" : ""}`}
                    onClick={() => !editMode && resolved && playChord(resolved.chord)}
                    onPointerDown={(e) => {
                      if (!editMode || !resolved) return;
                      e.preventDefault();
                      setDraggingKey(pad.key);
                    }}
                  >
                    {resolved ? (
                      <>
                        <button
                          className="pad-clear"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            clearPad(pad.key);
                          }}
                        >
                          ×
                        </button>
                        <span className="chord-name">{chordLabel(resolved.chord)}</span>
                        <span className="function-badge">
                          {resolved.detail ?? FUNCTION_LABELS[resolved.function]}
                        </span>
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
