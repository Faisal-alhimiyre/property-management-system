// auth.js
// Shared authentication/session helpers for Walajna

const API_BASE = 'http://127.0.0.1:8000';

function getAccessToken() {
  return localStorage.getItem('access_token');
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('walajna_current_user') || 'null');
  } catch {
    return null;
  }
}

function setSession({ access_token, user }) {
  localStorage.setItem('access_token', access_token);
  localStorage.setItem('walajna_current_user', JSON.stringify(user));
  localStorage.setItem('activeRole', user.role || (user.roles ? user.roles[0] : 'tenant'));
}

function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('walajna_current_user');
  localStorage.removeItem('activeRole');
}

function getAuthHeaders(additional = {}) {
  const token = getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...additional,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function requireAuth() {
  const user = getCurrentUser();
  const token = getAccessToken();
  if (!user || !token) {
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
  const activeRole = localStorage.getItem('activeRole') || user.role;
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
  const activeRole = localStorage.getItem('activeRole');
  if (!activeRole) {
    localStorage.setItem('activeRole', user.role || (user.roles ? user.roles[0] : 'tenant'));
  }
}

window.WalajnaAuth = {
  API_BASE,
  getAccessToken,
  getCurrentUser,
  setSession,
  clearSession,
  getAuthHeaders,
  requireAuth,
  requireRole,
  ensureRoleSetup
};

// Also expose as globals so inline <script> tags can call them directly
window.requireAuth = requireAuth;
window.requireRole = requireRole;
window.ensureRoleSetup = ensureRoleSetup;
