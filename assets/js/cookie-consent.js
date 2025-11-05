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

    // Show banner only if no prior choice
    if (!consent) {
        banner.style.display = "block";
    }

    const hideBanner = () => {
        banner.style.display = "none";
    };

    if (acceptBtn) {
        acceptBtn.addEventListener("click", () => {
            try {
                localStorage.setItem("cookieConsent", "accepted");
            } catch {
                // ignore storage errors (private mode)
            }
            hideBanner();
            // Hook for analytics initialization if needed
            // initAnalytics();
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
            // Ensure no analytics are loaded here
        });
    }
});
