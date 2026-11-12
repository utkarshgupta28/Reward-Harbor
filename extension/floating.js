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
  let frame, toggle, shell, moveHandle, manualSize, panelMode, titlebar, minimizeButton, closeButton;
  const resizeEdges = [];
  let position = { right: 16, bottom: 16 };
  function positionAdvisor() {
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    position.right = Math.max(8, Math.min(position.right, innerWidth - bounds.width - 8));
    position.bottom = Math.max(8, Math.min(position.bottom, innerHeight - bounds.height - 8));
    host.style.right = `${position.right}px`;
    host.style.bottom = `${position.bottom}px`;
    host.style.top = 'auto';
  }
  function makeMovable(control) {
    let moving, suppressClick = false;
    control.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      moving = { x: event.clientX, y: event.clientY, ...position };
      suppressClick = false;
      control.setPointerCapture(event.pointerId);
    });
    control.addEventListener('pointermove', event => {
      if (!moving) return;
      const dx = event.clientX - moving.x, dy = event.clientY - moving.y;
      if (!suppressClick && Math.hypot(dx, dy) < 5) return;
      suppressClick = true;
      frame.style.pointerEvents = 'none';
      position = { right: moving.right - dx, bottom: moving.bottom - dy };
      positionAdvisor(); event.preventDefault();
    });
    function finish() {
      moving = null; frame.style.pointerEvents = '';
      setTimeout(() => { suppressClick = false; }, 0);
    }
    control.addEventListener('pointerup', finish);
    control.addEventListener('pointercancel', finish);
    control.addEventListener('lostpointercapture', finish);
    control.addEventListener('click', event => {
      if (!suppressClick) return;
      event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
    }, true);
  }
  function iconFor(button, drawing) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', drawing); svg.append(path); button.replaceChildren(svg);
  }
  function panelView(compact) {
    frame.contentWindow.postMessage({ type: 'REWARD_HARBOR_VIEW', compact }, '*');
  }
  function fitSize(width, height) {
    shell.style.width = `${Math.max(Math.min(260, innerWidth - 32), Math.min(width, innerWidth - 32))}px`;
    const available = Math.max(72, innerHeight - 92);
    shell.style.height = `${Math.max(Math.min(120, available), Math.min(height, available))}px`;
    positionAdvisor();
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== chrome.runtime.getURL('').replace(/\/$/, '')) return;
    if (event.data?.type !== 'REWARD_HARBOR_SIZE' || !Number.isFinite(event.data.height)) return;
    const mode = event.data.mode || (event.data.compact ? 'compact' : 'comparison');
    if (mode !== panelMode) manualSize = null;
    panelMode = mode;
    for (const edge of resizeEdges) edge.hidden = !['compact', 'comparison'].includes(mode);
    minimizeButton.disabled = !['compact', 'comparison'].includes(mode);
    minimizeButton.setAttribute('aria-label', mode === 'compact' ? 'Expand advisor' : 'Minimize advisor');
    minimizeButton.title = mode === 'compact' ? 'Expand' : 'Minimize';
    iconFor(minimizeButton, mode === 'compact' ? 'M6 15l6-6 6 6' : 'M5 12h14');
    if (manualSize && ['compact', 'comparison'].includes(mode)) fitSize(manualSize.width, manualSize.height);
    else {
      shell.style.height = `min(${Math.max(72, event.data.height) + 38}px, calc(100dvh - 92px))`;
    }
    positionAdvisor();
  });
  function setOpen(value) {
    opened = value; shell.hidden = !value; frame.hidden = !value; toggle.hidden = value;
    toggle.replaceChildren();
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', value ? 'M6 6l12 12M18 6L6 18' : 'M6 18L18 6M6 6h12v12');
    icon.append(path); toggle.append(icon);
    toggle.setAttribute('aria-expanded', String(value));
    toggle.setAttribute('aria-label', value ? 'Close Reward Harbor' : 'Open Reward Harbor');
    positionAdvisor();
  }
  function mount() {
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `:host{color-scheme:dark}button{display:grid;place-items:center;padding:0;line-height:1;margin-left:auto;width:44px;height:44px;border:1px solid #a99bff;border-radius:50%;background:#6554df;color:white;font:26px system-ui;cursor:pointer;box-shadow:0 6px 24px #0005}button svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}button:focus-visible{outline:2px solid #ac9dff;outline-offset:3px}iframe{display:block;width:min(340px,calc(100vw - 32px));height:min(510px,calc(100dvh - 100px));border:1px solid #7465f5;border-radius:16px;margin-bottom:12px;background:#101421;box-shadow:0 16px 64px #0007}iframe[hidden]{display:none}`;
    style.textContent += `.shell{position:relative;box-sizing:border-box;width:min(340px,calc(100vw - 32px));height:min(510px,calc(100dvh - 92px));max-width:calc(100vw - 32px);max-height:calc(100dvh - 92px);border:1px solid #7465f5;border-radius:16px;overflow:hidden;margin-bottom:12px;background:#101421;box-shadow:0 16px 64px #0007}.shell iframe{width:100%;height:100%;border:0;border-radius:0;margin:0;box-shadow:none}.resize-handle{position:absolute;left:0;top:0;width:18px;height:18px;border:0;border-radius:0;background:#232b44;color:#ac9dff;box-shadow:none;cursor:nwse-resize;touch-action:none}.resize-handle svg{width:16px;height:16px}button{box-sizing:border-box}.launcher{position:relative;display:block;font-size:0;line-height:0;text-align:center}.launcher svg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;margin:0;width:22px;height:22px;pointer-events:none}button svg{flex:none}[hidden]{display:none!important}`;
    style.textContent += `.move-handle{display:flex;align-items:center;justify-content:center;width:48px;height:16px;margin:0 auto 4px;border:1px solid #665b98;border-radius:8px;background:#232b44;box-shadow:none;cursor:grab;touch-action:none}.move-handle::before{content:'';width:22px;height:3px;border-radius:3px;background:#ac9dff}.move-handle:active,.launcher:active{cursor:grabbing}.launcher{touch-action:none;cursor:grab}.shell{height:min(510px,calc(100dvh - 92px));max-height:calc(100dvh - 92px)}`;
    moveHandle = document.createElement('button'); moveHandle.type = 'button'; moveHandle.className = 'move-handle';
    moveHandle.textContent = 'Reward Harbor';
    moveHandle.setAttribute('aria-label', 'Move advisor'); moveHandle.title = 'Drag to move, or use arrow keys';
    makeMovable(moveHandle);
    moveHandle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      position.right += event.key === 'ArrowLeft' ? 20 : event.key === 'ArrowRight' ? -20 : 0;
      position.bottom += event.key === 'ArrowUp' ? 20 : event.key === 'ArrowDown' ? -20 : 0;
      positionAdvisor();
    });
    shell = document.createElement('div'); shell.className = 'shell';
    titlebar = document.createElement('div'); titlebar.className = 'titlebar';
    function windowButton(label, drawing, action) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'window-control';
      button.setAttribute('aria-label', label); button.title = label; iconFor(button, drawing);
      if (action) button.addEventListener('click', action);
      return button;
    }
    minimizeButton = windowButton('Minimize advisor', 'M5 12h14', () => {
      panelView(panelMode !== 'compact');
    });
    closeButton = windowButton('Close Reward Harbor', 'M6 6l12 12M18 6L6 18', () => setOpen(false));
    frame = document.createElement('iframe'); frame.hidden = true;
    frame.src = chrome.runtime.getURL('panel.html') + (sandbox ? '?compact=1' : ''); frame.title = 'Reward Harbor card rewards advisor';
    toggle = document.createElement('button'); toggle.className = 'launcher'; toggle.type = 'button'; toggle.textContent = '↗';
    toggle.title = 'Drag to move. Click to open or close.';
    makeMovable(toggle);
    toggle.addEventListener('click', () => setOpen(!opened));
    const edgeNames = { n: 'top', s: 'bottom', e: 'right', w: 'left', nw: 'top left', ne: 'top right', sw: 'bottom left', se: 'bottom right' };
    for (const [direction, name] of Object.entries(edgeNames)) {
      const edge = document.createElement('div'); edge.className = `resize-edge edge-${direction}`;
      edge.setAttribute('role', 'button'); edge.tabIndex = 0; edge.setAttribute('aria-label', `Resize advisor from ${name}`);
      edge.title = `Drag ${name} edge to resize`; edge.dataset.direction = direction;
      let resizing;
      function resizeBy(dx, dy) {
        if (!resizing) return;
        const minWidth = Math.min(260, innerWidth - 32), minHeight = Math.min(120, innerHeight - 92);
        let { left, right, top, bottom } = resizing.bounds;
        if (direction.includes('w')) left = Math.max(8, Math.min(right - minWidth, left + dx));
        if (direction.includes('e')) right = Math.min(innerWidth - 8, Math.max(left + minWidth, right + dx));
        if (direction.includes('n')) top = Math.max(8, Math.min(bottom - minHeight, top + dy));
        if (direction.includes('s')) bottom = Math.min(innerHeight - resizing.bottomGap - 8, Math.max(top + minHeight, bottom + dy));
        manualSize = { width: right - left, height: bottom - top };
        position = { right: innerWidth - right, bottom: innerHeight - bottom - resizing.bottomGap };
        fitSize(manualSize.width, manualSize.height);
      }
      function startResize() {
        const bounds = shell.getBoundingClientRect();
        resizing = { bounds, bottomGap: host.getBoundingClientRect().bottom - bounds.bottom };
      }
      edge.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        startResize(); resizing.x = event.clientX; resizing.y = event.clientY;
        edge.setPointerCapture(event.pointerId); frame.style.pointerEvents = 'none'; event.preventDefault(); event.stopPropagation();
      });
      edge.addEventListener('pointermove', event => {
        if (resizing) resizeBy(event.clientX - resizing.x, event.clientY - resizing.y);
      });
      function finishResize() { resizing = null; frame.style.pointerEvents = ''; }
      edge.addEventListener('pointerup', finishResize); edge.addEventListener('pointercancel', finishResize); edge.addEventListener('lostpointercapture', finishResize);
      edge.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); startResize();
        resizeBy(event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0, event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0);
        finishResize();
      });
      resizeEdges.push(edge);
    }
    titlebar.append(moveHandle, minimizeButton, closeButton);
    shell.append(titlebar, frame, ...resizeEdges);
    style.textContent += `.shell{display:flex;flex-direction:column}.shell iframe{flex:1;min-height:0;height:auto}.titlebar{display:flex;align-items:center;gap:3px;flex:none;height:38px;padding:0 6px;background:#1b2034;border-bottom:1px solid #35405d}.titlebar .move-handle{flex:1;min-width:0;justify-content:flex-start;height:30px;width:auto;margin:0;padding:0 6px;border:0;border-radius:5px;background:transparent;color:#dce1f4;font:600 11px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.move-handle::before{display:none}.titlebar .window-control{position:static;display:flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;margin:0;padding:0;border:0;border-radius:6px;background:transparent;color:#c9c1f8;box-shadow:none;line-height:0}.titlebar .window-control svg{width:16px;height:16px;margin:0;pointer-events:none}.window-control:hover{background:#35334f}.window-control:disabled{opacity:.35;cursor:default}.resize-handle{cursor:nwse-resize}.titlebar button:focus-visible{outline:2px solid #ac9dff;outline-offset:0}`;
    style.textContent += `.resize-edge{position:absolute;z-index:3;touch-action:none}.resize-edge:focus-visible{outline:2px solid #ac9dff;outline-offset:-2px}.edge-n,.edge-s{left:12px;right:12px;height:5px;cursor:ns-resize}.edge-n{top:0}.edge-s{bottom:0}.edge-e,.edge-w{top:12px;bottom:12px;width:5px;cursor:ew-resize}.edge-e{right:0}.edge-w{left:0}.edge-nw,.edge-ne,.edge-sw,.edge-se{width:12px;height:12px}.edge-nw{top:0;left:0;cursor:nwse-resize}.edge-ne{top:0;right:0;cursor:nesw-resize}.edge-sw{bottom:0;left:0;cursor:nesw-resize}.edge-se{bottom:0;right:0;cursor:nwse-resize}`;
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
    positionAdvisor();
  });
  window.addEventListener('pageshow', update);
  window.addEventListener('pagehide', event => { if (!event.persisted) stop(); });
  update();
})();
