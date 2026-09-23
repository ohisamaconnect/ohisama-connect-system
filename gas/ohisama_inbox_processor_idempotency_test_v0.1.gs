/**
 * OC-OS Inbox Processor v0.1 - Idempotency diagnostic
 * WRITE = NONE
 *
 * Existing production records are queried only.
 * Requires ohisama_inbox_processor_v0.1.gs in the same Apps Script project.
 */
function testInboxProcessorIdempotencyLookupsV01() {
  processorValidateConfig_();

  const sourceUrl = 'https://www.youtube.com/watch?v=gdNMV9Qgjmo';
  const originInboxId = '3e4031bc0d4581a28a60d8ea959477d3';

  console.log('========================================');
  console.log('OC-OS PROCESSOR IDEMPOTENCY LOOKUP TEST');
  console.log('WRITE = NONE');
  console.log('========================================');

  const sources = processorFindSourceByUrl_(sourceUrl);
  console.log(`SOURCE exact URL matches = ${sources.length}`);

  if (sources.length !== 1) {
    throw new Error(
      `Expected exactly 1 SOURCE for URL, found ${sources.length}`
    );
  }

  const events = processorFindEventByOriginInbox_(originInboxId);
  console.log(`EVENT Origin_Inbox matches = ${events.length}`);

  if (events.length !== 1) {
    throw new Error(
      `Expected exactly 1 EVENT for Origin_Inbox, found ${events.length}`
    );
  }

  const sourceId = sources[0].id;
  const eventId = events[0].id;

  const eventPage = processorNotionRequest_(
    `/v1/pages/${eventId}`,
    'get'
  );

  const eventSourceIds = processorRelationIds_(
    ((eventPage.properties || {}).Sources)
  );

  const sourceAlreadyLinked = eventSourceIds.includes(sourceId);

  console.log(`SOURCE id = ${sourceId}`);
  console.log(`EVENT id = ${eventId}`);
  console.log(`EVENT already contains SOURCE = ${sourceAlreadyLinked}`);

  if (!sourceAlreadyLinked) {
    throw new Error(
      'Existing EVENT does not contain the expected SOURCE relation.'
    );
  }

  const uniqueProbe = processorUniqueIds_([
    sourceId,
    sourceId,
    eventId,
    eventId
  ]);

  console.log(`UNIQUE merge probe = ${uniqueProbe.length} unique from 4 inputs`);

  if (uniqueProbe.length !== 2) {
    throw new Error('processorUniqueIds_ deduplication failed.');
  }

  console.log('----------------------------------------');
  console.log('PASS: exact URL SOURCE reuse lookup = OK');
  console.log('PASS: Origin_Inbox EVENT reuse lookup = OK');
  console.log('PASS: relation ID deduplication = OK');
  console.log('IDEMPOTENCY LOOKUP TEST PASSED');
  console.log('========================================');
}
