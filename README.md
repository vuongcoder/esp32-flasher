# ESP32 Flasher v1.2.6 + Firmware Guide Admin/User

This package keeps the v1.2.6 ESP32 Flasher flow and adds a server-backed Firmware Guide.

## Roles
- Public user: view Firmware Guide only.
- Admin: login, upload/replace, and delete PDF/DOCX documents.
- Admin password is stored only in the server environment variable `ADMIN_PASSWORD`.

## Run locally (Windows PowerShell)
```powershell
$env:ADMIN_PASSWORD="change-this-to-a-strong-password"
node server.js
```
Then open `http://localhost:3000`.

## Files
- `index.html` — v1.2.6 UI + Firmware Guide card
- `app.js` — ESP32 flasher + guide client
- `compact-ui.css` — existing UI + guide styles
- `server.js` — Node.js API, authentication and document storage
- `data/guides/` — uploaded PDF/DOCX files
- `data/guides.json` — guide metadata

## Notes
- No hosting provider is required by this starter architecture.
- For production, use HTTPS and a strong `ADMIN_PASSWORD`.
- Sessions are in memory, so restarting the Node process logs admins out. For a multi-instance production deployment, replace the in-memory session store with a shared session/database service.
- PDF is viewed inline. DOCX is converted in the browser with Mammoth from its public CDN; if you later want zero external CDN dependency, move DOCX conversion server-side.
- Maximum upload size is 25 MB.


## Chip database (easy device expansion)

Supported target devices are defined in `config/chips.js`. Add one object with `id`, `name`, `family`, `aliases`, and `enabled`. The DEVICES dropdown is generated automatically from this file, so you do not need to edit `index.html` for new boards.

Board variants such as ESP32-S3 Super Mini can share the `ESP32-S3` silicon family, keeping firmware compatibility family-based. Set `enabled: false` to hide a device without deleting its definition.

/-------------------------------------------------------------------
config/
├── chips.js       ← danh sách chip/board
└── firmware.js    ← danh sách Web Firmware

them chi: mo file chips.js de them chip


---------- them ban firmware vao he thong web ------
firmware/
└── esp32-c3-test.bin


config/firmware.js: co idinh dang nhu sau


{
    id: "esp32-c3-test",
    label: "ESP32-C3 Test Firmware",
    family: "ESP32-C3",
    file: "./firmware/esp32-c3-test.bin",
    mode: "auto",
    enabled: true
}


Tạm ẩn firmware

Không muốn xóa cấu hình:

enabled: false
