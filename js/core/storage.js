// js/core/storage.js — file storage via Supabase Storage
(function (window) {
  'use strict';
  const CFG = window.LegisCoreConfig;
  const SB = window.SB;
  const BUCKET = 'legiscore-documents';
  const STORAGE_BASE = CFG.SUPABASE_URL + '/storage/v1';

  // path: {org}/{matter}/{document}/{versionId}__{safeName}
  function buildPath(orgId, matterId, documentId, versionId, originalName) {
    const safe = String(originalName || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120);
    return [orgId, matterId, documentId, versionId + '__' + safe].join('/');
  }

  async function upload(path, file) {
    const url = STORAGE_BASE + '/object/' + BUCKET + '/' + encodePath(path);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SB.getToken(),
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: file,
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || ('Upload failed (HTTP ' + res.status + ')');
      const err = new Error(msg); err.status = res.status; err.body = data;
      throw err;
    }
    return data || { path: path };
  }

  async function download(path) {
    const url = STORAGE_BASE + '/object/authenticated/' + BUCKET + '/' + encodePath(path);
    const res = await fetch(url, {
      headers: {
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SB.getToken(),
      },
    });
    if (!res.ok) {
      const err = new Error('Download failed (HTTP ' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return await res.blob();
  }

  async function remove(path) {
    const url = STORAGE_BASE + '/object/' + BUCKET + '/' + encodePath(path);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SB.getToken(),
      },
    });
    if (!res.ok) throw new Error('Delete failed (HTTP ' + res.status + ')');
    return true;
  }

  function encodePath(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }

  window.FileStore = {
    BUCKET: BUCKET,
    buildPath: buildPath,
    upload: upload,
    download: download,
    remove: remove,
  };
})(window);
