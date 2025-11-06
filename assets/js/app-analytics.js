/* app-analytics.js
   Google Analytics loader (called after cookie consent)
*/

(function () {
  const GA_ID = "G-WH9LR54HE4";

  function loadGtag() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;

    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    script.onload = () => {
      gtag("js", new Date());
      gtag("config", GA_ID);
    };

    document.head.appendChild(script);
  }

  // Expose global loader for cookie-consent.js
  window.qcLoadAnalytics = loadGtag;
})();
