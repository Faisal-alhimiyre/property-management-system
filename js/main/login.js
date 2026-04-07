document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");

  const API_BASE = 'http://127.0.0.1:8002';

  function showError(msg) {
    if (!errorBox) {
      alert(msg);
      return;
    }
    errorBox.textContent = msg;
  }

  /** FastAPI may return detail as a string, or 422 list of { msg, loc, type } */
  function formatApiDetail(detail) {
    if (detail == null || detail === '') {
      return 'بيانات الدخول غير صحيحة.';
    }
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          if (item == null) return '';
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item.msg) return String(item.msg);
          return '';
        })
        .filter(Boolean);
      return parts.length ? parts.join(' ') : 'بيانات الدخول غير صحيحة.';
    }
    if (typeof detail === 'object' && detail.msg) {
      return String(detail.msg);
    }
    return 'بيانات الدخول غير صحيحة.';
  }

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const nationalIdInput = document.getElementById("nationalId");
    const passwordInput = document.getElementById("password");
    const national_id = (nationalIdInput ? String(nationalIdInput.value ?? "").trim() : "");
    /* JSON.stringify drops keys whose value is undefined — always send real strings */
    const password = passwordInput ? String(passwordInput.value ?? "") : "";

    if (!national_id || !password) {
      showError("الرجاء تعبئة رقم الهوية وكلمة المرور.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ national_id, password }),
      });

      if (!response.ok) {
        let detailText = 'بيانات الدخول غير صحيحة.';
        try {
          const error = await response.json();
          detailText = formatApiDetail(error.detail);
        } catch {
          /* ignore */
        }
        showError(detailText);
        return;
      }

      const data = await response.json();
      const user = data.user || null;

      if (!user) {
        showError("خطأ في الاستجابة من الخادم، حاول مرة أخرى.");
        return;
      }

      if (typeof WalajnaAuth !== 'undefined' && typeof WalajnaAuth.setSession === 'function') {
        WalajnaAuth.setSession({
          user: {
            ...user,
            roles: user.roles || [user.role],
          },
        });
      }

      window.location.href = "./role.html";
    } catch (error) {
      showError("خطأ في الشبكة. حاول مرة أخرى.");
    }
  });
});