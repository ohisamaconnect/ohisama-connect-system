# OC-OS Calendar Integration v1.0

基準日: 2026-09-26

## 1. 目的

Google CalendarをOC-OSと日向坂46予定の共通時間軸として使う。

Calendar自体を新しい情報DBにはしない。OC-OSの制作日程と既存の日向坂46カレンダーを同じGoogle Calendar画面で重ねて確認できる状態を作る。

## 2. Calendar Topology

現在の接続構成:

```text
おひさまコネクト      owner / primary
日向坂46カレンダー    reader
日本の祝日            reader
```

運用:

- OC-OSが書き込むのは `おひさまコネクト` カレンダーだけ。
- `日向坂46カレンダー` は既存の読取カレンダーをそのまま表示する。
- 日向坂46予定をOC-OSカレンダーへコピーしない。
- Notion EVENTSをCalendarへ一括複製しない。

これにより同一予定の二重管理を避ける。

## 3. EPISODE Calendar Mirror

EPISODESをCanonical sourceとして、以下だけをCalendarへミラーする。

### Recording

```text
🎙️ おひさまコネクト収録｜<Episode_Key>
```

`Recording_Date` に作成。

収録開始時刻は勤務等により実運用上の幅があるため、初期Canonicalでは**日付マーカー（all-day）**とする。

Calendar descriptionへEPISODE Notion URL / Episode Folder URLを入れる。

### Air

```text
📻 おひさまコネクト本放送｜<Episode_Key>
```

`Air_Date` に作成。

通常の放送開始は設定値 `OC_AIR_START_TIME` を使う。未設定時のDefaultは `19:30`、Duration Defaultは30分とする。

放送枠変更時はScript Propertyで変更でき、コード改修を不要にする。

## 4. Rerun

再放送は時期により変更可能性があるため、初期EPISODE Calendar Mirrorでは自動生成しない。

将来、再放送時刻をEPISODEまたは番組設定としてCanonical化した場合に追加する。

## 5. EPISODES Properties

```text
Recording_Calendar_Event_ID
Air_Calendar_Event_ID
Calendar_Synced_At
```

Event IDをEPISODE側へ保存することで、再同期時に新規重複作成せず既存Calendar eventを更新する。

## 6. Sync Rule

Preview:

```text
previewEpisodeCalendarSyncV01()
```

Write:

```text
syncEpisodeCalendarV01()
```

Writeには `OC_TARGET_EPISODE_KEY` を必須とする。

同期時:

- Event IDがありCalendar eventが存在 → update
- Event IDがあるがeventが存在しない → recreateしてID更新
- Event IDがない → createしてID保存
- Production_Statusは変更しない
- 日向坂46カレンダーは変更しない

## 7. Calendar Is a Mirror

日付のCanonical sourceはEPISODESの `Recording_Date / Air_Date`。

Calendar上で日付を変更しただけではNotionへ逆同期しない。

日付を変更する場合:

```text
EPISODESを修正
↓
Calendar Sync
```

の順とする。

Calendarは制作判断DBではなく、時間軸で見るためのMirrorである。

## 8. Automation

初期Pilotではtriggerを自動設置しない。

End-to-End Pilot後に安定した場合、Weekly Episode Bootstrap直後または日次の安全同期として自動化を検討する。

## 9. Principle

Calendar統合の目的は情報を複製することではなく、

```text
OC-OSの制作予定
+
既存の日向坂46予定
```

を一つの時間軸で見られるようにすることにある。