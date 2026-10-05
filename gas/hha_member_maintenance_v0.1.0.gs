/**
 * HHA Member Maintenance v0.1.0
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
 * This pilot observes official Hinatazaka46 member pages and compares them
 * against the canonical HHA MEMBERS database. It never decides or writes
 * Canonical facts.
 */

const HHA_MEMBER_MAINTENANCE_V010 = Object.freeze({
  VERSION: '0.1.0',
  STATUS: 'CURRENT / PILOT',
  AUTO_TRIGGER: false,
  NOTION_WRITE: false,
  CANONICAL_AUTO_UPDATE: false,
  BASE_URL: 'https://www.hinatazaka46.com',
  ROSTER_URL: 'https://www.hinatazaka46.com/s/official/search/artist?ima=0000',
  HHA_MEMBERS_DATA_SOURCE_ID: 'df86e0ba-5478-4fc6-b30a-49cb1bd6c83d',
  NOTION_VERSION: '2026-03-11',
  HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; OhisamaConnect-HHA-Member-Maintenance/0.1.0)',
  HTTP_MAX_RETRIES: 3,
  PROFILE_FETCH_SLEEP_MS: 150,
  PROFILE_MAX_PER_RUN: 60
});

function previewHhaMemberMaintenanceV010() {
  const startedAt = new Date();
  const integrity = previewHhaMemberCanonicalIntegrityV010();
  const roster = previewHhaMemberRosterMaintenanceV010();
  const profiles = previewHhaMemberProfileMaintenanceV010();
  const report = {
    version: HHA_MEMBER_MAINTENANCE_V010.VERSION,
    status: HHA_MEMBER_MAINTENANCE_V010.STATUS,
    write: 'NONE',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    integrity: integrity,
    roster: roster,
    profiles: profiles,
    reviewRequired:
      integrity.issueCount > 0 ||
      roster.candidateCount > 0 ||
      profiles.candidateCount > 0 ||
      roster.errorCount > 0 ||
      profiles.errorCount > 0
  };
  hhaMemberMaintenanceLogV010_('HHA MEMBER MAINTENANCE PREVIEW', report);
  return report;
}

function previewHhaMemberCanonicalIntegrityV010() {
  const members = hhaMemberMaintenanceLoadCanonicalMembersV010_();
  const issues = [];
  const memberIds = {};
  const memberOrders = {};
  const officialIds = {};

  members.forEach(member => {
    if (!member.memberId) {
      issues.push(hhaMemberMaintenanceIssueV010_('MISSING_MEMBER_ID', member, 'Member_ID is empty.'));
    } else {
      if (!/^MEM-\d{3}$/.test(member.memberId)) {
        issues.push(hhaMemberMaintenanceIssueV010_('INVALID_MEMBER_ID_FORMAT', member, `Member_ID must match MEM-000 format: ${member.memberId}`));
      }
      if (memberIds[member.memberId]) {
        issues.push(hhaMemberMaintenanceIssueV010_('DUPLICATE_MEMBER_ID', member, `Duplicate Member_ID: ${member.memberId}`));
      } else {
        memberIds[member.memberId] = true;
      }
    }

    if (member.memberOrder === null) {
      issues.push(hhaMemberMaintenanceIssueV010_('MISSING_MEMBER_ORDER', member, 'Member_Order is empty.'));
    } else if (memberOrders[String(member.memberOrder)]) {
      issues.push(hhaMemberMaintenanceIssueV010_('DUPLICATE_MEMBER_ORDER', member, `Duplicate Member_Order: ${member.memberOrder}`));
    } else {
      memberOrders[String(member.memberOrder)] = true;
    }

    if (!member.memberName) {
      issues.push(hhaMemberMaintenanceIssueV010_('MISSING_MEMBER_NAME', member, 'Member_Name is empty.'));
    }
    if (!member.activityStatus) {
      issues.push(hhaMemberMaintenanceIssueV010_('MISSING_ACTIVITY_STATUS', member, 'Activity_Status is empty.'));
    }
    if (!member.verificationStatus) {
      issues.push(hhaMemberMaintenanceIssueV010_('MISSING_VERIFICATION_STATUS', member, 'Verification_Status is empty.'));
    }
    if (!member.lastVerifiedAt) {
      issues.push(hhaMemberMaintenanceIssueV010_('MISSING_LAST_VERIFIED_AT', member, 'Last_Verified_At is empty.'));
    }

    if (member.officialMemberId) {
      if (officialIds[member.officialMemberId]) {
        issues.push(hhaMemberMaintenanceIssueV010_('DUPLICATE_OFFICIAL_MEMBER_ID', member, `Duplicate Official_Member_ID: ${member.officialMemberId}`));
      } else {
        officialIds[member.officialMemberId] = true;
      }
    }

    if (member.activityStatus === '在籍中' && !member.officialMemberId) {
      issues.push(hhaMemberMaintenanceIssueV010_('CURRENT_MEMBER_MISSING_OFFICIAL_ID', member, 'Current member has no Official_Member_ID.'));
    }
    if (member.activityStatus === '在籍中' && !member.officialProfileUrl) {
      issues.push(hhaMemberMaintenanceIssueV010_('CURRENT_MEMBER_MISSING_PROFILE_URL', member, 'Current member has no Official_Profile_URL.'));
    }
  });

  return {
    write: 'NONE',
    canonicalCount: members.length,
    currentCount: members.filter(m => m.activityStatus === '在籍中').length,
    issueCount: issues.length,
    issues: issues
  };
}

function previewHhaMemberRosterMaintenanceV010() {
  const members = hhaMemberMaintenanceLoadCanonicalMembersV010_();
  const currentMembers = members.filter(m => m.activityStatus === '在籍中');
  const canonicalByOfficialId = {};
  const canonicalByName = {};
  currentMembers.forEach(member => {
    if (member.officialMemberId) canonicalByOfficialId[String(member.officialMemberId)] = member;
    const normalizedName = hhaMemberMaintenanceNormalizeNameV010_(member.memberName);
    if (normalizedName) canonicalByName[normalizedName] = member;
  });

  let html = '';
  try {
    html = hhaMemberMaintenanceFetchTextV010_(HHA_MEMBER_MAINTENANCE_V010.ROSTER_URL);
  } catch (err) {
    return {
      write: 'NONE',
      sourceUrl: HHA_MEMBER_MAINTENANCE_V010.ROSTER_URL,
      canonicalCurrentCount: currentMembers.length,
      officialVisibleCount: 0,
      hiddenOfficialElementCount: 0,
      hiddenOfficialMemberIds: [],
      candidateCount: 0,
      candidates: [],
      errorCount: 1,
      errors: [{
        type: 'ROSTER_FETCH_ERROR',
        severity: 'REVIEW',
        error: String(err && err.message ? err.message : err)
      }],
      observedVisibleMembers: []
    };
  }

  let roster;
  try {
    roster = hhaMemberMaintenanceParseVisibleRosterV010_(html);
    if (!roster.visibleMembers.length || roster.visibleMembers.some(v => !v.officialMemberId || !v.memberName)) {
      throw new Error('Official roster parser returned zero visible members or incomplete required fields.');
    }
  } catch (err) {
    return {
      write: 'NONE',
      sourceUrl: HHA_MEMBER_MAINTENANCE_V010.ROSTER_URL,
      canonicalCurrentCount: currentMembers.length,
      officialVisibleCount: 0,
      hiddenOfficialElementCount: 0,
      hiddenOfficialMemberIds: [],
      candidateCount: 0,
      candidates: [],
      errorCount: 1,
      errors: [{
        type: 'ROSTER_PARSE_ERROR',
        severity: 'REVIEW',
        error: String(err && err.message ? err.message : err)
      }],
      observedVisibleMembers: []
    };
  }

  const officialById = {};
  roster.visibleMembers.forEach(member => {
    officialById[String(member.officialMemberId)] = member;
  });

  const candidates = [];
  roster.visibleMembers.forEach(official => {
    const canonical = canonicalByOfficialId[String(official.officialMemberId)];
    if (!canonical) {
      const sameNameCanonical = canonicalByName[hhaMemberMaintenanceNormalizeNameV010_(official.memberName)];
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
          official: official,
          message: 'Visible official roster member is not matched to a Canonical current member.'
        });
      }
      return;
    }

    if (hhaMemberMaintenanceNormalizeNameV010_(official.memberName) !== hhaMemberMaintenanceNormalizeNameV010_(canonical.memberName)) {
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

    if (canonical.officialProfileUrl && hhaMemberMaintenanceCanonicalizeUrlV010_(canonical.officialProfileUrl) !== hhaMemberMaintenanceCanonicalizeUrlV010_(official.profileUrl)) {
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
    sourceUrl: HHA_MEMBER_MAINTENANCE_V010.ROSTER_URL,
    canonicalCurrentCount: currentMembers.length,
    officialVisibleCount: roster.visibleMembers.length,
    hiddenOfficialElementCount: roster.hiddenMemberIds.length,
    hiddenOfficialMemberIds: roster.hiddenMemberIds,
    candidateCount: candidates.length,
    candidates: candidates,
    errorCount: 0,
    errors: [],
    observedVisibleMembers: roster.visibleMembers
  };
}

function previewHhaMemberProfileMaintenanceV010() {
  const members = hhaMemberMaintenanceLoadCanonicalMembersV010_()
    .filter(m => m.activityStatus === '在籍中')
    .filter(m => !!m.officialProfileUrl)
    .sort((a, b) => {
      const ao = a.memberOrder === null ? 999999 : a.memberOrder;
      const bo = b.memberOrder === null ? 999999 : b.memberOrder;
      return ao - bo;
    });

  if (members.length > HHA_MEMBER_MAINTENANCE_V010.PROFILE_MAX_PER_RUN) {
    throw new Error(`Profile target count ${members.length} exceeds pilot safety limit ${HHA_MEMBER_MAINTENANCE_V010.PROFILE_MAX_PER_RUN}.`);
  }

  const candidates = [];
  const observations = [];
  const errors = [];

  members.forEach((canonical, index) => {
    if (index > 0 && HHA_MEMBER_MAINTENANCE_V010.PROFILE_FETCH_SLEEP_MS > 0) {
      Utilities.sleep(HHA_MEMBER_MAINTENANCE_V010.PROFILE_FETCH_SLEEP_MS);
    }

    let html = '';
    try {
      html = hhaMemberMaintenanceFetchTextV010_(canonical.officialProfileUrl);
    } catch (err) {
      errors.push({
        type: 'PROFILE_FETCH_ERROR',
        severity: 'REVIEW',
        memberId: canonical.memberId,
        memberName: canonical.memberName,
        officialMemberId: canonical.officialMemberId,
        profileUrl: canonical.officialProfileUrl,
        error: String(err && err.message ? err.message : err)
      });
      return;
    }

    let observed;
    try {
      observed = hhaMemberMaintenanceParseProfileV010_(html, canonical.officialProfileUrl, canonical.officialMemberId);
      const missingFields = hhaMemberMaintenanceMissingProfileFieldsV010_(observed);
      if (missingFields.length) {
        errors.push({
          type: 'PROFILE_PARSE_ERROR',
          severity: 'REVIEW',
          memberId: canonical.memberId,
          memberName: canonical.memberName,
          officialMemberId: canonical.officialMemberId,
          profileUrl: canonical.officialProfileUrl,
          missingFields: missingFields,
          message: 'Required official profile fields could not be parsed. No Canonical difference is inferred.'
        });
        return;
      }
    } catch (err) {
      errors.push({
        type: 'PROFILE_PARSE_ERROR',
        severity: 'REVIEW',
        memberId: canonical.memberId,
        memberName: canonical.memberName,
        officialMemberId: canonical.officialMemberId,
        profileUrl: canonical.officialProfileUrl,
        error: String(err && err.message ? err.message : err)
      });
      return;
    }

    observations.push({
      memberId: canonical.memberId,
      memberName: canonical.memberName,
      officialMemberId: canonical.officialMemberId,
      observed: observed
    });

    hhaMemberMaintenanceCompareProfileFieldV010_(candidates, 'PROFILE_NAME_DIFF', canonical, observed, 'Member_Name', canonical.memberName, observed.memberName, hhaMemberMaintenanceNormalizeNameV010_);
    hhaMemberMaintenanceCompareProfileFieldV010_(candidates, 'PROFILE_KANA_DIFF', canonical, observed, 'Name_Kana', canonical.nameKana, observed.nameKana, hhaMemberMaintenanceNormalizeTextV010_);
    hhaMemberMaintenanceCompareProfileFieldV010_(candidates, 'PROFILE_ROMANIZED_NAME_DIFF', canonical, observed, 'Romanized_Name', canonical.romanizedName, observed.romanizedName, hhaMemberMaintenanceNormalizeRomanizedV010_);
    hhaMemberMaintenanceCompareProfileFieldV010_(candidates, 'PROFILE_BIRTHDAY_DIFF', canonical, observed, 'Birthday', canonical.birthday, observed.birthday, hhaMemberMaintenanceNormalizeTextV010_);
    hhaMemberMaintenanceCompareProfileNumberV010_(candidates, 'PROFILE_HEIGHT_DIFF', canonical, observed, 'Height_cm', canonical.heightCm, observed.heightCm);
    hhaMemberMaintenanceCompareProfileFieldV010_(candidates, 'PROFILE_HOMETOWN_DIFF', canonical, observed, 'Hometown', canonical.hometown, observed.hometown, hhaMemberMaintenanceNormalizeTextV010_);
    hhaMemberMaintenanceCompareProfileFieldV010_(candidates, 'PROFILE_BLOOD_TYPE_DIFF', canonical, observed, 'Blood_Type', canonical.bloodType, observed.bloodType, hhaMemberMaintenanceNormalizeTextV010_);
  });

  return {
    write: 'NONE',
    targetCount: members.length,
    observationCount: observations.length,
    candidateCount: candidates.length,
    errorCount: errors.length,
    candidates: candidates,
    errors: errors,
    observations: observations
  };
}

function hhaMemberMaintenanceParseVisibleRosterV010_(html) {
  hhaMemberMaintenanceEnsureCheerioV010_();
  const hiddenIds = hhaMemberMaintenanceExtractHiddenRosterIdsV010_(html);
  const hiddenSet = {};
  hiddenIds.forEach(id => { hiddenSet[String(id)] = true; });
  const $ = Cheerio.load(html);
  const visibleMembers = [];

  $('.p-member__item').each((_, el) => {
    const $el = $(el);
    const rawId = hhaMemberMaintenanceCleanTextV010_($el.attr('data-member') || '');
    if (!rawId) return;
    const inlineStyle = String($el.attr('style') || '');
    if (/display\s*:\s*none/i.test(inlineStyle) || hiddenSet[String(rawId)]) return;

    const href = $el.find('a[href*="/s/official/artist/"]').first().attr('href') || '';
    const memberName = hhaMemberMaintenanceCleanTextV010_($el.find('.c-member__name').first().text());
    const nameKana = hhaMemberMaintenanceCleanTextV010_($el.find('.c-member__kana').first().text());
    const birthdayRaw = hhaMemberMaintenanceCleanTextV010_($el.find('.c-member__birth').first().text());
    visibleMembers.push({
      officialMemberId: String(rawId),
      memberName: memberName,
      nameKana: nameKana,
      birthday: hhaMemberMaintenanceParseJapaneseDateV010_(birthdayRaw),
      profileUrl: href ? hhaMemberMaintenanceAbsoluteUrlV010_(href) : `${HHA_MEMBER_MAINTENANCE_V010.BASE_URL}/s/official/artist/${rawId}?ima=0000`
    });
  });

  visibleMembers.sort((a, b) => Number(a.officialMemberId) - Number(b.officialMemberId));
  return { hiddenMemberIds: hiddenIds, visibleMembers: visibleMembers };
}

function hhaMemberMaintenanceExtractHiddenRosterIdsV010_(html) {
  const ids = {};
  const pattern = /li\s*\[\s*data-member\s*=\s*["']?(\d+)["']?\s*\]\s*\{[^}]*display\s*:\s*none\b[^}]*\}/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) ids[String(match[1])] = true;
  return Object.keys(ids).sort((a, b) => Number(a) - Number(b));
}

function hhaMemberMaintenanceParseProfileV010_(html, sourceUrl, expectedOfficialId) {
  hhaMemberMaintenanceEnsureCheerioV010_();
  const $ = Cheerio.load(html);
  const $name = $('.c-member__name--info').first();
  const romanizedName = hhaMemberMaintenanceCleanTextV010_($name.find('.name_en').first().text());
  const $nameClone = $name.clone();
  $nameClone.find('.name_en').remove();
  const memberName = hhaMemberMaintenanceCleanTextV010_($nameClone.text());
  const nameKana = hhaMemberMaintenanceCleanTextV010_($('.p-member__info .c-member__kana').first().text());
  const table = {};

  $('.p-member__info-table tr').each((_, tr) => {
    const $tr = $(tr);
    const key = hhaMemberMaintenanceCleanTextV010_($tr.find('.c-member__info-td__name').first().text());
    const value = hhaMemberMaintenanceCleanTextV010_($tr.find('.c-member__info-td__text').first().text());
    if (key) table[key] = value;
  });

  return {
    sourceUrl: sourceUrl,
    officialMemberId: String(expectedOfficialId || ''),
    memberName: memberName,
    nameKana: nameKana,
    romanizedName: romanizedName,
    birthday: hhaMemberMaintenanceParseJapaneseDateV010_(table['生年月日'] || ''),
    heightCm: hhaMemberMaintenanceParseHeightV010_(table['身長'] || ''),
    hometown: hhaMemberMaintenanceCleanTextV010_(table['出身地'] || ''),
    bloodType: hhaMemberMaintenanceCleanTextV010_(table['血液型'] || ''),
    rawLabels: table
  };
}

function hhaMemberMaintenanceMissingProfileFieldsV010_(observed) {
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

function hhaMemberMaintenanceCompareProfileFieldV010_(candidates, candidateType, canonical, observed, propertyName, canonicalValue, observedValue, normalizer) {
  const normalize = normalizer || hhaMemberMaintenanceNormalizeTextV010_;
  if (normalize(canonicalValue) !== normalize(observedValue)) {
    candidates.push({
      type: candidateType,
      severity: 'REVIEW',
      memberId: canonical.memberId,
      memberName: canonical.memberName,
      officialMemberId: canonical.officialMemberId,
      property: propertyName,
      canonicalValue: canonicalValue,
      observedValue: observedValue,
      sourceUrl: observed.sourceUrl
    });
  }
}

function hhaMemberMaintenanceCompareProfileNumberV010_(candidates, candidateType, canonical, observed, propertyName, canonicalValue, observedValue) {
  const canonicalNumber = canonicalValue === null || canonicalValue === undefined || canonicalValue === '' ? null : Number(canonicalValue);
  if (canonicalNumber === null || Number.isNaN(canonicalNumber) || Math.abs(canonicalNumber - Number(observedValue)) > 0.0001) {
    candidates.push({
      type: candidateType,
      severity: 'REVIEW',
      memberId: canonical.memberId,
      memberName: canonical.memberName,
      officialMemberId: canonical.officialMemberId,
      property: propertyName,
      canonicalValue: canonicalValue,
      observedValue: observedValue,
      sourceUrl: observed.sourceUrl
    });
  }
}

function hhaMemberMaintenanceLoadCanonicalMembersV010_() {
  const rows = [];
  let cursor = null;
  do {
    const payload = { page_size: 100 };
    if (cursor) payload.start_cursor = cursor;
    const result = hhaMemberMaintenanceNotionRequestV010_(`/v1/data_sources/${HHA_MEMBER_MAINTENANCE_V010.HHA_MEMBERS_DATA_SOURCE_ID}/query`, 'post', payload);
    (result.results || []).forEach(page => rows.push(hhaMemberMaintenanceCanonicalMemberFromPageV010_(page)));
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  rows.sort((a, b) => {
    const ao = a.memberOrder === null ? 999999 : a.memberOrder;
    const bo = b.memberOrder === null ? 999999 : b.memberOrder;
    return ao - bo;
  });
  return rows;
}

function hhaMemberMaintenanceCanonicalMemberFromPageV010_(page) {
  const p = page.properties || {};
  return {
    pageId: page.id || '',
    pageUrl: page.url || '',
    memberId: hhaMemberMaintenanceNotionTextV010_(p['Member_ID']),
    memberName: hhaMemberMaintenanceNotionTitleV010_(p['Member_Name']),
    memberOrder: hhaMemberMaintenanceNotionNumberV010_(p['Member_Order']),
    generation: hhaMemberMaintenanceNotionSelectV010_(p['Generation']),
    activityStatus: hhaMemberMaintenanceNotionSelectV010_(p['Activity_Status']),
    membershipStartDate: hhaMemberMaintenanceNotionDateV010_(p['Membership_Start_Date']),
    membershipEndDate: hhaMemberMaintenanceNotionDateV010_(p['Membership_End_Date']),
    officialMemberId: hhaMemberMaintenanceNotionTextV010_(p['Official_Member_ID']),
    officialProfileUrl: hhaMemberMaintenanceNotionUrlV010_(p['Official_Profile_URL']),
    officialBlogUrl: hhaMemberMaintenanceNotionUrlV010_(p['Official_Blog_URL']),
    nameKana: hhaMemberMaintenanceNotionTextV010_(p['Name_Kana']),
    romanizedName: hhaMemberMaintenanceNotionTextV010_(p['Romanized_Name']),
    birthday: hhaMemberMaintenanceNotionDateV010_(p['Birthday']),
    heightCm: hhaMemberMaintenanceNotionNumberV010_(p['Height_cm']),
    hometown: hhaMemberMaintenanceNotionSelectV010_(p['Hometown']),
    bloodType: hhaMemberMaintenanceNotionSelectV010_(p['Blood_Type']),
    penlightColor1: hhaMemberMaintenanceNotionSelectV010_(p['Penlight_Color_1']),
    penlightColor2: hhaMemberMaintenanceNotionSelectV010_(p['Penlight_Color_2']),
    verificationStatus: hhaMemberMaintenanceNotionSelectV010_(p['Verification_Status']),
    lastVerifiedAt: hhaMemberMaintenanceNotionDateV010_(p['Last_Verified_At'])
  };
}

function hhaMemberMaintenanceNotionTitleV010_(property) {
  if (!property || !Array.isArray(property.title)) return '';
  return property.title.map(v => v.plain_text || '').join('').trim();
}
function hhaMemberMaintenanceNotionTextV010_(property) {
  if (!property || !Array.isArray(property.rich_text)) return '';
  return property.rich_text.map(v => v.plain_text || '').join('').trim();
}
function hhaMemberMaintenanceNotionSelectV010_(property) {
  return property && property.select && property.select.name ? String(property.select.name).trim() : '';
}
function hhaMemberMaintenanceNotionNumberV010_(property) {
  if (!property || property.number === null || property.number === undefined) return null;
  return Number(property.number);
}
function hhaMemberMaintenanceNotionDateV010_(property) {
  if (!property || !property.date || !property.date.start) return '';
  return String(property.date.start).slice(0, 10);
}
function hhaMemberMaintenanceNotionUrlV010_(property) {
  return property && property.url ? String(property.url).trim() : '';
}

function hhaMemberMaintenanceFetchTextV010_(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= HHA_MEMBER_MAINTENANCE_V010.HTTP_MAX_RETRIES; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true,
        headers: { 'User-Agent': HHA_MEMBER_MAINTENANCE_V010.HTTP_USER_AGENT }
      });
      const code = response.getResponseCode();
      if (code >= 200 && code < 300) return response.getContentText('UTF-8');
      lastError = new Error(`HTTP ${code}: ${url}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < HHA_MEMBER_MAINTENANCE_V010.HTTP_MAX_RETRIES) Utilities.sleep(500 * attempt);
  }
  throw new Error(`Failed to fetch official source after retries: ${url} / ${String(lastError && lastError.message ? lastError.message : lastError)}`);
}

function hhaMemberMaintenanceNotionRequestV010_(path, method, body) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('NOTION_TOKEN') || props.getProperty('NOTION_API_TOKEN') || props.getProperty('NOTION_SECRET');
  if (!token) throw new Error('Notion token is not set. Expected NOTION_TOKEN (fallback: NOTION_API_TOKEN / NOTION_SECRET).');

  const options = {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': HHA_MEMBER_MAINTENANCE_V010.NOTION_VERSION,
      'Content-Type': 'application/json'
    }
  };
  if (body !== undefined && body !== null) options.payload = JSON.stringify(body);

  const response = UrlFetchApp.fetch(`https://api.notion.com${path}`, options);
  const code = response.getResponseCode();
  const text = response.getContentText('UTF-8');
  if (code < 200 || code >= 300) throw new Error(`Notion API ${code}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function hhaMemberMaintenanceEnsureCheerioV010_() {
  if (typeof Cheerio === 'undefined' || !Cheerio || typeof Cheerio.load !== 'function') {
    throw new Error('Cheerio library is unavailable in this Apps Script project.');
  }
}
function hhaMemberMaintenanceCleanTextV010_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function hhaMemberMaintenanceNormalizeTextV010_(value) {
  return hhaMemberMaintenanceCleanTextV010_(value).normalize('NFKC').replace(/\s+/g, '');
}
function hhaMemberMaintenanceNormalizeNameV010_(value) {
  return hhaMemberMaintenanceNormalizeTextV010_(value);
}
function hhaMemberMaintenanceNormalizeRomanizedV010_(value) {
  return hhaMemberMaintenanceCleanTextV010_(value).normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
}
function hhaMemberMaintenanceParseJapaneseDateV010_(value) {
  const text = hhaMemberMaintenanceCleanTextV010_(value);
  const match = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!match) return '';
  return [String(match[1]).padStart(4, '0'), String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join('-');
}
function hhaMemberMaintenanceParseHeightV010_(value) {
  const text = hhaMemberMaintenanceCleanTextV010_(value);
  const match = text.match(/(\d+(?:\.\d+)?)\s*cm/i);
  return match ? Number(match[1]) : null;
}
function hhaMemberMaintenanceAbsoluteUrlV010_(href) {
  const value = hhaMemberMaintenanceCleanTextV010_(href);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return HHA_MEMBER_MAINTENANCE_V010.BASE_URL + (value.charAt(0) === '/' ? value : '/' + value);
}
function hhaMemberMaintenanceCanonicalizeUrlV010_(value) {
  return hhaMemberMaintenanceCleanTextV010_(value)
    .replace(/^http:\/\//i, 'https://')
    .replace(/[?&]ima=\d+/gi, '')
    .replace(/[?&]$/, '')
    .replace(/\/$/, '');
}
function hhaMemberMaintenanceIssueV010_(type, member, message) {
  return {
    type: type,
    severity: 'REVIEW',
    memberId: member.memberId,
    memberName: member.memberName,
    officialMemberId: member.officialMemberId,
    message: message
  };
}
function hhaMemberMaintenanceLogV010_(title, payload) {
  console.log('============================================================');
  console.log(title);
  console.log(`VERSION = ${HHA_MEMBER_MAINTENANCE_V010.VERSION}`);
  console.log('WRITE = NONE');
  console.log('CANONICAL AUTO UPDATE = NONE');
  console.log('============================================================');
  console.log(JSON.stringify(payload, null, 2));
}
