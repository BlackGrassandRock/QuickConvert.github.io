/* ============================================================
   converter-webp.js
   WebP ↔ JPG / PNG (frontend demo)
   - Uses <canvas> for image → image conversion
   - GIF output is NOT implemented (needs extra encoder/back-end)
   - Animated WebP/GIF are flattened to a single frame
   Dependencies:
   - app-common-ui.js (status, progress, button helpers, toasts)
   ============================================================ */

import {
    setStatus,
    setTemporaryStatus,
    toggleProgress,
    setButtonLoading,
    showToast
} from "../app-common-ui.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("converter-form");
    if (!form) return; // Not on this page

    // Core DOM elements
    const fileInput = document.getElementById("file-input");
    const uploadArea = document.getElementById("upload-area");
    const fileInfoWrapper = document.getElementById("file-info-wrapper");
    const fileNameEl = document.getElementById("file-name");
    const fileSizeEl = document.getElementById("file-size");
    const changeFileBtn = document.getElementById("change-file-btn");

    const fromSelect = document.getElementById("from-format");
    const toSelect = document.getElementById("to-format");
    const qualityRange = document.getElementById("quality-range");
    const compressSwitch = document.getElementById("compress-switch");
    const swapBtn = document.getElementById("swap-formats");

    const statusText = document.getElementById("status-text");
    const progressWrapper = document.getElementById("progress-bar-wrapper");
    const downloadLink = document.getElementById("download-link");
    const downloadHint = document.getElementById("download-hint");
    const convertBtn = document.getElementById("convert-btn");
    const resetBtn = document.getElementById("reset-btn");
    const lastConvLabel = document.getElementById("last-conv-label");

    const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
    let currentFile = null;
    let currentObjectUrl = null;

    /* --------------------------------------------------------
       Feature detection: WebP encoding support
       -------------------------------------------------------- */
    const canEncodeWebP = (() => {
        try {
            const canvas = document.createElement("canvas");
            if (!canvas.toDataURL) return false;
            const dataUrl = canvas.toDataURL("image/webp");
            return typeof dataUrl === "string" && dataUrl.startsWith("data:image/webp");
        } catch {
            return false;
        }
    })();

    /* --------------------------------------------------------
       Drag & Drop + file input
       -------------------------------------------------------- */

    if (uploadArea && fileInput) {
        uploadArea.addEventListener("click", () => {
            fileInput.click();
        });

        uploadArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            uploadArea.classList.add("dragover");
        });

        uploadArea.addEventListener("dragleave", (e) => {
            e.preventDefault();
            uploadArea.classList.remove("dragover");
        });

        uploadArea.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadArea.classList.remove("dragover");

            const files = e.dataTransfer && e.dataTransfer.files;
            const file = files && files[0];
            if (file) handleFileSelect(file);
        });

        fileInput.addEventListener("change", (e) => {
            const files = e.target.files;
            const file = files && files[0];
            if (file) handleFileSelect(file);
        });
    }

    if (changeFileBtn && fileInput) {
        changeFileBtn.addEventListener("click", () => {
            resetFileState();
            fileInput.click();
        });
    }

    /* --------------------------------------------------------
       Swap button (WebP ↔ JPG/PNG)
       -------------------------------------------------------- */

    if (swapBtn && fromSelect && toSelect) {
        swapBtn.addEventListener("click", (e) => {
            e.preventDefault();

            const prevFrom = fromSelect.value; // "auto" | "webp" | "jpg" | "png"
            const prevTo = toSelect.value;     // "webp" | "jpg" | "png"

            // Basic swap
            let newFrom = prevTo;
            let newTo = prevFrom;

            // Do not allow "auto" as target format
            if (newTo === "auto") {
                let detected = null;

                if (currentFile && currentFile.type) {
                    detected = mimeToFormat(currentFile.type);
                }

                if (detected === "webp" || detected === "jpg" || detected === "png") {
                    newTo = detected;
                } else {
                    // Fallback: choose something different from newFrom
                    if (newFrom === "webp") {
                        newTo = "jpg";
                    } else if (newFrom === "jpg") {
                        newTo = "webp";
                    } else {
                        newTo = "webp";
                    }
                }
            }

            fromSelect.value = newFrom;
            toSelect.value = newTo;

            setTemporaryStatus(statusText, "Formats swapped.", "muted", 1500);
        });
    }

    /* --------------------------------------------------------
       File handling
       -------------------------------------------------------- */

    function handleFileSelect(file) {
        const allowedTypes = ["image/webp", "image/png", "image/jpeg", "image/gif"];
        if (!allowedTypes.includes(file.type)) {
            showToast("Please select a WebP, PNG, JPG or GIF image.", "warning");
            setStatus(statusText, "Unsupported file type.", "error");
            return;
        }

        if (file.size > MAX_SIZE) {
            showToast("Selected file is too large (max 20 MB).", "warning");
            setStatus(statusText, "File size exceeds 20 MB limit.", "error");
            return;
        }

        currentFile = file;

        const mime = file.type;
        const detected = mimeToFormat(mime);
        if (detected && fromSelect && fromSelect.value === "auto") {
            fromSelect.value = detected;
        }

        if (fileNameEl) fileNameEl.textContent = file.name;
        if (fileSizeEl) fileSizeEl.textContent = "Size: " + formatBytes(file.size);

        if (fileInfoWrapper) fileInfoWrapper.classList.remove("d-none");
        if (uploadArea) uploadArea.classList.add("d-none");

        if (downloadLink) {
            downloadLink.classList.add("d-none");
            downloadLink.removeAttribute("href");
            downloadLink.removeAttribute("download");
        }
        if (downloadHint) {
            downloadHint.classList.add("d-none");
        }

        setStatus(statusText, "File selected. Ready to convert.", "muted");

        if (mime === "image/webp" || mime === "image/gif") {
            setTemporaryStatus(
                statusText,
                "Note: animated images will be converted to a single static frame.",
                "warning",
                4000
            );
        }
    }

    function resetFileState() {
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        currentFile = null;

        if (fileInput) fileInput.value = "";
        if (fileInfoWrapper) fileInfoWrapper.classList.add("d-none");
        if (uploadArea) uploadArea.classList.remove("d-none");

        if (downloadLink) {
            downloadLink.classList.add("d-none");
            downloadLink.removeAttribute("href");
            downloadLink.removeAttribute("download");
        }
        if (downloadHint) {
            downloadHint.classList.add("d-none");
        }

        setStatus(statusText, "No file selected yet.", "muted");
    }

    /* --------------------------------------------------------
       Form submit: conversion
       -------------------------------------------------------- */

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!currentFile) {
            showToast("Please select a file first.", "warning");
            return;
        }

        const toFormat = (toSelect && toSelect.value) || "webp";
        const fromValue = (fromSelect && fromSelect.value) || "auto";

        if (toFormat === "webp" && !canEncodeWebP) {
            const msg =
                "This browser does not support WebP encoding via Canvas. " +
                "Try using JPG or PNG as the target format.";
            showToast(msg, "error");
            setStatus(statusText, msg, "error");
            return;
        }

        const rawQuality = qualityRange ? parseInt(qualityRange.value, 10) : 85;
        let quality = Number.isNaN(rawQuality) ? 0.85 : rawQuality / 100;

        if (compressSwitch && !compressSwitch.checked) {
            quality = Math.max(quality, 0.9);
        }

        setButtonLoading(convertBtn, true, "Converting...");
        toggleProgress(progressWrapper, true);
        setStatus(statusText, "Converting image...", "muted");

        try {
            const blob = await convertImage(currentFile, fromValue, toFormat, quality);
            if (!blob) {
                throw new Error("Conversion failed.");
            }

            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
            }
            currentObjectUrl = URL.createObjectURL(blob);

            const ext = toFormat;
            const filename = generateDownloadName(currentFile.name, ext);

            if (downloadLink) {
                downloadLink.href = currentObjectUrl;
                downloadLink.download = filename;
                downloadLink.classList.remove("d-none");
            }
            if (downloadHint) {
                downloadHint.classList.remove("d-none");
            }

            // Trigger automatic download
            try {
                if (downloadLink) {
                    downloadLink.click();
                }
            } catch {
                // ignore, user still has the button
            }

            if (lastConvLabel) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit"
                });
                lastConvLabel.textContent = "Last conversion: " + timeStr;
            }

            setStatus(statusText, "Conversion successful!", "success");
            showToast("Image converted successfully.", "success");
        } catch (err) {
            console.error(err);
            const message =
                err && err.message ? err.message : "Error during conversion.";
            setStatus(statusText, message, "error");
            showToast("Conversion failed.", "error");
        } finally {
            toggleProgress(progressWrapper, false);
            setButtonLoading(convertBtn, false);
        }
    });

    /* --------------------------------------------------------
       Reset button
       -------------------------------------------------------- */

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            resetFileState();
            if (fromSelect) fromSelect.value = "auto";
            if (toSelect) toSelect.value = "webp";
            if (qualityRange) qualityRange.value = "85";
            if (compressSwitch) compressSwitch.checked = true;

            setTemporaryStatus(statusText, "Form reset.", "muted", 2000);
        });
    }

    /* --------------------------------------------------------
       Core conversion using Canvas
       -------------------------------------------------------- */

    /**
     * Convert image to desired format using Canvas.
     * @param {File} file
     * @param {string} fromFormat - "auto" | "webp" | "jpg" | "png" | "gif"
     * @param {string} toFormat   - "webp" | "jpg" | "png"
     * @param {number} quality    - 0..1
     * @returns {Promise<Blob>}
     */
    function convertImage(file, fromFormat, toFormat, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onerror = () => reject(new Error("Failed to read file."));
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width;
                        canvas.height = img.height;

                        const ctx = canvas.getContext("2d");
                        if (!ctx) {
                            reject(new Error("Canvas is not supported in this browser."));
                            return;
                        }

                        if (toFormat === "jpg" || toFormat === "jpeg") {
                            ctx.fillStyle = "#ffffff";
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                        }

                        ctx.drawImage(img, 0, 0);

                        let mimeType = "image/jpeg";
                        if (toFormat === "png") mimeType = "image/png";
                        if (toFormat === "webp") mimeType = "image/webp";

                        canvas.toBlob(
                            (blob) => {
                                if (!blob) {
                                    reject(new Error("Failed to generate output image."));
                                    return;
                                }
                                resolve(blob);
                            },
                            mimeType,
                            quality
                        );
                    } catch (err) {
                        reject(err);
                    }
                };
                img.onerror = () =>
                    reject(
                        new Error(
                            "Failed to decode image. Unsupported or corrupted file."
                        )
                    );
                img.src = reader.result;
            };

            reader.readAsDataURL(file);
        });
    }

    /* --------------------------------------------------------
       Utilities
       -------------------------------------------------------- */

    function mimeToFormat(mime) {
        if (!mime) return null;
        if (mime === "image/webp") return "webp";
        if (mime === "image/jpeg") return "jpg";
        if (mime === "image/png") return "png";
        if (mime === "image/gif") return "gif";
        return null;
    }

    function formatBytes(bytes, decimals = 1) {
        if (!bytes) return "0 B";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    }

    function generateDownloadName(original, newExt) {
        const base = original.replace(/\.[^/.]+$/, "");
        return `${base}-converted.${newExt}`;
    }

    // Initial status
    setStatus(statusText, "No file selected yet.", "muted");
});
