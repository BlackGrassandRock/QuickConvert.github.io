/* ============================================================
   app-nav.js
   Navbar behavior: active links, in-page smooth scrolling,
   mobile collapse handling
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const nav = document.querySelector(".navbar");
    const navLinksNodeList = document.querySelectorAll(".navbar-nav .nav-link");
    const navLinks = Array.from(navLinksNodeList || []);
    const collapseEl = document.getElementById("mainNavbar");

    /* --------------------------------------------------------
       Navbar scrolled state
       -------------------------------------------------------- */
    if (nav) {
        const toggleScrolled = () => {
            const threshold = 8;
            if (window.scrollY > threshold) {
                nav.classList.add("navbar-scrolled");
            } else {
                nav.classList.remove("navbar-scrolled");
            }
        };

        toggleScrolled();
        window.addEventListener("scroll", toggleScrolled);
    }

    /* --------------------------------------------------------
       Collapse helpers (mobile)
       -------------------------------------------------------- */

    function collapseNavbarIfNeeded() {
        if (!collapseEl) return;
        if (!collapseEl.classList.contains("show")) return;

        if (typeof bootstrap !== "undefined" && bootstrap.Collapse) {
            const instance =
                bootstrap.Collapse.getInstance(collapseEl) ||
                new bootstrap.Collapse(collapseEl, { toggle: false });
            instance.hide();
        } else {
            collapseEl.classList.remove("show");
        }
    }

    /* --------------------------------------------------------
       Active link helpers
       -------------------------------------------------------- */

    function setActiveByPath() {
        if (!navLinks.length) return;

        const currentPath = window.location.pathname.split("/").pop() || "index.html";
        const currentHash = window.location.hash || "";

        let hasActive = false;
        for (const link of navLinks) {
            if (link.classList.contains("active")) {
                hasActive = true;
                break;
            }
        }

        // If HTML already defines .active, do not override
        if (hasActive) return;

        navLinks.forEach((link) => {
            const href = link.getAttribute("href") || "";
            link.classList.remove("active");

            if (href === currentPath || href === currentPath + currentHash) {
                link.classList.add("active");
                return;
            }

            if (
                currentPath === "index.html" &&
                currentHash &&
                (href === currentHash || href === "index.html" + currentHash)
            ) {
                link.classList.add("active");
            }
        });
    }

    /* --------------------------------------------------------
       Smooth scrolling helper
       -------------------------------------------------------- */

    function scrollToSection(sectionId) {
        if (!sectionId) return;
        const target = document.getElementById(sectionId);
        if (!target) return;

        const navHeight = nav ? nav.offsetHeight : 0;
        const rect = target.getBoundingClientRect();
        const offset = rect.top + window.pageYOffset - navHeight - 8;

        window.scrollTo({
            top: offset,
            behavior: "smooth"
        });
    }

    /* --------------------------------------------------------
       Attach click handlers to nav links
       -------------------------------------------------------- */

    navLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";

        // Same-page anchor (#section)
        if (href.startsWith("#")) {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const id = href.substring(1);
                scrollToSection(id);
                collapseNavbarIfNeeded();
            });
            return;
        }

        // Links like "index.html#section"
        if (href.includes("#")) {
            link.addEventListener("click", (e) => {
                const [path, hash] = href.split("#");
                const currentPath = window.location.pathname.split("/").pop() || "index.html";

                if (path === "" || path === currentPath) {
                    e.preventDefault();
                    if (hash) {
                        scrollToSection(hash);
                    }
                    collapseNavbarIfNeeded();
                }
                // Otherwise allow normal navigation to another page
            });
            return;
        }

        // Plain link to another page
        link.addEventListener("click", () => {
            collapseNavbarIfNeeded();
        });
    });

    // Initial active-link fallback
    setActiveByPath();

    /* --------------------------------------------------------
       Simple scrollspy for pages with in-page sections
       -------------------------------------------------------- */

    const sectionsNodeList = document.querySelectorAll("section[id]");
    const sections = Array.from(sectionsNodeList || []);

    if (sections.length && navLinks.length) {
        window.addEventListener("scroll", () => {
            const scrollPos = window.scrollY;
            const navHeight = nav ? nav.offsetHeight : 0;
            const currentPath = window.location.pathname.split("/").pop() || "index.html";

            let currentId = null;

            sections.forEach((section) => {
                const rect = section.getBoundingClientRect();
                const sectionTop = rect.top + window.pageYOffset - navHeight - 40;

                if (scrollPos >= sectionTop) {
                    currentId = section.id;
                }
            });

            if (!currentId) return;

            navLinks.forEach((link) => {
                const href = link.getAttribute("href") || "";
                const samePageAnchor =
                    href === "#" + currentId ||
                    href === currentPath + "#" + currentId ||
                    href === "index.html#" + currentId;

                if (samePageAnchor) {
                    link.classList.add("active");
                } else if (href.startsWith("#") || href.endsWith("#" + currentId)) {
                    // Only clear active for in-page links
                    link.classList.remove("active");
                }
            });
        });
    }
});
