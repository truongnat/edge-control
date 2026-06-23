const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:8765/ext?token=fb733b10-8fa6-42c6-9d0c-4a07e6ee57f6';

const $ = (id) => document.getElementById(id);

function parseHosts(value) {
  return value
    .split(/[\s,]+/)
    .map((h) => h.trim())
    .filter(Boolean);
}

function shortPath(filename) {
  if (!filename) return '(unknown file)';
  const normalized = filename.replaceAll('\\', '/');
  const parts = normalized.split('/');
  return parts.slice(-2).join('/');
}

function hostLabel(url) {
  try {
    return new URL(url || 'about:blank').hostname || 'local';
  } catch {
    return 'local';
  }
}

function statusClass(status, socketState) {
  if (status === 'connected' || socketState === 'open') return 'connected';
  if (status === 'connecting' || socketState === 'connecting') return 'connecting';
  return 'disconnected';
}

function renderHosts(hosts) {
  const chips = $('hostChips');
  chips.textContent = '';
  if (!hosts.length) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = 'All hosts allowed';
    chips.appendChild(empty);
    return;
  }
  for (const host of hosts) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = host;
    chips.appendChild(chip);
  }
}

function renderDownloads(downloads) {
  $('downloadCount').textContent = String(downloads.length);
  const list = $('downloadList');
  list.textContent = '';
  if (!downloads.length) {
    list.className = 'empty';
    list.textContent = 'No recent downloads.';
    return;
  }
  list.className = 'meta';
  for (const item of downloads) {
    const label = document.createElement('b');
    label.textContent = item.state || 'download';
    const value = document.createElement('span');
    value.className = 'truncate';
    const total = item.totalBytes > 0 ? ` / ${Math.round(item.totalBytes / 1024)} KB` : '';
    value.textContent = `${shortPath(item.filename)} (${Math.round((item.bytesReceived || 0) / 1024)} KB${total})`;
    list.append(label, value);
  }
}

function renderDiagnostics(data) {
  const status = data.status || 'disconnected';
  const socketState = data.socketState || 'closed';
  const cls = statusClass(status, socketState);
  $('status').className = `pill ${cls}`;
  $('statusCard').className = `hero ${cls}`;
  $('statusText').textContent = status;
  $('socketState').textContent = `socket: ${socketState}`;

  $('bridgeUrl').value = data.bridgeUrl || DEFAULT_BRIDGE_URL;
  const hosts = Array.isArray(data.allowedHosts) ? data.allowedHosts : [];
  $('allowedHosts').value = hosts.join('\n');
  renderHosts(hosts);

  const tab = data.activeTab;
  $('tabId').textContent = tab?.id ?? '-';
  $('tabTitle').textContent = tab?.title || '-';
  $('tabUrl').textContent = tab?.url || '-';

  const frames = Array.isArray(data.frames) ? data.frames : [];
  $('frameCount').textContent = `${frames.length} frame${frames.length === 1 ? '' : 's'}`;
  $('frameSummary').textContent = frames.length
    ? frames.slice(0, 4).map((f) => `${f.frameId}:${hostLabel(f.url)}`).join(' | ')
    : '-';

  renderDownloads(Array.isArray(data.downloads) ? data.downloads : []);
  renderError(data.lastError || '');
}

function renderError(message) {
  const el = $('lastError');
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = message;
}

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function refreshDiagnostics() {
  try {
    const data = await send('popup:getDiagnostics');
    if (!data?.ok) {
      renderError(data?.error || 'Failed to read diagnostics.');
      return;
    }
    renderDiagnostics(data);
  } catch (err) {
    renderError(err.message || String(err));
  }
}

async function saveSettings({ reconnect = true } = {}) {
  const bridgeUrl = $('bridgeUrl').value.trim() || DEFAULT_BRIDGE_URL;
  const allowedHosts = parseHosts($('allowedHosts').value);
  await chrome.storage.local.set({
    bridgeUrl,
    allowedHosts,
    status: reconnect ? 'connecting' : undefined,
    lastError: '',
  });
  if (reconnect) {
    await send('popup:reconnect');
  }
  await refreshDiagnostics();
}

$('save').addEventListener('click', () => saveSettings({ reconnect: true }));

$('reconnect').addEventListener('click', async () => {
  await saveSettings({ reconnect: false });
  const result = await send('popup:reconnect');
  if (!result?.ok) renderError(result?.error || 'Reconnect failed.');
  await refreshDiagnostics();
});

$('reloadTab').addEventListener('click', async () => {
  const result = await send('popup:reloadActiveTab');
  if (!result?.ok) renderError(result?.error || 'Reload failed.');
  await refreshDiagnostics();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.status || changes.lastError || changes.allowedHosts || changes.bridgeUrl) {
    refreshDiagnostics();
  }
});

refreshDiagnostics();
setInterval(refreshDiagnostics, 4000);
