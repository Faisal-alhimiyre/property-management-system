document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("tenantApartments");

  if (!container) return;

  async function getApartments() {
    try {
      const response = await fetch(`${WalajnaAuth.API_BASE}/api/apartments`, {
        headers: WalajnaAuth.getAuthHeaders()
      });
      if (response.ok) {
        return await response.json();
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }

  async function getCurrentUser() {
    try {
      const response = await fetch(`${WalajnaAuth.API_BASE}/users/me`, {
        headers: WalajnaAuth.getAuthHeaders()
      });
      if (response.ok) {
        return await response.json();
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  const currentUser = await getCurrentUser();
  const apartments = await getApartments();

  if (!currentUser) {
    container.innerHTML = `<p>لم يتم العثور على المستخدم الحالي</p>`;
    return;
  }

  function toStr(value) {
    return String(value ?? "").trim();
  }

  function isApartmentLinkedToCurrentUser(apartment, user) {
    if (!apartment || !user) return false;

    const apartmentTenantUserId = apartment.tenant_user_id ?? apartment.tenantUserId ?? null;
    const apartmentTenantNationalId = apartment.tenant_national_id ?? apartment.tenantNationalId ?? null;

    const userId = user.id;
    const userNationalId = user.national_id ?? user.nationalId ?? null;

    if (apartmentTenantUserId != null && userId != null && Number(apartmentTenantUserId) === Number(userId)) {
      return true;
    }

    if (userNationalId && apartmentTenantNationalId && toStr(apartmentTenantNationalId) === toStr(userNationalId)) {
      return true;
    }

    return false;
  }

  const myApartments = (Array.isArray(apartments) ? apartments : []).filter((apt) =>
    isApartmentLinkedToCurrentUser(apt, currentUser)
  );

  if (myApartments.length === 0) {
    container.innerHTML = `<p class = "no-building">لا توجد وحدات مرتبطة بحسابك حالياً</p>`;
    return;
  }

  myApartments.forEach((apt) => {
    const card = document.createElement("div");
    card.className = "building-card clickable-card";
    card.dataset.target = "../main/apartment_info.html";
    card.dataset.id = apt.id;

    card.innerHTML = `
      <img src="../pics/logo.png" alt="Apartment">
      <p>
        ${apt.address || "شقة"}
      </p>
    `;

    card.addEventListener("click", () => {
      window.location.href = `../main/apartment_info.html?id=${encodeURIComponent(apt.id)}`;
    });

    container.appendChild(card);
  });
});