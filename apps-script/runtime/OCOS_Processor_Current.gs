/**
 * OC-OS Inbox Processor Current - Production Runtime
 * Generated from the verified Processor lineage.
 *
 * Runtime policy:
 * - Human Decision/Event ownership is unchanged.
 * - SOURCE_REVISION is excluded from normal processing.
 * - BLOCKED candidates are READ ONLY and are not patched.
 * - READY candidates are reloaded and revalidated immediately before commit.
 * - No older Processor runtime file is required in Apps Script.
 * - Historical versions remain in GitHub only.
 */
const OCOS_PROCESSOR_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  NOTION_VERSION: '2026-03-11',
  TIMEZONE: 'Asia/Tokyo',

  INBOX_DATA_SOURCE_ID: '7e3a247d-8d7b-4ed7-a4b1-cfac6ec45f16',
  SOURCES_DATA_SOURCE_ID: '9ba27a8b-7f2e-4025-b943-d6e24e82b7a9',
  EVENTS_DATA_SOURCE_ID: '76508d6c-7771-46d4-850c-ca256c1080be',

  MAX_PER_RUN: 10,
  HTTP_MAX_RETRIES: 4,
  WRITE_INTERVAL_MS: 380,
  RUN_SOFT_LIMIT_MS: 4.5 * 60 * 1000
});


// ============================================================
// Public entry points
// ============================================================

/**
 * 接続確認。書き込みなし。
 */
const OCOS_PROCESSOR_CURRENT_GUARD = Object.freeze({
  VERSION: 'current-revision-guard',
  REVISION_VALUE: 'SOURCE_REVISION',
  NORMAL_VALUE: 'NORMAL'
});
const OCOS_PROCESSOR_CURRENT_RUNTIME = Object.freeze({
  VERSION: 'current-2026-10-04-ready-only',
  PAGE_SIZE: 100,
  MAX_SCAN: 500,
  TARGET_READY: 10
});

// ============================================================
// CURRENT BASE PARSE / VALIDATION
// ============================================================

function processorParseInboxPage_(page) {
  const p = page.properties || {};

  return {
    pageId: page.id,
    title: processorText_(p.Inbox_Title),
    url: p.URL && p.URL.url ? String(p.URL.url) : '',
    detectedAt: processorDateStart_(p.Detected_At),
    publishedAt: processorDateStart_(p.Published_At),
    eventDateHint: processorDateStart_(p.Event_Date_Hint),
    publisher: processorText_(p.Publisher),
    sourceClass: processorSelect_(p.Source_Class),
    sourceType: processorSelect_(p.Source_Type),
    snippet: processorText_(p.Detected_Snippet),
    status: processorSelect_(p.Status),
    decision: processorSelect_(p.Decision),
    sourceIds: processorRelationIds_(p.Source),
    eventIds: processorRelationIds_(p.Event)
  };
}


// ============================================================
// Validation
// ============================================================

function processorValidateItem_(item) {
  const errors = [];
  const warnings = [];

  const allowedDecisions = [
    'SOURCESのみ登録',
    '既存EVENTへ追加',
    '新規EVENT作成',
    '対象外'
  ];

  if (!allowedDecisions.includes(item.decision)) {
    errors.push(`未対応Decision: ${item.decision || '(empty)'}`);
  }

  if (item.decision === '対象外') {
    return { ok: errors.length === 0, errors, warnings };
  }

  if (!item.title) {
    errors.push('Inbox_Title が空です。');
  }

  if (!item.url) {
    errors.push('URL が空です。');
  }

  if (!item.sourceClass || item.sourceClass === '未判定') {
    errors.push('Source_Class を人間が確定してください。');
  }

  if (!item.sourceType || item.sourceType === '未判定') {
    errors.push('Source_Type を人間が確定してください。');
  }

  if (item.sourceIds.length > 1) {
    errors.push('INBOX.Source が複数あります。人間確認が必要です。');
  }

  if (item.decision === '既存EVENTへ追加' && item.eventIds.length === 0) {
    errors.push('既存EVENTへ追加には INBOX.Event の指定が必要です。');
  }

  if (item.decision === '新規EVENT作成' && item.eventIds.length > 1) {
    errors.push('新規EVENT作成なのに INBOX.Event が複数あります。');
  }

  if (item.decision === 'SOURCESのみ登録' && item.eventIds.length > 0) {
    warnings.push('SOURCESのみ登録ですが INBOX.Event が設定されています。Event Relationは変更しません。');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}


// ============================================================
// Main processing
// ============================================================

// ============================================================
// CURRENT BASE DATA / API CORE
// ============================================================

function processorGetOrCreateSource_(item) {
  if (item.sourceIds.length === 1) {
    return item.sourceIds[0];
  }

  const existing = processorFindSourceByUrl_(item.url);

  if (existing.length > 1) {
    throw new Error(
      `同一URLのSOURCESが複数あります (${existing.length}件)。人間確認が必要です。`
    );
  }

  if (existing.length === 1) {
    return existing[0].id;
  }

  const properties = {
    Source_Title: processorTitle_(item.title),
    URL: { url: item.url },
    Publisher: processorRichText_(item.publisher || ''),
    Source_Class: { select: { name: item.sourceClass } },
    Source_Type: { select: { name: item.sourceType } },
    Primary_Secondary: {
      select: {
        name: item.sourceClass === '信頼できる報道' ? '二次' : '一次'
      }
    },
    Access: { select: { name: '公開' } },
    Human_Verified: { checkbox: true }
  };

  if (item.publishedAt) {
    properties.Published_At = {
      date: { start: item.publishedAt }
    };
  }

  // Detected_Snippet はSource_Factsへ自動転記しない。
  // Source_Factsは原典確認後の人間記述または別工程で扱う。

  const page = processorNotionRequest_('/v1/pages', 'post', {
    parent: {
      type: 'data_source_id',
      data_source_id: OCOS_PROCESSOR_CURRENT.SOURCES_DATA_SOURCE_ID
    },
    properties
  });

  if (!page || !page.id) {
    throw new Error('SOURCES作成結果にpage.idがありません。');
  }

  return page.id;
}

function processorFindSourceByUrl_(url) {
  const result = processorNotionRequest_(
    `/v1/data_sources/${OCOS_PROCESSOR_CURRENT.SOURCES_DATA_SOURCE_ID}/query`,
    'post',
    {
      page_size: 3,
      filter: {
        property: 'URL',
        url: { equals: url }
      }
    }
  );

  return result.results || [];
}

function processorMergeSourceEvents_(sourceId, eventIds) {
  const source = processorNotionRequest_(`/v1/pages/${sourceId}`, 'get');
  const currentIds = processorRelationIds_((source.properties || {}).Event);
  const merged = processorUniqueIds_(currentIds.concat(eventIds || []));

  processorPatchPage_(sourceId, {
    Event: {
      relation: merged.map(id => ({ id }))
    }
  });
}


// ============================================================
// EVENTS
// ============================================================

function processorGetOrCreateDraftEvent_(item, sourceId) {
  if (item.eventIds.length === 1) {
    processorEnsureEventSource_(item.eventIds[0], sourceId);
    return item.eventIds[0];
  }

  // 途中失敗後の再実行では Origin_Inbox で既存Draftを回収する。
  const existing = processorFindEventByOriginInbox_(item.pageId);

  if (existing.length > 1) {
    throw new Error(
      `Origin_Inbox が同じEVENTSが複数あります (${existing.length}件)。人間確認が必要です。`
    );
  }

  if (existing.length === 1) {
    processorEnsureEventSource_(existing[0].id, sourceId);
    return existing[0].id;
  }

  const properties = {
    Event_Title: processorTitle_(item.title),
    Human_Status: { select: { name: '未確認' } },
    Sources: { relation: [{ id: sourceId }] },
    Origin_Inbox: { relation: [{ id: item.pageId }] }
  };

  // 公開日と出来事の日付は同一とは限らない。
  // Event_Date_Hint がCrawlerで明示的に取得できた場合だけ DateTime に入れる。
  if (item.eventDateHint) {
    properties.DateTime = {
      date: { start: item.eventDateHint }
    };
  }

  const page = processorNotionRequest_('/v1/pages', 'post', {
    parent: {
      type: 'data_source_id',
      data_source_id: OCOS_PROCESSOR_CURRENT.EVENTS_DATA_SOURCE_ID
    },
    properties
  });

  if (!page || !page.id) {
    throw new Error('EVENTS作成結果にpage.idがありません。');
  }

  return page.id;
}

function processorFindEventByOriginInbox_(inboxPageId) {
  const result = processorNotionRequest_(
    `/v1/data_sources/${OCOS_PROCESSOR_CURRENT.EVENTS_DATA_SOURCE_ID}/query`,
    'post',
    {
      page_size: 3,
      filter: {
        property: 'Origin_Inbox',
        relation: { contains: inboxPageId }
      }
    }
  );

  return result.results || [];
}

function processorEnsureEventSource_(eventId, sourceId) {
  const event = processorNotionRequest_(`/v1/pages/${eventId}`, 'get');
  const currentIds = processorRelationIds_((event.properties || {}).Sources);
  const merged = processorUniqueIds_(currentIds.concat([sourceId]));

  processorPatchPage_(eventId, {
    Sources: {
      relation: merged.map(id => ({ id }))
    }
  });
}


// ============================================================
// INBOX status / audit
// ============================================================

function processorMarkSuccess_(inboxPageId) {
  processorPatchPage_(inboxPageId, {
    Status: { select: { name: '処理済' } },
    Processed_At: { date: { start: processorNowJstIso_() } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR_CURRENT.VERSION),
    Processor_Error: processorRichText_('')
  });
}

function processorMarkValidationBlocked_(item, message) {
  processorPatchPage_(item.pageId, {
    // 人間の入力不足は処理途中ではないため未処理のまま残す。
    Status: { select: { name: '未処理' } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR_CURRENT.VERSION),
    Processor_Error: processorRichText_(processorTruncate_(message, 1800))
  });
}

function processorMarkRuntimeError_(item, message) {
  processorPatchPage_(item.pageId, {
    // API途中失敗等は再開対象として確認中に残す。
    Status: { select: { name: '確認中' } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR_CURRENT.VERSION),
    Processor_Error: processorRichText_(processorTruncate_(message, 1800))
  });
}


// ============================================================
// Notion HTTP
// ============================================================

function processorPatchPage_(pageId, properties) {
  return processorNotionRequest_(
    `/v1/pages/${pageId}`,
    'patch',
    { properties }
  );
}

function processorNotionRequest_(path, method, body) {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty('NOTION_TOKEN');

  if (!token) {
    throw new Error('NOTION_TOKEN is not set in Script Properties.');
  }

  const options = {
    method: method || 'get',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': OCOS_PROCESSOR_CURRENT.NOTION_VERSION
    }
  };

  if (body !== undefined && body !== null) {
    options.payload = JSON.stringify(body);
  }

  for (let attempt = 0; attempt < OCOS_PROCESSOR_CURRENT.HTTP_MAX_RETRIES; attempt++) {
    const res = UrlFetchApp.fetch(
      `https://api.notion.com${path}`,
      options
    );

    const code = res.getResponseCode();
    const text = res.getContentText();

    if (code >= 200 && code < 300) {
      return text ? JSON.parse(text) : {};
    }

    if (code === 429 || code >= 500) {
      const headers = res.getAllHeaders();
      const retryAfter = Number(
        headers['Retry-After'] || headers['retry-after'] || 0
      );

      const waitMs = retryAfter > 0
        ? retryAfter * 1000
        : Math.pow(2, attempt) * 1000 + 250;

      Utilities.sleep(waitMs);
      continue;
    }

    throw new Error(`Notion API ${code}: ${text}`);
  }

  throw new Error(`Notion API retry limit exceeded: ${path}`);
}


// ============================================================
// Notion property helpers
// ============================================================

function processorTitle_(text) {
  return {
    title: [
      {
        type: 'text',
        text: {
          content: processorTruncate_(text || '', 1900)
        }
      }
    ]
  };
}

function processorRichText_(text) {
  if (!text) {
    return { rich_text: [] };
  }

  return {
    rich_text: [
      {
        type: 'text',
        text: {
          content: processorTruncate_(text, 1900)
        }
      }
    ]
  };
}

function processorText_(prop) {
  if (!prop) return '';

  const items = prop.title || prop.rich_text || [];

  return items
    .map(x => x.plain_text || (x.text && x.text.content) || '')
    .join('')
    .trim();
}

function processorSelect_(prop) {
  return prop && prop.select && prop.select.name
    ? String(prop.select.name)
    : '';
}

function processorRelationIds_(prop) {
  if (!prop || !Array.isArray(prop.relation)) return [];

  return prop.relation
    .map(x => x && x.id ? String(x.id) : '')
    .filter(Boolean);
}

function processorDateStart_(prop) {
  return prop && prop.date && prop.date.start
    ? String(prop.date.start)
    : '';
}

function processorUniqueIds_(ids) {
  return Array.from(new Set((ids || []).filter(Boolean)));
}


// ============================================================
// Utility
// ============================================================

function processorValidateConfig_() {
  const props = PropertiesService.getScriptProperties();

  if (!props.getProperty('NOTION_TOKEN')) {
    throw new Error('Script Properties に NOTION_TOKEN を設定してください。');
  }
}

function processorNowJstIso_() {
  return Utilities.formatDate(
    new Date(),
    OCOS_PROCESSOR_CURRENT.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ss"
  ) + '+09:00';
}

function processorTruncate_(text, maxLen) {
  const s = String(text || '');

  return s.length <= maxLen
    ? s
    : s.slice(0, maxLen - 1) + '…';
}

function processorErrorMessage_(err) {
  if (!err) return 'Unknown error';
  return err.stack ? String(err.stack) : String(err);
}

// ============================================================
// CURRENT REVISION GUARD CORE
// ============================================================

function processorLoadRevisionExposureCurrent_() {
  const result = processorNotionRequest_(
    `/v1/data_sources/${OCOS_PROCESSOR_CURRENT.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    {
      page_size: 100,
      filter: {
        and: [
          ...processorBaseCandidateFiltersCurrent_(),
          {
            property: 'Observation_Type',
            select: { equals: OCOS_PROCESSOR_CURRENT_CURRENT_GUARD.REVISION_VALUE }
          }
        ]
      },
      sorts: [
        { property: 'Detected_At', direction: 'ascending' }
      ]
    }
  );
  return result.results || [];
}

function processorBaseCandidateFiltersCurrent_() {
  return [
    {
      or: [
        { property: 'Status', select: { equals: '未処理' } },
        { property: 'Status', select: { equals: '確認中' } }
      ]
    },
    { property: 'Decision', select: { does_not_equal: '未判断' } }
  ];
}

function processorParseInboxPageCurrent_(page) {
  const item = processorParseInboxPage_(page);
  const p = (page && page.properties) || {};
  item.observationType = processorSelect_(p.Observation_Type);
  return item;
}

function processorValidateItemCurrent_(item) {
  if (isSourceRevisionProcessorCurrent_(item)) {
    return {
      ok: false,
      errors: ['Observation_Type=SOURCE_REVISION は通常Processor対象外です。'],
      warnings: []
    };
  }
  return processorValidateItem_(item);
}

function isSourceRevisionProcessorCurrent_(item) {
  return String((item && item.observationType) || '').trim() ===
    OCOS_PROCESSOR_CURRENT_CURRENT_GUARD.REVISION_VALUE;
}

// ============================================================
// CURRENT READY-ONLY PUBLIC RUNTIME
// ============================================================

function previewInboxProcessorCurrent() {
  processorValidateConfig_();
  const revisionExposure = processorLoadRevisionExposureCurrent_();
  const scan = processorScanReadyOnlyCurrent_();

  console.log('========================================');
  console.log(`OC-OS INBOX PROCESSOR ${OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.VERSION} PREVIEW`);
  console.log('WRITE = NONE');
  console.log(`REVISION_ROWS_EXCLUDED_BY_QUERY = ${revisionExposure.length}`);
  console.log(`SCANNED_NORMAL_CANDIDATES = ${scan.scanned}`);
  console.log(`READY_TO_PROCESS = ${scan.ready.length}`);
  console.log(`BLOCKED_SKIPPED_READ_ONLY = ${scan.blocked.length}`);
  console.log(`HAS_MORE_NORMAL_CANDIDATES = ${scan.hasMore ? 'YES' : 'NO'}`);
  console.log('----------------------------------------');

  scan.ready.forEach((x, i) => {
    console.log(`${i + 1}. [READY] ${x.item.decision} | ${x.item.title}`);
    console.log(
      `   observationType=${x.item.observationType || '(blank=NORMAL)'} / ` +
      `sourceClass=${x.item.sourceClass || '-'} / sourceType=${x.item.sourceType || '-'} / ` +
      `sourceRel=${x.item.sourceIds.length} / eventRel=${x.item.eventIds.length}`
    );
    x.validation.warnings.forEach(w => console.log(`   WARN: ${w}`));
  });

  if (scan.blocked.length) {
    console.log('----------------------------------------');
    scan.blocked.slice(0, 20).forEach((x, i) => {
      console.log(`${i + 1}. [BLOCKED-SKIP] ${x.item.decision} | ${x.item.title}`);
      x.validation.errors.forEach(e => console.log(`   ERROR: ${e}`));
    });
    if (scan.blocked.length > 20) {
      console.log(`... additional blocked omitted = ${scan.blocked.length - 20}`);
    }
  }

  console.log('========================================');
  console.log('SOURCE_REVISION = EXCLUDED');
  console.log('BLOCKED = READ ONLY / NO PATCH');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function runInboxProcessorCurrent() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; Processor skipped.');
    return;
  }

  const startedAt = Date.now();
  try {
    processorValidateConfig_();
    const scan = processorScanReadyOnlyCurrent_();

    let processed = 0;
    let excluded = 0;
    let staleSkipped = 0;
    let revisionSkipped = 0;
    let blockedSkipped = scan.blocked.length;
    let failed = 0;

    console.log('========================================');
    console.log(`OC-OS INBOX PROCESSOR ${OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.VERSION}`);
    console.log(`SCANNED_NORMAL_CANDIDATES = ${scan.scanned}`);
    console.log(`READY_SNAPSHOT = ${scan.ready.length}`);
    console.log(`BLOCKED_SKIPPED_READ_ONLY = ${scan.blocked.length}`);
    console.log('========================================');

    for (const snapshot of scan.ready) {
      if (Date.now() - startedAt >= OCOS_PROCESSOR_CURRENT.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining READY items wait for next run.');
        break;
      }

      // Commit直前に必ず再取得する。Snapshotだけで書かない。
      const currentPage = processorNotionRequest_(`/v1/pages/${snapshot.item.pageId}`, 'get');
      if (!currentPage || currentPage.in_trash || currentPage.archived) {
        staleSkipped++;
        console.log(`[STALE_SKIP] trashed/archived | ${snapshot.item.title}`);
        continue;
      }

      const item = processorParseInboxPageCurrent_(currentPage);

      if (!processorIsNormalObservationCurrent_(item.observationType)) {
        if (isSourceRevisionProcessorCurrent_(item)) revisionSkipped++;
        else staleSkipped++;
        console.log(`[OBSERVATION_SKIP] ${item.observationType || '(unknown)'} | ${item.title}`);
        continue;
      }

      const validation = processorValidateItemCurrent_(item);
      if (!validation.ok) {
        // 状態が変わってBLOCKEDになった場合もREAD ONLY。
        staleSkipped++;
        console.log(`[NOW_BLOCKED_SKIP] ${item.title}: ${validation.errors.join(' / ')}`);
        continue;
      }

      try {
        const result = processorProcessItemCurrent_(item);
        if (result === 'excluded') excluded++;
        else processed++;
        console.log(`[OK] ${item.decision} | ${item.title}`);
      } catch (err) {
        failed++;
        const message = processorErrorMessage_(err);

        try {
          processorMarkRuntimeErrorCurrent_(item, message);
        } catch (markErr) {
          console.error(
            `[ERROR] Failed to record runtime error for ${item.title}: ` +
            processorErrorMessage_(markErr)
          );
        }
        console.error(`[FAILED] ${item.title}: ${message}`);
      }

      Utilities.sleep(OCOS_PROCESSOR_CURRENT.WRITE_INTERVAL_MS);
    }

    console.log('========================================');
    console.log(
      `DONE processed=${processed}, excluded=${excluded}, ` +
      `blockedSkippedReadOnly=${blockedSkipped}, staleSkipped=${staleSkipped}, ` +
      `revisionSkipped=${revisionSkipped}, failed=${failed}, ` +
      `elapsedSec=${Math.round((Date.now() - startedAt) / 1000)}`
    );
    console.log('SOURCE_REVISION = EXCLUDED');
    console.log('BLOCKED = READ ONLY / NO PATCH');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// CURRENT READY-ONLY CORE
// ============================================================

function processorScanReadyOnlyCurrent_() {
  const ready = [];
  const blocked = [];
  let scanned = 0;
  let cursor = null;
  let hasMore = false;

  do {
    const body = {
      page_size: OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.PAGE_SIZE,
      filter: {
        and: [
          ...processorBaseCandidateFiltersCurrent_(),
          {
            or: [
              { property: 'Observation_Type', select: { is_empty: true } },
              { property: 'Observation_Type', select: { equals: OCOS_PROCESSOR_CURRENT_CURRENT_GUARD.NORMAL_VALUE } }
            ]
          }
        ]
      },
      sorts: [{ property: 'Detected_At', direction: 'ascending' }]
    };
    if (cursor) body.start_cursor = cursor;

    const response = processorNotionRequest_(
      `/v1/data_sources/${OCOS_PROCESSOR_CURRENT.INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );
    const pages = response.results || [];

    for (let i = 0; i < pages.length; i++) {
      if (scanned >= OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.MAX_SCAN) break;
      scanned++;

      const item = processorParseInboxPageCurrent_(pages[i]);

      if (!processorIsNormalObservationCurrent_(item.observationType)) {
        blocked.push({
          item,
          validation: {
            ok: false,
            errors: [`Unexpected Observation_Type=${item.observationType || '(blank)'}`],
            warnings: []
          }
        });
        continue;
      }

      const validation = processorValidateItemCurrent_(item);
      if (validation.ok) {
        ready.push({ item, validation });
        if (ready.length >= OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.TARGET_READY) {
          return {
            scanned,
            ready,
            blocked,
            hasMore: Boolean(response.has_more || i < pages.length - 1)
          };
        }
      } else {
        blocked.push({ item, validation });
      }
    }

    if (scanned >= OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.MAX_SCAN) {
      hasMore = Boolean(response.has_more);
      break;
    }

    cursor = response.has_more ? response.next_cursor : null;
    hasMore = Boolean(cursor);
  } while (cursor);

  return { scanned, ready, blocked, hasMore };
}

function processorIsNormalObservationCurrent_(value) {
  const s = String(value || '').trim();
  return !s || s === OCOS_PROCESSOR_CURRENT_CURRENT_GUARD.NORMAL_VALUE;
}

function processorProcessItemCurrent_(item) {
  const version = OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.VERSION;

  if (item.decision === '対象外') {
    processorPatchPage_(item.pageId, {
      Status: { select: { name: '除外' } },
      Processed_At: { date: { start: processorNowJstIso_() } },
      Processor_Version: processorRichText_(version),
      Processor_Error: processorRichText_('')
    });
    return 'excluded';
  }

  processorPatchPage_(item.pageId, {
    Status: { select: { name: '確認中' } },
    Processor_Version: processorRichText_(version),
    Processor_Error: processorRichText_('')
  });

  const sourceId = processorGetOrCreateSource_(item);

  processorPatchPage_(item.pageId, {
    Source: { relation: [{ id: sourceId }] },
    Processor_Version: processorRichText_(version)
  });

  if (item.decision === 'SOURCESのみ登録') {
    processorMarkSuccessCurrent_(item.pageId);
    return 'processed';
  }

  if (item.decision === '既存EVENTへ追加') {
    processorMergeSourceEvents_(sourceId, item.eventIds);
    processorMarkSuccessCurrent_(item.pageId);
    return 'processed';
  }

  if (item.decision === '新規EVENT作成') {
    const eventId = processorGetOrCreateDraftEvent_(item, sourceId);
    processorPatchPage_(item.pageId, {
      Event: { relation: [{ id: eventId }] },
      Processor_Version: processorRichText_(version)
    });
    processorMergeSourceEvents_(sourceId, [eventId]);
    processorMarkSuccessCurrent_(item.pageId);
    return 'processed';
  }

  throw new Error(`Unexpected Decision: ${item.decision}`);
}

function processorMarkSuccessCurrent_(inboxPageId) {
  processorPatchPage_(inboxPageId, {
    Status: { select: { name: '処理済' } },
    Processed_At: { date: { start: processorNowJstIso_() } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.VERSION),
    Processor_Error: processorRichText_('')
  });
}

function processorMarkRuntimeErrorCurrent_(item, message) {
  processorPatchPage_(item.pageId, {
    Status: { select: { name: '確認中' } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR_CURRENT_CURRENT_RUNTIME.VERSION),
    Processor_Error: processorRichText_(processorTruncate_(message, 1800))
  });
}

// ============================================================
// CURRENT CONNECTION / TRIGGER HELPERS
// ============================================================

function testInboxProcessorConnectionCurrent() {
  processorValidateConfig_();
  const result = processorNotionRequest_(
    `/v1/data_sources/${OCOS_PROCESSOR_CURRENT.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    { page_size: 1 }
  );
  console.log(`Inbox Processor Current connection OK. results=${(result.results || []).length}`);
}

function installInboxProcessorHourlyTriggerCurrent() {
  const legacyHandlers = ['runInboxProcessorV01', 'runInboxProcessorV011', 'runInboxProcessorV012'];
  const currentHandler = 'runInboxProcessorCurrent';
  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (legacyHandlers.includes(h) || h === currentHandler) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  ScriptApp.newTrigger(currentHandler)
    .timeBased()
    .everyHours(1)
    .create();

  console.log(`Inbox Processor Current hourly trigger installed. removed=${removed}, installed=1`);
  auditInboxProcessorTriggersCurrent();
}

function removeInboxProcessorTriggerCurrent() {
  const handler = 'runInboxProcessorCurrent';
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  console.log(`Inbox Processor Current triggers removed=${removed}`);
}

function auditInboxProcessorTriggersCurrent() {
  const handlers = [
    'runInboxProcessorV01',
    'runInboxProcessorV011',
    'runInboxProcessorV012',
    'runInboxProcessorCurrent'
  ];
  const counts = {};
  handlers.forEach(h => counts[h] = 0);

  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (Object.prototype.hasOwnProperty.call(counts, h)) counts[h]++;
  });

  console.log('========================================');
  console.log('OC-OS INBOX PROCESSOR CURRENT TRIGGER AUDIT');
  handlers.forEach(h => console.log(`${h} = ${counts[h]}`));
  console.log('EXPECTED: runInboxProcessorCurrent=1; all legacy handlers=0');
  console.log('========================================');
}