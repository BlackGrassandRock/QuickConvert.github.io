// assets/js/converters/converter-svg.js
// SVG -> PNG/JPEG/WebP (client-side) using Canvas

const $ = (id) => document.getElementById(id);

// UI
const form = $("converter-form");
const uploadArea = $("upload-area");
const fileInput = $("file-input");
const fileInfoWrapper = $("file-info-wrapper");
const fileNameEl = $("file-name");
const fileSizeEl = $("file-size");
const changeFileBtn = $("change-file-btn");

const toFormat = $("to-format");
const scaleRange = $("scale-range");
const scaleLabel = $("scale-label");
const qualityRange = $("quality-range");
const bgColor = $("bg-color");
const transparentSwitch = $("transparent-switch");

const convertBtn = $("convert-btn");
const convertSpinner = $("convert-spinner");
const resetBtn = $("reset-btn");

const statusText = $("status-text");
const progressWrap = $("progress-bar-wrapper");
const downloadLink = $("download-link");
const lastConvLabel = $("last-conv-label");

const svgMeta = $("svg-meta");
const canvas = $("render-canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: false });

// State
let currentFile = null;
let currentSvgText = "";
let svgIntrinsic = { width: 512, height: 512 };

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function setStatus(msg) {
  statusText.textContent = msg;
}

function setWorking(isWorking) {
  convertBtn.disabled = isWorking;
  resetBtn.disabled = isWorking;
  fileInput.disabled = isWorking;
  toFormat.disabled = isWorking;

  convertSpinner.classList.toggle("d-none", !isWorking);
  progressWrap.classList.toggle("d-none", !isWorking);
}

function hideDownload() {
  downloadLink.classList.add("d-none");
  downloadLink.removeAttribute("href");
}

function showDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.classList.remove("d-none");
  // HEIC-style: no auto-click; user clicks "Download result"
}

function updateScaleLabel() {
  scaleLabel.textContent = `${scaleRange.value}×`;
}

function updateOptionVisibility() {
  const dst = toFormat.value; // png | jpg | webp
  const isLossy = dst === "jpg" || dst === "webp";
  qualityRange.disabled = !isLossy;

  // transparency meaningful for png/webp only
  transparentSwitch.disabled = dst === "jpg";
}

function parseSvgSize(svgText) {
  let width = null;
  let height = null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return { width: 512, height: 512 };

    const wAttr = svg.getAttribute("width");
    const hAttr = svg.getAttribute("height");
    const vbAttr = svg.getAttribute("viewBox");

    const parseLen = (v) => {
      if (!v) return null;
      const m = String(v).trim().match(/^([0-9]*\.?[0-9]+)/);
      return m ? Number(m[1]) : null;
    };

    width = parseLen(wAttr);
    height = parseLen(hAttr);

    if ((!width || !height) && vbAttr) {
      const parts = vbAttr.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (parts.length === 4) {
        if (!width) width = parts[2];
        if (!height) height = parts[3];
      }
    }

    width = width || 512;
    height = height || 512;

    width = Math.max(1, Math.min(width, 20000));
    height = Math.max(1, Math.min(height, 20000));
    return { width, height };
  } catch {
    return { width: 512, height: 512 };
  }
}

function sanitizeSvg(svgText) {
  let t = svgText;

  // remove scripts
  t = t.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

  // ensure xmlns
  if (!/xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(t)) {
    t = t.replace(/<svg\b/, `<svg xmlns="http://www.w3.org/2000/svg"`);
  }

  // ensure xlink namespace if referenced
  if (/xlink:href=/.test(t) && !/xmlns:xlink=/.test(t)) {
    t = t.replace(/<svg\b([^>]*)>/, (m) => {
      if (/xmlns:xlink=/.test(m)) return m;
      return m.replace(/>$/, ` xmlns:xlink="http://www.w3.org/1999/xlink">`);
    });
  }

  return t;
}

async function svgToImage(svgText) {
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("Failed to load SVG as image (maybe unsupported external assets)."));
    img.src = url;
  });

  URL.revokeObjectURL(url);
  return img;
}

async function handleFile(file) {
  if (!file) return;

  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!isSvg) {
    setStatus("Please upload an SVG file (.svg).");
    return;
  }

  currentFile = file;
  currentSvgText = "";
  hideDownload();

  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  fileInfoWrapper.classList.remove("d-none");

  setWorking(true);
  setStatus("Reading SVG…");

  try {
    const text = await file.text();
    currentSvgText = text;
    svgIntrinsic = parseSvgSize(text);

    svgMeta.classList.remove("d-none");
    svgMeta.textContent = `Detected size: ${Math.round(svgIntrinsic.width)}×${Math.round(svgIntrinsic.height)} px (before scaling)`;

    setStatus("SVG loaded. Choose output format and click Convert.");
  } catch (err) {
    console.error(err);
    setStatus("Failed to read the SVG file.");
  } finally {
    setWorking(false);
  }
}

async function renderAndExport() {
  if (!currentFile || !currentSvgText) {
    setStatus("Please select an SVG file first.");
    return;
  }

  hideDownload();
  setWorking(true);

  const dst = toFormat.value; // png | jpg | webp
  const scale = Number(scaleRange.value) || 1;
  const quality = (Number(qualityRange.value) || 90) / 100;
  const bg = bgColor.value || "#ffffff";
  const keepTransparency = transparentSwitch.checked;

  try {
    setStatus("Preparing SVG…");
    const clean = sanitizeSvg(currentSvgText);

    const outW = Math.max(1, Math.round(svgIntrinsic.width * scale));
    const outH = Math.max(1, Math.round(svgIntrinsic.height * scale));

    canvas.width = outW;
    canvas.height = outH;

    const needBg =
      dst === "jpg" ||
      ((dst === "png" || dst === "webp") && !keepTransparency);

    if (needBg) {
      ctx.clearRect(0, 0, outW, outH);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, outW, outH);
    } else {
      ctx.clearRect(0, 0, outW, outH);
    }

    setStatus("Rendering…");
    const img = await svgToImage(clean);
    ctx.drawImage(img, 0, 0, outW, outH);

    setStatus("Exporting…");
    let mime = "image/png";
    let ext = "png";

    if (dst === "jpg") {
      mime = "image/jpeg";
      ext = "jpg";
    } else if (dst === "webp") {
      mime = "image/webp";
      ext = "webp";
    }

    const blob = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        mime,
        (dst === "jpg" || dst === "webp") ? quality : undefined
      );
    });

    if (!blob) throw new Error("Export failed: Canvas could not produce output.");

    const baseName = currentFile.name.replace(/\.svg$/i, "");
    showDownload(blob, `${baseName}.${ext}`);

    const now = new Date();
    lastConvLabel.textContent = now.toLocaleString();
    setStatus("Done. Your file is ready to download.");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err?.message || "Unknown error"}`);
  } finally {
    setWorking(false);
  }
}

function resetAll() {
  currentFile = null;
  currentSvgText = "";
  svgIntrinsic = { width: 512, height: 512 };

  fileInput.value = "";
  fileInfoWrapper.classList.add("d-none");
  svgMeta.classList.add("d-none");
  svgMeta.textContent = "";

  hideDownload();
  setStatus("No file selected yet.");

  toFormat.value = "png";
  scaleRange.value = "2";
  qualityRange.value = "90";
  bgColor.value = "#ffffff";
  transparentSwitch.checked = true;

  updateScaleLabel();
  updateOptionVisibility();
}

function wireUploadArea() {
  const openPicker = () => fileInput.click();

  uploadArea.addEventListener("click", openPicker);

  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) handleFile(f);
  });

  changeFileBtn.addEventListener("click", () => fileInput.click());
}

// Events
form.addEventListener("submit", (e) => {
  e.preventDefault();
  renderAndExport();
});

resetBtn.addEventListener("click", resetAll);
toFormat.addEventListener("change", updateOptionVisibility);
scaleRange.addEventListener("input", updateScaleLabel);

// Init
updateScaleLabel();
updateOptionVisibility();
wireUploadArea();
resetAll();

// footer year fallback
const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = String(new Date().getFullYear());
