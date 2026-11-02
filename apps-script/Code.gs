// 출입신청 빠른 실행. GitHub 토큰은 프로젝트 설정 > 스크립트 속성에만 저장하세요.
const PERMIT = Object.freeze({
  repository: 'sskim4912/permit',
  workflow: 'notify-queue.yml',
  branch: 'main',
  project: 'permit-daesan-461e8',
  apiKey: 'AIzaSyAVNKvKku3o-nvV0Dc80eB9W4DOJHhdnoU'
});

function output_(ok) {
  return ContentService.createTextOutput(JSON.stringify({ok: ok}))
    .setMimeType(ContentService.MimeType.JSON);
}

function github_(method, suffix, payload) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('스크립트 속성에 GITHUB_TOKEN을 저장하세요.');
  const options = {
    method: method, muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'}
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  return UrlFetchApp.fetch('https://api.github.com/repos/' + PERMIT.repository +
    '/actions/workflows/' + PERMIT.workflow + suffix, options);
}

// 최초 한 번 실행하고 Google 권한을 승인합니다. 문자 발송은 하지 않습니다.
function checkSetup() {
  const response = github_('get', '');
  if (response.getResponseCode() !== 200) {
    throw new Error('GitHub 연결 실패: 토큰의 저장소와 Actions 권한을 확인하세요.');
  }
  console.log('GitHub 연결 확인 완료. 문자는 발송하지 않았습니다.');
}

function doGet() { return output_(true); }

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body || body.length > 2048) return output_(false);
    const data = JSON.parse(body);
    if (!/^[A-Za-z0-9]{20}$/.test(data.queue_id || '') ||
        !/^[A-Za-z0-9]{20}$/.test(data.request_id || '') ||
        !/^[a-f0-9]{64}$/.test(data.owner_key || '')) return output_(false);
    const url = 'https://firestore.googleapis.com/v1/projects/' + PERMIT.project +
      '/databases/(default)/documents/applicantCopies/' + data.owner_key +
      '/items/' + data.request_id + '?key=' + PERMIT.apiKey +
      '&mask.fieldPaths=owner_key&mask.fieldPaths=notification_queue_id&mask.fieldPaths=created';
    const proof = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    if (proof.getResponseCode() !== 200) return output_(false);
    const fields = JSON.parse(proof.getContentText()).fields || {};
    const created = Date.parse((fields.created || {}).timestampValue || '');
    const age = Date.now() - created;
    if ((fields.owner_key || {}).stringValue !== data.owner_key ||
        (fields.notification_queue_id || {}).stringValue !== data.queue_id ||
        !Number.isFinite(age) || age < -60000 || age > 15 * 60000) return output_(false);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return output_(false);
    try {
      const cache = CacheService.getScriptCache();
      const key = 'queue:' + data.queue_id;
      if (cache.get(key)) return output_(true);
      const ownerKey = 'owner:' + data.owner_key;
      const count = Number(cache.get(ownerKey) || 0);
      if (count >= 30) return output_(false);
      // One workflow run processes the queue; its existing claims prevent repeat SMS.
      const response = github_('post', '/dispatches', {ref: PERMIT.branch});
      if (response.getResponseCode() !== 204) return output_(false);
      cache.put(key, '1', 900);
      cache.put(ownerKey, String(count + 1), 3600);
      return output_(true);
    } finally { lock.releaseLock(); }
  } catch (_) {
    // Never log incoming ownership keys, tokens, or request contents.
    return output_(false);
  }
}
