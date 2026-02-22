const API_BASE = '/admin/api';

const AUTH_STORAGE_KEY = 'claude_admin_proxy_key';
const IDLE_LOGOUT_MS = 30 * 60 * 1000;

let credentials = [];
let apiKeys = [];
let fallbackModels = [];
let modelTestModelId = '';
let wordSets = [];
let expandedWordSetId = null;
let wordSetWords = {};
let wordsDisplayLimits = {};
let wordsSearchQueries = {};
let wordsSearchTimers = {};
const WORDS_PAGE_SIZE = 50;
let idleTimer = null;
let idleListenersAttached = false;
let unauthorizedHandled = false;

function getStoredProxyKey() {
    return sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
}

function getStoredProxyKeySource() {
    if (sessionStorage.getItem(AUTH_STORAGE_KEY)) return 'session';
    if (localStorage.getItem(AUTH_STORAGE_KEY)) return 'local';
    return null;
}

function setStoredProxyKey(key, remember) {
    if (remember) {
        localStorage.setItem(AUTH_STORAGE_KEY, key);
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
        sessionStorage.setItem(AUTH_STORAGE_KEY, key);
        localStorage.removeItem(AUTH_STORAGE_KEY);
    }
}

function clearStoredProxyKey() {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

function setAuthedUI(authed) {
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) btnLogout.classList.toggle('hidden', !authed);
}

function setAuthError(message) {
    if (!els.authError) return;
    if (message) {
        els.authError.textContent = message;
        els.authError.classList.add('show');
    } else {
        els.authError.textContent = '';
        els.authError.classList.remove('show');
    }
}

function showAuthOverlay(message = '') {
    setAuthError(message);
    els.authOverlay?.classList.remove('hidden');
    els.authKey?.focus();
}

function hideAuthOverlay() {
    setAuthError('');
    if (els.authKey) els.authKey.value = '';
    els.authOverlay?.classList.add('hidden');
    unauthorizedHandled = false;
}

function logout(reason = 'Logged out') {
    clearStoredProxyKey();
    setAuthedUI(false);
    showAuthOverlay(reason);
}

function resetIdleLogoutTimer() {
    if (!IDLE_LOGOUT_MS) return;
    if (getStoredProxyKeySource() !== 'session') return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => logout('Logged out due to inactivity'), IDLE_LOGOUT_MS);
}

function attachIdleLogoutListeners() {
    if (idleListenersAttached) return;
    idleListenersAttached = true;
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, resetIdleLogoutTimer, { passive: true }));
}

async function validateProxyKey(key) {
    try {
        const res = await fetch(`${API_BASE}/settings`, {
            headers: { 'x-api-key': key }
        });
        if (res.ok) return { ok: true };
        const data = await res.json().catch(() => null);
        return { ok: false, message: data?.message || `Login failed (${res.status})` };
    } catch {
        return { ok: false, message: 'Unable to reach server' };
    }
}

async function ensureAuthenticated() {
    const key = getStoredProxyKey();
    if (!key) {
        setAuthedUI(false);
        showAuthOverlay('');
        return false;
    }
    const result = await validateProxyKey(key);
    if (!result.ok) {
        clearStoredProxyKey();
        setAuthedUI(false);
        showAuthOverlay(result.message || 'Unauthorized');
        return false;
    }
    hideAuthOverlay();
    setAuthedUI(true);
    resetIdleLogoutTimer();
    return true;
}

const icons = {
    pulse: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" fill="currentColor"/><path d="M10 2V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 15V18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 10L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 10L2 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    power: `<svg viewBox="0 0 20 20" fill="none"><path d="M10 3V9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 5.5C16.5 7 18 9.5 18 12C18 15.5 14.5 18 10 18C5.5 18 2 15.5 2 12C2 9.5 3.5 7 6 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    faders: `<svg viewBox="0 0 20 20" fill="none"><path d="M4 4V16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 4V16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 4V16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="2" y="11" width="4" height="2" rx="1" fill="currentColor"/><rect x="8" y="6" width="4" height="2" rx="1" fill="currentColor"/><rect x="14" y="13" width="4" height="2" rx="1" fill="currentColor"/></svg>`,
    disconnect: `<svg viewBox="0 0 20 20" fill="none"><circle cx="6" cy="10" r="3" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="10" r="3" stroke="currentColor" stroke-width="2"/><path d="M9 10H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 2"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`,
    lightning: `<svg viewBox="0 0 20 20" fill="none"><path d="M12 2L4 12h5l-1 6 8-10h-5l1-6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    spinner: `<svg viewBox="0 0 20 20" fill="none" class="animate-spin"><path d="M10 3v2m0 10v2m7-7h-2M5 10H3m12.95-4.95l-1.414 1.414M6.464 16.464l-1.414 1.414m11.314 0l-1.414-1.414M6.464 3.536L5.05 4.95" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-opacity="0.5"/><path d="M10 3V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    check: `<svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    cross: `<svg viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    shield: `<svg viewBox="0 0 20 20" fill="none"><path d="M10 2L3 5v4c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V5l-7-3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const savedTheme = localStorage.getItem('claude_theme');
if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('claude_theme', newTheme);
    updateThemeButton();
}

function updateThemeButton() {
    const btn = document.getElementById('btnTheme');
    if (!btn) return;
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    btn.textContent = isDark ? '☀️' : '🌙';
}

const els = {
    list: document.getElementById('credentialList'),
    modal: document.getElementById('modal'),
    form: document.getElementById('credentialForm'),
    status: document.getElementById('globalStatus'),
    toastContainer: document.getElementById('toastContainer'),
    authOverlay: document.getElementById('authOverlay'),
    loginForm: document.getElementById('loginForm'),
    authKey: document.getElementById('authKey'),
    authRemember: document.getElementById('authRemember'),
    authError: document.getElementById('authError')
};

document.addEventListener('DOMContentLoaded', async () => {
    updateThemeButton();
    document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);
    document.getElementById('btnLogout')?.addEventListener('click', () => logout('Logged out'));
    document.getElementById('strictModeToggle')?.addEventListener('change', toggleStrictMode);
    document.getElementById('normalizeParamsToggle')?.addEventListener('change', toggleNormalizeParams);
    document.getElementById('quickGuideToggle')?.addEventListener('click', () => {
        document.getElementById('quickGuideCard').classList.toggle('collapsed');
    });

    els.loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = els.authKey?.value?.trim();
        const remember = !!els.authRemember?.checked;
        if (!key) {
            setAuthError('Please enter an admin key');
            return;
        }
        setAuthError('');
        const submitBtn = els.loginForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const result = await validateProxyKey(key);
            if (!result.ok) {
                setAuthError(result.message || 'Invalid admin key');
                return;
            }
            setStoredProxyKey(key, remember);
            hideAuthOverlay();
            setAuthedUI(true);
            showToast('Logged in successfully', 'success');
            resetIdleLogoutTimer();
            loadAll();
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    document.querySelector('.toggle-auth-visibility')?.addEventListener('click', function() {
        const input = els.authKey;
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
            this.textContent = input.type === 'password' ? '👁️' : '🔒';
        }
    });

    attachIdleLogoutListeners();
    checkStatus();

    const authed = await ensureAuthenticated();
    if (authed) loadAll();
});

function loadAll() {
    loadCredentials();
    loadApiKeys();
    loadSettings();
    loadWordSets();
    loadModels();
}

const hasHeader = (headers, nameLower) => {
    return Object.keys(headers || {}).some((k) => k.toLowerCase() === nameLower);
};

const api = async (endpoint, options = {}) => {
    const headers = { ...options.headers };
    const key = getStoredProxyKey();
    if (key && !hasHeader(headers, 'x-api-key') && !hasHeader(headers, 'authorization')) {
        headers['x-api-key'] = key;
    }
    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (res.status === 401) {
            const data = await res.json().catch(() => null);
            if (!unauthorizedHandled) {
                unauthorizedHandled = true;
                logout(data?.message || 'Session expired');
            }
            const err = new Error(data?.message || 'Unauthorized');
            err.silent = true;
            throw err;
        }
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.message || 'Request failed');
        }
        resetIdleLogoutTimer();
        return await res.json();
    } catch (err) {
        if (!err?.silent) showToast(err.message || 'Request failed', 'error');
        throw err;
    }
};

// --- CREDENTIALS ---

async function loadCredentials() {
    try {
        credentials = await api('/credentials');
        renderList();
    } catch (e) {
        console.error(e);
    }
}

async function saveCredential(data) {
    const isEdit = !!data.id;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/credentials/${data.id}` : '/credentials';
    try {
        await api(url, { method, body: JSON.stringify(data) });
        showToast(`Credential ${isEdit ? 'updated' : 'added'} successfully`, 'success');
        closeModal();
        loadCredentials();
    } catch (e) { /* handled */ }
}

async function deleteCredential(id) {
    const confirmed = await showConfirm({
        title: 'Delete Credential',
        message: 'This action cannot be undone. Are you sure?',
        icon: 'trash',
        danger: true
    });
    if (!confirmed) return;
    try {
        await api(`/credentials/${id}`, { method: 'DELETE' });
        showToast('Credential deleted', 'success');
        loadCredentials();
    } catch (e) { /* handled */ }
}

async function toggleCredential(id, enabled) {
    try {
        await api(`/credentials/${id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) });
        showToast(`Credential ${enabled ? 'enabled' : 'disabled'}`, 'success');
        loadCredentials();
    } catch (e) { /* handled */ }
}

async function testCredential(btn, id) {
    if (btn.disabled) return;
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('testing');
    btn.innerHTML = `<span class="btn-content">${icons.spinner}</span>`;
    try {
        const result = await api(`/credentials/${id}/test`, { method: 'POST' });
        if (result.success) {
            btn.classList.remove('testing');
            btn.classList.add('success');
            btn.innerHTML = `<span class="btn-content">${icons.check}<span>${result.latencyMs}ms</span></span>`;
        } else {
            throw new Error(result.error?.message || result.error || 'Failed');
        }
    } catch (err) {
        btn.classList.remove('testing');
        btn.classList.add('error');
        const message = err.message?.length > 10 ? 'Failed' : (err.message || 'Failed');
        btn.innerHTML = `<span class="btn-content">${icons.cross}<span>${message}</span></span>`;
    }
    setTimeout(() => {
        btn.classList.remove('testing', 'success', 'error');
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }, 3000);
}

async function checkStatus() {
    try {
        const res = await fetch('/healthz');
        if (res.ok) {
            const data = await res.json();
            els.status.className = 'status-indicator online';
            els.status.querySelector('.status-text').textContent = 'System Online';
            const versionEl = document.getElementById('appVersion');
            if (versionEl && data.version) {
                versionEl.textContent = data.version;
            }
        } else {
            throw new Error();
        }
    } catch (e) {
        els.status.className = 'status-indicator error';
        els.status.querySelector('.status-text').textContent = 'System Offline';
    }
}

async function loadSettings() {
    try {
        const settings = await api('/settings');
        const toggle = document.getElementById('strictModeToggle');
        if (toggle) toggle.checked = settings.strictMode;
        const normalizeToggle = document.getElementById('normalizeParamsToggle');
        if (normalizeToggle) normalizeToggle.checked = settings.normalizeParameters;
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

async function toggleStrictMode(e) {
    const enabled = e.target.checked;
    try {
        await api('/settings', { method: 'PUT', body: JSON.stringify({ strictMode: enabled }) });
        showToast(`Strict Mode ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
        e.target.checked = !enabled;
    }
}

async function toggleNormalizeParams(e) {
    const enabled = e.target.checked;
    try {
        await api('/settings', { method: 'PUT', body: JSON.stringify({ normalizeParameters: enabled }) });
        showToast(`Parameter Normalization ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
        e.target.checked = !enabled;
    }
}

function getWordSetTagsHtml(cred) {
    if (!cred.wordSetIds || cred.wordSetIds.length === 0) return '';
    const tags = cred.wordSetIds.map(id => {
        const ws = wordSets.find(s => s.id === id);
        return ws ? `<span class="word-set-tag">${esc(ws.name)}</span>` : '';
    }).filter(Boolean).join('');
    return tags ? `<div class="detail-row"><span>Words</span><div class="word-set-tags">${tags}</div></div>` : '';
}

function renderList() {
    if (credentials.length === 0) {
        els.list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📂</div>
                <h3>No credentials yet</h3>
                <p>Add an upstream credential to start proxying requests.</p>
            </div>
        `;
        return;
    }
    els.list.innerHTML = credentials.map(cred => `
        <div class="card ${cred.enabled ? '' : 'cred-disabled'}">
            <div class="card-header">
                <span class="card-title">${esc(cred.name)}</span>
                <label class="toggle-switch" title="${cred.enabled ? 'Enabled' : 'Disabled'}">
                    <input type="checkbox" data-action="toggle" data-id="${cred.id}" ${cred.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="card-details">
                <div class="detail-row"><span>Target</span><span class="code" title="${esc(cred.targetUrl)}">${esc(cred.targetUrl)}</span></div>
                <div class="detail-row"><span>Key</span><span class="code">${esc(cred.keyMasked)}</span></div>
                ${cred.proxyUrl ? `<div class="detail-row"><span>Proxy</span><span class="code" title="${esc(cred.proxyUrl)}">${esc(cred.proxyUrl)}</span></div>` : ''}
                ${getWordSetTagsHtml(cred)}
            </div>
            <div class="card-actions">
                <button class="btn-icon btn-test" data-action="test" data-id="${cred.id}" title="Test Connection"><span class="btn-content">${icons.lightning}</span></button>
                <button class="btn-icon" data-action="words" data-id="${cred.id}" title="Word Sets">${icons.shield}</button>
                <button class="btn-icon" data-action="edit" data-id="${cred.id}" title="Edit">${icons.faders}</button>
                <button class="btn-icon btn-icon-danger" data-action="delete" data-id="${cred.id}" title="Delete">${icons.disconnect}</button>
            </div>
        </div>
    `).join('');
}

els.list.addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-action="toggle"]');
    if (toggle) {
        toggleCredential(toggle.dataset.id, toggle.checked);
    }
});

els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'edit') editCredential(id);
    else if (action === 'delete') deleteCredential(id);
    else if (action === 'test') testCredential(btn, id);
    else if (action === 'words') openWordsPopover(btn, id);
});

document.getElementById('btnAdd').addEventListener('click', () => openModal());
document.getElementById('btnModalClose').addEventListener('click', closeModal);
document.getElementById('btnCancel').addEventListener('click', closeModal);

els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('editId').value || undefined;
    const apiKeyValue = document.getElementById('apiKey').value.trim();
    const isEdit = !!editId;
    const proxyUrlValue = document.getElementById('proxyUrl').value.trim();
    const data = {
        id: editId,
        name: document.getElementById('name').value,
        targetUrl: document.getElementById('targetUrl').value
    };
    if (!isEdit || apiKeyValue) {
        data.apiKey = apiKeyValue;
    }
    if (!isEdit || proxyUrlValue) {
        data.proxyUrl = proxyUrlValue || null;
    }
    await saveCredential(data);
});

document.querySelector('.toggle-visibility').addEventListener('click', function() {
    const input = this.previousElementSibling;
    input.type = input.type === 'password' ? 'text' : 'password';
    this.textContent = input.type === 'password' ? '👁️' : '🔒';
});

function openModal(cred = null) {
    const isEdit = !!cred;
    document.getElementById('modalTitle').textContent = isEdit ? 'Edit Credential' : 'Add Credential';
    document.getElementById('editId').value = cred ? cred.id : '';
    document.getElementById('name').value = cred ? cred.name : '';
    document.getElementById('targetUrl').value = cred ? cred.targetUrl : '';
    const proxyUrlInput = document.getElementById('proxyUrl');
    const apiKeyInput = document.getElementById('apiKey');
    const currentKeyDisplay = document.getElementById('currentKeyDisplay');
    const currentKeyMasked = document.getElementById('currentKeyMasked');
    if (isEdit) {
        apiKeyInput.value = '';
        apiKeyInput.removeAttribute('required');
        apiKeyInput.placeholder = 'Leave blank to keep existing key';
        currentKeyMasked.textContent = cred.keyMasked || '****';
        currentKeyDisplay.classList.remove('hidden');
        proxyUrlInput.value = '';
        proxyUrlInput.placeholder = cred.proxyUrl ? `Current: ${cred.proxyUrl}` : 'http://user:pass@host:port';
    } else {
        apiKeyInput.value = '';
        apiKeyInput.setAttribute('required', 'required');
        apiKeyInput.placeholder = 'sk-ant-...';
        currentKeyDisplay.classList.add('hidden');
        proxyUrlInput.value = '';
        proxyUrlInput.placeholder = 'http://user:pass@host:port';
    }
    els.modal.classList.remove('hidden');
}

function editCredential(id) {
    const cred = credentials.find(c => c.id === id);
    if (cred) openModal(cred);
}

function closeModal() {
    els.modal.classList.add('hidden');
    els.form.reset();
}

function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    els.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showConfirm({ title, message, icon = 'warning', danger = false }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const iconEl = document.getElementById('confirmIcon');
        const okBtn = document.getElementById('confirmOk');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        iconEl.className = `confirm-icon ${danger ? 'danger' : 'warning'}`;
        iconEl.innerHTML = icons[icon] || icons.warning;
        okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
        modal.classList.remove('hidden');
        const cleanup = (result) => {
            modal.classList.add('hidden');
            document.getElementById('confirmOk').onclick = null;
            document.getElementById('confirmCancel').onclick = null;
            resolve(result);
        };
        document.getElementById('confirmOk').onclick = () => cleanup(true);
        document.getElementById('confirmCancel').onclick = () => cleanup(false);
    });
}

const esc = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// --- WORDS POPOVER (Credential → Word Set binding) ---

let activePopover = null;

function closeActivePopover() {
    if (activePopover) {
        activePopover.remove();
        activePopover = null;
    }
}

document.addEventListener('click', (e) => {
    if (activePopover && !activePopover.contains(e.target) && !e.target.closest('[data-action="words"]')) {
        closeActivePopover();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeActivePopover();
});

function openWordsPopover(btn, credId) {
    closeActivePopover();

    const cred = credentials.find(c => c.id === credId);
    if (!cred) return;

    const popover = document.createElement('div');
    popover.className = 'words-popover';

    if (wordSets.length === 0) {
        popover.innerHTML = `<div class="popover-empty">No word sets. Create one in the Word Sets section below.</div>`;
    } else {
        popover.innerHTML = wordSets.map(ws => {
            const checked = cred.wordSetIds?.includes(ws.id);
            return `
                <label class="popover-item">
                    <input type="checkbox" data-ws-id="${ws.id}" ${checked ? 'checked' : ''}>
                    <span class="popover-item-name">${esc(ws.name)}</span>
                    <span class="popover-item-count">${ws.entryCount}</span>
                </label>
            `;
        }).join('');
    }

    popover.addEventListener('change', async (e) => {
        const checkbox = e.target;
        if (!checkbox.dataset.wsId) return;
        const currentIds = new Set(cred.wordSetIds || []);
        if (checkbox.checked) currentIds.add(checkbox.dataset.wsId);
        else currentIds.delete(checkbox.dataset.wsId);
        try {
            await api(`/credentials/${credId}/word-sets`, {
                method: 'PUT',
                body: JSON.stringify({ wordSetIds: [...currentIds] })
            });
            cred.wordSetIds = [...currentIds];
            renderList();
            // Re-open the popover on the new button since renderList() rebuilds DOM
            const newBtn = els.list.querySelector(`[data-action="words"][data-id="${credId}"]`);
            if (newBtn) openWordsPopover(newBtn, credId);
        } catch (e) {
            checkbox.checked = !checkbox.checked;
        }
    });

    const rect = btn.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${rect.left}px`;

    document.body.appendChild(popover);
    activePopover = popover;

    const popRect = popover.getBoundingClientRect();
    if (popRect.right > window.innerWidth) {
        popover.style.left = `${window.innerWidth - popRect.width - 8}px`;
    }
    if (popRect.bottom > window.innerHeight) {
        popover.style.top = `${rect.top - popRect.height - 4}px`;
    }
}

// --- WORD SETS ---

async function loadWordSets() {
    try {
        wordSets = await api('/word-sets');
        renderWordSets();
        renderList();
    } catch (e) {
        console.error('Failed to load word sets:', e);
    }
}

function renderWordSets() {
    const container = document.getElementById('wordSetList');
    if (!container) return;

    if (wordSets.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <div class="empty-state-icon">🛡️</div>
                <h3>No word sets</h3>
                <p>Create a word set to start obfuscating sensitive content per credential.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = wordSets.map(ws => {
        const isExpanded = expandedWordSetId === ws.id;
        return `
            <div class="card collapsible-card word-set-card" style="padding: 0; overflow: hidden; margin-bottom: 1rem;" data-ws-id="${ws.id}">
                <div class="collapsible-header ws-header" data-ws-toggle="${ws.id}">
                    <span class="collapsible-title">
                        <span class="collapsible-icon">${isExpanded ? '▼' : '▶'}</span>
                        <span class="ws-name">${esc(ws.name)}</span>
                        <span class="ws-meta">${ws.entryCount} words · ${ws.credentialCount} credential${ws.credentialCount !== 1 ? 's' : ''}</span>
                    </span>
                    <div class="ws-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon" data-ws-action="rename" data-ws-id="${ws.id}" title="Rename">${icons.faders}</button>
                        <button class="btn-icon btn-icon-danger" data-ws-action="delete" data-ws-id="${ws.id}" title="Delete">${icons.trash}</button>
                    </div>
                </div>
                <div class="collapsible-content ${isExpanded ? '' : 'collapsed'}" id="wsContent-${ws.id}">
                    ${isExpanded ? renderWordSetContent(ws) : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderWordSetContent(ws) {
    const words = wordSetWords[ws.id] || [];
    const searchQuery = wordsSearchQueries[ws.id] || '';
    const displayLimit = wordsDisplayLimits[ws.id] || WORDS_PAGE_SIZE;

    let filtered = words;
    if (searchQuery) {
        filtered = words.filter(w => w.word.toLowerCase().includes(searchQuery));
    }

    const visibleWords = filtered.slice(0, displayLimit);
    const hasMore = filtered.length > displayLimit;

    const countText = searchQuery && filtered.length !== words.length
        ? `${filtered.length} / ${words.length} words (filtered)`
        : words.length === 0 ? 'No words' : `${words.length} word${words.length !== 1 ? 's' : ''}`;

    let tableHtml;
    if (filtered.length === 0) {
        tableHtml = `
            <tr>
                <td colspan="2" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <p>${searchQuery ? 'No matching words found.' : 'No words in this set.'}</p>
                </td>
            </tr>
        `;
    } else {
        tableHtml = visibleWords.map(word => `
            <tr>
                <td><span class="word-pattern">${esc(word.word)}</span></td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon" data-word-action="edit" data-ws-id="${ws.id}" data-id="${word.id}" title="Edit">${icons.faders}</button>
                        <button class="btn-icon btn-icon-danger" data-word-action="delete" data-ws-id="${ws.id}" data-id="${word.id}" title="Delete">${icons.trash}</button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (hasMore) {
            const remaining = filtered.length - displayLimit;
            tableHtml += `
                <tr>
                    <td colspan="2" style="text-align: center; padding: 1rem;">
                        <button class="btn btn-secondary btn-sm" data-word-action="loadmore" data-ws-id="${ws.id}">
                            Load more (${remaining} remaining)
                        </button>
                    </td>
                </tr>
            `;
        }
    }

    return `
        <div style="padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span class="text-muted" style="font-size: 0.85rem;">${countText}</span>
            <div class="header-actions">
                <button class="btn btn-secondary btn-sm" data-ws-action="import" data-ws-id="${ws.id}">Import</button>
                <button class="btn btn-danger btn-sm" data-ws-action="clear" data-ws-id="${ws.id}">Clear</button>
                <button class="btn btn-primary btn-sm" data-ws-action="addword" data-ws-id="${ws.id}">+ Add</button>
            </div>
        </div>
        <div style="padding: 0.5rem 1rem;">
            <input type="text" class="form-input ws-search-input" data-ws-search="${ws.id}"
                   placeholder="Search words..." value="${esc(searchQuery)}" style="width: 100%; margin-bottom: 0.5rem;">
        </div>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Word / Pattern</th>
                        <th style="width: 120px; text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>${tableHtml}</tbody>
            </table>
        </div>
    `;
}

function refreshWordSetContent(wsId) {
    const ws = wordSets.find(s => s.id === wsId);
    if (!ws) return;
    const content = document.getElementById(`wsContent-${wsId}`);
    if (content) {
        content.innerHTML = renderWordSetContent(ws);
    }
}

async function loadWordSetWords(wsId) {
    try {
        const words = await api(`/word-sets/${wsId}/words`);
        wordSetWords[wsId] = words;
        if (!wordsDisplayLimits[wsId]) wordsDisplayLimits[wsId] = WORDS_PAGE_SIZE;
        refreshWordSetContent(wsId);
    } catch (e) {
        console.error('Failed to load words for set', wsId, e);
    }
}

// Word set list event delegation
document.getElementById('wordSetList')?.addEventListener('click', (e) => {
    // Toggle expand/collapse
    const toggleHeader = e.target.closest('[data-ws-toggle]');
    if (toggleHeader && !e.target.closest('.ws-actions')) {
        const wsId = toggleHeader.dataset.wsToggle;
        if (expandedWordSetId === wsId) {
            expandedWordSetId = null;
            renderWordSets();
        } else {
            expandedWordSetId = wsId;
            renderWordSets();
            loadWordSetWords(wsId);
        }
        return;
    }

    // Word set actions (rename, delete)
    const wsActionBtn = e.target.closest('[data-ws-action]');
    if (wsActionBtn) {
        const action = wsActionBtn.dataset.wsAction;
        const wsId = wsActionBtn.dataset.wsId;
        if (action === 'rename') renameWordSet(wsId);
        else if (action === 'delete') deleteWordSet(wsId);
        else if (action === 'addword') openWordModal(null, wsId);
        else if (action === 'import') openImportModal(wsId);
        else if (action === 'clear') clearWordSetWords(wsId);
        return;
    }

    // Word actions (edit, delete, loadmore)
    const wordActionBtn = e.target.closest('[data-word-action]');
    if (wordActionBtn) {
        const action = wordActionBtn.dataset.wordAction;
        const wsId = wordActionBtn.dataset.wsId;
        const wordId = wordActionBtn.dataset.id;
        if (action === 'edit') {
            const word = (wordSetWords[wsId] || []).find(w => w.id === wordId);
            if (word) openWordModal(word, wsId);
        } else if (action === 'delete') {
            deleteWord(wsId, wordId);
        } else if (action === 'loadmore') {
            wordsDisplayLimits[wsId] = (wordsDisplayLimits[wsId] || WORDS_PAGE_SIZE) + WORDS_PAGE_SIZE;
            refreshWordSetContent(wsId);
        }
        return;
    }
});

// Search input delegation (skip during IME composition)
function handleWordSetSearch(searchInput) {
    const wsId = searchInput.dataset.wsSearch;
    clearTimeout(wordsSearchTimers[wsId]);
    wordsSearchTimers[wsId] = setTimeout(() => {
        wordsSearchQueries[wsId] = searchInput.value.toLowerCase().trim();
        wordsDisplayLimits[wsId] = WORDS_PAGE_SIZE;
        refreshWordSetContent(wsId);
    }, 200);
}

document.getElementById('wordSetList')?.addEventListener('input', (e) => {
    const searchInput = e.target.closest('[data-ws-search]');
    if (!searchInput || e.isComposing) return;
    handleWordSetSearch(searchInput);
});

document.getElementById('wordSetList')?.addEventListener('compositionend', (e) => {
    const searchInput = e.target.closest('[data-ws-search]');
    if (!searchInput) return;
    handleWordSetSearch(searchInput);
});

// Create word set
document.getElementById('btnAddWordSet')?.addEventListener('click', () => {
    document.getElementById('wordSetNameModalTitle').textContent = 'New Word Set';
    document.getElementById('wordSetNameEditId').value = '';
    document.getElementById('wordSetNameInput').value = '';
    document.getElementById('wordSetNameModal').classList.remove('hidden');
    document.getElementById('wordSetNameInput').focus();
});

document.getElementById('btnWordSetNameModalClose')?.addEventListener('click', () => {
    document.getElementById('wordSetNameModal').classList.add('hidden');
});
document.getElementById('btnWordSetNameCancel')?.addEventListener('click', () => {
    document.getElementById('wordSetNameModal').classList.add('hidden');
});

document.getElementById('wordSetNameForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('wordSetNameEditId').value;
    const name = document.getElementById('wordSetNameInput').value.trim();
    if (!name) return;

    try {
        if (editId) {
            await api(`/word-sets/${editId}`, { method: 'PUT', body: JSON.stringify({ name }) });
            showToast('Word set renamed', 'success');
        } else {
            await api('/word-sets', { method: 'POST', body: JSON.stringify({ name }) });
            showToast('Word set created', 'success');
        }
        document.getElementById('wordSetNameModal').classList.add('hidden');
        loadWordSets();
    } catch (e) { /* handled */ }
});

async function renameWordSet(wsId) {
    const ws = wordSets.find(s => s.id === wsId);
    if (!ws) return;
    document.getElementById('wordSetNameModalTitle').textContent = 'Rename Word Set';
    document.getElementById('wordSetNameEditId').value = wsId;
    document.getElementById('wordSetNameInput').value = ws.name;
    document.getElementById('wordSetNameModal').classList.remove('hidden');
    document.getElementById('wordSetNameInput').focus();
}

async function deleteWordSet(wsId) {
    const ws = wordSets.find(s => s.id === wsId);
    if (!ws) return;
    if (!await showConfirm({
        title: 'Delete Word Set',
        message: `Delete "${ws.name}"? All words in this set will be lost and bindings removed.`,
        icon: 'trash',
        danger: true
    })) return;
    try {
        await api(`/word-sets/${wsId}`, { method: 'DELETE' });
        showToast('Word set deleted', 'success');
        if (expandedWordSetId === wsId) expandedWordSetId = null;
        delete wordSetWords[wsId];
        delete wordsDisplayLimits[wsId];
        delete wordsSearchQueries[wsId];
        loadWordSets();
        loadCredentials();
    } catch (e) { /* handled */ }
}

// --- WORD CRUD (scoped to word set) ---

function openWordModal(word, wsId) {
    const isEdit = !!word;
    document.getElementById('wordModalTitle').textContent = isEdit ? 'Edit Word' : 'Add Word';
    document.getElementById('wordEditSetId').value = wsId;
    document.getElementById('wordEditId').value = word ? word.id : '';
    document.getElementById('wordPattern').value = word ? word.word : '';
    document.getElementById('wordModal').classList.remove('hidden');
    document.getElementById('wordPattern').focus();
}

function closeWordModal() {
    document.getElementById('wordModal').classList.add('hidden');
    document.getElementById('wordForm').reset();
}

document.getElementById('btnWordModalClose')?.addEventListener('click', closeWordModal);
document.getElementById('btnWordCancel')?.addEventListener('click', closeWordModal);

document.getElementById('wordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const setId = document.getElementById('wordEditSetId').value;
    const wordId = document.getElementById('wordEditId').value;
    const word = document.getElementById('wordPattern').value.trim();
    if (!word || !setId) return;

    const method = wordId ? 'PUT' : 'POST';
    const url = wordId ? `/word-sets/${setId}/words/${wordId}` : `/word-sets/${setId}/words`;

    try {
        await api(url, { method, body: JSON.stringify({ word }) });
        showToast(`Word ${wordId ? 'updated' : 'added'} successfully`, 'success');
        closeWordModal();
        loadWordSetWords(setId);
        loadWordSets();
    } catch (e) { /* handled */ }
});

async function deleteWord(wsId, wordId) {
    if (!await showConfirm({ title: 'Delete Word', message: 'Remove this word?', icon: 'trash', danger: true })) return;
    try {
        await api(`/word-sets/${wsId}/words/${wordId}`, { method: 'DELETE' });
        showToast('Word deleted', 'success');
        loadWordSetWords(wsId);
        loadWordSets();
    } catch (e) { /* handled */ }
}

async function clearWordSetWords(wsId) {
    if (!await showConfirm({
        title: 'Clear All Words',
        message: 'This will remove ALL words from this set. This action cannot be undone.',
        icon: 'warning',
        danger: true
    })) return;
    try {
        const result = await api(`/word-sets/${wsId}/words`, { method: 'DELETE' });
        showToast(`Cleared ${result.cleared} words`, 'success');
        loadWordSetWords(wsId);
        loadWordSets();
    } catch (e) { /* handled */ }
}

// --- BATCH IMPORT (scoped to word set) ---

function openImportModal(wsId) {
    document.getElementById('importSetId').value = wsId;
    document.getElementById('importText').value = '';
    document.getElementById('importModal').classList.remove('hidden');
}

function closeImportModal() {
    document.getElementById('importModal').classList.add('hidden');
    document.getElementById('importForm').reset();
}

document.getElementById('btnImportModalClose')?.addEventListener('click', closeImportModal);
document.getElementById('btnImportCancel')?.addEventListener('click', closeImportModal);

document.getElementById('importForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const setId = document.getElementById('importSetId').value;
    const text = document.getElementById('importText').value;
    const words = text.split(/[\n,]+/).map(w => w.trim()).filter(w => w.length > 0);
    if (words.length === 0) {
        showToast('No valid words found to import', 'error');
        return;
    }
    try {
        const result = await api(`/word-sets/${setId}/words/batch`, { method: 'POST', body: JSON.stringify({ words }) });
        showToast(`Imported ${result.added} words (${result.skipped} skipped)`, 'success');
        closeImportModal();
        loadWordSetWords(setId);
        loadWordSets();
    } catch (e) { /* handled */ }
});

// --- FALLBACK MODELS ---

async function loadModels() {
    try {
        const data = await api('/models');
        fallbackModels = data.entries || [];
        modelTestModelId = data.testModelId || '';
        renderModels();
        renderTestModelSelect();
    } catch (e) {
        console.error('Failed to load models:', e);
    }
}

function renderModels() {
    const tbody = document.getElementById('modelsList');
    if (!tbody) return;

    const countLabel = document.getElementById('modelsCountLabel');
    if (countLabel) {
        const n = fallbackModels.length;
        countLabel.textContent = n === 0 ? 'No models configured' :
            n === 1 ? '1 model configured' : `${n} models configured`;
    }

    if (fallbackModels.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="2" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <p>No fallback models configured.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = fallbackModels.map(m => `
        <tr>
            <td><span class="word-pattern">${esc(m.id)}</span></td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon btn-icon-danger" data-model-action="delete" data-id="${esc(m.id)}" title="Delete">${icons.trash}</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderTestModelSelect() {
    const select = document.getElementById('testModelSelect');
    if (!select) return;
    select.innerHTML = fallbackModels.map(m =>
        `<option value="${esc(m.id)}" ${m.id === modelTestModelId ? 'selected' : ''}>${esc(m.id)}</option>`
    ).join('');
    if (!fallbackModels.some(m => m.id === modelTestModelId) && modelTestModelId) {
        select.insertAdjacentHTML('afterbegin',
            `<option value="${esc(modelTestModelId)}" selected>${esc(modelTestModelId)} (custom)</option>`
        );
    }
}

async function addModel(id) {
    try {
        await api('/models', { method: 'POST', body: JSON.stringify({ id }) });
        showToast('Model added', 'success');
        loadModels();
    } catch (e) { /* handled */ }
}

async function deleteModel(id) {
    if (!await showConfirm({ title: 'Delete Model', message: `Remove "${id}" from fallback list?`, icon: 'trash', danger: true })) return;
    try {
        await api(`/models/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('Model deleted', 'success');
        loadModels();
    } catch (e) { /* handled */ }
}

async function resetModels() {
    if (!await showConfirm({
        title: 'Reset Models',
        message: 'Restore the built-in default model list?',
        icon: 'warning'
    })) return;
    try {
        await api('/models/reset', { method: 'POST' });
        showToast('Models reset to defaults', 'success');
        loadModels();
    } catch (e) { /* handled */ }
}

async function changeTestModel(id) {
    try {
        await api('/models/test-model', { method: 'PUT', body: JSON.stringify({ id }) });
        modelTestModelId = id;
        showToast('Test model updated', 'success');
    } catch (e) {
        renderTestModelSelect();
    }
}

function openModelModal() {
    document.getElementById('modelId').value = '';
    document.getElementById('modelModal').classList.remove('hidden');
    document.getElementById('modelId').focus();
}

function closeModelModal() {
    document.getElementById('modelModal').classList.add('hidden');
    document.getElementById('modelForm').reset();
}

document.getElementById('btnAddModel')?.addEventListener('click', openModelModal);
document.getElementById('btnModelModalClose')?.addEventListener('click', closeModelModal);
document.getElementById('btnModelCancel')?.addEventListener('click', closeModelModal);
document.getElementById('btnResetModels')?.addEventListener('click', resetModels);
document.getElementById('testModelSelect')?.addEventListener('change', (e) => changeTestModel(e.target.value));

document.getElementById('modelForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modelId').value.trim();
    if (!id) return;
    await addModel(id);
    closeModelModal();
});

document.getElementById('modelsListHeader')?.addEventListener('click', () => {
    const card = document.getElementById('modelsCard');
    const content = document.getElementById('modelsListContent');
    if (card && content) {
        card.classList.toggle('expanded');
        content.classList.toggle('collapsed');
    }
});

document.getElementById('modelsList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-model-action]');
    if (!btn) return;
    if (btn.dataset.modelAction === 'delete') deleteModel(btn.dataset.id);
});

// --- API KEYS ---

let apiKeyList = document.getElementById('apiKeyList');

async function loadApiKeys() {
    try {
        apiKeys = await api('/apikeys');
        renderApiKeys();
    } catch (e) {
        console.error(e);
    }
}

function renderApiKeys() {
    if (!apiKeyList) return;
    if (apiKeys.length === 0) {
        apiKeyList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔑</div>
                <h3>No API keys yet</h3>
                <p>Create an API key to start accepting requests.</p>
            </div>
        `;
        return;
    }
    apiKeyList.innerHTML = apiKeys.map(k => `
        <div class="card">
            <div class="card-header">
                <span class="card-title">${esc(k.name)}</span>
                <span class="apikey-credential-tag ${k.credentialName ? '' : 'unassigned'}">${k.credentialName ? esc(k.credentialName) : 'Unassigned'}</span>
            </div>
            <div class="card-details">
                <div class="detail-row"><span>Key</span><span class="code">${esc(k.keyPreview)}</span></div>
            </div>
            <div class="card-actions">
                <button class="btn-icon" data-apikey-action="edit" data-id="${k.id}" title="Edit">${icons.faders}</button>
                <button class="btn-icon btn-icon-danger" data-apikey-action="delete" data-id="${k.id}" title="Delete">${icons.disconnect}</button>
            </div>
        </div>
    `).join('');
}

function populateCredentialSelect(selectedId) {
    const select = document.getElementById('apiKeyCredential');
    if (!select) return;
    const enabledCreds = credentials.filter(c => c.enabled);
    const selectedInList = enabledCreds.some(c => c.id === selectedId);
    let options = '';
    if (selectedId && !selectedInList) {
        const disabledCred = credentials.find(c => c.id === selectedId);
        if (disabledCred) {
            options += `<option value="${disabledCred.id}" selected>${esc(disabledCred.name)} (disabled)</option>`;
        }
    }
    const placeholder = enabledCreds.length
        ? '<option value="" disabled' + (!selectedId ? ' selected' : '') + '>Select a credential</option>'
        : '<option value="" disabled selected>No enabled credentials</option>';
    select.innerHTML = placeholder + options +
        enabledCreds.map(c =>
            `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`
        ).join('');
}

function openApiKeyModal(existing = null) {
    const isEdit = !!existing;
    document.getElementById('apiKeyModalTitle').textContent = isEdit ? 'Edit API Key' : 'New API Key';
    document.getElementById('apiKeyEditId').value = existing ? existing.id : '';
    document.getElementById('apiKeyName').value = existing ? existing.name : '';
    populateCredentialSelect(existing?.credentialId);
    document.getElementById('apiKeyModal').classList.remove('hidden');
    document.getElementById(isEdit ? 'apiKeyCredential' : 'apiKeyName').focus();
}

function closeApiKeyModal() {
    document.getElementById('apiKeyModal').classList.add('hidden');
    document.getElementById('apiKeyForm').reset();
}

async function saveApiKey(data) {
    const isEdit = !!data.id;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/apikeys/${data.id}` : '/apikeys';
    try {
        const result = await api(url, { method, body: JSON.stringify(data) });
        closeApiKeyModal();
        if (!isEdit && result.key) {
            document.getElementById('createdApiKeyValue').textContent = result.key;
            document.getElementById('apiKeyCreatedModal').classList.remove('hidden');
        } else {
            showToast('API key updated', 'success');
        }
        loadApiKeys();
    } catch (e) { /* handled */ }
}

async function deleteApiKey(id) {
    if (!await showConfirm({ title: 'Delete API Key', message: 'This action cannot be undone.', icon: 'trash', danger: true })) return;
    try {
        await api(`/apikeys/${id}`, { method: 'DELETE' });
        showToast('API key deleted', 'success');
        loadApiKeys();
    } catch (e) { /* handled */ }
}

document.getElementById('btnAddApiKey')?.addEventListener('click', () => openApiKeyModal());
document.getElementById('btnApiKeyModalClose')?.addEventListener('click', closeApiKeyModal);
document.getElementById('btnApiKeyCancel')?.addEventListener('click', closeApiKeyModal);

document.getElementById('apiKeyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('apiKeyEditId').value || undefined;
    const data = {
        id: editId,
        name: document.getElementById('apiKeyName').value.trim(),
        credentialId: document.getElementById('apiKeyCredential').value || null
    };
    if (!data.credentialId) {
        showToast('Please select a credential', 'error');
        return;
    }
    await saveApiKey(data);
});

document.getElementById('btnCopyApiKey')?.addEventListener('click', () => {
    const key = document.getElementById('createdApiKeyValue').textContent;
    navigator.clipboard.writeText(key).then(() => showToast('Copied to clipboard', 'success'));
});

document.getElementById('btnApiKeyCreatedOk')?.addEventListener('click', () => {
    document.getElementById('apiKeyCreatedModal').classList.add('hidden');
});

apiKeyList?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-apikey-action]');
    if (!btn) return;
    const action = btn.dataset.apikeyAction;
    const id = btn.dataset.id;
    if (action === 'edit') {
        const k = apiKeys.find(a => a.id === id);
        if (k) openApiKeyModal(k);
    } else if (action === 'delete') {
        deleteApiKey(id);
    }
});
