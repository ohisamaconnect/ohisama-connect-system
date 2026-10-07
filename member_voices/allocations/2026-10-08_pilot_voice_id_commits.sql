-- MEMBER VOICES Pilot commit ledger
BEGIN IMMEDIATE;
UPDATE voice_id_allocations SET allocation_status='COMMITTED', voice_key='notion:3f2031bc0d45819388abdd9694c393ad', committed_at=CURRENT_TIMESTAMP WHERE candidate_key='vc_e891802aeb10c6728e59edb0' AND voice_id='VOC-000001';
UPDATE voice_id_allocations SET allocation_status='COMMITTED', voice_key='notion:3f2031bc0d45819bb2d0d562d04640cd', committed_at=CURRENT_TIMESTAMP WHERE candidate_key='vc_63d9ceb49e6950cbde1d5107' AND voice_id='VOC-000002';
UPDATE voice_id_allocations SET allocation_status='COMMITTED', voice_key='notion:3f2031bc0d4581b1afa8f2249a1c40fb', committed_at=CURRENT_TIMESTAMP WHERE candidate_key='vc_9720c2b05f9eb95e3e75248d' AND voice_id='VOC-000003';
UPDATE voice_id_allocations SET allocation_status='COMMITTED', voice_key='notion:3f2031bc0d4581fe8c7fd07f81069ddc', committed_at=CURRENT_TIMESTAMP WHERE candidate_key='vc_af2cf9567cbc761098ac1a04' AND voice_id='VOC-000004';
UPDATE voice_id_allocations SET allocation_status='COMMITTED', voice_key='notion:3f2031bc0d4581838a7ec7f041957628', committed_at=CURRENT_TIMESTAMP WHERE candidate_key='vc_31ad1a517c34c98e60b569b7' AND voice_id='VOC-000005';
COMMIT;
-- next permanent ID: VOC-000006
