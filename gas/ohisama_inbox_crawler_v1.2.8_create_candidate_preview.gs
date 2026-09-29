/**
 * OC-OS INBOX Crawler v1.2.8 Create Candidate Preview
 * 2026-09-29
 *
 * READ ONLY helper.
 * Shows CREATE_NEW_SOURCE / CREATE_SOURCE_REVISION candidates from
 * official-news / official-blog / official-youtube using v1.2.7 classifier.
 *
 * Dependencies:
 *   ohisama_inbox_crawler_v1.2.6
 *   ohisama_inbox_crawler_v1.2.7_production_runner.gs
 */

function previewV128CreateCandidates() {
  validateBaseConfig_();

  console.log('========================================');
  console.log('OC-OS INBOX CRAWLER v1.2.8 CREATE CANDIDATE PREVIEW');
  console.log('WRITE = NONE');
  console.log('========================================');

  const raw = []
    .concat(collectOfficialNews_() || [])
    .concat(collectOfficialBlogs_() || [])
    .concat(collectOfficialYouTube_() || []);

  const normalized = normalizeAndDeduplicateCandidates_(raw)
    .filter(isStableTargetV127P_);

  const state = loadSeenStateV127P_();
  const creates = [];

  normalized.forEach(item => {
    const d = classifyItemV127P_(item, state);
    if (d.action === 'CREATE_NEW_SOURCE' || d.action === 'CREATE_SOURCE_REVISION') {
      creates.push({ item, decision: d });
    }
  });

  console.log(`RAW_COLLECTED = ${raw.length}`);
  console.log(`NORMALIZED_TARGET = ${normalized.length}`);
  console.log(`CREATE_CANDIDATES = ${creates.length}`);
  console.log('----------------------------------------');

  creates.forEach((x, i) => {
    console.log(`${i + 1}. ${x.decision.action}`);
    console.log(`   collector=${x.item.collector || '-'}`);
    console.log(`   title=${x.item.title || '-'}`);
    console.log(`   url=${x.item.url || '-'}`);
    console.log(`   publishedAt=${x.item.publishedAt || '-'}`);
    console.log(`   eventDateHint=${x.item.eventDateHint || '-'}`);
    console.log(`   publisher=${x.item.publisher || '-'}`);
    if (x.decision.latest) {
      console.log(`   previousTitle=${x.decision.latest.title || '-'}`);
      console.log(`   previousDetectedAt=${x.decision.latest.detectedAt || '-'}`);
    }
  });

  console.log('========================================');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}
