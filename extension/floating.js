// Isolated, top-frame UI. The page cannot read the extension iframe's storage or API key.
(() => {
  if (window !== window.top) return;
  const sandbox = /^(www\.)?sandbox\.paypal\.com$/.test(location.hostname);
  const demo = Boolean(globalThis.RewardHarborConfig?.storeOrigin(location.href) || ['localhost', '127.0.0.1'].includes(location.hostname));
  if (!sandbox && !demo) return;
  let host, observer, routeTimer, lastState, opened = false;
  function stop() { observer?.disconnect(); clearInterval(routeTimer); host?.remove(); }
  function update() {
    try { if (!chrome.runtime?.id) return stop(); } catch { return stop(); }
    // PayPal can replace login with checkout without loading a new document.
    const snapshot = sandbox ? globalThis.rewardSnapshot?.() : null;
    const checkout = sandbox && (/^\/.*checkout/i.test(location.pathname) || Boolean(snapshot?.checkoutOrderId && snapshot?.cards?.length));
    let payment;
    try { payment = JSON.parse(document.documentElement.dataset.rewardPayment || 'null'); } catch {}
    if (!checkout && !payment) return;
    if (!host) mount();
    else if (!host.isConnected) document.documentElement.append(host);
    const state = checkout ? `checkout:${snapshot?.checkoutOrderId || location.pathname}` : `${payment.orderId}:${payment.state}`;
    if (state !== lastState) {
      lastState = state;
      // Keep the merchant overlay closed while PayPal owns focus; reopen on capture.
      if (checkout || payment?.state === 'completed') setOpen(true);
    }
  }
  let frame, toggle, shell, resizeHandle, manualSize, panelMode;
  function fitSize(width, height) {
    shell.style.width = `${Math.max(Math.min(260, innerWidth - 32), Math.min(width, innerWidth - 32))}px`;
    const available = Math.max(72, innerHeight - (host.style.top === '64px' ? 132 : 92));
    shell.style.height = `${Math.max(Math.min(120, available), Math.min(height, available))}px`;
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== chrome.runtime.getURL('').replace(/\/$/, '')) return;
    if (event.data?.type !== 'REWARD_HARBOR_SIZE' || !Number.isFinite(event.data.height)) return;
    const mode = event.data.mode || (event.data.compact ? 'compact' : 'comparison');
    if (mode !== panelMode) manualSize = null;
    panelMode = mode;
    host.style.top = sandbox && event.data.compact ? '64px' : 'auto';
    host.style.bottom = sandbox && event.data.compact ? 'auto' : '16px';
    resizeHandle.hidden = mode !== 'comparison';
    if (manualSize && mode === 'comparison') fitSize(manualSize.width, manualSize.height);
    else {
      shell.style.height = `min(${Math.max(72, event.data.height)}px, calc(100dvh - ${sandbox && event.data.compact ? 132 : 92}px))`;
    }
  });
  function setOpen(value) {
    opened = value; shell.hidden = !value; frame.hidden = !value;
    toggle.replaceChildren();
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', value ? 'M6 6l12 12M18 6L6 18' : 'M6 18L18 6M6 6h12v12');
    icon.append(path); toggle.append(icon);
    toggle.setAttribute('aria-expanded', String(value));
    toggle.setAttribute('aria-label', value ? 'Close Reward Harbor' : 'Open Reward Harbor');
  }
  function mount() {
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `:host{color-scheme:dark}button{display:grid;place-items:center;padding:0;line-height:1;margin-left:auto;width:44px;height:44px;border:1px solid #a99bff;border-radius:50%;background:#6554df;color:white;font:26px system-ui;cursor:pointer;box-shadow:0 6px 24px #0005}button svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}button:focus-visible{outline:2px solid #ac9dff;outline-offset:3px}iframe{display:block;width:min(340px,calc(100vw - 32px));height:min(510px,calc(100dvh - 100px));border:1px solid #7465f5;border-radius:16px;margin-bottom:12px;background:#101421;box-shadow:0 16px 64px #0007}iframe[hidden]{display:none}`;
    style.textContent += `.shell{position:relative;box-sizing:border-box;width:min(340px,calc(100vw - 32px));height:min(510px,calc(100dvh - 92px));max-width:calc(100vw - 32px);max-height:calc(100dvh - 92px);border:1px solid #7465f5;border-radius:16px;overflow:hidden;margin-bottom:12px;background:#101421;box-shadow:0 16px 64px #0007}.shell iframe{width:100%;height:100%;border:0;border-radius:0;margin:0;box-shadow:none}.resize-handle{position:absolute;left:0;top:0;width:18px;height:18px;border:0;border-radius:0;background:#232b44;color:#ac9dff;box-shadow:none;cursor:nwse-resize;touch-action:none}.resize-handle svg{width:16px;height:16px}button{box-sizing:border-box}.launcher{position:relative;display:block;font-size:0;line-height:0;text-align:center}.launcher svg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;margin:0;width:22px;height:22px;pointer-events:none}button svg{flex:none}[hidden]{display:none!important}`;
    shell = document.createElement('div'); shell.className = 'shell';
    frame = document.createElement('iframe'); frame.hidden = true;
    frame.src = chrome.runtime.getURL('panel.html') + (sandbox ? '?compact=1' : ''); frame.title = 'Reward Harbor card rewards advisor';
    toggle = document.createElement('button'); toggle.className = 'launcher'; toggle.type = 'button'; toggle.textContent = '↗';
    toggle.addEventListener('click', () => setOpen(!opened));
    resizeHandle = document.createElement('button'); resizeHandle.className = 'resize-handle';
    resizeHandle.type = 'button'; resizeHandle.setAttribute('aria-label', 'Resize advisor');
    resizeHandle.title = 'Drag to resize, or use arrow keys';
    const grip = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    grip.setAttribute('viewBox', '0 0 24 24'); grip.setAttribute('aria-hidden', 'true');
    const strokes = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    strokes.setAttribute('d', 'M5 10l9 9M5 16l3 3M5 4l15 15'); grip.append(strokes); resizeHandle.append(grip);
    let drag;
    resizeHandle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const bounds = shell.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height };
      resizeHandle.setPointerCapture(event.pointerId); frame.style.pointerEvents = 'none'; event.preventDefault();
    });
    resizeHandle.addEventListener('pointermove', event => {
      if (!drag) return;
      manualSize = { width: drag.width + drag.x - event.clientX, height: drag.height + drag.y - event.clientY };
      fitSize(manualSize.width, manualSize.height);
    });
    function endResize() { drag = null; frame.style.pointerEvents = ''; }
    resizeHandle.addEventListener('pointerup', endResize);
    resizeHandle.addEventListener('pointercancel', endResize);
    resizeHandle.addEventListener('lostpointercapture', endResize);
    resizeHandle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); const bounds = shell.getBoundingClientRect();
      manualSize = { width: bounds.width + (event.key === 'ArrowLeft' ? 20 : event.key === 'ArrowRight' ? -20 : 0), height: bounds.height + (event.key === 'ArrowUp' ? 20 : event.key === 'ArrowDown' ? -20 : 0) };
      fitSize(manualSize.width, manualSize.height);
    });
    shell.append(frame, resizeHandle);
    root.append(style, shell, toggle); document.documentElement.append(host);
    setOpen(false);
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'TOGGLE_ADVISOR') { if (!host) mount(); setOpen(!opened); }
  });
  observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reward-payment'] });
  // A short route check also covers history.replaceState, which has no browser event.
  routeTimer = setInterval(update, 750);
  window.addEventListener('popstate', update);
  window.addEventListener('resize', () => {
    if (shell && manualSize) fitSize(manualSize.width, manualSize.height);
  });
  window.addEventListener('pageshow', update);
  window.addEventListener('pagehide', event => { if (!event.persisted) stop(); });
  update();
})();
