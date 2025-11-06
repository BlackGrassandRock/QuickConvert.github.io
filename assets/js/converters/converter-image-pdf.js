/* ============================================================
   converter-JPG/PNG-pdf.js
   JPG/PNG ↔ PDF converter (frontend demo)
   - Images → single multi-page PDF via jsPDF
   - PDF → image (first page) via pdf.js (if available)
   Dependencies:
   - app-common-ui.js (status, progress, button helpers, toasts)
   - jsPDF (window.jspdf.jsPDF from vendor/jspdf.umd.min.js)
   - optional: pdf.js (window.pdfjsLib) for PDF → image
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
    if (!form) return;

    // Core DOM elements
    const fileInput = document.getElementById("file-input");
    const uploadArea = document.getElementById("upload-area");
    const fileInfoWrapper = document.getElementById("file-info-wrapper");
    const fileSummaryEl = document.getElementById("file-summary");
    const fileSizeEl = document.getElementById("file-size");
    const fileListEl = document.getElementById("file-list");
    const changeFileBtn = document.getElementById("change-file-btn");

    const modeSelect = document.getElementById("conversion-mode");
    const toFormatSelect = document.getElementById("to-format");
    const pageSizeSelect = document.getElementById("page-size");
    const qualityRange = document.getElementById("quality-range");

    const statusText = document.getElementById("status-text");
    const progressWrapper = document.getElementById("progress-bar-wrapper");
    const downloadLink = document.getElementById("download-link");
    const convertBtn = document.getElementById("convert-btn");
    const resetBtn = document.getElementById("reset-btn");
    const swapBtn = document.getElementById("swap-mode");
    const lastConvLabel = document.getElementById("last-conv-label");

    const MAX_SIZE = 20 * 1024 * 1024; // 20 MB per file

    /** @type {File[]} */
    let selectedFiles = [];
    let currentObjectUrl = null;

    /* --------------------------------------------------------
       Mode helpers (UI + logic)
       -------------------------------------------------------- */

    function isPdfToImagesMode(val) {
        return val === "PDF-to-JPG/PNG";
    }

    function updateModeUI() {
        if (!modeSelect || !toFormatSelect) return;
        const mode = modeSelect.value;

        const options = Array.from(toFormatSelect.options || []);
        const pdfOption = options.find((o) => o.value === "pdf");
        const jpgOption = options.find((o) => o.value === "jpg");
        const pngOption = options.find((o) => o.value === "png");

        if (isPdfToImagesMode(mode)) {
            // PDF → JPG/PNG
            if (pdfOption) pdfOption.disabled = true;
            if (jpgOption) jpgOption.disabled = false;
            if (pngOption) pngOption.disabled = false;
            if (toFormatSelect.value === "pdf") {
                toFormatSelect.value = "jpg";
            }
            setStatus(statusText, "Mode: PDF → images (JPG/PNG).", "muted");
        } else {
            // Images → PDF
            if (pdfOption) pdfOption.disabled = false;
            if (jpgOption) jpgOption.disabled = true;
            if (pngOption) pngOption.disabled = true;
            toFormatSelect.value = "pdf";
            setStatus(statusText, "Mode: images → PDF document.", "muted");
        }
    }

    if (modeSelect) {
        modeSelect.addEventListener("change", updateModeUI);
        updateModeUI();
    }

    if (swapBtn && modeSelect && toFormatSelect) {
        swapBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const mode = modeSelect.value;

            if (isPdfToImagesMode(mode)) {
                // Switch to images → PDF (default to JPG→PDF)
                modeSelect.value = "JPG/JPEG_to-PDF";
            } else {
                // Switch to PDF → images
                modeSelect.value = "PDF-to-JPG/PNG";
            }

            updateModeUI();
            setTemporaryStatus(statusText, "Modes swapped.", "muted", 1500);
        });
    }

    /* --------------------------------------------------------
       Drag & Drop + file input
       -------------------------------------------------------- */

    if (uploadArea && fileInput) {
        uploadArea.addEventListener("click", () => fileInput.click());

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
            if (files && files.length > 0) {
                handleFileSelection(Array.from(files));
            }
        });

        fileInput.addEventListener("change", (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                handleFileSelection(Array.from(files));
            }
        });
    }

    if (changeFileBtn && fileInput) {
        changeFileBtn.addEventListener("click", () => {
            resetFiles();
            fileInput.click();
        });
    }

    /* --------------------------------------------------------
       File selection & summary
       -------------------------------------------------------- */

    function handleFileSelection(files) {
        const images = [];
        const pdfs = [];

        for (const f of files) {
            if (f.size > MAX_SIZE) {
                showToast(
                    `File "${f.name}" is larger than 20 MB and will be ignored.`,
                    "warning"
                );
                continue;
            }

            if (f.type === "application/pdf") {
                pdfs.push(f);
            } else if (f.type && f.type.startsWith("image/")) {
                images.push(f);
            } else {
                showToast(`Unsupported file type: ${f.name}`, "warning");
            }
        }

        if (images.length === 0 && pdfs.length === 0) {
            setStatus(statusText, "No supported files selected.", "error");
            return;
        }

        if (!modeSelect) return;
        let mode = modeSelect.value;

        // Detect automatically: infer mode from selected files
        if (mode === "Detect_automatically") {
            if (pdfs.length > 0 && images.length === 0) {
                modeSelect.value = "PDF-to-JPG/PNG";
                mode = modeSelect.value;
                updateModeUI();
                selectedFiles = [pdfs[0]];
            } else if (images.length > 0 && pdfs.length === 0) {
                const firstImg = images[0];
                if (firstImg.type === "image/png") {
                    modeSelect.value = "PNG-to-PDF";
                } else {
                    modeSelect.value = "JPG/JPEG_to-PDF";
                }
                mode = modeSelect.value;
                updateModeUI();
                selectedFiles = images;
            } else {
                showToast(
                    "Mixed PDF and images are not supported in auto mode. Please select only images or only a PDF.",
                    "warning"
                );
                setStatus(
                    statusText,
                    "Mixed content detected. Use only images or only a PDF.",
                    "error"
                );
                return;
            }
        } else if (isPdfToImagesMode(mode)) {
            if (pdfs.length === 0) {
                showToast(
                    "PDF → images mode requires a PDF file. Please select a PDF or change mode.",
                    "warning"
                );
                setStatus(statusText, "Please select a PDF file.", "error");
                return;
            }
            if (pdfs.length > 1) {
                showToast(
                    "Multiple PDFs selected. Only the first one will be used.",
                    "info"
                );
            }
            selectedFiles = [pdfs[0]];
        } else {
            // Images → PDF modes
            if (images.length === 0) {
                showToast(
                    "Images → PDF mode requires at least one image. Please select images or change mode.",
                    "warning"
                );
                setStatus(
                    statusText,
                    "Please select at least one image (JPG, PNG, WebP, GIF, BMP).",
                    "error"
                );
                return;
            }
            selectedFiles = images;
        }

        renderFileSummary(selectedFiles);

        if (fileInfoWrapper) fileInfoWrapper.classList.remove("d-none");
        if (uploadArea) uploadArea.classList.add("d-none");
        if (downloadLink) downloadLink.classList.add("d-none");

        setStatus(statusText, "Files selected. Ready to convert.", "muted");
    }

    function renderFileSummary(files) {
        if (!files || files.length === 0) {
            if (fileInfoWrapper) fileInfoWrapper.classList.add("d-none");
            return;
        }

        const mode = modeSelect ? modeSelect.value : "Detect_automatically";
        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        const first = files[0];

        if (fileSummaryEl) {
            if (isPdfToImagesMode(mode)) {
                fileSummaryEl.textContent = `1 PDF selected (${first.name})`;
            } else {
                fileSummaryEl.textContent =
                    files.length === 1
                        ? `1 image selected (${first.name})`
                        : `${files.length} images selected`;
            }
        }

        if (fileSizeEl) {
            fileSizeEl.textContent = "Total size: " + formatBytes(totalSize);
        }

        if (fileListEl) {
            const ul = document.createElement("ul");
            files.forEach((f) => {
                const li = document.createElement("li");

                const left = document.createElement("span");
                left.innerHTML = `<i class="bi bi-file-earmark"></i>${escapeHtml(
                    f.name
                )}`;

                const right = document.createElement("span");
                right.textContent = formatBytes(f.size);

                li.appendChild(left);
                li.appendChild(right);
                ul.appendChild(li);
            });

            fileListEl.innerHTML = "";
            fileListEl.appendChild(ul);
        }
    }

    function resetFiles() {
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }
        selectedFiles = [];

        if (fileInput) fileInput.value = "";
        if (fileInfoWrapper) fileInfoWrapper.classList.add("d-none");
        if (uploadArea) uploadArea.classList.remove("d-none");

        if (fileListEl) fileListEl.innerHTML = "";
        if (fileSummaryEl) fileSummaryEl.textContent = "";
        if (fileSizeEl) fileSizeEl.textContent = "";

        if (downloadLink) {
            downloadLink.classList.add("d-none");
            downloadLink.removeAttribute("href");
            downloadLink.removeAttribute("download");
        }

        setStatus(statusText, "No files selected yet.", "muted");
    }

    /* --------------------------------------------------------
       Form submit / conversion
       -------------------------------------------------------- */

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!selectedFiles || selectedFiles.length === 0) {
            showToast("Please select some files first.", "warning");
            return;
        }

        const modeVal = modeSelect ? modeSelect.value : "Detect_automatically";
        const pdfToImages = isPdfToImagesMode(modeVal);
        const targetFormat = toFormatSelect ? toFormatSelect.value : "pdf";

        const qualityVal = qualityRange ? parseInt(qualityRange.value, 10) : 90;
        const quality = Number.isNaN(qualityVal) ? 0.9 : qualityVal / 100;

        setButtonLoading(convertBtn, true, "Converting...");
        toggleProgress(progressWrapper, true);

        try {
            if (!pdfToImages) {
                // Images → PDF (force PDF as output)
                if (targetFormat !== "pdf") {
                    const msg =
                        "Images → PDF mode can only produce a PDF file. Target format adjusted to PDF.";
                    showToast(msg, "info");
                    setStatus(statusText, msg, "warning");
                } else {
                    setStatus(
                        statusText,
                        "Converting images to a multi-page PDF...",
                        "muted"
                    );
                }

                const pdfBlob = await convertImagesToPdf(selectedFiles, quality);
                const filename = selectedFiles.length === 1
                    ? `${stripExtension(selectedFiles[0].name)}.pdf`
                    : "images.pdf";

                applyDownloadBlob(pdfBlob, filename);

                setStatus(statusText, "PDF generated successfully!", "success");
                showToast("PDF generated successfully.", "success");
            } else {
                // PDF → image (first page)
                if (targetFormat === "pdf") {
                    const msg =
                        "PDF → images mode requires JPG or PNG as target format.";
                    showToast(msg, "warning");
                    setStatus(statusText, msg, "warning");
                    return;
                }

                setStatus(
                    statusText,
                    "Converting first PDF page to image...",
                    "muted"
                );

                const pdfFile = selectedFiles[0];
                const imgBlob = await convertPdfToImage(pdfFile, targetFormat, quality);

                const base = stripExtension(pdfFile.name) || "page";
                const filename = `${base}-page1.${targetFormat === "png" ? "png" : "jpg"}`;

                applyDownloadBlob(imgBlob, filename);

                showToast("PDF page exported as image.", "success");
                setStatus(statusText, "Image generated successfully!", "success");
            }

            if (lastConvLabel) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit"
                });
                lastConvLabel.textContent = "Last conversion: " + timeStr;
            }
        } catch (err) {
            console.error(err);
            const message =
                err && err.message ? err.message : "Conversion failed.";
            setStatus(statusText, message, "error");
            showToast("Conversion failed.", "error");
        } finally {
            toggleProgress(progressWrapper, false);
            setButtonLoading(convertBtn, false);
        }
    });

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            resetFiles();
            if (modeSelect) modeSelect.value = "Detect_automatically";
            if (toFormatSelect) toFormatSelect.value = "pdf";
            if (pageSizeSelect) pageSizeSelect.value = "a4";
            if (qualityRange) qualityRange.value = "90";
            updateModeUI();
            setTemporaryStatus(statusText, "Form reset.", "muted", 2000);
        });
    }

    /* --------------------------------------------------------
       Images → PDF via jsPDF
       -------------------------------------------------------- */

    async function convertImagesToPdf(files, quality) {
        const hasJsPDF =
            typeof window !== "undefined" &&
            window.jspdf &&
            typeof window.jspdf.jsPDF === "function";

        if (!hasJsPDF) {
            throw new Error(
                "jsPDF is not available. Include vendor/jspdf.umd.min.js before this script."
            );
        }

        const { jsPDF } = window.jspdf;

        const pageSizeRaw = pageSizeSelect ? pageSizeSelect.value : "a4";
        const pageSize = pageSizeRaw === "fit-JPG/PNG" ? "fit-image" : pageSizeRaw;

        let pdf = null;

        for (const file of files) {
            const { canvas, width, height } = await loadImageToCanvas(file);

            if (!pdf) {
                if (pageSize === "fit-image") {
                    pdf = new jsPDF({
                        orientation: width > height ? "l" : "p",
                        unit: "pt",
                        format: [width, height]
                    });
                } else {
                    const format = pageSize === "letter" ? "letter" : "a4";
                    pdf = new jsPDF("p", "pt", format);
                }
            } else {
                if (pageSize === "fit-image") {
                    pdf.addPage([width, height], width > height ? "l" : "p");
                } else {
                    pdf.addPage();
                }
            }

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            let renderWidth = width;
            let renderHeight = height;

            if (pageSize !== "fit-image") {
                const margin = 40;
                const maxW = pageWidth - margin * 2;
                const maxH = pageHeight - margin * 2;
                const ratio = Math.min(maxW / width, maxH / height, 1);
                renderWidth = width * ratio;
                renderHeight = height * ratio;
            }

            const x = (pageWidth - renderWidth) / 2;
            const y = (pageHeight - renderHeight) / 2;

            const imgData = canvas.toDataURL("image/jpeg", quality);
            pdf.addImage(imgData, "JPEG", x, y, renderWidth, renderHeight);
        }

        if (!pdf) {
            throw new Error("No valid images to convert.");
        }

        return pdf.output("blob");
    }

    function loadImageToCanvas(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Failed to read image file."));
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

                        ctx.fillStyle = "#ffffff";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);

                        resolve({ canvas, width: img.width, height: img.height });
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
       PDF → image via pdf.js (first page)
       -------------------------------------------------------- */

    async function convertPdfToImage(file, targetFormat, quality) {
        const hasPdfJs =
            typeof window !== "undefined" &&
            window.pdfjsLib &&
            typeof window.pdfjsLib.getDocument === "function";

        if (!hasPdfJs) {
            throw new Error(
                "PDF.js (pdfjsLib) is not available. Include it before this script for PDF → image conversion."
            );
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        const scale = 2;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");

        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;

        const mime = targetFormat === "png" ? "image/png" : "image/jpeg";

        return new Promise((resolve, reject) => {
            if (!canvas.toBlob) {
                try {
                    const dataUrl = canvas.toDataURL(mime, quality);
                    const byteString = atob(dataUrl.split(",")[1]);
                    const len = byteString.length;
                    const arr = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        arr[i] = byteString.charCodeAt(i);
                    }
                    resolve(new Blob([arr], { type: mime }));
                } catch (e) {
                    reject(new Error("Failed to generate output image."));
                }
                return;
            }

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error("Failed to generate output image."));
                        return;
                    }
                    resolve(blob);
                },
                mime,
                quality
            );
        });
    }

    /* --------------------------------------------------------
       Apply blob to download link (with auto-download)
       -------------------------------------------------------- */

function applyDownloadBlob(blob, fallbackName) {
    if (!downloadLink) return;

    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
    }
    currentObjectUrl = URL.createObjectURL(blob);

    downloadLink.href = currentObjectUrl;
    downloadLink.download = fallbackName;
    downloadLink.classList.remove("d-none");

    // Auto-download after successful conversion, keep link as fallback
    try {
        downloadLink.click();
    } catch (e) {
        console.warn("Auto-download failed, manual link is available.", e);
    }
}


    /* --------------------------------------------------------
       Utilities
       -------------------------------------------------------- */

    function formatBytes(bytes, decimals = 1) {
        if (!bytes) return "0 B";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function stripExtension(name) {
        return name ? name.replace(/\.[^/.]+$/, "") : "";
    }

    // Initial status
    setStatus(statusText, "No files selected yet.", "muted");
});
