/** @typedef {{ name: string, description: string, inputSchema: Record<string, unknown> }} McpTool */

/** @type {McpTool[]} */
export const TOOLS = [
  {
    name: 'edge_health',
    description: 'Check bridge + extension status before other tools. Fast preflight.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'edge_ping',
    description: 'Ping the extension via bridge (deeper than edge_health).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'edge_list_tabs',
    description: 'List open Edge tabs (id, url, title, active, windowId).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'edge_list_frames',
    description: 'List frames for a tab so actions can target iframes with frameId.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
    },
  },
  {
    name: 'edge_get_allowlist',
    description: 'Read extension host allowlist. Empty list means all hosts are allowed.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'edge_set_allowlist',
    description: 'Set extension host allowlist. Supports exact hosts and wildcard suffixes like *.example.com.',
    inputSchema: {
      type: 'object',
      properties: {
        allowedHosts: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string' },
          ],
        },
      },
      required: ['allowedHosts'],
    },
  },
  {
    name: 'edge_activate_tab',
    description: 'Focus a tab and its window.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
      required: ['tabId'],
    },
  },
  {
    name: 'edge_new_tab',
    description: 'Open a new tab with URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        active: { type: 'boolean', description: 'Default true' },
      },
      required: ['url'],
    },
  },
  {
    name: 'edge_close_tab',
    description: 'Close a tab by id.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
      required: ['tabId'],
    },
  },
  {
    name: 'edge_navigate',
    description: 'Navigate tab to URL and wait for load. Returns loaded/timedOut flags.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        tabId: { type: 'number' },
        timeoutMs: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'edge_get_url',
    description: 'Get current tab URL (tiny response, prefer over listTabs).',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
    },
  },
  {
    name: 'edge_get_title',
    description: 'Get current tab title (tiny response).',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
    },
  },
  {
    name: 'edge_get_viewport',
    description: 'Read viewport dimensions, scroll position, document size, and devicePixelRatio.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
    },
  },
  {
    name: 'edge_set_viewport',
    description: 'Resize the browser window and/or set tab zoom for responsive layout testing.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        zoom: { type: 'number', description: 'Tab zoom factor, e.g. 1 or 0.8' },
      },
    },
  },
  {
    name: 'edge_snapshot',
    description:
      'PRIMARY read tool. Compact accessibility tree with ref ids, roles, names. Prefer over getHtml — 10-100x fewer tokens. Workflow: snapshot → exists → click.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'Root selector (default: body)' },
        tabId: { type: 'number' },
        maxNodes: { type: 'number', description: 'Default 150' },
        depth: { type: 'number' },
        interactiveOnly: { type: 'boolean', description: 'Default true' },
        includeBox: { type: 'boolean', description: 'Include bounding boxes' },
      },
    },
  },
  {
    name: 'edge_exists',
    description: 'Check selector match count + visible count (~50 bytes). Use before click when unsure.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        tabId: { type: 'number' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'edge_query',
    description: 'Read one field from one element: text, value, ariaLabel, title. Cheaper than getText.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        field: { type: 'string', enum: ['text', 'value', 'ariaLabel', 'title', 'html'] },
        tabId: { type: 'number' },
        index: { type: 'number' },
      },
      required: ['field'],
    },
  },
  {
    name: 'edge_get_attribute',
    description: 'Read a single HTML attribute from an element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        attribute: { type: 'string' },
        tabId: { type: 'number' },
        index: { type: 'number' },
      },
      required: ['attribute'],
    },
  },
  {
    name: 'edge_element_info',
    description: 'Read one element geometry, visibility, enabled/readOnly state, key text/value, and core CSS.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
        index: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_get_text',
    description: 'Read text from all matching elements (capped). Use edge_query or edge_snapshot when possible.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        tabId: { type: 'number' },
        maxItems: { type: 'number' },
        maxCharsPerItem: { type: 'number' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'edge_get_html',
    description: 'Raw outerHTML (truncated to 16KB by default). LAST RESORT — use edge_snapshot first.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        tabId: { type: 'number' },
        maxChars: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_click',
    description: 'Click element by CSS selector or snapshot ref (e.g. ref from edge_snapshot). Prefer ref when available.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string', description: 'data-edge-ref from snapshot, e.g. e3' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        index: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_click_at',
    description: 'Click viewport coordinates. Use inputMode=debugger for CDP-backed input when needed.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', enum: ['left', 'middle', 'right'] },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        inputMode: { type: 'string', enum: ['synthetic', 'debugger'] },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'edge_mouse_move',
    description: 'Move mouse to viewport coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        inputMode: { type: 'string', enum: ['synthetic', 'debugger'] },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'edge_mouse_down',
    description: 'Mouse down at viewport coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', enum: ['left', 'middle', 'right'] },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        inputMode: { type: 'string', enum: ['synthetic', 'debugger'] },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'edge_mouse_up',
    description: 'Mouse up at viewport coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', enum: ['left', 'middle', 'right'] },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        inputMode: { type: 'string', enum: ['synthetic', 'debugger'] },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'edge_fill',
    description: 'Fill input, textarea, contenteditable, or toggle checkbox. Use selector or ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        value: { type: 'string' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
      },
      required: ['value'],
    },
  },
  {
    name: 'edge_upload_file',
    description: 'Set files on an input[type=file] using debugger DOM.setFileInputFiles.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        files: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string' },
          ],
        },
        tabId: { type: 'number' },
      },
      required: ['selector', 'files'],
    },
  },
  {
    name: 'edge_clear',
    description: 'Clear an input/textarea value by selector or ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_focus',
    description: 'Focus an element by selector or ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_double_click',
    description: 'Double-click element by selector or ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_right_click',
    description: 'Right-click (context menu) element by selector or ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_scroll',
    description: 'Scroll element into view, or scroll page with x/y.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        block: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_wheel',
    description: 'Dispatch wheel/scroll at viewport coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        deltaX: { type: 'number' },
        deltaY: { type: 'number' },
        nativeScroll: { type: 'boolean', description: 'Synthetic mode also calls window.scrollBy unless false' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        inputMode: { type: 'string', enum: ['synthetic', 'debugger'] },
      },
    },
  },
  {
    name: 'edge_drag',
    description: 'Drag from coordinates or element center to target coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        fromX: { type: 'number' },
        fromY: { type: 'number' },
        toX: { type: 'number' },
        toY: { type: 'number' },
        steps: { type: 'number' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        inputMode: { type: 'string', enum: ['synthetic', 'debugger'] },
      },
      required: ['toX', 'toY'],
    },
  },
  {
    name: 'edge_hover',
    description: 'Hover element (mouseenter) for tooltips/menus. Use selector or ref.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        index: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_press',
    description: 'Press keyboard key on element or focused element (Enter, Tab, ArrowDown, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Default Enter' },
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        inputMode: { type: 'string', enum: ['synthetic', 'debugger'] },
      },
    },
  },
  {
    name: 'edge_select_option',
    description: 'Select <select> option by value or label.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        value: { type: 'string' },
        label: { type: 'string' },
        tabId: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_wait_for',
    description: 'Wait for selector (attached/visible/hidden/detached) or text. Avoid manual retry loops.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        state: { type: 'string', enum: ['attached', 'visible', 'hidden', 'detached'] },
        timeoutMs: { type: 'number', description: 'Default 10000' },
        tabId: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_is_enabled',
    description: 'Check if element is enabled (not disabled).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        tabId: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_get_computed_style',
    description: 'Read computed CSS properties (default: display, visibility, opacity).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        ref: { type: 'string' },
        properties: { type: 'string', description: 'Comma-separated CSS properties' },
        tabId: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_read_console',
    description: 'Read recent console.log/warn/error from the page (captured in MAIN world).',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        maxMessages: { type: 'number', description: 'Default 50' },
      },
    },
  },
  {
    name: 'edge_read_network_log',
    description: 'Read CDP Network events when monitor is active, plus page fetch/XHR/resource timing.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        frameId: { type: 'number' },
        maxMessages: { type: 'number', description: 'Default 100' },
      },
    },
  },
  {
    name: 'edge_start_network_monitor',
    description: 'Start persistent chrome.debugger Network monitoring for a tab.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        maxEvents: { type: 'number', description: 'Default 500' },
        maxTotalBufferSize: { type: 'number' },
        maxResourceBufferSize: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_stop_network_monitor',
    description: 'Stop persistent chrome.debugger Network monitoring for a tab.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
    },
  },
  {
    name: 'edge_reload_tab',
    description: 'Reload tab and wait for load complete.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        timeoutMs: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_list_downloads',
    description: 'List recent browser downloads using chrome.downloads.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        state: { type: 'string', enum: ['in_progress', 'interrupted', 'complete'] },
        filenameRegex: { type: 'string' },
        urlRegex: { type: 'string' },
      },
    },
  },
  {
    name: 'edge_wait_for_download',
    description: 'Wait for a completed download matching filename/url filters.',
    inputSchema: {
      type: 'object',
      properties: {
        filenameIncludes: { type: 'string' },
        urlIncludes: { type: 'string' },
        startedAfter: { type: 'string', description: 'ISO timestamp' },
        timeoutMs: { type: 'number' },
      },
    },
  },
  {
    name: 'edge_screenshot',
    description: 'Capture tab screenshot, save to .edge-control/screenshots/, return file path (no base64).',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        format: { type: 'string', enum: ['png', 'jpeg'] },
        filename: { type: 'string' },
      },
    },
  },
  {
    name: 'edge_start_recording',
    description: 'Start recording tab video (webm) via tabCapture, as evidence for a flow. Only one recording at a time. Auto-stops after maxDurationMs (default 120000).',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        audio: { type: 'boolean', description: 'Include tab audio (default false).' },
        maxDurationMs: { type: 'number', description: 'Safety auto-stop limit in ms (default 120000).' },
      },
    },
  },
  {
    name: 'edge_stop_recording',
    description: 'Stop the active recording, save to .edge-control/recordings/, return file path (no base64).',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
      },
    },
  },
  {
    name: 'edge_read_perf_probe',
    description: 'Canvas toDataURL/getContext call counters + JS heap size.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
    },
  },
  {
    name: 'edge_batch',
    description: 'Run multiple bridge commands in one HTTP round-trip. Example: navigate → wait → snapshot → click.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              params: { type: 'object' },
            },
            required: ['action'],
          },
        },
        stopOnError: { type: 'boolean', description: 'Default true' },
        timeoutMs: { type: 'number' },
      },
      required: ['steps'],
    },
  },
];
