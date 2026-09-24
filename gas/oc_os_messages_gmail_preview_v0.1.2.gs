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
