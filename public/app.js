const API_BASE = '/admin/api';

const AUTH_STORAGE_KEY = 'claude_admin_proxy_key';
const IDLE_LOGOUT_MS = 30 * 60 * 1000; // 30 minutes, set to 0 to disable

let credentials = [];
let idleTimer = null;
let idleListenersAttached = false;
let unauthorizedHandled = false;

// Storage helpers
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

// UI State
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

// Idle logout
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

// Validation
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

// SVG Icons
const icons = {
    pulse: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" fill="currentColor"/><path d="M10 2V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 15V18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 10L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 10L2 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    power: `<svg viewBox="0 0 20 20" fill="none"><path d="M10 3V9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 5.5C16.5 7 18 9.5 18 12C18 15.5 14.5 18 10 18C5.5 18 2 15.5 2 12C2 9.5 3.5 7 6 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    faders: `<svg viewBox="0 0 20 20" fill="none"><path d="M4 4V16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 4V16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 4V16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="2" y="11" width="4" height="2" rx="1" fill="currentColor"/><rect x="8" y="6" width="4" height="2" rx="1" fill="currentColor"/><rect x="14" y="13" width="4" height="2" rx="1" fill="currentColor"/></svg>`,
    disconnect: `<svg viewBox="0 0 20 20" fill="none"><circle cx="6" cy="10" r="3" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="10" r="3" stroke="currentColor" stroke-width="2"/><path d="M9 10H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 2"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`
};

// Theme
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
    document.getElementById('quickGuideToggle')?.addEventListener('click', () => {
        document.getElementById('quickGuideCard').classList.toggle('collapsed');
    });

    // Login form submission
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

            loadCredentials();
            loadSettings();
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    // Toggle auth password visibility
    document.querySelector('.toggle-auth-visibility')?.addEventListener('click', function() {
        const input = els.authKey;
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
            this.textContent = input.type === 'password' ? '👁️' : '🔒';
        }
    });

    attachIdleLogoutListeners();
    checkStatus();

    // Check auth on load
    const authed = await ensureAuthenticated();
    if (authed) {
        loadCredentials();
        loadSettings();
    }
});

// API helper with auth
const hasHeader = (headers, nameLower) => {
    return Object.keys(headers || {}).some((k) => k.toLowerCase() === nameLower);
};

const api = async (endpoint, options = {}) => {
    const headers = { ...options.headers };

    // Add auth header
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

async function activateCredential(id) {
    const cred = credentials.find(c => c.id === id);
    if (!cred) return;
    const confirmed = await showConfirm({
        title: 'Switch Credential',
        message: `Activate "${cred.name}" as the primary credential?`,
        icon: 'power'
    });
    if (!confirmed) return;
    try {
        await api(`/credentials/${id}/activate`, { method: 'POST' });
        showToast('Active credential switched', 'success');
        loadCredentials();
    } catch (e) { /* handled */ }
}

async function checkStatus() {
    try {
        const res = await fetch('/healthz');
        if (res.ok) {
            els.status.className = 'status-indicator online';
            els.status.querySelector('.status-text').textContent = 'System Online';
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

function renderList() {
    if (credentials.length === 0) {
        els.list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📂</div>
                <h3>No credentials yet</h3>
                <p>Add a new API key to start proxying requests.</p>
            </div>
        `;
        return;
    }
    els.list.innerHTML = credentials.map(cred => `
        <div class="card ${cred.isActive ? 'active' : ''}">
            <div class="card-header">
                <span class="card-title">${esc(cred.name)}</span>
                <span class="status-badge ${cred.isActive ? 'active' : ''}" title="${cred.isActive ? 'Active' : 'Standby'}">${icons.pulse}</span>
            </div>
            <div class="card-details">
                <div class="detail-row"><span>Target</span><span class="code" title="${esc(cred.targetUrl)}">${esc(cred.targetUrl)}</span></div>
                <div class="detail-row"><span>Key</span><span class="code">${cred.apiKey.length > 8 ? '...' + cred.apiKey.slice(-4) : '****'}</span></div>
            </div>
            <div class="card-actions">
                ${!cred.isActive ? `<button class="btn-icon" onclick="activateCredential('${cred.id}')" title="Activate">${icons.power}</button>` : ''}
                <button class="btn-icon" onclick="editCredential('${cred.id}')" title="Edit">${icons.faders}</button>
                <button class="btn-icon btn-icon-danger" onclick="deleteCredential('${cred.id}')" title="Delete">${icons.disconnect}</button>
            </div>
        </div>
    `).join('');
}

document.getElementById('btnAdd').addEventListener('click', () => openModal());
document.getElementById('btnModalClose').addEventListener('click', closeModal);
document.getElementById('btnCancel').addEventListener('click', closeModal);

els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        id: document.getElementById('editId').value || undefined,
        name: document.getElementById('name').value,
        targetUrl: document.getElementById('targetUrl').value,
        apiKey: document.getElementById('apiKey').value
    };
    await saveCredential(data);
});

document.querySelector('.toggle-visibility').addEventListener('click', function() {
    const input = this.previousElementSibling;
    input.type = input.type === 'password' ? 'text' : 'password';
    this.textContent = input.type === 'password' ? '👁️' : '🔒';
});

function openModal(cred = null) {
    document.getElementById('modalTitle').textContent = cred ? 'Edit Credential' : 'Add Credential';
    document.getElementById('editId').value = cred ? cred.id : '';
    document.getElementById('name').value = cred ? cred.name : '';
    document.getElementById('targetUrl').value = cred ? cred.targetUrl : '';
    document.getElementById('apiKey').value = cred ? cred.apiKey : '';
    els.modal.classList.remove('hidden');
}

window.editCredential = (id) => {
    const cred = credentials.find(c => c.id === id);
    if (cred) openModal(cred);
};
window.activateCredential = activateCredential;
window.deleteCredential = deleteCredential;

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

// Enhanced escaping function to prevent XSS in HTML context
// Escapes: & < > " '
const esc = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
