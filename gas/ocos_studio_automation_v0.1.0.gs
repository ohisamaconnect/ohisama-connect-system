/**
 * OC-OS STUDIO Automation v0.1.0
 * Candidate Seeder + STUDIO PACK
 *
 * IMPORTANT
 * - This module never decides what should be used on air.
 * - It only creates Studio_Status="候補".
 * - It never changes 使用済 / 保留 / 見送り.
 * - It never changes EPISODES.Production_Status.
 *
 * Required Script Property:
 *   NOTION_API_TOKEN
 * or NOTION_TOKEN
 * or NOTION_SECRET
 *
 * Run in this order:
 *   1. previewStudioCandidateSeederV01()
 *   2. runStudioCandidateSeederV01()
 *   3. previewStudioPackV01()
 *   4. generateStudioPackV01()
 *   5. installStudioAutomationTriggersV01()
 */

const OC_STUDIO_V01 = {
  VERSION: '0.1.0',
  PACK_VERSION: 'v0.1.0',
  TIMEZONE: 'Asia/Tokyo',
  NOTION_VERSION: '2026-03-11',

  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  EVENTS_DS: '76508d6c-7771-46d4-850c-ca256c1080be',
  MESSAGES_DS: '4e56b186-74b3-4ee9-87a8-048a1b7cc650',
  SONGS_DS: 'a3c08149-498d-4e02-aded-0c5640e5a033',
  SOURCES_DS: '9ba27a8b-7f2e-4025-b943-d6e24e82b7a9',
  STUDIO_ITEMS_DS: '9591403b-709c-41cc-b3a6-1917b0042abf',

  SEED_HANDLER: 'runStudioCandidateSeederV01',
  PACK_HANDLER: 'generateStudioPackV01'
};


/* =========================================================
 * PUBLIC
 * ========================================================= */

function previewStudioCandidateSeederV01() {
  const plan = studioV01BuildSeedPlan_();

  const out = {
    write: 'NONE',
    version: OC_STUDIO_V01.VERSION,
    episode: plan.episodeKey,
    episodePageId: plan.episode.id,
    recordingDate: plan.recordingDate,
    windowStart: plan.windowStart,
    existingStudioItems: plan.existingCount,
    newCandidates: plan.toCreate.length,
    byType: studioV01CountBy_(plan.toCreate, 'materialType'),
    candidates: plan.toCreate.map(x => ({
      materialType: x.materialType,
      title: x.title,
      origin: x.origin,
      reason: x.reason,
      seedKey: x.seedKey
    }))
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}


function runStudioCandidateSeederV01() {
  const plan = studioV01BuildSeedPlan_();

  const createdRows = [];

  plan.toCreate.forEach(seed => {
    const page = studioV01CreateStudioItem_(plan.episode.id, seed);

    createdRows.push({
      id: page.id,
      title: seed.title,
      materialType: seed.materialType,
      origin: seed.origin
    });

    Utilities.sleep(150);
  });

  const out = {
    write: 'CREATE_MISSING_ONLY',
    version: OC_STUDIO_V01.VERSION,
    episode: plan.episodeKey,
    windowStart: plan.windowStart,
    existingStudioItems: plan.existingCount,
    created: createdRows.length,
    createdRows: createdRows
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}


function previewStudioPackV01() {
  const episode = studioV01GetActiveEpisode_();
  const items = studioV01GetStudioItemsForEpisode_(episode.id);

  const out = {
    write: 'NONE',
    packVersion: OC_STUDIO_V01.PACK_VERSION,
    episode: studioV01Title_(episode.properties['Episode_Key']),
    episodePageId: episode.id,
    recordingDate: studioV01DateStart_(episode.properties['Recording_Date']),
    airDate: studioV01DateStart_(episode.properties['Air_Date']),
    episodeFolderUrl: studioV01PropUrl_(episode.properties['Episode_Folder_URL']),
    studioItemCount: items.length,
    byType: studioV01CountBy_(
      items.map(studioV01StudioItemSummary_),
      'materialType'
    ),
    byStatus: studioV01CountBy_(
      items.map(studioV01StudioItemSummary_),
      'status'
    ),
    items: items.map(studioV01StudioItemSummary_)
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}


function generateStudioPackV01() {
  const episode = studioV01GetActiveEpisode_();
  const items = studioV01GetStudioItemsForEpisode_(episode.id);

  if (!items.length) {
    throw new Error('STUDIO ITEMSが0件です。Pack生成前に候補を確認してください。');
  }

  const episodeKey = studioV01Title_(episode.properties['Episode_Key']);
  const episodeFolderUrl =
    studioV01PropUrl_(episode.properties['Episode_Folder_URL']);

  const episodeFolderId =
    studioV01ExtractDriveFolderId_(episodeFolderUrl);

  if (!episodeFolderId) {
    throw new Error(
      'Episode_Folder_URLからDrive folder IDを取得できません。'
    );
  }

  const episodeFolder = DriveApp.getFolderById(episodeFolderId);
  const studioFolder =
    studioV01GetOrCreateChildFolder_(episodeFolder, 'STUDIO');

  const generatedAt = new Date();

  const stamp = Utilities.formatDate(
    generatedAt,
    OC_STUDIO_V01.TIMEZONE,
    'yyyyMMdd_HHmmss'
  );

  const baseName =
    'STUDIO_PACK_' +
    episodeKey +
    '_' +
    stamp +
    '_' +
    OC_STUDIO_V01.PACK_VERSION;

  const cache = {};

  const pack =
    studioV01BuildPackData_(episode, items, cache, generatedAt);

  // Google Doc
  const doc = DocumentApp.create(baseName);
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(studioFolder);

  studioV01RenderDoc_(doc, pack);
  doc.saveAndClose();

  // PDF
  Utilities.sleep(400);

  const pdfBlob = DriveApp
    .getFileById(doc.getId())
    .getAs(MimeType.PDF)
    .setName(baseName + '.pdf');

  const pdfFile = studioFolder.createFile(pdfBlob);

  // HTML
  const html = studioV01RenderHtml_(pack);

  const htmlFile = studioFolder.createFile(
    baseName + '.html',
    html,
    MimeType.HTML
  );

  // Update EPISODE only with pack metadata.
  // Production_Status is intentionally untouched.
  studioV01PatchPage_(episode.id, {
    'Studio_Pack_URL': {
      url: pdfFile.getUrl()
    },
    'Studio_Pack_Generated_At': {
      date: {
        start: generatedAt.toISOString()
      }
    },
    'Studio_Pack_Version':
      studioV01RichTextProp_(OC_STUDIO_V01.PACK_VERSION)
  });

  const out = {
    write: 'PACK_CREATED',
    episode: episodeKey,
    packVersion: OC_STUDIO_V01.PACK_VERSION,
    generatedAt: generatedAt.toISOString(),
    studioItemCount: items.length,
    folderUrl: studioFolder.getUrl(),
    googleDocUrl: docFile.getUrl(),
    pdfUrl: pdfFile.getUrl(),
    htmlUrl: htmlFile.getUrl()
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}


function installStudioAutomationTriggersV01() {
  const handlers = [
    OC_STUDIO_V01.SEED_HANDLER,
    OC_STUDIO_V01.PACK_HANDLER
  ];

  ScriptApp.getProjectTriggers().forEach(t => {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Seeder: hourly
  ScriptApp
    .newTrigger(OC_STUDIO_V01.SEED_HANDLER)
    .timeBased()
    .everyHours(1)
    .create();

  // Pack: Wednesday around 20:00 JST
  ScriptApp
    .newTrigger(OC_STUDIO_V01.PACK_HANDLER)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(20)
    .inTimezone(OC_STUDIO_V01.TIMEZONE)
    .create();

  const result = ScriptApp
    .getProjectTriggers()
    .filter(t => handlers.indexOf(t.getHandlerFunction()) >= 0)
    .map(t => ({
      handler: t.getHandlerFunction(),
      eventType: String(t.getEventType()),
      source: String(t.getTriggerSource())
    }));

  console.log('STUDIO automation triggers installed.');
  console.log(JSON.stringify(result, null, 2));

  return result;
}


/* =========================================================
 * CANDIDATE SEEDER
 * ========================================================= */

function studioV01BuildSeedPlan_() {
  const episode = studioV01GetActiveEpisode_();

  const episodeKey =
    studioV01Title_(episode.properties['Episode_Key']);

  const recordingDate =
    studioV01DateStart_(episode.properties['Recording_Date']);

  if (!recordingDate) {
    throw new Error(
      'Active EPISODEにRecording_Dateがありません。'
    );
  }

  const windowStart =
    studioV01CandidateWindowStart_(episode);

  const existingItems =
    studioV01GetStudioItemsForEpisode_(episode.id);

  const existingKeys = {};

  existingItems.forEach(p => {
    const key =
      studioV01RichText_(p.properties['Seed_Key']);

    if (key) existingKeys[key] = true;
  });

  const cache = {};
  const seeds = [];
  const seedMap = {};

  // -------------------------------------------------------
  // EVENT
  // Human_Status=確認済
  // and edited since previous recording boundary.
  // -------------------------------------------------------

  const events = studioV01QueryAll_(
    OC_STUDIO_V01.EVENTS_DS,
    {
      filter: {
        and: [
          {
            property: 'Human_Status',
            select: {
              equals: '確認済'
            }
          },
          {
            timestamp: 'last_edited_time',
            last_edited_time: {
              on_or_after: windowStart
            }
          }
        ]
      },
      sorts: [
        {
          timestamp: 'last_edited_time',
          direction: 'descending'
        }
      ],
      page_size: 100
    }
  );

  events.forEach(eventPage => {
    cache[eventPage.id] = eventPage;

    const title =
      studioV01Title_(
        eventPage.properties['Event_Title']
      ) || 'EVENT';

    studioV01AddSeed_(seeds, seedMap, {
      seedKey:
        studioV01SeedKey_(
          episode.id,
          'EVENT',
          eventPage.id
        ),
      materialType: 'EVENT',
      title: 'EVENT｜' + title,
      origin: 'AUTO_EVENT',
      reason:
        '人間確認済EVENT（前回収録以降に更新）',
      eventId: eventPage.id
    });

    // Explicit Related_Songs only.
    studioV01RelationIds_(
      eventPage.properties['Related_Songs']
    ).forEach(songId => {
      const songPage =
        studioV01GetPageCached_(songId, cache);

      const songTitle =
        studioV01Title_(
          songPage.properties['Song_Title']
        ) || songId;

      studioV01AddSeed_(seeds, seedMap, {
        seedKey:
          studioV01SeedKey_(
            episode.id,
            'SONG',
            songId
          ),
        materialType: 'SONG',
        title: 'SONG｜' + songTitle,
        origin: 'AUTO_RELATED_SONG',
        reason: 'EVENT関連曲: ' + title,
        songId: songId
      });
    });
  });

  // -------------------------------------------------------
  // MESSAGE
  // Received since previous recording boundary.
  // Review_Status = 未確認 or 確認済
  // -------------------------------------------------------

  const messages = studioV01QueryAll_(
    OC_STUDIO_V01.MESSAGES_DS,
    {
      filter: {
        and: [
          {
            property: 'Received_At',
            date: {
              on_or_after: windowStart
            }
          },
          {
            or: [
              {
                property: 'Review_Status',
                select: {
                  equals: '未確認'
                }
              },
              {
                property: 'Review_Status',
                select: {
                  equals: '確認済'
                }
              }
            ]
          }
        ]
      },
      sorts: [
        {
          property: 'Received_At',
          direction: 'descending'
        }
      ],
      page_size: 100
    }
  );

  messages.forEach(messagePage => {
    cache[messagePage.id] = messagePage;

    const radioName =
      studioV01RichText_(
        messagePage.properties['Radio_Name']
      ) || 'ラジオネーム不明';

    const msgType =
      studioV01RichText_(
        messagePage.properties['Message_Type']
      ) || 'お便り';

    const permission =
      studioV01Select_(
        messagePage.properties['Broadcast_Permission']
      ) || '未回答';

    studioV01AddSeed_(seeds, seedMap, {
      seedKey:
        studioV01SeedKey_(
          episode.id,
          'MESSAGE',
          messagePage.id
        ),
      materialType: 'MESSAGE',
      title:
        'MESSAGE｜' +
        radioName +
        '｜' +
        msgType,
      origin: 'AUTO_MESSAGE',
      reason:
        '前回収録以降に受信 / 紹介可否: ' +
        permission,
      messageId: messagePage.id
    });

    // Explicit Requested_Songs only.
    studioV01RelationIds_(
      messagePage.properties['Requested_Songs']
    ).forEach(songId => {
      const songPage =
        studioV01GetPageCached_(songId, cache);

      const songTitle =
        studioV01Title_(
          songPage.properties['Song_Title']
        ) || songId;

      studioV01AddSeed_(seeds, seedMap, {
        seedKey:
          studioV01SeedKey_(
            episode.id,
            'SONG',
            songId
          ),
        materialType: 'SONG',
        title: 'SONG｜' + songTitle,
        origin: 'AUTO_REQUEST',
        reason:
          'リクエスト曲: ' + radioName,
        songId: songId
      });
    });
  });

  // Existing STUDIO ITEMS always win.
  // Seeder never modifies an existing item.
  const toCreate =
    seeds.filter(s => !existingKeys[s.seedKey]);

  return {
    episode: episode,
    episodeKey: episodeKey,
    recordingDate: recordingDate,
    windowStart: windowStart,
    existingCount: existingItems.length,
    seeds: seeds,
    toCreate: toCreate
  };
}


function studioV01AddSeed_(
  seeds,
  seedMap,
  seed
) {
  const current = seedMap[seed.seedKey];

  if (!current) {
    seedMap[seed.seedKey] = seed;
    seeds.push(seed);
    return;
  }

  if (
    seed.reason &&
    current.reason.indexOf(seed.reason) < 0
  ) {
    current.reason += ' / ' + seed.reason;
  }

  if (seed.origin === 'AUTO_REQUEST') {
    current.origin = 'AUTO_REQUEST';
  }
}


function studioV01CreateStudioItem_(
  episodeId,
  seed
) {
  const properties = {
    'Material':
      studioV01TitleProp_(seed.title),

    'Episode':
      studioV01RelationProp_([episodeId]),

    'Material_Type': {
      select: {
        name: seed.materialType
      }
    },

    'Studio_Status': {
      select: {
        name: '候補'
      }
    },

    'Candidate_Origin': {
      select: {
        name: seed.origin
      }
    },

    'Candidate_Reason':
      studioV01RichTextProp_(
        seed.reason || ''
      ),

    'Seed_Key':
      studioV01RichTextProp_(
        seed.seedKey
      ),

    'Studio_Memo':
      studioV01RichTextProp_('')
  };

  if (seed.eventId) {
    properties['Event'] =
      studioV01RelationProp_(
        [seed.eventId]
      );
  }

  if (seed.messageId) {
    properties['Message'] =
      studioV01RelationProp_(
        [seed.messageId]
      );
  }

  if (seed.songId) {
    properties['Song'] =
      studioV01RelationProp_(
        [seed.songId]
      );
  }

  if (seed.sourceId) {
    properties['Source'] =
      studioV01RelationProp_(
        [seed.sourceId]
      );
  }

  return studioV01CreatePage_(
    OC_STUDIO_V01.STUDIO_ITEMS_DS,
    properties
  );
}


function studioV01SeedKey_(
  episodeId,
  type,
  materialId
) {
  return (
    'EP:' +
    String(episodeId).replace(/-/g, '') +
    '|' +
    type +
    ':' +
    String(materialId).replace(/-/g, '')
  );
}


/* =========================================================
 * PACK
 * ========================================================= */

function studioV01BuildPackData_(
  episode,
  items,
  cache,
  generatedAt
) {
  const episodeKey =
    studioV01Title_(
      episode.properties['Episode_Key']
    );

  const recordingDate =
    studioV01DateStart_(
      episode.properties['Recording_Date']
    );

  const airDate =
    studioV01DateStart_(
      episode.properties['Air_Date']
    );

  const groups = {
    EVENT: [],
    MESSAGE: [],
    SONG: [],
    SOURCE: [],
    OTHER: []
  };

  items.forEach(item => {
    const summary =
      studioV01StudioItemSummary_(item);

    if (summary.eventId) {
      groups.EVENT.push(
        studioV01PackEvent_(
          summary,
          cache
        )
      );
      return;
    }

    if (summary.messageId) {
      groups.MESSAGE.push(
        studioV01PackMessage_(
          summary,
          cache
        )
      );
      return;
    }

    if (summary.songId) {
      groups.SONG.push(
        studioV01PackSong_(
          summary,
          cache
        )
      );
      return;
    }

    if (summary.sourceId) {
      groups.SOURCE.push(
        studioV01PackSourceItem_(
          summary,
          cache
        )
      );
      return;
    }

    groups.OTHER.push({
      title: summary.material,
      status: summary.status,
      origin: summary.origin,
      reason: summary.reason,
      lines: [
        'Studio Memo: ' +
        (summary.studioMemo || '')
      ]
    });
  });

  return {
    title:
      'おひさまコネクト STUDIO PACK',

    note:
      'これは台本ではなく、収録時点の候補材料を静的に持ち出すためのスナップショットです。',

    episodeKey: episodeKey,
    recordingDate: recordingDate,
    airDate: airDate,

    generatedAt:
      Utilities.formatDate(
        generatedAt,
        OC_STUDIO_V01.TIMEZONE,
        'yyyy-MM-dd HH:mm:ss'
      ),

    packVersion:
      OC_STUDIO_V01.PACK_VERSION,

    groups: groups
  };
}


function studioV01PackEvent_(
  summary,
  cache
) {
  const page =
    studioV01GetPageCached_(
      summary.eventId,
      cache
    );

  const p = page.properties;

  const sources =
    studioV01RelationIds_(
      p['Sources']
    ).map(id => {
      const sourcePage =
        studioV01GetPageCached_(
          id,
          cache
        );

      return studioV01SourceDetail_(
        sourcePage
      );
    });

  const lines = [
    '状態: ' + summary.status,
    '候補理由: ' + (summary.reason || ''),
    '日時: ' +
      (studioV01DateStart_(
        p['DateTime']
      ) || ''),
    '種別: ' +
      (studioV01Select_(
        p['Event_Type']
      ) || ''),
    'EVENT状態: ' +
      (studioV01Select_(
        p['Event_Status']
      ) || ''),
    '場所 / Platform: ' +
      (studioV01RichText_(
        p['Location_Platform']
      ) || ''),
    '確認済み要約: ' +
      (studioV01RichText_(
        p['Summary']
      ) || ''),
    'Notion: ' +
      (page.url || '')
  ];

  sources.forEach((s, i) => {
    lines.push(
      '原典' + (i + 1) + ': ' + s.title
    );

    if (s.publisher) {
      lines.push(
        '  Publisher: ' + s.publisher
      );
    }

    if (s.facts) {
      lines.push(
        '  Facts: ' + s.facts
      );
    }

    if (s.url) {
      lines.push(
        '  URL: ' + s.url
      );
    }
  });

  return {
    title:
      studioV01Title_(
        p['Event_Title']
      ) || summary.material,

    status: summary.status,
    origin: summary.origin,
    reason: summary.reason,
    lines: lines
  };
}


function studioV01PackMessage_(
  summary,
  cache
) {
  const page =
    studioV01GetPageCached_(
      summary.messageId,
      cache
    );

  const p = page.properties;

  const body =
    studioV01GetPageText_(
      page.id
    );

  const lines = [
    '状態: ' + summary.status,
    '候補理由: ' + (summary.reason || ''),
    '受信日時: ' +
      (studioV01DateStart_(
        p['Received_At']
      ) || ''),
    'Channel: ' +
      (studioV01Select_(
        p['Channel']
      ) || ''),
    'ラジオネーム: ' +
      (studioV01RichText_(
        p['Radio_Name']
      ) || ''),
    '種別: ' +
      (studioV01RichText_(
        p['Message_Type']
      ) || ''),
    '紹介可否: ' +
      (studioV01Select_(
        p['Broadcast_Permission']
      ) || '未回答'),
    'リクエスト曲（生テキスト）: ' +
      (studioV01RichText_(
        p['Request_Song_Text']
      ) || ''),
    'Gmail原文: ' +
      (studioV01PropUrl_(
        p['Gmail_URL']
      ) || ''),
    'Notion: ' +
      (page.url || ''),
    '',
    '--- お便り本文 ---',
    body ||
      '(本文を取得できませんでした)'
  ];

  return {
    title:
      studioV01Title_(
        p['Message']
      ) || summary.material,

    status: summary.status,
    origin: summary.origin,
    reason: summary.reason,
    lines: lines
  };
}


function studioV01PackSong_(
  summary,
  cache
) {
  const page =
    studioV01GetPageCached_(
      summary.songId,
      cache
    );

  const p = page.properties;

  const durationSec =
    studioV01Number_(
      p['Duration_Sec']
    );

  const duration =
    durationSec !== null
      ? studioV01FormatDuration_(
          durationSec
        )
      : '';

  const lines = [
    '状態: ' + summary.status,
    '候補理由: ' + (summary.reason || ''),
    'Song_ID: ' +
      (
        studioV01Number_(
          p['Song_ID']
        ) || ''
      ),
    '尺: ' + duration,
    '期: ' +
      (studioV01Select_(
        p['Target_Generation']
      ) || ''),
    '歌唱形態: ' +
      (studioV01Select_(
        p['Vocal_Formation_Type']
      ) || ''),
    'FULL音源: ' +
      (studioV01PropUrl_(
        p['Full_Mix_File_URL']
      ) || ''),
    'OFF VOCAL: ' +
      (studioV01PropUrl_(
        p['Off_Vocal_File_URL']
      ) || ''),
    'Notion: ' +
      (page.url || '')
  ];

  return {
    title:
      studioV01Title_(
        p['Song_Title']
      ) || summary.material,

    status: summary.status,
    origin: summary.origin,
    reason: summary.reason,
    lines: lines
  };
}


function studioV01PackSourceItem_(
  summary,
  cache
) {
  const page =
    studioV01GetPageCached_(
      summary.sourceId,
      cache
    );

  const s =
    studioV01SourceDetail_(page);

  return {
    title:
      s.title || summary.material,

    status: summary.status,
    origin: summary.origin,
    reason: summary.reason,

    lines: [
      '状態: ' + summary.status,
      '候補理由: ' +
        (summary.reason || ''),
      'Publisher: ' +
        (s.publisher || ''),
      'Facts: ' +
        (s.facts || ''),
      'URL: ' +
        (s.url || ''),
      'Notion: ' +
        (page.url || '')
    ]
  };
}


function studioV01SourceDetail_(page) {
  const p = page.properties || {};

  return {
    title:
      studioV01Title_(
        p['Source_Title']
      ) || 'SOURCE',

    publisher:
      studioV01RichText_(
        p['Publisher']
      ) || '',

    facts:
      studioV01RichText_(
        p['Source_Facts']
      ) || '',

    url:
      studioV01PropUrl_(
        p['URL']
      ) ||
      studioV01PropUrl_(
        p['userDefined:URL']
      ) ||
      ''
  };
}


function studioV01RenderDoc_(
  doc,
  pack
) {
  const body = doc.getBody();

  body.clear();

  body
    .appendParagraph(pack.title)
    .setHeading(
      DocumentApp.ParagraphHeading.TITLE
    );

  body.appendParagraph(pack.note);
  body.appendParagraph(
    'EPISODE: ' + pack.episodeKey
  );
  body.appendParagraph(
    '収録日: ' +
    (pack.recordingDate || '')
  );
  body.appendParagraph(
    '放送日: ' +
    (pack.airDate || '')
  );
  body.appendParagraph(
    '生成: ' + pack.generatedAt
  );
  body.appendParagraph(
    'Pack Version: ' +
    pack.packVersion
  );

  body.appendHorizontalRule();

  [
    'EVENT',
    'MESSAGE',
    'SONG',
    'SOURCE',
    'OTHER'
  ].forEach(type => {
    const rows =
      pack.groups[type] || [];

    if (!rows.length) return;

    body
      .appendParagraph(type)
      .setHeading(
        DocumentApp
          .ParagraphHeading
          .HEADING1
      );

    rows.forEach((row, index) => {
      body
        .appendParagraph(
          (index + 1) +
          '. ' +
          row.title
        )
        .setHeading(
          DocumentApp
            .ParagraphHeading
            .HEADING2
        );

      row.lines.forEach(line => {
        body.appendParagraph(line || '');
      });

      body.appendHorizontalRule();
    });
  });

  body
    .appendParagraph(
      'このPACKは正本ではありません。最終判断・実際の収録内容はあさくら本人と放送実績を正本とします。'
    )
    .setItalic(true);
}


function studioV01RenderHtml_(pack) {
  const parts = [];

  parts.push(
    '<!doctype html>' +
    '<html lang="ja">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' +
    studioV01Html_(
      pack.title + ' ' + pack.episodeKey
    ) +
    '</title>' +
    '<style>' +
    'body{font-family:sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;line-height:1.65}' +
    'h1,h2,h3{line-height:1.3}' +
    '.meta{background:#f3f3f3;padding:1rem}' +
    '.item{border-top:1px solid #ccc;padding:1rem 0}' +
    '.line{white-space:pre-wrap;word-break:break-word}' +
    '.notice{margin-top:2rem;font-weight:bold}' +
    '</style>' +
    '</head><body>'
  );

  parts.push(
    '<h1>' +
    studioV01Html_(pack.title) +
    '</h1>'
  );

  parts.push(
    '<p>' +
    studioV01Html_(pack.note) +
    '</p>'
  );

  parts.push('<div class="meta">');

  parts.push(
    '<div>EPISODE: ' +
    studioV01Html_(pack.episodeKey) +
    '</div>'
  );

  parts.push(
    '<div>収録日: ' +
    studioV01Html_(
      pack.recordingDate || ''
    ) +
    '</div>'
  );

  parts.push(
    '<div>放送日: ' +
    studioV01Html_(
      pack.airDate || ''
    ) +
    '</div>'
  );

  parts.push(
    '<div>生成: ' +
    studioV01Html_(pack.generatedAt) +
    '</div>'
  );

  parts.push(
    '<div>Pack Version: ' +
    studioV01Html_(pack.packVersion) +
    '</div>'
  );

  parts.push('</div>');

  [
    'EVENT',
    'MESSAGE',
    'SONG',
    'SOURCE',
    'OTHER'
  ].forEach(type => {
    const rows =
      pack.groups[type] || [];

    if (!rows.length) return;

    parts.push(
      '<h2>' + type + '</h2>'
    );

    rows.forEach((row, index) => {
      parts.push(
        '<section class="item">'
      );

      parts.push(
        '<h3>' +
        (index + 1) +
        '. ' +
        studioV01Html_(row.title) +
        '</h3>'
      );

      row.lines.forEach(line => {
        parts.push(
          '<div class="line">' +
          studioV01AutoLinkHtml_(line) +
          '</div>'
        );
      });

      parts.push('</section>');
    });
  });

  parts.push(
    '<p class="notice">' +
    'このPACKは正本ではありません。最終判断・実際の収録内容はあさくら本人と放送実績を正本とします。' +
    '</p>'
  );

  parts.push('</body></html>');

  return parts.join('\n');
}


/* =========================================================
 * EPISODE / DATA QUERIES
 * ========================================================= */

function studioV01GetActiveEpisode_() {
  const pages =
    studioV01QueryAll_(
      OC_STUDIO_V01.EPISODES_DS,
      {
        filter: {
          or: [
            {
              property:
                'Production_Status',
              select: {
                equals: '準備中'
              }
            },
            {
              property:
                'Production_Status',
              select: {
                equals: '収録準備済'
              }
            }
          ]
        },
        sorts: [
          {
            property:
              'Recording_Date',
            direction: 'ascending'
          }
        ],
        page_size: 50
      }
    );

  if (!pages.length) {
    throw new Error(
      'Production_Statusが「準備中 / 収録準備済」のEPISODEがありません。'
    );
  }

  const today =
    studioV01JstDateOnly_(
      new Date()
    );

  const yesterday =
    studioV01ShiftDateOnly_(
      today,
      -1
    );

  const usable =
    pages.filter(p => {
      const d =
        studioV01DateStart_(
          p.properties[
            'Recording_Date'
          ]
        );

      return (
        d &&
        d.slice(0, 10) >= yesterday
      );
    });

  return usable[0] || pages[0];
}


function studioV01CandidateWindowStart_(episode) {
  const currentRecording =
    studioV01DateStart_(
      episode.properties[
        'Recording_Date'
      ]
    );

  const currentDate =
    currentRecording.slice(0, 10);

  const prev =
    studioV01QueryAll_(
      OC_STUDIO_V01.EPISODES_DS,
      {
        filter: {
          property: 'Recording_Date',
          date: {
            before: currentDate
          }
        },
        sorts: [
          {
            property:
              'Recording_Date',
            direction: 'descending'
          }
        ],
        page_size: 1
      }
    );

  if (prev.length) {
    const prevDate =
      studioV01DateStart_(
        prev[0].properties[
          'Recording_Date'
        ]
      ).slice(0, 10);

    return (
      prevDate +
      'T21:00:00+09:00'
    );
  }

  return (
    studioV01ShiftDateOnly_(
      currentDate,
      -7
    ) +
    'T00:00:00+09:00'
  );
}


function studioV01GetStudioItemsForEpisode_(
  episodeId
) {
  return studioV01QueryAll_(
    OC_STUDIO_V01.STUDIO_ITEMS_DS,
    {
      filter: {
        property: 'Episode',
        relation: {
          contains: episodeId
        }
      },
      sorts: [
        {
          timestamp: 'created_time',
          direction: 'ascending'
        }
      ],
      page_size: 100
    }
  );
}


function studioV01StudioItemSummary_(page) {
  const p = page.properties || {};

  return {
    id: page.id,

    material:
      studioV01Title_(
        p['Material']
      ),

    materialType:
      studioV01Select_(
        p['Material_Type']
      ) || 'OTHER',

    status:
      studioV01Select_(
        p['Studio_Status']
      ) || '',

    origin:
      studioV01Select_(
        p['Candidate_Origin']
      ) || '',

    reason:
      studioV01RichText_(
        p['Candidate_Reason']
      ) || '',

    studioMemo:
      studioV01RichText_(
        p['Studio_Memo']
      ) || '',

    eventId:
      studioV01RelationIds_(
        p['Event']
      )[0] || '',

    messageId:
      studioV01RelationIds_(
        p['Message']
      )[0] || '',

    songId:
      studioV01RelationIds_(
        p['Song']
      )[0] || '',

    sourceId:
      studioV01RelationIds_(
        p['Source']
      )[0] || ''
  };
}


/* =========================================================
 * NOTION REST
 * ========================================================= */

function studioV01Token_() {
  const p =
    PropertiesService
      .getScriptProperties();

  const token =
    p.getProperty(
      'NOTION_API_TOKEN'
    ) ||
    p.getProperty(
      'NOTION_TOKEN'
    ) ||
    p.getProperty(
      'NOTION_SECRET'
    );

  if (!token) {
    throw new Error(
      'Script PropertiesにNOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRETのいずれかが必要です。'
    );
  }

  return token;
}


function studioV01Request_(
  method,
  path,
  payload
) {
  const url =
    'https://api.notion.com/v1' +
    path;

  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization:
        'Bearer ' +
        studioV01Token_(),

      'Notion-Version':
        OC_STUDIO_V01
          .NOTION_VERSION,

      'Content-Type':
        'application/json'
    }
  };

  if (
    payload !== undefined &&
    payload !== null
  ) {
    options.payload =
      JSON.stringify(payload);
  }

  let lastCode = 0;
  let lastText = '';

  for (
    let attempt = 0;
    attempt < 4;
    attempt++
  ) {
    const res =
      UrlFetchApp.fetch(
        url,
        options
      );

    const code =
      res.getResponseCode();

    const text =
      res.getContentText();

    lastCode = code;
    lastText = text;

    if (
      code >= 200 &&
      code < 300
    ) {
      return text
        ? JSON.parse(text)
        : {};
    }

    if (
      code === 429 ||
      code >= 500
    ) {
      Utilities.sleep(
        700 *
        Math.pow(2, attempt)
      );

      continue;
    }

    throw new Error(
      'Notion API error ' +
      code +
      ' ' +
      method +
      ' ' +
      path +
      '\n' +
      text
    );
  }

  throw new Error(
    'Notion API retry exhausted: ' +
    lastCode +
    '\n' +
    lastText
  );
}


function studioV01QueryAll_(
  dataSourceId,
  body
) {
  const out = [];

  let cursor = null;

  do {
    const requestBody =
      JSON.parse(
        JSON.stringify(
          body || {}
        )
      );

    requestBody.page_size =
      Math.min(
        requestBody.page_size || 100,
        100
      );

    if (cursor) {
      requestBody.start_cursor =
        cursor;
    }

    const r =
      studioV01Request_(
        'post',
        '/data_sources/' +
        dataSourceId +
        '/query',
        requestBody
      );

    (r.results || [])
      .forEach(x => out.push(x));

    cursor =
      r.has_more
        ? r.next_cursor
        : null;

  } while (cursor);

  return out;
}


function studioV01GetPage_(pageId) {
  return studioV01Request_(
    'get',
    '/pages/' + pageId
  );
}


function studioV01GetPageCached_(
  pageId,
  cache
) {
  if (!cache[pageId]) {
    cache[pageId] =
      studioV01GetPage_(pageId);

    Utilities.sleep(100);
  }

  return cache[pageId];
}


function studioV01CreatePage_(
  dataSourceId,
  properties
) {
  return studioV01Request_(
    'post',
    '/pages',
    {
      parent: {
        type:
          'data_source_id',

        data_source_id:
          dataSourceId
      },

      properties:
        properties
    }
  );
}


function studioV01PatchPage_(
  pageId,
  properties
) {
  return studioV01Request_(
    'patch',
    '/pages/' + pageId,
    {
      properties:
        properties
    }
  );
}


function studioV01GetPageText_(pageId) {
  const lines = [];

  studioV01CollectBlockText_(
    pageId,
    lines,
    0
  );

  return lines
    .join('\n')
    .trim();
}


function studioV01CollectBlockText_(
  blockId,
  lines,
  depth
) {
  if (depth > 4) return;

  let cursor = null;

  do {
    const path =
      '/blocks/' +
      blockId +
      '/children?page_size=100' +
      (
        cursor
          ? '&start_cursor=' +
            encodeURIComponent(
              cursor
            )
          : ''
      );

    const r =
      studioV01Request_(
        'get',
        path
      );

    (r.results || [])
      .forEach(block => {
        const text =
          studioV01BlockPlainText_(
            block
          );

        if (text) {
          lines.push(text);
        }

        if (block.has_children) {
          studioV01CollectBlockText_(
            block.id,
            lines,
            depth + 1
          );
        }
      });

    cursor =
      r.has_more
        ? r.next_cursor
        : null;

  } while (cursor);
}


function studioV01BlockPlainText_(block) {
  if (
    !block ||
    !block.type
  ) {
    return '';
  }

  const data =
    block[block.type] || {};

  const rich =
    data.rich_text ||
    data.caption ||
    [];

  if (!Array.isArray(rich)) {
    return '';
  }

  return rich
    .map(x => x.plain_text || '')
    .join('');
}


/* =========================================================
 * PROPERTY HELPERS
 * ========================================================= */

function studioV01Title_(prop) {
  if (
    !prop ||
    !prop.title
  ) {
    return '';
  }

  return prop.title
    .map(
      x => x.plain_text || ''
    )
    .join('');
}


function studioV01RichText_(prop) {
  if (
    !prop ||
    !prop.rich_text
  ) {
    return '';
  }

  return prop.rich_text
    .map(
      x => x.plain_text || ''
    )
    .join('');
}


function studioV01Select_(prop) {
  return (
    prop &&
    prop.select
  )
    ? (
        prop.select.name || ''
      )
    : '';
}


function studioV01Number_(prop) {
  if (
    !prop ||
    prop.number === null ||
    prop.number === undefined
  ) {
    return null;
  }

  return Number(prop.number);
}


function studioV01DateStart_(prop) {
  return (
    prop &&
    prop.date
  )
    ? (
        prop.date.start || ''
      )
    : '';
}


function studioV01PropUrl_(prop) {
  return (
    prop &&
    prop.url
  )
    ? prop.url
    : '';
}


function studioV01RelationIds_(prop) {
  if (
    !prop ||
    !Array.isArray(
      prop.relation
    )
  ) {
    return [];
  }

  return prop.relation
    .map(x => x.id)
    .filter(Boolean);
}


function studioV01TitleProp_(text) {
  return {
    title: [
      {
        type: 'text',
        text: {
          content:
            String(text || '')
        }
      }
    ]
  };
}


function studioV01RichTextProp_(text) {
  const s =
    String(text || '');

  return {
    rich_text:
      s
        ? [
            {
              type: 'text',
              text: {
                content:
                  s.slice(
                    0,
                    1900
                  )
              }
            }
          ]
        : []
  };
}


function studioV01RelationProp_(ids) {
  return {
    relation:
      (ids || [])
        .filter(Boolean)
        .map(id => ({
          id: id
        }))
  };
}


/* =========================================================
 * DRIVE / HTML
 * ========================================================= */

function studioV01ExtractDriveFolderId_(url) {
  const m =
    String(url || '')
      .match(
        /\/folders\/([A-Za-z0-9_-]+)/
      );

  return m ? m[1] : '';
}


function studioV01GetOrCreateChildFolder_(
  parentFolder,
  name
) {
  const it =
    parentFolder
      .getFoldersByName(name);

  return it.hasNext()
    ? it.next()
    : parentFolder.createFolder(
        name
      );
}


function studioV01FormatDuration_(sec) {
  sec = Math.round(
    Number(sec || 0)
  );

  const m =
    Math.floor(sec / 60);

  const s =
    sec % 60;

  return (
    m +
    ':' +
    String(s).padStart(2, '0')
  );
}


function studioV01Html_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function studioV01AutoLinkHtml_(line) {
  const escaped =
    studioV01Html_(line || '');

  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  );
}


/* =========================================================
 * MISC
 * ========================================================= */

function studioV01JstDateOnly_(date) {
  return Utilities.formatDate(
    date,
    OC_STUDIO_V01.TIMEZONE,
    'yyyy-MM-dd'
  );
}


function studioV01ShiftDateOnly_(
  dateOnly,
  days
) {
  const d =
    new Date(
      dateOnly +
      'T12:00:00+09:00'
    );

  d.setTime(
    d.getTime() +
    Number(days) *
    86400000
  );

  return studioV01JstDateOnly_(d);
}


function studioV01CountBy_(
  rows,
  key
) {
  const out = {};

  (rows || []).forEach(r => {
    const value =
      r[key] || '(blank)';

    out[value] =
      (out[value] || 0) + 1;
  });

  return out;
}