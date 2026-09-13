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

## Web Firmware Database

Built-in Web Firmware entries are now managed in:

`config/firmware.js`

To add a firmware, add one object:

```js
{
    id: "my-firmware",
    label: "My Firmware: ESP32-S3",
    family: "ESP32-S3",
    file: "./firmware/my-firmware.bin",
    mode: "auto",
    enabled: true
}
```

Put the matching `.bin` file in the `firmware/` folder. The firmware will appear automatically in the Web Firmware dropdown for compatible chip families.

To temporarily hide a firmware without deleting its configuration, use:

```js
enabled: false
```

To remove it completely, delete its object from `config/firmware.js`.

`family` must match the chip family used by the Chip Database, for example `ESP32`, `ESP32-S3`, `ESP32-C3`, `ESP32-C6`, etc.

`mode`:
- `auto`: normal firmware image analysis.
- `full`: merged/full-image workflow used by the existing CKP backup preset.

Selecting Web Firmware only prepares it. The actual flash still starts only when the main `FLASH ESP32` button is pressed.


## Persistent Visitor Counter
The footer now shows **TOTAL VISITS**. Each page load increments the counter through `GET /api/visits`. The value is persisted in `data/visitors.json`, so it survives normal server restarts as long as the host keeps the filesystem persistent.

Example `data/visitors.json`:
```json
{
  "count": 1234
}
```
This is a visit counter, not a unique-user counter: refreshing/reopening the page counts another visit.
