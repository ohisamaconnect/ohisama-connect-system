/**
 * OC-OS Messages Current - mixed Production/Pilot Runtime family
 *
 * Runtime policy:
 * - Google Form -> MESSAGES v0.1.1 is the confirmed Production route.
 * - Gmail label route remains Pilot/manual; no time trigger is installed here.
 * - Gmail eligibility is controlled only by label OC-OS/MESSAGES.
 * - No AI classification is used for Gmail intake.
 * - Own-domain replies are excluded from Gmail listener-message intake.
 * - Existing public handler names are preserved for trigger compatibility.
 */

// ============================================================
// CURRENT FAMILY SOURCE: MESSAGES Form Sync v0.1.1 / PRODUCTION
// ============================================================

/**
 * OC-OS MESSAGES / Google Form -> Notion
 * v0.1.1 (2026-09-24)
 *
 * Purpose:
 * - New Google Form responses are inserted into Notion MESSAGES.
 * - Existing historical responses were already migrated separately.
 * - Source_Key makes each form row idempotent.
 *
 * Script Properties:
 * - NOTION_API_TOKEN (preferred)
 *   Fallbacks: NOTION_TOKEN / NOTION_SECRET
 */

const OC_MESSAGES_V01 = Object.freeze({
  VERSION: '0.1.1',
  SPREADSHEET_ID: '1QSt6EzXEjOOsK-LAszW5bGxtLRZWpfTBCcVqvpPgOE8',
  SHEET_NAME: 'フォームの回答 1',
  NOTION_DATA_SOURCE_ID: '4e56b186-74b3-4ee9-87a8-048a1b7cc650',
  NOTION_VERSION: '2026-03-11',
  HANDLER: 'onMessageFormSubmitV01',
  TIME_ZONE: 'Asia/Tokyo',
  MAX_REPAIR_ROWS: 100
});

/** Install once. Removes duplicate triggers for this handler first. */
function installMessagesFormSubmitTriggerV01() {
  const ss = SpreadsheetApp.openById(OC_MESSAGES_V01.SPREADSHEET_ID);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === OC_MESSAGES_V01.HANDLER)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(OC_MESSAGES_V01.HANDLER)
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  console.log('MESSAGES form-submit trigger installed: ' + OC_MESSAGES_V01.HANDLER);
}

/** Installable spreadsheet Form Submit trigger handler. */
function onMessageFormSubmitV01(e) {
  if (!e || !e.range) throw new Error('Form-submit event range is missing.');
  const row = e.range.getRow();
  if (row < 2) return;
  syncMessageFormRowV01_(row);
}

/** Preview latest response without writing to Notion. */
function previewLatestMessageFormRowV01() {
  const sheet = getMessagesFormSheetV01_();
  const row = sheet.getLastRow();
  if (row < 2) {
    console.log('No form responses.');
    return;
  }
  const parsed = readMessageFormRowV01_(sheet, row);
  console.log(JSON.stringify({
    write: 'NONE',
    row: row,
    sourceKey: parsed.sourceKey,
    receivedAt: parsed.receivedAt,
    radioName: parsed.radioName,
    messageType: parsed.messageType,
    broadcastPermission: parsed.broadcastPermission,
    requestSongText: parsed.requestSongText,
    bodyPreview: parsed.bodyPreview
  }, null, 2));
}

/**
 * Repair path after an outage.
 * Checks only the most recent rows and inserts missing rows idempotently.
 */
function repairRecentMessagesFormV01() {
  const sheet = getMessagesFormSheetV01_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const startRow = Math.max(2, lastRow - OC_MESSAGES_V01.MAX_REPAIR_ROWS + 1);
  let created = 0;
  let reused = 0;

  for (let row = startRow; row <= lastRow; row++) {
    const result = syncMessageFormRowV01_(row);
    if (result === 'CREATED') created++;
    if (result === 'EXISTS') reused++;
    Utilities.sleep(350);
  }

  console.log(JSON.stringify({
    range: startRow + ':' + lastRow,
    created: created,
    existing: reused
  }, null, 2));
}

function syncMessageFormRowV01_(row) {
  const sheet = getMessagesFormSheetV01_();
  const parsed = readMessageFormRowV01_(sheet, row);
  if (!parsed.timestampRaw || !parsed.body) {
    console.log('SKIP row=' + row + ' reason=missing timestamp/body');
    return 'SKIP';
  }

  if (notionMessageExistsBySourceKeyV01_(parsed.sourceKey)) {
    console.log('EXISTS ' + parsed.sourceKey);
    return 'EXISTS';
  }

  const payload = buildNotionMessagePageV01_(parsed);
  notionRequestV01_('/v1/pages', 'post', payload);
  console.log('CREATED ' + parsed.sourceKey);
  return 'CREATED';
}

function getMessagesFormSheetV01_() {
  const ss = SpreadsheetApp.openById(OC_MESSAGES_V01.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(OC_MESSAGES_V01.SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + OC_MESSAGES_V01.SHEET_NAME);
  return sheet;
}

function readMessageFormRowV01_(sheet, row) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const display = sheet.getRange(row, 1, 1, lastCol).getDisplayValues()[0];
  const raw = sheet.getRange(row, 1, 1, lastCol).getValues()[0];

  const indexes = findMessageHeaderIndexesV01_(headers);
  const timestampRaw = display[indexes.timestamp] || '';
  const timestampValue = raw[indexes.timestamp];
  const radioName = valueAtV01_(display, indexes.radioName) || 'ラジオネーム不明';
  const prefecture = valueAtV01_(display, indexes.prefecture);
  const ageBand = valueAtV01_(display, indexes.ageBand);
  const messageType = valueAtV01_(display, indexes.messageType);
  const body = valueAtV01_(display, indexes.body);
  const broadcastRaw = valueAtV01_(display, indexes.broadcastPermission);

  // Form versions used two columns with effectively the same email label.
  const emailAddress = indexes.email
    .map(i => valueAtV01_(display, i))
    .find(Boolean) || '';

  const receivedAt = timestampValue instanceof Date
    ? Utilities.formatDate(timestampValue, OC_MESSAGES_V01.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
    : parseDisplayTimestampV01_(timestampRaw);

  return {
    row: row,
    sourceKey: 'FORM:' + OC_MESSAGES_V01.SPREADSHEET_ID + ':' + row,
    timestampRaw: timestampRaw,
    receivedAt: receivedAt,
    emailAddress: emailAddress,
    radioName: radioName,
    prefecture: prefecture,
    ageBand: ageBand,
    messageType: messageType,
    body: body,
    bodyPreview: String(body || '').replace(/\s+/g, ' ').slice(0, 350),
    broadcastPermission: normalizeBroadcastPermissionV01_(broadcastRaw),
    requestSongText: extractRequestSongTextV01_(messageType, body)
  };
}

function findMessageHeaderIndexesV01_(headers) {
  const normalized = headers.map(h => String(h || '').trim());
  const find = predicate => {
    const i = normalized.findIndex(predicate);
    if (i < 0) throw new Error('Required form header not found. headers=' + JSON.stringify(normalized));
    return i;
  };

  return {
    timestamp: find(h => h === 'タイムスタンプ'),
    email: normalized.map((h, i) => h === 'メールアドレス' ? i : -1).filter(i => i >= 0),
    radioName: find(h => h.indexOf('ラジオネーム') >= 0),
    prefecture: find(h => h.indexOf('お住まい') >= 0),
    ageBand: find(h => h.indexOf('年代') >= 0),
    messageType: find(h => h.indexOf('お便りの種類') >= 0),
    body: find(h => h.indexOf('メッセージ本文') >= 0),
    broadcastPermission: find(h => h.indexOf('放送でのご紹介') >= 0)
  };
}

function valueAtV01_(row, index) {
  if (Array.isArray(index)) return '';
  return index >= 0 ? String(row[index] || '').trim() : '';
}

function normalizeBroadcastPermissionV01_(raw) {
  const s = String(raw || '');
  if (/はい|OK/i.test(s)) return '紹介OK';
  if (/いいえ|不可|NG/i.test(s)) return '紹介不可';
  return '未回答';
}

function extractRequestSongTextV01_(messageType, body) {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!lines.length) return '';

  const picked = [];
  let marker = lines.findIndex(s => s.indexOf('リクエスト曲') >= 0);

  // お便り種別が「楽曲リクエスト」でなくても、本文中に
  // 「リクエスト曲」と明示されていれば抽出対象にする。
  if (marker < 0) {
    marker = lines.findIndex(s => /(?:リクエスト|希望)(?:します|させて|お願い)/.test(s));
  }

  if (marker >= 0) {
    // 「三輪車に乗りたいを希望します」のように同一行で完結する場合。
    // 説明文や「3曲をリクエストします」のような文は曲名として扱わない。
    const sameLine = lines[marker].match(/^(.{1,120}?)を(?:リクエスト|希望)(?:します|させてください|お願いします)?[！!。.]?$/);
    if (sameLine && sameLine[1]) {
      const candidate = sameLine[1].trim();
      if (candidate.length <= 60 && !/[、。]/.test(candidate) && !/\d+\s*曲/.test(candidate)) {
        picked.push(candidate);
      }
    }

    if (!picked.length) {
      for (let i = marker + 1; i < Math.min(lines.length, marker + 8); i++) {
        if (/^(あさくら|アサクラ|こんばんは|こんにちは|よろしく)/.test(lines[i])) break;
        picked.push(lines[i]);
      }
    }
  }

  // 種別が楽曲リクエストでも曲名を安全に抽出できない場合は、
  // 誤った曲名候補を作らず空欄にする。本文はMESSAGEページで確認できる。
  return picked.join(' / ').slice(0, 300);
}

function parseDisplayTimestampV01_(s) {
  const m = String(s || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return m[1] + '-' + pad2V01_(m[2]) + '-' + pad2V01_(m[3]) + 'T' +
    pad2V01_(m[4]) + ':' + m[5] + ':' + m[6] + '+09:00';
}

function pad2V01_(v) {
  return String(v).padStart(2, '0');
}

function notionMessageExistsBySourceKeyV01_(sourceKey) {
  const body = {
    filter: {
      property: 'Source_Key',
      rich_text: { equals: sourceKey }
    },
    page_size: 1
  };
  const path = '/v1/data_sources/' + OC_MESSAGES_V01.NOTION_DATA_SOURCE_ID + '/query';
  const result = notionRequestV01_(path, 'post', body);
  return Array.isArray(result.results) && result.results.length > 0;
}

function buildNotionMessagePageV01_(m) {
  const dateLabel = m.receivedAt ? m.receivedAt.slice(0, 10) : String(m.timestampRaw || '').slice(0, 10);
  const title = dateLabel + '｜' + (m.radioName || 'ラジオネーム不明') + '｜' + (m.messageType || 'お便り');

  const properties = {
    Message: { title: notionRichTextV01_(title) },
    Source_Key: { rich_text: notionRichTextV01_(m.sourceKey) },
    Channel: { select: { name: 'FORM' } },
    Review_Status: { select: { name: '未確認' } },
    Radio_Name: { rich_text: notionRichTextV01_(m.radioName) },
    Prefecture: { rich_text: notionRichTextV01_(m.prefecture) },
    Age_Band: { rich_text: notionRichTextV01_(m.ageBand) },
    Message_Type: { rich_text: notionRichTextV01_(m.messageType) },
    Body_Preview: { rich_text: notionRichTextV01_(m.bodyPreview) },
    Broadcast_Permission: { select: { name: m.broadcastPermission } },
    Request_Song_Text: { rich_text: notionRichTextV01_(m.requestSongText) },
    Form_Row: { number: m.row },
    Attachment_Count: { number: 0 }
  };

  if (m.receivedAt) properties.Received_At = { date: { start: m.receivedAt } };
  if (m.emailAddress) properties.Email_Address = { email: m.emailAddress };

  return {
    parent: {
      type: 'data_source_id',
      data_source_id: OC_MESSAGES_V01.NOTION_DATA_SOURCE_ID
    },
    properties: properties,
    children: messageBodyBlocksV01_(m.body)
  };
}

function notionRichTextV01_(value) {
  const s = String(value || '');
  if (!s) return [];
  const result = [];
  for (let i = 0; i < s.length; i += 1800) {
    result.push({
      type: 'text',
      text: { content: s.slice(i, i + 1800) }
    });
  }
  return result;
}

function messageBodyBlocksV01_(body) {
  const blocks = [{
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: notionRichTextV01_('お便り本文') }
  }];

  const normalized = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split('\n');

  paragraphs.forEach(p => {
    if (!p) return;
    for (let i = 0; i < p.length; i += 1800) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: notionRichTextV01_(p.slice(i, i + 1800)) }
      });
    }
  });

  return blocks.slice(0, 95);
}

function notionRequestV01_(path, method, payload) {
  const token = getNotionTokenV01_();
  const response = UrlFetchApp.fetch('https://api.notion.com' + path, {
    method: method,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      'Notion-Version': OC_MESSAGES_V01.NOTION_VERSION
    },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Notion API ' + code + ': ' + text);
  }
  return text ? JSON.parse(text) : {};
}

function getNotionTokenV01_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) {
    throw new Error('Set NOTION_API_TOKEN (or NOTION_TOKEN / NOTION_SECRET) in Script Properties.');
  }
  return token;
}

// ============================================================
// CURRENT FAMILY SOURCE: MESSAGES Gmail Preview v0.1.2 / PILOT
// ============================================================

/**
 * OC-OS MESSAGES / Gmail Label Gate PREVIEW
 * v0.1.2-preview (2026-09-25)
 *
 * Canonical boundary:
 * - Gmail label "OC-OS/MESSAGES" is the only Production-entry gate.
 * - No AI classification.
 * - No subject/body/recipient heuristic is used to decide eligibility.
 * - Messages sent from @ohisamaconnect.com are excluded to avoid importing own replies.
 * - Source_Key = EMAIL:<Gmail message id> (matches historical Gmail migration)
 *
 * PREVIEW ONLY:
 * - Reads Gmail.
 * - Optionally queries Notion by Source_Key to show NEW / EXISTS.
 * - Does NOT create/update Notion pages.
 * - Does NOT change Gmail labels.
 * - Does NOT install triggers.
 *
 * Script Properties:
 * - NOTION_API_TOKEN (preferred)
 *   Fallbacks: NOTION_TOKEN / NOTION_SECRET
 */

const OC_MESSAGES_GMAIL_PREVIEW_V01 = Object.freeze({
  VERSION: '0.1.2-preview',
  LABEL_NAME: 'OC-OS/MESSAGES',
  OWN_DOMAIN: '@ohisamaconnect.com',
  GMAIL_AUTHUSER: 'labo@ohisamaconnect.com',
  NOTION_DATA_SOURCE_ID: '4e56b186-74b3-4ee9-87a8-048a1b7cc650',
  NOTION_VERSION: '2026-03-11',
  TIME_ZONE: 'Asia/Tokyo',
  MAX_THREADS: 50,
  MAX_MESSAGES: 100
});

/**
 * Main PREVIEW.
 *
 * Safe to run repeatedly:
 * - WRITE = NONE
 * - Historical Gmail records are checked by Source_Key.
 */
function previewLabeledGmailMessagesV01() {
  const cfg = OC_MESSAGES_GMAIL_PREVIEW_V01;
  const label = GmailApp.getUserLabelByName(cfg.LABEL_NAME);

  console.log('========================================');
  console.log('OC-OS MESSAGES GMAIL LABEL PREVIEW');
  console.log('VERSION = ' + cfg.VERSION);
  console.log('LABEL = ' + cfg.LABEL_NAME);
  console.log('WRITE = NONE');
  console.log('========================================');

  if (!label) {
    console.log('STOP: Gmail label not found: ' + cfg.LABEL_NAME);
    return;
  }

  const threads = label.getThreads(0, cfg.MAX_THREADS);
  let scannedMessages = 0;
  let eligible = 0;
  let ownDomainSkipped = 0;
  let existing = 0;
  let newCount = 0;
  let notionUnchecked = 0;

  const previewRows = [];

  outer:
  for (let t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const messages = thread.getMessages();

    for (let m = 0; m < messages.length; m++) {
      if (scannedMessages >= cfg.MAX_MESSAGES) break outer;
      scannedMessages++;

      const message = messages[m];
      const parsed = readLabeledGmailMessageV01_(message, thread);

      // Gmail UI labeling is thread-oriented. A labeled thread can contain our own replies.
      // They are never listener MESSAGE records.
      if (isOwnDomainSenderV01_(parsed.fromAddress)) {
        ownDomainSkipped++;
        continue;
      }

      eligible++;

      const exists = notionMessageExistsBySourceKeyPreviewV01_(parsed.sourceKey);
      let notionState = 'NOT_CHECKED';

      if (exists === true) {
        notionState = 'EXISTS';
        existing++;
      } else if (exists === false) {
        notionState = 'NEW';
        newCount++;
      } else {
        notionUnchecked++;
      }

      previewRows.push({
        state: notionState,
        sourceKey: parsed.sourceKey,
        receivedAt: parsed.receivedAt,
        from: parsed.from,
        fromAddress: parsed.fromAddress,
        to: parsed.to,
        subject: parsed.subject,
        bodyPreview: parsed.bodyPreview,
        attachmentCount: parsed.attachmentCount,
        attachmentNames: parsed.attachmentNames,
        externalMessageId: parsed.externalMessageId,
        threadId: parsed.threadId,
        gmailUrl: parsed.gmailUrl,
        notionMappingPreview: buildNotionMappingPreviewV01_(parsed)
      });
    }
  }

  console.log(JSON.stringify({
    write: 'NONE',
    label: cfg.LABEL_NAME,
    threadsScanned: threads.length,
    messagesScanned: scannedMessages,
    eligibleExternalMessages: eligible,
    ownDomainSkipped: ownDomainSkipped,
    notionExisting: existing,
    notionNew: newCount,
    notionNotChecked: notionUnchecked,
    rows: previewRows
  }, null, 2));
}

/**
 * One Gmail message -> future MESSAGES source material.
 * This function does not infer Radio_Name / Message_Type / Broadcast_Permission.
 * Those fields are intentionally left for the later sync design.
 */
function readLabeledGmailMessageV01_(message, thread) {
  const from = String(message.getFrom() || '').trim();
  const fromAddress = extractEmailAddressV01_(from);
  const date = message.getDate();
  const messageId = message.getId();
  const threadId = thread.getId();
  const body = String(message.getPlainBody() || '').trim();
  // GmailApp advanced attachment filters can miss image files in some MIME layouts.
  // For Attachment_Count we want every attached file payload, so use the default getter.
  const attachments = message.getAttachments();

  return {
    sourceKey: 'EMAIL:' + messageId,
    receivedAt: Utilities.formatDate(
      date,
      OC_MESSAGES_GMAIL_PREVIEW_V01.TIME_ZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX"
    ),
    from: from,
    fromAddress: fromAddress,
    to: String(message.getTo() || '').trim(),
    cc: String(message.getCc() || '').trim(),
    subject: String(message.getSubject() || '').trim(),
    body: body,
    bodyPreview: body.replace(/\s+/g, ' ').slice(0, 350),
    attachmentCount: attachments.length,
    attachmentNames: attachments.map(a => String(a.getName() || '')).filter(Boolean),
    externalMessageId: messageId,
    threadId: threadId,
    gmailUrl: 'https://mail.google.com/mail/u/?authuser=' +
      encodeURIComponent(OC_MESSAGES_GMAIL_PREVIEW_V01.GMAIL_AUTHUSER) +
      '#all/' + messageId
  };
}

function extractEmailAddressV01_(from) {
  const s = String(from || '').trim();
  const bracket = s.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (bracket) return bracket[1].toLowerCase();

  const plain = s.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return plain ? plain[1].toLowerCase() : '';
}

function isOwnDomainSenderV01_(email) {
  const s = String(email || '').toLowerCase();
  return s.endsWith(OC_MESSAGES_GMAIL_PREVIEW_V01.OWN_DOMAIN);
}

/**
 * Read-only Notion collision check.
 *
 * Returns:
 * - true  = already exists
 * - false = not found
 * - null  = Notion token unavailable / lookup failed
 *
 * PREVIEW should keep running even when Notion lookup is unavailable.
 */
function notionMessageExistsBySourceKeyPreviewV01_(sourceKey) {
  try {
    const token = getNotionTokenPreviewV01_();
    if (!token) return null;

    const response = UrlFetchApp.fetch(
      'https://api.notion.com/v1/data_sources/' +
        OC_MESSAGES_GMAIL_PREVIEW_V01.NOTION_DATA_SOURCE_ID +
        '/query',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + token,
          'Notion-Version': OC_MESSAGES_GMAIL_PREVIEW_V01.NOTION_VERSION
        },
        payload: JSON.stringify({
          filter: {
            property: 'Source_Key',
            rich_text: { equals: sourceKey }
          },
          page_size: 1
        }),
        muteHttpExceptions: true
      }
    );

    const code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      console.log(
        'WARN Notion lookup failed sourceKey=' + sourceKey +
        ' code=' + code +
        ' body=' + response.getContentText().slice(0, 500)
      );
      return null;
    }

    const result = JSON.parse(response.getContentText() || '{}');
    return Array.isArray(result.results) && result.results.length > 0;
  } catch (err) {
    console.log(
      'WARN Notion lookup error sourceKey=' + sourceKey +
      ' error=' + (err && err.message ? err.message : err)
    );
    return null;
  }
}

function getNotionTokenPreviewV01_() {
  const p = PropertiesService.getScriptProperties();
  return p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET') ||
    '';
}


/**
 * PREVIEW of the future Notion mapping.
 * No write occurs here.
 *
 * Conservative rules:
 * - Radio_Name: only explicit "ラジオネーム:" / "RN:" style markers.
 * - Message_Type: Gmail subject verbatim. No AI classification.
 * - Broadcast_Permission: 未回答 unless a future explicit rule is approved.
 * - Prefecture / Age_Band / Request_Song_Text: left blank in this phase.
 */
function buildNotionMappingPreviewV01_(m) {
  const radioName = extractExplicitRadioNameV01_(m.body);
  const dateLabel = m.receivedAt ? m.receivedAt.slice(0, 10) : '';
  const messageType = String(m.subject || '').trim();

  return {
    Message: [
      dateLabel || '日付不明',
      radioName || 'ラジオネーム不明',
      messageType || 'EMAIL'
    ].join('｜'),
    Source_Key: m.sourceKey,
    Channel: 'EMAIL',
    Received_At: m.receivedAt,
    Review_Status: '未確認',
    Radio_Name: radioName,
    Email_Address: m.fromAddress,
    Prefecture: '',
    Age_Band: '',
    Message_Type: messageType,
    Body_Preview: m.bodyPreview,
    Broadcast_Permission: '未回答',
    Request_Song_Text: '',
    Gmail_URL: m.gmailUrl,
    External_Message_ID: m.externalMessageId,
    Attachment_Count: m.attachmentCount,
    Page_Body_Heading: 'お便り本文',
    Page_Body: m.body
  };
}

function extractExplicitRadioNameV01_(body) {
  const text = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    const m = line.match(/^(?:ラジオネーム|radio\s*name|RN)\s*[：:]\s*(.+)$/i);
    if (!m) continue;

    const value = String(m[1] || '').trim();
    if (!value || value.length > 100) return '';
    return value;
  }
  return '';
}


// ============================================================
// CURRENT FAMILY SOURCE: MESSAGES Gmail Manual Sync v0.1.0 / PILOT
// ============================================================

/**
 * OC-OS MESSAGES / Gmail Label -> Notion Manual Sync
 * v0.1.0 (2026-09-25)
 *
 * Canonical boundary:
 * - Only Gmail messages carrying label "OC-OS/MESSAGES" are eligible.
 * - No AI classification and no automatic Gmail-wide intake.
 * - Messages sent from @ohisamaconnect.com are excluded.
 * - Source_Key = EMAIL:<Gmail message id> to match historical migration.
 *
 * Operation:
 * 1) Asakura manually applies Gmail label "OC-OS/MESSAGES".
 * 2) Run previewLabeledGmailMessagesSyncV01() if desired.
 * 3) Run syncLabeledGmailMessagesV01() manually when ready.
 *
 * No time trigger is installed by this file.
 *
 * Script Properties:
 * - NOTION_API_TOKEN (preferred)
 *   Fallbacks: NOTION_TOKEN / NOTION_SECRET
 */

const OC_MESSAGES_GMAIL_SYNC_V01 = Object.freeze({
  VERSION: '0.1.0',
  LABEL_NAME: 'OC-OS/MESSAGES',
  OWN_DOMAIN: '@ohisamaconnect.com',
  GMAIL_AUTHUSER: 'labo@ohisamaconnect.com',
  NOTION_DATA_SOURCE_ID: '4e56b186-74b3-4ee9-87a8-048a1b7cc650',
  NOTION_VERSION: '2026-03-11',
  TIME_ZONE: 'Asia/Tokyo',
  MAX_THREADS: 50,
  MAX_MESSAGES: 100
});

/** Read-only preview. */
function previewLabeledGmailMessagesSyncV01() {
  return runLabeledGmailMessagesSyncV01_(false);
}

/**
 * Manual sync.
 * Creates only missing MESSAGE records.
 * Safe to run repeatedly because Source_Key is idempotent.
 */
function syncLabeledGmailMessagesV01() {
  return runLabeledGmailMessagesSyncV01_(true);
}

function runLabeledGmailMessagesSyncV01_(write) {
  const cfg = OC_MESSAGES_GMAIL_SYNC_V01;
  const label = GmailApp.getUserLabelByName(cfg.LABEL_NAME);

  console.log('========================================');
  console.log('OC-OS MESSAGES GMAIL MANUAL SYNC');
  console.log('VERSION = ' + cfg.VERSION);
  console.log('LABEL = ' + cfg.LABEL_NAME);
  console.log('WRITE = ' + (write ? 'NOTION' : 'NONE'));
  console.log('========================================');

  if (!label) {
    console.log('STOP: Gmail label not found: ' + cfg.LABEL_NAME);
    return;
  }

  const threads = label.getThreads(0, cfg.MAX_THREADS);
  let scannedMessages = 0;
  let eligible = 0;
  let ownDomainSkipped = 0;
  let existing = 0;
  let created = 0;
  let wouldCreate = 0;
  let skippedMissingBody = 0;

  const rows = [];

  outer:
  for (let t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const messages = thread.getMessages();

    for (let m = 0; m < messages.length; m++) {
      if (scannedMessages >= cfg.MAX_MESSAGES) break outer;
      scannedMessages++;

      const parsed = readLabeledGmailMessageSyncV01_(messages[m], thread);

      if (isOwnDomainSenderSyncV01_(parsed.fromAddress)) {
        ownDomainSkipped++;
        continue;
      }

      eligible++;

      if (!parsed.body) {
        skippedMissingBody++;
        rows.push({
          state: 'SKIP_NO_BODY',
          sourceKey: parsed.sourceKey,
          subject: parsed.subject,
          fromAddress: parsed.fromAddress
        });
        continue;
      }

      if (notionMessageExistsBySourceKeyGmailV01_(parsed.sourceKey)) {
        existing++;
        rows.push({
          state: 'EXISTS',
          sourceKey: parsed.sourceKey,
          subject: parsed.subject,
          radioName: parsed.radioName,
          receivedAt: parsed.receivedAt
        });
        continue;
      }

      if (!write) {
        wouldCreate++;
        rows.push({
          state: 'WOULD_CREATE',
          sourceKey: parsed.sourceKey,
          mapping: buildNotionMappingPreviewSyncV01_(parsed)
        });
        continue;
      }

      const payload = buildNotionMessagePageGmailV01_(parsed);
      const result = notionRequestGmailV01_('/v1/pages', 'post', payload);
      created++;

      rows.push({
        state: 'CREATED',
        sourceKey: parsed.sourceKey,
        notionPageId: result.id || '',
        subject: parsed.subject,
        radioName: parsed.radioName,
        receivedAt: parsed.receivedAt
      });

      Utilities.sleep(350);
    }
  }

  const summary = {
    write: write ? 'NOTION' : 'NONE',
    label: cfg.LABEL_NAME,
    threadsScanned: threads.length,
    messagesScanned: scannedMessages,
    eligibleExternalMessages: eligible,
    ownDomainSkipped: ownDomainSkipped,
    existing: existing,
    wouldCreate: wouldCreate,
    created: created,
    skippedMissingBody: skippedMissingBody,
    rows: rows
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function readLabeledGmailMessageSyncV01_(message, thread) {
  const from = String(message.getFrom() || '').trim();
  const fromAddress = extractEmailAddressSyncV01_(from);
  const date = message.getDate();
  const messageId = message.getId();
  const body = String(message.getPlainBody() || '').trim();
  const attachments = message.getAttachments();

  return {
    sourceKey: 'EMAIL:' + messageId,
    receivedAt: Utilities.formatDate(
      date,
      OC_MESSAGES_GMAIL_SYNC_V01.TIME_ZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX"
    ),
    from: from,
    fromAddress: fromAddress,
    to: String(message.getTo() || '').trim(),
    cc: String(message.getCc() || '').trim(),
    subject: String(message.getSubject() || '').trim(),
    body: body,
    bodyPreview: body.replace(/\s+/g, ' ').slice(0, 350),
    attachmentCount: attachments.length,
    externalMessageId: messageId,
    threadId: thread.getId(),
    gmailUrl: 'https://mail.google.com/mail/u/?authuser=' +
      encodeURIComponent(OC_MESSAGES_GMAIL_SYNC_V01.GMAIL_AUTHUSER) +
      '#all/' + messageId,
    radioName: extractExplicitRadioNameSyncV01_(body)
  };
}

function extractEmailAddressSyncV01_(from) {
  const s = String(from || '').trim();
  const bracket = s.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (bracket) return bracket[1].toLowerCase();

  const plain = s.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return plain ? plain[1].toLowerCase() : '';
}

function isOwnDomainSenderSyncV01_(email) {
  return String(email || '')
    .toLowerCase()
    .endsWith(OC_MESSAGES_GMAIL_SYNC_V01.OWN_DOMAIN);
}

function extractExplicitRadioNameSyncV01_(body) {
  const text = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    const m = line.match(/^(?:ラジオネーム|radio\s*name|RN)\s*[：:]\s*(.+)$/i);
    if (!m) continue;

    const value = String(m[1] || '').trim();
    if (!value || value.length > 100) return '';
    return value;
  }
  return '';
}

function buildNotionMappingPreviewSyncV01_(m) {
  const dateLabel = m.receivedAt ? m.receivedAt.slice(0, 10) : '';

  return {
    Message: [
      dateLabel || '日付不明',
      m.radioName || 'ラジオネーム不明',
      m.subject || 'EMAIL'
    ].join('｜'),
    Source_Key: m.sourceKey,
    Channel: 'EMAIL',
    Received_At: m.receivedAt,
    Review_Status: '未確認',
    Radio_Name: m.radioName,
    Email_Address: m.fromAddress,
    Prefecture: '',
    Age_Band: '',
    Message_Type: m.subject,
    Body_Preview: m.bodyPreview,
    Broadcast_Permission: '未回答',
    Request_Song_Text: '',
    Gmail_URL: m.gmailUrl,
    External_Message_ID: m.externalMessageId,
    Attachment_Count: m.attachmentCount
  };
}

function buildNotionMessagePageGmailV01_(m) {
  const map = buildNotionMappingPreviewSyncV01_(m);

  const properties = {
    Message: { title: notionRichTextGmailV01_(map.Message) },
    Source_Key: { rich_text: notionRichTextGmailV01_(map.Source_Key) },
    Channel: { select: { name: map.Channel } },
    Review_Status: { select: { name: map.Review_Status } },
    Radio_Name: { rich_text: notionRichTextGmailV01_(map.Radio_Name) },
    Message_Type: { rich_text: notionRichTextGmailV01_(map.Message_Type) },
    Body_Preview: { rich_text: notionRichTextGmailV01_(map.Body_Preview) },
    Broadcast_Permission: { select: { name: map.Broadcast_Permission } },
    Request_Song_Text: { rich_text: notionRichTextGmailV01_(map.Request_Song_Text) },
    Gmail_URL: { url: map.Gmail_URL },
    External_Message_ID: { rich_text: notionRichTextGmailV01_(map.External_Message_ID) },
    Attachment_Count: { number: map.Attachment_Count }
  };

  if (map.Received_At) {
    properties.Received_At = { date: { start: map.Received_At } };
  }
  if (map.Email_Address) {
    properties.Email_Address = { email: map.Email_Address };
  }

  return {
    parent: {
      type: 'data_source_id',
      data_source_id: OC_MESSAGES_GMAIL_SYNC_V01.NOTION_DATA_SOURCE_ID
    },
    properties: properties,
    children: messageBodyBlocksGmailV01_(m.body, m.gmailUrl, m.attachmentCount)
  };
}

function notionRichTextGmailV01_(value) {
  const s = String(value || '');
  if (!s) return [];

  const result = [];
  for (let i = 0; i < s.length; i += 1800) {
    result.push({
      type: 'text',
      text: { content: s.slice(i, i + 1800) }
    });
  }
  return result;
}

function messageBodyBlocksGmailV01_(body, gmailUrl, attachmentCount) {
  const blocks = [{
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: notionRichTextGmailV01_('お便り本文') }
  }];

  const normalized = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  normalized.split('\n').forEach(p => {
    if (!p) return;
    for (let i = 0; i < p.length; i += 1800) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: notionRichTextGmailV01_(p.slice(i, i + 1800)) }
      });
    }
  });

  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: notionRichTextGmailV01_('原文') }
  });

  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{
        type: 'text',
        text: {
          content: 'Gmailで開く',
          link: { url: gmailUrl }
        }
      }]
    }
  });

  if (attachmentCount > 0) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: notionRichTextGmailV01_(
          '添付ファイル：' + attachmentCount + '件（Gmail原文で確認）'
        )
      }
    });
  }

  return blocks.slice(0, 95);
}

function notionMessageExistsBySourceKeyGmailV01_(sourceKey) {
  const body = {
    filter: {
      property: 'Source_Key',
      rich_text: { equals: sourceKey }
    },
    page_size: 1
  };

  const path = '/v1/data_sources/' +
    OC_MESSAGES_GMAIL_SYNC_V01.NOTION_DATA_SOURCE_ID +
    '/query';

  const result = notionRequestGmailV01_(path, 'post', body);
  return Array.isArray(result.results) && result.results.length > 0;
}

function notionRequestGmailV01_(path, method, payload) {
  const token = getNotionTokenGmailV01_();
  const response = UrlFetchApp.fetch('https://api.notion.com' + path, {
    method: method,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      'Notion-Version': OC_MESSAGES_GMAIL_SYNC_V01.NOTION_VERSION
    },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Notion API ' + code + ': ' + text);
  }

  return text ? JSON.parse(text) : {};
}

function getNotionTokenGmailV01_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');

  if (!token) {
    throw new Error(
      'Set NOTION_API_TOKEN (or NOTION_TOKEN / NOTION_SECRET) in Script Properties.'
    );
  }

  return token;
}


// ============================================================
// CURRENT FAMILY METADATA / SAFE FACADE
// ============================================================

const OCOS_MESSAGES_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  FORM_ROUTE: 'PRODUCTION',
  GMAIL_ROUTE: 'PILOT_MANUAL',
  GMAIL_AUTO_TRIGGER: false
});

function previewMessagesCurrentFormLatest() {
  return previewLatestMessageFormRowV01();
}

function repairMessagesCurrentFormRecent() {
  return repairRecentMessagesFormV01();
}

function previewMessagesCurrentGmail() {
  return previewLabeledGmailMessagesSyncV01();
}

function syncMessagesCurrentGmailManual() {
  return syncLabeledGmailMessagesV01();
}