/**
 * OC-OS Weekly Review Queue Resolver
 * v0.2.0 (2026-09-29)
 *
 * Responsibilities:
 * - Resolve the weekly Review Queue window from EPISODES.
 * - Inspect the four saved INBOX views used by Weekly Control.
 * - Preview the Detected_At boundary changes without writing.
 * - Apply only the approved filter changes when sync is explicitly run.
 *
 * Safety:
 * - Preview is always READ ONLY.
 * - Sync performs a complete preflight before the first write.
 * - Only the four configured View IDs may be PATCHed.
 * - PATCH body is restricted to { filter: ... } only.
 * - Unchanged Views are skipped.
 * - Every changed View is re-fetched and verified immediately after PATCH.
 * - No trigger installer is included.
 * - No EPISODE, INBOX row, page, data-source schema, Drive file, or Script Property is modified.
 * - On ambiguity or verification failure, stop instead of guessing.
 */

const OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01 = Object.freeze({
  VERSION: '0.2.0',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  INBOX_DS: '7e3a247d-8d7b-4ed7-a4b1-cfac6ec45f16',
  ACTIVE_STATUSES: ['準備中', '収録準備済'],
  DETECTED_AT_PROPERTY: 'Detected_At',
  BOOTSTRAP_ANCHORS: Object.freeze({
    '2026-10-04': '2026-09-23'
  }),
  REVIEW_VIEWS: Object.freeze([
    Object.freeze({ key: 'GENERAL', name: '要判断・要確認 INBOX', id: '3e7031bc-0d45-810d-994e-000c5ce4ea76' }),
    Object.freeze({ key: 'OFFICIAL_UNDECIDED', name: '① 公式優先｜未判断', id: '3e7031bc-0d45-810c-b376-000ce812b80a' }),
    Object.freeze({ key: 'EXTERNAL_UNDECIDED', name: '② 外部未判定｜未判断', id: '3e7031bc-0d45-8116-823f-000ce92f1635' }),
    Object.freeze({ key: 'DECIDED_PROCESSOR_WAIT', name: '③ 判断済み｜Processor待ち', id: '3e7031bc-0d45-81af-b5b7-000c31b455e1' })
  ])
});

/** READ ONLY entry point. */
function previewWeeklyReviewQueueResolverV01() {
  const plan = weeklyReviewV01BuildPlan_();
  const out = weeklyReviewV01PreviewOutput_(plan);

  console.log('========================================');
  console.log('OC-OS WEEKLY REVIEW QUEUE RESOLVER PREVIEW');
  console.log('VERSION = ' + OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Explicit WRITE entry point.
 * No trigger is installed by this file. Run manually only after Preview review.
 */
function syncWeeklyReviewQueueResolverV01() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    const locked = {
      write: 'NONE',
      version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
      action: 'BLOCK_LOCK_UNAVAILABLE',
      reason: '別のReview Queue Resolver実行が進行中のため停止しました。',
      writeCount: 0,
      results: []
    };
    weeklyReviewV01LogSync_(locked);
    return locked;
  }

  try {
    const plan = weeklyReviewV01BuildPlan_();

    if (plan.action !== 'READY') {
      const blocked = {
        write: 'NONE',
        version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
        action: plan.action,
        reason: plan.reason,
        currentEpisode: plan.currentEpisode,
        previous: plan.previous,
        window: plan.window,
        detectedAtProperty: plan.detectedAtProperty,
        writeCount: 0,
        results: [],
        warnings: plan.warnings || []
      };
      weeklyReviewV01LogSync_(blocked);
      return blocked;
    }

    if (!plan.views || plan.views.length !== OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS.length) {
      const incomplete = weeklyReviewV01SyncBlockFromPlan_(
        plan,
        'BLOCK_PREFLIGHT_VIEW_COUNT_MISMATCH',
        '4 Viewすべての事前検査が揃っていません。'
      );
      weeklyReviewV01LogSync_(incomplete);
      return incomplete;
    }

    for (let i = 0; i < plan.views.length; i++) {
      if (plan.views[i].action !== 'READY') {
        const failedPreflight = weeklyReviewV01SyncBlockFromPlan_(
          plan,
          'BLOCK_PREFLIGHT_NOT_READY',
          '4 ViewすべてがREADYではないため書込みを開始しません。'
        );
        weeklyReviewV01LogSync_(failedPreflight);
        return failedPreflight;
      }
    }

    const results = [];
    let writeCount = 0;
    let changedCount = 0;

    for (let i = 0; i < plan.views.length; i++) {
      const viewPlan = plan.views[i];

      if (!viewPlan.wouldChange) {
        results.push({
          key: viewPlan.key,
          name: viewPlan.name,
          viewId: viewPlan.viewId,
          action: 'SKIP_ALREADY_CURRENT',
          before: weeklyReviewV01Clone_(viewPlan.dateAudit.current),
          after: weeklyReviewV01Clone_(viewPlan.dateAudit.current),
          verified: true
        });
        continue;
      }

      changedCount++;

      try {
        weeklyReviewV01PatchViewFilter_(viewPlan.viewId, viewPlan.proposedFilter);
        writeCount++;
      } catch (err) {
        const patchFailed = {
          write: writeCount > 0 ? 'PARTIAL' : 'NONE',
          version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
          action: writeCount > 0 ? 'ERROR_PATCH_FAILED_PARTIAL_WRITE_RISK' : 'ERROR_PATCH_FAILED',
          reason: String(err && err.message ? err.message : err),
          currentEpisode: plan.currentEpisode,
          previous: plan.previous,
          window: plan.window,
          detectedAtProperty: plan.detectedAtProperty,
          changedCount: changedCount,
          writeCount: writeCount,
          results: results.concat([{
            key: viewPlan.key,
            name: viewPlan.name,
            viewId: viewPlan.viewId,
            action: 'PATCH_FAILED',
            before: weeklyReviewV01Clone_(viewPlan.dateAudit.current),
            after: null,
            verified: false
          }]),
          warnings: plan.warnings || []
        };
        weeklyReviewV01LogSync_(patchFailed);
        return patchFailed;
      }

      const verification = weeklyReviewV01VerifyPatchedView_(
        viewPlan,
        plan.window,
        plan.detectedAtProperty
      );

      results.push({
        key: viewPlan.key,
        name: viewPlan.name,
        viewId: viewPlan.viewId,
        action: verification.verified ? 'VERIFIED' : 'VERIFY_FAILED',
        before: weeklyReviewV01Clone_(viewPlan.dateAudit.current),
        after: verification.after,
        verified: verification.verified,
        filterEquivalent: verification.filterEquivalent,
        reason: verification.reason
      });

      if (!verification.verified) {
        const verifyFailed = {
          write: 'PARTIAL',
          version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
          action: 'ERROR_VERIFY_FAILED_PARTIAL_WRITE_RISK',
          reason: verification.reason,
          currentEpisode: plan.currentEpisode,
          previous: plan.previous,
          window: plan.window,
          detectedAtProperty: plan.detectedAtProperty,
          changedCount: changedCount,
          writeCount: writeCount,
          results: results,
          warnings: plan.warnings || []
        };
        weeklyReviewV01LogSync_(verifyFailed);
        return verifyFailed;
      }
    }

    const out = {
      write: writeCount === 0 ? 'NONE' : 'COMPLETED',
      version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
      action: writeCount === 0 ? 'SKIP_ALREADY_CURRENT' : 'VERIFIED',
      reason: writeCount === 0
        ? '4 Viewすべて既に現在のReview Windowと一致しているため書込みはありません。'
        : '変更対象ViewのPATCHと再取得検証が完了しました。',
      currentEpisode: plan.currentEpisode,
      previous: plan.previous,
      window: plan.window,
      detectedAtProperty: plan.detectedAtProperty,
      changedCount: changedCount,
      writeCount: writeCount,
      results: results,
      warnings: plan.warnings || []
    };
    weeklyReviewV01LogSync_(out);
    return out;
  } finally {
    lock.releaseLock();
  }
}

function weeklyReviewV01PreviewOutput_(plan) {
  return {
    write: 'NONE',
    version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
    action: plan.action,
    reason: plan.reason,
    currentEpisode: plan.currentEpisode,
    previous: plan.previous,
    window: plan.window,
    detectedAtProperty: plan.detectedAtProperty,
    views: plan.views,
    warnings: plan.warnings
  };
}

function weeklyReviewV01LogSync_(out) {
  console.log('========================================');
  console.log('OC-OS WEEKLY REVIEW QUEUE RESOLVER SYNC');
  console.log('VERSION = ' + OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION);
  console.log('WRITE = ' + (out.write || 'NONE'));
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
}

function weeklyReviewV01SyncBlockFromPlan_(plan, action, reason) {
  return {
    write: 'NONE',
    version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
    action: action,
    reason: reason,
    currentEpisode: plan.currentEpisode,
    previous: plan.previous,
    window: plan.window,
    detectedAtProperty: plan.detectedAtProperty,
    writeCount: 0,
    results: [],
    warnings: plan.warnings || []
  };
}

function weeklyReviewV01BuildPlan_() {
  const warnings = [];
  const activeEpisodes = weeklyReviewV01GetActiveEpisodes_();

  if (activeEpisodes.length === 0) {
    return weeklyReviewV01Blocked_('BLOCK_NO_ACTIVE_EPISODE', '準備中 / 収録準備済 のEPISODEが存在しません。', null, null, null, null, warnings);
  }
  if (activeEpisodes.length > 1) {
    warnings.push('Active EPISODE count=' + activeEpisodes.length);
    return weeklyReviewV01Blocked_('BLOCK_MULTIPLE_ACTIVE_EPISODES', '準備中 / 収録準備済 のEPISODEが複数存在します。', null, null, null, null, warnings);
  }

  const currentEpisode = weeklyReviewV01EpisodeSummary_(activeEpisodes[0]);
  const currentRecordingDate = weeklyReviewV01DateOnly_(currentEpisode.recordingDate);

  if (!currentEpisode.episodeKey) {
    return weeklyReviewV01Blocked_('BLOCK_CURRENT_EPISODE_KEY_MISSING', 'Current EPISODEにEpisode_Keyがありません。', currentEpisode, null, null, null, null, warnings);
  }
  if (!currentRecordingDate) {
    return weeklyReviewV01Blocked_('BLOCK_CURRENT_RECORDING_DATE_MISSING', 'Current EPISODEにRecording_Dateがありません。', currentEpisode, null, null, null, null, warnings);
  }

  const previousResolved = weeklyReviewV01ResolvePrevious_(currentEpisode.episodeKey, currentRecordingDate);
  if (previousResolved.action !== 'READY') {
    return weeklyReviewV01Blocked_(previousResolved.action, previousResolved.reason, currentEpisode, previousResolved.previous, null, null, warnings.concat(previousResolved.warnings || []));
  }

  const previousDate = weeklyReviewV01DateOnly_(previousResolved.previous.recordingDate);
  if (!previousDate) {
    return weeklyReviewV01Blocked_('BLOCK_PREVIOUS_RECORDING_DATE_MISSING', 'Previous Recording_Dateを安全に確定できません。', currentEpisode, previousResolved.previous, null, null, warnings);
  }
  if (previousDate > currentRecordingDate) {
    return weeklyReviewV01Blocked_('BLOCK_INVALID_WINDOW_ORDER', 'Previous Recording_DateがCurrent Recording_Dateより後です。', currentEpisode, previousResolved.previous, null, null, warnings);
  }

  const window = { from: previousDate, to: currentRecordingDate, inclusive: true };
  const detectedResolved = weeklyReviewV01ResolveDetectedAtProperty_();
  if (detectedResolved.action !== 'READY') {
    return weeklyReviewV01Blocked_(detectedResolved.action, detectedResolved.reason, currentEpisode, previousResolved.previous, window, detectedResolved.property, warnings.concat(detectedResolved.warnings || []));
  }

  const detectedAtProperty = detectedResolved.property;
  const viewPlans = [];
  for (let i = 0; i < OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS.length; i++) {
    const spec = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS[i];
    const viewPlan = weeklyReviewV01InspectView_(spec, window, detectedAtProperty);
    viewPlans.push(viewPlan);
    if (viewPlan.action !== 'READY') {
      return {
        action: viewPlan.action,
        reason: viewPlan.reason,
        currentEpisode: currentEpisode,
        previous: previousResolved.previous,
        window: window,
        detectedAtProperty: detectedAtProperty,
        views: viewPlans,
        warnings: warnings.concat(viewPlan.warnings || [])
      };
    }
  }

  return {
    action: 'READY',
    reason: 'EPISODESからReview Windowを一意に解決し、4 Viewの予定Filterを安全に生成できました。',
    currentEpisode: currentEpisode,
    previous: previousResolved.previous,
    window: window,
    detectedAtProperty: detectedAtProperty,
    views: viewPlans,
    warnings: warnings
  };
}

function weeklyReviewV01Blocked_(action, reason, currentEpisode, previous, window, detectedAtProperty, warnings) {
  return {
    action: action,
    reason: reason,
    currentEpisode: currentEpisode || null,
    previous: previous || null,
    window: window || null,
    detectedAtProperty: detectedAtProperty || null,
    views: [],
    warnings: warnings || []
  };
}

function weeklyReviewV01GetActiveEpisodes_() {
  const filters = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.ACTIVE_STATUSES.map(function(status) {
    return { property: 'Production_Status', select: { equals: status } };
  });
  return weeklyReviewV01QueryAll_(OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.EPISODES_DS, {
    filter: { or: filters },
    sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
    page_size: 100
  });
}

function weeklyReviewV01ResolvePrevious_(currentEpisodeKey, currentRecordingDate) {
  const warnings = [];
  const result = weeklyReviewV01QueryPage_(OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.EPISODES_DS, {
    filter: { property: 'Recording_Date', date: { before: currentRecordingDate } },
    sorts: [{ property: 'Recording_Date', direction: 'descending' }],
    page_size: 2
  });
  const pages = result.results || [];

  if (pages.length === 0) {
    const anchor = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.BOOTSTRAP_ANCHORS[currentEpisodeKey];
    if (!anchor) {
      return { action: 'BLOCK_NO_PREVIOUS_EPISODE', reason: '前回EPISODEが存在せず、このEpisode_KeyにはBootstrap Anchorもありません。', previous: null, warnings: warnings };
    }
    return {
      action: 'READY',
      reason: '初回Pilotの承認済みBootstrap Anchorを使用します。',
      previous: { source: 'BOOTSTRAP_ANCHOR', episodeKey: null, recordingDate: anchor, pageId: null, url: null },
      warnings: warnings
    };
  }

  const first = weeklyReviewV01EpisodeSummary_(pages[0]);
  const firstDate = weeklyReviewV01DateOnly_(first.recordingDate);
  if (!firstDate) {
    return { action: 'BLOCK_PREVIOUS_RECORDING_DATE_MISSING', reason: '直前EPISODE候補にRecording_Dateがありません。', previous: first, warnings: warnings };
  }

  if (pages.length > 1) {
    const secondDate = weeklyReviewV01DateOnly_(weeklyReviewV01EpisodeSummary_(pages[1]).recordingDate);
    if (secondDate && secondDate === firstDate) {
      warnings.push('Duplicate previous Recording_Date=' + firstDate);
      return { action: 'BLOCK_DUPLICATE_PREVIOUS_RECORDING_DATE', reason: '直前Recording_Dateを持つEPISODEが複数存在します。', previous: first, warnings: warnings };
    }
  }

  return {
    action: 'READY',
    reason: 'EPISODESの直前Recording_Dateを使用します。',
    previous: { source: 'EPISODES', episodeKey: first.episodeKey, recordingDate: firstDate, pageId: first.pageId, url: first.url },
    warnings: warnings
  };
}

function weeklyReviewV01ResolveDetectedAtProperty_() {
  const warnings = [];
  let dataSource;
  try {
    dataSource = weeklyReviewV01GetDataSource_(OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.INBOX_DS);
  } catch (err) {
    return { action: 'BLOCK_INBOX_DATA_SOURCE_FETCH_FAILED', reason: String(err && err.message ? err.message : err), property: null, warnings: warnings };
  }

  const properties = dataSource && dataSource.properties ? dataSource.properties : null;
  if (!properties || !Object.prototype.hasOwnProperty.call(properties, OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY)) {
    return { action: 'BLOCK_DETECTED_AT_PROPERTY_NOT_FOUND', reason: 'INBOX Data SourceにDetected_At propertyがありません。', property: null, warnings: warnings };
  }

  const prop = properties[OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY] || {};
  if (!prop.id) {
    return {
      action: 'BLOCK_DETECTED_AT_PROPERTY_ID_MISSING',
      reason: 'Detected_At propertyのIDを取得できません。',
      property: { name: prop.name || OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY, id: null, type: prop.type || '' },
      warnings: warnings
    };
  }
  if (prop.type && prop.type !== 'date') {
    return {
      action: 'BLOCK_DETECTED_AT_PROPERTY_TYPE_MISMATCH',
      reason: 'Detected_At propertyがdate型ではありません。type=' + prop.type,
      property: { name: prop.name || OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY, id: prop.id, type: prop.type },
      warnings: warnings
    };
  }

  return {
    action: 'READY',
    reason: 'Detected_Atのproperty name / IDを解決しました。',
    property: {
      name: prop.name || OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY,
      id: String(prop.id),
      type: prop.type || 'date',
      acceptedRefs: weeklyReviewV01UniqueStrings_([
        prop.name || OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY,
        String(prop.id),
        weeklyReviewV01SafeDecode_(String(prop.id))
      ])
    },
    warnings: warnings
  };
}

function weeklyReviewV01EpisodeSummary_(page) {
  if (!page) return null;
  return {
    pageId: page.id || '',
    url: page.url || '',
    episodeKey: weeklyReviewV01Title_(page.properties && page.properties['Episode_Key']),
    recordingDate: weeklyReviewV01DateStart_(page.properties && page.properties['Recording_Date']),
    airDate: weeklyReviewV01DateStart_(page.properties && page.properties['Air_Date']),
    productionStatus: weeklyReviewV01Select_(page.properties && page.properties['Production_Status'])
  };
}

function weeklyReviewV01InspectView_(spec, window, detectedAtProperty) {
  const warnings = [];
  let view;
  try {
    view = weeklyReviewV01GetView_(spec.id);
  } catch (err) {
    return weeklyReviewV01ViewBlocked_(spec, null, 'BLOCK_VIEW_FETCH_FAILED', String(err && err.message ? err.message : err), { lower: [], upper: [], observedDatePropertyRefs: [] }, warnings);
  }

  if (!view || !view.filter) {
    return weeklyReviewV01ViewBlocked_(spec, view, 'BLOCK_VIEW_FILTER_MISSING', '保存ViewにFilterがありません。', { lower: [], upper: [], observedDatePropertyRefs: [] }, warnings);
  }
  if (view.name && view.name !== spec.name) {
    warnings.push('Configured name differs from actual view name: ' + view.name);
  }

  const proposedFilter = weeklyReviewV01Clone_(view.filter);
  const matches = weeklyReviewV01FindDetectedAtBoundaries_(proposedFilter, detectedAtProperty);

  if (matches.lower.length !== 1) {
    return weeklyReviewV01ViewBlocked_(spec, view, 'BLOCK_VIEW_LOWER_BOUNDARY_AMBIGUOUS', 'Detected_At on_or_after が1件ちょうどではありません。count=' + matches.lower.length, matches, warnings);
  }
  if (matches.upper.length !== 1) {
    return weeklyReviewV01ViewBlocked_(spec, view, 'BLOCK_VIEW_UPPER_BOUNDARY_AMBIGUOUS', 'Detected_At on_or_before が1件ちょうどではありません。count=' + matches.upper.length, matches, warnings);
  }

  const beforeLower = matches.lower[0].date.on_or_after;
  const beforeUpper = matches.upper[0].date.on_or_before;
  matches.lower[0].date.on_or_after = window.from;
  matches.upper[0].date.on_or_before = window.to;

  return {
    key: spec.key,
    name: spec.name,
    viewId: spec.id,
    actualName: view.name || '',
    action: 'READY',
    reason: '既存Filterを保持し、Detected_At境界だけを置換可能です。',
    wouldChange: beforeLower !== window.from || beforeUpper !== window.to,
    dateAudit: {
      matchedPropertyRefs: weeklyReviewV01UniqueStrings_(matches.lower.concat(matches.upper).map(function(node) { return String(node.property || ''); })),
      observedDatePropertyRefs: matches.observedDatePropertyRefs,
      current: { onOrAfter: beforeLower, onOrBefore: beforeUpper },
      proposed: { onOrAfter: window.from, onOrBefore: window.to },
      lowerMatchCount: matches.lower.length,
      upperMatchCount: matches.upper.length
    },
    proposedFilter: proposedFilter,
    warnings: warnings
  };
}

function weeklyReviewV01ViewBlocked_(spec, view, action, reason, matches, warnings) {
  return {
    key: spec.key,
    name: spec.name,
    viewId: spec.id,
    actualName: view && view.name ? view.name : '',
    action: action,
    reason: reason,
    wouldChange: null,
    dateAudit: {
      lowerMatchCount: matches && matches.lower ? matches.lower.length : 0,
      upperMatchCount: matches && matches.upper ? matches.upper.length : 0,
      observedDatePropertyRefs: matches && matches.observedDatePropertyRefs ? matches.observedDatePropertyRefs : []
    },
    proposedFilter: null,
    warnings: warnings || []
  };
}

function weeklyReviewV01FindDetectedAtBoundaries_(filter, detectedAtProperty) {
  const out = { lower: [], upper: [], observedDatePropertyRefs: [] };
  weeklyReviewV01WalkObject_(filter, function(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (!node.date || typeof node.date !== 'object') return;

    if (node.property !== undefined && node.property !== null) {
      out.observedDatePropertyRefs.push(String(node.property));
    }
    if (!weeklyReviewV01PropertyRefMatches_(node.property, detectedAtProperty)) return;

    if (Object.prototype.hasOwnProperty.call(node.date, 'on_or_after')) out.lower.push(node);
    if (Object.prototype.hasOwnProperty.call(node.date, 'on_or_before')) out.upper.push(node);
  });
  out.observedDatePropertyRefs = weeklyReviewV01UniqueStrings_(out.observedDatePropertyRefs);
  return out;
}

function weeklyReviewV01PropertyRefMatches_(ref, detectedAtProperty) {
  if (ref === undefined || ref === null || !detectedAtProperty) return false;
  const candidate = String(ref);
  const accepted = weeklyReviewV01UniqueStrings_([
    detectedAtProperty.name,
    detectedAtProperty.id,
    weeklyReviewV01SafeDecode_(detectedAtProperty.id)
  ]);
  const decodedCandidate = weeklyReviewV01SafeDecode_(candidate);
  return accepted.indexOf(candidate) >= 0 || accepted.indexOf(decodedCandidate) >= 0;
}

function weeklyReviewV01VerifyPatchedView_(viewPlan, window, detectedAtProperty) {
  try {
    const view = weeklyReviewV01GetView_(viewPlan.viewId);
    if (!view || !view.filter) {
      return { verified: false, filterEquivalent: false, after: null, reason: '再取得したViewにFilterがありません。' };
    }

    const matches = weeklyReviewV01FindDetectedAtBoundaries_(view.filter, detectedAtProperty);
    if (matches.lower.length !== 1 || matches.upper.length !== 1) {
      return {
        verified: false,
        filterEquivalent: false,
        after: null,
        reason: '再取得後のDetected_At境界が一意ではありません。lower=' + matches.lower.length + ' upper=' + matches.upper.length
      };
    }

    const after = {
      onOrAfter: matches.lower[0].date.on_or_after,
      onOrBefore: matches.upper[0].date.on_or_before
    };
    const boundaryOk = after.onOrAfter === window.from && after.onOrBefore === window.to;
    const filterEquivalent = weeklyReviewV01FiltersEquivalent_(view.filter, viewPlan.proposedFilter);

    return {
      verified: boundaryOk && filterEquivalent,
      filterEquivalent: filterEquivalent,
      after: after,
      reason: boundaryOk && filterEquivalent
        ? 'PATCH後の境界値とFilter全体が予定値と一致しました。'
        : 'PATCH後の再検証が予定値と一致しません。boundaryOk=' + boundaryOk + ' filterEquivalent=' + filterEquivalent
    };
  } catch (err) {
    return {
      verified: false,
      filterEquivalent: false,
      after: null,
      reason: String(err && err.message ? err.message : err)
    };
  }
}

function weeklyReviewV01FiltersEquivalent_(a, b) {
  return JSON.stringify(weeklyReviewV01Canonicalize_(a)) === JSON.stringify(weeklyReviewV01Canonicalize_(b));
}

function weeklyReviewV01Canonicalize_(value) {
  if (Array.isArray(value)) {
    const normalized = value.map(function(item) { return weeklyReviewV01Canonicalize_(item); });
    return normalized.sort(function(a, b) {
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      return sa < sb ? -1 : (sa > sb ? 1 : 0);
    });
  }
  if (!value || typeof value !== 'object') return value;

  const out = {};
  Object.keys(value).sort().forEach(function(key) {
    out[key] = weeklyReviewV01Canonicalize_(value[key]);
  });
  return out;
}

function weeklyReviewV01WalkObject_(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach(function(item) { weeklyReviewV01WalkObject_(item, visitor); });
    return;
  }
  if (!value || typeof value !== 'object') return;
  visitor(value);
  Object.keys(value).forEach(function(key) { weeklyReviewV01WalkObject_(value[key], visitor); });
}

function weeklyReviewV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('NOTION_API_TOKEN') || p.getProperty('NOTION_TOKEN') || p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function weeklyReviewV01GetView_(viewId) {
  return weeklyReviewV01ReadRequest_('get', '/views/' + encodeURIComponent(viewId), null);
}

function weeklyReviewV01GetDataSource_(dataSourceId) {
  return weeklyReviewV01ReadRequest_('get', '/data_sources/' + encodeURIComponent(dataSourceId), null);
}

function weeklyReviewV01QueryPage_(dataSourceId, body) {
  const req = weeklyReviewV01Clone_(body || {});
  req.page_size = Math.min(req.page_size || 100, 100);
  return weeklyReviewV01ReadRequest_('post', '/data_sources/' + encodeURIComponent(dataSourceId) + '/query', req);
}

function weeklyReviewV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = weeklyReviewV01Clone_(body || {});
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;
    const r = weeklyReviewV01ReadRequest_('post', '/data_sources/' + encodeURIComponent(dataSourceId) + '/query', req);
    (r.results || []).forEach(function(item) { out.push(item); });
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

/** GET and query POST only. */
function weeklyReviewV01ReadRequest_(method, path, payload) {
  const normalizedMethod = String(method || '').toLowerCase();
  const normalizedPath = String(path || '');
  const isReadGet = normalizedMethod === 'get';
  const isReadQuery = normalizedMethod === 'post' && /\/query$/.test(normalizedPath);

  if (!isReadGet && !isReadQuery) {
    throw new Error('READ guard blocked Notion request: method=' + normalizedMethod + ' path=' + normalizedPath);
  }

  return weeklyReviewV01FetchNotion_(normalizedMethod, normalizedPath, payload);
}

/**
 * Dedicated write gate.
 * Only configured Review View IDs are allowed and only {filter: ...} is sent.
 */
function weeklyReviewV01PatchViewFilter_(viewId, filter) {
  const allowedIds = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS.map(function(spec) { return spec.id; });
  if (allowedIds.indexOf(String(viewId)) < 0) {
    throw new Error('WRITE guard blocked unconfigured View ID: ' + viewId);
  }
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    throw new Error('WRITE guard requires a filter object.');
  }

  const payload = { filter: weeklyReviewV01Clone_(filter) };
  return weeklyReviewV01FetchNotion_(
    'patch',
    '/views/' + encodeURIComponent(viewId),
    payload
  );
}

function weeklyReviewV01FetchNotion_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + weeklyReviewV01Token_(),
      'Notion-Version': OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.NOTION_VERSION
    }
  };
  if (payload !== undefined && payload !== null) options.payload = JSON.stringify(payload);

  const res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, options);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('Notion API ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}

function weeklyReviewV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(function(x) { return x.plain_text || ''; }).join('') : '';
}

function weeklyReviewV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function weeklyReviewV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function weeklyReviewV01DateOnly_(value) {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function weeklyReviewV01SafeDecode_(value) {
  const s = String(value || '');
  try { return decodeURIComponent(s); } catch (err) { return s; }
}

function weeklyReviewV01UniqueStrings_(values) {
  const out = [];
  (values || []).forEach(function(value) {
    if (value === undefined || value === null) return;
    const s = String(value);
    if (!s) return;
    if (out.indexOf(s) < 0) out.push(s);
  });
  return out;
}

function weeklyReviewV01Clone_(value) {
  return JSON.parse(JSON.stringify(value));
}
