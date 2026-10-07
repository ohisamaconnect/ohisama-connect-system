-- MEMBER VOICES small write Pilot permanent Voice_ID reservation ledger
-- Date: 2026-10-08 JST
-- Allocator Contract: MEMBER VOICES Voice_ID Allocator Contract v1.0
-- This file is a durable bootstrap/recovery ledger for the five reservations.
-- It must be applied to voice_id_allocations before any later production allocator run
-- if the persistent SQLite file is initialized after this Pilot.

BEGIN IMMEDIATE;

INSERT OR IGNORE INTO voice_id_allocations
(sequence_no, voice_id, candidate_key, allocation_status)
VALUES
(1, 'VOC-000001', 'vc_e891802aeb10c6728e59edb0', 'RESERVED'),
(2, 'VOC-000002', 'vc_63d9ceb49e6950cbde1d5107', 'RESERVED'),
(3, 'VOC-000003', 'vc_9720c2b05f9eb95e3e75248d', 'RESERVED'),
(4, 'VOC-000004', 'vc_af2cf9567cbc761098ac1a04', 'RESERVED'),
(5, 'VOC-000005', 'vc_31ad1a517c34c98e60b569b7', 'RESERVED');

COMMIT;

-- Recovery invariants:
-- candidate_key vc_e891802aeb10c6728e59edb0 -> VOC-000001
-- candidate_key vc_63d9ceb49e6950cbde1d5107 -> VOC-000002
-- candidate_key vc_9720c2b05f9eb95e3e75248d -> VOC-000003
-- candidate_key vc_af2cf9567cbc761098ac1a04 -> VOC-000004
-- candidate_key vc_31ad1a517c34c98e60b569b7 -> VOC-000005
-- Do not reuse these numbers for other candidates, even if a later Notion write fails.
