/**
 * おひさまコネクト - OC-OS Inbox Processor v0.1.0
 * 2026-09-24
 *
 * 目的:
 *   人間（あさくらじゅん）が Notion INBOX で Decision を確定した後だけ、
 *   SOURCES / EVENTS への反映と Relation 更新を行う。
 *
 * 重要原則:
 *   1. Processor は Decision を決めない。
 *   2. 「未判断」は絶対に処理しない。
 *   3. 「未判定」の Source_Class / Source_Type は SOURCES へ昇格しない。
 *   4. 既存EVENTへ追加は INBOX.Event が指定されている場合だけ実行する。
 *   5. 新規EVENTは Draft として作り Human_Status=未確認 にする。
 *   6. 再実行で二重 Source / Event を作らない（URL / Origin_Inbox で再利用）。
 *   7. Pilot 中は自動トリガーを入れない。preview → manual run で検証する。
 *
 * 必要な Script Properties:
 *   NOTION_TOKEN
 *
 * 既存 Crawler v1.2.2 と同じ Apps Script Project に別ファイルとして追加可能。
 */

const OCOS_PROCESSOR = Object.freeze({
  VERSION: '0.1.0',
  NOTION_VERSION: '2026-03-11',
  TIMEZONE: 'Asia/Tokyo',

  INBOX_DATA_SOURCE_ID: '7e3a247d-8d7b-4ed7-a4b1-cfac6ec45f16',
  SOURCES_DATA_SOURCE_ID: '9ba27a8b-7f2e-4025-b943-d6e24e82b7a9',
  EVENTS_DATA_SOURCE_ID: '76508d6c-7771-46d4-850c-ca256c1080be',

  MAX_PER_RUN: 20,
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
function testInboxProcessorConnectionV01() {
  processorValidateConfig_();

  const result = processorNotionRequest_(
    `/v1/data_sources/${OCOS_PROCESSOR.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    { page_size: 1 }
  );

  console.log(
    `Inbox Processor connection OK. results=${(result.results || []).length}`
  );
}

/**
 * Decision 済み・未反映候補を表示するだけ。書き込みなし。
 */
function previewInboxProcessorV01() {
  processorValidateConfig_();

  const pages = processorLoadCandidates_(OCOS_PROCESSOR.MAX_PER_RUN);

  console.log('========================================');
  console.log(`OC-OS INBOX PROCESSOR v${OCOS_PROCESSOR.VERSION} PREVIEW`);
  console.log('WRITE = NONE');
  console.log(`CANDIDATES = ${pages.length}`);
  console.log('========================================');

  pages.forEach((page, index) => {
    const item = processorParseInboxPage_(page);
    const validation = processorValidateItem_(item);

    console.log(
      `${index + 1}. ${validation.ok ? '[READY]' : '[BLOCKED]'} ` +
      `${item.decision} | ${item.title}`
    );

    console.log(
      `   sourceClass=${item.sourceClass || '-'} / ` +
      `sourceType=${item.sourceType || '-'} / ` +
      `sourceRel=${item.sourceIds.length} / eventRel=${item.eventIds.length}`
    );

    if (!validation.ok) {
      validation.errors.forEach(x => console.log(`   ERROR: ${x}`));
    }

    validation.warnings.forEach(x => console.log(`   WARN: ${x}`));
  });

  console.log('========================================');
  console.log('PREVIEW COMPLETE');
  console.log('========================================');
}

/**
 * Decision 済み候補を最大 MAX_PER_RUN 件処理する。
 * Pilot 中は手動実行のみ。
 */
function runInboxProcessorV01() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; Processor skipped.');
    return;
  }

  const startedAt = Date.now();

  try {
    processorValidateConfig_();

    const pages = processorLoadCandidates_(OCOS_PROCESSOR.MAX_PER_RUN);

    let processed = 0;
    let excluded = 0;
    let blocked = 0;
    let failed = 0;

    console.log('========================================');
    console.log(`OC-OS INBOX PROCESSOR v${OCOS_PROCESSOR.VERSION}`);
    console.log(`CANDIDATES = ${pages.length}`);
    console.log('========================================');

    for (const page of pages) {
      if (Date.now() - startedAt >= OCOS_PROCESSOR.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items will wait for next run.');
        break;
      }

      const item = processorParseInboxPage_(page);
      const validation = processorValidateItem_(item);

      if (!validation.ok) {
        blocked++;
        processorMarkValidationBlocked_(item, validation.errors.join(' / '));
        console.warn(`[BLOCKED] ${item.title}: ${validation.errors.join(' / ')}`);
        Utilities.sleep(OCOS_PROCESSOR.WRITE_INTERVAL_MS);
        continue;
      }

      try {
        const result = processorProcessItem_(item);

        if (result === 'excluded') {
          excluded++;
        } else {
          processed++;
        }

        console.log(`[OK] ${item.decision} | ${item.title}`);
      } catch (err) {
        failed++;
        const message = processorErrorMessage_(err);

        try {
          processorMarkRuntimeError_(item, message);
        } catch (markErr) {
          console.error(
            `[ERROR] Failed to record Processor_Error for ${item.title}: ` +
            processorErrorMessage_(markErr)
          );
        }

        console.error(`[FAILED] ${item.title}: ${message}`);
      }

      Utilities.sleep(OCOS_PROCESSOR.WRITE_INTERVAL_MS);
    }

    console.log('========================================');
    console.log(
      `DONE processed=${processed}, excluded=${excluded}, ` +
      `blocked=${blocked}, failed=${failed}, ` +
      `elapsedSec=${Math.round((Date.now() - startedAt) / 1000)}`
    );
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// Candidate loading / parsing
// ============================================================

function processorLoadCandidates_(pageSize) {
  const result = processorNotionRequest_(
    `/v1/data_sources/${OCOS_PROCESSOR.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    {
      page_size: Math.min(pageSize || 20, 100),
      filter: {
        and: [
          {
            or: [
              {
                property: 'Status',
                select: { equals: '未処理' }
              },
              {
                property: 'Status',
                select: { equals: '確認中' }
              }
            ]
          },
          {
            property: 'Decision',
            select: { does_not_equal: '未判断' }
          }
        ]
      },
      sorts: [
        {
          property: 'Detected_At',
          direction: 'ascending'
        }
      ]
    }
  );

  return result.results || [];
}

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

function processorProcessItem_(item) {
  if (item.decision === '対象外') {
    processorPatchPage_(item.pageId, {
      Status: { select: { name: '除外' } },
      Processed_At: { date: { start: processorNowJstIso_() } },
      Processor_Version: processorRichText_(OCOS_PROCESSOR.VERSION),
      Processor_Error: processorRichText_('')
    });

    return 'excluded';
  }

  // 途中処理中であることを明示。
  processorPatchPage_(item.pageId, {
    Status: { select: { name: '確認中' } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR.VERSION),
    Processor_Error: processorRichText_('')
  });

  const sourceId = processorGetOrCreateSource_(item);

  // Source Relation はSource作成直後に確定させ、以降の再実行で再利用可能にする。
  processorPatchPage_(item.pageId, {
    Source: { relation: [{ id: sourceId }] },
    Processor_Version: processorRichText_(OCOS_PROCESSOR.VERSION)
  });

  if (item.decision === 'SOURCESのみ登録') {
    processorMarkSuccess_(item.pageId);
    return 'processed';
  }

  if (item.decision === '既存EVENTへ追加') {
    processorMergeSourceEvents_(sourceId, item.eventIds);
    processorMarkSuccess_(item.pageId);
    return 'processed';
  }

  if (item.decision === '新規EVENT作成') {
    const eventId = processorGetOrCreateDraftEvent_(item, sourceId);

    processorPatchPage_(item.pageId, {
      Event: { relation: [{ id: eventId }] },
      Processor_Version: processorRichText_(OCOS_PROCESSOR.VERSION)
    });

    // Relationがdualでも、再実行・途中失敗に強くするためSource側も明示的に保証する。
    processorMergeSourceEvents_(sourceId, [eventId]);

    processorMarkSuccess_(item.pageId);
    return 'processed';
  }

  throw new Error(`Unexpected Decision: ${item.decision}`);
}


// ============================================================
// SOURCES
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
      data_source_id: OCOS_PROCESSOR.SOURCES_DATA_SOURCE_ID
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
    `/v1/data_sources/${OCOS_PROCESSOR.SOURCES_DATA_SOURCE_ID}/query`,
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
      data_source_id: OCOS_PROCESSOR.EVENTS_DATA_SOURCE_ID
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
    `/v1/data_sources/${OCOS_PROCESSOR.EVENTS_DATA_SOURCE_ID}/query`,
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
    Processor_Version: processorRichText_(OCOS_PROCESSOR.VERSION),
    Processor_Error: processorRichText_('')
  });
}

function processorMarkValidationBlocked_(item, message) {
  processorPatchPage_(item.pageId, {
    // 人間の入力不足は処理途中ではないため未処理のまま残す。
    Status: { select: { name: '未処理' } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR.VERSION),
    Processor_Error: processorRichText_(processorTruncate_(message, 1800))
  });
}

function processorMarkRuntimeError_(item, message) {
  processorPatchPage_(item.pageId, {
    // API途中失敗等は再開対象として確認中に残す。
    Status: { select: { name: '確認中' } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR.VERSION),
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
      'Notion-Version': OCOS_PROCESSOR.NOTION_VERSION
    }
  };

  if (body !== undefined && body !== null) {
    options.payload = JSON.stringify(body);
  }

  for (let attempt = 0; attempt < OCOS_PROCESSOR.HTTP_MAX_RETRIES; attempt++) {
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
    OCOS_PROCESSOR.TIMEZONE,
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
