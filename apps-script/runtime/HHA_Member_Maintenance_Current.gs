/**
 * HHA Member Maintenance Current
 *
 * Runtime Status: CURRENT / PILOT
 *
 * Sources:
 * - gas/hha_member_maintenance_v0.1.2.gs
 * - gas/hha_member_raw_snapshot_pilot_v0.1.0.gs
 *
 * Safety:
 * - Canonical auto update = NONE
 * - Notion write = NONE
 * - Auto trigger = false
 * - Raw Snapshot Drive write is manual Pilot only
 * - Raw Snapshot profile scope remains 1 member until Runtime Pilot succeeds
 *
 * Human judgment remains authoritative.
 */

// ============================================================
// MEMBER MAINTENANCE CURRENT
// ============================================================

/**
 * HHA Member Maintenance Current
 *
 * Status: CURRENT / PILOT
 * Contract: docs/HHA_MEMBER_MAINTENANCE_CONTRACT_v0.1.md
 *
 * Safety:
 * - PREVIEW ONLY
 * - NOTION WRITE = NONE
 * - CANONICAL AUTO UPDATE = NONE
 * - Trigger installation is explicit/manual only.
 *
 * v0.1.2 corrections:
 * - De-duplicate repeated official roster elements by Official_Member_ID.
 * - Distinguish already-known non-current Canonical members that remain visible
 *   on the official roster from genuinely new official members.
 */

const HHA_MEMBER_MAINTENANCE_CURRENT = Object.freeze({
  VERSION: '0.1.2-current',
  STATUS: 'CURRENT / PILOT',
  AUTO_TRIGGER: false,
  NOTION_WRITE: false,
  CANONICAL_AUTO_UPDATE: false,
  BASE_URL: 'https://www.hinatazaka46.com',
  ROSTER_URL: 'https://www.hinatazaka46.com/s/official/search/artist?ima=0000',
  HHA_MEMBERS_DATA_SOURCE_ID: 'df86e0ba-5478-4fc6-b30a-49cb1bd6c83d',
  NOTION_VERSION: '2026-03-11',
  HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; OhisamaConnect-HHA-Member-Maintenance/Current)',
  HTTP_MAX_RETRIES: 3,
  PROFILE_FETCH_SLEEP_MS: 150,
  PROFILE_MAX_PER_RUN: 60
});

function previewHhaMemberMaintenanceCurrent() {
  const startedAt = new Date();
  const integrity = previewHhaMemberCanonicalIntegrityCurrent();
  const roster = previewHhaMemberRosterMaintenanceCurrent();
  const profiles = previewHhaMemberProfileMaintenanceCurrent();
  const report = {
    version: HHA_MEMBER_MAINTENANCE_CURRENT.VERSION,
    status: HHA_MEMBER_MAINTENANCE_CURRENT.STATUS,
    write: 'NONE',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    integrity,
    roster,
    profiles,
    reviewRequired:
      integrity.issueCount > 0 ||
      roster.candidateCount > 0 ||
      roster.errorCount > 0 ||
      profiles.candidateCount > 0 ||
      profiles.errorCount > 0
  };
  hhaMmLogCurrent_('HHA MEMBER MAINTENANCE PREVIEW', report);
  return report;
}

function previewHhaMemberCanonicalIntegrityCurrent() {
  const members = hhaMmLoadCanonicalMembersCurrent_();
  const issues = [];
  const memberIds = {};
  const memberOrders = {};
  const officialIds = {};

  members.forEach(member => {
    if (!member.memberId) {
      issues.push(hhaMmIssueCurrent_('MISSING_MEMBER_ID', member, 'Member_ID is empty.'));
    } else {
      if (!/^MEM-\d{3}$/.test(member.memberId)) {
        issues.push(hhaMmIssueCurrent_('INVALID_MEMBER_ID_FORMAT', member, `Member_ID must match MEM-000 format: ${member.memberId}`));
      }
      if (memberIds[member.memberId]) {
        issues.push(hhaMmIssueCurrent_('DUPLICATE_MEMBER_ID', member, `Duplicate Member_ID: ${member.memberId}`));
      } else {
        memberIds[member.memberId] = true;
      }
    }

    if (member.memberOrder === null) {
      issues.push(hhaMmIssueCurrent_('MISSING_MEMBER_ORDER', member, 'Member_Order is empty.'));
    } else if (memberOrders[String(member.memberOrder)]) {
      issues.push(hhaMmIssueCurrent_('DUPLICATE_MEMBER_ORDER', member, `Duplicate Member_Order: ${member.memberOrder}`));
    } else {
      memberOrders[String(member.memberOrder)] = true;
    }

    if (!member.memberName) issues.push(hhaMmIssueCurrent_('MISSING_MEMBER_NAME', member, 'Member_Name is empty.'));
    if (!member.activityStatus) issues.push(hhaMmIssueCurrent_('MISSING_ACTIVITY_STATUS', member, 'Activity_Status is empty.'));
    if (!member.verificationStatus) issues.push(hhaMmIssueCurrent_('MISSING_VERIFICATION_STATUS', member, 'Verification_Status is empty.'));
    if (!member.lastVerifiedAt) issues.push(hhaMmIssueCurrent_('MISSING_LAST_VERIFIED_AT', member, 'Last_Verified_At is empty.'));

    if (member.officialMemberId) {
      if (officialIds[member.officialMemberId]) {
        issues.push(hhaMmIssueCurrent_('DUPLICATE_OFFICIAL_MEMBER_ID', member, `Duplicate Official_Member_ID: ${member.officialMemberId}`));
      } else {
        officialIds[member.officialMemberId] = true;
      }
    }

    if (member.activityStatus === '在籍中' && !member.officialMemberId) {
      issues.push(hhaMmIssueCurrent_('CURRENT_MEMBER_MISSING_OFFICIAL_ID', member, 'Current member has no Official_Member_ID.'));
    }
    if (member.activityStatus === '在籍中' && !member.officialProfileUrl) {
      issues.push(hhaMmIssueCurrent_('CURRENT_MEMBER_MISSING_PROFILE_URL', member, 'Current member has no Official_Profile_URL.'));
    }
  });

  return {
    write: 'NONE',
    canonicalCount: members.length,
    currentCount: members.filter(m => m.activityStatus === '在籍中').length,
    issueCount: issues.length,
    issues
  };
}

function previewHhaMemberRosterMaintenanceCurrent() {
  const members = hhaMmLoadCanonicalMembersCurrent_();
  const currentMembers = members.filter(m => m.activityStatus === '在籍中');
  const allByOfficialId = {};
  const allByName = {};
  const currentByOfficialId = {};

  members.forEach(member => {
    if (member.officialMemberId) allByOfficialId[String(member.officialMemberId)] = member;
    const normalized = hhaMmNormalizeNameCurrent_(member.memberName);
    if (normalized) allByName[normalized] = member;
    if (member.activityStatus === '在籍中' && member.officialMemberId) {
      currentByOfficialId[String(member.officialMemberId)] = member;
    }
  });

  let html;
  try {
    html = hhaMmFetchTextCurrent_(HHA_MEMBER_MAINTENANCE_CURRENT.ROSTER_URL);
  } catch (err) {
    return hhaMmRosterErrorReportCurrent_(currentMembers.length, 'ROSTER_FETCH_ERROR', err);
  }

  let roster;
  try {
    roster = hhaMmParseVisibleRosterCurrent_(html);
    if (!roster.visibleMembers.length || roster.visibleMembers.some(v => !v.officialMemberId || !v.memberName)) {
      throw new Error('Official roster parser returned zero visible members or incomplete required fields.');
    }
  } catch (err) {
    return hhaMmRosterErrorReportCurrent_(currentMembers.length, 'ROSTER_PARSE_ERROR', err);
  }

  const officialById = {};
  roster.visibleMembers.forEach(member => { officialById[String(member.officialMemberId)] = member; });

  const candidates = [];
  const informationalObservations = [];

  roster.visibleMembers.forEach(official => {
    const canonical = allByOfficialId[String(official.officialMemberId)];

    if (canonical) {
      if (canonical.activityStatus !== '在籍中') {
        informationalObservations.push({
          type: 'NONCURRENT_CANONICAL_STILL_VISIBLE_ON_OFFICIAL_ROSTER',
          severity: 'INFO',
          memberId: canonical.memberId,
          memberName: canonical.memberName,
          activityStatus: canonical.activityStatus,
          membershipEndDate: canonical.membershipEndDate,
          officialMemberId: canonical.officialMemberId,
          sourceUrl: official.profileUrl,
          message: 'Known non-current Canonical member remains visible on the official roster. This is not treated as a new member or as a Canonical reversal.'
        });
        return;
      }

      if (hhaMmNormalizeNameCurrent_(official.memberName) !== hhaMmNormalizeNameCurrent_(canonical.memberName)) {
        candidates.push({
          type: 'OFFICIAL_NAME_MISMATCH',
          severity: 'REVIEW',
          memberId: canonical.memberId,
          officialMemberId: official.officialMemberId,
          canonicalValue: canonical.memberName,
          observedValue: official.memberName,
          sourceUrl: official.profileUrl
        });
      }

      if (canonical.officialProfileUrl && hhaMmCanonicalizeUrlCurrent_(canonical.officialProfileUrl) !== hhaMmCanonicalizeUrlCurrent_(official.profileUrl)) {
        candidates.push({
          type: 'OFFICIAL_PROFILE_URL_MISMATCH',
          severity: 'REVIEW',
          memberId: canonical.memberId,
          officialMemberId: official.officialMemberId,
          canonicalValue: canonical.officialProfileUrl,
          observedValue: official.profileUrl,
          sourceUrl: official.profileUrl
        });
      }
      return;
    }

    const sameNameCanonical = allByName[hhaMmNormalizeNameCurrent_(official.memberName)];
    if (sameNameCanonical) {
      candidates.push({
        type: 'OFFICIAL_MEMBER_ID_MISMATCH',
        severity: 'HIGH_REVIEW',
        memberId: sameNameCanonical.memberId,
        memberName: sameNameCanonical.memberName,
        canonicalValue: sameNameCanonical.officialMemberId,
        observedValue: official.officialMemberId,
        sourceUrl: official.profileUrl
      });
    } else {
      candidates.push({
        type: 'NEW_OFFICIAL_MEMBER',
        severity: 'HIGH_REVIEW',
        official,
        message: 'Visible official roster member is not matched to any Canonical HHA member.'
      });
    }
  });

  currentMembers.forEach(canonical => {
    if (!canonical.officialMemberId) return;
    if (!officialById[String(canonical.officialMemberId)]) {
      candidates.push({
        type: 'ACTIVE_MISSING_FROM_OFFICIAL_ROSTER',
        severity: 'HIGH_REVIEW',
        memberId: canonical.memberId,
        memberName: canonical.memberName,
        officialMemberId: canonical.officialMemberId,
        message: 'Canonical current member was not found in the visible official roster. Do not auto-change Activity_Status; verify official announcements and source state.'
      });
    }
  });

  return {
    write: 'NONE',
    sourceUrl: HHA_MEMBER_MAINTENANCE_CURRENT.ROSTER_URL,
    canonicalCurrentCount: currentMembers.length,
    officialVisibleUniqueCount: roster.visibleMembers.length,
    rawVisibleElementCount: roster.rawVisibleElementCount,
    deduplicatedElementCount: roster.rawVisibleElementCount - roster.visibleMembers.length,
    hiddenOfficialElementCount: roster.hiddenMemberIds.length,
    hiddenOfficialMemberIds: roster.hiddenMemberIds,
    candidateCount: candidates.length,
    candidates,
    informationalObservationCount: informationalObservations.length,
    informationalObservations,
    errorCount: 0,
    errors: [],
    observedVisibleMembers: roster.visibleMembers
  };
}

function previewHhaMemberProfileMaintenanceCurrent() {
  const members = hhaMmLoadCanonicalMembersCurrent_()
    .filter(m => m.activityStatus === '在籍中' && !!m.officialProfileUrl)
    .sort((a, b) => (a.memberOrder === null ? 999999 : a.memberOrder) - (b.memberOrder === null ? 999999 : b.memberOrder));

  if (members.length > HHA_MEMBER_MAINTENANCE_CURRENT.PROFILE_MAX_PER_RUN) {
    throw new Error(`Profile target count ${members.length} exceeds pilot safety limit ${HHA_MEMBER_MAINTENANCE_CURRENT.PROFILE_MAX_PER_RUN}.`);
  }

  const candidates = [];
  const observations = [];
  const errors = [];

  members.forEach((canonical, index) => {
    if (index > 0 && HHA_MEMBER_MAINTENANCE_CURRENT.PROFILE_FETCH_SLEEP_MS > 0) {
      Utilities.sleep(HHA_MEMBER_MAINTENANCE_CURRENT.PROFILE_FETCH_SLEEP_MS);
    }

    let html;
    try {
      html = hhaMmFetchTextCurrent_(canonical.officialProfileUrl);
    } catch (err) {
      errors.push(hhaMmProfileErrorCurrent_('PROFILE_FETCH_ERROR', canonical, err));
      return;
    }

    let observed;
    try {
      observed = hhaMmParseProfileCurrent_(html, canonical.officialProfileUrl, canonical.officialMemberId);
      const missingFields = hhaMmMissingProfileFieldsCurrent_(observed);
      if (missingFields.length) {
        errors.push({
          type: 'PROFILE_PARSE_ERROR',
          severity: 'REVIEW',
          memberId: canonical.memberId,
          memberName: canonical.memberName,
          officialMemberId: canonical.officialMemberId,
          profileUrl: canonical.officialProfileUrl,
          missingFields,
          message: 'Required official profile fields could not be parsed. No Canonical difference is inferred.'
        });
        return;
      }
    } catch (err) {
      errors.push(hhaMmProfileErrorCurrent_('PROFILE_PARSE_ERROR', canonical, err));
      return;
    }

    observations.push({ memberId: canonical.memberId, memberName: canonical.memberName, officialMemberId: canonical.officialMemberId, observed });
    hhaMmCompareFieldCurrent_(candidates, 'PROFILE_NAME_DIFF', canonical, observed, 'Member_Name', canonical.memberName, observed.memberName, hhaMmNormalizeNameCurrent_);
    hhaMmCompareFieldCurrent_(candidates, 'PROFILE_KANA_DIFF', canonical, observed, 'Name_Kana', canonical.nameKana, observed.nameKana, hhaMmNormalizeKanaCurrent_);
    hhaMmCompareFieldCurrent_(candidates, 'PROFILE_ROMANIZED_NAME_DIFF', canonical, observed, 'Romanized_Name', canonical.romanizedName, observed.romanizedName, hhaMmNormalizeRomanizedCurrent_);
    hhaMmCompareFieldCurrent_(candidates, 'PROFILE_BIRTHDAY_DIFF', canonical, observed, 'Birthday', canonical.birthday, observed.birthday, hhaMmNormalizeTextCurrent_);
    hhaMmCompareNumberCurrent_(candidates, 'PROFILE_HEIGHT_DIFF', canonical, observed, 'Height_cm', canonical.heightCm, observed.heightCm);
    hhaMmCompareFieldCurrent_(candidates, 'PROFILE_HOMETOWN_DIFF', canonical, observed, 'Hometown', canonical.hometown, observed.hometown, hhaMmNormalizeTextCurrent_);
    hhaMmCompareFieldCurrent_(candidates, 'PROFILE_BLOOD_TYPE_DIFF', canonical, observed, 'Blood_Type', canonical.bloodType, observed.bloodType, hhaMmNormalizeTextCurrent_);
  });

  return {
    write: 'NONE',
    targetCount: members.length,
    observationCount: observations.length,
    candidateCount: candidates.length,
    errorCount: errors.length,
    candidates,
    errors,
    observations
  };
}

function hhaMmParseVisibleRosterCurrent_(html) {
  hhaMmEnsureCheerioCurrent_();
  const hiddenIds = hhaMmExtractHiddenRosterIdsCurrent_(html);
  const hiddenSet = {};
  hiddenIds.forEach(id => { hiddenSet[String(id)] = true; });
  const $ = Cheerio.load(html);
  const byId = {};
  let rawVisibleElementCount = 0;

  $('.p-member__item').each((_, el) => {
    const $el = $(el);
    const rawId = hhaMmCleanTextCurrent_($el.attr('data-member') || '');
    if (!rawId) return;
    const inlineStyle = String($el.attr('style') || '');
    if (/display\s*:\s*none/i.test(inlineStyle) || hiddenSet[String(rawId)]) return;

    rawVisibleElementCount++;
    const href = $el.find('a[href*="/s/official/artist/"]').first().attr('href') || '';
    const item = {
      officialMemberId: String(rawId),
      memberName: hhaMmCleanTextCurrent_($el.find('.c-member__name').first().text()),
      nameKana: hhaMmCleanTextCurrent_($el.find('.c-member__kana').first().text()),
      birthday: hhaMmParseJapaneseDateCurrent_(hhaMmCleanTextCurrent_($el.find('.c-member__birth').first().text())),
      profileUrl: href ? hhaMmAbsoluteUrlCurrent_(href) : `${HHA_MEMBER_MAINTENANCE_CURRENT.BASE_URL}/s/official/artist/${rawId}?ima=0000`
    };

    const previous = byId[item.officialMemberId];
    if (!previous) {
      byId[item.officialMemberId] = item;
      return;
    }

    if (hhaMmNormalizeNameCurrent_(previous.memberName) !== hhaMmNormalizeNameCurrent_(item.memberName)) {
      throw new Error(`Conflicting repeated roster elements for Official_Member_ID=${item.officialMemberId}: ${previous.memberName} / ${item.memberName}`);
    }
  });

  const visibleMembers = Object.keys(byId).map(id => byId[id]).sort((a, b) => Number(a.officialMemberId) - Number(b.officialMemberId));
  return { hiddenMemberIds: hiddenIds, rawVisibleElementCount, visibleMembers };
}

function hhaMmExtractHiddenRosterIdsCurrent_(html) {
  const ids = {};
  const pattern = /li\s*\[\s*data-member\s*=\s*["']?(\d+)["']?\s*\]\s*\{[^}]*display\s*:\s*none\b[^}]*\}/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) ids[String(match[1])] = true;
  return Object.keys(ids).sort((a, b) => Number(a) - Number(b));
}

function hhaMmParseProfileCurrent_(html, sourceUrl, expectedOfficialId) {
  hhaMmEnsureCheerioCurrent_();
  const $ = Cheerio.load(html);
  const $name = $('.c-member__name--info').first();
  const romanizedName = hhaMmCleanTextCurrent_($name.find('.name_en').first().text());
  const $nameClone = $name.clone();
  $nameClone.find('.name_en').remove();
  const table = {};

  $('.p-member__info-table tr').each((_, tr) => {
    const $tr = $(tr);
    const key = hhaMmCleanTextCurrent_($tr.find('.c-member__info-td__name').first().text());
    const value = hhaMmCleanTextCurrent_($tr.find('.c-member__info-td__text').first().text());
    if (key) table[key] = value;
  });

  return {
    sourceUrl,
    officialMemberId: String(expectedOfficialId || ''),
    memberName: hhaMmCleanTextCurrent_($nameClone.text()),
    nameKana: hhaMmCleanTextCurrent_($('.p-member__info .c-member__kana').first().text()),
    romanizedName,
    birthday: hhaMmParseJapaneseDateCurrent_(table['生年月日'] || ''),
    heightCm: hhaMmParseHeightCurrent_(table['身長'] || ''),
    hometown: hhaMmCleanTextCurrent_(table['出身地'] || ''),
    bloodType: hhaMmCleanTextCurrent_(table['血液型'] || ''),
    rawLabels: table
  };
}

function hhaMmMissingProfileFieldsCurrent_(observed) {
  const missing = [];
  if (!observed.memberName) missing.push('Member_Name');
  if (!observed.nameKana) missing.push('Name_Kana');
  if (!observed.romanizedName) missing.push('Romanized_Name');
  if (!observed.birthday) missing.push('Birthday');
  if (observed.heightCm === null || observed.heightCm === undefined || Number.isNaN(observed.heightCm)) missing.push('Height_cm');
  if (!observed.hometown) missing.push('Hometown');
  if (!observed.bloodType) missing.push('Blood_Type');
  return missing;
}

function hhaMmCompareFieldCurrent_(candidates, type, canonical, observed, property, canonicalValue, observedValue, normalizer) {
  const normalize = normalizer || hhaMmNormalizeTextCurrent_;
  if (normalize(canonicalValue) !== normalize(observedValue)) {
    candidates.push({ type, severity: 'REVIEW', memberId: canonical.memberId, memberName: canonical.memberName, officialMemberId: canonical.officialMemberId, property, canonicalValue, observedValue, sourceUrl: observed.sourceUrl });
  }
}

function hhaMmCompareNumberCurrent_(candidates, type, canonical, observed, property, canonicalValue, observedValue) {
  const canonicalNumber = canonicalValue === null || canonicalValue === undefined || canonicalValue === '' ? null : Number(canonicalValue);
  if (canonicalNumber === null || Number.isNaN(canonicalNumber) || Math.abs(canonicalNumber - Number(observedValue)) > 0.0001) {
    candidates.push({ type, severity: 'REVIEW', memberId: canonical.memberId, memberName: canonical.memberName, officialMemberId: canonical.officialMemberId, property, canonicalValue, observedValue, sourceUrl: observed.sourceUrl });
  }
}

function hhaMmLoadCanonicalMembersCurrent_() {
  const rows = [];
  let cursor = null;
  do {
    const payload = { page_size: 100 };
    if (cursor) payload.start_cursor = cursor;
    const result = hhaMmNotionRequestCurrent_(`/v1/data_sources/${HHA_MEMBER_MAINTENANCE_CURRENT.HHA_MEMBERS_DATA_SOURCE_ID}/query`, 'post', payload);
    (result.results || []).forEach(page => rows.push(hhaMmCanonicalMemberFromPageCurrent_(page)));
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return rows.sort((a, b) => (a.memberOrder === null ? 999999 : a.memberOrder) - (b.memberOrder === null ? 999999 : b.memberOrder));
}

function hhaMmCanonicalMemberFromPageCurrent_(page) {
  const p = page.properties || {};
  return {
    pageId: page.id || '',
    pageUrl: page.url || '',
    memberId: hhaMmNotionTextCurrent_(p['Member_ID']),
    memberName: hhaMmNotionTitleCurrent_(p['Member_Name']),
    memberOrder: hhaMmNotionNumberCurrent_(p['Member_Order']),
    generation: hhaMmNotionSelectCurrent_(p['Generation']),
    activityStatus: hhaMmNotionSelectCurrent_(p['Activity_Status']),
    membershipStartDate: hhaMmNotionDateCurrent_(p['Membership_Start_Date']),
    membershipEndDate: hhaMmNotionDateCurrent_(p['Membership_End_Date']),
    officialMemberId: hhaMmNotionTextCurrent_(p['Official_Member_ID']),
    officialProfileUrl: hhaMmNotionUrlCurrent_(p['Official_Profile_URL']),
    officialBlogUrl: hhaMmNotionUrlCurrent_(p['Official_Blog_URL']),
    nameKana: hhaMmNotionTextCurrent_(p['Name_Kana']),
    romanizedName: hhaMmNotionTextCurrent_(p['Romanized_Name']),
    birthday: hhaMmNotionDateCurrent_(p['Birthday']),
    heightCm: hhaMmNotionNumberCurrent_(p['Height_cm']),
    hometown: hhaMmNotionSelectCurrent_(p['Hometown']),
    bloodType: hhaMmNotionSelectCurrent_(p['Blood_Type']),
    verificationStatus: hhaMmNotionSelectCurrent_(p['Verification_Status']),
    lastVerifiedAt: hhaMmNotionDateCurrent_(p['Last_Verified_At'])
  };
}

function hhaMmNotionTitleCurrent_(property) {
  return property && Array.isArray(property.title) ? property.title.map(v => v.plain_text || '').join('').trim() : '';
}
function hhaMmNotionTextCurrent_(property) {
  return property && Array.isArray(property.rich_text) ? property.rich_text.map(v => v.plain_text || '').join('').trim() : '';
}
function hhaMmNotionSelectCurrent_(property) {
  return property && property.select && property.select.name ? String(property.select.name).trim() : '';
}
function hhaMmNotionNumberCurrent_(property) {
  return !property || property.number === null || property.number === undefined ? null : Number(property.number);
}
function hhaMmNotionDateCurrent_(property) {
  return property && property.date && property.date.start ? String(property.date.start).slice(0, 10) : '';
}
function hhaMmNotionUrlCurrent_(property) {
  return property && property.url ? String(property.url).trim() : '';
}

function hhaMmFetchTextCurrent_(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= HHA_MEMBER_MAINTENANCE_CURRENT.HTTP_MAX_RETRIES; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get', followRedirects: true, muteHttpExceptions: true,
        headers: { 'User-Agent': HHA_MEMBER_MAINTENANCE_CURRENT.HTTP_USER_AGENT }
      });
      const code = response.getResponseCode();
      if (code >= 200 && code < 300) return response.getContentText('UTF-8');
      lastError = new Error(`HTTP ${code}: ${url}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < HHA_MEMBER_MAINTENANCE_CURRENT.HTTP_MAX_RETRIES) Utilities.sleep(500 * attempt);
  }
  throw new Error(`Failed to fetch official source after retries: ${url} / ${String(lastError && lastError.message ? lastError.message : lastError)}`);
}

function hhaMmNotionRequestCurrent_(path, method, body) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('NOTION_TOKEN') || props.getProperty('NOTION_API_TOKEN') || props.getProperty('NOTION_SECRET');
  if (!token) throw new Error('Notion token is not set. Expected NOTION_TOKEN (fallback: NOTION_API_TOKEN / NOTION_SECRET).');
  const options = {
    method: method || 'get', muteHttpExceptions: true,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': HHA_MEMBER_MAINTENANCE_CURRENT.NOTION_VERSION, 'Content-Type': 'application/json' }
  };
  if (body !== undefined && body !== null) options.payload = JSON.stringify(body);
  const response = UrlFetchApp.fetch(`https://api.notion.com${path}`, options);
  const code = response.getResponseCode();
  const text = response.getContentText('UTF-8');
  if (code < 200 || code >= 300) throw new Error(`Notion API ${code}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function hhaMmEnsureCheerioCurrent_() {
  if (typeof Cheerio === 'undefined' || !Cheerio || typeof Cheerio.load !== 'function') throw new Error('Cheerio library is unavailable in this Apps Script project.');
}
function hhaMmCleanTextCurrent_(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\u00A0/g, ' ').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function hhaMmNormalizeTextCurrent_(value) {
  return hhaMmCleanTextCurrent_(value).normalize('NFKC').replace(/\s+/g, '');
}
function hhaMmNormalizeNameCurrent_(value) {
  return hhaMmNormalizeTextCurrent_(value);
}

function hhaMmNormalizeKanaCurrent_(value) {
  const normalized = hhaMmCleanTextCurrent_(value)
    .normalize('NFKC')
    .replace(/\s+/g, '');

  return normalized.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}
function hhaMmNormalizeRomanizedCurrent_(value) {
  return hhaMmCleanTextCurrent_(value).normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
}
function hhaMmParseJapaneseDateCurrent_(value) {
  const match = hhaMmCleanTextCurrent_(value).match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  return match ? [String(match[1]).padStart(4, '0'), String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join('-') : '';
}
function hhaMmParseHeightCurrent_(value) {
  const match = hhaMmCleanTextCurrent_(value).match(/(\d+(?:\.\d+)?)\s*cm/i);
  return match ? Number(match[1]) : null;
}
function hhaMmAbsoluteUrlCurrent_(href) {
  const value = hhaMmCleanTextCurrent_(href);
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : HHA_MEMBER_MAINTENANCE_CURRENT.BASE_URL + (value.charAt(0) === '/' ? value : '/' + value);
}
function hhaMmCanonicalizeUrlCurrent_(value) {
  return hhaMmCleanTextCurrent_(value).replace(/^http:\/\//i, 'https://').replace(/[?&]ima=\d+/gi, '').replace(/[?&]$/, '').replace(/\/$/, '');
}
function hhaMmIssueCurrent_(type, member, message) {
  return { type, severity: 'REVIEW', memberId: member.memberId, memberName: member.memberName, officialMemberId: member.officialMemberId, message };
}
function hhaMmProfileErrorCurrent_(type, canonical, err) {
  return { type, severity: 'REVIEW', memberId: canonical.memberId, memberName: canonical.memberName, officialMemberId: canonical.officialMemberId, profileUrl: canonical.officialProfileUrl, error: String(err && err.message ? err.message : err) };
}
function hhaMmRosterErrorReportCurrent_(canonicalCurrentCount, type, err) {
  return {
    write: 'NONE', sourceUrl: HHA_MEMBER_MAINTENANCE_CURRENT.ROSTER_URL, canonicalCurrentCount,
    officialVisibleUniqueCount: 0, rawVisibleElementCount: 0, deduplicatedElementCount: 0,
    hiddenOfficialElementCount: 0, hiddenOfficialMemberIds: [], candidateCount: 0, candidates: [],
    informationalObservationCount: 0, informationalObservations: [], errorCount: 1,
    errors: [{ type, severity: 'REVIEW', error: String(err && err.message ? err.message : err) }], observedVisibleMembers: []
  };
}
function hhaMmLogCurrent_(title, payload) {
  console.log('============================================================');
  console.log(title);
  console.log(`VERSION = ${HHA_MEMBER_MAINTENANCE_CURRENT.VERSION}`);
  console.log('WRITE = NONE');
  console.log('CANONICAL AUTO UPDATE = NONE');
  console.log('============================================================');
  console.log(JSON.stringify(payload, null, 2));
}


// ============================================================
// RAW SNAPSHOT CURRENT / PILOT
// ============================================================

/**
 * HHA Member Raw Snapshot Current / Pilot
 *
 * Purpose:
 * - Verify append-only official HTML snapshot saving to the existing
 *   HHA_Member_Watcher/Raw_Snapshots tree.
 *
 * Safety:
 * - MANUAL PILOT ONLY
 * - DRIVE WRITE = RAW SNAPSHOT ONLY
 * - NOTION WRITE = NONE
 * - CANONICAL AUTO UPDATE = NONE
 * - Trigger installation is explicit/manual only.
 *
 * Dependency:
 * - hha_member_maintenance_v0.1.2.gs must exist in the same Apps Script project.
 */

const HHA_MEMBER_RAW_SNAPSHOT_CURRENT = Object.freeze({
  VERSION: '0.1.0-current-pilot',
  ROOT_FOLDER_ID: '17FyKoFOA6QlF6fo0RWFcnmPLq7N1lBsb',
  TIME_ZONE: 'Asia/Tokyo',
  PROFILE_MAX_PER_RUN: 1
});

function previewHhaMemberRawSnapshotPlanCurrent() {
  const report = hhaMmBuildRawSnapshotPlanCurrentRaw_(new Date());

  console.log('============================================================');
  console.log('HHA MEMBER RAW SNAPSHOT PLAN PILOT v0.1.0');
  console.log('WRITE = NONE');
  console.log('============================================================');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

function saveHhaMemberRawSnapshotsCurrentPilot() {
  const now = new Date();
  const plan = hhaMmBuildRawSnapshotPlanCurrentRaw_(now);

  const root = DriveApp.getFolderById(
    HHA_MEMBER_RAW_SNAPSHOT_CURRENT.ROOT_FOLDER_ID
  );

  const yearResult = hhaMmGetOrCreateSnapshotFolderCurrentRaw_(
    root,
    plan.targetYear
  );

  const monthResult = hhaMmGetOrCreateSnapshotFolderCurrentRaw_(
    yearResult.folder,
    plan.targetMonth
  );

  const created = [];
  const skipped = [];
  const duplicateProbes = [];
  const errors = [];

  function processSnapshot(prefix, sourceUrl, memberId) {
    try {
      const html = hhaMmFetchTextCurrent_(sourceUrl);

      const first = hhaMmSaveRawSnapshotCurrentRaw_(
        monthResult.folder,
        prefix,
        html,
        now,
        sourceUrl,
        memberId || ''
      );

      if (first.status === 'CREATED') {
        created.push(first);
      } else {
        skipped.push(first);
      }

      // Same fetched HTML is submitted once more intentionally.
      // This verifies hash-based duplicate protection without another HTTP fetch.
      const probe = hhaMmSaveRawSnapshotCurrentRaw_(
        monthResult.folder,
        prefix,
        html,
        now,
        sourceUrl,
        memberId || ''
      );

      duplicateProbes.push(probe);

    } catch (err) {
      errors.push({
        prefix: prefix,
        memberId: memberId || '',
        sourceUrl: sourceUrl,
        error: String(err && err.message ? err.message : err)
      });
    }
  }

  processSnapshot(
    'roster',
    HHA_MEMBER_MAINTENANCE_CURRENT.ROSTER_URL,
    ''
  );

  plan.profileTargets.forEach(function(target) {
    processSnapshot(
      target.memberId,
      target.profileUrl,
      target.memberId
    );
  });

  const report = {
    version: HHA_MEMBER_RAW_SNAPSHOT_CURRENT.VERSION,
    write: 'DRIVE_ONLY',
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE',
    autoTrigger: false,

    rootFolderId: HHA_MEMBER_RAW_SNAPSHOT_CURRENT.ROOT_FOLDER_ID,
    targetYear: plan.targetYear,
    targetMonth: plan.targetMonth,

    yearFolderCreated: yearResult.created,
    monthFolderCreated: monthResult.created,

    rosterTargetCount: 1,
    profileTargetCount: plan.profileTargets.length,

    createdCount: created.length,
    skippedCount: skipped.length,
    duplicateProbeCount: duplicateProbes.length,
    duplicateProbeSkippedCount: duplicateProbes.filter(
      function(x) { return x.status === 'SKIPPED_DUPLICATE'; }
    ).length,

    errorCount: errors.length,

    created: created,
    skipped: skipped,
    duplicateProbes: duplicateProbes,
    errors: errors
  };

  console.log('============================================================');
  console.log('HHA MEMBER RAW SNAPSHOT SAVE PILOT v0.1.0');
  console.log('DRIVE WRITE = RAW SNAPSHOT ONLY');
  console.log('NOTION WRITE = NONE');
  console.log('CANONICAL AUTO UPDATE = NONE');
  console.log('============================================================');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

function hhaMmBuildRawSnapshotPlanCurrentRaw_(now) {
  const members = hhaMmLoadCanonicalMembersCurrent_()
    .filter(function(member) {
      return member.activityStatus === '在籍中' &&
        !!member.memberId &&
        !!member.officialProfileUrl;
    })
    .sort(function(a, b) {
      const ao = a.memberOrder === null ? 999999 : a.memberOrder;
      const bo = b.memberOrder === null ? 999999 : b.memberOrder;
      return ao - bo;
    });

  const profileTargets = members
    .slice(0, HHA_MEMBER_RAW_SNAPSHOT_CURRENT.PROFILE_MAX_PER_RUN)
    .map(function(member) {
      return {
        memberId: member.memberId,
        memberName: member.memberName,
        officialMemberId: member.officialMemberId,
        profileUrl: member.officialProfileUrl
      };
    });

  return {
    version: HHA_MEMBER_RAW_SNAPSHOT_CURRENT.VERSION,
    write: 'NONE',
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE',
    autoTrigger: false,

    rootFolderId: HHA_MEMBER_RAW_SNAPSHOT_CURRENT.ROOT_FOLDER_ID,

    targetYear: Utilities.formatDate(
      now,
      HHA_MEMBER_RAW_SNAPSHOT_CURRENT.TIME_ZONE,
      'yyyy'
    ),

    targetMonth: Utilities.formatDate(
      now,
      HHA_MEMBER_RAW_SNAPSHOT_CURRENT.TIME_ZONE,
      'yyyy-MM'
    ),

    rosterUrl: HHA_MEMBER_MAINTENANCE_CURRENT.ROSTER_URL,
    profileTargetCount: profileTargets.length,
    profileTargets: profileTargets
  };
}

function hhaMmGetOrCreateSnapshotFolderCurrentRaw_(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);

  if (!folders.hasNext()) {
    return {
      folder: parentFolder.createFolder(name),
      created: true
    };
  }

  const folder = folders.next();

  if (folders.hasNext()) {
    throw new Error(
      'Duplicate snapshot folders found under the same parent: ' + name
    );
  }

  return {
    folder: folder,
    created: false
  };
}

function hhaMmSaveRawSnapshotCurrentRaw_(
  folder,
  prefix,
  html,
  capturedAt,
  sourceUrl,
  memberId
) {
  const sha256 = hhaMmSha256HexCurrentRaw_(html);
  const sha12 = sha256.substring(0, 12);

  const existing = hhaMmFindSnapshotByHashCurrentRaw_(
    folder,
    prefix,
    sha12
  );

  if (existing) {
    return {
      status: 'SKIPPED_DUPLICATE',
      prefix: prefix,
      memberId: memberId || '',
      sourceUrl: sourceUrl,
      sha256: sha256,
      sha12: sha12,
      fileId: existing.getId(),
      fileName: existing.getName()
    };
  }

  const timestamp = Utilities.formatDate(
    capturedAt,
    HHA_MEMBER_RAW_SNAPSHOT_CURRENT.TIME_ZONE,
    'yyyyMMdd_HHmmss'
  );

  const fileName =
    prefix + '_' + timestamp + '_' + sha12 + '.html';

  const file = folder.createFile(
    fileName,
    String(html),
    'text/html'
  );

  file.setDescription([
    'HHA Member Raw Snapshot',
    'Pilot Version: ' + HHA_MEMBER_RAW_SNAPSHOT_CURRENT.VERSION,
    'Captured At: ' + capturedAt.toISOString(),
    'Source URL: ' + sourceUrl,
    'Member_ID: ' + (memberId || ''),
    'SHA-256: ' + sha256
  ].join('\n'));

  return {
    status: 'CREATED',
    prefix: prefix,
    memberId: memberId || '',
    sourceUrl: sourceUrl,
    sha256: sha256,
    sha12: sha12,
    fileId: file.getId(),
    fileName: file.getName()
  };
}

function hhaMmFindSnapshotByHashCurrentRaw_(folder, prefix, sha12) {
  const suffix = '_' + sha12 + '.html';
  const prefixMarker = prefix + '_';

  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();

    if (
      name.indexOf(prefixMarker) === 0 &&
      name.lastIndexOf(suffix) === name.length - suffix.length
    ) {
      return file;
    }
  }

  return null;
}

function hhaMmSha256HexCurrentRaw_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    const unsigned = byte < 0 ? byte + 256 : byte;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

// ============================================================
// MEMBER WATCH RUNTIME OPS CURRENT / PILOT
// Source: gas/hha_member_maintenance_runtime_ops_v0.1.0.gs
// ============================================================
/**
 * HHA Member Maintenance Runtime Ops v0.1.0
 *
 * Status: CURRENT / PILOT
 *
 * Purpose:
 * - Provide scheduled-runner-ready entry points.
 * - Persist only observation continuity state in Script Properties.
 * - Promote a normal difference from OBSERVED_DIFF to STABLE_DIFF
 *   only when the same fingerprint appears on the next successful run.
 *
 * Safety:
 * - NOTION WRITE = NONE
 * - CANONICAL AUTO UPDATE = NONE
 * - Trigger installation is explicit/manual only.
 * - Script Properties contain observation state only.
 */

const HHA_MEMBER_WATCH_CURRENT = Object.freeze({
  VERSION: '0.1.0-current-pilot',

  STATE_KEYS: Object.freeze({
    ROSTER: 'HHA_MEMBER_WATCH_STATE_ROSTER_V1',
    PROFILE: 'HHA_MEMBER_WATCH_STATE_PROFILE_V1'
  }),

  IMMEDIATE_REVIEW_TYPES: Object.freeze([
    'NEW_OFFICIAL_MEMBER'
  ]),

  LOCK_TIMEOUT_MS: 5000
});


/**
 * Future DAILY runner.
 *
 * Current behavior:
 * - Official Roster read
 * - Canonical comparison
 * - Script Property observation-state update only
 * - No Canonical / Notion write
 */
function runHhaMemberRosterWatchCurrent() {
  const report = previewHhaMemberRosterMaintenanceCurrent();

  return hhaMemberWatchProcessSourceCurrent_({
    scope: 'ROSTER',
    stateKey: HHA_MEMBER_WATCH_CURRENT.STATE_KEYS.ROSTER,
    candidateCount: report.candidateCount || 0,
    candidates: report.candidates || [],
    errorCount: report.errorCount || 0,
    errors: report.errors || [],
    sourceSummary: {
      canonicalCurrentCount: report.canonicalCurrentCount,
      officialVisibleUniqueCount: report.officialVisibleUniqueCount,
      hiddenOfficialElementCount: report.hiddenOfficialElementCount
    }
  });
}


/**
 * Future WEEKLY runner.
 *
 * Current behavior:
 * - All current member Profile reads
 * - Canonical comparison
 * - Script Property observation-state update only
 * - No Canonical / Notion write
 */
function runHhaMemberProfileWatchCurrent() {
  const report = previewHhaMemberProfileMaintenanceCurrent();

  return hhaMemberWatchProcessSourceCurrent_({
    scope: 'PROFILE',
    stateKey: HHA_MEMBER_WATCH_CURRENT.STATE_KEYS.PROFILE,
    candidateCount: report.candidateCount || 0,
    candidates: report.candidates || [],
    errorCount: report.errorCount || 0,
    errors: report.errors || [],
    sourceSummary: {
      targetCount: report.targetCount,
      observationCount: report.observationCount
    }
  });
}


/**
 * Future WEEKLY Canonical structural audit.
 *
 * Structural integrity violations do not need a second external observation.
 * They are surfaced immediately for Human Review.
 *
 * WRITE = NONE
 */
function runHhaMemberCanonicalAuditCurrent() {
  const report = previewHhaMemberCanonicalIntegrityCurrent();

  const reviewItems = (report.issues || []).map(function(issue) {
    return {
      status: 'IMMEDIATE_REVIEW',
      type: issue.type || '',
      memberId: issue.memberId || '',
      memberName: issue.memberName || '',
      officialMemberId: issue.officialMemberId || '',
      message: issue.message || ''
    };
  });

  const out = {
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    scope: 'CANONICAL_INTEGRITY',

    write: 'NONE',
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE',
    scriptPropertyWrite: 'NONE',

    canonicalCount: report.canonicalCount,
    currentCount: report.currentCount,
    issueCount: report.issueCount,

    reviewRequired: reviewItems.length > 0,
    reviewItems: reviewItems
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER CANONICAL AUDIT CURRENT',
    out
  );

  return out;
}


/**
 * Read current continuity state without modifying it.
 */
function previewHhaMemberWatchStateCurrent() {
  const roster = hhaMemberWatchReadStateCurrent_(
    HHA_MEMBER_WATCH_CURRENT.STATE_KEYS.ROSTER
  );

  const profile = hhaMemberWatchReadStateCurrent_(
    HHA_MEMBER_WATCH_CURRENT.STATE_KEYS.PROFILE
  );

  const out = {
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    write: 'NONE',

    roster: {
      lastSuccessfulRunAt: roster.lastSuccessfulRunAt || '',
      activeCount: (roster.active || []).length,
      active: roster.active || []
    },

    profile: {
      lastSuccessfulRunAt: profile.lastSuccessfulRunAt || '',
      activeCount: (profile.active || []).length,
      active: profile.active || []
    }
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER WATCH STATE PREVIEW',
    out
  );

  return out;
}


/**
 * Pure transition test.
 *
 * Does NOT read or write Script Properties.
 */
function testHhaMemberDiffStabilityCurrent() {
  const empty = hhaMemberWatchEmptyStateCurrent_();

  const candidateA = {
    type: 'PROFILE_HEIGHT_DIFF',
    severity: 'REVIEW',
    memberId: 'MEM-999',
    memberName: 'TEST MEMBER',
    officialMemberId: '999',
    property: 'Height_cm',
    canonicalValue: 160,
    observedValue: 161,
    sourceUrl: 'https://example.invalid/member/999'
  };

  const first = hhaMemberWatchTransitionCurrent_(
    empty,
    [candidateA],
    '2026-10-05T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    first.active.length === 1 &&
    first.active[0].status === 'OBSERVED_DIFF',
    'First normal difference must be OBSERVED_DIFF.'
  );

  const second = hhaMemberWatchTransitionCurrent_(
    first,
    [candidateA],
    '2026-10-06T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    second.active.length === 1 &&
    second.active[0].status === 'STABLE_DIFF' &&
    second.active[0].consecutiveSuccessfulObservations === 2,
    'Second consecutive identical difference must become STABLE_DIFF.'
  );

  const changedCandidate = Object.assign({}, candidateA, {
    observedValue: 162
  });

  const changed = hhaMemberWatchTransitionCurrent_(
    second,
    [changedCandidate],
    '2026-10-07T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    changed.active.length === 1 &&
    changed.active[0].status === 'OBSERVED_DIFF' &&
    changed.active[0].consecutiveSuccessfulObservations === 1 &&
    changed.resolvedFingerprints.length === 1,
    'Changed observed value must start a new OBSERVED_DIFF fingerprint.'
  );

  const newMember = {
    type: 'NEW_OFFICIAL_MEMBER',
    severity: 'HIGH_REVIEW',
    official: {
      officialMemberId: '999',
      memberName: 'NEW MEMBER',
      profileUrl: 'https://example.invalid/member/999'
    }
  };

  const immediate = hhaMemberWatchTransitionCurrent_(
    empty,
    [newMember],
    '2026-10-05T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    immediate.active.length === 1 &&
    immediate.active[0].status === 'IMMEDIATE_REVIEW',
    'NEW_OFFICIAL_MEMBER must be IMMEDIATE_REVIEW on first observation.'
  );

  const cleared = hhaMemberWatchTransitionCurrent_(
    second,
    [],
    '2026-10-07T00:00:00.000Z'
  );

  hhaMemberWatchAssertCurrent_(
    cleared.active.length === 0 &&
    cleared.resolvedFingerprints.length === 1,
    'A difference absent on the next successful run must leave active state.'
  );

  const out = {
    write: 'NONE',
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    pass: true,
    checks: {
      firstObservation: 'OBSERVED_DIFF',
      secondIdenticalObservation: 'STABLE_DIFF',
      changedFingerprint: 'OBSERVED_DIFF',
      newOfficialMember: 'IMMEDIATE_REVIEW',
      resolvedWhenAbsentOnNextSuccessfulRun: true
    }
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER DIFF STABILITY PURE TEST',
    out
  );

  return out;
}



/**
 * Install HHA Member Watch triggers.
 *
 * Explicit/manual installation only.
 *
 * Schedule (Asia/Tokyo):
 * - Roster Watch: daily around 03:00
 * - Profile Watch: Sunday around 04:00
 * - Canonical Audit: Sunday around 05:00
 *
 * This function never changes Canonical HHA or Notion.
 */
function installHhaMemberWatchTriggersCurrent() {
  const handlers = [
    'runHhaMemberRosterWatchCurrent',
    'runHhaMemberProfileWatchCurrent',
    'runHhaMemberCanonicalAuditCurrent'
  ];

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error(
      'Could not acquire HHA Member Watch trigger installation lock.'
    );
  }

  try {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    ScriptApp
      .newTrigger('runHhaMemberRosterWatchCurrent')
      .timeBased()
      .atHour(3)
      .everyDays(1)
      .inTimezone('Asia/Tokyo')
      .create();

    ScriptApp
      .newTrigger('runHhaMemberProfileWatchCurrent')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(4)
      .inTimezone('Asia/Tokyo')
      .create();

    ScriptApp
      .newTrigger('runHhaMemberCanonicalAuditCurrent')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(5)
      .inTimezone('Asia/Tokyo')
      .create();

  } finally {
    lock.releaseLock();
  }

  const audit = auditHhaMemberWatchTriggersCurrent();

  if (!audit.ok) {
    throw new Error(
      'HHA Member Watch trigger audit failed after installation.'
    );
  }

  return audit;
}


/**
 * Read-only HHA Member Watch trigger audit.
 *
 * Apps Script does not expose full clock scheduling details from an
 * installed Trigger object, so this audit verifies:
 * - exactly one trigger per expected handler
 * - CLOCK source
 * - no duplicate HHA Member Watch triggers
 *
 * Expected schedule is reported from the Current configuration.
 */
function auditHhaMemberWatchTriggersCurrent() {
  const expected = [
    {
      handler: 'runHhaMemberRosterWatchCurrent',
      schedule: 'DAILY / 03:00 hour / Asia-Tokyo'
    },
    {
      handler: 'runHhaMemberProfileWatchCurrent',
      schedule: 'SUNDAY / 04:00 hour / Asia-Tokyo'
    },
    {
      handler: 'runHhaMemberCanonicalAuditCurrent',
      schedule: 'SUNDAY / 05:00 hour / Asia-Tokyo'
    }
  ];

  const expectedHandlers = expected.map(function(row) {
    return row.handler;
  });

  const allTriggers = ScriptApp.getProjectTriggers();

  const rows = allTriggers
    .filter(function(trigger) {
      return expectedHandlers.indexOf(
        trigger.getHandlerFunction()
      ) >= 0;
    })
    .map(function(trigger) {
      return {
        handler: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType()),
        source: String(trigger.getTriggerSource()),
        sourceId: trigger.getTriggerSourceId
          ? String(trigger.getTriggerSourceId() || '')
          : ''
      };
    });

  const counts = {};

  expectedHandlers.forEach(function(handler) {
    counts[handler] = 0;
  });

  rows.forEach(function(row) {
    counts[row.handler] =
      Number(counts[row.handler] || 0) + 1;
  });

  const missing = expectedHandlers.filter(function(handler) {
    return counts[handler] === 0;
  });

  const duplicates = expectedHandlers.filter(function(handler) {
    return counts[handler] > 1;
  });

  const nonClock = rows.filter(function(row) {
    return row.eventType !== 'CLOCK' ||
      row.source !== 'CLOCK';
  });

  const out = {
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    write: 'NONE',

    expectedSchedule: expected,

    triggerCount: rows.length,
    triggers: rows,
    counts: counts,

    missing: missing,
    duplicates: duplicates,
    nonClock: nonClock,

    ok:
      missing.length === 0 &&
      duplicates.length === 0 &&
      nonClock.length === 0 &&
      rows.length === expected.length
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER WATCH TRIGGER AUDIT',
    out
  );

  return out;
}


/**
 * Explicit rollback tool.
 *
 * Deletes only the three HHA Member Watch triggers.
 * Observation state in Script Properties is preserved.
 */
function removeHhaMemberWatchTriggersCurrent() {
  const handlers = [
    'runHhaMemberRosterWatchCurrent',
    'runHhaMemberProfileWatchCurrent',
    'runHhaMemberCanonicalAuditCurrent'
  ];

  let deleted = 0;

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
      deleted++;
    }
  });

  const out = {
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    write: 'TRIGGER_CONFIG_ONLY',
    deleted: deleted,
    observationStatePreserved: true,
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE'
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER WATCH TRIGGERS REMOVED',
    out
  );

  return out;
}

function hhaMemberWatchProcessSourceCurrent_(input) {
  const nowIso = new Date().toISOString();

  if (Number(input.errorCount || 0) > 0) {
    const errorOut = {
      version: HHA_MEMBER_WATCH_CURRENT.VERSION,
      scope: input.scope,

      write: 'NONE',
      notionWrite: 'NONE',
      canonicalAutoUpdate: 'NONE',
      scriptPropertyWrite: 'SKIPPED_DUE_TO_SOURCE_ERROR',

      sourceSuccessful: false,
      stateUpdated: false,

      candidateCount: input.candidateCount || 0,
      errorCount: input.errorCount || 0,
      errors: input.errors || [],

      message:
        'Source run contained errors. Previous observation state is preserved and is not advanced or cleared.'
    };

    hhaMemberWatchLogCurrent_(
      'HHA MEMBER ' + input.scope + ' WATCH CURRENT',
      errorOut
    );

    return errorOut;
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(HHA_MEMBER_WATCH_CURRENT.LOCK_TIMEOUT_MS)) {
    throw new Error(
      'Could not acquire HHA Member Watch Script Lock.'
    );
  }

  let transition;

  try {
    const previous = hhaMemberWatchReadStateCurrent_(
      input.stateKey
    );

    transition = hhaMemberWatchTransitionCurrent_(
      previous,
      input.candidates || [],
      nowIso
    );

    hhaMemberWatchWriteStateCurrent_(
      input.stateKey,
      transition
    );

  } finally {
    lock.releaseLock();
  }

  const statusCounts = hhaMemberWatchStatusCountsCurrent_(
    transition.active
  );

  const reviewItems = transition.active.filter(function(item) {
    return item.status === 'STABLE_DIFF' ||
      item.status === 'IMMEDIATE_REVIEW';
  });

  const out = {
    version: HHA_MEMBER_WATCH_CURRENT.VERSION,
    scope: input.scope,

    write: 'SCRIPT_PROPERTIES_ONLY',
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE',
    scriptPropertyWrite: 'OBSERVATION_STATE_ONLY',

    sourceSuccessful: true,
    stateUpdated: true,

    sourceSummary: input.sourceSummary || {},

    candidateCount: input.candidateCount || 0,
    errorCount: 0,

    activeDifferenceCount: transition.active.length,
    observedDiffCount: statusCounts.OBSERVED_DIFF,
    stableDiffCount: statusCounts.STABLE_DIFF,
    immediateReviewCount: statusCounts.IMMEDIATE_REVIEW,

    resolvedSincePreviousSuccessfulRun:
      transition.resolvedFingerprints.length,

    reviewRequired: reviewItems.length > 0,
    reviewItems: reviewItems,

    lastSuccessfulRunAt: transition.lastSuccessfulRunAt
  };

  hhaMemberWatchLogCurrent_(
    'HHA MEMBER ' + input.scope + ' WATCH CURRENT',
    out
  );

  return out;
}


function hhaMemberWatchTransitionCurrent_(
  previousState,
  candidates,
  nowIso
) {
  const previous = previousState &&
    Array.isArray(previousState.active)
      ? previousState
      : hhaMemberWatchEmptyStateCurrent_();

  const previousByFingerprint = {};

  previous.active.forEach(function(item) {
    if (item && item.fingerprint) {
      previousByFingerprint[item.fingerprint] = item;
    }
  });

  const currentFingerprints = {};
  const active = [];

  (candidates || []).forEach(function(candidate) {
    const descriptor =
      hhaMemberWatchDescriptorCurrent_(candidate);

    const fingerprint =
      hhaMemberWatchFingerprintCurrent_(descriptor);

    if (currentFingerprints[fingerprint]) {
      return;
    }

    currentFingerprints[fingerprint] = true;

    const prior = previousByFingerprint[fingerprint] || null;

    const immediate =
      HHA_MEMBER_WATCH_CURRENT.IMMEDIATE_REVIEW_TYPES
        .indexOf(descriptor.type) >= 0;

    const consecutive =
      prior
        ? Number(prior.consecutiveSuccessfulObservations || 1) + 1
        : 1;

    const status =
      immediate
        ? 'IMMEDIATE_REVIEW'
        : prior
          ? 'STABLE_DIFF'
          : 'OBSERVED_DIFF';

    active.push({
      fingerprint: fingerprint,
      status: status,

      firstObservedAt:
        prior && prior.firstObservedAt
          ? prior.firstObservedAt
          : nowIso,

      lastObservedAt: nowIso,

      consecutiveSuccessfulObservations: consecutive,

      type: descriptor.type,
      severity: descriptor.severity,
      memberId: descriptor.memberId,
      memberName: descriptor.memberName,
      officialMemberId: descriptor.officialMemberId,
      property: descriptor.property,
      canonicalValue: descriptor.canonicalValue,
      observedValue: descriptor.observedValue,
      sourceUrl: descriptor.sourceUrl
    });
  });

  const resolvedFingerprints = previous.active
    .map(function(item) {
      return item && item.fingerprint
        ? item.fingerprint
        : '';
    })
    .filter(function(fingerprint) {
      return fingerprint &&
        !currentFingerprints[fingerprint];
    });

  return {
    schemaVersion: 1,
    lastSuccessfulRunAt: nowIso,
    active: active,
    resolvedFingerprints: resolvedFingerprints
  };
}


function hhaMemberWatchDescriptorCurrent_(candidate) {
  const c = candidate || {};
  const official = c.official || {};

  let observedValue = '';

  if (c.observedValue !== undefined) {
    observedValue =
      hhaMemberWatchStableValueCurrent_(c.observedValue);

  } else if (c.type === 'NEW_OFFICIAL_MEMBER') {
    observedValue = [
      official.officialMemberId || '',
      official.memberName || '',
      official.profileUrl || ''
    ].join('|');
  }

  return {
    type: String(c.type || ''),
    severity: String(c.severity || ''),

    memberId:
      String(c.memberId || ''),

    memberName:
      String(c.memberName || official.memberName || ''),

    officialMemberId:
      String(
        c.officialMemberId ||
        official.officialMemberId ||
        ''
      ),

    property:
      String(c.property || ''),

    canonicalValue:
      hhaMemberWatchStableValueCurrent_(
        c.canonicalValue
      ),

    observedValue:
      observedValue,

    sourceUrl:
      String(
        c.sourceUrl ||
        official.profileUrl ||
        ''
      )
  };
}


function hhaMemberWatchStableValueCurrent_(value) {
  if (value === undefined) return '';
  if (value === null) return null;

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
}


function hhaMemberWatchFingerprintCurrent_(descriptor) {
  const raw = JSON.stringify({
    type: descriptor.type,
    memberId: descriptor.memberId,
    memberName: descriptor.memberName,
    officialMemberId: descriptor.officialMemberId,
    property: descriptor.property,
    canonicalValue: descriptor.canonicalValue,
    observedValue: descriptor.observedValue,
    sourceUrl: descriptor.sourceUrl
  });

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    const unsigned = byte < 0
      ? byte + 256
      : byte;

    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}


function hhaMemberWatchReadStateCurrent_(stateKey) {
  const raw = PropertiesService
    .getScriptProperties()
    .getProperty(stateKey);

  if (!raw) {
    return hhaMemberWatchEmptyStateCurrent_();
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.active)) {
      throw new Error('Invalid state shape.');
    }

    return parsed;

  } catch (err) {
    throw new Error(
      'Invalid HHA Member Watch state for ' +
      stateKey +
      ': ' +
      String(err && err.message ? err.message : err)
    );
  }
}


function hhaMemberWatchWriteStateCurrent_(
  stateKey,
  state
) {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      stateKey,
      JSON.stringify(state)
    );
}


function hhaMemberWatchEmptyStateCurrent_() {
  return {
    schemaVersion: 1,
    lastSuccessfulRunAt: '',
    active: [],
    resolvedFingerprints: []
  };
}


function hhaMemberWatchStatusCountsCurrent_(active) {
  const counts = {
    OBSERVED_DIFF: 0,
    STABLE_DIFF: 0,
    IMMEDIATE_REVIEW: 0
  };

  (active || []).forEach(function(item) {
    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        item.status
      )
    ) {
      counts[item.status] += 1;
    }
  });

  return counts;
}


function hhaMemberWatchAssertCurrent_(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      'HHA Member Watch test failed: ' + message
    );
  }
}


function hhaMemberWatchLogCurrent_(title, payload) {
  console.log('========================================');
  console.log(title);
  console.log(
    'VERSION = ' +
    HHA_MEMBER_WATCH_CURRENT.VERSION
  );
  console.log(
    'NOTION WRITE = NONE'
  );
  console.log(
    'CANONICAL AUTO UPDATE = NONE'
  );
  console.log('========================================');
  console.log(JSON.stringify(payload, null, 2));
}
