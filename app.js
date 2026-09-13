import {
    ESPLoader,
    Transport
} from "https://unpkg.com/esptool-js@0.6.1/bundle.js";
import { CHIP_DATABASE } from "./config/chips.js";
import { WEB_FIRMWARE_DATABASE } from "./config/firmware.js";


const firmwareInput = document.getElementById("firmwareInput");
const selectFileButton = document.getElementById("selectFileButton");
const dropZone = document.getElementById("dropZone");

const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const firmwareAnalysisEl = document.getElementById("firmwareAnalysis");
const removeFile = document.getElementById("removeFile");

const connectButton = document.getElementById("connectButton");
const flashButton = document.getElementById("flashButton");
const readFlashButton = document.getElementById("readFlashButton");
const webFirmwareSelect = document.getElementById("webFirmwareSelect");
const firmwareTargetGuard = document.getElementById("firmwareTargetGuard");
const firmwareTargetStatus = document.getElementById("firmwareTargetStatus");
const firmwareTargetConfirm = document.getElementById("firmwareTargetConfirm");
const firmwareTargetSelect = document.getElementById("firmwareTargetSelect");
const firmwareTargetCheckbox = document.getElementById("firmwareTargetCheckbox");

const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");

const connectionIndicator =
    document.getElementById("connectionIndicator");

const deviceName =
    document.getElementById("deviceName");

const devicePort =
    document.getElementById("devicePort");

const terminal =
    document.getElementById("terminal");

const clearLog =
    document.getElementById("clearLog");

const progressContainer =
    document.getElementById("progressContainer");

const progressFill =
    document.getElementById("progressFill");

const progressPercent =
    document.getElementById("progressPercent");


let selectedFile = null;
let selectedFiles = [];
let firmwareAnalysis = null;
let firmwareDetectedFamily = null;
let firmwareTargetConfirmed = false;
let connected = false;

let serialPort = null;
let transport = null;
let espLoader = null;

let detectedChip = null;
let detectedChipInfo = null;

// Only one source may be active: LOCAL upload OR WEB firmware.
let activeFirmwareSource = null; // "local" | "web"
let activeWebFirmware = null;

// Web Firmware library is maintained in one place: config/firmware.js.
// Add / remove / disable Web Firmware entries there.
const WEB_FIRMWARE_PRESETS = WEB_FIRMWARE_DATABASE;

// Chip definitions are maintained in one place: config/chips.js.
// Board variants may share the same silicon family for firmware compatibility.
const CHIP_FAMILIES = Object.fromEntries(
    CHIP_DATABASE.map(chip => [chip.id, chip.family])
);

function populateChipSelector() {
    if (!chipType) return;

    const previousValue = chipType.value || "ESP32_S3";
    chipType.innerHTML = CHIP_DATABASE
        .filter(chip => chip.enabled !== false)
        .map(chip => `<option value="${chip.id}">${chip.name}</option>`)
        .join("");

    chipType.value = CHIP_DATABASE.some(chip => chip.id === previousValue)
        ? previousValue
        : (CHIP_DATABASE[0]?.id || "");
}

// Keep chip-family mapping above any startup code that filters firmware presets.

const chipType =
    document.getElementById("chipType");

const chipInfo =
    document.getElementById("chipInfo");

const chipWarning =
    document.getElementById("chipWarning");

const chipWarningText =
    document.getElementById("chipWarningText");

populateChipSelector();

const infoChip =
    document.getElementById("infoChip");

const infoDescription =
    document.getElementById("infoDescription");

const infoAutoFlash =
    document.getElementById("infoAutoFlash");

const infoRevision =
    document.getElementById("infoRevision");

const infoFlash =
    document.getElementById("infoFlash");

const infoPsram =
    document.getElementById("infoPsram");

const infoFeatures =
    document.getElementById("infoFeatures");


/* ---------------------------
   LOG
--------------------------- */

function log(message, type = "") {
    if (window.ECM_T) message = window.ECM_T(message);

    const line = document.createElement("div");

    line.className = `log-line ${type}`;

    line.innerHTML = `
        <span class="log-prefix">›</span>
        <span>${message}</span>
    `;

    terminal.appendChild(line);

    terminal.scrollTop = terminal.scrollHeight;
}


/* ---------------------------
   FILE
--------------------------- */

selectFileButton.addEventListener("click", () => {

    firmwareInput.click();

});


firmwareInput.addEventListener("change", () => {
    const files = Array.from(firmwareInput.files || []);
    if (files.length) handleFiles(files);
});

async function handleFiles(files) {
    const binFiles = files.filter(file => file.name.toLowerCase().endsWith(".bin"));
    if (!binFiles.length) {
        log("Invalid selection. Please select one or more .BIN firmware files.", "error");
        return;
    }
    // Selecting a local file explicitly switches the active source to LOCAL.
    activeFirmwareSource = "local";
    activeWebFirmware = null;
    if (webFirmwareSelect) webFirmwareSelect.value = "";

    selectedFiles = binFiles;
    selectedFile = selectedFiles[0] || null;
    firmwareAnalysis = null;
    firmwareDetectedFamily = null;
    firmwareTargetConfirmed = false;
    if (firmwareTargetSelect) firmwareTargetSelect.value = "";
    if (firmwareTargetCheckbox) firmwareTargetCheckbox.checked = false;
    fileName.textContent = selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} firmware files selected`;
    fileSize.textContent = formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0));
    fileInfo.classList.remove("hidden");
    dropZone.classList.add("hidden");
    log(`Firmware selection: ${selectedFiles.length} file(s).`);
    for (const file of selectedFiles) log(`  • ${file.name} — ${formatBytes(file.size)}`);
    try {
        await analyzeFirmwareSelection();
    } catch (error) {
        firmwareAnalysis = null;
        if (firmwareAnalysisEl) firmwareAnalysisEl.textContent = `⚠ ${error.message}`;
        log(`Firmware analysis failed: ${error.message}`, "error");
    }
    updateFlashButton();
}

function handleFile(file) { return handleFiles([file]); }

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

/* ---------------------------
   REMOVE FILE
--------------------------- */

removeFile.addEventListener("click", () => {

    selectedFile = null;
    selectedFiles = [];
    firmwareAnalysis = null;
    firmwareDetectedFamily = null;
    firmwareTargetConfirmed = false;
    if (firmwareTargetSelect) firmwareTargetSelect.value = "";
    if (firmwareTargetCheckbox) firmwareTargetCheckbox.checked = false;
    activeFirmwareSource = null;
    activeWebFirmware = null;
    if (webFirmwareSelect) webFirmwareSelect.value = "";

    firmwareInput.value = "";

    fileInfo.classList.add("hidden");

    dropZone.classList.remove("hidden");

    progressContainer.classList.add("hidden");
    if (firmwareAnalysisEl) firmwareAnalysisEl.textContent = "Waiting for firmware analysis…";

    updateFlashButton();

    log("Firmware removed.");

});


/* ---------------------------
   DRAG & DROP
--------------------------- */

dropZone.addEventListener("dragover", (event) => {

    event.preventDefault();

    dropZone.classList.add("dragging");

});


dropZone.addEventListener("dragleave", () => {

    dropZone.classList.remove("dragging");

});


dropZone.addEventListener("drop", (event) => {

    event.preventDefault();

    dropZone.classList.remove("dragging");

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) handleFiles(files);

});


/* ---------------------------
   CONNECT
--------------------------- */

connectButton.addEventListener("click", () => {
    // Keep requestPort() directly inside the user click flow.
    // This is important for the browser's Web Serial permission prompt.
    if (connected) {
        void disconnectDevice();
        return;
    }
    void connectDevice();
});

 /******
  * ----------------------------------------------------------------
  */
async function connectDevice() {

    if (!("serial" in navigator)) {

        log(
            "Web Serial is not supported. Please use Chrome or Edge.",
            "error"
        );

        return;
    }
    try {

        log("Opening serial device selector...");

        // MUST be called from the user-initiated Connect click.
        // An empty filter keeps the chooser open for ESP32 USB-UART/JTAG devices.
        if (!navigator.serial || typeof navigator.serial.requestPort !== "function") {
            throw new Error("Web Serial requestPort() is unavailable. Use Chrome/Edge over HTTPS or localhost.");
        }
        serialPort = await navigator.serial.requestPort({ filters: [] });

        log("USB device selected.", "success");

        log("[DEBUG] Serial transport initialized.", "debug");

        log("Initializing ESP loader...");

        transport =
            new Transport(
                serialPort,
                true
            );

        const terminalInterface = {

            clean() {

                // Không xóa terminal UI của chúng ta
                // esptool sẽ ghi trực tiếp vào terminal bên dưới.

            },

            writeLine(data) {

                if (data !== undefined) {

                    log(
                        String(data)
                    );
                }
            },

            write(data) {

                if (data !== undefined) {

                    appendRawLog(
                        String(data)
                    );
                }
            }
        };

        espLoader =
            new ESPLoader({

                transport,

                // esptool-js always starts the ROM connection at 115200, then
                // automatically switches to this transfer baud after the stub loads.
                baudrate: 460800,

                terminal:
                    terminalInterface,

                debugLogging: true

            });

        log("[DEBUG] Connecting to ESP ROM / probing chip...", "debug");

        /*
         * ESPLoader.main()
         *
         * Đây là bước esptool-js
         * tự nhận diện chip.
         */

        detectedChip =
            await espLoader.main();


        log(`CHIP DETECTED  : ${detectedChip}`, "success");
        log("[DEBUG] ROM handshake completed. Chip target is now locked for compatibility checks.", "debug");
        /*
         * Lấy thông tin chi tiết
         */

        await readChipInformation();

        connected = true;
        statusPill.classList.add(
            "connected"
        );

        connectionIndicator.classList.add(
            "connected"
        );


        statusText.textContent = window.ECM_T ? window.ECM_T("DEVICE CONNECTED") : "DEVICE CONNECTED";


        deviceName.textContent =
            detectedChip;

        devicePort.textContent = window.ECM_T ? window.ECM_T("USB Serial / ESP ROM") : "USB Serial / ESP ROM";

        connectButton.innerHTML =
            "⛓ DISCONNECT";

        /*
         * Kiểm tra chip đã chọn
         */
        checkChipCompatibility();

        updateFlashButton();

    } catch (error) {

        console.error(error);

        log(
            `Connection failed: ${error.message || error}`,
            "error"
        );
        connected = false;

        const failedPort = serialPort;
        const failedTransport = transport;

        if (failedTransport && typeof failedTransport.disconnect === "function") {
            try {
                await failedTransport.disconnect();
            } catch (_) {}
        }

        if (failedPort) {
            try {
                if (failedPort.readable || failedPort.writable) {
                    await failedPort.close();
                }
            } catch (_) {}
        }

        serialPort = null;
        transport = null;
        espLoader = null;
        detectedChip = null;
        detectedChipInfo = null;

        statusPill.classList.remove("connected");
        connectionIndicator.classList.remove("connected");
        statusText.textContent = window.ECM_T ? window.ECM_T("DEVICE NOT CONNECTED") : "DEVICE NOT CONNECTED";
        deviceName.textContent = window.ECM_T ? window.ECM_T("No device") : "No device";
        devicePort.textContent = window.ECM_T ? window.ECM_T("Connect a device via USB") : "Connect a device via USB";
        connectButton.disabled = false;
        connectButton.innerHTML = window.ECM_T ? window.ECM_T("🔌 CONNECT ESP32") : "🔌 CONNECT ESP32";
        chipInfo.classList.add("hidden");
        chipWarning.classList.add("hidden");
        chipInfo.classList.remove("match", "mismatch");
        updateFlashButton();

    }

}


async function disconnectDevice() {
    if (isFlashing) return;

    const port = serialPort;
    const activeTransport = transport;

    // Clear the UI/state first so a failed close cannot leave the app
    // looking connected. The actual port is closed immediately below.
    connected = false;
    detectedChip = null;
    detectedChipInfo = null;
    serialPort = null;
    transport = null;
    espLoader = null;

    statusPill.classList.remove("connected");
    statusText.textContent = window.ECM_T ? window.ECM_T("DEVICE NOT CONNECTED") : "DEVICE NOT CONNECTED";
    connectionIndicator.classList.remove("connected");
    deviceName.textContent = window.ECM_T ? window.ECM_T("No device") : "No device";
    devicePort.textContent = window.ECM_T ? window.ECM_T("Connect a device via USB") : "Connect a device via USB";
    connectButton.disabled = false;
    connectButton.innerHTML = window.ECM_T ? window.ECM_T("🔌 CONNECT ESP32") : "🔌 CONNECT ESP32";

    chipInfo.classList.add("hidden");
    chipWarning.classList.add("hidden");
    chipInfo.classList.remove("match", "mismatch");

    try {
        if (activeTransport && typeof activeTransport.disconnect === "function") {
            await activeTransport.disconnect();
        }
    } catch (error) {
        console.warn("Transport disconnect warning:", error);
    }

    try {
        if (port && (port.readable || port.writable)) {
            await port.close();
        }
    } catch (error) {
        console.warn("Serial port close warning:", error);
    }

    log("Device disconnected.");
    updateFlashButton();
}



/* ---------------------------
   WEB FIRMWARE PRESETS
--------------------------- */

function populateWebFirmwarePresets() {
    if (!webFirmwareSelect) return;

    const selectedFamily = CHIP_FAMILIES[chipType?.value] || chipType?.value;
    const previous = activeWebFirmware?.id || "";

    webFirmwareSelect.innerHTML = `<option value="">SELECT WEB FIRMWARE</option>`;

    WEB_FIRMWARE_PRESETS
        .filter(item => item.enabled !== false)
        .filter(item => !selectedFamily || !item.family || item.family === selectedFamily)
        .forEach(item => {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = item.placeholder
                ? `${item.label} — ${item.description}`
                : item.label;
            option.disabled = !!item.placeholder;
            webFirmwareSelect.appendChild(option);
        });

    if (activeFirmwareSource === "web" && previous) {
        const stillExists = [...webFirmwareSelect.options].some(o => o.value === previous);
        webFirmwareSelect.value = stillExists ? previous : "";
    }
}

async function prepareWebFirmwarePreset(preset) {
    if (!preset) return;

    if (preset.placeholder || !preset.file) {
        log("CUSTOM FIRMWARE 03 is reserved for a future firmware file.", "error");
        if (webFirmwareSelect) webFirmwareSelect.value = "";
        return;
    }

    if (!connected || !espLoader || !transport) {
        log("Web Firmware blocked: connect an ESP32 before selecting a firmware.", "error");
        if (webFirmwareSelect) webFirmwareSelect.value = "";
        return;
    }

    if (!checkChipCompatibility()) {
        log("Web Firmware blocked: target chip does not match the detected chip.", "error");
        if (webFirmwareSelect) webFirmwareSelect.value = "";
        return;
    }

    const selectedFamily = CHIP_FAMILIES[chipType?.value] || chipType?.value;

    activeFirmwareSource = "web";
    activeWebFirmware = preset;

    // Clear LOCAL as the active source. The actual bytes are loaded into the
    // common flash pipeline, but the source remains explicitly marked WEB.
    selectedFile = null;
    selectedFiles = [];
    firmwareAnalysis = null;
    firmwareInput.value = "";
    fileInfo.classList.add("hidden");
    dropZone.classList.remove("hidden");

    try {
        log(`WEB FIRMWARE SELECTED → ${preset.label}`, "system");
        log(`Target chip     : ${selectedFamily}`, "system");
        log(`Detected chip   : ${detectedChip}`, "system");
        log("Chip compatibility: MATCH ✓", "success");
        log(`Fetching built-in firmware: ${preset.file}`, "system");

        const response = await fetch(preset.file, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const buffer = await response.arrayBuffer();
        const filename = preset.file.split("/").pop() || `${preset.id}.bin`;
        const file = new File([buffer], filename, { type: "application/octet-stream" });

        selectedFiles = [file];
        selectedFile = file;

        const previousAddress = document.getElementById("flashAddress")?.value;
        if (preset.mode === "full") {
            const addressControl = document.getElementById("flashAddress");
            if (addressControl) addressControl.value = "0x0000";
        }

        firmwareAnalysis = null;
        await analyzeFirmwareSelection();

        // If a raw backup has no ESP image header, the built-in preset metadata
        // is used as the target. For normal ESP images, the binary header/memory
        // map always wins over the display label.
        if (!firmwareDetectedFamily && preset.family) {
            firmwareDetectedFamily = preset.family;
            updateFirmwareTargetGuard();
        }

        if (firmwareDetectedFamily && firmwareDetectedFamily !== selectedFamily) {
            activeFirmwareSource = null;
            activeWebFirmware = null;
            selectedFile = null;
            selectedFiles = [];
            firmwareAnalysis = null;
            fileInfo.classList.add("hidden");
            dropZone.classList.remove("hidden");
            if (webFirmwareSelect) webFirmwareSelect.value = "";
            log(`WEB FIRMWARE BLOCKED — Binary target is ${firmwareDetectedFamily}, but selected chip is ${selectedFamily}.`, "error");
            log("The firmware label cannot override the binary target check. Flash is locked.", "error");
            updateFlashButton();
            return;
        }

        log(`Web firmware ready: ${filename} • ${formatBytes(file.size)}`, "success");
        log("Web firmware selected and ready. Press FLASH ESP32 to start.", "success");
        updateFlashButton();

        // Restore AUTO after a full-backup preset so the normal local workflow
        // is not left with a forced offset.
        if (preset.mode === "full") {
            const addressControl = document.getElementById("flashAddress");
            if (addressControl) addressControl.value = previousAddress || "auto";
        }
    } catch (error) {
        activeFirmwareSource = null;
        activeWebFirmware = null;
        log(`Web Firmware load failed: ${error?.message || error}`, "error");
        if (preset.mode === "full") {
            const addressControl = document.getElementById("flashAddress");
            if (addressControl) addressControl.value = "auto";
        }
    }
}

webFirmwareSelect?.addEventListener("change", async () => {
    const preset = WEB_FIRMWARE_PRESETS.find(item => item.id === webFirmwareSelect.value);
    if (!preset) {
        if (activeFirmwareSource === "web") {
            activeFirmwareSource = null;
            activeWebFirmware = null;
        }
        updateFlashButton();
        return;
    }
    await prepareWebFirmwarePreset(preset);
});

populateWebFirmwarePresets();

/* ---------------------------
   READ FLASH — REAL BACKUP
--------------------------- */

function flashSizeToBytes(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    const match = String(value || "").match(/([0-9]+(?:\.[0-9]+)?)\s*(KB|MB|GB)/i);
    if (!match) return 0;
    const amount = Number(match[1]);
    const unit = match[2].toUpperCase();
    const multiplier = unit === "GB" ? 1024 ** 3 : unit === "MB" ? 1024 ** 2 : 1024;
    return Math.floor(amount * multiplier);
}

async function readEntireFlash() {
    if (!connected || !espLoader) {
        log("Connect an ESP32 before reading flash.", "error");
        return;
    }
    if (isFlashing) return;

    isFlashing = true;
    setFlashUiLocked(true);
    progressContainer.classList.remove("hidden");
    progressFill.style.width = "0%";
    progressPercent.textContent = "0%";

    try {
        const detectedSize = await detectFlashSize();
        const totalSize = flashSizeToBytes(detectedSize) || Number(espLoader.flashSizeBytes) || 0;
        if (!totalSize) throw new Error("Unable to determine flash size.");

        // Read in 1 MiB chunks. This is more reliable than one huge read on Web Serial.
        const CHUNK = 0x100000;
        const output = new Uint8Array(totalSize);
        log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "system");
        log("STARTING FLASH READ / BACKUP", "system");
        log(`Chip         : ${detectedChip}`, "system");
        log(`Flash size   : ${formatBytes(totalSize)}`, "system");
        log("Chunk size   : 1 MB", "system");

        for (let offset = 0; offset < totalSize; offset += CHUNK) {
            const size = Math.min(CHUNK, totalSize - offset);
            log(`Reading ${toHex(offset)} → ${toHex(offset + size)} ...`);
            const data = await espLoader.readFlash(offset, size, (_packet, progress, chunkTotal) => {
                const chunkDone = Number(progress) || 0;
                const overall = Math.min(totalSize, offset + chunkDone);
                const percent = Math.round((overall / totalSize) * 100);
                progressFill.style.width = `${percent}%`;
                progressPercent.textContent = `${percent}%`;
            });
            output.set(data, offset);
            const percent = Math.round(((offset + size) / totalSize) * 100);
            progressFill.style.width = `${percent}%`;
            progressPercent.textContent = `${percent}%`;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${String(detectedChip || "ESP32").replace(/[^a-z0-9_-]/gi, "_")}_flash_backup_${stamp}.bin`;
        const blob = new Blob([output], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        log(`FLASH BACKUP READY ✓ ${filename}`, "success");
        log(`Saved ${formatBytes(output.byteLength)} from 0x00000000.`, "success");
        progressFill.style.width = "100%";
        progressPercent.textContent = "100%";
    } catch (error) {
        progressFill.style.width = "0%";
        progressPercent.textContent = "ERROR";
        log(`FLASH READ FAILED: ${error?.message || error}`, "error");
    } finally {
        isFlashing = false;
        setFlashUiLocked(false);
        updateFlashButton();
    }
}

readFlashButton?.addEventListener("click", readEntireFlash);

/* ---------------------------
   FLASH ENGINE — REAL WRITE
--------------------------- */

let isFlashing = false;

flashButton.addEventListener("click", async () => {
    if (isFlashing) return;

    if (!selectedFile || !activeFirmwareSource) {
        log("No active firmware source selected.", "error");
        return;
    }

    if (!connected || !espLoader || !transport) {
        log("Connect an ESP32 before flashing.", "error");
        return;
    }

    if (!checkChipCompatibility()) {
        log("Flash blocked: target chip does not match the detected chip.", "error");
        return;
    }

    await flashFirmware();
});

async function flashFirmware(sourceOverride = activeFirmwareSource) {
    isFlashing = true;
    setFlashUiLocked(true);

    progressContainer.classList.remove("hidden");
    progressFill.style.width = "0%";
    progressPercent.textContent = "0%";

    const eraseAll = document.getElementById("eraseFlash")?.checked ?? false;

    try {
        const layout = firmwareAnalysis || await analyzeFirmwareSelection();
        const fileArray = await buildFlashFileArray(layout);
        log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "system");
        log("STARTING REAL FIRMWARE FLASH", "system");
        log(`Target       : ${detectedChip}`, "system");
        const sourceLabel = sourceOverride === "web"
            ? `WEB • ${activeWebFirmware?.label || selectedFiles[0]?.name || "unknown"}`
            : `LOCAL • ${selectedFiles.map(f => f.name).join(", ")}`;
        log(`Source       : ${sourceLabel}`, "system");
        log(`Firmware     : ${selectedFiles.map(f => f.name).join(", ")}`, "system");
        log(`Total size   : ${formatBytes(layout.totalBytes)}`, "system");
        log(`Layout       : ${layout.summary}`, "system");
        log(`Flash plan   : ${layout.entries.map(e => `${e.file.name} → ${toHex(e.address)}`).join(" | ")}`, "system");
        log(`Erase all    : ${eraseAll ? "YES" : "NO"}`, "system");

        if (eraseAll && layout.entries.some(e => e.address !== 0)) {
            log("WARNING: Erase all is enabled with a multi-offset flash plan.", "error");
            log("This is intended for a complete firmware set.", "error");
        }

        for (const entry of fileArray) {
            if (!entry.data?.length) throw new Error(`Firmware file is empty: ${entry.file?.name || "unknown"}`);
        }

        log("Preparing flash writer...", "system");
        log("Transfer: 460800 baud • Compression: ON", "system");

        let lastPercent = -1;
        let lastReportedBytes = 0;

        await espLoader.writeFlash({
            fileArray,
            flashMode: "keep",
            flashFreq: "keep",
            flashSize: "keep",
            eraseAll,
            compress: true,
            reportProgress: (fileIndex, written, total) => {
                const safeTotal = Math.max(Number(total) || layout.totalBytes, 1);
                const safeWritten = Math.min(Number(written) || 0, safeTotal);
                const percent = Math.min(100, Math.round((safeWritten / safeTotal) * 100));

                if (percent !== lastPercent) {
                    lastPercent = percent;
                    progressFill.style.width = `${percent}%`;
                    progressPercent.textContent = `${percent}%`;
                }

                if (safeWritten !== lastReportedBytes) {
                    lastReportedBytes = safeWritten;
                }
            }
        });

        progressFill.style.width = "100%";
        progressPercent.textContent = "100%";

        log("Firmware data written successfully.", "success");
        log("Verification completed by esptool-js.", "success");

        // Give the target a clean reboot into the newly flashed image.
        log("Resetting ESP32...", "system");

        try {
            await espLoader.after("hard_reset");
            log("ESP32 hard reset sent.", "success");
        } catch (resetError) {
            // Flashing itself already succeeded. A reset failure should not turn
            // a successful write into a false failure.
            log(`Reset warning: ${resetError?.message || resetError}`, "error");
        }

        log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "success");
        log("FLASH COMPLETED SUCCESSFULLY ✓", "success");

        setStatusAfterFlash();

    } catch (error) {
        console.error("Flash error:", error);

        progressFill.style.width = "0%";
        progressPercent.textContent = "ERROR";

        log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "error");
        log(`FLASH FAILED: ${error?.message || error}`, "error");

        if (error?.stack) {
            console.error(error.stack);
        }
    } finally {
        isFlashing = false;
        setFlashUiLocked(false);
        updateFlashButton();
    }
}

async function analyzeFirmwareSelection() {
    if (!selectedFiles.length) throw new Error("No firmware file selected.");
    const manualAddress = parseFlashAddress();

    if (selectedFiles.length === 1) {
        const file = selectedFiles[0];
        const bytes = new Uint8Array(await file.arrayBuffer());
        const image = parseEspImage(bytes);
        const embedded = findEmbeddedEspImages(bytes);
        firmwareDetectedFamily = detectFirmwareTarget(bytes, image, embedded);
        if (manualAddress !== null) {
            firmwareAnalysis = { mode: "manual", summary: `Manual offset ${toHex(manualAddress)}`, entries: [{ file, data: bytes, address: manualAddress }], totalBytes: bytes.byteLength };
        } else if (embedded.length >= 2) {
            firmwareAnalysis = { mode: "merged", summary: "Merged / Full Image detected", entries: [{ file, data: bytes, address: 0 }], totalBytes: bytes.byteLength };
        } else if (image.valid) {
            firmwareAnalysis = { mode: "app", summary: "Single ESP image detected — defaulting to 0x10000", entries: [{ file, data: bytes, address: 0x10000 }], totalBytes: bytes.byteLength };
        } else {
            firmwareAnalysis = { mode: "unknown", summary: "Unknown BIN layout — manual address required", entries: [{ file, data: bytes, address: 0 }], totalBytes: bytes.byteLength, needsManualAddress: true };
        }
    } else {
        const entries = [];
        const detectedFamilies = new Set();
        for (const file of selectedFiles) {
            const data = new Uint8Array(await file.arrayBuffer());
            const parsed = parseEspImage(data);
            const family = detectFirmwareTarget(data, parsed, []);
            if (family) detectedFamilies.add(family);
            const name = file.name.toLowerCase();
            let address = null;
            if (/bootloader/.test(name)) address = 0x1000;
            else if (/partitions?|partition[_-]?table/.test(name)) address = 0x8000;
            else if (/ota[_-]?data/.test(name)) address = 0xD000;
            else if (/app|factory|firmware/.test(name)) address = 0x10000;
            if (address === null) throw new Error(`Cannot determine flash offset for ${file.name}. Use a standard name (bootloader.bin, partitions.bin, app.bin) or select a manual address for a single file.`);
            entries.push({ file, data, address });
        }
        firmwareDetectedFamily = detectedFamilies.size === 1 ? [...detectedFamilies][0] : detectedFamilies.size > 1 ? "MIXED" : null;
        firmwareAnalysis = { mode: "multi", summary: "Multi-file firmware layout detected", entries, totalBytes: entries.reduce((sum, e) => sum + e.data.byteLength, 0) };
    }

    updateFirmwareTargetGuard();
    if (firmwareAnalysisEl) {
        const extra = firmwareAnalysis.needsManualAddress ? " • MANUAL OFFSET REQUIRED" : firmwareAnalysis.entries.length > 1 ? ` • ${firmwareAnalysis.entries.length} flash targets` : "";
        firmwareAnalysisEl.textContent = `✓ ${firmwareAnalysis.summary}${extra}`;
    }
    log(`Firmware analysis → ${firmwareAnalysis.summary}`, firmwareAnalysis.needsManualAddress ? "error" : "success");
    if (firmwareDetectedFamily) log(`Firmware target → ${firmwareDetectedFamily}`, firmwareDetectedFamily === "MIXED" ? "error" : "success");
    else log("Firmware target → UNKNOWN — explicit confirmation required before flashing.", "error");
    for (const entry of firmwareAnalysis.entries) log(`  ${entry.file.name} → ${toHex(entry.address)}`);
    return firmwareAnalysis;
}

function detectFirmwareTarget(bytes, image = null, embedded = []) {
    const candidates = [];
    const images = [];
    if (image?.valid) images.push({ offset: 0, parsed: image });
    for (const hit of embedded || []) {
        if (!images.some(x => x.offset === hit.offset)) images.push({ offset: hit.offset, parsed: hit });
    }

    const chipNames = { 0x0000: "ESP32", 0x0002: "ESP32-S2", 0x0005: "ESP32-C3", 0x0009: "ESP32-S3", 0x000c: "ESP32-C2", 0x000d: "ESP32-C6" };
    for (const item of images) {
        const off = item.offset;
        if (off + 14 <= bytes.length) {
            const chipId = bytes[off + 12] | (bytes[off + 13] << 8);
            const family = chipNames[chipId] || null;
            if (family) candidates.push(family);
        }

        // Legacy/ambiguous headers sometimes carry chip ID 0. Memory-map
        // addresses still distinguish classic ESP32 from ESP32-S3 images.
        const start = off + 24;
        let pos = start;
        const end = Math.min(bytes.length, start + 0x200000);
        let sawClassic = false;
        let sawS3 = false;
        const segCount = bytes[off + 1] || 0;
        for (let i = 0; i < segCount && pos + 8 <= bytes.length; i++) {
            const load = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(pos, true);
            const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(pos + 4, true);
            if (load >= 0x3f400000 && load < 0x40400000) sawClassic = true;
            if (load >= 0x3fc80000 && load < 0x40400000) sawS3 = true;
            if (load >= 0x42000000 && load < 0x44000000) sawS3 = true;
            if (load >= 0x3c000000 && load < 0x3e000000) sawS3 = true;
            if (len > bytes.length - pos - 8) break;
            pos += 8 + len;
        }
        if (!chipNames[bytes[off + 12] | (bytes[off + 13] << 8)]) {
            if (sawS3 && !sawClassic) candidates.push("ESP32-S3");
            else if (sawClassic && !sawS3) candidates.push("ESP32");
        }
    }

    const unique = [...new Set(candidates)];
    return unique.length === 1 ? unique[0] : unique.length > 1 ? "MIXED" : null;
}

function updateFirmwareTargetGuard() {
    if (!firmwareTargetGuard || !firmwareTargetStatus) return;
    firmwareTargetGuard.classList.remove("hidden");
    if (firmwareDetectedFamily && firmwareDetectedFamily !== "MIXED") {
        firmwareTargetStatus.textContent = firmwareDetectedFamily;
        firmwareTargetConfirm?.classList.add("hidden");
        firmwareTargetConfirmed = true;
        return;
    }
    firmwareTargetStatus.textContent = firmwareDetectedFamily === "MIXED" ? "MIXED / UNSAFE" : "UNKNOWN / CONFIRM";
    firmwareTargetConfirm?.classList.remove("hidden");
    firmwareTargetConfirmed = !!(firmwareTargetCheckbox?.checked && firmwareTargetSelect?.value);
}

function parseEspImage(bytes) {
    if (bytes.length < 24 || bytes[0] !== 0xE9) return { valid: false };
    const segments = bytes[1];
    if (!segments || segments > 16) return { valid: false };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 24;
    for (let i = 0; i < segments; i++) {
        if (pos + 8 > bytes.length) return { valid: false };
        const len = view.getUint32(pos + 4, true);
        if (len > bytes.length - pos - 8) return { valid: false };
        pos += 8 + len;
    }
    return { valid: true, segments, end: pos, entry: view.getUint32(4, true) };
}

function findEmbeddedEspImages(bytes) {
    const hits = [];
    for (let offset = 0; offset + 24 <= bytes.length; offset += 0x100) {
        if (bytes[offset] !== 0xE9) continue;
        const parsed = parseEspImage(bytes.subarray(offset));
        if (parsed.valid) hits.push({ offset, ...parsed });
    }
    return hits;
}

async function buildFlashFileArray(layout) {
    const manualAddress = parseFlashAddress();
    if (manualAddress !== null && layout.entries.length === 1) return [{ data: layout.entries[0].data, address: manualAddress }];
    if (layout.needsManualAddress) throw new Error("Firmware layout could not be determined. Select a manual flash address.");
    return layout.entries.map(({ data, address, file }) => ({ data, address, file }));
}

function parseFlashAddress() {
    const raw = document.getElementById("flashAddress")?.value ?? "auto";
    if (raw === "auto") return null;
    const address = Number.parseInt(raw, 16);
    if (!Number.isFinite(address) || address < 0) throw new Error(`Invalid flash address: ${raw}`);
    return address;
}

function toHex(value) {
    return `0x${Number(value).toString(16).toUpperCase().padStart(4, "0")}`;
}

function updateFlashButton() {
    const chipMatch = detectedChip ? checkChipCompatibility(false) : false;
    const hasActiveSource = activeFirmwareSource && selectedFiles.length;
    const firmwareTargetMatch = firmwareDetectedFamily && firmwareDetectedFamily !== "MIXED"
        ? firmwareDetectedFamily === (CHIP_FAMILIES[chipType?.value] || chipType?.value)
        : !!firmwareTargetConfirmed && firmwareTargetSelect?.value === (CHIP_FAMILIES[chipType?.value] || chipType?.value);
    flashButton.disabled = isFlashing || !hasActiveSource || !connected || !espLoader || !chipMatch || !firmwareTargetMatch || firmwareAnalysis?.needsManualAddress === true;
}

function setFlashUiLocked(locked) {
    const firmwareTargetMatch = firmwareDetectedFamily && firmwareDetectedFamily !== "MIXED"
        ? firmwareDetectedFamily === (CHIP_FAMILIES[chipType?.value] || chipType?.value)
        : !!firmwareTargetConfirmed && firmwareTargetSelect?.value === (CHIP_FAMILIES[chipType?.value] || chipType?.value);
    flashButton.disabled = locked || !selectedFiles.length || !activeFirmwareSource || !connected || !checkChipCompatibility(false) || !firmwareTargetMatch || firmwareAnalysis?.needsManualAddress === true;
    connectButton.disabled = locked;
    const controls = [firmwareInput, selectFileButton, removeFile, chipType, document.getElementById("flashAddress"), document.getElementById("eraseFlash"), webFirmwareSelect, readFlashButton];
    for (const control of controls) if (control) control.disabled = locked;
    flashButton.classList.toggle("flashing", locked);
    flashButton.innerHTML = locked ? `<span class="flash-icon">◌</span><span>${window.ECM_T ? window.ECM_T("FLASHING...") : "FLASHING..."}</span>` : `<span class="flash-icon">⚡</span><span>${window.ECM_T ? window.ECM_T("FLASH ESP32") : "FLASH ESP32"}</span>`;
}

function setStatusAfterFlash() {
    statusText.textContent = window.ECM_T ? window.ECM_T("FLASH COMPLETE") : "FLASH COMPLETE";
    statusPill.classList.add("connected");
}

firmwareTargetSelect?.addEventListener("change", () => {
    firmwareTargetConfirmed = !!(firmwareTargetCheckbox?.checked && firmwareTargetSelect.value);
    updateFirmwareTargetGuard();
    updateFlashButton();
});
firmwareTargetCheckbox?.addEventListener("change", () => {
    firmwareTargetConfirmed = !!(firmwareTargetCheckbox.checked && firmwareTargetSelect?.value);
    updateFirmwareTargetGuard();
    updateFlashButton();
});

const flashAddressControl = document.getElementById("flashAddress");
if (flashAddressControl) {
    flashAddressControl.addEventListener("change", async () => {
        if (!selectedFiles.length) return;
        try {
            await analyzeFirmwareSelection();
            updateFlashButton();
        } catch (error) {
            log(`Firmware layout update failed: ${error.message}`, "error");
            updateFlashButton();
        }
    });
}

/* ---------------------------
   CLEAR LOG
--------------------------- */

clearLog.addEventListener("click", () => {

    terminal.innerHTML = "";

    log(
        "Terminal cleared.",
        "system"
    );

});

/****----------------------------------------- */
async function readChipInformation() {

    if (!espLoader || !espLoader.chip) {

        log(
            "Chip information is not available.",
            "error"
        );

        return;

    }


    const chip =
        espLoader.chip;


    log("────────────────────────────────────────", "debug");
    log("[CHIP DEBUG] DEVICE IDENTIFICATION", "debug");
    log(`CHIP       : ${detectedChip}`, "debug");
    if (chip.IMAGE_CHIP_ID !== undefined) log(`IMAGE ID   : 0x${Number(chip.IMAGE_CHIP_ID).toString(16).padStart(2, "0")}`, "debug");


    /*
     * Description
     */

    try {

        const description =
            await chip.getChipDescription(
                espLoader
            );

        log(`DESCRIPTION: ${description}`, "debug");

        infoDescription.textContent =
            description;

    } catch (error) {

        infoChip.textContent =
            detectedChip;

    }


    /*
     * Revision
     */

    try {

        let revision = "Unknown";


        if (
            typeof chip.getMajorChipVersion ===
            "function" &&
            typeof chip.getMinorChipVersion ===
            "function"
        ) {

            const major =
                await chip.getMajorChipVersion(
                    espLoader
                );

            const minor =
                await chip.getMinorChipVersion(
                    espLoader
                );

            revision =
                `v${major}.${minor}`;

        }


        infoRevision.textContent =
            revision;


        log(`REVISION   : ${revision}`, "debug");


    } catch (error) {

        infoRevision.textContent =
            "Unknown";

    }


    /*
     * Features
     */

    try {

        if (
            typeof chip.getChipFeatures ===
            "function"
        ) {

            const features =
                await chip.getChipFeatures(
                    espLoader
                );


            if (Array.isArray(features)) {

                infoFeatures.textContent =
                    features.join(", ");


                log(`FEATURES   : ${features.join(", ")}`, "debug");

            }

        }

    } catch (error) {

        infoFeatures.textContent =
            "Unknown";

    }


    /*
     * Flash
     */

    try {

        let flashSize =
            await detectFlashSize();


        infoFlash.textContent =
            flashSize;
        infoAutoFlash.textContent =
            flashSize;


        log(`FLASH      : ${flashSize}`, "debug");

    } catch (error) {

        infoFlash.textContent =
            "Unknown";

        log(
            `Flash detection failed: ${error.message}`,
            "error"
        );

    }


    /*
     * PSRAM
     */

    try {

        if (
            typeof chip.getPsramCap ===
            "function"
        ) {

            const psramCap =
                await chip.getPsramCap(
                    espLoader
                );


            const psram =
                decodePsram(
                    psramCap
                );


            infoPsram.textContent =
                psram;


            log(`PSRAM      : ${psram}`, "debug");

        } else {

            infoPsram.textContent =
                "Not reported";

        }

    } catch (error) {

        infoPsram.textContent =
            "Not detected";

    }

    log("[CHIP DEBUG] DEVICE PROBE COMPLETE", "debug");
    log("────────────────────────────────────────", "debug");

    chipInfo.classList.remove(
        "hidden"
    );

}
/***--------------------------------
 * 
 */
async function detectFlashSize() {

    /*
     * esptool-js hiện tại cung cấp
     * detectFlashSize().
     */

    if (
        typeof espLoader.detectFlashSize ===
        "function"
    ) {
        const size =
            await espLoader.detectFlashSize();

        if (size) {

            return size;

        }
    }
    /*
     * Một số phiên bản API có thể
     * trả về flashSize qua chip.
     */

    return "Unknown";

}
/**
 * 
 * Đối với ESP32-S3, esptool-js hiện đọc được thông tin PSRAM từ eFuse và phân loại 8 MB / 2 MB; 
 * nó cũng đọc thông tin embedded flash và vendor.
 */
function decodePsram(value) {

    switch (value) {

        case 0:
            return "None";

        case 1:
            return "8 MB";

        case 2:
            return "2 MB";

        default:
            return `Unknown (${value})`;

    }

}

function normalizeChipName(name) {
    return String(name ?? "")
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/[_-]/g, "");
}

function getChipFamily(name) {
    const normalized = normalizeChipName(name);

    // Match aliases from the single chip database first.
    for (const chip of CHIP_DATABASE) {
        if (chip.aliases?.some(alias => normalizeChipName(alias) === normalized)) {
            return chip.family;
        }
    }

    // Forgiving fallback for esptool strings containing revisions/suffixes.
    if (normalized.includes("ESP32S3")) return "ESP32-S3";
    if (normalized.includes("ESP32C6")) return "ESP32-C6";
    if (normalized.includes("ESP32C3")) return "ESP32-C3";
    if (normalized.includes("ESP32C2")) return "ESP32-C2";
    if (normalized.includes("ESP32S2")) return "ESP32-S2";

    // Classic ESP32 only. Other families must never match ESP32.
    if (normalized === "ESP32" || normalized.startsWith("ESP32D0") || normalized.startsWith("ESP32D2")) {
        return "ESP32";
    }

    return null;
}

function checkChipCompatibility(writeLog = true) {
    if (!detectedChip) {
        chipInfo.classList.remove("match", "mismatch");
        chipWarning.classList.add("hidden");
        return false;
    }

    const selectedFamily = CHIP_FAMILIES[chipType.value] || chipType.value;
    const detectedFamily = getChipFamily(detectedChip);
    const compatible = detectedFamily !== null && detectedFamily === selectedFamily;

    if (compatible) {
        chipInfo.classList.remove("mismatch");
        chipInfo.classList.add("match");
        chipWarning.classList.add("hidden");
        if (writeLog) {
            log(`✓ CHIP MATCH — Target: ${selectedFamily} • Detected: ${detectedChip}`, "success");
        }
        return true;
    }

    chipInfo.classList.remove("match");
    chipInfo.classList.add("mismatch");
    chipWarning.classList.remove("hidden");
    chipWarningText.textContent = detectedFamily
        ? `Target: ${selectedFamily} • Detected: ${detectedChip}. Flash is disabled.`
        : `Target: ${selectedFamily} • Detected: ${detectedChip}. Unknown chip family — Flash is disabled.`;

    if (writeLog) {
        log(`⚠ CHIP MISMATCH — Target: ${selectedFamily} • Detected: ${detectedChip}. FLASH LOCKED.`, "error");
    }

    return false;
}

chipType.addEventListener("change", async () => {
    const selectedFamily = CHIP_FAMILIES[chipType.value] || chipType.value;
    log(`Target chip changed → ${selectedFamily}`);

    if (detectedChip) {
        checkChipCompatibility(true);
    } else {
        chipWarning.classList.add("hidden");
        chipInfo.classList.remove("match", "mismatch");
    }

    if (activeFirmwareSource === "web" && activeWebFirmware && activeWebFirmware.family && activeWebFirmware.family !== selectedFamily) {
        log(`Active Web Firmware cleared: ${activeWebFirmware.label} is for ${activeWebFirmware.family}, not ${selectedFamily}.`, "error");
        activeFirmwareSource = null;
        activeWebFirmware = null;
        selectedFile = null;
        selectedFiles = [];
        firmwareAnalysis = null;
        if (webFirmwareSelect) webFirmwareSelect.value = "";
        fileInfo.classList.add("hidden");
        dropZone.classList.remove("hidden");
    }

    populateWebFirmwarePresets();

    if (selectedFiles.length) {
        try {
            await analyzeFirmwareSelection();
        } catch (error) {
            log(`Firmware re-analysis failed: ${error.message}`, "error");
        }
    }

    updateFlashButton();
});

function appendRawLog(message) {
    const lastLine = terminal.lastElementChild;
    if (lastLine && lastLine.classList.contains("log-line")) {
        const text = lastLine.querySelector("span:last-child");
        if (text) { text.textContent += message; terminal.scrollTop = terminal.scrollHeight; return; }
    }
    log(message);
}


window.addEventListener("ecm-language-change", () => {
    if (statusText) statusText.textContent = connected ? (window.ECM_T?.("DEVICE CONNECTED") || "DEVICE CONNECTED") : (window.ECM_T?.("DEVICE NOT CONNECTED") || "DEVICE NOT CONNECTED");
    if (deviceName && !connected) deviceName.textContent = window.ECM_T?.("No device") || "No device";
    if (devicePort && !connected) devicePort.textContent = window.ECM_T?.("Connect a device via USB") || "Connect a device via USB";
    if (connectButton) connectButton.innerHTML = connected ? (window.ECM_T?.("⛓ DISCONNECT") || "⛓ DISCONNECT") : (window.ECM_T?.("🔌 CONNECT ESP32") || "🔌 CONNECT ESP32");
    if (flashButton && !isFlashing) flashButton.innerHTML = `<span class="flash-icon">⚡</span><span>${window.ECM_T?.("FLASH ESP32") || "FLASH ESP32"}</span>`;
});

// ---------------- Firmware Guide ----------------
const guideState = { documents: [], selectedId: null, admin: false };
const guideEls = {};

function guideEscape(value = '') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function guideInit() {
    guideEls.status = document.getElementById('guideStatus');
    guideEls.adminButton = document.getElementById('guideAdminButton');
    guideEls.adminPanel = document.getElementById('guideAdminPanel');
    guideEls.title = document.getElementById('guideTitleInput');
    guideEls.category = document.getElementById('guideCategoryInput');
    guideEls.file = document.getElementById('guideFileInput');
    guideEls.upload = document.getElementById('guideUploadButton');
    guideEls.delete = document.getElementById('guideDeleteButton');
    guideEls.list = document.getElementById('guideList');
    guideEls.viewer = document.getElementById('guideViewer');
    if (!guideEls.adminButton) return;
    guideEls.adminButton.addEventListener('click', guideLoginOrLogout);
    guideEls.upload.addEventListener('click', guideUpload);
    guideEls.delete.addEventListener('click', guideDelete);
    guideLoad();
}

async function guideLoad() {
    try {
        const r = await fetch('/api/guides', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('Guide API unavailable');
        guideState.documents = await r.json();
        guideRenderList();
        guideUpdateStatus();
    } catch (e) {
        guideEls.list.innerHTML = '<div class="guide-empty">Firmware Guide is not connected to the server yet.</div>';
    }
}

function guideUpdateStatus() {
    guideEls.status.textContent = guideState.admin ? 'ADMIN • UPLOAD / REPLACE / DELETE' : 'VIEW-ONLY • PUBLIC';
    guideEls.adminButton.textContent = guideState.admin ? 'ADMIN LOGOUT' : 'ADMIN LOGIN';
    guideEls.adminPanel.classList.toggle('hidden', !guideState.admin);
}

async function guideLoginOrLogout() {
    if (guideState.admin) {
        await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
        guideState.admin = false;
        guideUpdateStatus();
        return;
    }
    const password = prompt('Admin password:');
    if (!password) return;
    const r = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ password })
    });
    if (!r.ok) { alert('Admin login failed.'); return; }
    guideState.admin = true;
    guideUpdateStatus();
    guideLoad();
}

function guideRenderList() {
    if (!guideState.documents.length) {
        guideEls.list.innerHTML = '<div class="guide-empty">No firmware guide uploaded yet.</div>';
        guideEls.viewer.innerHTML = '<div class="guide-empty">Admin can upload a PDF or Word document.</div>';
        return;
    }
    guideEls.list.innerHTML = guideState.documents.map(d => `
        <button class="guide-item ${d.id === guideState.selectedId ? 'active' : ''}" data-guide-id="${guideEscape(d.id)}" type="button">
            <strong>${guideEscape(d.title)}</strong>
            <span>${guideEscape(d.category || d.type.toUpperCase())}</span>
        </button>`).join('');
    guideEls.list.querySelectorAll('[data-guide-id]').forEach(btn => btn.addEventListener('click', () => guideSelect(btn.dataset.guideId)));
    if (!guideState.selectedId || !guideState.documents.some(d => d.id === guideState.selectedId)) guideSelect(guideState.documents[0].id);
}

async function guideSelect(id) {
    guideState.selectedId = id;
    guideRenderList();
    const doc = guideState.documents.find(d => d.id === id);
    if (!doc) return;
    if (doc.type === 'pdf') {
        guideEls.viewer.innerHTML = `<iframe class="guide-pdf" src="/api/guides/file?id=${encodeURIComponent(id)}" title="${guideEscape(doc.title)}"></iframe>`;
        return;
    }
    guideEls.viewer.innerHTML = '<div class="guide-empty">Loading Word document…</div>';
    try {
        if (!window.mammoth) {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script'); s.src = 'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js';
                s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
            });
        }
        const r = await fetch('/api/guides/file?id=' + encodeURIComponent(id), { credentials: 'same-origin' });
        if (!r.ok) throw new Error('Cannot load document');
        const buf = await r.arrayBuffer();
        const result = await window.mammoth.convertToHtml({ arrayBuffer: buf });
        guideEls.viewer.innerHTML = `<div class="guide-docx">${result.value}</div>`;
    } catch (e) {
        guideEls.viewer.innerHTML = '<div class="guide-empty">Unable to display this Word document.</div>';
    }
}

async function guideUpload() {
    const file = guideEls.file.files[0];
    if (!file) { alert('Please select a PDF or DOCX file.'); return; }
    if (!/\.(pdf|docx)$/i.test(file.name)) { alert('Only PDF and DOCX are supported.'); return; }
    const title = guideEls.title.value.trim() || file.name.replace(/\.(pdf|docx)$/i, '');
    const category = guideEls.category.value.trim();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = ''; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const data = btoa(binary);
    const r = await fetch('/api/admin/guides', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, filename: file.name, mime: file.type, data })
    });
    if (!r.ok) { alert(await r.text() || 'Upload failed.'); return; }
    guideEls.file.value = ''; guideEls.title.value = ''; guideEls.category.value = '';
    await guideLoad();
}

async function guideDelete() {
    if (!guideState.selectedId) return;
    if (!confirm('Delete the selected firmware guide?')) return;
    const r = await fetch('/api/admin/guides?id=' + encodeURIComponent(guideState.selectedId), { method: 'DELETE', credentials: 'same-origin' });
    if (!r.ok) { alert('Delete failed.'); return; }
    guideState.selectedId = null; await guideLoad();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guideInit); else guideInit();
