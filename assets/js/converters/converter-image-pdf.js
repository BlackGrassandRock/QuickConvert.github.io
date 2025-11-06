// assets/js/converters/converter-image-pdf.js
// Handles JPG/PNG ↔ PDF conversion with lazy loading of heavy libraries (jspdf + pdf.js)

// --- Lazy-load helpers ------------------------------------------------------

const JSPDF_SRC = "assets/js/vendor/jspdf.umd.min.js";
const PDF_JS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/**
 * Dynamically loads an external script once.
 */
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    // Already in DOM?
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaded = "false";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
    document.head.appendChild(script);
  });
}

/**
 * Ensures jspdf is loaded and returns jsPDF constructor.
 */
async function ensureJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) {
    return window.jspdf.jsPDF;
  }
  await loadScriptOnce(JSPDF_SRC);
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("jsPDF not available after loading.");
  }
  return window.jspdf.jsPDF;
}

/**
 * Ensures pdf.js is loaded and configured, returns pdfjsLib.
 */
async function ensurePdfJs() {
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    return window.pdfjsLib;
  }
  await loadScriptOnce(PDF_JS_SRC);
  if (!window.pdfjsLib || !window.pdfjsLib.GlobalWorkerOptions) {
    throw new Error("pdfjsLib not available after loading.");
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  return window.pdfjsLib;
}

// --- DOM references ---------------------------------------------------------

const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const fileInfoWrapper = document.getElementById("file-info-wrapper");
const fileSummaryEl = document.getElementById("file-summary");
const fileSizeEl = document.getElementById("file-size");
const fileListEl = document.getElementById("file-list");
const changeFileBtn = document.getElementById("change-file-btn");

const conversionModeSelect = document.getElementById("conversion-mode");
const swapModeBtn = document.getElementById("swap-mode");
const toFormatSelect = document.getElementById("to-format");
const pageSizeSelect = document.getElementById("page-size");
const qualityRange = document.getElementById("quality-range");

const convertForm = document.getElementById("converter-form");
const convertBtn = document.getElementById("convert-btn");
const convertSpinner = document.getElementById("convert-spinner");
const resetBtn = document.getElementById("reset-btn");

const statusText = document.getElementById("status-text");
const progressWrapper = document.getElementById("progress-bar-wrapper");
const progressBar = document.getElementById("progress-bar");
const downloadLink = document.getElementById("download-link");
const lastConvLabel = document.getElementById("last-conv-label");

// Internal state
let selectedFiles = [];

// --- Small helpers ----------------------------------------------------------

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function setStatus(message) {
  statusText.textContent = message;
}

function toggleLoading(isLoading) {
  if (isLoading) {
    convertSpinner.classList.remove("d-none");
    convertBtn.disabled = true;
    progressWrapper.classList.remove("d-none");
  } else {
    convertSpinner.classList.add("d-none");
    convertBtn.disabled = false;
    progressWrapper.classList.add("d-none");
  }
}

// --- File selection UI ------------------------------------------------------

function handleFiles(files) {
  selectedFiles = Array.from(files || []).filter((f) => f && f.size > 0);
  if (!selectedFiles.length) {
    fileInfoWrapper.classList.add("d-none");
    setStatus("No files selected yet.");
    downloadLink.classList.add("d-none");
    return;
  }

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  fileSummaryEl.textContent =
    selectedFiles.length === 1
      ? selectedFiles[0].name
      : `${selectedFiles.length} files selected`;
  fileSizeEl.textContent = formatBytes(totalSize);

  fileListEl.innerHTML = selectedFiles
    .slice(0, 10)
    .map((f) => f.name)
    .join("<br>");
  if (selectedFiles.length > 10) {
    fileListEl.innerHTML += `<br>… and ${selectedFiles.length - 10} more`;
  }

  fileInfoWrapper.classList.remove("d-none");
  setStatus("Ready to convert.");
  downloadLink.classList.add("d-none");
}

uploadArea.addEventListener("click", () => fileInput.click());

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.add("upload-area-active");
});

uploadArea.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.remove("upload-area-active");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.remove("upload-area-active");
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files);
  }
});

fileInput.addEventListener("change", () => {
  handleFiles(fileInput.files);
});

if (changeFileBtn) {
  changeFileBtn.addEventListener("click", () => {
    fileInput.value = "";
    selectedFiles = [];
    fileInfoWrapper.classList.add("d-none");
    setStatus("No files selected yet.");
    downloadLink.classList.add("d-none");
  });
}

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    fileInput.value = "";
    selectedFiles = [];
    fileInfoWrapper.classList.add("d-none");
    setStatus("No files selected yet.");
    downloadLink.classList.add("d-none");
    progressWrapper.classList.add("d-none");
  });
}

// --- Mode switching ---------------------------------------------------------

if (swapModeBtn) {
  swapModeBtn.addEventListener("click", () => {
    const mode = conversionModeSelect.value;
    const target = toFormatSelect.value;

    if (mode === "image-to-pdf" && target === "pdf") {
      conversionModeSelect.value = "pdf-to-image";
      toFormatSelect.value = "jpg";
    } else if (mode === "pdf-to-image") {
      conversionModeSelect.value = "image-to-pdf";
      toFormatSelect.value = "pdf";
    } else {
      conversionModeSelect.value = "image-to-pdf";
      toFormatSelect.value = "pdf";
    }
  });
}

// --- Conversion logic -------------------------------------------------------

function detectMode(files) {
  const hasPdf = files.some((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
  if (hasPdf) return "pdf-to-image";
  return "image-to-pdf";
}

function getBaseName(filename) {
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx === -1) return filename;
  return filename.slice(0, dotIdx);
}

// Image -> PDF
async function convertImagesToPdf(files) {
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));
  if (!imageFiles.length) {
    throw new Error("No images found in selection.");
  }

  const jsPDF = await ensureJsPdf();

  const pageSizeKey = pageSizeSelect.value; // "a4" | "letter" | "fit-image"
  const quality = parseInt(qualityRange.value, 10) / 100;

  // Sizes in points (approx)
  const sizes = {
    a4: [595.28, 841.89],
    letter: [612, 792]
  };

  let pdf;
  let pageFormat = "a4";

  const createFirstPdf = (orientation, format) => {
    pdf = new jsPDF({
      orientation,
      unit: "pt",
      format
    });
  };

  for (let index = 0; index < imageFiles.length; index++) {
    const file = imageFiles[index];

    const imageDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read image."));
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load image."));
      image.src = imageDataUrl;
    });

    let pageWidth, pageHeight;

    if (pageSizeKey === "fit-image") {
      pageWidth = img.width;
      pageHeight = img.height;
      const orientation = img.width >= img.height ? "landscape" : "portrait";

      if (!pdf) {
        createFirstPdf(orientation, [pageWidth, pageHeight]);
      } else if (index > 0) {
        pdf.addPage([pageWidth, pageHeight], orientation);
      }
    } else {
      const [w, h] = sizes[pageSizeKey] || sizes.a4;
      pageWidth = w;
      pageHeight = h;
      const orientation = w >= h ? "landscape" : "portrait";

      if (!pdf) {
        createFirstPdf(orientation, pageSizeKey);
      } else if (index > 0) {
        pdf.addPage(pageSizeKey, orientation);
      }
    }

    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    let drawWidth = maxWidth;
    let drawHeight = (img.height * maxWidth) / img.width;
    if (drawHeight > maxHeight) {
      drawHeight = maxHeight;
      drawWidth = (img.width * maxHeight) / img.height;
    }

    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;

    pdf.addImage(imageDataUrl, "JPEG", x, y, drawWidth, drawHeight, undefined, "FAST", quality);

    progressBar.style.width = `${((index + 1) / imageFiles.length) * 100}%`;
  }

  const output = pdf.output("blob");
  const firstName = imageFiles[0].name || "converted";
  const base = getBaseName(firstName);
  const blobUrl = URL.createObjectURL(output);

  downloadLink.href = blobUrl;
  downloadLink.download = `${base}.pdf`;
  downloadLink.classList.remove("d-none");

  lastConvLabel.textContent = `Last: ${new Date().toLocaleTimeString()}`;
  setStatus("PDF ready. Click “Download result” to save.");
}

// PDF -> Images
async function convertPdfToImages(files) {
  const pdfFile = files.find(
    (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
  );
  if (!pdfFile) {
    throw new Error("No PDF file found in selection.");
  }

  const pdfjsLib = await ensurePdfJs();
  const pdfData = await pdfFile.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const numPages = pdf.numPages;

  const targetFormat = toFormatSelect.value === "png" ? "png" : "jpg";

  setStatus(`Rendering ${numPages} page(s) to ${targetFormat.toUpperCase()}...`);
  downloadLink.classList.add("d-none");

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    const mimeType = targetFormat === "png" ? "image/png" : "image/jpeg";

    const blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), mimeType, 0.92)
    );

    const base = getBaseName(pdfFile.name);
    const filename = `${base}-page-${pageNum}.${targetFormat}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    progressBar.style.width = `${(pageNum / numPages) * 100}%`;
  }

  lastConvLabel.textContent = `Last: ${new Date().toLocaleTimeString()}`;
  setStatus("All pages exported as images (downloaded one by one).");
}

// --- Form submit ------------------------------------------------------------

if (convertForm) {
  convertForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedFiles.length) {
      setStatus("Please select at least one file first.");
      return;
    }

    let mode = conversionModeSelect.value;
    if (mode === "auto") {
      mode = detectMode(selectedFiles);
    }

    toggleLoading(true);
    progressBar.style.width = "10%";
    setStatus("Preparing conversion...");

    try {
      if (mode === "image-to-pdf") {
        await convertImagesToPdf(selectedFiles);
      } else if (mode === "pdf-to-image") {
        await convertPdfToImages(selectedFiles);
      } else {
        throw new Error("Unsupported mode.");
      }
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || "conversion failed."}`);
      downloadLink.classList.add("d-none");
    } finally {
      toggleLoading(false);
    }
  });
}
