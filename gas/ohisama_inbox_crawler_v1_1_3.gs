/**
 * おひさまコネクト - INBOX Crawler v1.1.3
 * 2026-09-20
 *
 * 役割:
 *   公開Web上の日向坂46関連情報を収集し、NotionのINBOXへ入れる。
 *   EVENTS / SOURCES は直接編集しない。
 *
 * v1.1:
 *   - Google Sheets製の機械用 CRAWLER_LEDGER を自動作成
 *   - INBOXを整理/削除しても再取得しない永続重複防止
 *   - 全run系関数に件数上限 + 4分30秒ソフトタイムアウト
 *   - 初回大量投入は runFullCrawlerChunk() を繰り返す
 *   - 公式SCHEDULEはCheerio DOM解析を優先し、旧正規表現をフォールバック
 *   - previewは大量JSONを出さず件数中心
 *
 * 必要な Script Properties:
 *   NOTION_TOKEN
 *   YOUTUBE_API_KEY  （YouTube収集を使う場合）
 *
 * 必要な外部ライブラリ:
 *   Cheerio
 *
 * 推奨Project timezone:
 *   Asia/Tokyo
 */

const OCOS = Object.freeze({
  BASE_URL: 'https://www.hinatazaka46.com',

  // Notion INBOX data source
  NOTION_INBOX_DATA_SOURCE_ID: '7e3a247d-8d7b-4ed7-a4b1-cfac6ec45f16',
  NOTION_VERSION: '2026-03-11',

  TIMEZONE: 'Asia/Tokyo',

  NEWS_MONTH_OFFSETS: [-1, 0],
  BLOG_PAGES_TO_SCAN: 3,
  SCHEDULE_MONTH_OFFSETS: [-1, 0, 1, 2, 3, 4, 5, 6],

  YOUTUBE_CHANNELS: [
    { id: 'UCR0V48DJyWbwEAdxLL5FjxA', name: '日向坂46 OFFICIAL YouTube CHANNEL' },
    { id: 'UCOB24f8lQBCnVqPZXOkVpOg', name: '日向坂ちゃんねる' }
  ],

  // MEMBERS DB完成後にDB由来へ置き換える。
  MEMBER_SEARCH_TERMS: [
    '石塚瑶季', '大田美月', '大野愛実', '片山紗希', '金村美玖', '上村ひなの',
    '蔵盛妃那乃', '小坂菜緒', '小西夏菜実', '坂井新奈', '佐藤優羽', '清水理央',
    '下田衣珠季', '正源司陽子', '高井俐香', '髙橋未来虹', '竹内希来里', '鶴崎仁香',
    '平尾帆夏', '平岡海月', '藤嶌果歩', '松尾桜', '宮地すみれ', '森本茉莉',
    '山口陽世', '山下葉留花', '渡辺莉奈'
  ],

  HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; OhisamaConnectCrawler/1.1)',
  HTTP_MAX_RETRIES: 4,
  NOTION_WRITE_INTERVAL_MS: 380,

  // GASは1実行6分なので、4分30秒で自主停止する。
  RUN_SOFT_LIMIT_MS: 4.5 * 60 * 1000,
  MAX_CREATE_FREQUENT: 80,
  MAX_CREATE_DAILY: 100,
  MAX_CREATE_FULL: 120,

  LEDGER_PROPERTY_KEY: 'CRAWLER_LEDGER_SPREADSHEET_ID',
  LEDGER_SPREADSHEET_NAME: 'おひさまコネクト_CRAWLER_LEDGER',
  LEDGER_SHEET_NAME: 'CRAWLER_LEDGER',

  // Google Drive: OC-OSフォルダ配下へLedgerを配置
  DRIVE_FOLDER_NAME: 'OC-OS',
  DRIVE_FOLDER_PROPERTY_KEY: 'OCOS_DRIVE_FOLDER_ID',
  LEDGER_FLUSH_EVERY: 20,
  LEDGER_HEADERS: ['Fingerprint', 'First_Detected', 'URL', 'Source_Type', 'Title']
});


// ============================================================
// 初期セットアップ
// ============================================================

/**
 * 最初に1回だけ実行。
 * - Notion接続確認
 * - CRAWLER_LEDGER Spreadsheetを自動作成
 * - 現在INBOXにすでにあるFingerprintをLedgerへ移植
 */
function setupCrawlerV11() {
  validateBaseConfig_();
  ensureCheerio_();

  const sheet = getOrCreateLedgerSheet_();
  console.log(`Ledger ready: ${sheet.getParent().getUrl()}`);

  testNotionInboxConnection();
  backfillLedgerFromInbox();

  console.log('setupCrawlerV11 completed.');
}


// ============================================================
// Public entry points
// ============================================================

/** 2時間おき推奨 */
function runFrequentCrawler() {
  runCrawlerGroup_('frequent', [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_
  ], OCOS.MAX_CREATE_FREQUENT);
}

/** 1日1回推奨 */
function runDailyCrawler() {
  runCrawlerGroup_('daily', [
    collectOfficialSchedule_,
    collectGoogleNewsMembers_
  ], OCOS.MAX_CREATE_DAILY);
}

/**
 * 初回大量投入用。
 * remaining=0 になるまで手動で繰り返す。
 */
function runFullCrawlerChunk() {
  runCrawlerGroup_('full-chunk', [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialSchedule_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_,
    collectGoogleNewsMembers_
  ], OCOS.MAX_CREATE_FULL);
}

/**
 * 互換用。v1.1では安全のためrunFullCrawlerもChunk動作にする。
 */
function runFullCrawler() {
  runFullCrawlerChunk();
}

/**
 * Frequent: 2時間ごと
 * Daily: 毎朝6時台
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

  console.log('Crawler triggers installed.');
}


// ============================================================
// Preview / Test
// ============================================================

function previewCrawlerCounts() {
  const collectors = fullCollectors_();
  let all = [];

  collectors.forEach(fn => {
    try {
      const raw = fn() || [];
      const unique = normalizeAndDeduplicateCandidates_(raw);
      console.log(`${fn.name}: raw=${raw.length}, unique=${unique.length}`);
      all = all.concat(raw);
    } catch (e) {
      console.error(`${fn.name}: ERROR ${e.stack || e}`);
    }
  });

  const totalUnique = normalizeAndDeduplicateCandidates_(all);
  console.log('-------------------------');
  console.log(`TOTAL UNIQUE = ${totalUnique.length}`);
}

function previewCrawlerSample() {
  const collectors = fullCollectors_();
  let all = [];

  collectors.forEach(fn => {
    try {
      all = all.concat(fn() || []);
    } catch (e) {
      console.error(`${fn.name}: ERROR ${e.message}`);
    }
  });

  const normalized = normalizeAndDeduplicateCandidates_(all);
  console.log(`UNIQUE TOTAL = ${normalized.length}`);

  normalized.slice(0, 20).forEach((x, i) => {
    console.log(
      `${i + 1}. [${x.sourceType}] ${x.title} | ` +
      `${x.publisher} | pub=${x.publishedAt || '-'} | event=${x.eventDateHint || '-'} | ${x.url}`
    );
  });
}

function testNotionInboxConnection() {
  validateBaseConfig_();
  const result = notionRequest_(
    `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
    'post',
    { page_size: 1 }
  );
  console.log(`Notion INBOX connection OK. results=${(result.results || []).length}`);
}

function testLedgerConnection() {
  const sheet = getOrCreateLedgerSheet_();
  console.log(`Ledger OK: rows=${Math.max(0, sheet.getLastRow() - 1)} / ${sheet.getParent().getUrl()}`);
}

function fullCollectors_() {
  return [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialSchedule_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_,
    collectGoogleNewsMembers_
  ];
}


// ============================================================
// Orchestrator
// ============================================================

function runCrawlerGroup_(label, collectors, maxCreate) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn(`[${label}] another crawler is running; skipped.`);
    return;
  }

  const startedAt = Date.now();
  let ledgerBuffer = [];

  try {
    validateBaseConfig_();
    getOrCreateLedgerSheet_();

    let candidates = [];

    for (const fn of collectors) {
      if (isNearSoftLimit_(startedAt)) {
        console.warn(`[${label}] soft time limit reached during collection.`);
        break;
      }

      try {
        const items = fn() || [];
        console.log(`${fn.name}: ${items.length} candidates`);
        candidates = candidates.concat(items);
      } catch (err) {
        console.error(`${fn.name} failed: ${err.stack || err}`);
      }
    }

    const normalized = normalizeAndDeduplicateCandidates_(candidates);
    console.log(`[${label}] normalized unique candidates: ${normalized.length}`);

    // Ledger + 現在INBOXの両方を見る。
    // hard timeout直前にLedger flushできなかったケースもINBOX側で再重複を防ぐ。
    const seen = loadSeenFingerprints_();

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of normalized) {
      if (seen.has(item.fingerprint)) {
        skipped++;
        continue;
      }

      if (created >= maxCreate || isNearSoftLimit_(startedAt)) {
        break;
      }

      try {
        createInboxPage_(item);
        seen.add(item.fingerprint);
        created++;

        ledgerBuffer.push(makeLedgerRow_(item));
        if (ledgerBuffer.length >= OCOS.LEDGER_FLUSH_EVERY) {
          appendLedgerRows_(ledgerBuffer);
          ledgerBuffer = [];
        }

        Utilities.sleep(OCOS.NOTION_WRITE_INTERVAL_MS);
      } catch (err) {
        failed++;
        console.error(`createInboxPage failed: ${item.title} / ${err.stack || err}`);
      }
    }

    if (ledgerBuffer.length) {
      appendLedgerRows_(ledgerBuffer);
      ledgerBuffer = [];
    }

    const remaining = normalized.reduce((n, x) => n + (seen.has(x.fingerprint) ? 0 : 1), 0);

    console.log(
      `[${label}] done. created=${created}, skipped=${skipped}, failed=${failed}, remaining=${remaining}, ` +
      `elapsedSec=${Math.round((Date.now() - startedAt) / 1000)}`
    );
  } finally {
    // 通常は上でflush済み。例外時も可能な限りLedgerへ残す。
    if (ledgerBuffer.length) {
      try {
        appendLedgerRows_(ledgerBuffer);
      } catch (e) {
        console.error(`Ledger final flush failed: ${e.stack || e}`);
      }
    }
    lock.releaseLock();
  }
}

function isNearSoftLimit_(startedAt) {
  return Date.now() - startedAt >= OCOS.RUN_SOFT_LIMIT_MS;
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

      const title = cleanText_(firstNonEmpty_(
        $el.find('.c-news__title').first().text(),
        $el.find('.c-news__text').first().text(),
        $anchor.text()
      ));
      if (!title) return;

      const dateText = cleanText_(firstNonEmpty_(
        $el.find('.c-news__date').first().text(),
        $el.find('time').first().text()
      ));

      const category = cleanText_(firstNonEmpty_(
        $el.find('.c-news__category').first().text(),
        $el.find('.c-news__tag').first().text()
      ));

      out.push({
        title,
        url: absoluteUrl_(href, OCOS.BASE_URL),
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
      if (!$anchor || !$anchor.length) $anchor = $el.find('a[href*="/diary/detail/"]').first();
      if (!$anchor || !$anchor.length) $anchor = $el.find('a').first();

      const href = $anchor.attr('href');
      if (!href) return;

      const member = cleanText_($el.find('.c-blog-article__name').first().text());
      const blogTitle = cleanText_(firstNonEmpty_(
        $el.find('.c-blog-article__title').first().text(),
        $anchor.text()
      ));
      if (!blogTitle) return;

      const dateText = cleanText_(firstNonEmpty_(
        $el.find('.c-blog-article__date').first().text(),
        $el.find('time').first().text()
      ));

      out.push({
        title: member ? `[ブログ] ${member}: ${blogTitle}` : `[ブログ] ${blogTitle}`,
        url: absoluteUrl_(href, OCOS.BASE_URL),
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
  ensureCheerio_();
  const out = [];

  OCOS.SCHEDULE_MONTH_OFFSETS.forEach(offset => {
    const d = firstDayByOffset_(offset);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const yyyymm = `${year}${String(month).padStart(2, '0')}`;
    const scheduleUrl = `${OCOS.BASE_URL}/s/official/media/list?ima=0000&dy=${yyyymm}`;

    const html = fetchText_(scheduleUrl);
    if (!html) return;

    const domItems = parseScheduleMonthWithCheerio_(html, scheduleUrl, year, month);

    if (domItems.length) {
      out.push.apply(out, domItems);
    } else {
      console.warn(`SCHEDULE DOM parse returned 0; regex fallback: ${yyyymm}`);
      out.push.apply(out, parseScheduleMonthWithRegex_(html, scheduleUrl, year, month));
    }
  });

  return out;
}

function parseScheduleMonthWithCheerio_(html, scheduleUrl, year, month) {
  const $ = Cheerio.load(html);
  const out = [];

  $('.c-schedule__date--list').each((_, dateEl) => {
    const dayText = cleanText_($(dateEl).find('span').first().text());
    const dayMatch = dayText.match(/\d{1,2}/);
    if (!dayMatch) return;

    const day = Number(dayMatch[0]);

    // 現行DOMでは日付ブロックの後ろに当日のリストが続く想定。
    let $list = $(dateEl).nextAll('ul.p-schedule__list').first();

    // DOM変更時の軽い救済。
    if (!$list || !$list.length) {
      $list = $(dateEl).parent().children('ul.p-schedule__list').first();
    }

    if (!$list || !$list.length) return;

    $list.find('li.p-schedule__item').each((__, itemEl) => {
      const item = parseScheduleItemCheerio_($, $(itemEl), scheduleUrl, year, month, day);
      if (item) out.push(item);
    });
  });

  return out;
}

function parseScheduleItemCheerio_($, $item, scheduleUrl, year, month, day) {
  const category = cleanText_(firstNonEmpty_(
    $item.find('.c-schedule__category').first().text(),
    $item.find('[class*="schedule__category"]').first().text(),
    'その他'
  ));

  const rawTime = cleanText_(firstNonEmpty_(
    $item.find('.c-schedule__time--list').first().text(),
    $item.find('[class*="schedule__time"]').first().text()
  ));

  const rawTitle = cleanText_(firstNonEmpty_(
    $item.find('[class*="schedule__text"]').first().text(),
    $item.find('p').last().text()
  ));

  if (!rawTitle) return null;

  const href = $item.find('a[href]').first().attr('href') || '';
  const relatedLink = href ? absoluteUrl_(href, OCOS.BASE_URL) : '';
  const eventDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return buildScheduleCandidate_(scheduleUrl, relatedLink, eventDate, category, rawTime, rawTitle);
}

function parseScheduleMonthWithRegex_(html, scheduleUrl, year, month) {
  const out = [];
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

      out.push(buildScheduleCandidate_(scheduleUrl, relatedLink, eventDate, category, rawTime, rawTitle));
    }
  }

  return out;
}

function buildScheduleCandidate_(scheduleUrl, relatedLink, eventDate, category, rawTime, rawTitle) {
  let title = `[SCHEDULE:${category}] ${rawTitle}`;
  if (rawTime) title += ` (${rawTime})`;

  const snippetParts = ['公式SCHEDULE', `カテゴリ: ${category}`];
  if (rawTime) snippetParts.push(`時刻: ${rawTime}`);
  if (relatedLink && relatedLink !== scheduleUrl) snippetParts.push(`関連リンク: ${relatedLink}`);

  return {
    title,
    url: scheduleUrl,
    publishedAt: null,
    eventDateHint: eventDate,
    publisher: '日向坂46公式',
    sourceClass: '日向坂46公式',
    sourceType: 'SCHEDULE',
    snippet: snippetParts.join(' / ')
  };
}


// ============================================================
// Collector D: 公式YouTube
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

        out.push({
          title: `[YouTube] ${snippet.title || videoId}`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt: contentDetails.videoPublishedAt || snippet.publishedAt || null,
          eventDateHint: null,
          publisher: officialName,
          sourceClass: '日向坂46公式',
          sourceType: 'YouTube',
          snippet: truncate_(cleanText_(snippet.description || ''), 1500)
        });
      });
    } catch (err) {
      console.error(`YouTube channel failed (${channel.name}): ${err.stack || err}`);
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
// Collector E: Google News RSS
// ============================================================

function collectGoogleNewsGroup_() {
  return collectGoogleNewsQuery_(
    '日向坂46 when:7d',
    ['日向坂46']
  );
}


function collectGoogleNewsMembers_() {
  const out = [];
  const chunkSize = 7;

  for (
    let i = 0;
    i < OCOS.MEMBER_SEARCH_TERMS.length;
    i += chunkSize
  ) {
    const chunk =
      OCOS.MEMBER_SEARCH_TERMS.slice(
        i,
        i + chunkSize
      );

    const names =
      chunk
        .map(name => `"${name}"`)
        .join(' OR ');

    // Google Newsは「最近の新情報発見」に限定する。
    // 過去記事が検索順位変動で再浮上するのを防ぐ。
    const query =
      `(${names}) when:7d`;

    out.push.apply(
      out,
      collectGoogleNewsQuery_(
        query,
        chunk
      )
    );

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

 // 画像ギャラリー等の子ページは情報源として採用しない
 
   if (isGoogleNewsGalleryNoise_(title)) {
   return;
   }

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
      sourceHomepage: sourceHomepage,
      sourceClass: '未判定',
      sourceType: '記事',
      snippet: sourceHomepage
        ? `Google News経由 / 発行元: ${publisher} / ${sourceHomepage}`
        : `Google News経由 / 発行元: ${publisher}`
    });
  });

  return out;
}

function isGoogleNewsGalleryNoise_(title) {
  let s = cleanText_(title || '');

  try {
    s = s.normalize('NFKC');
  } catch (e) {}

  return (
    // ORICONなど
    /^画像・写真\s*\|/i.test(s) ||

    // 「【写真・画像】〜」
    /^【写真・画像】/i.test(s) ||

    // モデルプレス等「(画像2/16)」
    /^\(画像\s*\d+\s*\/\s*\d+\)/i.test(s) ||

    // ナタリー等
    /\[画像ギャラリー\s*\d+\s*\/\s*\d+\]/i.test(s) ||

    // THE FIRST TIMES等
    /画像一覧\s*\(\d+\s*\/\s*\d+\)/i.test(s) ||

    // ORICON「〜 9枚目 -」
    /\s\d+枚目\s*-\s*/i.test(s) ||

    // サンスポ等「（写真・画像 2/2）」
    /\(写真・画像\s*\d+\s*\/\s*\d+\)/i.test(s) ||

    // ウォーカープラス等「画像8 / 15＞」
    /^画像\s*\d+\s*\/\s*\d+\s*[>＞]/i.test(s) ||

    // RBB TODAY等「1枚目の写真・画像」
    /\d+枚目の写真・画像/i.test(s) ||

    // Pop'n'Roll等「📸 画像：」
    /^📸\s*画像\s*[:：]/i.test(s)
  );
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
    // Google News重複判定専用。
    sourceHomepage: cleanText_(raw.sourceHomepage || ''),

    sourceClass: raw.sourceClass || '未判定',
    sourceType: raw.sourceType || 'その他',
    snippet: truncate_(cleanText_(raw.snippet || ''), 1900)
  };

  item.fingerprint = makeFingerprint_(item);
  return item;
}

function makeFingerprint_(item) {
  let basis;

  if (isGoogleNewsUrl_(item.url)) {

    // Google Newsだけは、
    // RSS URL・媒体名・タイムゾーン表記の揺れを吸収する。
    const sourceKey =
      makeGoogleNewsSourceKey_(
        item.publisher,
        item.sourceHomepage
      );

    const titleKey =
      normalizeGoogleNewsTitleKey_(item.title);

    const publishedKey =
      fingerprintDateKey_(item.publishedAt);

    basis = [
      'google-news',
      sourceKey,
      titleKey,
      publishedKey
    ].join('|');

  } else {

    // 公式NEWS / BLOG / SCHEDULE / YouTube等は
    // v1.1.1までの方式を維持する。
    //
    // 既存Ledgerとの互換性を壊さないことが重要。
    basis = [
      item.sourceType,
      item.url,
      item.title,
      item.publishedAt || '',
      item.eventDateHint || ''
    ].join('|');
  }

  basis = basis.toLowerCase();

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    basis,
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(
      b =>
        ('0' + ((b + 256) % 256).toString(16))
          .slice(-2)
    )
    .join('');
}


/**
 * Fingerprint用日時正規化。
 *
 * 同じ瞬間なら、
 *
 * 2026-08-29T07:00:00.000Z
 * 2026-08-29T16:00:00+09:00
 *
 * を同一値として扱う。
 *
 * 日付だけの
 * 2026-08-29
 * はそのまま保持する。
 */
function fingerprintDateKey_(value) {
  if (!value) {
    return '';
  }

  const s = String(value).trim();

  if (!s) {
    return '';
  }

  // 日付だけならそのまま
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const d = new Date(s);

  if (!isNaN(d.getTime())) {
    // タイムゾーン・ミリ秒表記に依存しない
    // Unix秒に統一
    return String(
      Math.floor(d.getTime() / 1000)
    );
  }

  // 念のため解析不能値も完全に捨てない
  return s.toLowerCase();
}


/**
 * Google News RSS URL判定
 */
function isGoogleNewsUrl_(url) {
  return /^https:\/\/news\.google\.com\/rss\/articles\//i
    .test(String(url || ''));
}


/**
 * Google Newsの実際の配信元を識別する。
 *
 * 表示名ではなく、可能な限り
 * <source url=""> のhostnameを利用する。
 */
function makeGoogleNewsSourceKey_(
  publisher,
  sourceHomepage
) {
  const host =
    hostnameFromUrl_(sourceHomepage);

  if (host) {
    return host;
  }

  let value = cleanText_(publisher || '');

  try {
    value = value.normalize('NFKC');
  } catch (e) {}

  return value.toLowerCase();
}


/**
 * URLからhostnameだけを取得。
 */
function hostnameFromUrl_(url) {
  const s = cleanText_(url || '');

  const match =
    s.match(/^https?:\/\/([^\/?#]+)/i);

  if (!match) return '';

  return match[1]
    .toLowerCase()
    .replace(/^www\./, '');
}


/**
 * Google Newsの記事タイトルを
 * 重複判定用に正規化する。
 */
function normalizeGoogleNewsTitleKey_(title) {
  let s = cleanText_(title || '');

  try {
    s = s.normalize('NFKC');
  } catch (e) {}

  // Google Newsが最後に付ける「 - 媒体名」を除去
  const separator = s.lastIndexOf(' - ');

  if (separator > 0) {
    s = s.slice(0, separator);
  }

  s = s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐-‒–—―]/g, '-')

    // 括弧直前などの表記揺れを吸収
    // 「表紙に (MANTANWEB)」と「表紙に(MANTANWEB)」を同一視
    .replace(/\s+([(\[【「『])/g, '$1')

    .replace(/\s+/g, ' ')
    .trim();

  return s.toLowerCase();
}


// ============================================================
// CRAWLER_LEDGER (Google Sheets / 機械専用)
// ============================================================

function getOrCreateLedgerSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(OCOS.LEDGER_PROPERTY_KEY);
  let ss = null;

  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (e) {
      console.warn('Saved Ledger Spreadsheet ID is invalid. Recreating.');
      id = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create(OCOS.LEDGER_SPREADSHEET_NAME);
    props.setProperty(OCOS.LEDGER_PROPERTY_KEY, ss.getId());
  }

  // 新規作成時だけでなく、既存LedgerもOC-OSフォルダへ移動する。
  ensureFileInOcosFolder_(ss.getId());

  let sheet = ss.getSheetByName(OCOS.LEDGER_SHEET_NAME);
  if (!sheet) {
    const sheets = ss.getSheets();
    if (sheets.length === 1 && sheets[0].getLastRow() === 0) {
      sheet = sheets[0];
      sheet.setName(OCOS.LEDGER_SHEET_NAME);
    } else {
      sheet = ss.insertSheet(OCOS.LEDGER_SHEET_NAME);
    }
  }

  ensureLedgerHeader_(sheet);
  return sheet;
}

/**
 * OC-OSフォルダを取得する。
 * 初回はフォルダ名で検索し、以後はIDをScript Propertiesへ保存して使う。
 */
function getOcosDriveFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty(OCOS.DRIVE_FOLDER_PROPERTY_KEY);

  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (e) {
      console.warn('Saved OC-OS folder ID is invalid. Searching by name again.');
      props.deleteProperty(OCOS.DRIVE_FOLDER_PROPERTY_KEY);
    }
  }

  const folders = DriveApp.getFoldersByName(OCOS.DRIVE_FOLDER_NAME);

  if (!folders.hasNext()) {
    throw new Error(
      `Google Driveに「${OCOS.DRIVE_FOLDER_NAME}」フォルダが見つかりません。`
    );
  }

  const folder = folders.next();

  // 同名フォルダが複数ある場合は、誤配置を避けるため停止する。
  if (folders.hasNext()) {
    throw new Error(
      `Google Driveに「${OCOS.DRIVE_FOLDER_NAME}」フォルダが複数あります。` +
      '重複するフォルダ名を整理してから setupCrawlerV11() を再実行してください。'
    );
  }

  props.setProperty(OCOS.DRIVE_FOLDER_PROPERTY_KEY, folder.getId());
  return folder;
}

/**
 * Ledger SpreadsheetをOC-OSフォルダ配下へ移動する。
 */
function ensureFileInOcosFolder_(fileId) {
  const folder = getOcosDriveFolder_();
  const file = DriveApp.getFileById(fileId);
  file.moveTo(folder);
}

function ensureLedgerHeader_(sheet) {
  const headers = OCOS.LEDGER_HEADERS;
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const same = headers.every((h, i) => current[i] === h);

  if (!same) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function loadLedgerFingerprints_() {
  const sheet = getOrCreateLedgerSheet_();
  const lastRow = sheet.getLastRow();
  const set = new Set();

  if (lastRow <= 1) return set;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  values.forEach(row => {
    const fp = cleanText_(row[0]);
    if (fp) set.add(fp);
  });

  return set;
}

function makeLedgerRow_(item) {
  return [
    item.fingerprint,
    nowJstIso_(),
    item.url,
    item.sourceType,
    item.title
  ];
}

function appendLedgerRows_(rows) {
  if (!rows || !rows.length) return;
  const sheet = getOrCreateLedgerSheet_();
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, OCOS.LEDGER_HEADERS.length).setValues(rows);
}

/**
 * v1.0等で既にINBOXへ入れたものをLedgerに移す。
 * setupCrawlerV11から自動実行される。何度実行しても重複しない。
 */
function backfillLedgerFromInbox() {
  const inbox = loadExistingInboxFingerprints_();
  const ledger = loadLedgerFingerprints_();
  const rows = [];

  inbox.forEach(fp => {
    if (ledger.has(fp)) return;
    rows.push([fp, nowJstIso_(), '', 'BACKFILL', 'INBOXから移植']);
  });

  appendLedgerRows_(rows);
  console.log(`Ledger backfill from INBOX: ${rows.length}`);
}

function loadSeenFingerprints_() {
  const ledger = loadLedgerFingerprints_();
  const inbox = loadExistingInboxFingerprints_();
  inbox.forEach(fp => ledger.add(fp));
  return ledger;
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
  const properties = {
    Inbox_Title: notionTitle_(item.title),
    URL: { url: item.url },
    Detected_At: { date: { start: nowJstIso_() } },
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

  notionRequest_('/v1/pages', 'post', {
    parent: {
      type: 'data_source_id',
      data_source_id: OCOS.NOTION_INBOX_DATA_SOURCE_ID
    },
    properties
  });
}

function notionRequest_(path, method, body) {
  const token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) throw new Error('NOTION_TOKEN is not set in Script Properties.');

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
    const res = UrlFetchApp.fetch(`https://api.notion.com${path}`, options);
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

    if (code >= 200 && code < 300) return res.getContentText();

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
  return cleanText_(decodeBasicEntities_(String(html || '').replace(/<[^>]+>/g, ' ')));
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

  // 追跡系パラメータのみ除去。dy/pageなど意味のあるものは残す。
  s = s.replace(/([?&])(utm_[^=&]+|source|ima)=[^&#]*/gi, '$1');
  s = s.replace('?&', '?').replace(/&&+/g, '&');
  s = s.replace(/[?&]+$/, '');
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
    throw new Error('Cheerio library が見つかりません。GASプロジェクトにCheerioを追加してください。');
  }
}

function migrateGoogleNewsFingerprintLedgerV112() {
  validateBaseConfig_();

  const ledger = loadLedgerFingerprints_();

  let cursor = null;
  let scanned = 0;
  let added = 0;

  const rows = [];

  do {
    const body = {
      page_size: 100
    };

    if (cursor) {
      body.start_cursor = cursor;
    }

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {

      const props = page.properties || {};

      const url =
        props.URL &&
        props.URL.url
          ? props.URL.url
          : '';

      if (!isGoogleNewsUrl_(url)) {
        return;
      }

      const title =
        notionPropertyPlainText_(
          props.Inbox_Title
        );

      const publisher =
        notionPropertyPlainText_(
          props.Publisher
        );

      const snippet =
        notionPropertyPlainText_(
          props.Detected_Snippet
        );

      const publishedAt =
        props.Published_At &&
        props.Published_At.date &&
        props.Published_At.date.start
          ? props.Published_At.date.start
          : null;

      if (!title) {
        return;
      }

      const sourceHomepage =
        extractGoogleNewsSourceHomepage_(
          snippet
        );

      scanned++;

      const item = normalizeCandidate_({
        title,
        url,
        publishedAt,
        eventDateHint: null,
        publisher,
        sourceHomepage,
        sourceClass: '未判定',
        sourceType: '記事',
        snippet
      });

      if (!item) {
        return;
      }

      if (ledger.has(item.fingerprint)) {
        return;
      }

      ledger.add(item.fingerprint);

      rows.push([
        item.fingerprint,
        nowJstIso_(),
        url,
        '記事',
        `[v1.1.2 MIGRATION] ${title}`
      ]);

      added++;
    });

    cursor =
      result.has_more
        ? result.next_cursor
        : null;

  } while (cursor);

  appendLedgerRows_(rows);

  console.log(
    `v1.1.2 migration finished. ` +
    `scanned=${scanned}, ` +
    `added=${added}`
  );
}


/**
 * Detected_Snippet:
 *
 * Google News経由 /
 * 発行元: ○○ /
 * https://example.com
 *
 * から配信元URLを取得。
 */
function extractGoogleNewsSourceHomepage_(
  snippet
) {
  const s = cleanText_(snippet || '');

  const matches =
    s.match(/https?:\/\/[^\s/]+(?:\/)?/g);

  if (!matches || !matches.length) {
    return '';
  }

  return matches[matches.length - 1];
}


function notionPropertyPlainText_(prop) {
  if (!prop) return '';

  const parts =
    prop.title ||
    prop.rich_text ||
    [];

  return parts
    .map(x => {
      if (x.plain_text) {
        return x.plain_text;
      }

      if (
        x.text &&
        x.text.content
      ) {
        return x.text.content;
      }

      return '';
    })
    .join('');
}

function debugGoogleNewsOriginalUrlResolution() {
  const urls = [
    'https://news.google.com/rss/articles/CBMiWkFVX3lxTE9yZEZZTEVBbE1pbFR6WXNFOGR6NzhKa3IzX1VSLVRwUXNvY2t0OGpxcXY5TXN0RnNVcTl6RmdiZkdfVGlkUjlBUmVaWFR3OHdMc1drYUZ3Y19yUQ?oc=5',

    'https://news.google.com/rss/articles/CBMiWkFVX3lxTE8xWnROUU1ZVzJkbkZjN3FZN2xmRlNVT0hzaGNBOVhSOUxzN0ZZOEFHdmtYNjgxNk5KeG1nWGJiQjRnQnVjTXh1RWZ5US1FeDhza1h5ZFI3dFdqQQ?oc=5'
  ];

  urls.forEach((url, i) => {
    console.log(`===== SAMPLE ${i + 1} =====`);

    try {
      const resolved =
        resolveGoogleNewsOriginalUrlDebug_(url);

      console.log(`google=${url}`);
      console.log(`resolved=${resolved}`);

    } catch (e) {
      console.error(
        `FAILED: ${e.stack || e}`
      );
    }
  });
}


function resolveGoogleNewsOriginalUrlDebug_(googleNewsUrl) {
  const idMatch =
    String(googleNewsUrl).match(
      /\/articles\/([^?&#/]+)/
    );

  if (!idMatch) {
    throw new Error(
      'Google News article ID not found.'
    );
  }

  const articleId = idMatch[1];

  // 1. Google Newsの記事ページを取得
  
 const articlePageUrl =
  `https://news.google.com/rss/articles/${articleId}` +
  `?hl=ja&gl=JP&ceid=JP:ja`;

  const pageResponse =
    UrlFetchApp.fetch(
      articlePageUrl,
      {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          'User-Agent': OCOS.HTTP_USER_AGENT,
          'Accept-Language': 'ja,en;q=0.8'
        }
      }
    );

  const pageCode =
    pageResponse.getResponseCode();

  console.log(
    `article page code=${pageCode}`
  );

  if (
    pageCode < 200 ||
    pageCode >= 300
  ) {
    throw new Error(
      `Google News page HTTP ${pageCode}`
    );
  }

  const html =
    pageResponse.getContentText();

  const sgMatch =
    html.match(
      /data-n-a-sg="([^"]+)"/
    );

  const tsMatch =
    html.match(
      /data-n-a-ts="([^"]+)"/
    );

  if (!sgMatch || !tsMatch) {
    throw new Error(
      'data-n-a-sg / data-n-a-ts not found.'
    );
  }

  const signature =
    decodeHtmlAttributeDebug_(sgMatch[1]);

  const timestamp =
    tsMatch[1];

  console.log(
    `signature found=${Boolean(signature)}`
  );

  console.log(
    `timestamp=${timestamp}`
  );

  // 2. batchexecute用の内部リクエスト
  const innerRequest = [
    'garturlreq',
    [
      [
        'X',
        'X',
        ['X', 'X'],
        null,
        null,
        1,
        1,
        'US:en',
        null,
        1,
        null,
        null,
        null,
        null,
        null,
        0,
        1
      ],
      'X',
      'X',
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0
    ],
    articleId,
    Number(timestamp),
    signature
  ];

  const rpcRequest = [
    'Fbv4je',
    JSON.stringify(innerRequest),
    null,
    'generic'
  ];

  const batchResponse =
    UrlFetchApp.fetch(
      'https://news.google.com/_/DotsSplashUi/data/batchexecute',
      {
        method: 'post',
        muteHttpExceptions: true,
        contentType:
          'application/x-www-form-urlencoded;charset=UTF-8',

        payload: {
          'f.req':
            JSON.stringify([
              [rpcRequest]
            ])
        },

        headers: {
          'User-Agent': OCOS.HTTP_USER_AGENT,
          'Referer': 'https://news.google.com/'
        }
      }
    );

  const batchCode =
    batchResponse.getResponseCode();

  console.log(
    `batchexecute code=${batchCode}`
  );

  const text =
    batchResponse.getContentText();

  if (
    batchCode < 200 ||
    batchCode >= 300
  ) {
    console.log(
      text.slice(0, 1000)
    );

    throw new Error(
      `batchexecute HTTP ${batchCode}`
    );
  }

  const resolved =
    parseGoogleNewsBatchResponseDebug_(text);

  if (!resolved) {
    console.log(
      `batchexecute body=${text.slice(0, 1500)}`
    );

    throw new Error(
      'Original article URL not found in batchexecute response.'
    );
  }

  return resolved;
}


function parseGoogleNewsBatchResponseDebug_(text) {
  const parts =
    String(text)
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

  for (const part of parts) {

    if (!part.startsWith('[')) {
      continue;
    }

    let outer;

    try {
      outer = JSON.parse(part);
    } catch (e) {
      continue;
    }

    if (!Array.isArray(outer)) {
      continue;
    }

    for (const row of outer) {

      if (
        !Array.isArray(row) ||
        row.length < 3 ||
        typeof row[2] !== 'string'
      ) {
        continue;
      }

      try {
        const inner =
          JSON.parse(row[2]);

        if (
          Array.isArray(inner) &&
          inner[0] === 'garturlres' &&
          typeof inner[1] === 'string'
        ) {
          return inner[1];
        }

      } catch (e) {
        // 次の行へ
      }
    }
  }

  return '';
}


function decodeHtmlAttributeDebug_(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function previewNewCandidatesAgainstLedger() {
  const collectors = fullCollectors_();
  let all = [];

  collectors.forEach(fn => {
    try {
      const raw = fn() || [];
      all = all.concat(raw);
    } catch (e) {
      console.error(
        `${fn.name}: ERROR ${e.stack || e}`
      );
    }
  });

  const normalized =
    normalizeAndDeduplicateCandidates_(all);

  console.log(
    `TOTAL UNIQUE = ${normalized.length}`
  );

  // Ledger + 現在INBOXに存在するFingerprint
  const seen =
    loadSeenFingerprints_();

  const newItems =
    normalized.filter(
      x => !seen.has(x.fingerprint)
    );

  const counts = {};

  newItems.forEach(x => {
    counts[x.sourceType] =
      (counts[x.sourceType] || 0) + 1;
  });

  console.log(
    '-------------------------'
  );

  console.log(
    `NEW AFTER LEDGER = ${newItems.length}`
  );

  Object.keys(counts)
    .sort()
    .forEach(type => {
      console.log(
        `${type}: ${counts[type]}`
      );
    });

  console.log(
    '-------------------------'
  );

  newItems
    .slice(0, 50)
    .forEach((x, i) => {
      console.log(
        `${i + 1}. ` +
        `[${x.sourceType}] ` +
        `${x.title} | ` +
        `${x.publisher} | ` +
        `pub=${x.publishedAt || '-'} | ` +
        `${x.url}`
      );
    });
