// auth.js — httpOnly cookie session + minimal client profile in sessionStorage

function resolveApiBase() {
  const explicit = (window.__WALAJNA_API_BASE || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const fromStorage = (localStorage.getItem('walajna_api_base') || '').trim();
  if (fromStorage) return fromStorage.replace(/\/+$/, '');

  const host = String(window.location.hostname || '').toLowerCase();
  if (host === '127.0.0.1' || host === 'localhost') {
    return 'http://127.0.0.1:8002';
  }

  // GitHub Pages → Render API (update if your Render service URL changes).
  if (host.endsWith('github.io')) {
    return 'https://property-management-system-155h.onrender.com';
  }

  return 'https://property-management-system-155h.onrender.com';
}

const API_BASE = resolveApiBase();

const USER_KEY = 'walajna_current_user';
const TOKEN_KEY = 'walajna_access_token';
const ACTIVE_ROLE_KEY = 'activeRole';

function mapServerUser(u) {
  if (!u || typeof u !== 'object') return null;
  const role = u.role || 'tenant';
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role,
    phone: u.phone,
    nationalId: u.national_id ?? u.nationalId ?? null,
    national_id: u.national_id ?? null,
    roles: Array.isArray(u.roles) ? u.roles : [role],
  };
}

function getAccessToken() {
  try {
    return (
      sessionStorage.getItem(TOKEN_KEY) ||
      localStorage.getItem(TOKEN_KEY) ||
      null
    );
  } catch {
    return null;
  }
}

function getCurrentUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function getActiveRole() {
  let r = sessionStorage.getItem(ACTIVE_ROLE_KEY);
  if (!r) {
    r = localStorage.getItem(ACTIVE_ROLE_KEY);
    if (r) {
      sessionStorage.setItem(ACTIVE_ROLE_KEY, r);
      try {
        localStorage.removeItem(ACTIVE_ROLE_KEY);
      } catch {
        /* ignore */
      }
    }
  }
  return r || null;
}

function setSession({ user, access_token }) {
  if (!user) return;
  const normalized = mapServerUser(user) || user;
  if (!Array.isArray(normalized.roles)) {
    normalized.roles = [normalized.role || 'tenant'];
  }
  sessionStorage.setItem(USER_KEY, JSON.stringify(normalized));
  const role = normalized.role || normalized.roles[0] || 'tenant';
  sessionStorage.setItem(ACTIVE_ROLE_KEY, role);
  const tok =
    (typeof access_token === 'string' && access_token.trim()) ||
    (typeof user.access_token === 'string' && user.access_token.trim()) ||
    '';
  if (tok) {
    sessionStorage.setItem(TOKEN_KEY, tok);
    try {
      localStorage.setItem(TOKEN_KEY, tok);
    } catch {
      /* ignore */
    }
    unauthorizedRedirectInFlight = false;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ACTIVE_ROLE_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('access_token');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACTIVE_ROLE_KEY);
  } catch {
    /* ignore */
  }
}

async function logoutOnServer() {
  try {
    await fetch(`${API_BASE}/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    /* ignore */
  }
}

let unauthorizedRedirectInFlight = false;
let lastUnauthorizedAt = 0;

/** Only force login when 401 means invalid/expired session — not DB blips or parallel noise. */
async function shouldForceLogoutOn401(response) {
  if (!getAccessToken()) return false;
  try {
    const data = await response.clone().json();
    const detail = data && data.detail;
    const msg = typeof detail === 'string' ? detail : '';
    if (
      msg === 'Session validation failed' ||
      msg === 'Database temporarily unavailable. Please retry.'
    ) {
      return false;
    }
  } catch {
    /* empty body or non-JSON */
  }
  return true;
}

function handleUnauthorized(message) {
  const now = Date.now();
  if (unauthorizedRedirectInFlight || now - lastUnauthorizedAt < 3000) return;
  unauthorizedRedirectInFlight = true;
  lastUnauthorizedAt = now;
  void logoutOnServer();
  clearSession();
  const reason = message || 'انتهت الجلسة أو التوكن غير صالح. سجل الدخول مرة أخرى.';
  try {
    sessionStorage.setItem('walajna_auth_error', reason);
  } catch {
    /* ignore */
  }
  try {
    window.location.href = new URL('../auth/login.html', window.location.href).href;
  } catch {
    window.location.href = '../auth/login.html';
  }
}

/** Hydration calls GET /users/me with no client user — 401 means "not logged in", not "session expired mid-app". */
function isUsersMeProbeWithoutClientUser(url) {
  try {
    const s = typeof url === 'string' ? url : String(url);
    if (!s.includes('/users/me')) return false;
    return !getCurrentUser();
  } catch {
    return false;
  }
}

function getAuthHeaders(additional = {}, { json = true } = {}) {
  const headers = { ...additional };
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function getBearerHeader() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Authenticated fetch: sends cookies; merges JSON headers.
 * GET/HEAD omit default Content-Type so the browser sends a "simple" request (no CORS preflight).
 */
function fetchWithAuth(url, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const method = String(rest.method || 'GET').toUpperCase();
  const isMultipartBody =
    typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const useJsonHeaders =
    method !== 'GET' && method !== 'HEAD' && !isMultipartBody;
  return fetch(url, {
    credentials: 'include',
    ...rest,
    headers: {
      ...getBearerHeader(),
      ...(useJsonHeaders ? getAuthHeaders({}, { json: true }) : {}),
      ...(optHeaders || {}),
    },
  }).then(async (response) => {
    if (
      response.status === 401 &&
      !isUsersMeProbeWithoutClientUser(url) &&
      (await shouldForceLogoutOn401(response))
    ) {
      handleUnauthorized();
    }
    return response;
  });
}

async function hydrateSession() {
  if (getCurrentUser()) {
    return true;
  }
  try {
    const r = await fetchWithAuth(`${API_BASE}/users/me`, { method: 'GET' });
    if (!r.ok) {
      return false;
    }
    const u = await r.json();
    setSession({ user: u });
    if (!sessionStorage.getItem(ACTIVE_ROLE_KEY) && u.role) {
      sessionStorage.setItem(ACTIVE_ROLE_KEY, u.role);
    }
    return true;
  } catch {
    return false;
  }
}

/** Confirm cookie/Bearer session before parallel dashboard fetches (avoids empty API rows on cold login). */
async function ensureSessionValid() {
  if (!getCurrentUser()) {
    return false;
  }
  try {
    const r = await fetchWithAuth(`${API_BASE}/users/me`, { method: 'GET' });
    if (!r.ok) {
      return r.status === 401 ? false : true;
    }
    const u = await r.json();
    setSession({ user: u });
    if (!sessionStorage.getItem(ACTIVE_ROLE_KEY) && u.role) {
      sessionStorage.setItem(ACTIVE_ROLE_KEY, u.role);
    }
    return true;
  } catch {
    return true;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET JSON with retries on transient 5xx / network errors.
 * Returns { ok, data, status } — data is null when all attempts fail.
 */
async function fetchJsonWithAuthRetry(url, options = {}, retryOpts = {}) {
  const retries = Math.max(1, Number(retryOpts.retries) || 3);
  const delayMs = Number(retryOpts.delayMs) || 400;
  const method = String(options.method || 'GET').toUpperCase();
  let lastStatus = 0;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchWithAuth(url, options);
      lastStatus = response.status;
      if (response.ok) {
        const data = await response.json();
        return { ok: true, data, status: response.status };
      }
      const retryable =
        method === 'GET' &&
        (response.status >= 500 || response.status === 429 || response.status === 408);
      if (!retryable || attempt >= retries - 1) {
        return { ok: false, data: null, status: response.status };
      }
    } catch {
      if (attempt >= retries - 1) {
        return { ok: false, data: null, status: lastStatus || 0 };
      }
    }
    await delay(delayMs * (attempt + 1));
  }

  return { ok: false, data: null, status: lastStatus || 0 };
}

function requireAuth() {
  if (!getCurrentUser()) {
    window.location.href = '../auth/login.html';
    return false;
  }
  return true;
}

function requireRole(requiredRole) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = '../auth/login.html';
    return false;
  }
  const activeRole = getActiveRole() || user.role;
  if (activeRole !== requiredRole) {
    if (requiredRole === 'owner') window.location.href = '../owners/owner_home.html';
    else if (requiredRole === 'tenant') window.location.href = '../tenants/tenant_home.html';
    else window.location.href = '../auth/role.html';
    return false;
  }
  return true;
}

function ensureRoleSetup() {
  const user = getCurrentUser();
  if (!user) return;
  if (!getActiveRole()) {
    sessionStorage.setItem(ACTIVE_ROLE_KEY, user.role || (user.roles ? user.roles[0] : 'tenant'));
  }
}

window.WalajnaAuth = {
  API_BASE,
  getAccessToken,
  getCurrentUser,
  getActiveRole,
  setSession,
  clearSession,
  handleUnauthorized,
  getAuthHeaders,
  fetchWithAuth,
  fetchJsonWithAuthRetry,
  hydrateSession,
  ensureSessionValid,
  logoutOnServer,
  requireAuth,
  requireRole,
  ensureRoleSetup,
};

window.requireAuth = requireAuth;
window.requireRole = requireRole;
window.ensureRoleSetup = ensureRoleSetup;
window.handleUnauthorized = handleUnauthorized;
