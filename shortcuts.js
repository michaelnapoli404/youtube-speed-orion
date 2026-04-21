(function () {
  'use strict';

  // ── Prevent double injection ───────────────────────────────────────────────
  if (document.getElementById('yt-speed-container')) return;

  // ── Settings (persisted in localStorage on youtube.com) ───────────────────
  const STORAGE_KEY = 'yt_speed_max';
  let maxSpeed = parseFloat(localStorage.getItem(STORAGE_KEY)) || 10;

  // ── Speed math ─────────────────────────────────────────────────────────────
  // Slider: 0–1000 steps
  // Left half  (0–500)   → 0x to 1x
  // Right half (500–1000) → 1x to maxSpeed

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
      gap: 4px;
      padding: 8px 20px 10px;
      background: rgba(18, 18, 18, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      touch-action: none;
    }
    #yt-speed-top-row {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #yt-speed-label {
      color: #fff;
      font-family: -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.4px;
      user-select: none;
      -webkit-user-select: none;
    }
    #yt-speed-settings-btn {
      background: none;
      border: none;
      color: rgba(255,255,255,0.4);
      font-size: 11px;
      font-family: -apple-system, sans-serif;
      cursor: pointer;
      padding: 2px 4px;
      user-select: none;
      -webkit-user-select: none;
    }
    #yt-speed-track-wrap {
      position: relative;
      width: 100%;
    }
    #yt-speed-midmark {
      position: absolute;
      left: 50%; top: 50%;
      transform: translate(-50%, -50%);
      width: 2px; height: 10px;
      background: rgba(255,255,255,0.3);
      border-radius: 1px;
      pointer-events: none;
      z-index: 1;
    }
    #yt-speed-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%; height: 4px;
      border-radius: 2px;
      background: rgba(255,255,255,0.25);
      outline: none;
      cursor: pointer;
      position: relative;
      z-index: 2;
    }
    #yt-speed-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 24px; height: 24px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 6px rgba(0,0,0,0.5);
    }
    #yt-speed-ends {
      width: 100%;
      display: flex;
      justify-content: space-between;
      font-family: -apple-system, sans-serif;
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      user-select: none;
      -webkit-user-select: none;
    }
  `;
  document.head.appendChild(style);

  // ── Build DOM ──────────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'yt-speed-container';

  const topRow = document.createElement('div');
  topRow.id = 'yt-speed-top-row';

  const label = document.createElement('div');
  label.id = 'yt-speed-label';
  label.textContent = '1x';

  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'yt-speed-settings-btn';
  settingsBtn.textContent = `max ${maxSpeed}x  ✎`;

  topRow.appendChild(label);
  topRow.appendChild(settingsBtn);

  const trackWrap = document.createElement('div');
  trackWrap.id = 'yt-speed-track-wrap';

  const midMark = document.createElement('div');
  midMark.id = 'yt-speed-midmark';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'yt-speed-slider';
  slider.min = '0';
  slider.max = '1000';
  slider.step = '1';
  slider.value = '500';

  trackWrap.appendChild(midMark);
  trackWrap.appendChild(slider);

  const endLabels = document.createElement('div');
  endLabels.id = 'yt-speed-ends';
  endLabels.innerHTML = `<span>0x</span><span>1x</span><span id="yt-speed-max-label">${maxSpeed}x</span>`;

  container.appendChild(topRow);
  container.appendChild(trackWrap);
  container.appendChild(endLabels);
  document.body.appendChild(container);

  // ── Sync to current video speed ────────────────────────────────────────────
  const video = document.querySelector('video');
  if (video && video.playbackRate !== 1) {
    const clamped = Math.min(video.playbackRate, maxSpeed);
    slider.value = speedToSlider(clamped);
    label.textContent = fmt(clamped);
  }

  // ── Slider input ───────────────────────────────────────────────────────────
  slider.addEventListener('input', () => {
    const speed = sliderToSpeed(parseInt(slider.value, 10));
    label.textContent = fmt(speed);
    const v = document.querySelector('video');
    if (v) v.playbackRate = Math.max(0, speed);
  });

  // Block YouTube touch events from leaking through the slider
  ['touchstart', 'touchmove', 'touchend'].forEach(evt =>
    slider.addEventListener(evt, e => e.stopPropagation(), { passive: true })
  );

  // ── Double-tap label → reset to 1x ────────────────────────────────────────
  let lastTap = 0;
  label.addEventListener('touchend', () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      slider.value = '500';
      label.textContent = '1x';
      const v = document.querySelector('video');
      if (v) v.playbackRate = 1;
    }
    lastTap = now;
  });

  // ── Settings button → change max speed ────────────────────────────────────
  settingsBtn.addEventListener('click', () => {
    const input = prompt(`Max speed (current: ${maxSpeed}x)\nEnter a number (e.g. 5, 10, 16):`, maxSpeed);
    if (input === null) return; // cancelled
    const val = parseFloat(input);
    if (isNaN(val) || val < 2) {
      alert('Please enter a number of 2 or greater.');
      return;
    }
    maxSpeed = val;
    localStorage.setItem(STORAGE_KEY, maxSpeed);
    settingsBtn.textContent = `max ${maxSpeed}x  ✎`;
    document.getElementById('yt-speed-max-label').textContent = maxSpeed + 'x';
    // Re-clamp slider if needed
    const currentSpeed = sliderToSpeed(parseInt(slider.value, 10));
    if (currentSpeed > maxSpeed) {
      slider.value = '1000';
      label.textContent = fmt(maxSpeed);
      const v = document.querySelector('video');
      if (v) v.playbackRate = maxSpeed;
    }
  });

  // ── Fight YouTube reasserting playbackRate ─────────────────────────────────
  if (video) {
    video.addEventListener('ratechange', () => {
      const expected = sliderToSpeed(parseInt(slider.value, 10));
      if (Math.abs(video.playbackRate - expected) > 0.05) {
        setTimeout(() => { video.playbackRate = Math.max(0, expected); }, 50);
      }
    });
  }
})();
