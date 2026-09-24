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