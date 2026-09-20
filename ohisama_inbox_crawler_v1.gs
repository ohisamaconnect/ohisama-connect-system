/**
 * おひさまコネクト - INBOX Crawler v1.0
 * 2026-09-20
 *
 * 役割:
 *   公開Web上の日向坂46関連情報を収集し、NotionのINBOXへ入れる。
 *   このスクリプトはEVENTS/SOURCESを直接編集しない。
 *   「同じEVENTか」「新規EVENTか」の判断はINBOXの後段で行う。
 *
 * 必要なScript Properties:
 *   NOTION_TOKEN     : Notion Internal Integration Secret
 *   YOUTUBE_API_KEY  : YouTube Data API v3 key（YouTube収集を使う場合）
 *
 * 必要な外部ライブラリ:
 *   Cheerio（既存crawlerで利用していたものと同じ）
 *
 * 推奨Project timezone:
 *   Asia/Tokyo
 */

const OCOS = Object.freeze({
  BASE_URL: 'https://www.hinatazaka46.com',

  // Notion: 「おひさまコネクト｜制作DB（新規構築）」配下のINBOX data source
  NOTION_INBOX_DATA_SOURCE_ID: '7e3a247d-8d7b-4ed7-a4b1-cfac6ec45f16',
  NOTION_VERSION: '2026-03-11',

  TIMEZONE: 'Asia/Tokyo',

  // 公式NEWSは当月＋前月を毎回走査。URL/内容の重複はFingerprintで除去。
  NEWS_MONTH_OFFSETS: [-1, 0],

  // ブログ一覧の先頭数ページを走査。障害や実行間隔が空いても拾いやすくする。
  BLOG_PAGES_TO_SCAN: 3,

  // SCHEDULEは「前月～6か月先」を日次で走査。
  SCHEDULE_MONTH_OFFSETS: [-1, 0, 1, 2, 3, 4, 5, 6],

  // 公式YouTube 2チャンネル
  YOUTUBE_CHANNELS: [
    {
      id: 'UCR0V48DJyWbwEAdxLL5FjxA',
      name: '日向坂46 OFFICIAL YouTube CHANNEL'
    },
    {
      id: 'UCOB24f8lQBCnVqPZXOkVpOg',
      name: '日向坂ちゃんねる'
    }
  ],

  // MEMBERS DB構築後は、ここをDBから自動生成する形に置き換える予定。
  // 現時点の公開公式ブログ上の在籍メンバーを検索発見用に利用。
  MEMBER_SEARCH_TERMS: [
    '石塚瑶季', '大田美月', '大野愛実', '片山紗希', '金村美玖', '上村ひなの',
    '蔵盛妃那乃', '小坂菜緒', '小西夏菜実', '坂井新奈', '佐藤優羽', '清水理央',
    '下田衣珠季', '正源司陽子', '高井俐香', '髙橋未来虹', '竹内希来里', '鶴崎仁香',
    '平尾帆夏', '平岡海月', '藤嶌果歩', '松尾桜', '宮地すみれ', '森本茉莉',
    '山口陽世', '山下葉留花', '渡辺莉奈'
  ],

  HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; OhisamaConnectCrawler/1.0)',
  NOTION_WRITE_INTERVAL_MS: 380,
  HTTP_MAX_RETRIES: 4
});


// ============================================================
// Public entry points
// ============================================================

/**
 * 2時間おき推奨。
 * 変化しやすい情報源だけを見る。
 */
function runFrequentCrawler() {
  runCrawlerGroup_('frequent', [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_
  ]);
}

/**
 * 1日1回推奨。
 * 広い期間のSCHEDULEと、メンバー名を使ったニュース発見を行う。
 */
function runDailyCrawler() {
  runCrawlerGroup_('daily', [
    collectOfficialSchedule_,
    collectGoogleNewsMembers_
  ]);
}

/**
 * 手動テスト / 初回投入用。
 */
function runFullCrawler() {
  runCrawlerGroup_('full', [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialSchedule_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_,
    collectGoogleNewsMembers_
  ]);
}

/**
 * GASの時間主導トリガーを作る。
 * - Frequent: 2時間ごと
 * - Daily: 毎朝6時台
 */
function installCrawlerTriggers() {
  const targetFunctions = ['runFrequentCrawler', 'runDailyCrawler'];

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (targetFunctions.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('runFrequentCrawler')
    .timeBased()
    .everyHours(2)
    .create();

  ScriptApp.newTrigger('runDailyCrawler')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
}


/**
 * 書き込みをせず、collectorの取得結果だけログで確認する。
 * 初回導入時はまずこれを実行する。
 */
function previewCrawlerCandidates() {
  const collectors = [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialSchedule_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_
  ];

  let candidates = [];
  collectors.forEach(fn => {
    try {
      const items = fn() || [];
      console.log(`${fn.name}: ${items.length} candidates`);
      candidates = candidates.concat(items);
    } catch (err) {
      console.error(`${fn.name} failed: ${err.stack || err}`);
    }
  });

  const normalized = normalizeAndDeduplicateCandidates_(candidates);
  console.log(`preview unique candidates: ${normalized.length}`);
  console.log(JSON.stringify(normalized.slice(0, 30), null, 2));
}

/**
 * Notion token / 接続権限 / data source IDだけを確認する。
 * INBOXには書き込まない。
 */
function testNotionInboxConnection() {
  validateBaseConfig_();
  const result = notionRequest_(
    `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
    'post',
    { page_size: 1 }
  );
  console.log(`Notion INBOX connection OK. results=${(result.results || []).length}`);
}


// ============================================================
// Orchestrator
// ============================================================

function runCrawlerGroup_(label, collectors) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn(`[${label}] another crawler is running; skipped.`);
    return;
  }

  try {
    validateBaseConfig_();

    let candidates = [];

    collectors.forEach(fn => {
      try {
        const items = fn() || [];
        console.log(`${fn.name}: ${items.length} candidates`);
        candidates = candidates.concat(items);
      } catch (err) {
        // 1つの情報源が壊れても、ほかの情報源まで止めない。
        console.error(`${fn.name} failed: ${err.stack || err}`);
      }
    });

    const normalized = normalizeAndDeduplicateCandidates_(candidates);
    console.log(`[${label}] normalized unique candidates: ${normalized.length}`);

    const existing = loadExistingInboxFingerprints_();
    let created = 0;
    let skipped = 0;

    normalized.forEach(item => {
      if (existing.has(item.fingerprint)) {
        skipped++;
        return;
      }

      createInboxPage_(item);
      existing.add(item.fingerprint);
      created++;
      Utilities.sleep(OCOS.NOTION_WRITE_INTERVAL_MS);
    });

    console.log(`[${label}] done. created=${created}, skipped=${skipped}`);
  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// Collector A: 日向坂46公式 NEWS
// ============================================================

function collectOfficialNews_() {
  ensureCheerio_();
  const out = [];

  OCOS.NEWS_MONTH_OFFSETS.forEach(offset => {
    const ym = yearMonthByOffset_(offset);
    const url = `${OCOS.BASE_URL}/s/official/news/list?dy=${ym}&ima=0000`;
    const html = fetchText_(url);
    if (!html) return;

    const $ = Cheerio.load(html);

    $('.p-news__item').each((_, el) => {
      const $el = $(el);
      const $anchor = firstExisting_(
        $el.find('a[href*="/news/detail/"]').first(),
        $el.find('a').first()
      );

      const href = $anchor && $anchor.attr('href');
      if (!href) return;

      const fullUrl = absoluteUrl_(href, OCOS.BASE_URL);
      const title = cleanText_(
        firstNonEmpty_(
          $el.find('.c-news__title').first().text(),
          $el.find('.c-news__text').first().text(),
          $anchor.text()
        )
      );
      if (!title) return;

      const dateText = cleanText_(
        firstNonEmpty_(
          $el.find('.c-news__date').first().text(),
          $el.find('time').first().text()
        )
      );

      const category = cleanText_(
        firstNonEmpty_(
          $el.find('.c-news__category').first().text(),
          $el.find('.c-news__tag').first().text()
        )
      );

      out.push({
        title,
        url: fullUrl,
        publishedAt: parseJapaneseDate_(dateText),
        eventDateHint: null,
        publisher: '日向坂46公式',
        sourceClass: '日向坂46公式',
        sourceType: 'NEWS',
        snippet: category ? `公式NEWS / カテゴリ: ${category}` : '日向坂46公式NEWS'
      });
    });
  });

  return out;
}


// ============================================================
// Collector B: 日向坂46公式 BLOG
// ============================================================

function collectOfficialBlogs_() {
  ensureCheerio_();
  const out = [];

  for (let page = 1; page <= OCOS.BLOG_PAGES_TO_SCAN; page++) {
    const url = page === 1
      ? `${OCOS.BASE_URL}/s/official/diary/member/list`
      : `${OCOS.BASE_URL}/s/official/diary/member/list?page=${page}`;

    const html = fetchText_(url);
    if (!html) continue;
    const $ = Cheerio.load(html);

    $('.p-blog-article').each((_, el) => {
      const $el = $(el);
      let $anchor = $el.find('a.c-button-blog-detail').first();
      if (!$anchor || !$anchor.length) {
        $anchor = $el.find('a[href*="/diary/detail/"]').first();
      }
      if (!$anchor || !$anchor.length) {
        $anchor = $el.find('a').first();
      }

      const href = $anchor.attr('href');
      if (!href) return;

      const fullUrl = absoluteUrl_(href, OCOS.BASE_URL);
      const member = cleanText_($el.find('.c-blog-article__name').first().text());
      const blogTitle = cleanText_(
        firstNonEmpty_(
          $el.find('.c-blog-article__title').first().text(),
          $anchor.text()
        )
      );
      const dateText = cleanText_(
        firstNonEmpty_(
          $el.find('.c-blog-article__date').first().text(),
          $el.find('time').first().text()
        )
      );

      if (!blogTitle) return;

      const title = member
        ? `[ブログ] ${member}: ${blogTitle}`
        : `[ブログ] ${blogTitle}`;

      out.push({
        title,
        url: fullUrl,
        publishedAt: parseJapaneseDate_(dateText),
        eventDateHint: null,
        publisher: member || '日向坂46公式',
        sourceClass: '日向坂46公式',
        sourceType: 'ブログ',
        snippet: member ? `日向坂46公式ブログ / 投稿者: ${member}` : '日向坂46公式ブログ'
      });
    });
  }

  return out;
}


// ============================================================
// Collector C: 日向坂46公式 SCHEDULE
// ============================================================

function collectOfficialSchedule_() {
  const out = [];

  OCOS.SCHEDULE_MONTH_OFFSETS.forEach(offset => {
    const d = firstDayByOffset_(offset);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const yyyymm = `${year}${String(month).padStart(2, '0')}`;
    const scheduleUrl = `${OCOS.BASE_URL}/s/official/media/list?ima=0000&dy=${yyyymm}`;

    const html = fetchText_(scheduleUrl);
    if (!html) return;

    // 現行サイトの「日付見出し → その日のul」を単位に抽出。
    // DOM変更の影響範囲をここだけに閉じ込める。
    const dayBlockRegex = /<div class="c-schedule__date--list">[\s\S]*?<span>(\d+)<\/span>[\s\S]*?<\/div>[\s\S]*?<ul class="p-schedule__list[\s\S]*?<\/ul>/g;

    let dayMatch;
    while ((dayMatch = dayBlockRegex.exec(html)) !== null) {
      const day = Number(dayMatch[1]);
      const listHtml = dayMatch[0];
      const itemRegex = /<li class="p-schedule__item">([\s\S]*?)<\/li>/g;

      let itemMatch;
      while ((itemMatch = itemRegex.exec(listHtml)) !== null) {
        const content = itemMatch[1];

        const titleMatch = content.match(/class="[^"]*schedule__text[^"]*"[^>]*>([\s\S]*?)<\/p>/);
        if (!titleMatch) continue;

        const rawTitle = stripHtml_(titleMatch[1]);
        if (!rawTitle) continue;

        const categoryMatch = content.match(/class="[^"]*c-schedule__category[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        const category = categoryMatch ? stripHtml_(categoryMatch[1]) : 'その他';

        const timeMatch = content.match(/class="[^"]*c-schedule__time--list[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        const rawTime = timeMatch ? stripHtml_(timeMatch[1]) : '';

        const linkMatch = content.match(/href="([^"]+)"/);
        const relatedLink = linkMatch ? absoluteUrl_(linkMatch[1], OCOS.BASE_URL) : '';

        const eventDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let title = `[SCHEDULE:${category}] ${rawTitle}`;
        if (rawTime) title += ` (${rawTime})`;

        const snippetParts = [`公式SCHEDULE`, `カテゴリ: ${category}`];
        if (rawTime) snippetParts.push(`時刻: ${rawTime}`);
        if (relatedLink && relatedLink !== scheduleUrl) snippetParts.push(`関連リンク: ${relatedLink}`);

        out.push({
          title,
          // SOURCEとしては日向坂46公式SCHEDULEを保持する。
          // 外部リンクはsnippetに残し、必要なら後段で関係者一次SOURCEとして追加する。
          url: scheduleUrl,
          publishedAt: null,
          eventDateHint: eventDate,
          publisher: '日向坂46公式',
          sourceClass: '日向坂46公式',
          sourceType: 'SCHEDULE',
          snippet: snippetParts.join(' / ')
        });
      }
    }
  });

  return out;
}


// ============================================================
// Collector D: 公式YouTube 2チャンネル
// ============================================================

function collectOfficialYouTube_() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');
  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY is not set. YouTube collection skipped.');
    return [];
  }

  const out = [];

  OCOS.YOUTUBE_CHANNELS.forEach(channel => {
    try {
      const channelData = youtubeGet_('channels', {
        part: 'contentDetails,snippet',
        id: channel.id,
        key: apiKey
      });

      if (!channelData.items || !channelData.items.length) return;

      const uploadsId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
      const officialName = channelData.items[0].snippet.title || channel.name;

      const playlist = youtubeGet_('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsId,
        maxResults: 50,
        key: apiKey
      });

      (playlist.items || []).forEach(item => {
        const snippet = item.snippet || {};
        const contentDetails = item.contentDetails || {};
        const videoId = contentDetails.videoId || (snippet.resourceId && snippet.resourceId.videoId);
        if (!videoId) return;

        const publishedAt = contentDetails.videoPublishedAt || snippet.publishedAt || null;
        const description = cleanText_(snippet.description || '');

        out.push({
          title: `[YouTube] ${snippet.title || videoId}`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt,
          eventDateHint: null,
          publisher: officialName,
          sourceClass: '日向坂46公式',
          sourceType: 'YouTube',
          snippet: truncate_(description, 1500)
        });
      });
    } catch (err) {
      console.error(`YouTube channel failed (${channel.name}): ${err}`);
    }
  });

  return out;
}

function youtubeGet_(resource, params) {
  const query = Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  const url = `https://www.googleapis.com/youtube/v3/${resource}?${query}`;
  return JSON.parse(fetchText_(url));
}


// ============================================================
// Collector E: Google News RSS (発見装置)
// ============================================================

function collectGoogleNewsGroup_() {
  return collectGoogleNewsQuery_('日向坂46', ['日向坂46']);
}

function collectGoogleNewsMembers_() {
  const out = [];
  const chunkSize = 7;

  for (let i = 0; i < OCOS.MEMBER_SEARCH_TERMS.length; i += chunkSize) {
    const chunk = OCOS.MEMBER_SEARCH_TERMS.slice(i, i + chunkSize);
    const query = chunk.map(name => `"${name}"`).join(' OR ');
    out.push.apply(out, collectGoogleNewsQuery_(query, chunk));
    Utilities.sleep(250);
  }

  return out;
}

function collectGoogleNewsQuery_(query, requiredTitleTerms) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
  const xml = fetchText_(rssUrl);
  if (!xml) return [];

  const doc = XmlService.parse(xml);
  const channel = doc.getRootElement().getChild('channel');
  if (!channel) return [];

  const out = [];

  channel.getChildren('item').forEach(item => {
    const title = cleanText_(item.getChildText('title') || '');
    const link = item.getChildText('link');
    const pubDate = item.getChildText('pubDate');
    if (!title || !link) return;

    // メンバー名検索では、タイトルに検索対象名が1つも含まれない結果を落とし、ノイズを減らす。
    if (requiredTitleTerms && requiredTitleTerms.length > 1) {
      const matched = requiredTitleTerms.some(term => title.includes(term));
      if (!matched) return;
    }

    const sourceEl = item.getChild('source');
    const publisher = sourceEl ? cleanText_(sourceEl.getText()) : 'Google News';
    const sourceHomepage = sourceEl && sourceEl.getAttribute('url')
      ? sourceEl.getAttribute('url').getValue()
      : '';

    out.push({
      title,
      url: link,
      publishedAt: parseRfcDate_(pubDate),
      eventDateHint: null,
      publisher,
      // Google Newsはあくまで発見装置。
      // 媒体の信頼区分をcrawlerが勝手に決めない。
      sourceClass: '未判定',
      sourceType: '記事',
      snippet: sourceHomepage ? `Google News経由 / 発行元: ${publisher} / ${sourceHomepage}` : `Google News経由 / 発行元: ${publisher}`
    });
  });

  return out;
}


// ============================================================
// Normalize / fingerprint / dedup
// ============================================================

function normalizeAndDeduplicateCandidates_(items) {
  const map = new Map();

  items.forEach(raw => {
    const item = normalizeCandidate_(raw);
    if (!item) return;
    if (!map.has(item.fingerprint)) map.set(item.fingerprint, item);
  });

  return Array.from(map.values());
}

function normalizeCandidate_(raw) {
  if (!raw || !raw.title || !raw.url) return null;

  const item = {
    title: truncate_(cleanText_(raw.title), 1900),
    url: canonicalizeUrl_(raw.url),
    publishedAt: normalizeIsoLike_(raw.publishedAt),
    eventDateHint: normalizeIsoLike_(raw.eventDateHint),
    publisher: truncate_(cleanText_(raw.publisher || ''), 1900),
    sourceClass: raw.sourceClass || '未判定',
    sourceType: raw.sourceType || 'その他',
    snippet: truncate_(cleanText_(raw.snippet || ''), 1900)
  };

  item.fingerprint = makeFingerprint_(item);
  return item;
}

function makeFingerprint_(item) {
  // SCHEDULEは月ページURLを複数の予定が共有するため、URL単独ではなく
  // sourceType + URL + title + 日付を材料にする。
  const basis = [
    item.sourceType,
    item.url,
    item.title,
    item.publishedAt || '',
    item.eventDateHint || ''
  ].join('|').toLowerCase();

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    basis,
    Utilities.Charset.UTF_8
  );

  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}


// ============================================================
// Notion INBOX
// ============================================================

function loadExistingInboxFingerprints_() {
  const set = new Set();
  let cursor = null;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {
      const prop = page.properties && page.properties.Fingerprint;
      if (!prop || !prop.rich_text || !prop.rich_text.length) return;
      const value = prop.rich_text.map(x => x.plain_text || '').join('');
      if (value) set.add(value);
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  return set;
}

function createInboxPage_(item) {
  const detectedAt = nowJstIso_();

  const properties = {
    Inbox_Title: notionTitle_(item.title),
    URL: { url: item.url },
    Detected_At: { date: { start: detectedAt } },
    Publisher: notionRichText_(item.publisher),
    Source_Class: { select: { name: item.sourceClass } },
    Source_Type: { select: { name: item.sourceType } },
    Detected_Snippet: notionRichText_(item.snippet),
    Status: { select: { name: '未処理' } },
    Decision: { select: { name: '未判断' } },
    Fingerprint: notionRichText_(item.fingerprint)
  };

  if (item.publishedAt) {
    properties.Published_At = { date: { start: item.publishedAt } };
  }
  if (item.eventDateHint) {
    properties.Event_Date_Hint = { date: { start: item.eventDateHint } };
  }

  const body = {
    parent: {
      type: 'data_source_id',
      data_source_id: OCOS.NOTION_INBOX_DATA_SOURCE_ID
    },
    properties
  };

  notionRequest_('/v1/pages', 'post', body);
}

function notionRequest_(path, method, body) {
  const token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) throw new Error('NOTION_TOKEN is not set in Script Properties.');

  const url = `https://api.notion.com${path}`;
  const options = {
    method: method || 'get',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': OCOS.NOTION_VERSION
    }
  };

  if (body !== undefined && body !== null) {
    options.payload = JSON.stringify(body);
  }

  for (let attempt = 0; attempt < OCOS.HTTP_MAX_RETRIES; attempt++) {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    const text = res.getContentText();

    if (code >= 200 && code < 300) {
      return text ? JSON.parse(text) : {};
    }

    if (code === 429 || code >= 500) {
      const headers = res.getAllHeaders();
      const retryAfter = Number(headers['Retry-After'] || headers['retry-after'] || 0);
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

function notionTitle_(text) {
  return {
    title: [{ type: 'text', text: { content: truncate_(text || '', 1900) } }]
  };
}

function notionRichText_(text) {
  if (!text) return { rich_text: [] };
  return {
    rich_text: [{ type: 'text', text: { content: truncate_(text, 1900) } }]
  };
}


// ============================================================
// HTTP helpers
// ============================================================

function fetchText_(url) {
  const options = {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': OCOS.HTTP_USER_AGENT,
      'Accept-Language': 'ja,en;q=0.8'
    }
  };

  for (let attempt = 0; attempt < OCOS.HTTP_MAX_RETRIES; attempt++) {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();

    if (code >= 200 && code < 300) {
      return res.getContentText();
    }

    if (code === 429 || code >= 500) {
      Utilities.sleep(Math.pow(2, attempt) * 1000 + 250);
      continue;
    }

    console.warn(`HTTP ${code}: ${url}`);
    return null;
  }

  console.warn(`Retry limit exceeded: ${url}`);
  return null;
}


// ============================================================
// Date helpers
// ============================================================

function parseJapaneseDate_(text) {
  if (!text) return null;
  const s = cleanText_(text)
    .replace(/年/g, '.')
    .replace(/月/g, '.')
    .replace(/日/g, '')
    .replace(/\//g, '.');

  const m = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;

  const y = m[1];
  const mo = String(m[2]).padStart(2, '0');
  const d = String(m[3]).padStart(2, '0');

  if (m[4] !== undefined) {
    const hh = String(m[4]).padStart(2, '0');
    const mm = String(m[5]).padStart(2, '0');
    return `${y}-${mo}-${d}T${hh}:${mm}:00+09:00`;
  }

  return `${y}-${mo}-${d}`;
}

function parseRfcDate_(text) {
  if (!text) return null;
  const d = new Date(text);
  if (isNaN(d.getTime())) return null;
  return toJstIso_(d);
}

function normalizeIsoLike_(value) {
  if (!value) return null;
  if (value instanceof Date) return toJstIso_(value);
  const s = String(value).trim();
  if (!s) return null;

  // YYYY-MM-DD / ISO8601 はそのまま。
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s)) return s;

  return parseJapaneseDate_(s) || parseRfcDate_(s);
}

function nowJstIso_() {
  return toJstIso_(new Date());
}

function toJstIso_(date) {
  return Utilities.formatDate(date, OCOS.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss") + '+09:00';
}

function yearMonthByOffset_(offset) {
  const d = firstDayByOffset_(offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function firstDayByOffset_(offset) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}


// ============================================================
// String / URL helpers
// ============================================================

function cleanText_(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripHtml_(html) {
  const withoutTags = String(html || '').replace(/<[^>]+>/g, ' ');
  return cleanText_(decodeBasicEntities_(withoutTags));
}

function decodeBasicEntities_(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function absoluteUrl_(href, base) {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/')) return base.replace(/\/$/, '') + href;
  return base.replace(/\/$/, '') + '/' + href.replace(/^\//, '');
}

function canonicalizeUrl_(url) {
  let s = cleanText_(url);
  if (!s) return s;

  // 追跡系パラメータだけ除去。サイト固有のdy/page等は残す。
  s = s.replace(/([?&])(utm_[^=&]+|source|ima)=[^&#]*/gi, '$1');
  s = s.replace(/[?&]+$/, '');
  s = s.replace('?&', '?').replace(/&&+/g, '&');
  return s;
}

function truncate_(text, maxLen) {
  const s = String(text || '');
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

function firstNonEmpty_() {
  for (let i = 0; i < arguments.length; i++) {
    const s = cleanText_(arguments[i]);
    if (s) return s;
  }
  return '';
}

function firstExisting_() {
  for (let i = 0; i < arguments.length; i++) {
    const obj = arguments[i];
    if (obj && obj.length) return obj;
  }
  return null;
}


// ============================================================
// Validation
// ============================================================

function validateBaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('NOTION_TOKEN')) {
    throw new Error('Script Properties に NOTION_TOKEN を設定してください。');
  }
}

function ensureCheerio_() {
  if (typeof Cheerio === 'undefined') {
    throw new Error('Cheerio library が見つかりません。既存crawlerで使用していたCheerioをこのGASプロジェクトにも追加してください。');
  }
}

function previewFullCrawlerSummary() {
  const collectors = [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialSchedule_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_,
    collectGoogleNewsMembers_
  ];

  let candidates = [];

  collectors.forEach(fn => {
    try {
      const items = fn() || [];
      console.log(`${fn.name}: ${items.length} candidates`);
      candidates = candidates.concat(items);
    } catch (err) {
      console.error(`${fn.name} failed: ${err.stack || err}`);
    }
  });

  const normalized = normalizeAndDeduplicateCandidates_(candidates);

  console.log('================================');
  console.log(`RAW TOTAL: ${candidates.length}`);
  console.log(`UNIQUE TOTAL: ${normalized.length}`);
  console.log('================================');
}
function previewCrawlerCounts() {
  const collectors = [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialSchedule_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_,
    collectGoogleNewsMembers_
  ];

  let all = [];

  collectors.forEach(fn => {
    try {
      const raw = fn() || [];
      const unique = normalizeAndDeduplicateCandidates_(raw);

      console.log(
        `${fn.name}: raw=${raw.length}, unique=${unique.length}`
      );

      all = all.concat(raw);
    } catch (e) {
      console.error(`${fn.name}: ERROR ${e.message}`);
    }
  });

  const totalUnique = normalizeAndDeduplicateCandidates_(all);

  console.log('-------------------------');
  console.log(`TOTAL UNIQUE = ${totalUnique.length}`);
}

function runFullCrawlerChunk() {
  const START = Date.now();

  // 1回の安全上限
  const MAX_CREATE = 120;

  // 4分30秒で自発的に停止
  const TIME_LIMIT_MS = 4.5 * 60 * 1000;

  const collectors = [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialSchedule_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_,
    collectGoogleNewsMembers_
  ];

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    console.warn('another crawler is running; skipped.');
    return;
  }

  try {
    validateBaseConfig_();

    let candidates = [];

    collectors.forEach(fn => {
      try {
        const items = fn() || [];
        console.log(`${fn.name}: ${items.length}`);
        candidates = candidates.concat(items);
      } catch (err) {
        console.error(`${fn.name}: ${err.message}`);
      }
    });

    const normalized =
      normalizeAndDeduplicateCandidates_(candidates);

    const existing =
      loadExistingInboxFingerprints_();

    let created = 0;
    let skipped = 0;

    for (const item of normalized) {

      if (existing.has(item.fingerprint)) {
        skipped++;
        continue;
      }

      // 件数または時間で安全停止
      if (
        created >= MAX_CREATE ||
        Date.now() - START >= TIME_LIMIT_MS
      ) {
        break;
      }

      createInboxPage_(item);

      existing.add(item.fingerprint);

      created++;

      Utilities.sleep(
        OCOS.NOTION_WRITE_INTERVAL_MS
      );
    }

    const remaining =
      normalized.filter(
        x => !existing.has(x.fingerprint)
      ).length;

    console.log(
      `chunk finished: created=${created}, ` +
      `skipped=${skipped}, ` +
      `remaining=${remaining}`
    );

  } finally {
    lock.releaseLock();
  }
}
