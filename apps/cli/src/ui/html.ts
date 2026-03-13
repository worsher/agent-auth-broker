/**
 * File Mode UI — 单页面 HTML 模板
 * 内嵌 CSS + JS，零外部依赖
 */
export function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Auth Broker — File Mode UI</title>
  <style>
    #broker-ui {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 960px;
      margin: 0 auto;
      padding: 24px;
      color: #1a1a1a;
      background: #fafafa;
      min-height: 100vh;
    }
    #broker-ui * { box-sizing: border-box; }
    #broker-ui h1 { font-size: 1.5rem; margin: 0 0 24px; }
    #broker-ui .tabs {
      display: flex;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 24px;
      gap: 4px;
    }
    #broker-ui .tab {
      padding: 8px 20px;
      cursor: pointer;
      border: none;
      background: none;
      font-size: 0.95rem;
      color: #6b7280;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: color 0.15s, border-color 0.15s;
    }
    #broker-ui .tab:hover { color: #374151; }
    #broker-ui .tab.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
      font-weight: 600;
    }
    #broker-ui .panel { display: none; }
    #broker-ui .panel.active { display: block; }
    #broker-ui table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    #broker-ui th, #broker-ui td {
      text-align: left;
      padding: 10px 14px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 0.9rem;
    }
    #broker-ui th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }
    #broker-ui .form-card {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      margin-bottom: 20px;
    }
    #broker-ui .form-card h3 {
      margin: 0 0 16px;
      font-size: 1rem;
      color: #374151;
    }
    #broker-ui .form-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      align-items: flex-end;
    }
    #broker-ui .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }
    #broker-ui label {
      font-size: 0.82rem;
      color: #6b7280;
      font-weight: 500;
    }
    #broker-ui input, #broker-ui select {
      padding: 7px 10px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    #broker-ui input:focus, #broker-ui select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37,99,235,0.1);
    }
    #broker-ui button {
      cursor: pointer;
      font-size: 0.9rem;
    }
    #broker-ui .btn {
      padding: 7px 16px;
      border: none;
      border-radius: 6px;
      font-weight: 500;
    }
    #broker-ui .btn-primary {
      background: #2563eb;
      color: #fff;
    }
    #broker-ui .btn-primary:hover { background: #1d4ed8; }
    #broker-ui .btn-danger {
      background: #ef4444;
      color: #fff;
      padding: 4px 10px;
      font-size: 0.82rem;
    }
    #broker-ui .btn-danger:hover { background: #dc2626; }
    #broker-ui .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }
    #broker-ui .btn-secondary:hover { background: #e5e7eb; }
    #broker-ui .yaml-preview {
      background: #1e293b;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 8px;
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 0.85rem;
      line-height: 1.6;
      white-space: pre-wrap;
      overflow-x: auto;
      max-height: 600px;
      overflow-y: auto;
    }
    #broker-ui .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 10px 20px;
      border-radius: 8px;
      color: #fff;
      font-size: 0.9rem;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
    }
    #broker-ui .toast.show { opacity: 1; }
    #broker-ui .toast.success { background: #059669; }
    #broker-ui .toast.error { background: #dc2626; }
    #broker-ui .empty {
      text-align: center;
      color: #9ca3af;
      padding: 32px;
      font-size: 0.9rem;
    }
    #broker-ui .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    #broker-ui .header .status {
      font-size: 0.82rem;
      color: #6b7280;
    }
    #broker-ui .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    #broker-ui .badge-blue { background: #dbeafe; color: #1d4ed8; }
    #broker-ui .badge-green { background: #dcfce7; color: #15803d; }
  </style>
</head>
<body>
<div id="broker-ui">
  <div class="header">
    <h1>Agent Auth Broker</h1>
    <span class="status" id="config-path"></span>
  </div>
  <div class="tabs">
    <button class="tab active" data-tab="agents">Agents</button>
    <button class="tab" data-tab="credentials">Credentials</button>
    <button class="tab" data-tab="policies">Policies</button>
    <button class="tab" data-tab="yaml">YAML</button>
  </div>

  <!-- Agents Panel -->
  <div class="panel active" id="panel-agents">
    <div class="form-card">
      <h3>Add Agent</h3>
      <div class="form-row">
        <div class="form-group">
          <label>ID</label>
          <input id="agent-id" placeholder="my-agent">
        </div>
        <div class="form-group">
          <label>Name</label>
          <input id="agent-name" placeholder="My AI Agent">
        </div>
        <button class="btn btn-primary" onclick="addAgent()">Add</button>
      </div>
    </div>
    <table id="agents-table">
      <thead><tr><th>ID</th><th>Name</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <!-- Credentials Panel -->
  <div class="panel" id="panel-credentials">
    <div class="form-card">
      <h3>Add Credential</h3>
      <div class="form-row">
        <div class="form-group">
          <label>ID</label>
          <input id="cred-id" placeholder="github-main">
        </div>
        <div class="form-group">
          <label>Connector</label>
          <select id="cred-connector"></select>
        </div>
        <div class="form-group">
          <label>Token (env var reference)</label>
          <input id="cred-token" placeholder="\${GITHUB_TOKEN}">
        </div>
        <button class="btn btn-primary" onclick="addCredential()">Add</button>
      </div>
    </div>
    <table id="credentials-table">
      <thead><tr><th>ID</th><th>Connector</th><th>Token</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <!-- Policies Panel -->
  <div class="panel" id="panel-policies">
    <div class="form-card">
      <h3>Add Policy</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Agent</label>
          <select id="policy-agent"></select>
        </div>
        <div class="form-group">
          <label>Credential</label>
          <select id="policy-credential"></select>
        </div>
        <div class="form-group">
          <label>Actions (comma-separated, * for all)</label>
          <input id="policy-actions" placeholder="*" value="*">
        </div>
        <button class="btn btn-primary" onclick="addPolicy()">Add</button>
      </div>
    </div>
    <table id="policies-table">
      <thead><tr><th>Agent</th><th>Credential</th><th>Actions</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <!-- YAML Preview Panel -->
  <div class="panel" id="panel-yaml">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="margin:0;font-size:1rem;color:#374151;">broker.yaml</h3>
      <button class="btn btn-secondary" onclick="refreshYaml()">Refresh</button>
    </div>
    <pre class="yaml-preview" id="yaml-content"></pre>
  </div>

  <div class="toast" id="toast"></div>
</div>

<script>
const API = '';

// Tab switching
document.querySelectorAll('#broker-ui .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#broker-ui .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#broker-ui .panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'yaml') refreshYaml();
    if (tab.dataset.tab === 'policies') refreshSelects();
  });
});

function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 2500);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

// ===== Agents =====
async function loadAgents() {
  try {
    const data = await api('GET', '/api/agents');
    const tbody = document.querySelector('#agents-table tbody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">No agents configured</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(a =>
      '<tr><td>' + esc(a.id) + '</td><td>' + esc(a.name) + '</td>' +
      '<td><button class="btn btn-danger" onclick="deleteAgent(\\'' + esc(a.id) + '\\')">Delete</button></td></tr>'
    ).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function addAgent() {
  const id = document.getElementById('agent-id').value.trim();
  const name = document.getElementById('agent-name').value.trim();
  if (!id || !name) return toast('ID and Name are required', 'error');
  try {
    await api('POST', '/api/agents', { id, name });
    document.getElementById('agent-id').value = '';
    document.getElementById('agent-name').value = '';
    toast('Agent added', 'success');
    loadAgents();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteAgent(id) {
  try {
    await api('DELETE', '/api/agents/' + id);
    toast('Agent deleted', 'success');
    loadAgents();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Credentials =====
async function loadCredentials() {
  try {
    const data = await api('GET', '/api/credentials');
    const tbody = document.querySelector('#credentials-table tbody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No credentials configured</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(c =>
      '<tr><td>' + esc(c.id) + '</td><td><span class="badge badge-blue">' + esc(c.connector) + '</span></td>' +
      '<td>' + esc(c.token || '(encrypted)') + '</td>' +
      '<td><button class="btn btn-danger" onclick="deleteCredential(\\'' + esc(c.id) + '\\')">Delete</button></td></tr>'
    ).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function addCredential() {
  const id = document.getElementById('cred-id').value.trim();
  const connector = document.getElementById('cred-connector').value;
  const token = document.getElementById('cred-token').value.trim();
  if (!id || !connector || !token) return toast('All fields are required', 'error');
  try {
    await api('POST', '/api/credentials', { id, connector, token });
    document.getElementById('cred-id').value = '';
    document.getElementById('cred-token').value = '';
    toast('Credential added', 'success');
    loadCredentials();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCredential(id) {
  try {
    await api('DELETE', '/api/credentials/' + id);
    toast('Credential deleted', 'success');
    loadCredentials();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Policies =====
async function loadPolicies() {
  try {
    const data = await api('GET', '/api/policies');
    const tbody = document.querySelector('#policies-table tbody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No policies configured</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(p => {
      const acts = Array.isArray(p.actions) ? p.actions.join(', ') : String(p.actions);
      return '<tr><td>' + esc(p.agent) + '</td><td>' + esc(p.credential) + '</td>' +
        '<td><span class="badge badge-green">' + esc(acts) + '</span></td>' +
        '<td><button class="btn btn-danger" onclick="deletePolicy(\\'' + esc(p.agent) + '\\',\\'' + esc(p.credential) + '\\')">Delete</button></td></tr>';
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function addPolicy() {
  const agent = document.getElementById('policy-agent').value;
  const credential = document.getElementById('policy-credential').value;
  const actionsStr = document.getElementById('policy-actions').value.trim();
  if (!agent || !credential || !actionsStr) return toast('All fields are required', 'error');
  const actions = actionsStr === '*' ? ['*'] : actionsStr.split(',').map(s => s.trim()).filter(Boolean);
  try {
    await api('POST', '/api/policies', { agent, credential, actions });
    toast('Policy added', 'success');
    loadPolicies();
  } catch (e) { toast(e.message, 'error'); }
}

async function deletePolicy(agent, credential) {
  try {
    await api('DELETE', '/api/policies', { agent, credential });
    toast('Policy deleted', 'success');
    loadPolicies();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== YAML =====
async function refreshYaml() {
  try {
    const data = await api('GET', '/api/config');
    document.getElementById('yaml-content').textContent = data.yaml;
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Helpers =====
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function refreshSelects() {
  try {
    const agents = await api('GET', '/api/agents');
    const creds = await api('GET', '/api/credentials');
    const pAgent = document.getElementById('policy-agent');
    const pCred = document.getElementById('policy-credential');
    pAgent.innerHTML = agents.map(a => '<option value="' + esc(a.id) + '">' + esc(a.id) + '</option>').join('');
    pCred.innerHTML = creds.map(c => '<option value="' + esc(c.id) + '">' + esc(c.id) + '</option>').join('');
  } catch (e) {}
}

async function loadConnectors() {
  try {
    const data = await api('GET', '/api/connectors');
    const sel = document.getElementById('cred-connector');
    sel.innerHTML = data.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
  } catch (e) {}
}

// Initial load
loadAgents();
loadCredentials();
loadPolicies();
loadConnectors();

// Show config path
api('GET', '/api/config').then(d => {
  document.getElementById('config-path').textContent = d.path || '';
}).catch(() => {});
</script>
</body>
</html>`
}
