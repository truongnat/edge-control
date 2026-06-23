# edge-control

Cho Claude Code điều khiển **Edge thật, đang chạy, đã đăng nhập** của bạn (navigate, snapshot, click/fill/scroll, screenshot, đo perf) mà không cần `--remote-debugging-port`.

## Kiến trúc

```
CLI / MCP  --HTTP + token-->  bridge.js (127.0.0.1)  --WebSocket + token-->  background.js
                                                                    |
                                                        chrome.tabs.sendMessage
                                                                    |
                                                                    v
                                                    content-isolated.js  <--  content-main.js
```

- `extension/` — Edge extension (Manifest V3), load **unpacked** vào Edge thật.
- `server/bridge.js` — HTTP API + WebSocket cho extension.
- `cli.js` — CLI gọi lệnh qua bridge.
- `mcp/server.js` — MCP server cho Cursor/Claude Code (stdio).

## Cài đặt

```bash
cd tools/edge-control
npm install
```

## 1. Chạy bridge

```bash
npm start
# [edge-control] bridge listening on http://127.0.0.1:8765
# [edge-control] token: ...
# [edge-control] extension bridge URL: ws://127.0.0.1:8765/ext?token=...
```

Đổi cổng: `EDGE_CONTROL_PORT=9000 npm start`

Bridge tự tạo/lưu token ở `.edge-control/token`; CLI/MCP tự đọc file này khi không có `EDGE_CONTROL_TOKEN`.
Nếu muốn tự đặt token ổn định:

```bash
EDGE_CONTROL_TOKEN=your-long-random-token npm start
EDGE_CONTROL_TOKEN=your-long-random-token node cli.js ping
```

## 2. Load extension vào Edge

1. Mở `edge://extensions` → bật **Developer mode**.
2. **Load unpacked** → chọn `tools/edge-control/extension`.
3. Popup extension → dán **extension bridge URL** có `?token=...` từ `npm start` → **Save & reconnect** → trạng thái **connected**.
4. **F5** các tab cần điều khiển (content script chỉ inject sau khi extension active).

## 3. CLI

```bash
node cli.js ping
node cli.js snapshot --compact
node cli.js exists --selector "button[aria-label='save']"
node cli.js click --selector "button[aria-label='save']"
node cli.js waitForSelector --selector "#app" --state visible
node cli.js batch --file steps.json
```

### Global flags

| Flag | Mô tả |
|------|--------|
| `--timeoutMs <n>` | Timeout lệnh |
| `--retries <n>` | Retry khi lỗi tạm thời |
| `--compact` | JSON một dòng (tiết kiệm token) |

### Exit codes

| Code | Ý nghĩa |
|------|---------|
| 1 | Bridge không chạy |
| 2 | Extension chưa kết nối |
| 3 | Lỗi lệnh |
| 4 | Timeout |

## 4. MCP (Cursor / Claude Code)

Workspace config: [`.cursor/mcp.json`](.cursor/mcp.json) (auto-loaded when this folder is the Cursor workspace).

Or add globally to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "edge-control": {
      "command": "node",
      "args": ["C:/Users/you/Documents/tools/edge-control/mcp/server.js"],
      "env": {
        "EDGE_CONTROL_PORT": "8765",
        "EDGE_CONTROL_MCP_COMPACT": "1"
      }
    }
  }
}
```

**Prerequisites:** `npm start` (bridge) + Edge extension connected.

Run MCP manually: `npm run mcp` (stdio).

### MCP tools

| Tool | Mô tả |
|------|--------|
| `edge_health` / `edge_ping` | Preflight + ping |
| `edge_snapshot` | **Ưu tiên** — tree + `ref` ids (`e0`, `e1`...) |
| `edge_click` / `edge_fill` | Dùng `ref` từ snapshot hoặc selector |
| `edge_clear` / `edge_focus` | Clear input, focus |
| `edge_double_click` / `edge_right_click` | Double-click, context menu |
| `edge_is_enabled` / `edge_get_computed_style` | Trạng thái + CSS |
| `edge_read_console` | Console log/warn/error của trang |
| `edge_reload_tab` | F5 tab |
| `edge_wait_for` | attached/visible/**hidden**/detached hoặc text |
| `edge_get_viewport` / `edge_set_viewport` | Đọc/chỉnh viewport + zoom |
| `edge_element_info` | Geometry/state chi tiết của 1 element |
| `edge_click_at` / mouse / wheel / drag | Coordinate controls, optional `inputMode: "debugger"` |
| `edge_list_frames` | Liệt kê iframe và lấy `frameId` để target |
| `edge_start_network_monitor` / `edge_stop_network_monitor` | Bật/tắt CDP Network monitor |
| `edge_read_network_log` | Đọc CDP Network events + fetch/XHR/resource timing |
| `edge_upload_file` | Set file input qua debugger |
| `edge_list_downloads` / `edge_wait_for_download` | Theo dõi downloads |
| `edge_start_recording` / `edge_stop_recording` | Quay video tab (webm) làm evidence, lưu `.edge-control/recordings/` |
| `edge_get_allowlist` / `edge_set_allowlist` | Giới hạn host được điều khiển |
| `edge_exists` / `edge_query` | Đọc nhẹ |
| `edge_navigate` / tabs / scroll / batch / screenshot / perf | Như trước |

### MCP resources

| URI | Nội dung |
|-----|----------|
| `edge-control://health` | JSON trạng thái bridge |
| `edge-control://playbook` | Markdown hướng dẫn agent |

### Env vars (MCP)

| Var | Default | Mô tả |
|-----|---------|--------|
| `EDGE_CONTROL_PORT` | 8765 | Bridge port |
| `EDGE_CONTROL_TOKEN` | `.edge-control/token` | Optional override for shared token required by `/cmd` and `/ext` |
| `EDGE_CONTROL_MCP_COMPACT` | off | JSON một dòng |
| `EDGE_CONTROL_MCP_RETRIES` | 1 | Retry transient errors |
| `EDGE_CONTROL_SCREENSHOT_DIR` | `.edge-control/screenshots` | Thư mục screenshot |
| `EDGE_CONTROL_RECORDING_DIR` | `.edge-control/recordings` | Thư mục video evidence |

## Agent playbook (tiết kiệm token)

1. `snapshot` hoặc `exists` — hiểu trang trước khi click
2. `waitForSelector` — tránh loop retry thủ công
3. `click` / `fill` — tương tác
4. `readPerfProbe` — đo perf khi cần
5. Chỉ dùng `getHtml` khi cần raw markup; mặc định bị truncate 16 KB

## Bộ lệnh

| action | params chính | mô tả |
|--------|--------------|--------|
| `ping` | — | kiểm tra kết nối |
| `listTabs` | — | danh sách tab |
| `navigate` | `url`, `tabId?` | điều hướng + chờ load |
| `snapshot` | `selector?`, `maxNodes?` | cây accessibility gọn |
| `exists` | `selector` | đếm element + visible |
| `query` | `selector`, `field` | đọc 1 field (text/value/ariaLabel) |
| `getText` | `selector`, `maxItems?` | text nhiều element (có giới hạn) |
| `getHtml` | `selector?`, `maxChars?` | HTML (truncate mặc định 16 KB) |
| `click` / `fill` / `scroll` | `selector`, ... | tương tác DOM |
| `clickAt` / `mouseMove` / `mouseDown` / `mouseUp` | `x`, `y`, `inputMode?` | coordinate input |
| `wheel` | `x?`, `y?`, `deltaX?`, `deltaY?` | scroll/wheel |
| `drag` | `selector/ref` hoặc `fromX/fromY`, `toX`, `toY` | drag synthetic/debugger |
| `listFrames` | `tabId?` | lấy `frameId` cho iframe |
| `reloadTab` | `tabId?` | F5 tab + chờ load |
| `click` / `fill` / ... | `selector` **hoặc** `ref` | `ref` từ snapshot (`e0`, `e1`...) |
| `doubleClick` / `rightClick` | `selector` hoặc `ref` | |
| `clear` / `focus` | `selector` hoặc `ref` | |
| `isEnabled` | `selector` hoặc `ref` | disabled/readOnly |
| `getComputedStyle` | `selector` hoặc `ref`, `properties?` | CSS computed |
| `readConsole` | `maxMessages?` | console buffer từ trang |
| `waitForSelector` | `state`: attached/visible/**hidden**/detached | |
| `waitForText` | `text`, `selector?` | chờ text |
| `press` / `hover` / `selectOption` | ... | bàn phím, hover, select |
| `screenshot` | `tabId?`, `--out` | chụp màn hình |
| `readPerfProbe` | `tabId?` | canvas + heap |
| `batch` | `steps[]` | nhiều lệnh tuần tự |
| `getUrl` / `getTitle` | `tabId?` | metadata tab nhẹ |
| `getViewport` / `setViewport` | `width?`, `height?`, `zoom?` | responsive layout + zoom |
| `elementInfo` | `selector` hoặc `ref` | box/visible/enabled/text/value/CSS cơ bản |
| `readNetworkLog` | `maxMessages?` | fetch/XHR + resource timing |
| `startNetworkMonitor` / `stopNetworkMonitor` | `maxEvents?` | full CDP Network monitor |
| `uploadFile` | `selector`, `files[]` | set `<input type=file>` qua debugger |
| `listDownloads` / `waitForDownload` | filters | download metadata |
| `getAllowlist` / `setAllowlist` | `allowedHosts[]` | host allowlist |
| `startRecording` | `tabId?`, `audio?`, `maxDurationMs?` | bắt đầu quay video tab (webm), tự dừng sau `maxDurationMs` (default 120000ms) |
| `stopRecording` | `filename?` | dừng quay, trả base64 `dataUrl`; qua MCP sẽ tự ghi file và trả path |

## Error codes

| Code | HTTP | Gợi ý |
|------|------|-------|
| `EXTENSION_DISCONNECTED` | 503 | Mở popup extension, reconnect |
| `CONTENT_SCRIPT_NOT_LOADED` | 422 | F5 tab |
| `ELEMENT_NOT_FOUND` | 422 | Chạy `snapshot` / `exists` trước |
| `TIMEOUT` | 408 | Tăng `--timeoutMs` |
| `INVALID_PARAMS` | 400 | Kiểm tra tham số bắt buộc |
| `RECORDING_IN_PROGRESS` | 409 | Gọi `stopRecording` trước khi `startRecording` lại |
| `NOT_RECORDING` | 422 | Chưa có recording nào đang chạy để `stopRecording` |

## Test

```bash
npm test
npm run check
```

## Token-cost guidance

| Cách đọc | Kích thước điển hình |
|----------|---------------------|
| `snapshot` | 2–5 KB |
| `exists` | ~50 B |
| `getHtml` (truncate) | ≤16 KB |
| `getHtml` (full, cũ) | 100 KB–2 MB |
| `screenshot` qua MCP | metadata only |

## Lưu ý an toàn

- Bridge chỉ bind `127.0.0.1` — không expose ra LAN.
- Bridge yêu cầu token cho `/cmd`, `/cmd/batch`, và `/ext`; HTTP/WS từ web origins bị chặn.
- Extension dùng quyền `debugger` cho optional coordinate/key input qua CDP khi `inputMode: "debugger"`.
- `startNetworkMonitor` giữ debugger attached vào tab cho đến khi `stopNetworkMonitor` hoặc tab đóng.
- Popup có allowlist host optional; để trống nghĩa là cho phép tất cả host.
- `startRecording` dùng quyền `tabCapture` + `offscreen` để quay tab thành webm; mặc định không quay audio (tab vẫn phát âm thanh bình thường). Bật `audio: true` nếu cần — khi đó âm thanh tab sẽ được route qua extension để vẫn nghe được trong lúc quay.
- Chỉ quay được 1 tab/1 lần; recording tự dừng sau `maxDurationMs` (default 120s) để tránh payload quá lớn.
- Tắt bridge hoặc unload extension khi không dùng.
# edge-control
