/**
 * OC-OS INBOX AI Suggestion v0.2.5 Commit Guard Dry Run
 * 2026-09-29
 *
 * PURPOSE
 * -------
 * Existing v0.2.4 staged snapshot を材料に、v0.2.5 の live commit guard を
 * READ ONLY で模擬する。
 *
 * WRITE = NONE
 * GEMINI = NONE
 * SCRIPT PROPERTIES = READ ONLY
 * NOTION = READ ONLY
 *
 * This does NOT convert or commit the v0.2.4 stage.
 */

function previewInboxAiSuggestionCommitGuardDryRunV025() {
  suggestionValidateConfig_();

  const stage = aiSuggestionLoadStageV024_();
  const events = suggestionLoadEvents_();
  const eventIds = new Set(events.map(e => e.id));

  let wouldWrite = 0;
  let skipHuman = 0;
  let skipAlreadySuggested = 0;
  let skipRevision = 0;
  let skipUnexpectedObservation = 0;
  let eventMissing = 0;
  let readFailed = 0;

  console.log('========================================');
  console.log('OC-OS INBOX AI SUGGESTION v0.2.5 COMMIT GUARD DRY RUN');
  console.log('SOURCE_STAGE = existing v0.2.4');
  console.log(`STAGE_ID = ${stage.meta.stageId}`);
  console.log(`ITEMS = ${stage.items.length}`);
  console.log('WRITE = NONE');
  console.log('GEMINI_CALL = NONE');
  console.log('SCRIPT_PROPERTIES = READ ONLY');
  console.log('========================================');

  stage.items.forEach(stagedItem => {
    try {
      const page = suggestionNotionRequest_(`/v1/pages/${stagedItem.pageId}`, 'get');
      const current = suggestionParseInboxPageV011_(page);
      const liveClass = aiSuggestionObservationClassV025_(current.observationType);

      if (liveClass === 'REVISION') {
        skipRevision++;
        console.log(`[DRY SKIP LIVE SOURCE_REVISION] ${stagedItem.title}`);
        return;
      }
      if (liveClass !== 'ALLOWED') {
        skipUnexpectedObservation++;
        console.log(`[DRY SKIP LIVE UNEXPECTED OBSERVATION] ${stagedItem.title} | ${current.observationType || '(blank)'}`);
        return;
      }

      if (current.decision && current.decision !== '未判断') {
        skipHuman++;
        console.log(`[DRY SKIP HUMAN DECISION] ${stagedItem.title} | ${current.decision}`);
        return;
      }

      if (current.suggestedDecision && current.suggestedDecision !== '未提案') {
        skipAlreadySuggested++;
        console.log(`[DRY SKIP ALREADY SUGGESTED] ${stagedItem.title} | ${current.suggestedDecision}`);
        return;
      }

      const proposal = stagedItem.proposal || {};
      if (proposal.eventId && !eventIds.has(proposal.eventId)) {
        eventMissing++;
        console.log(`[DRY BLOCK EVENT MISSING] ${stagedItem.title} | ${proposal.eventId}`);
        return;
      }

      wouldWrite++;
      console.log(`[DRY WOULD WRITE] ${(proposal && proposal.suggestedDecision) || '-'} | ${stagedItem.title}`);
    } catch (err) {
      readFailed++;
      console.log(`[DRY READ FAILED] ${stagedItem.title || stagedItem.pageId}: ${suggestionErrorMessage_(err)}`);
    }
  });

  console.log('========================================');
  console.log(`WOULD_WRITE = ${wouldWrite}`);
  console.log(`SKIP_HUMAN_DECISION = ${skipHuman}`);
  console.log(`SKIP_ALREADY_SUGGESTED = ${skipAlreadySuggested}`);
  console.log(`SKIP_SOURCE_REVISION = ${skipRevision}`);
  console.log(`SKIP_UNEXPECTED_OBSERVATION = ${skipUnexpectedObservation}`);
  console.log(`BLOCK_EVENT_MISSING = ${eventMissing}`);
  console.log(`READ_FAILED = ${readFailed}`);
  console.log('----------------------------------------');
  console.log('SOURCE_REVISION / unexpected = READ ONLY SKIP');
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('DRY RUN COMPLETE / WRITE = NONE');
  console.log('========================================');
}
