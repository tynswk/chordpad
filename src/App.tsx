import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Guitar, KeyboardMusic, Moon, Pencil, Plus, Sun, X } from "lucide-react";
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
import {
  DEFAULT_PLAYBACK,
  DEFAULT_TIMBRE,
  MAX_BPM,
  MIN_BPM,
  type PlayMode,
  type Timbre,
} from "./state/types";

interface GridSize {
  cols: number;
  rows: number;
}

const GRID_PRESETS: GridSize[] = [
  { cols: 2, rows: 2 },
  { cols: 3, rows: 3 },
  { cols: 4, rows: 3 },
  { cols: 4, rows: 4 },
  { cols: 4, rows: 5 },
  { cols: 5, rows: 4 },
  { cols: 6, rows: 4 },
];

const DEFAULT_GRID_SIZE: GridSize = { cols: 4, rows: 4 };

function gridSizeLabel(size: GridSize): string {
  return `${size.cols} × ${size.rows}`;
}

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

interface DragState {
  key: number;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  originRect: { left: number; top: number; width: number; height: number };
  overIndex: number | null;
}

interface FlyingChip {
  id: number;
  chord: ChordDef;
  func: ResolvedPad["function"];
  detail?: string;
  startRect: { left: number; top: number; width: number; height: number };
  endRect: { left: number; top: number; width: number; height: number };
}

function FlyingChipView({ chip }: { chip: FlyingChip }) {
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLanded(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const rect = landed ? chip.endRect : chip.startRect;

  return (
    <div
      className={`pad flying-chip function-${chip.func} ${landed ? "landed" : ""}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <span className="chord-name">{chordLabel(chip.chord)}</span>
      <span className="function-badge">{chip.detail ?? FUNCTION_LABELS[chip.func]}</span>
    </div>
  );
}

let padKeySeq = 0;
let flyingChipSeq = 0;

function createEmptyPads(count: number): PadState[] {
  return Array.from({ length: count }, () => ({ key: padKeySeq++, source: null }));
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

const THEME_COLORS: Record<Theme, string> = { light: "#eef4fb", dark: "#0c1622" };

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("chordpad-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  }, [theme]);

  const [scale, setScale] = useState<ScaleConfig>({
    root: "C",
    type: "major",
    useHarmonicMinorDominant: false,
    use7thChords: false,
  });
  const [gridSize, setGridSize] = useState<GridSize>(DEFAULT_GRID_SIZE);
  const [pads, setPads] = useState<PadState[]>(() => createEmptyPads(DEFAULT_GRID_SIZE.cols * DEFAULT_GRID_SIZE.rows));
  const [timbre, setTimbre] = useState<Timbre>(DEFAULT_TIMBRE);
  const [playback, setPlayback] = useState(DEFAULT_PLAYBACK);
  const [builderRoot, setBuilderRoot] = useState<NoteName>("C");
  const [builderQuality, setBuilderQuality] = useState<ChordQuality>("major");
  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [flyingChips, setFlyingChips] = useState<FlyingChip[]>([]);
  const [padsCollapsed, setPadsCollapsed] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const clearAllRef = useRef<HTMLDivElement>(null);
  const [panelDrag, setPanelDrag] = useState<{
    pointerId: number;
    startY: number;
    dy: number;
    wasCollapsed: boolean;
  } | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  function changeGridSize(size: GridSize) {
    setGridSize(size);
    const count = size.cols * size.rows;
    setPads((prev) => {
      if (prev.length === count) return prev;
      if (prev.length > count) return prev.slice(0, count);
      return [...prev, ...createEmptyPads(count - prev.length)];
    });
  }

  const diatonicChords = useMemo(() => getDiatonicChords(scale), [scale]);
  const panelFullHeight =
    typeof window !== "undefined" ? Math.min(window.innerHeight * 0.6, 560) : 560;
  // Opening/closing should feel equally responsive in both directions. Using
  // the full panel height as the drag distance made closing (which starts
  // at 100% and only needs to *look* different) feel unresponsive compared
  // to opening (which starts at 0%, where any movement is instantly
  // visible) -- so both directions are scaled to the same, shorter throw.
  const panelDragRange = Math.min(panelFullHeight, 220);

  function playChord(chord: ChordDef) {
    playPad(chord, timbre, playback);
  }

  function assignToNextEmptyPad(source: PadSource, originEl?: HTMLElement) {
    const index = pads.findIndex((pad) => pad.source === null);
    if (index === -1) return;
    setPads((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], source };
      return next;
    });

    if (!originEl) return;
    const targetEl = document.querySelector<HTMLElement>(`[data-pad-index="${index}"]`);
    if (!targetEl) return;
    const endRect = targetEl.getBoundingClientRect();
    if (endRect.width === 0) return; // pad panel is collapsed/hidden -- nothing to fly to
    const resolved = resolvePadSource(source, diatonicChords, scale);
    if (!resolved) return;
    const startRect = originEl.getBoundingClientRect();
    const id = ++flyingChipSeq;
    setFlyingChips((chips) => [
      ...chips,
      {
        id,
        chord: resolved.chord,
        func: resolved.function,
        detail: resolved.detail,
        startRect: { left: startRect.left, top: startRect.top, width: startRect.width, height: startRect.height },
        endRect: { left: endRect.left, top: endRect.top, width: endRect.width, height: endRect.height },
      },
    ]);
    setTimeout(() => setFlyingChips((chips) => chips.filter((c) => c.id !== id)), 420);
  }

  function clearPad(key: number) {
    setPads((prev) => prev.map((pad) => (pad.key === key ? { ...pad, source: null } : pad)));
  }

  function clearAllPads() {
    setPads(createEmptyPads(gridSize.cols * gridSize.rows));
    setConfirmClearAll(false);
  }

  useEffect(() => {
    if (!confirmClearAll) return;
    function handleClickOutside(e: MouseEvent) {
      if (clearAllRef.current && !clearAllRef.current.contains(e.target as Node)) {
        setConfirmClearAll(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [confirmClearAll]);

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

  function handlePanelBarPointerDown(e: React.PointerEvent) {
    setPanelDrag({ pointerId: e.pointerId, startY: e.clientY, dy: 0, wasCollapsed: padsCollapsed });
  }

  // The panel bar tracks the finger continuously while dragging (not just
  // start/end points), so it visually follows the swipe in real time.
  useEffect(() => {
    if (panelDrag === null) return;
    const { pointerId } = panelDrag;

    function handleMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      setPanelDrag((prev) => (prev ? { ...prev, dy: e.clientY - prev.startY } : prev));
    }

    // Sets an absolute target rather than toggling, so that if this fires
    // more than once for the same gesture (duplicate/replayed pointerup),
    // it's idempotent instead of flipping back and forth.
    function handleEnd(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      setPanelDrag((prev) => {
        if (prev) {
          const dy = prev.dy;
          if (Math.abs(dy) < 10) {
            setPadsCollapsed(!prev.wasCollapsed);
          } else if (dy < -24) {
            setPadsCollapsed(false);
          } else if (dy > 24) {
            setPadsCollapsed(true);
          }
        }
        return null;
      });
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only
    // re-subscribe when a swipe starts/stops, not on every dy update.
  }, [panelDrag === null]);

  // Pads float freely under the pointer while dragging (no live grid-swap);
  // the slot currently under the pointer is tracked as a drop-target preview,
  // and on release the dragged pad and that slot simply swap contents --
  // nothing else in the grid shifts around.
  useEffect(() => {
    if (drag === null) return;
    const { pointerId } = drag;

    function handleMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const padEl = el?.closest<HTMLElement>("[data-pad-index]");
      const overIndex = padEl ? Number(padEl.dataset.padIndex) : null;
      setDrag((prev) =>
        prev
          ? {
              ...prev,
              dx: e.clientX - prev.startX,
              dy: e.clientY - prev.startY,
              overIndex: overIndex === null || Number.isNaN(overIndex) ? prev.overIndex : overIndex,
            }
          : prev,
      );
    }

    function handleUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      setDrag((prev) => {
        if (prev && prev.overIndex !== null) {
          const toIndex = prev.overIndex;
          setPads((prevPads) => {
            const fromIndex = prevPads.findIndex((p) => p.key === prev.key);
            if (fromIndex === -1 || fromIndex === toIndex || toIndex >= prevPads.length) return prevPads;
            const next = [...prevPads];
            [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
            return next;
          });
        }
        return null;
      });
    }

    function handleCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      setDrag(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // only re-subscribe when a drag starts/stops, not on every dx/dy update.
  }, [drag === null]);

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
            aria-label="ライト/ダークモード切替"
          >
            {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
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

      <div className="layout" data-pads-collapsed={padsCollapsed}>
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
                    onClick={(e) => assignToNextEmptyPad({ kind: "diatonic", degree: dc.degree }, e.currentTarget)}
                    title="Add to pad"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="builder">
            <h2>Chord Builder</h2>
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
                onClick={(e) => assignToNextEmptyPad({ kind: "custom", chord: builderChord }, e.currentTarget)}
              >
                <Plus size={16} />
              </button>
            </div>
          </section>

          <section className="timbre-section">
            <h2>Timbre</h2>
            <div className="instrument-switch" data-active={timbre.type}>
              <span className="instrument-switch-indicator" />
              <button
                className={`instrument-btn ${timbre.type === "piano" ? "active" : ""}`}
                onClick={() => setTimbre((t) => ({ ...t, type: "piano" }))}
                aria-label="Piano"
              >
                <KeyboardMusic size={20} />
              </button>
              <button
                className={`instrument-btn ${timbre.type === "guitar" ? "active" : ""}`}
                onClick={() => setTimbre((t) => ({ ...t, type: "guitar" }))}
                aria-label="Guitar"
              >
                <Guitar size={20} />
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
            <div className="instrument-switch" data-active={playback.mode}>
              <span className="instrument-switch-indicator" />
              <button
                className={`instrument-btn ${playback.mode === "arpeggio" ? "active" : ""}`}
                onClick={() => setPlayback((p) => ({ ...p, mode: "arpeggio" as PlayMode }))}
              >
                アルペジオ
              </button>
              <button
                className={`instrument-btn ${playback.mode === "block" ? "active" : ""}`}
                onClick={() => setPlayback((p) => ({ ...p, mode: "block" as PlayMode }))}
              >
                ストローク
              </button>
            </div>
          </section>
        </div>

        <div className="layout-main">
          <div className="pad-panel">
            <div className="pad-panel-bar">
              <div
                className="pad-panel-grip-row"
                onPointerDown={handlePanelBarPointerDown}
                role="button"
                tabIndex={0}
                aria-expanded={!padsCollapsed}
                aria-label={padsCollapsed ? "パッドを開く" : "パッドを閉じる"}
              >
                <span className="pad-panel-grip" />
              </div>
              <div className="pad-panel-controls-row">
                <Select
                  value={gridSizeLabel(gridSize)}
                  onChange={(v) => {
                    const found = GRID_PRESETS.find((p) => gridSizeLabel(p) === v);
                    if (found) changeGridSize(found);
                  }}
                  options={GRID_PRESETS.map((p) => ({ value: gridSizeLabel(p), label: gridSizeLabel(p) }))}
                />
                <div className="pad-section-actions">
                  {editMode && (
                    <div className="clear-all-wrap" ref={clearAllRef}>
                      <button className="clear-all" onClick={() => setConfirmClearAll((v) => !v)}>
                        Clear All
                      </button>
                      {confirmClearAll && (
                        <div className="clear-all-confirm" role="dialog">
                          <button className="clear-all-confirm-btn" onClick={clearAllPads}>
                            Clear All
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    className={`edit-toggle ${editMode ? "active" : ""}`}
                    onClick={() => setEditMode((e) => !e)}
                    aria-label={editMode ? "編集完了" : "パッドを編集"}
                  >
                    {editMode ? <Check size={14} /> : <Pencil size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <section
              className={`pad-section pad-panel-body ${padsCollapsed ? "collapsed" : ""}`}
              style={
                panelDrag
                  ? {
                      maxHeight: `${Math.max(
                        0,
                        Math.min(
                          panelFullHeight,
                          (padsCollapsed ? -panelDrag.dy : panelDragRange - panelDrag.dy) *
                            (panelFullHeight / panelDragRange),
                        ),
                      )}px`,
                      transition: "none",
                      opacity: 1,
                    }
                  : undefined
              }
            >
              <div
                className="pad-grid"
                style={{ gridTemplateColumns: `repeat(${gridSize.cols}, 1fr)`, gridTemplateRows: `repeat(${gridSize.rows}, 1fr)` }}
              >
                {pads.map((pad, index) => {
                  const resolved = pad.source ? resolvePadSource(pad.source, diatonicChords, scale) : null;
                  const isDragging = drag?.key === pad.key;
                  const isDropTarget = drag !== null && !isDragging && drag.overIndex === index;

                  // The pad being dragged is lifted out of the grid entirely
                  // (rendered as a floating overlay below) and its slot shows
                  // a plain empty placeholder, so it's obvious where it came
                  // from and only the two swapped slots ever visually change.
                  if (isDragging) {
                    return <div key={pad.key} data-pad-index={index} className="pad empty drag-origin" />;
                  }

                  return (
                    <div
                      key={pad.key}
                      data-pad-index={index}
                      className={`pad ${resolved ? `function-${resolved.function}` : "empty"} ${
                        editMode && resolved ? "jiggle" : ""
                      } ${isDropTarget ? "drop-target" : ""}`}
                      onClick={() => !editMode && resolved && playChord(resolved.chord)}
                      onPointerDown={(e) => {
                        if (!editMode || !resolved) return;
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDrag({
                          key: pad.key,
                          pointerId: e.pointerId,
                          startX: e.clientX,
                          startY: e.clientY,
                          dx: 0,
                          dy: 0,
                          originRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                          overIndex: index,
                        });
                      }}
                    >
                      {resolved ? (
                        <>
                          {editMode && (
                            <button
                              className="pad-clear"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                clearPad(pad.key);
                              }}
                            >
                              <X size={12} />
                            </button>
                          )}
                          <span className="chord-name">{chordLabel(resolved.chord)}</span>
                          <span className="function-badge">
                            {resolved.detail ?? FUNCTION_LABELS[resolved.function]}
                          </span>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {drag &&
                (() => {
                  const draggedPad = pads.find((p) => p.key === drag.key);
                  const resolved = draggedPad?.source
                    ? resolvePadSource(draggedPad.source, diatonicChords, scale)
                    : null;
                  if (!resolved) return null;
                  return (
                    <div
                      className={`pad floating-drag function-${resolved.function}`}
                      style={{
                        left: drag.originRect.left,
                        top: drag.originRect.top,
                        width: drag.originRect.width,
                        height: drag.originRect.height,
                        transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.08)`,
                      }}
                    >
                      <span className="chord-name">{chordLabel(resolved.chord)}</span>
                      <span className="function-badge">
                        {resolved.detail ?? FUNCTION_LABELS[resolved.function]}
                      </span>
                    </div>
                  );
                })()}
            </section>
          </div>
        </div>
      </div>
      {flyingChips.map((chip) => (
        <FlyingChipView key={chip.id} chip={chip} />
      ))}
    </div>
  );
}

export default App;
