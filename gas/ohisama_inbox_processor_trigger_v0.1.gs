/**
 * OC-OS Inbox Processor v0.1 - Hourly trigger helper
 *
 * Requires runInboxProcessorV01() in the same Apps Script project.
 * Initial production cadence: once per hour.
 */

function installInboxProcessorHourlyTriggerV01() {
  const handler = 'runInboxProcessorV01';

  // Avoid duplicate processor triggers.
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Inbox Processor hourly trigger installed.');
  showInboxProcessorTriggersV01();
}

function removeInboxProcessorTriggersV01() {
  const handler = 'runInboxProcessorV01';
  let removed = 0;

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler)
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      removed++;
    });

  console.log(`Removed processor triggers = ${removed}`);
}

function showInboxProcessorTriggersV01() {
  const handler = 'runInboxProcessorV01';

  const triggers = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler);

  console.log('========================================');
  console.log('OC-OS INBOX PROCESSOR TRIGGERS');
  console.log(`handler = ${handler}`);
  console.log(`count = ${triggers.length}`);

  triggers.forEach((t, i) => {
    console.log(
      `${i + 1}. eventType=${t.getEventType()} / source=${t.getTriggerSource()}`
    );
  });

  console.log('========================================');
}
