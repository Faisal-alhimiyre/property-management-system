// auth.js — httpOnly cookie session + minimal client profile in sessionStorage

const API_BASE = 'http://127.0.0.1:8000';

const USER_KEY = 'walajna_current_user';
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
  return null;
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

function setSession({ user }) {
  if (!user) return;
  const normalized = mapServerUser(user) || user;
  if (!Array.isArray(normalized.roles)) {
    normalized.roles = [normalized.role || 'tenant'];
  }
  sessionStorage.setItem(USER_KEY, JSON.stringify(normalized));
  const role = normalized.role || normalized.roles[0] || 'tenant';
  sessionStorage.setItem(ACTIVE_ROLE_KEY, role);
}

function clearSession() {
  try {
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(ACTIVE_ROLE_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('access_token');
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

function handleUnauthorized(message) {
  void logoutOnServer();
  clearSession();
  const reason = message || 'انتهت الجلسة أو التوكن غير صالح. سجل الدخول مرة أخرى.';
  try {
    sessionStorage.setItem('walajna_auth_error', reason);
  } catch {
    /* ignore */
  }
  window.location.href = '../auth/login.html';
}

function getAuthHeaders(additional = {}) {
  return {
    'Content-Type': 'application/json',
    ...additional,
  };
}

/**
 * Authenticated fetch: sends cookies; merges JSON headers.
 * GET/HEAD omit default Content-Type so the browser sends a "simple" request (no CORS preflight).
 */
function fetchWithAuth(url, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const method = String(rest.method || 'GET').toUpperCase();
  const useJsonHeaders = method !== 'GET' && method !== 'HEAD';
  return fetch(url, {
    credentials: 'include',
    ...rest,
    headers: {
      ...(useJsonHeaders ? getAuthHeaders() : {}),
      ...(optHeaders || {}),
    },
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
  hydrateSession,
  logoutOnServer,
  requireAuth,
  requireRole,
  ensureRoleSetup,
};

window.requireAuth = requireAuth;
window.requireRole = requireRole;
window.ensureRoleSetup = ensureRoleSetup;
window.handleUnauthorized = handleUnauthorized;
