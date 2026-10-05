/**
 * HHA Member Maintenance Runtime Ops v0.1.0
 *
 * Status: CURRENT / PILOT
 *
 * Purpose:
 * - Provide scheduled-runner-ready entry points.
 * - Persist only observation continuity state in Script Properties.
 * - Promote a normal difference from OBSERVED_DIFF to STABLE_DIFF
 *   only when the same fingerprint appears on the next successful run.
 *
 * Safety:
 * - NOTION WRITE = NONE
 * - CANONICAL AUTO UPDATE = NONE
 * - TRIGGER INSTALL = NONE
 * - Script Properties contain observation state only.
 */

const HHA_MEMBER_WATCH_CURRENT = Object.freeze({
  VERSION: '0.1.0-current-pilot',

  STATE_KEYS: Object.freeze({
    ROSTER: 'HHA_MEMBER_WATCH_STATE_ROSTER_V1',
    PROFILE: 'HHA_MEMBER_WATCH_STATE_PROFILE_V1'
  }),

  IMMEDIATE_REVIEW_TYPES: Object.freeze([
    'NEW_OFFICIAL_MEMBER'
  ]),

  LOCK_TIMEOUT_MS: 5000
});


/**
 * Future DAILY runner.
 *
 * Current behavior:
 * - Official Roster read
 * - Canonical comparison
 * - Script Property observation-state update only
 * - No Canonical / Notion write
 */
function runHhaMemberRosterWatchCurrent() {
  const report = previewHhaMemberRosterMaintenanceCurrent();

  return hhaMemberWatchProcessSourceCurrent_({
    scope: 'ROSTER',
    stateKey: HHA_MEMBER_WATCH_CURRENT.STATE_KEYS.ROSTER,
    candidateCount: report.candidateCount || 0,
    candidates: report.candidates || [],
    errorCount: report.errorCount || 0,
    errors: report.errors || [],
    sourceSummary: {
      canonicalCurrentCount: report.canonicalCurrentCount,
      officialVisibleUniqueCount: report.officialVisibleUniqueCount,
      hiddenOfficialElementCount: report.hiddenOfficialElementCount
    }
  });
}


/**
 * Future WEEKLY runner.
 *
 * Current behavior:
 * - All current member Profile reads
 * - Canonical comparison
 * - Script Property observation-state update only
 * - No Canonical / Notion write
 */
function runHhaMemberProfileWatchCurrent() {
  const report = previewHhaMemberProfileMaintenanceCurrent();

  return hhaMemberWatchProcessSourceCurrent_({
    scope: 'PROFILE',
    stateKey: HHA_MEMBER_WATCH_CURRENT.STATE_KEYS.PROFILE,
    candidateCount: report.candidateCount || 0,
    candidates: report.candidates || [],
    errorCount: report.errorCount || 0,
    errors: report.errors || [],
    sourceSummary: {
      targetCount: report.targetCount,
      observationCount: report.observationCount
    }
  });
}


/**
 * Future WEEKLY Canonical structural audit.
 *
 * Structural integrity violations do not need a second external observation.
 * They are surfaced immediately for Human Review.
 *
 * WRITE = NONE
 */
function runHhaMemberCanonicalAuditCurrent() {
  const report = previewHhaMemberCanonicalIntegrityCurrent();

  const reviewItems = (report.issues || []).map(function(issue) {
    return {
      status: 'IMMEDIATE_REVIEW',
      type: issue.type || '',
      memberId: issue.memberId || '',
      memberName: issue.memberName || '',
      officialMemberId: issue.officialMemberId || '',
      message: issue.message || ''
    };
  });

  const out = {
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    scope: 'CANONICAL_INTEGRITY',

    write: 'NONE',
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE',
    scriptPropertyWrite: 'NONE',

    canonicalCount: report.canonicalCount,
    currentCount: report.currentCount,
    issueCount: report.issueCount,

    reviewRequired: reviewItems.length > 0,
    reviewItems: reviewItems
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER CANONICAL AUDIT CURRENT',
    out
  );

  return out;
}


/**
 * Read current continuity state without modifying it.
 */
function previewHhaMemberWatchStateCurrent() {
  const roster = hhaMemberWatchReadStateCurrent_(
    HHA_MEMBER_WATCH_CURRENT.STATE_KEYS.ROSTER
  );

  const profile = hhaMemberWatchReadStateCurrent_(
    HHA_MEMBER_WATCH_CURRENT.STATE_KEYS.PROFILE
  );

  const out = {
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    write: 'NONE',

    roster: {
      lastSuccessfulRunAt: roster.lastSuccessfulRunAt || '',
      activeCount: (roster.active || []).length,
      active: roster.active || []
    },

    profile: {
      lastSuccessfulRunAt: profile.lastSuccessfulRunAt || '',
      activeCount: (profile.active || []).length,
      active: profile.active || []
    }
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER WATCH STATE PREVIEW',
    out
  );

  return out;
}


/**
 * Pure transition test.
 *
 * Does NOT read or write Script Properties.
 */
function testHhaMemberDiffStabilityCurrent() {
  const empty = hhaMemberWatchEmptyStateCurrent_();

  const candidateA = {
    type: 'PROFILE_HEIGHT_DIFF',
    severity: 'REVIEW',
    memberId: 'MEM-999',
    memberName: 'TEST MEMBER',
    officialMemberId: '999',
    property: 'Height_cm',
    canonicalValue: 160,
    observedValue: 161,
    sourceUrl: 'https://example.invalid/member/999'
  };

  const first = hhaMemberWatchTransitionCurrent_(
    empty,
    [candidateA],
    '2026-10-05T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    first.active.length === 1 &&
    first.active[0].status === 'OBSERVED_DIFF',
    'First normal difference must be OBSERVED_DIFF.'
  );

  const second = hhaMemberWatchTransitionCurrent_(
    first,
    [candidateA],
    '2026-10-06T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    second.active.length === 1 &&
    second.active[0].status === 'STABLE_DIFF' &&
    second.active[0].consecutiveSuccessfulObservations === 2,
    'Second consecutive identical difference must become STABLE_DIFF.'
  );

  const changedCandidate = Object.assign({}, candidateA, {
    observedValue: 162
  });

  const changed = hhaMemberWatchTransitionCurrent_(
    second,
    [changedCandidate],
    '2026-10-07T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    changed.active.length === 1 &&
    changed.active[0].status === 'OBSERVED_DIFF' &&
    changed.active[0].consecutiveSuccessfulObservations === 1 &&
    changed.resolvedFingerprints.length === 1,
    'Changed observed value must start a new OBSERVED_DIFF fingerprint.'
  );

  const newMember = {
    type: 'NEW_OFFICIAL_MEMBER',
    severity: 'HIGH_REVIEW',
    official: {
      officialMemberId: '999',
      memberName: 'NEW MEMBER',
      profileUrl: 'https://example.invalid/member/999'
    }
  };

  const immediate = hhaMemberWatchTransitionCurrent_(
    empty,
    [newMember],
    '2026-10-05T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    immediate.active.length === 1 &&
    immediate.active[0].status === 'IMMEDIATE_REVIEW',
    'NEW_OFFICIAL_MEMBER must be IMMEDIATE_REVIEW on first observation.'
  );

  const cleared = hhaMemberWatchTransitionCurrent_(
    second,
    [],
    '2026-10-07T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    cleared.active.length === 0 &&
    cleared.resolvedFingerprints.length === 1,
    'A difference absent on the next successful run must leave active state.'
  );

  const out = {
    write: 'NONE',
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    pass: true,
    checks: {
      firstObservation: 'OBSERVED_DIFF',
      secondIdenticalObservation: 'STABLE_DIFF',
      changedFingerprint: 'OBSERVED_DIFF',
      newOfficialMember: 'IMMEDIATE_REVIEW',
      resolvedWhenAbsentOnNextSuccessfulRun: true
    }
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER DIFF STABILITY PURE TEST',
    out
  );

  return out;
}


function hhaMemberWatchProcessSourceCurrent_(input) {
  const nowIso = new Date().toISOString();

  if (Number(input.errorCount || 0) > 0) {
    const errorOut = {
      version: HHA_MEMBER_WATCH_CURRENT.VERSION,
      scope: input.scope,

      write: 'NONE',
      notionWrite: 'NONE',
      canonicalAutoUpdate: 'NONE',
      scriptPropertyWrite: 'SKIPPED_DUE_TO_SOURCE_ERROR',

      sourceSuccessful: false,
      stateUpdated: false,

      candidateCount: input.candidateCount || 0,
      errorCount: input.errorCount || 0,
      errors: input.errors || [],

      message:
        'Source run contained errors. Previous observation state is preserved and is not advanced or cleared.'
    };

    hhaMemberWatchLogCurrent_(
      'HHA MEMBER ' + input.scope + ' WATCH CURRENT',
      errorOut
    );

    return errorOut;
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(HHA_MEMBER_WATCH_CURRENT.LOCK_TIMEOUT_MS)) {
    throw new Error(
      'Could not acquire HHA Member Watch Script Lock.'
    );
  }

  let transition;

  try {
    const previous = hhaMemberWatchReadStateCurrent_(
      input.stateKey
    );

    transition = hhaMemberWatchTransitionCurrent_(
      previous,
      input.candidates || [],
      nowIso
    );

    hhaMemberWatchWriteStateCurrent_(
      input.stateKey,
      transition
    );

  } finally {
    lock.releaseLock();
  }

  const statusCounts = hhaMemberWatchStatusCountsCurrent_(
    transition.active
  );

  const reviewItems = transition.active.filter(function(item) {
    return item.status === 'STABLE_DIFF' ||
      item.status === 'IMMEDIATE_REVIEW';
  });

  const out = {
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    scope: input.scope,

    write: 'SCRIPT_PROPERTIES_ONLY',
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE',
    scriptPropertyWrite: 'OBSERVATION_STATE_ONLY',

    sourceSuccessful: true,
    stateUpdated: true,

    sourceSummary: input.sourceSummary || {},

    candidateCount: input.candidateCount || 0,
    errorCount: 0,

    activeDifferenceCount: transition.active.length,
    observedDiffCount: statusCounts.OBSERVED_DIFF,
    stableDiffCount: statusCounts.STABLE_DIFF,
    immediateReviewCount: statusCounts.IMMEDIATE_REVIEW,

    resolvedSincePreviousSuccessfulRun:
      transition.resolvedFingerprints.length,

    reviewRequired: reviewItems.length > 0,
    reviewItems: reviewItems,

    lastSuccessfulRunAt: transition.lastSuccessfulRunAt
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER ' + input.scope + ' WATCH CURRENT',
    out
  );

  return out;
}


function hhaMemberWatchTransitionCurrent_(
  previousState,
  candidates,
  nowIso
) {
  const previous = previousState &&
    Array.isArray(previousState.active)
      ? previousState
      : hhaMemberWatchEmptyStateCurrent_();

  const previousByFingerprint = {};

  previous.active.forEach(function(item) {
    if (item && item.fingerprint) {
      previousByFingerprint[item.fingerprint] = item;
    }
  });

  const currentFingerprints = {};
  const active = [];

  (candidates || []).forEach(function(candidate) {
    const descriptor =
      hhaMemberWatchDescriptorCurrent_(candidate);

    const fingerprint =
      hhaMemberWatchFingerprintCurrent_(descriptor);

    if (currentFingerprints[fingerprint]) {
      return;
    }

    currentFingerprints[fingerprint] = true;

    const prior = previousByFingerprint[fingerprint] || null;

    const immediate =
      HHA_MEMBER_WATCH_CURRENT.IMMEDIATE_REVIEW_TYPES
        .indexOf(descriptor.type) >= 0;

    const consecutive =
      prior
        ? Number(prior.consecutiveSuccessfulObservations || 1) + 1
        : 1;

    const status =
      immediate
        ? 'IMMEDIATE_REVIEW'
        : prior
          ? 'STABLE_DIFF'
          : 'OBSERVED_DIFF';

    active.push({
      fingerprint: fingerprint,
      status: status,

      firstObservedAt:
        prior && prior.firstObservedAt
          ? prior.firstObservedAt
          : nowIso,

      lastObservedAt: nowIso,

      consecutiveSuccessfulObservations: consecutive,

      type: descriptor.type,
      severity: descriptor.severity,
      memberId: descriptor.memberId,
      memberName: descriptor.memberName,
      officialMemberId: descriptor.officialMemberId,
      property: descriptor.property,
      canonicalValue: descriptor.canonicalValue,
      observedValue: descriptor.observedValue,
      sourceUrl: descriptor.sourceUrl
    });
  });

  const resolvedFingerprints = previous.active
    .map(function(item) {
      return item && item.fingerprint
        ? item.fingerprint
        : '';
    })
    .filter(function(fingerprint) {
      return fingerprint &&
        !currentFingerprints[fingerprint];
    });

  return {
    schemaVersion: 1,
    lastSuccessfulRunAt: nowIso,
    active: active,
    resolvedFingerprints: resolvedFingerprints
  };
}


function hhaMemberWatchDescriptorCurrent_(candidate) {
  const c = candidate || {};
  const official = c.official || {};

  let observedValue = '';

  if (c.observedValue !== undefined) {
    observedValue =
      hhaMemberWatchStableValueCurrent_(c.observedValue);

  } else if (c.type === 'NEW_OFFICIAL_MEMBER') {
    observedValue = [
      official.officialMemberId || '',
      official.memberName || '',
      official.profileUrl || ''
    ].join('|');
  }

  return {
    type: String(c.type || ''),
    severity: String(c.severity || ''),

    memberId:
      String(c.memberId || ''),

    memberName:
      String(c.memberName || official.memberName || ''),

    officialMemberId:
      String(
        c.officialMemberId ||
        official.officialMemberId ||
        ''
      ),

    property:
      String(c.property || ''),

    canonicalValue:
      hhaMemberWatchStableValueCurrent_(
        c.canonicalValue
      ),

    observedValue:
      observedValue,

    sourceUrl:
      String(
        c.sourceUrl ||
        official.profileUrl ||
        ''
      )
  };
}


function hhaMemberWatchStableValueCurrent_(value) {
  if (value === undefined) return '';
  if (value === null) return null;

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
}


function hhaMemberWatchFingerprintCurrent_(descriptor) {
  const raw = JSON.stringify({
    type: descriptor.type,
    memberId: descriptor.memberId,
    memberName: descriptor.memberName,
    officialMemberId: descriptor.officialMemberId,
    property: descriptor.property,
    canonicalValue: descriptor.canonicalValue,
    observedValue: descriptor.observedValue,
    sourceUrl: descriptor.sourceUrl
  });

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    const unsigned = byte < 0
      ? byte + 256
      : byte;

    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}


function hhaMemberWatchReadStateCurrent_(stateKey) {
  const raw = PropertiesService
    .getScriptProperties()
    .getProperty(stateKey);

  if (!raw) {
    return hhaMemberWatchEmptyStateCurrent_();
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.active)) {
      throw new Error('Invalid state shape.');
    }

    return parsed;

  } catch (err) {
    throw new Error(
      'Invalid HHA Member Watch state for ' +
      stateKey +
      ': ' +
      String(err && err.message ? err.message : err)
    );
  }
}


function hhaMemberWatchWriteStateCurrent_(
  stateKey,
  state
) {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      stateKey,
      JSON.stringify(state)
    );
}


function hhaMemberWatchEmptyStateCurrent_() {
  return {
    schemaVersion: 1,
    lastSuccessfulRunAt: '',
    active: [],
    resolvedFingerprints: []
  };
}


function hhaMemberWatchStatusCountsCurrent_(active) {
  const counts = {
    OBSERVED_DIFF: 0,
    STABLE_DIFF: 0,
    IMMEDIATE_REVIEW: 0
  };

  (active || []).forEach(function(item) {
    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        item.status
      )
    ) {
      counts[item.status] += 1;
    }
  });

  return counts;
}


function hhaMemberWatchAssertCurrent_(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      'HHA Member Watch test failed: ' + message
    );
  }
}


function hhaMemberWatchLogCurrent_(title, payload) {
  console.log('========================================');
  console.log(title);
  console.log(
    'VERSION = ' +
    HHA_MEMBER_WATCH_CURRENT.VERSION
  );
  console.log(
    'NOTION WRITE = NONE'
  );
  console.log(
    'CANONICAL AUTO UPDATE = NONE'
  );
  console.log('========================================');
  console.log(JSON.stringify(payload, null, 2));
}