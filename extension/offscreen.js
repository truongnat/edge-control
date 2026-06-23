// Runs inside the extension's offscreen document. Service workers (background.js)
// have no DOM/MediaRecorder, so tab-video capture happens here instead.

const DEFAULT_MAX_DURATION_MS = 120000;

/** @type {{
 *   recorder: MediaRecorder,
 *   stream: MediaStream,
 *   chunks: Blob[],
 *   audioCtx: AudioContext | null,
 *   startedAt: number,
 *   tabId: number,
 *   stopTimer: ReturnType<typeof setTimeout> | null,
 *   stopping: Promise<{ dataUrl: string, mimeType: string, bytes: number, durationMs: number }> | null,
 * } | null} */
let active = null;

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('failed to read recording blob'));
    reader.readAsDataURL(blob);
  });
}

async function startRecording({ streamId, tabId, audio, maxDurationMs }) {
  if (active) {
    throw new Error('a recording is already in progress');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audio
      ? { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }
      : false,
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  });

  // Keep the capture alive and, if audio was captured, route it back to
  // the speakers so the tab isn't silently muted while recording.
  const preview = document.getElementById('preview');
  preview.srcObject = stream;
  await preview.play().catch(() => {});

  let audioCtx = null;
  if (audio && stream.getAudioTracks().length > 0) {
    audioCtx = new AudioContext();
    audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);
  }

  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  active = {
    recorder,
    stream,
    chunks,
    audioCtx,
    startedAt: Date.now(),
    tabId,
    stopTimer: null,
    stopping: null,
  };

  const limit = Math.max(1000, Number(maxDurationMs) || DEFAULT_MAX_DURATION_MS);
  active.stopTimer = setTimeout(() => {
    stopRecording().catch(() => {});
  }, limit);

  return { recording: true, tabId, startedAt: active.startedAt, maxDurationMs: limit };
}

async function stopRecording() {
  if (!active) {
    throw new Error('no recording in progress');
  }
  if (active.stopping) return active.stopping;

  const session = active;
  session.stopping = new Promise((resolve, reject) => {
    if (session.stopTimer) clearTimeout(session.stopTimer);

    session.recorder.onstop = async () => {
      try {
        const blob = new Blob(session.chunks, { type: session.recorder.mimeType || 'video/webm' });
        const dataUrl = await blobToDataUrl(blob);
        resolve({
          dataUrl,
          mimeType: blob.type,
          bytes: blob.size,
          durationMs: Date.now() - session.startedAt,
        });
      } catch (err) {
        reject(err);
      } finally {
        session.stream.getTracks().forEach((track) => track.stop());
        if (session.audioCtx) session.audioCtx.close().catch(() => {});
        const preview = document.getElementById('preview');
        preview.srcObject = null;
        if (active === session) active = null;
      }
    };

    if (session.recorder.state === 'inactive') {
      session.recorder.onstop();
    } else {
      session.recorder.stop();
    }
  });

  return session.stopping;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('offscreen:')) return false;

  (async () => {
    if (msg.type === 'offscreen:startRecording') {
      return startRecording(msg);
    }
    if (msg.type === 'offscreen:stopRecording') {
      return stopRecording();
    }
    throw new Error(`unknown offscreen message: ${msg.type}`);
  })()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));

  return true;
});
