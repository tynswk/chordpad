# ChordPad 仕様書 (v0.3 / 実装反映版)

## 1. 概要

ブラウザで動作するコードパッド楽器アプリ。キー/スケールを設定し、ダイアト
ニックコード・ノンダイアトニックコードをパッドに配置してタップで鳴らせる。
ピアノ/ギター（ソフトクリップのオーバードライブ・アンプEQ付き）の音色、
BPMに合わせた1小節分の8分音符アルペジオで再生し、コードの和声機能（トニ
ック/サブドミナント/ドミナント/セカンダリードミナント/借用和音）を表示す
る。パッドは編集モードでドラッグ並べ替え可能。ライト/ダークテーマ切替、
スマホ/タブレット対応、GitHub Pagesでの公開に対応。

- 実行環境: Webアプリ（React + TypeScript + Vite、Web Audio API）
- デプロイ: GitHub Pages（`https://<user>.github.io/chordpad/`）

## 2. 実装状況

| フェーズ | 内容 | 状態 |
|---|---|---|
| 1 | スケール設定・ダイアトニックコード自動生成・機能表示・パッド配置・ピアノ音 | ✅ 完了 |
| 2 | ギター音色(オーバードライブ/アンプEQ)・BPM・ノンダイアトニックのコードビルダー | ✅ 完了 |
| 3 | アルペジオ再生・セカンダリードミナント/借用和音の判定・パッド編集(並べ替え) | ✅ 完了 |
| 3 (残) | 進行アシスト機能（次に弾くと良いコードのハイライト） | 未着手 |
| UI/UX | ライト/ダーク切替・カスタムドロップダウン・レスポンシブ対応 | ✅ 完了 |
| デプロイ | GitHub Pages + Actions | ✅ 完了 |

## 3. スケール設定

- ルート音12音、スケール種別: Major / Minor（ナチュラルマイナー）
- 各度数のダイアトニックコード（トライアド/7th切替可、切替は「Diatonic
  Chords」欄のトグル）を自動算出
- マイナー時「Strong V」トグル（ヘッダー内）で v→V（ハーモニックマイナー
  由来の強いドミナント）に切替可能

## 4. コードの機能表示

`src/music/theory.ts` の `getChordFunctionDetail()` が次の優先順で判定する。

1. **ダイアトニック一致**: Tonic(T) / Subdominant(SD) / Dominant(D)
   （トライアド/7thの品質差は無視して判定するため、7thモードを切り替えて
   もパッド上の機能表示が崩れない）
2. **セカンダリードミナント**: ルートの完全5度下にダイアトニックコードが
   あるMajor/7thコード。バッジに `V/ii` のように解決先の度数を表示
3. **借用和音（モーダルインターチェンジ）**: 同主長調/短調のダイアトニッ
   クコードと一致するコード。バッジは固定で「借用」（詳細説明文は付けず、
   バッジサイズが一定になるようにしている）
4. どれにも該当しなければ非該当「—」

## 5. コード配置

- ダイアトニックパレット: 現在のキー/スケールの7コードを一覧表示、試聴＋
  パッドへの追加が可能。パッドに追加したダイアトニックコードは**度数への
  参照**として保持されるため、スケール/7thモードの変更に自動追従する
  （`PadSource = {kind:"diatonic", degree} | {kind:"custom", chord}`）
- Chord Builder: ルート音×コード品質を自由に組み合わせてプレビュー・パッ
  ド追加。ノンダイアトニックコードもここから作成（`kind:"custom"`として
  固定のコードを保持）
- パッドは4×4=16個。タップで再生、×で個別削除、Clear Allで一括クリア

### パッド編集（並べ替え）

- 編集アイコン（鉛筆）ボタンでパッドグリッドが編集モードに入り、既存パッ
  ドがiOSのホーム画面のようにプルプル揺れる。「×」削除ボタンと「Clear
  All」も編集モード中のみ表示される（通常時は隠す）
- 編集モード中はパッドをポインター（マウス/タッチ両対応、Pointer Events
  使用）でつかむと手前に浮き上がり、グリッドにスナップせずポインターに
  追従して自由に動く（`transform: translate()`のみで見た目上移動、配列
  の並べ替えはドラッグ中は行わない）。指を離した位置の下にあるスロット
  へその場でスナップして収まる
- 各パッドは表示位置と独立した安定な`key`を持ち、ドラッグ中の追跡はこの
  `key`で行う（表示位置のインデックスを識別子に使うと、入れ替え中に基準
  がずれるバグがあったため分離した）

## 6. 音色

### ピアノ
- トライアングル波オシレーター + ADSRエンベロープ（`src/audio/engine.ts`）
- ボイシング: ルートの1オクターブ下にベース音、トップの1オクターブ上に
  重ね音を追加した幅広い響き（`src/audio/voicing.ts`）

### ギター
- **Karplus-Strong物理モデル**（`../ChordTraining`の実装を移植）による撥
  弦シミュレーション。AudioWorkletでノイズバーストをフィードバックループ
  減衰させ、実際の弦のような自然なサステインを再現
  (`src/audio/karplusStrong.ts`, `public/audio-worklets/karplus-strong-processor.js`)
  - 減衰係数(damping)は周波数から自動算出
- ボイシング: レギュラーチューニング(EADGBE)の各弦で最も近いフレット位置
  のコード構成音を鳴らす、実際のギターに近い運指ベースの発音
- 信号チェーン: Karplus-Strong Pluck → PreGain → WaveShaper(Overdrive) →
  Amp EQ(Low/Mid/High, BiquadFilterNode×3) → PostGain → Master
  - オーバードライブ: tanhによるソフトクリップ（`makeOverdriveCurve()`,
    `src/audio/distortion.ts`）。深く歪みすぎないよう調整済み
  - キャビネットIRシミュレーションは、フリー配布IRの再配布ライセンスが
    不明瞭だったため実装せず削除済み

### 共通
- 新しいパッドをタップすると、前のコードで鳴っていたボイス（ピアノのオ
  シレーター/ギターのKarplus-Strongプラック）を即座にフェードアウトして
  停止する（`src/audio/voiceRegistry.ts`）。コードが重なって鳴り続けるこ
  とはない
- Piano/Guitarの切替ボタンは`lucide-react`のアイコン（KeyboardMusic/Guitar）

## 7. 再生（アルペジオ / ストローク）

- 再生モードを2択で選択可能:「アルペジオ」= 1小節・8分音符×8ステップの
  上行アルペジオ（コード構成音を音数分ループしながら8ステップ埋める、
  `playChordArpeggio()`）／「ストローク」= コード構成音を全て同時に鳴らす
  だけ（パターンなし、`playChordBlock()`）(`src/audio/engine.ts`)
- BPM設定: `−`/`+`ボタン付きの数値ステッパー（直接入力も可）＋タップテン
  ポボタン（直近最大6タップの平均間隔から算出、2秒以上間が空いたらリセッ
  ト）。範囲は40〜240 (`MIN_BPM`/`MAX_BPM`, `src/state/types.ts`)

## 8. UI

- カスタムドロップダウン(`src/components/Select.tsx`)でOSネイティブの
  `<select>`見た目を排除し、丸ボタン＋すりガラス（`backdrop-filter: blur`）
  のカード型メニューに統一
- 配色は青系（`--accent`等、`src/index.css`）。ボタンやアクティブ状態の
  グラデーション装飾は使わずフラットカラーで統一（AIっぽい安っぽさを避け
  る意図、詳細は `../CLAUDE.md` のUI/UXデザイン方針を参照）
- アイコンはUnicode絵文字ではなく`lucide-react`（フリー/オープンソースの
  アイコンライブラリ）を使用
- Piano/Guitar・アルペジオ/ストロークの切替は、選択中の項目にスライドす
  る背景ピル（`.instrument-switch-indicator`）でアニメーション表示
- トグルスイッチ、pill型ボタン、ノブ風の縦スライダーなど一貫したデザイン
- ライト/ダークテーマ切替ボタン（`localStorage`に保存、未設定時はOS設定
  に従う）。テーマ切替時は`<meta name="theme-color">`も同期させ、iOSの
  ステータスバー色を背景色と揃える
- フォント: Inter（英数字）+ Noto Sans JP（日本語）をGoogle Fontsから読込
- 説明的なキャプション文（「〜できます」等）は極力置かず、見た目から動作
  が分かるUIを優先
- レスポンシブ対応: スマホ(〜480px)・タブレット・PCで表示確認済み。700px
  以上ではサイドバー(コントロール)＋パッド盤面の2カラムレイアウトで画面
  を広く使う。パッドは正方形(`aspect-ratio:1`)を保ったまま、幅と高さ
  （`92vh`/短い横向きは`88vh`）の両方に収まる最大サイズまで拡大される
  （`.layout-main .pad-section` の `max-width`）。高さの低い横向き画面
  （`max-height:500px`）ではサイドバー幅も220pxまで縮め、パッド側に余白
  を回す。タップ操作向けに`touch-action: manipulation`、ダブルタップズー
  ム防止のviewport設定を追加
- iOS/iPadOSのノッチ・ステータスバーとの重なりを避けるため
  `env(safe-area-inset-*)`を`.app`のパディングに反映
- 699px以下（縦画面スマホなど）ではPadパネルを画面下部に**常時最前面固定
  表示**し、コントロール類をスクロールしてもPadを探す必要がないようにし
  た。パネル上部のバー（グリップのみ、テキストラベルやボタンは無し）は
  タップでも上下スワイプでも開閉できる（`touch-action:none`でブラウザの
  スクロールに奪われないようにしている）。展開時にサイドバー側の一番下
  の設定までスクロールで到達できるよう、サイドバーの下部余白をパネルの
  最大展開高さ分確保している(`.pad-panel`, `src/App.css`)
- 展開したPadパネル内の4×4グリッドは、正方形にせず利用可能な高さぴったり
  に収まるフレキシブルな行高（`grid-template-rows: repeat(4, 1fr)`）にす
  ることで、スクロールバーが出ないようにしている

## 9. デプロイ

- `vite.config.ts`: ビルド時のみ`base: '/chordpad/'`を設定（開発サーバー
  はルートのまま動作するようcommand分岐）
- `.github/workflows/deploy.yml`: pushで`npm ci && npm run build`後、
  GitHub Pages(Actions)へ自動デプロイ
- リポジトリ: `github.com/<owner>/chordpad`（public、Pages有効化）

## 10. データモデル（抜粋、TypeScript）

```ts
// src/music/theory.ts
type ScaleType = "major" | "minor";
type ChordQuality = "major"|"minor"|"dim"|"aug"|"sus2"|"sus4"|"7"|"maj7"|"m7"|"m7b5"|"6"|"m6"|"add9"|"blk";
// "blk" = Blackadder chord（イキスギコード）: root, #11, b7, 9（3rd/5th省略）
type ChordFunction = "tonic"|"subdominant"|"dominant"|"secondaryDominant"|"borrowed"|"nonDiatonic";
interface ChordFunctionResult { function: ChordFunction; detail?: string } // detail: "V/ii" など
interface ChordDef { root: NoteName; quality: ChordQuality; octave: number }

// src/state/types.ts
interface Timbre {
  type: "piano" | "guitar";
  distortionAmount: number; // 0-100 (Overdrive knob)
  ampEQ: { low: number; mid: number; high: number };
  masterVolume: number;
}
interface PlaybackSettings { bpm: number; mode: "arpeggio" | "block" }

// src/App.tsx
type PadSource = { kind: "diatonic"; degree: number } | { kind: "custom"; chord: ChordDef };
interface PadState { key: number; source: PadSource | null }
```

## 11. パッドグリッドサイズ

- Padsヘッダーのドロップダウンでグリッドサイズ（2×2〜6×4のプリセット）を
  切替可能。縮小時は末尾のパッドを切り詰め、拡大時は空パッドを追加する
  （既存パッドの内容は保持、`GRID_PRESETS`, `src/App.tsx`）
- `pad-grid`の`grid-template-columns`/`grid-template-rows`はReactの
  インラインstyleで動的に設定

## 12. アプリらしい挙動（ホーム画面追加・ランドスケープ）

- `public/manifest.json`を追加し、`display:standalone`・テーマカラーを
  設定。iOSの「ホーム画面に追加」時のステータスバー領域は
  `env(safe-area-inset-*)`を`.app`のpaddingに反映して回避
- ランドスケープ（`orientation:landscape`かつ`min-width:700px`）では
  `.app`の`max-width`制限を解除し左右の余白を無くした上で、`height:
  100dvh; overflow:hidden`とし、サイドバーのみ内部スクロールさせることで
  ページ全体のスクロールが起きないようにしている
- 全体で`user-select:none`（`input`/`textarea`は除く）にし、Webページで
  はなくアプリらしい操作感にしている
- Padsパネル・パッドグリッドには`overscroll-behavior: contain`を設定し、
  パッド領域のスクロール操作が背後のページをスクロールさせないようにした
- パッド編集モードでない・パッドが1つも配置されていない場合は「+」ラベル
  を表示しない（ダイアトニックパレット側の「+追加」ボタンから配置する
  導線のみを残し、パッド自体が押せそうに見えないようにした）
- モバイルのPadsパネルは、タップだけでなく上下スワイプでも開閉でき、指の
  動きにその場で追従する（離した時点でスナップ判定するのではなく、ドラ
  ッグ中は`pad-panel-body`の`max-height`を指の位置から直接計算して更新）

## 13. 今後（未着手）

- 進行アシスト機能（次に弾くと良いコードのハイライト、ON/OFF可）
- 状態の永続化（パッド配置・設定のlocalStorage保存）
- アルペジオのパターン/音価のカスタマイズ（現状は固定: 上行・8分・1小節）
