/* ============================================================
   cookie-consent.js
   Simple cookie consent banner logic with localStorage
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const banner = document.getElementById("cookie-banner");
  if (!banner) return;

  const acceptBtn = document.getElementById("accept-cookies");
  const declineBtn = document.getElementById("decline-cookies");

  // Safe localStorage access
  let consent = null;
  try {
    consent = localStorage.getItem("cookieConsent");
  } catch {
    consent = null;
  }

  function showBanner() {
    banner.style.display = "block";
  }

  function hideBanner() {
    banner.style.display = "none";
  }

  function enableAnalytics() {
    if (typeof window.qcLoadAnalytics === "function") {
      window.qcLoadAnalytics();
    }
  }

  // Initial state based on stored consent
  if (consent === "accepted") {
    hideBanner();
    enableAnalytics();
  } else if (consent === "declined") {
    hideBanner();
  } else {
    showBanner();
  }

  if (acceptBtn) {
    acceptBtn.addEventListener("click", () => {
      try {
        localStorage.setItem("cookieConsent", "accepted");
      } catch {
        // ignore storage errors
      }
      hideBanner();
      enableAnalytics();
    });
  }

  if (declineBtn) {
    declineBtn.addEventListener("click", () => {
      try {
        localStorage.setItem("cookieConsent", "declined");
      } catch {
        // ignore storage errors
      }
      hideBanner();
      // No analytics on decline
    });
  }
});
