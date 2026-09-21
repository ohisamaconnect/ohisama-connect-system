/**
 * HHA Phase 02 - Legacy OCOS Notion Snapshot Exporter v1.1
 * READ ONLY: old Notion databases are never modified.
 */

const LEGACY_SNAPSHOT = {
  VERSION: '1.1.0',
  NOTION_VERSION: '2022-06-28',
  PAGE_SIZE: 100,
  SOFT_LIMIT_MS: 270000,
  RETRY_COUNT: 3,
  STATE_KEY: 'HHA_LEGACY_NOTION_SNAPSHOT_STATE',
  MANIFEST_SPREADSHEET_ID: '1du8JnAO9erGQiWU80RgYI9KvsM9AbN0P3vwcmoouIMU',

  DATABASES: [
    {
      name:'Member DB',
      databaseId:'2e8031bc0d458122af87dcf0c286f281',
      dataSourceId:'2e8031bc-0d45-81ce-88c1-000bb7d0ac8e',
      sourceUrl:'https://app.notion.com/p/2e8031bc0d458122af87dcf0c286f281',
      folderId:'1_QYd6-_QjoZH1gMA6_fHsNOWPUkP_6oi',
      expectedCount:47,
      excludeCsv:[]
    },
    {
      name:'Master Schedule DB',
      databaseId:'2e8031bc0d45803197fee62f014bdb75',
      dataSourceId:'2e8031bc-0d45-8091-9043-000b7d166eb7',
      sourceUrl:'https://app.notion.com/p/2e8031bc0d45803197fee62f014bdb75',
      folderId:'1Rz2Auo8IUIIkOIGVCnaT5kwWX1Wns2uA',
      expectedCount:8147,
      excludeCsv:[]
    },
    {
      name:'Master Music DB',
      databaseId:'2e8031bc0d4580c08659d1a46e7ea9c0',
      dataSourceId:'2e8031bc-0d45-8081-aacd-000b20bbcbe2',
      sourceUrl:'https://app.notion.com/p/2e8031bc0d4580c08659d1a46e7ea9c0',
      folderId:'10HUnW43Dd_Va_-ajtuRunxNDxwMlx3eJ',
      expectedCount:159,
      excludeCsv:[]
    },
    {
      name:'Master History DB',
      databaseId:'2ed031bc0d45808698b7ead3c0808167',
      dataSourceId:'2ed031bc-0d45-8029-a00c-000ba30cfb11',
      sourceUrl:'https://app.notion.com/p/2ed031bc0d45808698b7ead3c0808167',
      folderId:'1LSWIR94b9e_YAoCMIpYx7pgisZOnROxn',
      expectedCount:1244,
      excludeCsv:[]
    },
    {
      name:'Concert/Setlist DB',
      databaseId:'2ed031bc0d4580e19d28f48c3b65da28',
      dataSourceId:'2ed031bc-0d45-805a-a3b6-000b9b547536',
      sourceUrl:'https://app.notion.com/p/2ed031bc0d4580e19d28f48c3b65da28',
      folderId:'10iivSPWXK4yO5UpVR7C2wE2oU86wuLmM',
      expectedCount:352,
      excludeCsv:[]
    },
    {
      name:'Master Episode DB',
      databaseId:'2e8031bc0d4580aba188dd3138db2de9',
      dataSourceId:'2e8031bc-0d45-8097-9791-000bf5401308',
      sourceUrl:'https://app.notion.com/p/2e8031bc0d4580aba188dd3138db2de9',
      folderId:'1zGCr9qx-TEo0LcFLPFgWimFM2pzW8-s8',
      expectedCount:4,
      excludeCsv:[]
    }
  ]
};

function runLegacyNotionSnapshot() {
  const token = getNotionToken_();
  if (!token) throw new Error('NOTION_TOKEN を Script Properties に設定してください。');

  const started = Date.now();
  let state = loadState_();

  if (!state) {
    state = {
      runStamp: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss'),
      dbIndex:0, cursor:null, batchNo:0, retrieved:0,
      snapshotFolderId:null, dbStartedAt:null
    };
    saveState_(state);
  }

  while (state.dbIndex < LEGACY_SNAPSHOT.DATABASES.length) {
    const db = LEGACY_SNAPSHOT.DATABASES[state.dbIndex];

    if (Date.now() - started > LEGACY_SNAPSHOT.SOFT_LIMIT_MS) {
      saveState_(state);
      scheduleResume_(1);
      console.log(`⏳ ${db.name}: batch=${state.batchNo}, retrieved=${state.retrieved}`);
      return;
    }

    try {
      state = snapshotChunk_(db, state, token);

      if (state.dbComplete) {
        state = {
          runStamp:state.runStamp,
          dbIndex:state.dbIndex + 1,
          cursor:null, batchNo:0, retrieved:0,
          snapshotFolderId:null, dbStartedAt:null
        };
      }
      saveState_(state);
    } catch (e) {
      saveState_(state);
      updateManifest_(db.name, 'ERROR', e.message || String(e));
      console.error(e.stack || e);
      scheduleResume_(3);
      return;
    }
  }

  PropertiesService.getScriptProperties().deleteProperty(LEGACY_SNAPSHOT.STATE_KEY);
  deleteResumeTriggers_();
  console.log('🎉 Legacy snapshot complete');
}

function showLegacySnapshotProgress() {
  const s = loadState_();
  if (!s) return console.log('NOT STARTED / COMPLETED');
  const db = LEGACY_SNAPSHOT.DATABASES[s.dbIndex];
  console.log(JSON.stringify({
    runStamp:s.runStamp,
    database:db ? db.name : 'DONE',
    batchNo:s.batchNo,
    retrieved:s.retrieved,
    cursorExists:!!s.cursor,
    snapshotFolderId:s.snapshotFolderId
  }, null, 2));
}

function resetLegacySnapshotResumeState() {
  PropertiesService.getScriptProperties().deleteProperty(LEGACY_SNAPSHOT.STATE_KEY);
  deleteResumeTriggers_();
  console.log('Resume state reset. Saved files were NOT deleted.');
}

function snapshotChunk_(db, state, token) {
  let snapshotFolder;

  if (!state.snapshotFolderId) {
    const dbFolder = DriveApp.getFolderById(db.folderId);
    snapshotFolder = getOrCreateChildFolder_(dbFolder, 'SNAPSHOT_' + state.runStamp);
    state.snapshotFolderId = snapshotFolder.getId();
    state.dbStartedAt = new Date().toISOString();

    getOrCreateChildFolder_(snapshotFolder, 'raw');
    getOrCreateChildFolder_(snapshotFolder, 'csv');
    getOrCreateChildFolder_(snapshotFolder, 'checksums');

    const schema = getDatabaseSchema_(db.databaseId, token);
    writeTextIfAbsent_(snapshotFolder, 'schema.json',
      JSON.stringify(schema, null, 2), 'application/json');

    writeTextIfAbsent_(snapshotFolder, 'snapshot_readme.txt', [
      'HHA Legacy OCOS Notion Snapshot',
      'Exporter Version: ' + LEGACY_SNAPSHOT.VERSION,
      'Database: ' + db.name,
      'Legacy Source: ' + db.sourceUrl,
      'Database ID: ' + db.databaseId,
      'Data Source ID: ' + db.dataSourceId,
      'Expected Count: ' + db.expectedCount,
      'Notion API Version: ' + LEGACY_SNAPSHOT.NOTION_VERSION,
      '',
      'raw/*.json = preservation master',
      'csv/*.csv = convenience representation',
      'Exporter is READ ONLY against legacy Notion.',
      db.name === 'Listener Mail DB'
        ? 'Listener Mail CSV excludes email; raw JSON retains the original.'
        : ''
    ].join('\n'), 'text/plain');

    updateManifest_(db.name, 'IN_PROGRESS', 'snapshot=' + state.runStamp);
  } else {
    snapshotFolder = DriveApp.getFolderById(state.snapshotFolderId);
  }

  const response = queryDatabase_(db.databaseId, state.cursor, token);
  const batchNo = state.batchNo + 1;
  const batchKey = String(batchNo).padStart(4, '0');

  const rawFolder = getOrCreateChildFolder_(snapshotFolder, 'raw');
  const csvFolder = getOrCreateChildFolder_(snapshotFolder, 'csv');
  const checksumFolder = getOrCreateChildFolder_(snapshotFolder, 'checksums');

  const rawText = JSON.stringify(response, null, 2);
  const rawName = `batch_${batchKey}.json`;
  writeTextIfAbsent_(rawFolder, rawName, rawText, 'application/json');

  const schema = getDatabaseSchema_(db.databaseId, token);
  const propNames = Object.keys(schema.properties || {})
    .filter(n => !(db.excludeCsv || []).includes(n))
    .sort((a,b) => a.localeCompare(b, 'ja'));

  const csvText = resultsToCsv_(response.results || [], propNames);
  const csvName = `batch_${batchKey}.csv`;
  writeTextIfAbsent_(csvFolder, csvName, csvText, 'text/csv');

  writeTextIfAbsent_(checksumFolder, `batch_${batchKey}.sha256.txt`, [
    `${sha256Text_(rawText)}  ${rawName}`,
    `${sha256Text_(csvText)}  ${csvName}`
  ].join('\n'), 'text/plain');

  state.batchNo = batchNo;
  state.retrieved += (response.results || []).length;
  state.cursor = response.next_cursor || null;

  console.log(
    `[${db.name}] batch=${batchNo}, +${(response.results || []).length}, ` +
    `total=${state.retrieved}, has_more=${!!response.has_more}`
  );

  if (!response.has_more) {
    const countMatches = Number(state.retrieved) === Number(db.expectedCount);

    writeTextIfAbsent_(snapshotFolder, 'snapshot_manifest.json',
      JSON.stringify({
        archive_system:'HHA Legacy OCOS',
        exporter_version:LEGACY_SNAPSHOT.VERSION,
        notion_api_version:LEGACY_SNAPSHOT.NOTION_VERSION,
        snapshot_run:state.runStamp,
        database_name:db.name,
        legacy_source_url:db.sourceUrl,
        database_id:db.databaseId,
        data_source_id:db.dataSourceId,
        expected_record_count:db.expectedCount,
        retrieved_record_count:state.retrieved,
        record_count_matches:countMatches,
        batch_count:state.batchNo,
        started_at:state.dbStartedAt,
        completed_at:new Date().toISOString(),
        raw_json_is_preservation_master:true,
        csv_is_convenience_export:true,
        excluded_csv_properties:db.excludeCsv || [],
        legacy_database_modified_by_exporter:false
      }, null, 2), 'application/json');

    updateManifest_(
      db.name,
      countMatches ? 'COMPLETE' : 'COUNT_MISMATCH',
      `retrieved=${state.retrieved}; expected=${db.expectedCount}; snapshot=${state.runStamp}`
    );
    console.log(`✅ ${db.name}: ${state.retrieved}/${db.expectedCount}`);
    state.dbComplete = true;
  } else {
    state.dbComplete = false;
  }

  Utilities.sleep(450);
  return state;
}

function getNotionToken_() {
  const p = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (p) return p;
  try {
    if (typeof NOTION_TOKEN !== 'undefined' && NOTION_TOKEN) return NOTION_TOKEN;
  } catch (_) {}
  return '';
}

function getDatabaseSchema_(databaseId, token) {
  return notionJson_(`https://api.notion.com/v1/databases/${databaseId}`,
    {method:'get'}, token);
}

function queryDatabase_(databaseId, cursor, token) {
  const payload = {page_size:LEGACY_SNAPSHOT.PAGE_SIZE};
  if (cursor) payload.start_cursor = cursor;

  return notionJson_(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      method:'post',
      contentType:'application/json',
      payload:JSON.stringify(payload)
    },
    token
  );
}

function notionJson_(url, options, token) {
  let lastError;

  for (let attempt=1; attempt<=LEGACY_SNAPSHOT.RETRY_COUNT; attempt++) {
    try {
      const opts = Object.assign({
        muteHttpExceptions:true
      }, options || {});

      opts.headers = Object.assign({
        'Authorization':`Bearer ${token}`,
        'Notion-Version':LEGACY_SNAPSHOT.NOTION_VERSION
      }, (options && options.headers) || {});

      const res = UrlFetchApp.fetch(url, opts);
      const code = res.getResponseCode();
      const body = res.getContentText('UTF-8');

      if (code >= 200 && code < 300) return JSON.parse(body);
      throw new Error(`Notion HTTP ${code}: ${body.slice(0,1000)}`);
    } catch (e) {
      lastError = e;
      if (attempt < LEGACY_SNAPSHOT.RETRY_COUNT) {
        Utilities.sleep(1200 * attempt * attempt);
      }
    }
  }

  throw lastError || new Error('Notion API failed');
}

function resultsToCsv_(results, propNames) {
  const header = ['__page_id','__page_url','__created_time','__last_edited_time']
    .concat(propNames);
  const rows = [header];

  (results || []).forEach(page => {
    const row = [
      page.id || '',
      page.url || '',
      page.created_time || '',
      page.last_edited_time || ''
    ];
    propNames.forEach(name => {
      row.push(propertyToText_(page.properties ? page.properties[name] : null));
    });
    rows.push(row);
  });

  return rows.map(r => r.map(csvEscape_).join(',')).join('\r\n');
}

function propertyToText_(prop) {
  if (!prop || !prop.type) return '';
  const type = prop.type;
  const v = prop[type];

  switch (type) {
    case 'title':
    case 'rich_text':
      return (v || []).map(x => x.plain_text || '').join('');
    case 'number':
      return v === null || v === undefined ? '' : String(v);
    case 'select':
    case 'status':
      return v && v.name ? v.name : '';
    case 'multi_select':
      return (v || []).map(x => x.name || '').join(' | ');
    case 'date':
      if (!v) return '';
      return [v.start || '', v.end || '', v.time_zone || '']
        .filter(Boolean).join(' | ');
    case 'checkbox':
      return v ? 'TRUE' : 'FALSE';
    case 'url':
    case 'email':
    case 'phone_number':
      return v || '';
    case 'relation':
      return (v || []).map(x => x.id || '').join(' | ');
    case 'people':
      return (v || []).map(x => x.name || x.id || '').join(' | ');
    case 'files':
      return (v || []).map(x => {
        const u =
          x.file && x.file.url ? x.file.url :
          x.external && x.external.url ? x.external.url : '';
        return [x.name || '', u].filter(Boolean).join(' ');
      }).join(' | ');
    case 'formula':
      if (!v || !v.type) return '';
      const fv = v[v.type];
      return fv === null || fv === undefined ? ''
        : typeof fv === 'object' ? JSON.stringify(fv) : String(fv);
    case 'rollup':
      return v ? JSON.stringify(v) : '';
    case 'created_time':
    case 'last_edited_time':
      return v || '';
    case 'created_by':
    case 'last_edited_by':
      return v ? (v.name || v.id || JSON.stringify(v)) : '';
    case 'unique_id':
      return v ? `${v.prefix || ''}${v.number || ''}` : '';
    default:
      try {
        return v === null || v === undefined ? ''
          : typeof v === 'string' ? v : JSON.stringify(v);
      } catch (_) {
        return String(v || '');
      }
  }
}

function csvEscape_(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}

function getOrCreateChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function writeTextIfAbsent_(folder, name, text, mime) {
  const files = folder.getFilesByName(name);
  if (files.hasNext()) return files.next();
  return folder.createFile(
    Utilities.newBlob(text, mime || 'text/plain', name)
  );
}

function updateManifest_(assetName, status, note) {
  try {
    const ss = SpreadsheetApp.openById(LEGACY_SNAPSHOT.MANIFEST_SPREADSHEET_ID);
    const sh = ss.getSheetByName('ASSETS') || ss.getSheets()[0];
    const last = sh.getLastRow();
    if (last < 2) return;

    const names = sh.getRange(2,1,last-1,1).getValues();
    for (let i=0; i<names.length; i++) {
      if (String(names[i][0]) === assetName) {
        const row = i + 2;
        sh.getRange(row,8).setValue(status);
        const old = String(sh.getRange(row,10).getValue() || '');
        const stamped = `[${new Date().toISOString()}] ${note || ''}`;
        sh.getRange(row,10).setValue(old ? old + '\n' + stamped : stamped);
        return;
      }
    }
  } catch (e) {
    console.warn('Manifest update skipped: ' + e.message);
  }
}

function loadState_() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(LEGACY_SNAPSHOT.STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveState_(state) {
  PropertiesService.getScriptProperties()
    .setProperty(LEGACY_SNAPSHOT.STATE_KEY, JSON.stringify(state));
}

function scheduleResume_(minutes) {
  deleteResumeTriggers_();
  ScriptApp.newTrigger('runLegacyNotionSnapshot')
    .timeBased()
    .after(minutes * 60 * 1000)
    .create();
}

function deleteResumeTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runLegacyNotionSnapshot')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function sha256Text_(text) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.newBlob(String(text), 'text/plain').getBytes()
  ).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
