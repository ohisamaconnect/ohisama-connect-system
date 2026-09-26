# OC-OS Calendar Contract v1.0

基準日: 2026-09-26

## 1. 目的

Google Calendarを、OC-OSの制作予定と日向坂46関連予定を同じ画面で見渡すための運用レイヤーとして使う。

Calendar自体をCanonical DBにはしない。

## 2. 現在のCalendar構成

Google Calendar上では以下を同時表示できる。

- 主カレンダー: `おひさまコネクト`（OC-OSが書込み可能）
- `日向坂46カレンダー`（read-only）
- 日本の祝日

## 3. Separation Rule

### おひさまコネクト Calendar

OC-OS由来の制作予定だけを書き込む。

初期対象:

```text
収録開始目安
本放送
再放送
```

将来必要になれば公開予定等を追加できる。

### 日向坂46カレンダー

閲覧・予定把握の補助として使用する。

このCalendarの内容を、そのままHHAやOC-OSのCanonical事実へ自動昇格しない。

HHAは引き続きSource-Firstで一次情報確認を必要とする。

## 4. EPISODESとの関係

Canonicalな日付はEPISODESに保持する。

```text
Recording_Date
Air_Date
```

Calendarはそれを人間が見やすくする表示・運用面である。

Calendar上の予定からEPISODESのCanonical値を逆算・上書きしない。

## 5. Initial Event Set

1 EPISODEにつき、初期Calendar Bridgeは以下を扱う。

### Recording Marker

```text
🎙️ おひさまコネクト収録開始｜<Episode_Key>
```

Recording_Date 21:00 JSTを開始目安とする。

終了時刻を意味づけないため、初期実装では15分の透明なMarker Eventとする。

### Main Broadcast

```text
☀️ おひさまコネクト 本放送｜<Episode_Key>
```

初期既定:

```text
19:30–19:58 JST
```

### Repeat Broadcast

```text
🔁 おひさまコネクト 再放送｜<Episode_Key>
```

初期既定:

```text
Air_Date翌日 20:00–20:28 JST
```

放送枠変更時はContract / configを更新する。

## 6. Calendar Bridge Safety

初期Bridgeは `create-missing-only` とする。

- イベントがなければ作成候補
- 同一markerのイベントがあれば再利用
- 時刻が異なっても自動上書きしない
- 既存イベントを削除しない
- CalendarからNotionを更新しない
- recurrence seriesを勝手に作らない
- no trigger

## 7. Idempotency Marker

Calendar event descriptionに以下を保持する。

```text
OC-OS-CALENDAR:<Episode_Key>:RECORDING
OC-OS-CALENDAR:<Episode_Key>:AIR
OC-OS-CALENDAR:<Episode_Key>:REPEAT
```

同一markerが複数見つかった場合は自動作成を停止し、人間確認事項とする。

## 8. Target Safety

PreviewはRecording_Date近傍EPISODEを参照可能。

WRITEはScript Property

```text
OC_TARGET_EPISODE_KEY
```

を必須とする。

## 9. Calendar Is Not Canonical

Calendarは予定を見渡すためのインターフェースである。

```text
HHA facts          → HHA Canonical DB
OC production      → OC-OS / EPISODES
Calendar           → schedule display / reminder layer
```

Calendar上にあるという理由だけで事実確定しない。

## 10. Wednesday Principle

Calendar同期に失敗しても、水曜日の収録は行える。

Calendar Bridgeは見落とし防止と見通し改善のための補助であり、制作の必須依存にはしない。
