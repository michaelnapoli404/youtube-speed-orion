(function () {
  'use strict';

  if (document.getElementById('yt-speed-container')) return;

  // ── Settings (localStorage) ────────────────────────────────────────────────
  let maxSpeed  = parseFloat(localStorage.getItem('yt_speed_max'))  || 10;
  let snapToOne = localStorage.getItem('yt_speed_snap') === 'true';
  const SNAP_ZONE = 30;

  // ── Speed math ─────────────────────────────────────────────────────────────
  function sliderToSpeed(raw) {
    const v = raw / 1000;
    return v <= 0.5 ? v * 2 : 1 + (v - 0.5) * 2 * (maxSpeed - 1);
  }
  function speedToSlider(speed) {
    if (speed <= 1) return Math.round((speed / 2) * 1000);
    return Math.round((0.5 + (speed - 1) / (2 * (maxSpeed - 1))) * 1000);
  }
  function fmt(speed) {
    if (speed < 0.05) return '0x';
    return speed.toFixed(2).replace(/\.?0+$/, '') + 'x';
  }

  // ── Inject CSS ─────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #yt-speed-container {
      position: fixed;
      bottom: env(safe-area-inset-bottom, 0px);
      left: 0; right: 0;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 10px 20px 12px;
      touch-action: none;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    /* Light / dark mode */
    html[dark] #yt-speed-container,
    @media (prefers-color-scheme: dark) {
      #yt-speed-container {
        background: rgba(18,18,18,0.90);
        border-top: 1px solid rgba(255,255,255,0.06);
      }
    }
    #yt-speed-container {
      background: rgba(235,235,235,0.94);
      border-top: 1px solid rgba(0,0,0,0.08);
    }
    html[dark] #yt-speed-container {
      background: rgba(18,18,18,0.90);
      border-top-color: rgba(255,255,255,0.06);
    }

    #yt-speed-top-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    #yt-speed-playpause {
      background: none; border: none; padding: 0;
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; cursor: pointer; color: #111;
      -webkit-user-select: none;
    }
    html[dark] #yt-speed-playpause { color: #fff; }

    #yt-speed-label {
      font-family: -apple-system, sans-serif;
      font-size: 15px; font-weight: 700;
      color: #111;
      -webkit-user-select: none;
    }
    html[dark] #yt-speed-label { color: #fff; }

    #yt-speed-settings-btn {
      background: none; border: none;
      font-family: -apple-system, sans-serif;
      font-size: 11px; color: rgba(0,0,0,0.4);
      cursor: pointer; padding: 4px 6px;
      -webkit-user-select: none;
    }
    html[dark] #yt-speed-settings-btn { color: rgba(255,255,255,0.4); }

    #yt-speed-track-wrap {
      position: relative; width: 100%;
      display: flex; align-items: center;
    }

    #yt-speed-midmark {
      position: absolute; left: 50%; top: 50%;
      transform: translate(-50%, -50%);
      width: 3px; height: 22px;
      background: rgba(0,0,0,0.2); border-radius: 2px;
      pointer-events: none; z-index: 3;
    }
    html[dark] #yt-speed-midmark { background: rgba(255,255,255,0.25); }

    #yt-speed-slider {
      -webkit-appearance: none; appearance: none;
      width: 100%; height: 16px;
      border-radius: 8px;
      background: rgba(0,0,0,0.12);
      outline: none; cursor: pointer;
      position: relative; z-index: 2;
    }
    html[dark] #yt-speed-slider { background: rgba(255,255,255,0.18); }

    #yt-speed-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 38px; height: 38px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      position: relative; z-index: 4;
    }
    html[dark] #yt-speed-slider::-webkit-slider-thumb { background: #e8e8e8; }

    #yt-speed-ends {
      width: 100%;
      display: flex; justify-content: space-between;
      font-family: -apple-system, sans-serif;
      font-size: 10px; color: rgba(0,0,0,0.35);
      -webkit-user-select: none;
    }
    html[dark] #yt-speed-ends { color: rgba(255,255,255,0.35); }

    /* Inline settings panel */
    #yt-speed-panel {
      width: 100%; display: none;
      flex-direction: column; gap: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(0,0,0,0.08);
    }
    html[dark] #yt-speed-panel { border-top-color: rgba(255,255,255,0.08); }
    #yt-speed-panel.open { display: flex; }

    .yt-sp-row {
      display: flex; align-items: center;
      justify-content: space-between;
      font-family: -apple-system, sans-serif;
      font-size: 13px; color: #111;
    }
    html[dark] .yt-sp-row { color: #eee; }

    .yt-sp-row input[type=number] {
      width: 64px; padding: 5px 8px;
      border-radius: 8px;
      border: 1px solid rgba(0,0,0,0.15);
      background: #fff; color: #111;
      font-size: 14px; font-weight: 600;
      text-align: right;
    }
    html[dark] .yt-sp-row input[type=number] {
      background: #2c2c2e;
      border-color: rgba(255,255,255,0.1);
      color: #fff;
    }
    .yt-sp-row input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }

    .yt-sp-toggle { position: relative; width: 44px; height: 26px; flex-shrink: 0; }
    .yt-sp-toggle input { opacity: 0; width: 0; height: 0; }
    .yt-sp-toggle-track {
      position: absolute; inset: 0;
      border-radius: 13px; background: rgba(0,0,0,0.15);
      transition: background 0.2s; cursor: pointer;
    }
    .yt-sp-toggle input:checked + .yt-sp-toggle-track { background: #34c759; }
    .yt-sp-toggle-thumb {
      position: absolute; top: 3px; left: 3px;
      width: 20px; height: 20px;
      border-radius: 50%; background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      transition: left 0.2s; pointer-events: none;
    }
    .yt-sp-toggle input:checked ~ .yt-sp-toggle-thumb { left: 21px; }

    #yt-sp-save {
      width: 100%; padding: 9px;
      background: #0a84ff; color: #fff;
      border: none; border-radius: 10px;
      font-size: 14px; font-weight: 600;
      font-family: -apple-system, sans-serif;
      cursor: pointer;
    }

    /* Hide YouTube recommendations */
    ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
    ytd-browse[page-subtype="home"] ytd-rich-section-renderer,
    ytd-browse[page-subtype="home"] ytd-reel-shelf-renderer,
    #secondary,
    ytd-watch-next-secondary-results-renderer,
    ytd-compact-autoplay-renderer,
    ytd-reel-shelf-renderer,
    ytm-reel-shelf-renderer { display: none !important; }
  `;
  document.head.appendChild(style);

  // ── Build DOM ──────────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'yt-speed-container';

  const topRow = document.createElement('div');
  topRow.id = 'yt-speed-top-row';

  const video = document.querySelector('video');

  const playBtn = document.createElement('button');
  playBtn.id = 'yt-speed-playpause';
  playBtn.textContent = (video && video.paused) ? '▶' : '⏸';

  const label = document.createElement('div');
  label.id = 'yt-speed-label';
  label.textContent = '1x';

  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'yt-speed-settings-btn';
  settingsBtn.textContent = `max ${maxSpeed}x ✎`;

  topRow.appendChild(playBtn);
  topRow.appendChild(label);
  topRow.appendChild(settingsBtn);

  const trackWrap = document.createElement('div');
  trackWrap.id = 'yt-speed-track-wrap';

  const midMark = document.createElement('div');
  midMark.id = 'yt-speed-midmark';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'yt-speed-slider';
  slider.min = '0'; slider.max = '1000'; slider.step = '1'; slider.value = '500';

  trackWrap.appendChild(midMark);
  trackWrap.appendChild(slider);

  const endLabels = document.createElement('div');
  endLabels.id = 'yt-speed-ends';
  endLabels.innerHTML = `<span>0x</span><span>1x</span><span id="yt-speed-max-label">${maxSpeed}x</span>`;

  const panel = document.createElement('div');
  panel.id = 'yt-speed-panel';
  panel.innerHTML = `
    <div class="yt-sp-row">
      <span>Max speed</span>
      <input type="number" id="yt-sp-max" min="2" max="100" step="0.5" value="${maxSpeed}">
    </div>
    <div class="yt-sp-row">
      <span>Snap to 1×</span>
      <label class="yt-sp-toggle">
        <input type="checkbox" id="yt-sp-snap" ${snapToOne ? 'checked' : ''}>
        <div class="yt-sp-toggle-track"></div>
        <div class="yt-sp-toggle-thumb"></div>
      </label>
    </div>
    <button id="yt-sp-save">Save</button>
  `;

  container.appendChild(topRow);
  container.appendChild(trackWrap);
  container.appendChild(endLabels);
  container.appendChild(panel);
  document.body.appendChild(container);

  // Sync to current video speed
  if (video && video.playbackRate !== 1) {
    const clamped = Math.min(video.playbackRate, maxSpeed);
    slider.value = speedToSlider(clamped);
    label.textContent = fmt(clamped);
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  slider.addEventListener('input', () => {
    let val = parseInt(slider.value, 10);
    if (snapToOne && Math.abs(val - 500) <= SNAP_ZONE) {
      val = 500;
      slider.value = '500';
    }
    const speed = sliderToSpeed(val);
    label.textContent = fmt(speed);
    if (video) video.playbackRate = Math.max(0, speed);
  });

  ['touchstart', 'touchmove', 'touchend'].forEach(evt =>
    slider.addEventListener(evt, e => e.stopPropagation(), { passive: true })
  );

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!video) return;
    if (video.paused) { video.play(); } else { video.pause(); }
  });

  if (video) {
    video.addEventListener('play',  () => { playBtn.textContent = '⏸'; });
    video.addEventListener('pause', () => { playBtn.textContent = '▶'; });
  }

  let lastTap = 0;
  label.addEventListener('touchend', () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      slider.value = '500'; label.textContent = '1x';
      if (video) video.playbackRate = 1;
    }
    lastTap = now;
  });

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  document.getElementById('yt-sp-save').addEventListener('click', () => {
    const newMax  = parseFloat(document.getElementById('yt-sp-max').value);
    const newSnap = document.getElementById('yt-sp-snap').checked;
    if (isNaN(newMax) || newMax < 2) return;

    maxSpeed  = newMax;
    snapToOne = newSnap;
    localStorage.setItem('yt_speed_max',  maxSpeed);
    localStorage.setItem('yt_speed_snap', snapToOne);

    settingsBtn.textContent = `max ${maxSpeed}x ✎`;
    document.getElementById('yt-speed-max-label').textContent = maxSpeed + 'x';
    panel.classList.remove('open');
  });

  if (video) {
    video.addEventListener('ratechange', () => {
      const expected = sliderToSpeed(parseInt(slider.value, 10));
      if (Math.abs(video.playbackRate - expected) > 0.05) {
        setTimeout(() => { video.playbackRate = Math.max(0, expected); }, 50);
      }
    });
  }
})();
