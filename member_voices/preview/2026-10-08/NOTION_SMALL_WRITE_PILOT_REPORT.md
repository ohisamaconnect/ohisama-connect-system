# MEMBER VOICES Notion Small Write Pilot Report

Date: 2026-10-08 JST
Result: PASS

Notion DB: https://app.notion.com/p/8e42254b8e80449fb34a5ffcf38d5c49
Data Source: collection://5654b651-42b9-4590-b737-de85bc9a05a8

Permanent Voice_ID format: VOC- + 6 digits.

Written and read back:
- VOC-000001 / vc_e891802aeb10c6728e59edb0 / Article 25481 / 小坂菜緒
- VOC-000002 / vc_63d9ceb49e6950cbde1d5107 / Article 35133 / 小坂菜緒
- VOC-000003 / vc_9720c2b05f9eb95e3e75248d / Article 35133 / 小坂菜緒
- VOC-000004 / vc_af2cf9567cbc761098ac1a04 / Article 65922 / 大田美月
- VOC-000005 / vc_31ad1a517c34c98e60b569b7 / Article 67706 / 大田美月

Read-back verification: 5/5 PASS.
Checked Voice_ID, candidate key, Speaker relation, source IDs/URLs/Archive reference/locator, Published_At, Status and topic fields.
VOC-000004 preserved a PROVISIONAL Anchor without a fake HHA relation.
VOC-000005 correctly related to HHA SONG SNG-090 / 月と星が踊るMidnight.

All five remain AUTO INDEXED.
Article 26676 (0 VOICE) produced no Notion row.
Article 71234 (SPEAKER_MISMATCH BLOCK) produced no Notion row.

Views created:
- All VOICES
- Review Queue
- Source Checked
- Pinned
- By Speaker

Reservation ledger:
member_voices/allocations/2026-10-08_pilot_voice_id_reservations.sql

Commit ledger:
member_voices/allocations/2026-10-08_pilot_voice_id_commits.sql

Restart invariant: next permanent ID is VOC-000006.

Persistent production SQLite in Drive is not yet established from this chat runtime. Before unattended or bulk production, initialize the persistent SQLite store, replay reservation/commit ledgers, verify MAX(sequence_no)=5, and then start at VOC-000006.

Bulk processing/write remains unauthorized.
