/* ============================================================
   app-theme.js
   Handles theme switching (dark / light) + persistence
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    const toggleBtn = document.getElementById("theme-toggle");
    const icon = document.getElementById("theme-toggle-icon");
    const text = document.getElementById("theme-toggle-text");

    // --- Load initial theme from localStorage ---
    const savedTheme = localStorage.getItem("qc-theme");

    // Default is dark if no saved theme
    if (savedTheme === "light") {
        setTheme("light", false);
    } else {
        setTheme("dark", false);
    }

    // --- Event listener for toggle button ---
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const isLight = body.classList.contains("theme-light");
            setTheme(isLight ? "dark" : "light", true);
        });
    }

    // --- Function to apply theme ---
    function setTheme(theme, persist = true) {
        if (theme === "light") {
            body.classList.add("theme-light");
            icon.classList.replace("bi-moon-stars", "bi-sun");
            text.textContent = "Light";
        } else {
            body.classList.remove("theme-light");
            icon.classList.replace("bi-sun", "bi-moon-stars");
            text.textContent = "Dark";
        }

        if (persist) {
            localStorage.setItem("qc-theme", theme);
        }
    }
});
