/**
 * OC-OS Temporary Deployment Bridge
 *
 * PURPOSE:
 * - Keep pre-consolidation trigger handler names callable during the FIRST
 *   clasp deployment only.
 * - Delegate old trigger names to the new Current handlers.
 * - Prevent scheduled trigger failures between first push and trigger migration.
 *
 * REMOVE AFTER:
 * 1. Current Crawler triggers are installed and audited.
 * 2. Current Processor trigger is installed and audited.
 * 3. reportGasRuntimeInventoryCurrent() shows no legacy trigger handlers.
 *
 * This file is temporary migration infrastructure, not permanent Production Runtime.
 */

const OCOS_DEPLOYMENT_BRIDGE = Object.freeze({
  VERSION: 'first-clasp-migration-2026-10-04',
  TEMPORARY: true
});

// Crawler legacy trigger shims.
function runFrequentCrawler() { return runFrequentCrawlerCurrent(); }
function runScheduleCrawler() { return runScheduleCrawlerCurrent(); }
function runDailyCrawler() { return runDailyCrawlerCurrent(); }
function runFrequentCrawlerV127() { return runFrequentCrawlerCurrent(); }
function runScheduleCrawlerV127() { return runScheduleCrawlerCurrent(); }
function runDailyCrawlerV127() { return runDailyCrawlerCurrent(); }
function runFrequentCrawlerV128() { return runFrequentCrawlerCurrent(); }
function runScheduleCrawlerV128() { return runScheduleCrawlerCurrent(); }
function runDailyCrawlerV128() { return runDailyCrawlerCurrent(); }

// Processor legacy trigger shims.
function runInboxProcessorV01() { return runInboxProcessorCurrent(); }
function runInboxProcessorV011() { return runInboxProcessorCurrent(); }
function runInboxProcessorV012() { return runInboxProcessorCurrent(); }

function previewDeploymentBridgeCurrent() {
  const triggers = ScriptApp.getProjectTriggers().map(t => ({
    handler: t.getHandlerFunction(),
    eventType: String(t.getEventType()),
    source: String(t.getTriggerSource())
  }));
  const out = {
    write: 'NONE',
    version: OCOS_DEPLOYMENT_BRIDGE.VERSION,
    temporary: true,
    triggers: triggers,
    nextAction:
      'Install/audit Current Crawler and Processor triggers, then remove this bridge after Current runtime audit confirms no legacy trigger handlers.'
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}