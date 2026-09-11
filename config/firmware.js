// ESP32 Flasher Web Firmware database.
// Add, remove, or disable built-in Web Firmware here.
//
// Fields:
//   id          unique internal id
//   label       text shown in the Web Firmware dropdown
//   family      ESP chip family required by this firmware
//   file        path to the .bin file relative to index.html
//   mode        "auto" = normal image analysis, "full" = full/merged image
//   enabled     false hides the entry without deleting its configuration
//   placeholder true shows a reserved disabled entry (optional)
//   description optional helper text

export const WEB_FIRMWARE_DATABASE = [
    {
        id: "obi-makita-bms-rest",
        label: "OBI-Makita-BMS-Rest: ESP32",
        family: "ESP32",
        file: "./firmware/obi-makita-bms-rest.bin",
        mode: "auto",
        enabled: true
    },
    {
        id: "ckp-engineer-canbus-simul",
        label: "CKP-Enginer-CanBus-Simul- ESP32-D0WD-V3",
        family: "ESP32",
        file: "./firmware/ckp-engineer-canbus-simul.bin",
        mode: "full",
        enabled: true
    },
    {
        id: "custom-firmware-03",
        label: "CUSTOM FIRMWARE 03",
        family: null,
        file: null,
        mode: "auto",
        enabled: true,
        placeholder: true,
        description: "Reserved for future firmware"
    }
];
