// ESP32 Flasher chip / board database.
// Add new devices here instead of editing index.html or app.js.
// `family` is the silicon family used for firmware compatibility.
// `aliases` are normalized names that esptool-js may report.

export const CHIP_DATABASE = [
    {
        id: "ESP32_S3",
        name: "ESP32-S3",
        family: "ESP32-S3",
        aliases: ["ESP32-S3", "ESP32S3"],
        enabled: true
    },
    {
        id: "ESP32_S3_SUPER_MINI",
        name: "ESP32-S3 Super Mini",
        family: "ESP32-S3",
        aliases: ["ESP32-S3", "ESP32S3"],
        enabled: true
    },
    {
        id: "ESP32",
        name: "ESP32",
        family: "ESP32",
        aliases: ["ESP32", "ESP32-D0WD", "ESP32-D0WD-V3", "ESP32-D2WD"],
        enabled: true
    },
    {
        id: "ESP32_C3",
        name: "ESP32-C3",
        family: "ESP32-C3",
        aliases: ["ESP32-C3", "ESP32C3"],
        enabled: true
    },
    {
        id: "ESP32_C3_MINI",
        name: "ESP32-C3 Mini",
        family: "ESP32-C3",
        aliases: ["ESP32-C3", "ESP32C3"],
        enabled: true
    },
    {
        id: "ESP32_S2",
        name: "ESP32-S2",
        family: "ESP32-S2",
        aliases: ["ESP32-S2", "ESP32S2"],
        enabled: true
    },
    {
        id: "ESP32_C2",
        name: "ESP32-C2",
        family: "ESP32-C2",
        aliases: ["ESP32-C2", "ESP32C2"],
        enabled: true
    },
    {
        id: "ESP32_C6",
        name: "ESP32-C6",
        family: "ESP32-C6",
        aliases: ["ESP32-C6", "ESP32C6"],
        enabled: true
    }
];
