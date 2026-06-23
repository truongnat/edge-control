import {
  bridgeCmd,
  bridgeBatch,
  bridgeHealth,
  bridgeScreenshotToFile,
  bridgeStopRecordingToFile,
  formatToolResult,
} from './bridge-client.js';

/**
 * @param {string} name
 * @param {Record<string, unknown>} args
 */
export async function handleToolCall(name, args = {}) {
  let result;

  switch (name) {
    case 'edge_health':
      result = await bridgeHealth();
      break;

    case 'edge_ping':
      result = await bridgeCmd('ping');
      break;

    case 'edge_list_tabs':
      result = await bridgeCmd('listTabs');
      break;

    case 'edge_list_frames':
      result = await bridgeCmd('listFrames', { tabId: args.tabId });
      break;

    case 'edge_get_allowlist':
      result = await bridgeCmd('getAllowlist');
      break;

    case 'edge_set_allowlist':
      result = await bridgeCmd('setAllowlist', { allowedHosts: args.allowedHosts });
      break;

    case 'edge_activate_tab':
      result = await bridgeCmd('activateTab', { tabId: args.tabId });
      break;        

    case 'edge_new_tab':
      result = await bridgeCmd('newTab', {
        url: args.url,
        active: args.active,
        timeoutMs: args.timeoutMs,
      });
      break;

    case 'edge_close_tab':
      result = await bridgeCmd('closeTab', { tabId: args.tabId });
      break;

    case 'edge_navigate':
      result = await bridgeCmd(
        'navigate',
        { url: args.url, tabId: args.tabId, timeoutMs: args.timeoutMs },
        args.timeoutMs,
      );
      break;

    case 'edge_reload_tab':
      result = await bridgeCmd('reloadTab', { tabId: args.tabId, timeoutMs: args.timeoutMs });
      break;

    case 'edge_list_downloads':
      result = await bridgeCmd('listDownloads', {
        limit: args.limit,
        state: args.state,
        filenameRegex: args.filenameRegex,
        urlRegex: args.urlRegex,
      });
      break;

    case 'edge_wait_for_download':
      result = await bridgeCmd(
        'waitForDownload',
        {
          filenameIncludes: args.filenameIncludes,
          urlIncludes: args.urlIncludes,
          startedAfter: args.startedAfter,
          timeoutMs: args.timeoutMs,
        },
        args.timeoutMs,
      );
      break;

    case 'edge_get_url':
      result = await bridgeCmd('getUrl', { tabId: args.tabId });
      break;

    case 'edge_get_title':
      result = await bridgeCmd('getTitle', { tabId: args.tabId });
      break;

    case 'edge_get_viewport':
      result = await bridgeCmd('getViewport', { tabId: args.tabId });
      break;

    case 'edge_set_viewport':
      result = await bridgeCmd('setViewport', {
        tabId: args.tabId,
        width: args.width,
        height: args.height,
        zoom: args.zoom,
      });
      break;

    case 'edge_snapshot':
      result = await bridgeCmd('snapshot', {
        selector: args.selector,
        tabId: args.tabId,
        maxNodes: args.maxNodes,
        depth: args.depth,
        interactiveOnly: args.interactiveOnly,
        includeBox: args.includeBox,
      });
      break;

    case 'edge_exists':
      result = await bridgeCmd('exists', { selector: args.selector, tabId: args.tabId });
      break;

    case 'edge_query':
      result = await bridgeCmd('query', {
        selector: args.selector,
        ref: args.ref,
        field: args.field,
        tabId: args.tabId,
        index: args.index,
      });
      break;

    case 'edge_get_attribute':
      result = await bridgeCmd('getAttribute', {
        selector: args.selector,
        ref: args.ref,
        attribute: args.attribute,
        tabId: args.tabId,
        index: args.index,
      });
      break;

    case 'edge_element_info':
      result = await bridgeCmd('elementInfo', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        index: args.index,
      });
      break;

    case 'edge_get_text':
      result = await bridgeCmd('getText', {
        selector: args.selector,
        tabId: args.tabId,
        maxItems: args.maxItems,
        maxCharsPerItem: args.maxCharsPerItem,
      });
      break;

    case 'edge_get_html':
      result = await bridgeCmd('getHtml', {
        selector: args.selector,
        tabId: args.tabId,
        maxChars: args.maxChars,
      });
      break;

    case 'edge_click':
      result = await bridgeCmd('click', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        frameId: args.frameId,
        index: args.index,
      });
      break;

    case 'edge_click_at':
      result = await bridgeCmd('clickAt', {
        x: args.x,
        y: args.y,
        button: args.button,
        tabId: args.tabId,
        frameId: args.frameId,
        inputMode: args.inputMode,
      });
      break;

    case 'edge_mouse_move':
      result = await bridgeCmd('mouseMove', {
        x: args.x,
        y: args.y,
        tabId: args.tabId,
        frameId: args.frameId,
        inputMode: args.inputMode,
      });
      break;

    case 'edge_mouse_down':
      result = await bridgeCmd('mouseDown', {
        x: args.x,
        y: args.y,
        button: args.button,
        tabId: args.tabId,
        frameId: args.frameId,
        inputMode: args.inputMode,
      });
      break;

    case 'edge_mouse_up':
      result = await bridgeCmd('mouseUp', {
        x: args.x,
        y: args.y,
        button: args.button,
        tabId: args.tabId,
        frameId: args.frameId,
        inputMode: args.inputMode,
      });
      break;

    case 'edge_fill':
      result = await bridgeCmd('fill', {
        selector: args.selector,
        ref: args.ref,
        value: args.value,
        tabId: args.tabId,
        frameId: args.frameId,
      });
      break;

    case 'edge_upload_file':
      result = await bridgeCmd('uploadFile', {
        selector: args.selector,
        files: args.files,
        tabId: args.tabId,
      });
      break;

    case 'edge_clear':
      result = await bridgeCmd('clear', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        frameId: args.frameId,
      });
      break;

    case 'edge_focus':
      result = await bridgeCmd('focus', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        frameId: args.frameId,
      });
      break;

    case 'edge_double_click':
      result = await bridgeCmd('doubleClick', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        frameId: args.frameId,
      });
      break;

    case 'edge_right_click':
      result = await bridgeCmd('rightClick', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        frameId: args.frameId,
      });
      break;

    case 'edge_scroll':
      result = await bridgeCmd('scroll', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        frameId: args.frameId,
        block: args.block,
        x: args.x,
        y: args.y,
      });
      break;

    case 'edge_wheel':
      result = await bridgeCmd('wheel', {
        x: args.x,
        y: args.y,
        deltaX: args.deltaX,
        deltaY: args.deltaY,
        nativeScroll: args.nativeScroll,
        tabId: args.tabId,
        frameId: args.frameId,
        inputMode: args.inputMode,
      });
      break;

    case 'edge_drag':
      result = await bridgeCmd('drag', {
        selector: args.selector,
        ref: args.ref,
        fromX: args.fromX,
        fromY: args.fromY,
        toX: args.toX,
        toY: args.toY,
        steps: args.steps,
        tabId: args.tabId,
        frameId: args.frameId,
        inputMode: args.inputMode,
      });
      break;

    case 'edge_hover':
      result = await bridgeCmd('hover', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        frameId: args.frameId,
        index: args.index,
      });
      break;

    case 'edge_press':
      result = await bridgeCmd('press', {
        key: args.key,
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
        frameId: args.frameId,
        inputMode: args.inputMode,
      });
      break;

    case 'edge_select_option':
      result = await bridgeCmd('selectOption', {
        selector: args.selector,
        ref: args.ref,
        value: args.value,
        label: args.label,
        tabId: args.tabId,
      });
      break;

    case 'edge_wait_for':
      if (args.text) {
        result = await bridgeCmd(
          'waitForText',
          {
            text: args.text,
            selector: args.selector,
            timeoutMs: args.timeoutMs,
            tabId: args.tabId,
          },
          args.timeoutMs,
        );
      } else if (args.selector) {
        result = await bridgeCmd(
          'waitForSelector',
          {
            selector: args.selector,
            state: args.state,
            timeoutMs: args.timeoutMs,
            tabId: args.tabId,
          },
          args.timeoutMs,
        );
      } else {
        throw new Error('edge_wait_for requires selector or text');
      }
      break;

    case 'edge_screenshot':
      result = await bridgeScreenshotToFile({
        tabId: args.tabId,
        format: args.format,
        filename: args.filename,
      });
      break;

    case 'edge_start_recording':
      result = await bridgeCmd('startRecording', {
        tabId: args.tabId,
        audio: args.audio,
        maxDurationMs: args.maxDurationMs,
      });
      break;

    case 'edge_stop_recording':
      result = await bridgeStopRecordingToFile({ filename: args.filename });
      break;

    case 'edge_read_perf_probe':
      result = await bridgeCmd('readPerfProbe', { tabId: args.tabId });
      break;

    case 'edge_is_enabled':
      result = await bridgeCmd('isEnabled', {
        selector: args.selector,
        ref: args.ref,
        tabId: args.tabId,
      });
      break;

    case 'edge_get_computed_style':
      result = await bridgeCmd('getComputedStyle', {
        selector: args.selector,
        ref: args.ref,
        properties: args.properties,
        tabId: args.tabId,
      });
      break;

    case 'edge_read_console':
      result = await bridgeCmd('readConsole', {
        tabId: args.tabId,
        maxMessages: args.maxMessages,
      });
      break;

    case 'edge_start_network_monitor':
      result = await bridgeCmd('startNetworkMonitor', {
        tabId: args.tabId,
        maxEvents: args.maxEvents,
        maxTotalBufferSize: args.maxTotalBufferSize,
        maxResourceBufferSize: args.maxResourceBufferSize,
      });
      break;

    case 'edge_stop_network_monitor':
      result = await bridgeCmd('stopNetworkMonitor', {
        tabId: args.tabId,
      });
      break;

    case 'edge_read_network_log':
      result = await bridgeCmd('readNetworkLog', {
        tabId: args.tabId,
        frameId: args.frameId,
        maxMessages: args.maxMessages,
      });
      break;

    case 'edge_batch':
      result = await bridgeBatch(args.steps, args.stopOnError !== false, args.timeoutMs);
      break;

    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return formatToolResult(result);
}
