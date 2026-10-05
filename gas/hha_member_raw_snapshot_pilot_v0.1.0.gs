/**
 * HHA Member Raw Snapshot Pilot v0.1.0
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
 * - TRIGGER INSTALL = NONE
 *
 * Dependency:
 * - hha_member_maintenance_v0.1.2.gs must exist in the same Apps Script project.
 */

const HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010 = Object.freeze({
  VERSION: '0.1.0',
  ROOT_FOLDER_ID: '17FyKoFOA6QlF6fo0RWFcnmPLq7N1lBsb',
  TIME_ZONE: 'Asia/Tokyo',
  PROFILE_MAX_PER_RUN: 1
});

function previewHhaMemberRawSnapshotPlanV010() {
  const report = hhaMmBuildRawSnapshotPlanV010_(new Date());

  console.log('============================================================');
  console.log('HHA MEMBER RAW SNAPSHOT PLAN PILOT v0.1.0');
  console.log('WRITE = NONE');
  console.log('============================================================');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

function pilotSaveHhaMemberRawSnapshotsV010() {
  const now = new Date();
  const plan = hhaMmBuildRawSnapshotPlanV010_(now);

  const root = DriveApp.getFolderById(
    HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.ROOT_FOLDER_ID
  );

  const yearResult = hhaMmGetOrCreateSnapshotFolderV010_(
    root,
    plan.targetYear
  );

  const monthResult = hhaMmGetOrCreateSnapshotFolderV010_(
    yearResult.folder,
    plan.targetMonth
  );

  const created = [];
  const skipped = [];
  const duplicateProbes = [];
  const errors = [];

  function processSnapshot(prefix, sourceUrl, memberId) {
    try {
      const html = hhaMmFetchTextV012_(sourceUrl);

      const first = hhaMmSaveRawSnapshotV010_(
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
      const probe = hhaMmSaveRawSnapshotV010_(
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
    HHA_MEMBER_MAINTENANCE_V012.ROSTER_URL,
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
    version: HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.VERSION,
    write: 'DRIVE_ONLY',
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE',
    autoTrigger: false,

    rootFolderId: HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.ROOT_FOLDER_ID,
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

function hhaMmBuildRawSnapshotPlanV010_(now) {
  const members = hhaMmLoadCanonicalMembersV012_()
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
    .slice(0, HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.PROFILE_MAX_PER_RUN)
    .map(function(member) {
      return {
        memberId: member.memberId,
        memberName: member.memberName,
        officialMemberId: member.officialMemberId,
        profileUrl: member.officialProfileUrl
      };
    });

  return {
    version: HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.VERSION,
    write: 'NONE',
    notionWrite: 'NONE',
    canonicalAutoUpdate: 'NONE',
    autoTrigger: false,

    rootFolderId: HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.ROOT_FOLDER_ID,

    targetYear: Utilities.formatDate(
      now,
      HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.TIME_ZONE,
      'yyyy'
    ),

    targetMonth: Utilities.formatDate(
      now,
      HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.TIME_ZONE,
      'yyyy-MM'
    ),

    rosterUrl: HHA_MEMBER_MAINTENANCE_V012.ROSTER_URL,
    profileTargetCount: profileTargets.length,
    profileTargets: profileTargets
  };
}

function hhaMmGetOrCreateSnapshotFolderV010_(parentFolder, name) {
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

function hhaMmSaveRawSnapshotV010_(
  folder,
  prefix,
  html,
  capturedAt,
  sourceUrl,
  memberId
) {
  const sha256 = hhaMmSha256HexV010_(html);
  const sha12 = sha256.substring(0, 12);

  const existing = hhaMmFindSnapshotByHashV010_(
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
    HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.TIME_ZONE,
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
    'Pilot Version: ' + HHA_MEMBER_RAW_SNAPSHOT_PILOT_V010.VERSION,
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

function hhaMmFindSnapshotByHashV010_(folder, prefix, sha12) {
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

function hhaMmSha256HexV010_(value) {
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