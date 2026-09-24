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
