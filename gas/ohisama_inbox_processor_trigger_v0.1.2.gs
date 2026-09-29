/**
 * OC-OS Inbox Processor v0.1.2 - Hourly trigger helper
 * 2026-09-29
 *
 * Target handler:
 *   runInboxProcessorV012()
 *
 * Safety:
 *   - Deletes only triggers for runInboxProcessorV012 before install
 *   - Does not touch crawler/suggestion/other triggers
 *   - Legacy runInboxProcessorV01 trigger should remain removed separately
 */

function installInboxProcessorHourlyTriggerV012() {
  const handler = 'runInboxProcessorV012';

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Inbox Processor v0.1.2 hourly trigger installed.');
  showInboxProcessorTriggersV012();
}

function removeInboxProcessorTriggersV012() {
  const handler = 'runInboxProcessorV012';
  let removed = 0;

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler)
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      removed++;
    });

  console.log(`Removed processor v0.1.2 triggers = ${removed}`);
}

function showInboxProcessorTriggersV012() {
  const handler = 'runInboxProcessorV012';
  const triggers = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler);

  console.log('========================================');
  console.log('OC-OS INBOX PROCESSOR v0.1.2 TRIGGERS');
  console.log(`handler = ${handler}`);
  console.log(`count = ${triggers.length}`);

  triggers.forEach((t, i) => {
    console.log(
      `${i + 1}. eventType=${t.getEventType()} / source=${t.getTriggerSource()}`
    );
  });

  console.log('========================================');
}

/**
 * Legacy v0.1.0 trigger and v0.1.2 trigger statesを同時確認するREAD ONLY helper。
 */
function auditInboxProcessorTriggerMigrationV012() {
  const handlers = ['runInboxProcessorV01', 'runInboxProcessorV012'];
  const triggers = ScriptApp.getProjectTriggers();

  console.log('========================================');
  console.log('OC-OS INBOX PROCESSOR TRIGGER MIGRATION AUDIT');

  handlers.forEach(handler => {
    const matches = triggers.filter(t => t.getHandlerFunction() === handler);
    console.log(`${handler} = ${matches.length}`);
    matches.forEach((t, i) => {
      console.log(
        `  ${i + 1}. eventType=${t.getEventType()} / source=${t.getTriggerSource()}`
      );
    });
  });

  console.log('EXPECTED: runInboxProcessorV01=0 / runInboxProcessorV012=1');
  console.log('========================================');
}
