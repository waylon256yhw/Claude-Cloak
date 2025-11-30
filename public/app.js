const API_BASE = '/admin/api';

let credentials = [];
let proxyKey = localStorage.getItem('claude_proxy_key') || '';

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
    authModal: document.getElementById('authModal'),
    form: document.getElementById('credentialForm'),
    authForm: document.getElementById('authForm'),
    status: document.getElementById('globalStatus'),
    toastContainer: document.getElementById('toastContainer'),
    btnLogout: document.getElementById('btnLogout')
};

document.addEventListener('DOMContentLoaded', () => {
    updateThemeButton();
    document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);
    document.getElementById('strictModeToggle')?.addEventListener('change', toggleStrictMode);

    if (!proxyKey) {
        showAuthModal();
    } else {
        loadCredentials();
        loadSettings();
        checkStatus();
    }
});

const api = async (endpoint, options = {}) => {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${proxyKey}`,
        ...options.headers
    };
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (res.status === 401) {
            logout();
            throw new Error('Unauthorized. Please login again.');
        }
        if (!res.ok) throw new Error((await res.json()).message || 'Request failed');
        return await res.json();
    } catch (err) {
        showToast(err.message, 'error');
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
    if (!confirm('Are you sure you want to delete this credential?')) return;
    try {
        await api(`/credentials/${id}`, { method: 'DELETE' });
        showToast('Credential deleted', 'success');
        loadCredentials();
    } catch (e) { /* handled */ }
}

async function activateCredential(id) {
    const cred = credentials.find(c => c.id === id);
    if (!cred) return;
    if (!confirm(`Switch active credential to '${cred.name}'?\n\nOngoing requests will continue with current credential.`)) return;
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
                <span class="badge ${cred.isActive ? 'active' : 'inactive'}">${cred.isActive ? 'Active' : 'Standby'}</span>
            </div>
            <div class="card-details">
                <div class="detail-row"><span>Target</span><span class="code">${esc(cred.targetUrl)}</span></div>
                <div class="detail-row"><span>Key</span><span class="code">${cred.apiKey.length > 8 ? '...' + cred.apiKey.slice(-4) : '****'}</span></div>
            </div>
            <div class="card-actions">
                ${!cred.isActive ? `<button class="btn btn-sm btn-secondary" onclick="activateCredential('${cred.id}')">Activate</button>` : '<button class="btn btn-sm btn-secondary" disabled>Selected</button>'}
                <button class="btn btn-sm btn-secondary" onclick="editCredential('${cred.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCredential('${cred.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

els.authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = document.getElementById('proxyKeyInput').value;
    if (key) {
        proxyKey = key;
        localStorage.setItem('claude_proxy_key', key);
        els.authModal.classList.add('hidden');
        loadCredentials();
        loadSettings();
        checkStatus();
    }
});

document.getElementById('btnAdd').addEventListener('click', () => openModal());
document.getElementById('btnModalClose').addEventListener('click', closeModal);
document.getElementById('btnCancel').addEventListener('click', closeModal);
els.btnLogout.addEventListener('click', logout);

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

function showAuthModal() {
    els.authModal.classList.remove('hidden');
}

function logout() {
    localStorage.removeItem('claude_proxy_key');
    proxyKey = '';
    location.reload();
}

function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    els.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

const esc = (str) => str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
