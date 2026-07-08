# ChordPad 仕様書 (v0.2 / 実装反映版)

## 1. 概要

ブラウザで動作するコードパッド楽器アプリ。キー/スケールを設定し、ダイアト
ニックコード・ノンダイアトニックコードをパッドに配置してタップで鳴らせる。
ピアノ/ギター（ソフトクリップのオーバードライブ・アンプEQ付き）の音色、
BPM・ストロークパターンに対応し、コードの和声機能（トニック/サブドミナン
ト/ドミナント）を表示する。ライト/ダークテーマ切替、スマホ/タブレット対応、
GitHub Pagesでの公開に対応。

- 実行環境: Webアプリ（React + TypeScript + Vite、Web Audio API）
- デプロイ: GitHub Pages（`https://<user>.github.io/chordpad/`）

## 2. 実装状況

| フェーズ | 内容 | 状態 |
|---|---|---|
| 1 | スケール設定・ダイアトニックコード自動生成・機能表示(T/SD/D)・パッド配置・ピアノ音 | ✅ 完了 |
| 2 | ギター音色(オーバードライブ/アンプEQ)・BPM&ストローク・ノンダイアトニックのコードビルダー | ✅ 完了 |
| 3 | アルペジオ機能・セカンダリードミナント判定・進行アシスト機能 | 未着手 |
| UI/UX | ライト/ダーク切替・カスタムドロップダウン・レスポンシブ対応 | ✅ 完了 |
| デプロイ | GitHub Pages + Actions | 進行中 |

## 3. スケール設定

- ルート音12音、スケール種別: Major / Minor（ナチュラルマイナー）
- 各度数のダイアトニックコード（トライアド/7th切替可）を自動算出
- マイナー時「Strong V」トグルで v→V（ハーモニックマイナー由来の強いドミ
  ナント）に切替可能
- 機能ラベル: Tonic(T) / Subdominant(SD) / Dominant(D) / 非該当は「—」
  (`src/music/theory.ts`)

## 4. コード配置

- ダイアトニックパレット: 現在のキー/スケールの7コードを一覧表示、試聴＋
  パッドへの追加が可能
- Chord Builder: ルート音×コード品質（major/minor/dim/aug/sus2/sus4/7/
  maj7/m7/m7b5/6/add9）を自由に組み合わせてプレビュー・パッド追加。ノンダ
  イアトニックコードもここから作成
- パッドは4×4=16個。タップで再生、×で個別削除、Clear Allで一括クリア
- パッドの機能ラベルはスケール変更時にライブ再計算される

## 5. 音色

### ピアノ
- トライアングル波オシレーター + ADSRエンベロープ（`src/audio/engine.ts`）

### ギター
- **Karplus-Strong物理モデル**（`../ChordTraining`の実装を移植）による撥
  弦シミュレーション。AudioWorkletでノイズバーストをフィードバックループ
  減衰させ、実際の弦のような自然なサステインを再現
  (`src/audio/karplusStrong.ts`, `public/audio-worklets/karplus-strong-processor.js`)
  - 減衰係数(damping)は周波数から自動算出（低音ほど長くサステイン）
- 信号チェーン: Karplus-Strong Pluck → PreGain → WaveShaper(Overdrive) →
  Amp EQ(Low/Mid/High, BiquadFilterNode×3) → PostGain → Master
  - オーバードライブ: tanhによるソフトクリップ（`makeOverdriveCurve()`,
    `src/audio/distortion.ts`）。フリーIRの再配布ライセンスが不明瞭だった
    ため、キャビネットIRシミュレーション機能は削除済み

## 6. BPM & ストローク

- BPMスライダー（40〜240）
- 再生モード: 一括(block) / ストローク(strum)
- ストロークプリセット4種（`src/state/types.ts`）: 8分ジャカジャカ / 8分
  ダウンアップ / 4つ打ち / タン・タタン
- `AudioContext.currentTime`基準のスケジューリングでBPMに正確に同期

## 7. UI

- カスタムドロップダウン(`src/components/Select.tsx`)でOSネイティブの
  `<select>`見た目を排除し、丸ボタン＋ふわっと開くカード型メニューに統一
- トグルスイッチ、pill型ボタン、ノブ風の縦スライダーなど一貫した可愛らし
  いデザイン
- ライト/ダークテーマ切替ボタン（`localStorage`に保存、未設定時はOS設定
  に従う）
- フォント: Inter（英数字）+ Noto Sans JP（日本語）をGoogle Fontsから読込
- レスポンシブ対応: スマホ(〜480px)・タブレット・PCで表示確認済み。タップ
  操作向けに`touch-action: manipulation`、ダブルタップズーム防止のviewport
  設定を追加

## 8. デプロイ

- `vite.config.ts`: ビルド時のみ`base: '/chordpad/'`を設定（開発サーバー
  はルートのまま動作するようcommand分岐）
- `.github/workflows/deploy.yml`: pushで`npm ci && npm run build`後、
  GitHub Pages(Actions)へ自動デプロイ
- リポジトリ: `github.com/<owner>/chordpad`（public、Pages有効化）

## 9. データモデル（抜粋、TypeScript）

```ts
// src/music/theory.ts
type ScaleType = "major" | "minor";
type ChordQuality = "major"|"minor"|"dim"|"aug"|"sus2"|"sus4"|"7"|"maj7"|"m7"|"m7b5"|"6"|"add9";
type ChordFunction = "tonic"|"subdominant"|"dominant"|"nonDiatonic";
interface ChordDef { root: NoteName; quality: ChordQuality; octave: number }

// src/state/types.ts
interface Timbre {
  type: "piano" | "guitar";
  distortionAmount: number; // 0-100 (Overdrive knob)
  ampEQ: { low: number; mid: number; high: number };
  masterVolume: number;
}
interface PlaybackSettings { bpm: number; mode: "block"|"strum"; strokePatternId: string }
```

## 10. 今後（フェーズ3以降・未着手）

- アルペジオ機能（Up/Down/UpDown/Random、音価指定）
- セカンダリードミナント自動判定・表示
- 進行アシスト機能（次に弾くと良いコードのハイライト、ON/OFF可）
- 状態の永続化（パッド配置・設定のlocalStorage保存）
- パッドグリッドサイズの可変化
