/**
 * OC-OS Crawler Current - Production Runtime
 * Generated from the verified crawler implementation lineage.
 *
 * Runtime policy:
 * - This file is self-contained for the Crawler responsibility.
 * - No older crawler file is required in the Apps Script project.
 * - Only Current public entry points and Current trigger handlers are shipped.
 * - Historical source versions remain in GitHub, not in Production Runtime.
 * - Human editorial judgement is unchanged; this component only discovers and
 *   records candidate information through the established INBOX workflow.
 */
const OCOS = Object.freeze({
  BASE_URL: 'https://www.hinatazaka46.com',

  // Notion INBOX data source
  NOTION_INBOX_DATA_SOURCE_ID: '7e3a247d-8d7b-4ed7-a4b1-cfac6ec45f16',
  NOTION_VERSION: '2026-03-11',

  TIMEZONE: 'Asia/Tokyo',

  // 公式サイトの探索範囲
  NEWS_MONTH_OFFSETS: [-1, 0],
  BLOG_PAGES_TO_SCAN: 3,
  SCHEDULE_MONTH_OFFSETS: [-1, 0, 1, 2, 3, 4, 5, 6],

  // Google Newsは「直近情報を拾うセンサー」として使う。
  GOOGLE_NEWS_WINDOW: '7d',
  GOOGLE_NEWS_MEMBER_CHUNK_SIZE: 7,

  // ArticleKeyはGoogle Newsの公開時刻揺れ対策専用。
  // 永久重複判定にはせず、検索窓7日の2倍だけ既出扱いする。
  GOOGLE_NEWS_ARTICLE_KEY_TTL_DAYS: 14,

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

  // Google News人物検索はHHA MEMBERSを唯一の人物マスターとして動的生成する。
  // v1.2.0の運用範囲を維持するため、0期卒業者と活動辞退者は既定では対象外。
  HHA_MEMBERS_DATA_SOURCE_ID: 'df86e0ba-5478-4fc6-b30a-49cb1bd6c83d',
  GOOGLE_NEWS_INCLUDE_ZERO_GEN_GRADUATED: false,
  GOOGLE_NEWS_INCLUDE_WITHDRAWN_MEMBERS: false,

  HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; OhisamaConnectCrawler/current-2026-10-04)',
  HTTP_MAX_RETRIES: 4,
  NOTION_WRITE_INTERVAL_MS: 380,

  // GASは1実行6分制限があるため、少し手前で自主停止する。
  RUN_SOFT_LIMIT_MS: 4.5 * 60 * 1000,
  MAX_CREATE_FREQUENT: 80,
  MAX_CREATE_SCHEDULE: 100,
  MAX_CREATE_DAILY: 100,
  MAX_CREATE_FULL: 120,

  LEDGER_PROPERTY_KEY: 'CRAWLER_LEDGER_SPREADSHEET_ID',
  LEDGER_SPREADSHEET_NAME: 'おひさまコネクト_CRAWLER_LEDGER',
  LEDGER_SHEET_NAME: 'CRAWLER_LEDGER',

  DRIVE_FOLDER_NAME: 'OC-OS',
  DRIVE_FOLDER_PROPERTY_KEY: 'OCOS_DRIVE_FOLDER_ID',

  LEDGER_FLUSH_EVERY: 20,
  LEDGER_HEADERS: [
    'Fingerprint',
    'First_Detected',
    'URL',
    'Source_Type',
    'Title',
    'Collector',
    'Publisher_Host',
    'Discovery_Terms'
  ]
});


// ============================================================
// 初期セットアップ
// ============================================================

/**
 * 初回に1回実行する。
 * 既存INBOXをLedgerへ移す動作を含むため、
 * 「完全ゼロから再構築」する場合は、ゼロリセット後に実行すること。
 */

const OCOS_CRAWLER_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  ENGINE: 'stable-source + structured-revision-chain',
  TARGET_COLLECTORS: [
    'official-news',
    'official-blog',
    'official-youtube'
  ],
  REVISION_SNIPPET_PREFIX: '[SOURCE_REVISION_CANDIDATE] ',
  OBSERVATION_NORMAL: 'NORMAL',
  OBSERVATION_REVISION: 'SOURCE_REVISION',
  WRITE_INTERVAL_MS: 380,
  MAX_CHAIN_AUDIT_ROWS: 1000
});

// ============================================================
// CURRENT BASE CORE
// ============================================================

function fullCollectors_() {
  return [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialSchedule_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_,
    collectGoogleNewsCurrentMembers_,
    collectGoogleNewsGraduatedMembers_
  ];
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

      const publishedAt = parseJapaneseDate_(dateText);
      const eventDateHint = extractExplicitEventDateHint_(title, publishedAt);

      out.push({
        title,
        url: absoluteUrl_(href, OCOS.BASE_URL),
        publishedAt,
        eventDateHint,
        publisher: '日向坂46公式',
        publisherHost: 'hinatazaka46.com',
        sourceClass: '日向坂46公式',
        sourceType: 'NEWS',
        collector: 'official-news',
        discoveryTerms: '',
        snippet: category
          ? `公式NEWS / カテゴリ: ${category}`
          : '日向坂46公式NEWS'
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

      const member = cleanText_(
        $el.find('.c-blog-article__name').first().text()
      );

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
        title: member
          ? `[ブログ] ${member}: ${blogTitle}`
          : `[ブログ] ${blogTitle}`,
        url: absoluteUrl_(href, OCOS.BASE_URL),
        publishedAt: parseJapaneseDate_(dateText),
        eventDateHint: null,
        publisher: member || '日向坂46公式',
        publisherHost: 'hinatazaka46.com',
        sourceClass: '日向坂46公式',
        sourceType: 'ブログ',
        collector: 'official-blog',
        discoveryTerms: member || '',
        snippet: member
          ? `日向坂46公式ブログ / 投稿者: ${member}`
          : '日向坂46公式ブログ'
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
  const scheduleItems = [];

  OCOS.SCHEDULE_MONTH_OFFSETS.forEach(offset => {
    const d = firstDayByOffset_(offset);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const yyyymm = `${year}${String(month).padStart(2, '0')}`;

    const scheduleUrl =
      `${OCOS.BASE_URL}/s/official/media/list?ima=0000&dy=${yyyymm}`;

    const html = fetchText_(scheduleUrl);
    if (!html) return;

    const domItems = parseScheduleMonthWithCheerio_(
      html,
      scheduleUrl,
      year,
      month
    );

    if (domItems.length) {
      scheduleItems.push.apply(scheduleItems, domItems);
    } else {
      console.warn(`SCHEDULE DOM parse returned 0; regex fallback: ${yyyymm}`);

      scheduleItems.push.apply(
        scheduleItems,
        parseScheduleMonthWithRegex_(html, scheduleUrl, year, month)
      );
    }
  });

  return expandScheduleCandidates_(scheduleItems);
}

function parseScheduleMonthWithCheerio_(html, scheduleUrl, year, month) {
  const $ = Cheerio.load(html);
  const out = [];

  $('.c-schedule__date--list').each((_, dateEl) => {
    const dayText = cleanText_($(dateEl).find('span').first().text());
    const dayMatch = dayText.match(/\d{1,2}/);

    if (!dayMatch) return;

    const day = Number(dayMatch[0]);

    let $list = $(dateEl).nextAll('ul.p-schedule__list').first();

    if (!$list || !$list.length) {
      $list = $(dateEl).parent().children('ul.p-schedule__list').first();
    }

    if (!$list || !$list.length) return;

    $list.find('li.p-schedule__item').each((__, itemEl) => {
      const item = parseScheduleItemCheerio_(
        $,
        $(itemEl),
        scheduleUrl,
        year,
        month,
        day
      );

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

  const eventDate =
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return buildScheduleCandidate_(
    scheduleUrl,
    relatedLink,
    eventDate,
    category,
    rawTime,
    rawTitle
  );
}

function parseScheduleMonthWithRegex_(html, scheduleUrl, year, month) {
  const out = [];

  const dayBlockRegex =
    /<div class="c-schedule__date--list">[\s\S]*?<span>(\d+)<\/span>[\s\S]*?<\/div>[\s\S]*?<ul class="p-schedule__list[\s\S]*?<\/ul>/g;

  let dayMatch;

  while ((dayMatch = dayBlockRegex.exec(html)) !== null) {
    const day = Number(dayMatch[1]);
    const listHtml = dayMatch[0];
    const itemRegex = /<li class="p-schedule__item">([\s\S]*?)<\/li>/g;

    let itemMatch;

    while ((itemMatch = itemRegex.exec(listHtml)) !== null) {
      const content = itemMatch[1];

      const titleMatch = content.match(
        /class="[^"]*schedule__text[^"]*"[^>]*>([\s\S]*?)<\/p>/
      );

      if (!titleMatch) continue;

      const rawTitle = stripHtml_(titleMatch[1]);
      if (!rawTitle) continue;

      const categoryMatch = content.match(
        /class="[^"]*c-schedule__category[^"]*"[^>]*>([\s\S]*?)<\/div>/
      );

      const category = categoryMatch
        ? stripHtml_(categoryMatch[1])
        : 'その他';

      const timeMatch = content.match(
        /class="[^"]*c-schedule__time--list[^"]*"[^>]*>([\s\S]*?)<\/div>/
      );

      const rawTime = timeMatch ? stripHtml_(timeMatch[1]) : '';

      const linkMatch = content.match(/href="([^"]+)"/);
      const relatedLink = linkMatch
        ? absoluteUrl_(linkMatch[1], OCOS.BASE_URL)
        : '';

      const eventDate =
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      out.push(
        buildScheduleCandidate_(
          scheduleUrl,
          relatedLink,
          eventDate,
          category,
          rawTime,
          rawTitle
        )
      );
    }
  }

  return out;
}

function buildScheduleCandidate_(
  scheduleUrl,
  relatedLink,
  eventDate,
  category,
  rawTime,
  rawTitle
) {
  let title = `[SCHEDULE:${category}] ${rawTitle}`;
  if (rawTime) title += ` (${rawTime})`;

  const snippetParts = [
    '公式SCHEDULE',
    `カテゴリ: ${category}`
  ];

  if (rawTime) {
    snippetParts.push(`時刻: ${rawTime}`);
  }

  if (relatedLink && relatedLink !== scheduleUrl) {
    snippetParts.push(`関連リンク: ${relatedLink}`);
  }

  return {
    title,
    url: scheduleUrl,
    publishedAt: null,
    eventDateHint: eventDate,
    publisher: '日向坂46公式',
    publisherHost: 'hinatazaka46.com',
    sourceClass: '日向坂46公式',
    sourceType: 'SCHEDULE',
    collector: 'official-schedule',
    discoveryTerms: category || '',
    relatedUrl: relatedLink || '',
    scheduleCategory: category || '',
    snippet: snippetParts.join(' / ')
  };
}

/**
 * 公式SCHEDULEの外部リンクを関係者一次情報候補として別レコード化する。
 * 公式側のSCHEDULEレコードはそのまま残す。
 */
function expandScheduleCandidates_(items) {
  const out = (items || []).slice();

  (items || []).forEach(item => {
    const relatedUrl = cleanText_(item.relatedUrl || '');
    if (!relatedUrl) return;

    const host = hostnameFromUrl_(relatedUrl);
    if (!host) return;

    // 日向坂46公式内リンクは別レコード化しない。
    if (/(^|\.)hinatazaka46\.com$/i.test(host)) return;

    out.push({
      title: `[関係者一次候補] ${item.title}`,
      url: relatedUrl,
      publishedAt: null,
      eventDateHint: item.eventDateHint || null,
      publisher: host,
      publisherHost: host,
      sourceClass: '関係者一次',
      sourceType: inferRelatedSourceType_(host, item.scheduleCategory),
      collector: 'schedule-related',
      discoveryTerms: item.scheduleCategory || '',
      snippet:
        `日向坂46公式SCHEDULEに掲載された関連一次リンク / ${item.title}`
    });
  });

  return out;
}

function inferRelatedSourceType_(host, category) {
  const h = String(host || '').toLowerCase();
  const c = cleanText_(category || '');

  if (h === 'x.com' || h === 'twitter.com') {
    return 'X';
  }

  if (h === 'instagram.com') {
    return 'Instagram';
  }

  if (
    h === 'youtube.com' ||
    h === 'youtu.be' ||
    h.endsWith('.youtube.com')
  ) {
    return 'YouTube';
  }

  if (/テレビ|tv|ラジオ|radio|配信|stream/i.test(c)) {
    return '番組公式';
  }

  return 'その他';
}


// ============================================================
// Collector D: 公式YouTube
// ============================================================

function collectOfficialYouTube_() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty('YOUTUBE_API_KEY');

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

      const uploadsId =
        channelData.items[0].contentDetails.relatedPlaylists.uploads;

      const officialName =
        channelData.items[0].snippet.title || channel.name;

      const playlist = youtubeGet_('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsId,
        maxResults: 50,
        key: apiKey
      });

      (playlist.items || []).forEach(item => {
        const snippet = item.snippet || {};
        const contentDetails = item.contentDetails || {};

        const videoId =
          contentDetails.videoId ||
          (snippet.resourceId && snippet.resourceId.videoId);

        if (!videoId) return;

        const videoTitle = snippet.title || videoId;
        const publishedAt =
          contentDetails.videoPublishedAt ||
          snippet.publishedAt ||
          null;
        const eventDateHint =
          extractExplicitEventDateHint_(videoTitle, publishedAt);

        out.push({
          title: `[YouTube] ${videoTitle}`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt,
          eventDateHint,
          publisher: officialName,
          publisherHost: 'youtube.com',
          sourceClass: '日向坂46公式',
          sourceType: 'YouTube',
          collector: 'official-youtube',
          discoveryTerms: officialName,
          snippet: truncate_(cleanText_(snippet.description || ''), 1500)
        });
      });
    } catch (err) {
      console.error(
        `YouTube channel failed (${channel.name}): ${err.stack || err}`
      );
    }
  });

  return out;
}

function youtubeGet_(resource, params) {
  const query = Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const url = `https://www.googleapis.com/youtube/v3/${resource}?${query}`;
  const text = fetchText_(url);

  return text ? JSON.parse(text) : {};
}


// ============================================================
// HHA MEMBERS -> Google News search terms
// ============================================================

let OCOS_HHA_MEMBER_SEARCH_GROUPS_CACHE_ = null;

/**
 * HHA MEMBERSを人物検索語の唯一のマスターとして使う。
 *
 * current:
 *   Activity_Status = 在籍中
 *
 * graduated:
 *   Activity_Status = 卒業
 *   ただしv1.2.0の監視範囲を維持するため、
 *   Generation = 0期 は既定で除外する。
 *
 * withdrawn:
 *   Activity_Status = 活動辞退 は既定で除外する。
 *
 * forceReload=true の場合は同一実行内キャッシュを無視する。
 */
function loadHhaMemberSearchGroups_(forceReload) {
  if (!forceReload && OCOS_HHA_MEMBER_SEARCH_GROUPS_CACHE_) {
    return OCOS_HHA_MEMBER_SEARCH_GROUPS_CACHE_;
  }

  const rows = [];
  let cursor = null;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.HHA_MEMBERS_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {
      const p = page.properties || {};

      rows.push({
        memberId: crawlerNotionText_(p.Member_ID),
        memberOrder: crawlerNotionNumber_(p.Member_Order),
        memberName: crawlerNotionTitle_(p.Member_Name),
        generation: crawlerNotionSelect_(p.Generation),
        activityStatus: crawlerNotionSelect_(p.Activity_Status)
      });
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  if (!rows.length) {
    throw new Error('HHA MEMBERSから人物データを取得できませんでした。');
  }

  rows.sort(
    (a, b) => Number(a.memberOrder || 0) - Number(b.memberOrder || 0)
  );

  const current = [];
  const graduated = [];
  const excluded = [];

  rows.forEach(row => {
    const term = normalizeMemberSearchTerm_(row.memberName);
    if (!term) {
      excluded.push(Object.assign({}, row, { reason: 'EMPTY_MEMBER_NAME' }));
      return;
    }

    if (row.activityStatus === '在籍中') {
      current.push(term);
      return;
    }

    if (row.activityStatus === '卒業') {
      if (
        row.generation === '0期' &&
        !OCOS.GOOGLE_NEWS_INCLUDE_ZERO_GEN_GRADUATED
      ) {
        excluded.push(Object.assign({}, row, {
          reason: 'ZERO_GEN_GRADUATED_EXCLUDED_BY_POLICY'
        }));
        return;
      }

      graduated.push(term);
      return;
    }

    if (row.activityStatus === '活動辞退') {
      if (OCOS.GOOGLE_NEWS_INCLUDE_WITHDRAWN_MEMBERS) {
        graduated.push(term);
      } else {
        excluded.push(Object.assign({}, row, {
          reason: 'WITHDRAWN_EXCLUDED_BY_POLICY'
        }));
      }
      return;
    }

    excluded.push(Object.assign({}, row, {
      reason: `UNHANDLED_ACTIVITY_STATUS:${row.activityStatus || 'EMPTY'}`
    }));
  });

  const groups = {
    current: Array.from(new Set(current)),
    graduated: Array.from(new Set(graduated)),
    excluded
  };

  if (!groups.current.length) {
    throw new Error(
      'HHA MEMBERS由来の在籍中Google News検索語が0件です。' +
      'Activity_StatusまたはNotion接続を確認してください。'
    );
  }

  console.log(
    `[HHA member terms] current=${groups.current.length}, ` +
    `graduated=${groups.graduated.length}, excluded=${groups.excluded.length}`
  );

  OCOS_HHA_MEMBER_SEARCH_GROUPS_CACHE_ = groups;
  return groups;
}

function normalizeMemberSearchTerm_(name) {
  let s = cleanText_(name || '');

  try {
    s = s.normalize('NFKC');
  } catch (e) {}

  // HHA Member_Nameは「金村 美玖」のように姓・名間に空白を持つ。
  // Google Newsの従来検索条件と同じ「金村美玖」形式に正規化する。
  return s.replace(/[\s\u3000]+/g, '');
}

function crawlerNotionTitle_(prop) {
  if (!prop || !Array.isArray(prop.title)) return '';

  return prop.title
    .map(x => x.plain_text || (x.text && x.text.content) || '')
    .join('');
}

function crawlerNotionText_(prop) {
  if (!prop || !Array.isArray(prop.rich_text)) return '';

  return prop.rich_text
    .map(x => x.plain_text || (x.text && x.text.content) || '')
    .join('');
}

function crawlerNotionNumber_(prop) {
  if (!prop || prop.number === null || prop.number === undefined) {
    return null;
  }

  return Number(prop.number);
}

function crawlerNotionSelect_(prop) {
  return prop && prop.select && prop.select.name
    ? prop.select.name
    : '';
}


// ============================================================
// Collector E: Google News RSS
// ============================================================

/**
 * グループ名検索。
 * 「日向坂46」という語を含む外部報道を広く拾う。
 */
function collectGoogleNewsGroup_() {
  return collectGoogleNewsQuery_(
    `日向坂46 when:${OCOS.GOOGLE_NEWS_WINDOW}`,
    ['日向坂46']
  );
}

/**
 * 現役メンバー名検索。
 * 公式側で拾えない個人仕事・インタビュー等の発見を狙う。
 */
function collectGoogleNewsCurrentMembers_() {
  const groups = loadHhaMemberSearchGroups_();

  return collectGoogleNewsMemberTerms_(
    groups.current,
    'google-news-current-member'
  );
}

function collectGoogleNewsGraduatedMembers_() {
  const groups = loadHhaMemberSearchGroups_();

  return collectGoogleNewsMemberTerms_(
    groups.graduated,
    'google-news-graduated-member'
  );
}

function collectGoogleNewsMemberTerms_(memberTerms, collectorName) {
  const out = [];
  const chunkSize = OCOS.GOOGLE_NEWS_MEMBER_CHUNK_SIZE;

  for (
    let i = 0;
    i < memberTerms.length;
    i += chunkSize
  ) {
    const chunk =
      memberTerms.slice(
        i,
        i + chunkSize
      );

    const names = chunk
      .map(name => `"${name}"`)
      .join(' OR ');

    const query =
      `(${names}) when:${OCOS.GOOGLE_NEWS_WINDOW}`;

    const items =
      collectGoogleNewsQuery_(
        query,
        chunk
      );

    items.forEach(item => {
      item.collector = collectorName;
    });

    out.push.apply(
      out,
      items
    );

    Utilities.sleep(250);
  }

  return out;
}

/**
 * Google News RSS共通取得。
 *
 * ポイント:
 * - Google NewsのURL自体は保持する。
 * - <source url=""> の発行元homepageをPublisher_Host用に保存する。
 * - 異なる媒体の記事は削除しない。
 * - 同一媒体 + 同一タイトル + 同一公開時刻はFingerprintで同一視する。
 */
function collectGoogleNewsQuery_(query, requiredTitleTerms) {
  const rssUrl =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=ja&gl=JP&ceid=JP:ja`;

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

    if (isGoogleNewsChildPageNoise_(title)) {
      return;
    }

    if (requiredTitleTerms && requiredTitleTerms.length > 1) {
      const matched = requiredTitleTerms.some(term => title.includes(term));
      if (!matched) return;
    }

    const sourceEl = item.getChild('source');

    const publisher = sourceEl
      ? cleanText_(sourceEl.getText())
      : 'Google News';

    const sourceHomepage =
      sourceEl && sourceEl.getAttribute('url')
        ? sourceEl.getAttribute('url').getValue()
        : '';

    const publisherHost = hostnameFromUrl_(sourceHomepage);

    const matchedTerms = (requiredTitleTerms || [])
      .filter(term => title.includes(term));

    out.push({
      title,
      url: link,
      publishedAt: parseRfcDate_(pubDate),
      eventDateHint: null,
      publisher,
      publisherHost,
      sourceHomepage,
      sourceClass: '未判定',
      sourceType: '記事',
      collector: 'google-news',
      discoveryTerms: matchedTerms.length
        ? matchedTerms.join(', ')
        : (requiredTitleTerms || []).join(', '),
      snippet: sourceHomepage
        ? `Google News coverage sensor / 発行元: ${publisher} / ${sourceHomepage}`
        : `Google News coverage sensor / 発行元: ${publisher}`
    });
  });

  return out;
}

/**
 * 「外部媒体に記事が存在する」という観測価値がない、
 * 画像・写真・コメント等の子ページだけを除外する。
 */
function isGoogleNewsChildPageNoise_(title) {
  let s = cleanText_(title || '');

  try {
    s = s.normalize('NFKC');
  } catch (e) {}

  return (
    /^画像・写真(?:\s*[|｜]|\s+)/i.test(s) ||
    /^【(?:画像|写真|写真・画像)】/i.test(s) ||
    /^\(写真\)/i.test(s) ||
    /^\(画像\s*\d+\s*\/\s*\d+\)/i.test(s) ||
    /^関連写真(?:\s*[|｜]|\s+)/i.test(s) ||
    /^関連画像(?:\s*[|｜]|\s+|$)/i.test(s) ||
    /\[画像ギャラリー\s*\d+\s*\/\s*\d+\]/i.test(s) ||
    /画像一覧\s*\(\d+\s*\/\s*\d+\)/i.test(s) ||
    /\s\d+枚目\s*-\s*/i.test(s) ||
    /\(写真・画像\s*\d+\s*\/\s*\d+\)/i.test(s) ||
    /^画像\s*\d+\s*\/\s*\d+\s*[>＞]/i.test(s) ||
    /\d+枚目の写真・画像/i.test(s) ||
    /^📸\s*画像\s*[:：]/i.test(s) ||
    /^コメント\s*[|｜]/i.test(s)
  );
}


// ============================================================
// Normalize / fingerprint / dedup
// ============================================================

function normalizeAndDeduplicateCandidates_(items) {
  const map = new Map();
  const googleNewsArticleKeys = new Set();

  (items || []).forEach(raw => {
    const item = normalizeCandidate_(raw);

    if (!item) return;

    const articleKey = makeGoogleNewsArticleKey_(item);

    if (articleKey && googleNewsArticleKeys.has(articleKey)) {
      return;
    }

    if (map.has(item.fingerprint)) {
      return;
    }

    if (articleKey) {
      googleNewsArticleKeys.add(articleKey);
    }

    map.set(item.fingerprint, item);
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

    collector: truncate_(cleanText_(raw.collector || ''), 1900),

    publisherHost: truncate_(
      cleanText_(
        raw.publisherHost ||
        hostnameFromUrl_(raw.sourceHomepage || raw.url || '')
      ),
      1900
    ),

    discoveryTerms: truncate_(
      cleanText_(raw.discoveryTerms || ''),
      1900
    ),

    // Google News重複判定専用
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
    // Google News:
    // 異なる媒体は残す。
    // 同じ媒体・同じ記事が検索語違い等で出た場合だけ同一視する。
    const sourceKey = makeGoogleNewsSourceKey_(
      item.publisher,
      item.sourceHomepage
    );

    const titleKey = normalizeGoogleNewsTitleKey_(item.title);
    const publishedKey = fingerprintDateKey_(item.publishedAt);

    basis = [
      'google-news',
      sourceKey,
      titleKey,
      publishedKey
    ].join('|');
  } else {
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
      b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)
    )
    .join('');
}

function fingerprintDateKey_(value) {
  if (!value) return '';

  const s = String(value).trim();
  if (!s) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const d = new Date(s);

  if (!isNaN(d.getTime())) {
    return String(Math.floor(d.getTime() / 1000));
  }

  return s.toLowerCase();
}

function isGoogleNewsUrl_(url) {
  return /^https:\/\/news\.google\.com\/rss\/articles\//i
    .test(String(url || ''));
}

function makeGoogleNewsSourceKey_(publisher, sourceHomepage) {
  const host = hostnameFromUrl_(sourceHomepage);

  if (host) return host;

  let value = cleanText_(publisher || '');

  try {
    value = value.normalize('NFKC');
  } catch (e) {}

  return value.toLowerCase();
}

function hostnameFromUrl_(url) {
  const s = cleanText_(url || '');

  const match = s.match(/^https?:\/\/([^\/?#]+)/i);
  if (!match) return '';

  return match[1]
    .toLowerCase()
    .replace(/^www\./, '');
}

function normalizeGoogleNewsTitleKey_(title) {
  let s = cleanText_(title || '');

  try {
    s = s.normalize('NFKC');
  } catch (e) {}

  // Google Newsが末尾に付ける「 - 媒体名」を除去。
  const separator = s.lastIndexOf(' - ');

  if (separator > 0) {
    s = s.slice(0, separator);
  }

  s = s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐-‒–—―]/g, '-')
    .replace(/\s+([(\[【「『])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return s.toLowerCase();
}

/**
 * v1.2.2 Google News技術重複判定キー。
 *
 * Fingerprintそのものは変更しない。
 * Google News RSSが同一記事に異なるpubDateを返した場合でも、
 * 同一媒体 + 同一正規化タイトルなら同じ記事として扱う。
 */
function makeGoogleNewsArticleKey_(item) {
  if (!item || !isGoogleNewsUrl_(item.url)) {
    return '';
  }

  const sourceKey =
    cleanText_(item.publisherHost || '').toLowerCase() ||
    makeGoogleNewsSourceKey_(
      item.publisher,
      item.sourceHomepage
    );

  const titleKey =
    normalizeGoogleNewsTitleKey_(item.title);

  if (!sourceKey || !titleKey) {
    return '';
  }

  return [
    'google-news-article',
    sourceKey,
    titleKey
  ].join('|').toLowerCase();
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

  if (folders.hasNext()) {
    throw new Error(
      `Google Driveに「${OCOS.DRIVE_FOLDER_NAME}」フォルダが複数あります。` +
      '同名フォルダを整理してください。'
    );
  }

  props.setProperty(OCOS.DRIVE_FOLDER_PROPERTY_KEY, folder.getId());
  return folder;
}

function ensureFileInOcosFolder_(fileId) {
  const folder = getOcosDriveFolder_();
  const file = DriveApp.getFileById(fileId);
  file.moveTo(folder);
}

function ensureLedgerHeader_(sheet) {
  const headers = OCOS.LEDGER_HEADERS;

  const current = sheet
    .getRange(1, 1, 1, headers.length)
    .getValues()[0];

  const same = headers.every((h, i) => current[i] === h);

  if (!same) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function loadLedgerSeenState_() {
  const sheet = getOrCreateLedgerSheet_();
  const lastRow = sheet.getLastRow();

  const state = {
    fingerprints: new Set(),
    googleNewsArticleKeys: new Set()
  };

  if (lastRow <= 1) return state;

  const values = sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      OCOS.LEDGER_HEADERS.length
    )
    .getValues();

  values.forEach(row => {
    const fingerprint = cleanText_(row[0]);
    const firstDetected = row[1];
    const url = cleanText_(row[2]);
    const title = cleanText_(row[4]);
    const publisherHost = cleanText_(row[6]);

    if (fingerprint) {
      state.fingerprints.add(fingerprint);
    }

    const articleKey = makeGoogleNewsArticleKey_({
      url,
      title,
      publisherHost
    });

    if (
      articleKey &&
      isWithinGoogleNewsArticleKeyTtl_(firstDetected)
    ) {
      state.googleNewsArticleKeys.add(articleKey);
    }
  });

  return state;
}

function loadLedgerFingerprints_() {
  return loadLedgerSeenState_().fingerprints;
}

function makeLedgerRow_(item) {
  return [
    item.fingerprint,
    nowJstIso_(),
    item.url,
    item.sourceType,
    item.title,
    item.collector || '',
    item.publisherHost || '',
    item.discoveryTerms || ''
  ];
}

function appendLedgerRows_(rows) {
  if (!rows || !rows.length) return;

  const sheet = getOrCreateLedgerSheet_();
  const startRow = sheet.getLastRow() + 1;

  sheet
    .getRange(
      startRow,
      1,
      rows.length,
      OCOS.LEDGER_HEADERS.length
    )
    .setValues(rows);
}

/**
 * INBOXに既にあるFingerprintをLedgerへ移す。
 * 完全ゼロリセット後は0件になる。
 */
function backfillLedgerFromInbox() {
  const inbox = loadExistingInboxFingerprints_();
  const ledger = loadLedgerFingerprints_();
  const rows = [];

  inbox.forEach(fp => {
    if (ledger.has(fp)) return;

    rows.push([
      fp,
      nowJstIso_(),
      '',
      'BACKFILL',
      'INBOXから移植',
      'backfill',
      '',
      ''
    ]);
  });

  appendLedgerRows_(rows);
  console.log(`Ledger backfill from INBOX: ${rows.length}`);
}

/**
 * Google News ArticleKeyの既出判定を有効にする期間。
 *
 * Fingerprintは永久履歴として残す一方、ArticleKeyは
 * 公開時刻揺れを吸収するための短期的な補助キーとしてのみ使う。
 */
function isWithinGoogleNewsArticleKeyTtl_(detectedAt) {
  if (!detectedAt) return false;

  const d = detectedAt instanceof Date
    ? detectedAt
    : new Date(String(detectedAt));

  if (isNaN(d.getTime())) {
    return false;
  }

  const ttlMs =
    OCOS.GOOGLE_NEWS_ARTICLE_KEY_TTL_DAYS *
    24 * 60 * 60 * 1000;

  const ageMs = Date.now() - d.getTime();

  // 数分程度の時計差や将来時刻は許容しつつ、
  // TTLより古いArticleKeyは既出判定に使わない。
  return ageMs <= ttlMs;
}

function loadSeenState_() {
  const ledgerState = loadLedgerSeenState_();
  const inboxState = loadExistingInboxSeenState_();

  inboxState.fingerprints.forEach(fp =>
    ledgerState.fingerprints.add(fp)
  );

  inboxState.googleNewsArticleKeys.forEach(key =>
    ledgerState.googleNewsArticleKeys.add(key)
  );

  return ledgerState;
}

function loadSeenFingerprints_() {
  return loadSeenState_().fingerprints;
}

function isAlreadySeen_(item, seenState) {
  if (!item || !seenState) return false;

  if (seenState.fingerprints.has(item.fingerprint)) {
    return true;
  }

  const articleKey = makeGoogleNewsArticleKey_(item);

  return Boolean(
    articleKey &&
    seenState.googleNewsArticleKeys.has(articleKey)
  );
}

function markSeen_(item, seenState) {
  if (!item || !seenState) return;

  seenState.fingerprints.add(item.fingerprint);

  const articleKey = makeGoogleNewsArticleKey_(item);

  if (articleKey) {
    seenState.googleNewsArticleKeys.add(articleKey);
  }
}


// ============================================================
// Notion INBOX
// ============================================================

function loadExistingInboxSeenState_() {
  const state = {
    fingerprints: new Set(),
    googleNewsArticleKeys: new Set()
  };

  let cursor = null;

  do {
    const body = { page_size: 100 };

    if (cursor) {
      body.start_cursor = cursor;
    }

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {
      const p = page.properties || {};

      const fingerprint =
        crawlerNotionText_(p.Fingerprint);

      if (fingerprint) {
        state.fingerprints.add(fingerprint);
      }

      const articleKey = makeGoogleNewsArticleKey_({
        url: p.URL && p.URL.url ? p.URL.url : '',
        title: crawlerNotionTitle_(p.Inbox_Title),
        publisherHost: crawlerNotionText_(p.Publisher_Host),
        publisher: crawlerNotionText_(p.Publisher)
      });

      const detectedAt =
        p.Detected_At &&
        p.Detected_At.date &&
        p.Detected_At.date.start
          ? p.Detected_At.date.start
          : '';

      if (
        articleKey &&
        isWithinGoogleNewsArticleKeyTtl_(detectedAt)
      ) {
        state.googleNewsArticleKeys.add(articleKey);
      }
    });

    cursor = result.has_more
      ? result.next_cursor
      : null;
  } while (cursor);

  return state;
}

function loadExistingInboxFingerprints_() {
  return loadExistingInboxSeenState_().fingerprints;
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
    Fingerprint: notionRichText_(item.fingerprint),

    // v1.2内部観測項目
    Collector: notionRichText_(item.collector || ''),
    Publisher_Host: notionRichText_(item.publisherHost || ''),
    Discovery_Terms: notionRichText_(item.discoveryTerms || '')
  };

  if (item.publishedAt) {
    properties.Published_At = {
      date: { start: item.publishedAt }
    };
  }

  if (item.eventDateHint) {
    properties.Event_Date_Hint = {
      date: { start: item.eventDateHint }
    };
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
      'Notion-Version': OCOS.NOTION_VERSION
    }
  };

  if (body !== undefined && body !== null) {
    options.payload = JSON.stringify(body);
  }

  for (let attempt = 0; attempt < OCOS.HTTP_MAX_RETRIES; attempt++) {
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
        headers['Retry-After'] ||
        headers['retry-after'] ||
        0
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

function notionTitle_(text) {
  return {
    title: [
      {
        type: 'text',
        text: {
          content: truncate_(text || '', 1900)
        }
      }
    ]
  };
}

function notionRichText_(text) {
  if (!text) {
    return { rich_text: [] };
  }

  return {
    rich_text: [
      {
        type: 'text',
        text: {
          content: truncate_(text, 1900)
        }
      }
    ]
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
      Utilities.sleep(
        Math.pow(2, attempt) * 1000 + 250
      );
      continue;
    }

    console.warn(`HTTP ${code}: ${url}`);
    return null;
  }

  console.warn(`Retry limit exceeded: ${url}`);
  return null;
}


// ============================================================
// Explicit event-date hint extraction (v1.2.6)
// ============================================================

/**
 * NEWS / YouTubeのタイトルから、意味が一意に読める開催日・時刻だけを
 * Event_Date_Hintへ補完する。
 *
 * 安全側のルール:
 *   - 「更新」表示に属する日付は除外する。
 *   - 更新日を除いた候補日が複数ある場合はnull。
 *   - 「9/5、6」のような省略複数日もnull。
 *   - 日付のみの場合は、開催/発売/放送/配信/出演/公開/収録等の
 *     明示的な出来事語が周辺にある場合だけ採用する。
 *   - 曜日表記が実日付と矛盾する場合はnull。
 *   - 年省略時はPublished_Atから前後1年を比較し、120日以内のみ採用。
 */
function extractExplicitEventDateHint_(text, publishedAt) {
  const result = analyzeExplicitEventDateHint_(text, publishedAt);
  return result.value;
}

function analyzeExplicitEventDateHint_(text, publishedAt) {
  let s = cleanText_(text || '');
  if (!s) return { value: null, reason: 'NO_TEXT' };

  try {
    s = s.normalize('NFKC');
  } catch (e) {}

  // v1.2.5:
  // 「本日18:00よりスタート」のように公開日を基準にできる
  // 明示表現がある場合は、タイトル中の公演日・発売日より優先する。
  const todayAction = extractPublishedDayActionHint_(s, publishedAt);
  if (todayAction) {
    return { value: todayAction, reason: 'OK_PUBLISHED_DAY_ACTION' };
  }

  const re = new RegExp(
    '(?:(\\d{4})\\s*(?:年|[\\/\\.\\-])\\s*)?' +
    '(\\d{1,2})\\s*(?:月|[\\/\\.\\-])\\s*' +
    '(\\d{1,2})(?:\\s*日)?' +
    '(?:\\s*[（(]([日月火水木金土])(?:曜)?[）)])?' +
    '(?:\\s*(\\d{1,2})\\s*[:：]\\s*(\\d{2}))?',
    'g'
  );

  const rawCandidates = [];
  let m;

  while ((m = re.exec(s)) !== null) {
    const candidate = {
      index: m.index,
      end: re.lastIndex,
      raw: m[0],
      explicitYear: m[1] ? Number(m[1]) : null,
      month: Number(m[2]),
      day: Number(m[3]),
      weekday: m[4] || '',
      hour: m[5] !== undefined ? Number(m[5]) : null,
      minute: m[6] !== undefined ? Number(m[6]) : null
    };

    if (candidate.month < 1 || candidate.month > 12) continue;
    if (candidate.day < 1 || candidate.day > 31) continue;

    if (isUpdateDateCandidate_(s, candidate)) {
      continue;
    }

    rawCandidates.push(candidate);
  }

  if (!rawCandidates.length) {
    return { value: null, reason: 'NO_SAFE_DATE' };
  }

  const candidates = dedupeDateCandidates_(rawCandidates);

  if (candidates.length !== 1) {
    return { value: null, reason: 'MULTIPLE_DATES' };
  }

  const c = candidates[0];

  // v1.2.6:
  // 「生配信が決定！8/16 12:00よりチケット販売開始」のように、
  // 見出し前半の主イベントと、日時が掛かる後半アクションが別なら
  // EVENTの日時としては自動採用しない。
  if (hasMixedPrimaryAndSecondaryAction_(s, c)) {
    return { value: null, reason: 'MIXED_ACTIONS' };
  }

  if (hasAdjacentShorthandDate_(s, c)) {
    return { value: null, reason: 'MULTI_DAY_SHORTHAND' };
  }

  let year = c.explicitYear;
  if (!year) {
    year = resolveImplicitEventYear_(c.month, c.day, publishedAt);
    if (!year) return { value: null, reason: 'YEAR_UNRESOLVED' };
  }

  if (!isValidYmd_(year, c.month, c.day)) {
    return { value: null, reason: 'INVALID_DATE' };
  }

  if (c.weekday && !isWeekdayConsistent_(year, c.month, c.day, c.weekday)) {
    return { value: null, reason: 'WEEKDAY_MISMATCH' };
  }

  const hasTime = c.hour !== null && c.minute !== null;

  if (!hasTime && !hasStrongDateOnlyContext_(s, c)) {
    return { value: null, reason: 'DATE_ONLY_WEAK_CONTEXT' };
  }

  const y = String(year).padStart(4, '0');
  const mo = String(c.month).padStart(2, '0');
  const d = String(c.day).padStart(2, '0');

  if (!hasTime) {
    return { value: y + '-' + mo + '-' + d, reason: 'OK_DATE' };
  }

  if (c.hour < 0 || c.hour > 23 || c.minute < 0 || c.minute > 59) {
    return { value: null, reason: 'INVALID_TIME' };
  }

  return {
    value:
      y + '-' + mo + '-' + d + 'T' +
      String(c.hour).padStart(2, '0') + ':' +
      String(c.minute).padStart(2, '0') + ':00+09:00',
    reason: 'OK_DATETIME'
  };
}

function extractPublishedDayActionHint_(text, publishedAt) {
  if (!publishedAt) return null;

  const d = new Date(String(publishedAt));
  if (isNaN(d.getTime())) return null;

  const m = text.match(
    /本日\s*(\d{1,2})\s*[:：]\s*(\d{2})(?:\s*(?:より|から))?/i
  );

  if (!m) return null;

  const hour = Number(m[1]);
  const minute = Number(m[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  const tail = text.slice(
    m.index + m[0].length,
    Math.min(text.length, m.index + m[0].length + 48)
  );

  if (!/スタート|開始|再開|受付|販売|公開|配信|放送|発売|出演|開催|実施/.test(tail)) {
    return null;
  }

  const datePart = Utilities.formatDate(
    d,
    OCOS.TIMEZONE,
    'yyyy-MM-dd'
  );

  return (
    datePart + 'T' +
    String(hour).padStart(2, '0') + ':' +
    String(minute).padStart(2, '0') + ':00+09:00'
  );
}

function isUpdateDateCandidate_(text, candidate) {
  const before = text.slice(Math.max(0, candidate.index - 8), candidate.index);
  const after = text.slice(candidate.end, Math.min(text.length, candidate.end + 10));
  const around = before + candidate.raw + after;

  return /更新/.test(around);
}

function dedupeDateCandidates_(items) {
  const map = new Map();

  (items || []).forEach(c => {
    const key = [
      c.explicitYear || '',
      c.month,
      c.day,
      c.hour === null ? '' : c.hour,
      c.minute === null ? '' : c.minute
    ].join('|');

    if (!map.has(key)) map.set(key, c);
  });

  return Array.from(map.values());
}

function hasMixedPrimaryAndSecondaryAction_(text, candidate) {
  const before = text.slice(0, candidate.index);
  const after = text.slice(candidate.end);

  const primaryDecisionBefore =
    /(?:生配信|ライブ|LIVE|出演|開催|公開|放送|リリース)[^。！？!]{0,80}(?:決定|発表)[！!。]?/.test(before);

  const secondaryActionAfter =
    /(?:チケット|視聴チケット|トレード|先行|受付|販売)[^。！？!]{0,60}(?:スタート|開始|再開|受付|販売)/.test(after);

  return primaryDecisionBefore && secondaryActionAfter;
}

function hasAdjacentShorthandDate_(text, candidate) {
  const after = text.slice(candidate.end, Math.min(text.length, candidate.end + 18));

  return (
    /^[\s]*[、・／\/〜~～-][\s]*(?:\d{1,2}\s*(?:月|[\/\.\-])\s*)?\d{1,2}\s*(?:日|[（(])/.test(after) ||
    /^[\s]*[、・][\s]*\d{1,2}\s*日/.test(after)
  );
}

function hasStrongDateOnlyContext_(text, candidate) {
  const before = text.slice(Math.max(0, candidate.index - 24), candidate.index);
  const after = text.slice(candidate.end, Math.min(text.length, candidate.end + 90));
  const context = before + ' ' + after;

  return /開催|発売|放送|配信|生配信|出演|生出演|公開|収録|実施|開幕|リリース|開始|スタート/.test(context);
}

function isWeekdayConsistent_(year, month, day, weekday) {
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(Date.UTC(year, month - 1, day));

  return labels[d.getUTCDay()] === weekday;
}

function resolveImplicitEventYear_(month, day, publishedAt) {
  if (!publishedAt) return null;

  const published = new Date(String(publishedAt));
  if (isNaN(published.getTime())) return null;

  const publishedYear = Number(
    Utilities.formatDate(published, OCOS.TIMEZONE, 'yyyy')
  );

  const candidates = [publishedYear - 1, publishedYear, publishedYear + 1]
    .filter(year => isValidYmd_(year, month, day))
    .map(year => ({
      year,
      distanceMs: Math.abs(
        Date.UTC(year, month - 1, day, 12, 0, 0) -
        published.getTime()
      )
    }))
    .sort((a, b) => a.distanceMs - b.distanceMs);

  if (!candidates.length) return null;

  const maxDistanceMs = 120 * 24 * 60 * 60 * 1000;

  return candidates[0].distanceMs <= maxDistanceMs
    ? candidates[0].year
    : null;
}

function isValidYmd_(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));

  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * v1.2.4 回帰テスト。書き込みなし。
 */
function testV126EventDateHintExamples() {
  const cases = [
    ['今回', '9/26(土)22:00〜「日向坂ちゃんねる」にて生配信', '2026-09-23', '2026-09-26T22:00:00+09:00'],
    ['更新日除外', '※8/15(土)更新※「イベント」出演決定！', '2026-08-15', null],
    ['更新日除外2', '※【9/10(木)更新】払戻しのご案内', '2026-09-03', null],
    ['複数日＋本日優先', '三期生 LIVE 8/17・8/18 東京公演のトレードが本日18:00よりスタート！', '2026-08-10', '2026-08-10T18:00:00+09:00'],
    ['省略複数日', '清水理央 9月5日(土)、6日(日) LIVE出演に関するお知らせ', '2026-08-27', null],
    ['開催日', '2026年11月28日(土) 開催のGIFTに出演決定！', '2026-08-18', '2026-11-28'],
    ['発売日', '9月24日(木)発売の雑誌に登場！', '2026-09-22', '2026-09-24'],
    ['曜日矛盾', '9月23日(金)8:30〜ラジオに出演！', '2026-09-21', null],
    ['本日優先', '「三期生 LIVE」8/23 東京公演の公式チケット・トレードが本日18:00よりスタート！', '2026-08-14', '2026-08-14T18:00:00+09:00'],
    ['本日表現だが公開日なし', '「三期生 LIVE」8/17・8/18 東京公演の公式チケット・トレードが本日18:00よりスタート！', null, null],
    ['混在:生配信決定＋チケット販売', '「三期生 LIVE」の生配信が決定！8月16日(日)12:00より、配信視聴チケットの販売スタート！', '2026-08-16', null],
    ['混在:フェス配信決定＋チケット販売', '「ひなたフェス 2026」の生配信が決定！8月29日(土)12:00より、配信視聴チケットの販売スタート！', '2026-08-29', null],
    ['純粋な販売開始', '「ひなたフェス 2026」公式チケット・トレードが本日18:00よりスタート！', '2026-08-28', '2026-08-28T18:00:00+09:00']
  ];

  let failed = 0;
  cases.forEach(c => {
    const actual = extractExplicitEventDateHint_(c[1], c[2]);
    const ok = actual === c[3];
    if (!ok) failed++;
    console.log(`${ok ? 'OK' : 'NG'} | ${c[0]} | actual=${actual || 'null'} | expected=${c[3] || 'null'}`);
  });

  console.log(`v1.2.6 tests: ${cases.length - failed}/${cases.length} passed`);
  if (failed) throw new Error(`v1.2.6 event-date tests failed: ${failed}`);
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

  const m = s.match(
    /(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/
  );

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

  if (value instanceof Date) {
    return toJstIso_(value);
  }

  const s = String(value).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s)) {
    return s;
  }

  return parseJapaneseDate_(s) || parseRfcDate_(s);
}

function nowJstIso_() {
  return toJstIso_(new Date());
}

function toJstIso_(date) {
  return Utilities.formatDate(
    date,
    OCOS.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ss"
  ) + '+09:00';
}

function yearMonthByOffset_(offset) {
  const d = firstDayByOffset_(offset);

  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function firstDayByOffset_(offset) {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth() + offset,
    1
  );
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
  return cleanText_(
    decodeBasicEntities_(
      String(html || '').replace(/<[^>]+>/g, ' ')
    )
  );
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

  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  if (href.startsWith('//')) {
    return 'https:' + href;
  }

  if (href.startsWith('/')) {
    return base.replace(/\/$/, '') + href;
  }

  return (
    base.replace(/\/$/, '') +
    '/' +
    href.replace(/^\//, '')
  );
}

function canonicalizeUrl_(url) {
  let s = cleanText_(url);
  if (!s) return s;

  // 追跡系パラメータのみ除去。
  // dy/page等、意味のあるパラメータは残す。
  s = s.replace(
    /([?&])(utm_[^=&]+|source|ima)=[^&#]*/gi,
    '$1'
  );

  s = s
    .replace('?&', '?')
    .replace(/&&+/g, '&')
    .replace(/[?&]+$/, '');

  return s;
}

function truncate_(text, maxLen) {
  const s = String(text || '');

  return s.length <= maxLen
    ? s
    : s.slice(0, maxLen - 1) + '…';
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
    throw new Error(
      'Script Properties に NOTION_TOKEN を設定してください。'
    );
  }
}

function ensureCheerio_() {
  if (typeof Cheerio === 'undefined') {
    throw new Error(
      'Cheerio library が見つかりません。' +
      'GASプロジェクトにCheerioを追加してください。'
    );
  }
}
// ============================================================
// v1.2.2 Member Google News 実収集 Preview
// 書き込みなし。安定版判定用。
// ============================================================

// ============================================================
// CURRENT STABLE-SOURCE CORE
// ============================================================

// Decision logic
// ============================================================

function classifyItemCurrent_(item, state) {
  if (!item || !state) {
    return { action: 'SUPPRESS_LEGACY_SEEN', reason: 'INVALID_ITEM_OR_STATE' };
  }

  if (!isStableTargetCurrent_(item)) {
    return isAlreadySeen_(item, state.baseSeenState)
      ? { action: 'SUPPRESS_LEGACY_SEEN', reason: 'V126_ALREADY_SEEN' }
      : { action: 'CREATE_LEGACY_NEW', reason: 'V126_NEW' };
  }

  const key = stableSourceKeyCurrent_(item);
  if (!key) {
    return isAlreadySeen_(item, state.baseSeenState)
      ? { action: 'SUPPRESS_LEGACY_SEEN', reason: 'STABLE_KEY_MISSING_OLD_SEEN' }
      : { action: 'CREATE_NEW_SOURCE', reason: 'STABLE_KEY_MISSING_OLD_NEW' };
  }

  const latest = state.latestStableByKey.get(key) || null;

  if (!latest) {
    // 古いBACKFILLなどURLを持たない履歴だけがある場合は、
    // Fingerprint既出を尊重して不要な再投入を避ける。
    if (isAlreadySeen_(item, state.baseSeenState)) {
      return { action: 'SUPPRESS_LEGACY_SEEN', reason: 'NO_STABLE_HISTORY_BUT_OLD_SEEN' };
    }

    return { action: 'CREATE_NEW_SOURCE', reason: 'NEW_STABLE_KEY' };
  }

  const currentStrict = normalizeSourceTitleStrictCurrent_(item.title);
  const latestStrict = normalizeSourceTitleStrictCurrent_(latest.title);

  if (currentStrict === latestStrict) {
    return {
      action: 'SUPPRESS_SAME_CONTENT',
      reason: 'LATEST_CONTENT_MATCH',
      stableKey: key,
      latest
    };
  }

  const currentLoose = normalizeSourceTitleLooseCurrent_(item.title);
  const latestLoose = normalizeSourceTitleLooseCurrent_(latest.title);

  if (currentLoose === latestLoose) {
    return {
      action: 'SUPPRESS_FORMATTING_ONLY',
      reason: 'LATEST_CONTENT_FORMATTING_ONLY',
      stableKey: key,
      latest
    };
  }

  return {
    action: 'CREATE_SOURCE_REVISION',
    reason: 'LATEST_CONTENT_CHANGED',
    stableKey: key,
    latest
  };
}

function makeRevisionInboxItemCurrent_(item) {
  const copy = Object.assign({}, item);
  const originalSnippet = String(item.snippet || '').trim();
  copy.snippet = truncate_(
    OCOS_CRAWLER_CURRENT.REVISION_SNIPPET_PREFIX + originalSnippet,
    1900
  );
  return copy;
}

// ============================================================
// Seen state: v1.2.6 + latest Stable Source observation
// ============================================================

function loadSeenStateCurrent_() {
  const state = {
    baseSeenState: loadSeenState_(),
    latestStableByKey: new Map()
  };

  loadStableLedgerObservationsCurrent_(state);
  loadStableInboxObservationsCurrent_(state);
  return state;
}

function loadStableLedgerObservationsCurrent_(state) {
  const sheet = getOrCreateLedgerSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const values = sheet
    .getRange(2, 1, lastRow - 1, OCOS.LEDGER_HEADERS.length)
    .getValues();

  values.forEach(row => {
    const obs = {
      fingerprint: cleanText_(row[0]),
      detectedAt: row[1] instanceof Date ? row[1].toISOString() : cleanText_(row[1]),
      url: cleanText_(row[2]),
      title: cleanText_(row[4]),
      collector: cleanText_(row[5]),
      source: 'ledger'
    };

    considerStableObservationCurrent_(state, obs);
  });
}

function loadStableInboxObservationsCurrent_(state) {
  let cursor = null;

  do {
    const body = {
      page_size: 100,
      filter: {
        or: OCOS_CRAWLER_CURRENT.TARGET_COLLECTORS.map(collector => ({
          property: 'Collector',
          rich_text: { equals: collector }
        }))
      }
    };

    if (cursor) body.start_cursor = cursor;

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {
      const p = page.properties || {};
      const obs = {
        fingerprint: crawlerNotionText_(p.Fingerprint),
        detectedAt:
          p.Detected_At && p.Detected_At.date && p.Detected_At.date.start
            ? p.Detected_At.date.start
            : '',
        url: p.URL && p.URL.url ? p.URL.url : '',
        title: crawlerNotionTitle_(p.Inbox_Title),
        collector: crawlerNotionText_(p.Collector),
        source: 'inbox'
      };

      considerStableObservationCurrent_(state, obs);
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
}

function considerStableObservationCurrent_(state, obs) {
  if (!state || !obs || !isStableTargetCurrent_(obs)) return;

  const key = stableSourceKeyCurrent_(obs);
  if (!key) return;

  const current = state.latestStableByKey.get(key);
  if (!current || isObservationNewerCurrent_(obs, current)) {
    state.latestStableByKey.set(key, Object.assign({ stableKey: key }, obs));
  }
}

function markStableObservationCurrent_(item, state, detectedAt, source) {
  if (!isStableTargetCurrent_(item)) return;

  const obs = {
    fingerprint: String(item.fingerprint || ''),
    detectedAt: detectedAt || nowJstIso_(),
    url: String(item.url || ''),
    title: String(item.title || ''),
    collector: String(item.collector || ''),
    source: source || 'runtime'
  };

  const key = stableSourceKeyCurrent_(obs);
  if (!key) return;

  state.latestStableByKey.set(key, Object.assign({ stableKey: key }, obs));
}

function isObservationNewerCurrent_(a, b) {
  const ta = timestampCurrent_(a && a.detectedAt);
  const tb = timestampCurrent_(b && b.detectedAt);

  if (ta !== tb) return ta > tb;

  // LedgerとINBOXが同時刻なら、実際のINBOX表示内容を優先する。
  const pa = a && a.source === 'inbox' ? 2 : 1;
  const pb = b && b.source === 'inbox' ? 2 : 1;
  return pa >= pb;
}

function timestampCurrent_(value) {
  if (value instanceof Date) return value.getTime();
  const s = String(value || '').trim();
  if (!s) return 0;
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// ============================================================
// Stable Source Key / content normalization
// ============================================================

function isStableTargetCurrent_(item) {
  const collector = String((item && item.collector) || '').trim();
  return OCOS_CRAWLER_CURRENT.TARGET_COLLECTORS.includes(collector);
}

function stableSourceKeyCurrent_(item) {
  if (!isStableTargetCurrent_(item)) return '';

  const collector = String(item.collector || '').trim();
  const url = canonicalStableUrlCurrent_(item.url, collector);
  if (!url) return '';

  return `${collector}|${url}`;
}

function canonicalStableUrlCurrent_(inputUrl, collector) {
  let url = String(inputUrl || '').trim();
  if (!url) return '';

  url = url.split('#')[0];

  if (collector === 'official-youtube') {
    const videoId = extractYouTubeVideoIdCurrent_(url);
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  }

  const match = url.match(/^(https?):\/\/([^\/?#]+)([^#]*)$/i);
  if (!match) return stripTrailingSlashCurrent_(url);

  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const rest = match[3] || '';
  const qIndex = rest.indexOf('?');

  let path = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const query = qIndex >= 0 ? rest.slice(qIndex + 1) : '';

  if (!path) path = '/';
  path = stripTrailingSlashCurrent_(path) || '/';

  const kept = [];
  if (query) {
    query.split('&').forEach(part => {
      if (!part) return;
      const eq = part.indexOf('=');
      const rawKey = eq >= 0 ? part.slice(0, eq) : part;
      const key = safeDecodeURIComponentCurrent_(rawKey).toLowerCase();
      if (isTrackingQueryKeyCurrent_(key)) return;
      kept.push(part);
    });
  }

  kept.sort();
  return `${scheme}://${host}${path}${kept.length ? '?' + kept.join('&') : ''}`;
}

function extractYouTubeVideoIdCurrent_(url) {
  const s = String(url || '');

  let m = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];

  m = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  m = s.match(/youtube\.com\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  return '';
}

function isTrackingQueryKeyCurrent_(key) {
  if (!key) return false;
  if (key.indexOf('utm_') === 0) return true;

  return [
    'fbclid',
    'gclid',
    'dclid',
    'igshid',
    'mc_cid',
    'mc_eid',
    'ref',
    'ref_src',
    'feature',
    'si'
  ].includes(key);
}

function safeDecodeURIComponentCurrent_(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
  } catch (e) {
    return String(value || '');
  }
}

function stripTrailingSlashCurrent_(value) {
  const s = String(value || '');
  if (s === '/') return s;
  return s.replace(/\/+$/, '');
}

function normalizeSourceTitleStrictCurrent_(title) {
  let s = String(title || '');
  s = s.replace(/^\s*\[YouTube\]\s*/i, '');

  try {
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  } catch (e) {}

  return s
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceTitleLooseCurrent_(title) {
  return normalizeSourceTitleStrictCurrent_(title).replace(/\s+/g, '');
}

// ============================================================
// CURRENT REVISION-CHAIN CORE
// ============================================================

// Orchestrator Current
// ============================================================

function runCrawlerGroupCurrent_(label, collectors, maxCreate) {
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

    const state = loadSeenStateCurrent_();
    const counts = {
      createdNew: 0,
      createdRevision: 0,
      existingRevisionRowsMarked: 0,
      existingRevisionRowsAlreadyMarked: 0,
      revisionBlocked: 0,
      suppressedSame: 0,
      suppressedFormatting: 0,
      suppressedLegacy: 0,
      failed: 0
    };

    for (const item of normalized) {
      const decision = classifyItemCurrent_(item, state);

      if (decision.action === 'SUPPRESS_SAME_CONTENT') {
        counts.suppressedSame++;
        continue;
      }
      if (decision.action === 'SUPPRESS_FORMATTING_ONLY') {
        counts.suppressedFormatting++;
        continue;
      }
      if (decision.action === 'SUPPRESS_LEGACY_SEEN') {
        counts.suppressedLegacy++;
        continue;
      }

      if (
        counts.createdNew + counts.createdRevision >= maxCreate ||
        isNearSoftLimit_(startedAt)
      ) {
        break;
      }

      try {
        const isRevision = decision.action === 'CREATE_SOURCE_REVISION';
        const detectedAt = nowJstIso_();

        if (isRevision) {
          const markResult = markExistingRevisionChainCurrent_(item, decision.stableKey);
          counts.existingRevisionRowsMarked += markResult.marked;
          counts.existingRevisionRowsAlreadyMarked += markResult.alreadyMarked;

          if (!markResult.safe) {
            counts.revisionBlocked++;
            console.error(
              `[${label}] REVISION BLOCKED unexpected Observation_Type: ` +
              `${decision.stableKey} | ${item.title}`
            );
            continue;
          }

          const writeItem = makeRevisionInboxItemCurrent_(item);
          createRevisionInboxPageCurrent_(writeItem, detectedAt);

          markSeen_(item, state.baseSeenState);
          markStableObservationCurrent_(item, state, detectedAt, 'runtime');
          counts.createdRevision++;

          console.log(
            `[${label}] SOURCE_REVISION created + chain marked: ` +
            `${item.collector} | ${item.title} | ${item.url}`
          );
        } else {
          createInboxPage_(item);
          markSeen_(item, state.baseSeenState);
          markStableObservationCurrent_(item, state, detectedAt, 'runtime');
          counts.createdNew++;
        }

        ledgerBuffer.push(makeLedgerRow_(item));
        if (ledgerBuffer.length >= OCOS.LEDGER_FLUSH_EVERY) {
          appendLedgerRows_(ledgerBuffer);
          ledgerBuffer = [];
        }

        Utilities.sleep(OCOS.NOTION_WRITE_INTERVAL_MS);
      } catch (err) {
        counts.failed++;
        console.error(
          `createInboxPage Current failed: ${item.title} / ${err.stack || err}`
        );
      }
    }

    if (ledgerBuffer.length) {
      appendLedgerRows_(ledgerBuffer);
      ledgerBuffer = [];
    }

    let remaining = 0;
    normalized.forEach(item => {
      const d = classifyItemCurrent_(item, state);
      if (
        d.action === 'CREATE_NEW_SOURCE' ||
        d.action === 'CREATE_SOURCE_REVISION' ||
        d.action === 'CREATE_LEGACY_NEW'
      ) remaining++;
    });

    console.log(
      `[${label}] done. new=${counts.createdNew}, revisions=${counts.createdRevision}, ` +
      `revisionMarked=${counts.existingRevisionRowsMarked}, revisionAlreadyMarked=${counts.existingRevisionRowsAlreadyMarked}, ` +
      `revisionBlocked=${counts.revisionBlocked}, suppressedSame=${counts.suppressedSame}, ` +
      `suppressedFormatting=${counts.suppressedFormatting}, suppressedLegacy=${counts.suppressedLegacy}, ` +
      `failed=${counts.failed}, remaining=${remaining}, ` +
      `elapsedSec=${Math.round((Date.now() - startedAt) / 1000)}`
    );
  } finally {
    if (ledgerBuffer.length) {
      try {
        appendLedgerRows_(ledgerBuffer);
      } catch (e) {
        console.error(`Ledger Current final flush failed: ${e.stack || e}`);
      }
    }
    lock.releaseLock();
  }
}

// ============================================================
// Revision chain marking
// ============================================================

function previewRevisionChainPlanCurrent_(item, stableKey) {
  const rows = loadPhysicalStableChainCurrent_(item, stableKey);
  const plan = classifyPhysicalChainMarkingCurrent_(rows);
  return Object.assign({ rows }, plan);
}

function markExistingRevisionChainCurrent_(item, stableKey) {
  // Live reload immediately before any write.
  const rows = loadPhysicalStableChainCurrent_(item, stableKey);
  const plan = classifyPhysicalChainMarkingCurrent_(rows);

  if (plan.unexpected.length > 0) {
    return {
      safe: false,
      marked: 0,
      alreadyMarked: plan.alreadyMarked.length,
      unexpected: plan.unexpected.length
    };
  }

  let marked = 0;
  for (const row of plan.needsMark) {
    notionRequest_(
      `/v1/pages/${row.pageId}`,
      'patch',
      {
        properties: {
          Observation_Type: {
            select: { name: OCOS_CRAWLER_CURRENT.OBSERVATION_REVISION }
          }
        }
      }
    );
    marked++;
    Utilities.sleep(OCOS_CRAWLER_CURRENT.WRITE_INTERVAL_MS);
  }

  return {
    safe: true,
    marked,
    alreadyMarked: plan.alreadyMarked.length,
    unexpected: 0
  };
}

function classifyPhysicalChainMarkingCurrent_(rows) {
  const needsMark = [];
  const alreadyMarked = [];
  const unexpected = [];

  (rows || []).forEach(row => {
    const v = String(row.observationType || '').trim();
    if (!v || v === OCOS_CRAWLER_CURRENT.OBSERVATION_NORMAL) {
      needsMark.push(row);
    } else if (v === OCOS_CRAWLER_CURRENT.OBSERVATION_REVISION) {
      alreadyMarked.push(row);
    } else {
      unexpected.push(row);
    }
  });

  return { needsMark, alreadyMarked, unexpected };
}

function loadPhysicalStableChainCurrent_(item, stableKey) {
  const collector = String((item && item.collector) || '').trim();
  const targetKey = String(stableKey || stableSourceKeyCurrent_(item) || '').trim();
  if (!collector || !targetKey) return [];

  const rows = [];
  let cursor = null;
  let scanned = 0;

  do {
    const body = {
      page_size: 100,
      filter: {
        property: 'Collector',
        rich_text: { equals: collector }
      },
      sorts: [
        { property: 'Detected_At', direction: 'ascending' }
      ]
    };
    if (cursor) body.start_cursor = cursor;

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {
      scanned++;
      if (scanned > OCOS_CRAWLER_CURRENT.MAX_CHAIN_AUDIT_ROWS) {
        throw new Error('Revision chain audit exceeded MAX_CHAIN_AUDIT_ROWS.');
      }

      const p = page.properties || {};
      const row = {
        pageId: page.id || '',
        title: crawlerNotionTitle_(p.Inbox_Title),
        url: p.URL && p.URL.url ? String(p.URL.url) : '',
        collector: crawlerNotionText_(p.Collector),
        observationType: selectNameCurrent_(p.Observation_Type),
        decision: selectNameCurrent_(p.Decision),
        status: selectNameCurrent_(p.Status),
        detectedAt:
          p.Detected_At && p.Detected_At.date && p.Detected_At.date.start
            ? String(p.Detected_At.date.start)
            : ''
      };

      if (stableSourceKeyCurrent_(row) === targetKey) rows.push(row);
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  return rows;
}

// ============================================================
// Revision row creation WITH structured Observation_Type
// ============================================================

function createRevisionInboxPageCurrent_(item, detectedAt) {
  const properties = {
    Inbox_Title: notionTitle_(item.title),
    URL: { url: item.url },
    Detected_At: { date: { start: detectedAt || nowJstIso_() } },
    Publisher: notionRichText_(item.publisher),
    Source_Class: { select: { name: item.sourceClass } },
    Source_Type: { select: { name: item.sourceType } },
    Detected_Snippet: notionRichText_(item.snippet),
    Status: { select: { name: '未処理' } },
    Decision: { select: { name: '未判断' } },
    Fingerprint: notionRichText_(item.fingerprint),
    Collector: notionRichText_(item.collector || ''),
    Publisher_Host: notionRichText_(item.publisherHost || ''),
    Discovery_Terms: notionRichText_(item.discoveryTerms || ''),
    Observation_Type: {
      select: { name: OCOS_CRAWLER_CURRENT.OBSERVATION_REVISION }
    }
  };

  if (item.publishedAt) {
    properties.Published_At = {
      date: { start: item.publishedAt }
    };
  }

  if (item.eventDateHint) {
    properties.Event_Date_Hint = {
      date: { start: item.eventDateHint }
    };
  }

  const page = notionRequest_(
    '/v1/pages',
    'post',
    {
      parent: {
        type: 'data_source_id',
        data_source_id: OCOS.NOTION_INBOX_DATA_SOURCE_ID
      },
      properties
    }
  );

  if (!page || !page.id) {
    throw new Error('Current revision create returned no page.id');
  }

  return page;
}

function selectNameCurrent_(prop) {
  return prop && prop.select && prop.select.name
    ? String(prop.select.name)
    : '';
}

// ============================================================
// CURRENT PUBLIC ENTRY POINTS
// ============================================================

function runFrequentCrawlerCurrent() {
  return runCrawlerGroupCurrent_('frequent-current', [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_
  ], OCOS.MAX_CREATE_FREQUENT);
}

function runScheduleCrawlerCurrent() {
  return runCrawlerGroupCurrent_('schedule-current', [
    collectOfficialSchedule_
  ], OCOS.MAX_CREATE_SCHEDULE);
}

function runDailyCrawlerCurrent() {
  return runCrawlerGroupCurrent_('daily-current', [
    collectGoogleNewsCurrentMembers_,
    collectGoogleNewsGraduatedMembers_
  ], OCOS.MAX_CREATE_DAILY);
}

function runFullCrawlerChunkCurrent() {
  return runCrawlerGroupCurrent_('full-chunk-current', fullCollectors_(), OCOS.MAX_CREATE_FULL);
}

function isNearSoftLimit_(startedAt) {
  return Date.now() - startedAt >= OCOS.RUN_SOFT_LIMIT_MS;
}

/**
 * WRITE = NONE.
 * Uses the exact classifier and revision-chain planner shipped in this Current file.
 */
function previewCrawlerCurrentDecisionGate() {
  validateBaseConfig_();

  console.log('========================================');
  console.log('OC-OS INBOX CRAWLER CURRENT DECISION GATE');
  console.log(`VERSION = ${OCOS_CRAWLER_CURRENT.VERSION}`);
  console.log('WRITE = NONE');
  console.log('REVISION CHAIN MARKING = PREVIEW ONLY');
  console.log('========================================');

  const raw = []
    .concat(collectOfficialNews_() || [])
    .concat(collectOfficialBlogs_() || [])
    .concat(collectOfficialYouTube_() || []);

  const normalized = normalizeAndDeduplicateCandidates_(raw)
    .filter(isStableTargetCurrent_);

  const state = loadSeenStateCurrent_();
  const counts = {
    createNew: 0,
    createRevision: 0,
    suppressSame: 0,
    suppressFormatting: 0,
    suppressLegacy: 0,
    revisionExistingRows: 0,
    revisionExistingNeedsMark: 0,
    revisionExistingAlreadyMarked: 0,
    revisionUnexpectedObservationType: 0
  };

  const revisionPlans = [];

  normalized.forEach(item => {
    const d = classifyItemCurrent_(item, state);

    if (d.action === 'CREATE_NEW_SOURCE') counts.createNew++;
    else if (d.action === 'CREATE_SOURCE_REVISION') {
      counts.createRevision++;
      const plan = previewRevisionChainPlanCurrent_(item, d.stableKey);
      counts.revisionExistingRows += plan.rows.length;
      counts.revisionExistingNeedsMark += plan.needsMark.length;
      counts.revisionExistingAlreadyMarked += plan.alreadyMarked.length;
      counts.revisionUnexpectedObservationType += plan.unexpected.length;
      revisionPlans.push({ item, decision: d, plan });
    }
    else if (d.action === 'SUPPRESS_SAME_CONTENT') counts.suppressSame++;
    else if (d.action === 'SUPPRESS_FORMATTING_ONLY') counts.suppressFormatting++;
    else if (d.action === 'SUPPRESS_LEGACY_SEEN') counts.suppressLegacy++;
  });

  console.log(`RAW_COLLECTED = ${raw.length}`);
  console.log(`NORMALIZED_TARGET = ${normalized.length}`);
  console.log(`STABLE_STATE_KEYS = ${state.latestStableByKey.size}`);
  console.log('----------------------------------------');
  console.log(`CREATE_NEW_SOURCE = ${counts.createNew}`);
  console.log(`CREATE_SOURCE_REVISION = ${counts.createRevision}`);
  console.log(`SUPPRESS_SAME_CONTENT = ${counts.suppressSame}`);
  console.log(`SUPPRESS_FORMATTING_ONLY = ${counts.suppressFormatting}`);
  console.log(`SUPPRESS_LEGACY_SEEN = ${counts.suppressLegacy}`);
  console.log('----------------------------------------');
  console.log(`REVISION_EXISTING_PHYSICAL_ROWS = ${counts.revisionExistingRows}`);
  console.log(`REVISION_EXISTING_ROWS_NEED_MARK = ${counts.revisionExistingNeedsMark}`);
  console.log(`REVISION_EXISTING_ROWS_ALREADY_MARKED = ${counts.revisionExistingAlreadyMarked}`);
  console.log(`REVISION_UNEXPECTED_OBSERVATION_TYPE = ${counts.revisionUnexpectedObservationType}`);

  revisionPlans.forEach((x, i) => {
    console.log('----------------------------------------');
    console.log(`${i + 1}. CREATE_SOURCE_REVISION | ${x.decision.stableKey}`);
    console.log(`   current=${x.item.title}`);
    console.log(`   previous=${x.decision.latest ? x.decision.latest.title : '-'}`);
    console.log(`   physicalRows=${x.plan.rows.length} / needsMark=${x.plan.needsMark.length} / alreadyMarked=${x.plan.alreadyMarked.length} / unexpected=${x.plan.unexpected.length}`);
  });

  console.log('========================================');
  console.log(
    counts.revisionUnexpectedObservationType > 0
      ? 'RESULT = BLOCKED: unexpected Observation_Type exists in revision chain'
      : 'RESULT = SAFE PREVIEW'
  );
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function installCrawlerTriggersCurrent() {
  const legacyHandlers = [
    'runFrequentCrawler',
    'runScheduleCrawler',
    'runDailyCrawler',
    'runFrequentCrawlerV127',
    'runScheduleCrawlerV127',
    'runDailyCrawlerV127',
    'runFrequentCrawlerV128',
    'runScheduleCrawlerV128',
    'runDailyCrawlerV128'
  ];

  const currentHandlers = [
    'runFrequentCrawlerCurrent',
    'runScheduleCrawlerCurrent',
    'runDailyCrawlerCurrent'
  ];

  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    const handler = trigger.getHandlerFunction();
    if (legacyHandlers.includes(handler) || currentHandlers.includes(handler)) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  ScriptApp.newTrigger('runFrequentCrawlerCurrent')
    .timeBased()
    .everyHours(2)
    .create();

  ScriptApp.newTrigger('runScheduleCrawlerCurrent')
    .timeBased()
    .everyHours(6)
    .create();

  ScriptApp.newTrigger('runDailyCrawlerCurrent')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();

  console.log(`Current crawler triggers installed. removed=${removed}, installed=3`);
  auditCrawlerTriggersCurrent();
}

function removeCrawlerTriggersCurrent() {
  const handlers = [
    'runFrequentCrawlerCurrent',
    'runScheduleCrawlerCurrent',
    'runDailyCrawlerCurrent'
  ];

  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  console.log(`Current crawler triggers removed: ${removed}`);
}

function auditCrawlerTriggersCurrent() {
  const legacyHandlers = [
    'runFrequentCrawler',
    'runScheduleCrawler',
    'runDailyCrawler',
    'runFrequentCrawlerV127',
    'runScheduleCrawlerV127',
    'runDailyCrawlerV127',
    'runFrequentCrawlerV128',
    'runScheduleCrawlerV128',
    'runDailyCrawlerV128'
  ];

  const currentHandlers = [
    'runFrequentCrawlerCurrent',
    'runScheduleCrawlerCurrent',
    'runDailyCrawlerCurrent'
  ];

  const counts = {};
  [...legacyHandlers, ...currentHandlers].forEach(h => counts[h] = 0);

  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (Object.prototype.hasOwnProperty.call(counts, h)) counts[h]++;
  });

  console.log('========================================');
  console.log(`OC-OS CRAWLER CURRENT TRIGGER AUDIT | ${OCOS_CRAWLER_CURRENT.VERSION}`);
  [...legacyHandlers, ...currentHandlers].forEach(h => console.log(`${h} = ${counts[h]}`));
  console.log('EXPECTED CURRENT: frequent=1 / schedule=1 / daily=1; all legacy handlers=0');
  console.log('========================================');
}