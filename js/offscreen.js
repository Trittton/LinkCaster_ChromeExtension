// Offscreen document (FR-4): loads Google Drive's embed player invisibly so
// uploaded videos get the "someone tried to watch this" signal that nudges
// Google's processing queue — even after the popup closes.
// Created and closed by background.js.

const WARMUP_DURATION_MS = 45000;
let activeWarmups = 0;

chrome.runtime.onMessage.addListener((request) => {
  if (!request || request.action !== 'offscreenDriveWarmup' || !request.fileId) return;
  if (!/^[\w-]+$/.test(request.fileId)) return;

  const iframe = document.createElement('iframe');
  iframe.src = `https://drive.google.com/file/d/${request.fileId}/preview`;
  iframe.style.cssText = 'width:640px;height:360px;opacity:0;position:absolute;left:-9999px;border:0;';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);
  activeWarmups++;
  console.log('[Offscreen] Warm-up player loaded for', request.fileId);

  setTimeout(() => {
    iframe.remove();
    activeWarmups--;
    if (activeWarmups === 0) {
      // Tell the background worker we're idle so it can close this document.
      try {
        chrome.runtime.sendMessage({ action: 'offscreenWarmupIdle' }).catch(() => {});
      } catch { /* background gone — document will be cleaned up on restart */ }
    }
  }, WARMUP_DURATION_MS);
});
