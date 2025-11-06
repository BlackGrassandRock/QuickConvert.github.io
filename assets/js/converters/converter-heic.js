// assets/js/converters/converter-heic.js
// Handles HEIC → JPG/PNG conversion with lazy loading of heic2any

const HEIC2ANY_SRC = "assets/js/vendor/heic2any.min.js";

// --- Lazy-load helper -------------------------------------------------------

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
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

async function ensureHeic2any() {
  if (window.heic2any) return window.heic2any;
  await loadScriptOnce(HEIC2ANY_SRC);
  if (!window.heic2any) {
    throw new Error("heic2any is not available after loading.");
  }
  return window.heic2any;
}

// --- DOM references ---------------------------------------------------------

const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const fileInfoWrapper = document.getElementById("file-info-wrapper");
const fileNameEl = document.getElementById("file-name");
const fileSizeEl = document.getElementById("file-size");
const changeFileBtn = document.getElementById("change-file-btn");

const toFormatSelect = document.getElementById("to-format");
const qualityRange = document.getElementById("quality-range");
const compressSwitch = document.getElementById("compress-switch");

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
let selectedFile = null;

// --- Helpers ----------------------------------------------------------------

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

function getBaseName(filename) {
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx === -1) return filename;
  return filename.slice(0, dotIdx);
}

function isHeicFile(file) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

// --- File selection UI ------------------------------------------------------

function handleFile(file) {
  selectedFile = file || null;
  if (!selectedFile) {
    fileInfoWrapper.classList.add("d-none");
    setStatus("No file selected yet.");
    downloadLink.classList.add("d-none");
    return;
  }

  fileNameEl.textContent = selectedFile.name;
  fileSizeEl.textContent = formatBytes(selectedFile.size);
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
  const files = e.dataTransfer.files;
  if (files && files.length) {
    handleFile(files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files.length) {
    handleFile(fileInput.files[0]);
  } else {
    handleFile(null);
  }
});

if (changeFileBtn) {
  changeFileBtn.addEventListener("click", () => {
    fileInput.value = "";
    handleFile(null);
  });
}

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    fileInput.value = "";
    handleFile(null);
    progressWrapper.classList.add("d-none");
  });
}

// --- Conversion -------------------------------------------------------------

async function convertHeicWithLib(file, targetMime, quality) {
  const heic2any = await ensureHeic2any();

  const options = {
    blob: file,
    toType: targetMime
  };

  if (targetMime === "image/jpeg") {
    options.quality = quality;
  }

  const result = await heic2any(options);
  if (Array.isArray(result)) {
    return result[0];
  }
  return result;
}

async function convertImageViaCanvas(file, targetMime, quality) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const blob = await new Promise((resolve) => {
    if (targetMime === "image/jpeg") {
      canvas.toBlob((b) => resolve(b), targetMime, quality);
    } else {
      canvas.toBlob((b) => resolve(b), targetMime);
    }
  });

  return blob;
}

async function runConversion() {
  if (!selectedFile) {
    throw new Error("Please select a file first.");
  }

  const targetFormat = toFormatSelect.value === "png" ? "png" : "jpg";
  const targetMime = targetFormat === "png" ? "image/png" : "image/jpeg";

  let quality = parseInt(qualityRange.value, 10) / 100;
  if (!compressSwitch.checked) {
    quality = 1;
  }

  setStatus("Converting...");
  progressBar.style.width = "20%";

  let outputBlob;

  if (isHeicFile(selectedFile)) {
    outputBlob = await convertHeicWithLib(selectedFile, targetMime, quality);
  } else {
    outputBlob = await convertImageViaCanvas(selectedFile, targetMime, quality);
  }

  if (!outputBlob) {
    throw new Error("Conversion did not produce a result.");
  }

  progressBar.style.width = "80%";

  const base = getBaseName(selectedFile.name);
  const outName = `${base}.${targetFormat}`;
  const url = URL.createObjectURL(outputBlob);

  downloadLink.href = url;
  downloadLink.download = outName;
  downloadLink.classList.remove("d-none");

  progressBar.style.width = "100%";
  setStatus("Done. Click “Download result” to save.");
  lastConvLabel.textContent = `Last: ${new Date().toLocaleTimeString()}`;
}

// --- Form submit ------------------------------------------------------------

if (convertForm) {
  convertForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      setStatus("Please select a file first.");
      return;
    }

    toggleLoading(true);
    progressBar.style.width = "10%";
    setStatus("Preparing conversion...");

    try {
      await runConversion();
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || "conversion failed."}`);
      downloadLink.classList.add("d-none");
    } finally {
      toggleLoading(false);
    }
  });
}
