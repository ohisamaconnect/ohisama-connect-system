/**
 * HHA Member Maintenance v0.1.1
 *
 * Status: CURRENT / PILOT
 * Contract: docs/HHA_MEMBER_MAINTENANCE_CONTRACT_v0.1.md
 *
 * Safety:
 * - PREVIEW ONLY
 * - NOTION WRITE = NONE
 * - CANONICAL AUTO UPDATE = NONE
 * - TRIGGER INSTALL = NONE
 *
 * v0.1.1 corrections:
 * - De-duplicate repeated official roster elements by Official_Member_ID.
 * - Distinguish already-known non-current Canonical members that remain visible
 *   on the official roster from genuinely new official members.
 */

const HHA_MEMBER_MAINTENANCE_V011 = Object.freeze({
  VERSION: '0.1.1',
  STATUS: 'CURRENT / PILOT',
  AUTO_TRIGGER: false,
  NOTION_WRITE: false,
  CANONICAL_AUTO_UPDATE: false,
  BASE_URL: 'https://www.hinatazaka46.com',
  ROSTER_URL: 'https://www.hinatazaka46.com/s/official/search/artist?ima=0000',
  HHA_MEMBERS_DATA_SOURCE_ID: 'df86e0ba-5478-4fc6-b30a-49cb1bd6c83d',
  NOTION_VERSION: '2026-03-11',
  HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; OhisamaConnect-HHA-Member-Maintenance/0.1.1)',
  HTTP_MAX_RETRIES: 3,
  PROFILE_FETCH_SLEEP_MS: 150,
  PROFILE_MAX_PER_RUN: 60
});

function previewHhaMemberMaintenanceV011() {
  const startedAt = new Date();
  const integrity = previewHhaMemberCanonicalIntegrityV011();
  const roster = previewHhaMemberRosterMaintenanceV011();
  const profiles = previewHhaMemberProfileMaintenanceV011();
  const report = {
    version: HHA_MEMBER_MAINTENANCE_V011.VERSION,
    status: HHA_MEMBER_MAINTENANCE_V011.STATUS,
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
  hhaMmLogV011_('HHA MEMBER MAINTENANCE PREVIEW', report);
  return report;
}

function previewHhaMemberCanonicalIntegrityV011() {
  const members = hhaMmLoadCanonicalMembersV011_();
  const issues = [];
  const memberIds = {};
  const memberOrders = {};
  const officialIds = {};

  members.forEach(member => {
    if (!member.memberId) {
      issues.push(hhaMmIssueV011_('MISSING_MEMBER_ID', member, 'Member_ID is empty.'));
    } else {
      if (!/^MEM-\d{3}$/.test(member.memberId)) {
        issues.push(hhaMmIssueV011_('INVALID_MEMBER_ID_FORMAT', member, `Member_ID must match MEM-000 format: ${member.memberId}`));
      }
      if (memberIds[member.memberId]) {
        issues.push(hhaMmIssueV011_('DUPLICATE_MEMBER_ID', member, `Duplicate Member_ID: ${member.memberId}`));
      } else {
        memberIds[member.memberId] = true;
      }
    }

    if (member.memberOrder === null) {
      issues.push(hhaMmIssueV011_('MISSING_MEMBER_ORDER', member, 'Member_Order is empty.'));
    } else if (memberOrders[String(member.memberOrder)]) {
      issues.push(hhaMmIssueV011_('DUPLICATE_MEMBER_ORDER', member, `Duplicate Member_Order: ${member.memberOrder}`));
    } else {
      memberOrders[String(member.memberOrder)] = true;
    }

    if (!member.memberName) issues.push(hhaMmIssueV011_('MISSING_MEMBER_NAME', member, 'Member_Name is empty.'));
    if (!member.activityStatus) issues.push(hhaMmIssueV011_('MISSING_ACTIVITY_STATUS', member, 'Activity_Status is empty.'));
    if (!member.verificationStatus) issues.push(hhaMmIssueV011_('MISSING_VERIFICATION_STATUS', member, 'Verification_Status is empty.'));
    if (!member.lastVerifiedAt) issues.push(hhaMmIssueV011_('MISSING_LAST_VERIFIED_AT', member, 'Last_Verified_At is empty.'));

    if (member.officialMemberId) {
      if (officialIds[member.officialMemberId]) {
        issues.push(hhaMmIssueV011_('DUPLICATE_OFFICIAL_MEMBER_ID', member, `Duplicate Official_Member_ID: ${member.officialMemberId}`));
      } else {
        officialIds[member.officialMemberId] = true;
      }
    }

    if (member.activityStatus === '在籍中' && !member.officialMemberId) {
      issues.push(hhaMmIssueV011_('CURRENT_MEMBER_MISSING_OFFICIAL_ID', member, 'Current member has no Official_Member_ID.'));
    }
    if (member.activityStatus === '在籍中' && !member.officialProfileUrl) {
      issues.push(hhaMmIssueV011_('CURRENT_MEMBER_MISSING_PROFILE_URL', member, 'Current member has no Official_Profile_URL.'));
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

function previewHhaMemberRosterMaintenanceV011() {
  const members = hhaMmLoadCanonicalMembersV011_();
  const currentMembers = members.filter(m => m.activityStatus === '在籍中');
  const allByOfficialId = {};
  const allByName = {};
  const currentByOfficialId = {};

  members.forEach(member => {
    if (member.officialMemberId) allByOfficialId[String(member.officialMemberId)] = member;
    const normalized = hhaMmNormalizeNameV011_(member.memberName);
    if (normalized) allByName[normalized] = member;
    if (member.activityStatus === '在籍中' && member.officialMemberId) {
      currentByOfficialId[String(member.officialMemberId)] = member;
    }
  });

  let html;
  try {
    html = hhaMmFetchTextV011_(HHA_MEMBER_MAINTENANCE_V011.ROSTER_URL);
  } catch (err) {
    return hhaMmRosterErrorReportV011_(currentMembers.length, 'ROSTER_FETCH_ERROR', err);
  }

  let roster;
  try {
    roster = hhaMmParseVisibleRosterV011_(html);
    if (!roster.visibleMembers.length || roster.visibleMembers.some(v => !v.officialMemberId || !v.memberName)) {
      throw new Error('Official roster parser returned zero visible members or incomplete required fields.');
    }
  } catch (err) {
    return hhaMmRosterErrorReportV011_(currentMembers.length, 'ROSTER_PARSE_ERROR', err);
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

      if (hhaMmNormalizeNameV011_(official.memberName) !== hhaMmNormalizeNameV011_(canonical.memberName)) {
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

      if (canonical.officialProfileUrl && hhaMmCanonicalizeUrlV011_(canonical.officialProfileUrl) !== hhaMmCanonicalizeUrlV011_(official.profileUrl)) {
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

    const sameNameCanonical = allByName[hhaMmNormalizeNameV011_(official.memberName)];
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
    sourceUrl: HHA_MEMBER_MAINTENANCE_V011.ROSTER_URL,
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

function previewHhaMemberProfileMaintenanceV011() {
  const members = hhaMmLoadCanonicalMembersV011_()
    .filter(m => m.activityStatus === '在籍中' && !!m.officialProfileUrl)
    .sort((a, b) => (a.memberOrder === null ? 999999 : a.memberOrder) - (b.memberOrder === null ? 999999 : b.memberOrder));

  if (members.length > HHA_MEMBER_MAINTENANCE_V011.PROFILE_MAX_PER_RUN) {
    throw new Error(`Profile target count ${members.length} exceeds pilot safety limit ${HHA_MEMBER_MAINTENANCE_V011.PROFILE_MAX_PER_RUN}.`);
  }

  const candidates = [];
  const observations = [];
  const errors = [];

  members.forEach((canonical, index) => {
    if (index > 0 && HHA_MEMBER_MAINTENANCE_V011.PROFILE_FETCH_SLEEP_MS > 0) {
      Utilities.sleep(HHA_MEMBER_MAINTENANCE_V011.PROFILE_FETCH_SLEEP_MS);
    }

    let html;
    try {
      html = hhaMmFetchTextV011_(canonical.officialProfileUrl);
    } catch (err) {
      errors.push(hhaMmProfileErrorV011_('PROFILE_FETCH_ERROR', canonical, err));
      return;
    }

    let observed;
    try {
      observed = hhaMmParseProfileV011_(html, canonical.officialProfileUrl, canonical.officialMemberId);
      const missingFields = hhaMmMissingProfileFieldsV011_(observed);
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
      errors.push(hhaMmProfileErrorV011_('PROFILE_PARSE_ERROR', canonical, err));
      return;
    }

    observations.push({ memberId: canonical.memberId, memberName: canonical.memberName, officialMemberId: canonical.officialMemberId, observed });
    hhaMmCompareFieldV011_(candidates, 'PROFILE_NAME_DIFF', canonical, observed, 'Member_Name', canonical.memberName, observed.memberName, hhaMmNormalizeNameV011_);
    hhaMmCompareFieldV011_(candidates, 'PROFILE_KANA_DIFF', canonical, observed, 'Name_Kana', canonical.nameKana, observed.nameKana, hhaMmNormalizeTextV011_);
    hhaMmCompareFieldV011_(candidates, 'PROFILE_ROMANIZED_NAME_DIFF', canonical, observed, 'Romanized_Name', canonical.romanizedName, observed.romanizedName, hhaMmNormalizeRomanizedV011_);
    hhaMmCompareFieldV011_(candidates, 'PROFILE_BIRTHDAY_DIFF', canonical, observed, 'Birthday', canonical.birthday, observed.birthday, hhaMmNormalizeTextV011_);
    hhaMmCompareNumberV011_(candidates, 'PROFILE_HEIGHT_DIFF', canonical, observed, 'Height_cm', canonical.heightCm, observed.heightCm);
    hhaMmCompareFieldV011_(candidates, 'PROFILE_HOMETOWN_DIFF', canonical, observed, 'Hometown', canonical.hometown, observed.hometown, hhaMmNormalizeTextV011_);
    hhaMmCompareFieldV011_(candidates, 'PROFILE_BLOOD_TYPE_DIFF', canonical, observed, 'Blood_Type', canonical.bloodType, observed.bloodType, hhaMmNormalizeTextV011_);
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

function hhaMmParseVisibleRosterV011_(html) {
  hhaMmEnsureCheerioV011_();
  const hiddenIds = hhaMmExtractHiddenRosterIdsV011_(html);
  const hiddenSet = {};
  hiddenIds.forEach(id => { hiddenSet[String(id)] = true; });
  const $ = Cheerio.load(html);
  const byId = {};
  let rawVisibleElementCount = 0;

  $('.p-member__item').each((_, el) => {
    const $el = $(el);
    const rawId = hhaMmCleanTextV011_($el.attr('data-member') || '');
    if (!rawId) return;
    const inlineStyle = String($el.attr('style') || '');
    if (/display\s*:\s*none/i.test(inlineStyle) || hiddenSet[String(rawId)]) return;

    rawVisibleElementCount++;
    const href = $el.find('a[href*="/s/official/artist/"]').first().attr('href') || '';
    const item = {
      officialMemberId: String(rawId),
      memberName: hhaMmCleanTextV011_($el.find('.c-member__name').first().text()),
      nameKana: hhaMmCleanTextV011_($el.find('.c-member__kana').first().text()),
      birthday: hhaMmParseJapaneseDateV011_(hhaMmCleanTextV011_($el.find('.c-member__birth').first().text())),
      profileUrl: href ? hhaMmAbsoluteUrlV011_(href) : `${HHA_MEMBER_MAINTENANCE_V011.BASE_URL}/s/official/artist/${rawId}?ima=0000`
    };

    const previous = byId[item.officialMemberId];
    if (!previous) {
      byId[item.officialMemberId] = item;
      return;
    }

    if (hhaMmNormalizeNameV011_(previous.memberName) !== hhaMmNormalizeNameV011_(item.memberName)) {
      throw new Error(`Conflicting repeated roster elements for Official_Member_ID=${item.officialMemberId}: ${previous.memberName} / ${item.memberName}`);
    }
  });

  const visibleMembers = Object.keys(byId).map(id => byId[id]).sort((a, b) => Number(a.officialMemberId) - Number(b.officialMemberId));
  return { hiddenMemberIds: hiddenIds, rawVisibleElementCount, visibleMembers };
}

function hhaMmExtractHiddenRosterIdsV011_(html) {
  const ids = {};
  const pattern = /li\s*\[\s*data-member\s*=\s*["']?(\d+)["']?\s*\]\s*\{[^}]*display\s*:\s*none\b[^}]*\}/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) ids[String(match[1])] = true;
  return Object.keys(ids).sort((a, b) => Number(a) - Number(b));
}

function hhaMmParseProfileV011_(html, sourceUrl, expectedOfficialId) {
  hhaMmEnsureCheerioV011_();
  const $ = Cheerio.load(html);
  const $name = $('.c-member__name--info').first();
  const romanizedName = hhaMmCleanTextV011_($name.find('.name_en').first().text());
  const $nameClone = $name.clone();
  $nameClone.find('.name_en').remove();
  const table = {};

  $('.p-member__info-table tr').each((_, tr) => {
    const $tr = $(tr);
    const key = hhaMmCleanTextV011_($tr.find('.c-member__info-td__name').first().text());
    const value = hhaMmCleanTextV011_($tr.find('.c-member__info-td__text').first().text());
    if (key) table[key] = value;
  });

  return {
    sourceUrl,
    officialMemberId: String(expectedOfficialId || ''),
    memberName: hhaMmCleanTextV011_($nameClone.text()),
    nameKana: hhaMmCleanTextV011_($('.p-member__info .c-member__kana').first().text()),
    romanizedName,
    birthday: hhaMmParseJapaneseDateV011_(table['生年月日'] || ''),
    heightCm: hhaMmParseHeightV011_(table['身長'] || ''),
    hometown: hhaMmCleanTextV011_(table['出身地'] || ''),
    bloodType: hhaMmCleanTextV011_(table['血液型'] || ''),
    rawLabels: table
  };
}

function hhaMmMissingProfileFieldsV011_(observed) {
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

function hhaMmCompareFieldV011_(candidates, type, canonical, observed, property, canonicalValue, observedValue, normalizer) {
  const normalize = normalizer || hhaMmNormalizeTextV011_;
  if (normalize(canonicalValue) !== normalize(observedValue)) {
    candidates.push({ type, severity: 'REVIEW', memberId: canonical.memberId, memberName: canonical.memberName, officialMemberId: canonical.officialMemberId, property, canonicalValue, observedValue, sourceUrl: observed.sourceUrl });
  }
}

function hhaMmCompareNumberV011_(candidates, type, canonical, observed, property, canonicalValue, observedValue) {
  const canonicalNumber = canonicalValue === null || canonicalValue === undefined || canonicalValue === '' ? null : Number(canonicalValue);
  if (canonicalNumber === null || Number.isNaN(canonicalNumber) || Math.abs(canonicalNumber - Number(observedValue)) > 0.0001) {
    candidates.push({ type, severity: 'REVIEW', memberId: canonical.memberId, memberName: canonical.memberName, officialMemberId: canonical.officialMemberId, property, canonicalValue, observedValue, sourceUrl: observed.sourceUrl });
  }
}

function hhaMmLoadCanonicalMembersV011_() {
  const rows = [];
  let cursor = null;
  do {
    const payload = { page_size: 100 };
    if (cursor) payload.start_cursor = cursor;
    const result = hhaMmNotionRequestV011_(`/v1/data_sources/${HHA_MEMBER_MAINTENANCE_V011.HHA_MEMBERS_DATA_SOURCE_ID}/query`, 'post', payload);
    (result.results || []).forEach(page => rows.push(hhaMmCanonicalMemberFromPageV011_(page)));
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return rows.sort((a, b) => (a.memberOrder === null ? 999999 : a.memberOrder) - (b.memberOrder === null ? 999999 : b.memberOrder));
}

function hhaMmCanonicalMemberFromPageV011_(page) {
  const p = page.properties || {};
  return {
    pageId: page.id || '',
    pageUrl: page.url || '',
    memberId: hhaMmNotionTextV011_(p['Member_ID']),
    memberName: hhaMmNotionTitleV011_(p['Member_Name']),
    memberOrder: hhaMmNotionNumberV011_(p['Member_Order']),
    generation: hhaMmNotionSelectV011_(p['Generation']),
    activityStatus: hhaMmNotionSelectV011_(p['Activity_Status']),
    membershipStartDate: hhaMmNotionDateV011_(p['Membership_Start_Date']),
    membershipEndDate: hhaMmNotionDateV011_(p['Membership_End_Date']),
    officialMemberId: hhaMmNotionTextV011_(p['Official_Member_ID']),
    officialProfileUrl: hhaMmNotionUrlV011_(p['Official_Profile_URL']),
    officialBlogUrl: hhaMmNotionUrlV011_(p['Official_Blog_URL']),
    nameKana: hhaMmNotionTextV011_(p['Name_Kana']),
    romanizedName: hhaMmNotionTextV011_(p['Romanized_Name']),
    birthday: hhaMmNotionDateV011_(p['Birthday']),
    heightCm: hhaMmNotionNumberV011_(p['Height_cm']),
    hometown: hhaMmNotionSelectV011_(p['Hometown']),
    bloodType: hhaMmNotionSelectV011_(p['Blood_Type']),
    verificationStatus: hhaMmNotionSelectV011_(p['Verification_Status']),
    lastVerifiedAt: hhaMmNotionDateV011_(p['Last_Verified_At'])
  };
}

function hhaMmNotionTitleV011_(property) {
  return property && Array.isArray(property.title) ? property.title.map(v => v.plain_text || '').join('').trim() : '';
}
function hhaMmNotionTextV011_(property) {
  return property && Array.isArray(property.rich_text) ? property.rich_text.map(v => v.plain_text || '').join('').trim() : '';
}
function hhaMmNotionSelectV011_(property) {
  return property && property.select && property.select.name ? String(property.select.name).trim() : '';
}
function hhaMmNotionNumberV011_(property) {
  return !property || property.number === null || property.number === undefined ? null : Number(property.number);
}
function hhaMmNotionDateV011_(property) {
  return property && property.date && property.date.start ? String(property.date.start).slice(0, 10) : '';
}
function hhaMmNotionUrlV011_(property) {
  return property && property.url ? String(property.url).trim() : '';
}

function hhaMmFetchTextV011_(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= HHA_MEMBER_MAINTENANCE_V011.HTTP_MAX_RETRIES; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get', followRedirects: true, muteHttpExceptions: true,
        headers: { 'User-Agent': HHA_MEMBER_MAINTENANCE_V011.HTTP_USER_AGENT }
      });
      const code = response.getResponseCode();
      if (code >= 200 && code < 300) return response.getContentText('UTF-8');
      lastError = new Error(`HTTP ${code}: ${url}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < HHA_MEMBER_MAINTENANCE_V011.HTTP_MAX_RETRIES) Utilities.sleep(500 * attempt);
  }
  throw new Error(`Failed to fetch official source after retries: ${url} / ${String(lastError && lastError.message ? lastError.message : lastError)}`);
}

function hhaMmNotionRequestV011_(path, method, body) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('NOTION_TOKEN') || props.getProperty('NOTION_API_TOKEN') || props.getProperty('NOTION_SECRET');
  if (!token) throw new Error('Notion token is not set. Expected NOTION_TOKEN (fallback: NOTION_API_TOKEN / NOTION_SECRET).');
  const options = {
    method: method || 'get', muteHttpExceptions: true,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': HHA_MEMBER_MAINTENANCE_V011.NOTION_VERSION, 'Content-Type': 'application/json' }
  };
  if (body !== undefined && body !== null) options.payload = JSON.stringify(body);
  const response = UrlFetchApp.fetch(`https://api.notion.com${path}`, options);
  const code = response.getResponseCode();
  const text = response.getContentText('UTF-8');
  if (code < 200 || code >= 300) throw new Error(`Notion API ${code}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function hhaMmEnsureCheerioV011_() {
  if (typeof Cheerio === 'undefined' || !Cheerio || typeof Cheerio.load !== 'function') throw new Error('Cheerio library is unavailable in this Apps Script project.');
}
function hhaMmCleanTextV011_(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\u00A0/g, ' ').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function hhaMmNormalizeTextV011_(value) {
  return hhaMmCleanTextV011_(value).normalize('NFKC').replace(/\s+/g, '');
}
function hhaMmNormalizeNameV011_(value) {
  return hhaMmNormalizeTextV011_(value);
}
function hhaMmNormalizeRomanizedV011_(value) {
  return hhaMmCleanTextV011_(value).normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
}
function hhaMmParseJapaneseDateV011_(value) {
  const match = hhaMmCleanTextV011_(value).match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  return match ? [String(match[1]).padStart(4, '0'), String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join('-') : '';
}
function hhaMmParseHeightV011_(value) {
  const match = hhaMmCleanTextV011_(value).match(/(\d+(?:\.\d+)?)\s*cm/i);
  return match ? Number(match[1]) : null;
}
function hhaMmAbsoluteUrlV011_(href) {
  const value = hhaMmCleanTextV011_(href);
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : HHA_MEMBER_MAINTENANCE_V011.BASE_URL + (value.charAt(0) === '/' ? value : '/' + value);
}
function hhaMmCanonicalizeUrlV011_(value) {
  return hhaMmCleanTextV011_(value).replace(/^http:\/\//i, 'https://').replace(/[?&]ima=\d+/gi, '').replace(/[?&]$/, '').replace(/\/$/, '');
}
function hhaMmIssueV011_(type, member, message) {
  return { type, severity: 'REVIEW', memberId: member.memberId, memberName: member.memberName, officialMemberId: member.officialMemberId, message };
}
function hhaMmProfileErrorV011_(type, canonical, err) {
  return { type, severity: 'REVIEW', memberId: canonical.memberId, memberName: canonical.memberName, officialMemberId: canonical.officialMemberId, profileUrl: canonical.officialProfileUrl, error: String(err && err.message ? err.message : err) };
}
function hhaMmRosterErrorReportV011_(canonicalCurrentCount, type, err) {
  return {
    write: 'NONE', sourceUrl: HHA_MEMBER_MAINTENANCE_V011.ROSTER_URL, canonicalCurrentCount,
    officialVisibleUniqueCount: 0, rawVisibleElementCount: 0, deduplicatedElementCount: 0,
    hiddenOfficialElementCount: 0, hiddenOfficialMemberIds: [], candidateCount: 0, candidates: [],
    informationalObservationCount: 0, informationalObservations: [], errorCount: 1,
    errors: [{ type, severity: 'REVIEW', error: String(err && err.message ? err.message : err) }], observedVisibleMembers: []
  };
}
function hhaMmLogV011_(title, payload) {
  console.log('============================================================');
  console.log(title);
  console.log(`VERSION = ${HHA_MEMBER_MAINTENANCE_V011.VERSION}`);
  console.log('WRITE = NONE');
  console.log('CANONICAL AUTO UPDATE = NONE');
  console.log('============================================================');
  console.log(JSON.stringify(payload, null, 2));
}
