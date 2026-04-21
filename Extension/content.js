(function () {
  'use strict';

  // Orion supports both browser.* and chrome.* — prefer browser, fall back to chrome
  const _api = typeof browser !== 'undefined' ? browser : chrome;

  const SLIDER_ID = 'yt-speed-container';
  const DEFAULT_MAX = 10;
  let maxSpeed = DEFAULT_MAX;
  let lastUrl = location.href;

  // ── Speed math ────────────────────────────────────────────────────────────
  // Slider range: 0–1000 integer steps.
  // Left half  (0–500)  → 0x–1x   (linear)
  // Right half (500–1000) → 1x–maxSpeed (linear)

  function sliderToSpeed(raw) {
    const v = raw / 1000;
    if (v <= 0.5) {
      return v * 2;
    }
    return 1 + (v - 0.5) * 2 * (maxSpeed - 1);
  }

  function speedToSlider(speed) {
    if (speed <= 1) {
      return Math.round((speed / 2) * 1000);
    }
    return Math.round((0.5 + (speed - 1) / (2 * (maxSpeed - 1))) * 1000);
  }

  function fmt(speed) {
    if (speed < 0.05) return '0x';
    return speed.toFixed(2).replace(/\.?0+$/, '') + 'x';
  }

  // ── Video helpers ─────────────────────────────────────────────────────────

  function getVideo() {
    return document.querySelector('video');
  }

  function applySpeed(speed) {
    const v = getVideo();
    if (v) v.playbackRate = Math.max(0, speed);
  }

  // ── Build slider ──────────────────────────────────────────────────────────

  function buildSlider() {
    if (document.getElementById(SLIDER_ID)) return;

    const container = document.createElement('div');
    container.id = SLIDER_ID;

    // Speed readout
    const label = document.createElement('div');
    label.id = 'yt-speed-label';
    label.textContent = '1x';

    // Track + midpoint marker wrapper
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

    // Min / mid / max labels
    const endLabels = document.createElement('div');
    endLabels.id = 'yt-speed-ends';
    endLabels.innerHTML =
      `<span>0x</span><span id="yt-speed-mid-label">1x</span><span id="yt-speed-max-label">${maxSpeed}x</span>`;

    // Double-tap container to reset to 1x
    container.title = 'Double-tap to reset to 1×';

    container.appendChild(label);
    container.appendChild(trackWrap);
    container.appendChild(endLabels);
    document.body.appendChild(container);

    // Sync to current video speed
    const video = getVideo();
    if (video && video.playbackRate !== 1) {
      const clamped = Math.min(video.playbackRate, maxSpeed);
      slider.value = speedToSlider(clamped);
      label.textContent = fmt(clamped);
    }

    // ── Events ──────────────────────────────────────────────────────────────

    slider.addEventListener('input', () => {
      const speed = sliderToSpeed(parseInt(slider.value, 10));
      label.textContent = fmt(speed);
      applySpeed(speed);
    });

    // Prevent slider touch events from propagating to YouTube's player
    slider.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    slider.addEventListener('touchmove',  e => e.stopPropagation(), { passive: true });
    slider.addEventListener('touchend',   e => e.stopPropagation(), { passive: true });

    // Double-tap to reset
    let lastTap = 0;
    container.addEventListener('touchend', (e) => {
      if (e.target === slider) return; // let slider handle its own taps
      const now = Date.now();
      if (now - lastTap < 300) {
        slider.value = '500';
        label.textContent = '1x';
        applySpeed(1);
      }
      lastTap = now;
    });

    // If YouTube reasserts playbackRate, fight back once
    if (video) {
      video.addEventListener('ratechange', () => {
        const current = video.playbackRate;
        const expected = sliderToSpeed(parseInt(slider.value, 10));
        if (Math.abs(current - expected) > 0.05) {
          // YouTube changed it under us — re-apply ours
          setTimeout(() => applySpeed(expected), 50);
        }
      });
    }
  }

  function removeSlider() {
    const el = document.getElementById(SLIDER_ID);
    if (el) el.remove();
  }

  function isWatchPage() {
    return location.pathname === '/watch';
  }

  // ── Init & SPA navigation watch ───────────────────────────────────────────

  function loadAndBuild() {
    _api.storage.sync.get({ maxSpeed: DEFAULT_MAX }, (result) => {
      maxSpeed = parseFloat(result.maxSpeed) || DEFAULT_MAX;
      document.getElementById('yt-speed-max-label') &&
        (document.getElementById('yt-speed-max-label').textContent = maxSpeed + 'x');
      if (isWatchPage()) buildSlider();
    });
  }

  // YouTube is a SPA — watch for URL changes via DOM mutations
  const navObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      removeSlider();
      if (isWatchPage()) {
        // Give YouTube's player time to render
        setTimeout(loadAndBuild, 1200);
      }
    }
  });
  navObserver.observe(document.documentElement, { subtree: true, childList: true });

  // Re-build if slider disappears (YouTube sometimes nukes it)
  setInterval(() => {
    if (isWatchPage() && !document.getElementById(SLIDER_ID)) {
      loadAndBuild();
    }
  }, 3000);

  // Settings change from popup
  _api.storage.onChanged.addListener((changes) => {
    if (changes.maxSpeed) {
      maxSpeed = parseFloat(changes.maxSpeed.newValue) || DEFAULT_MAX;
      removeSlider();
      if (isWatchPage()) buildSlider();
    }
  });

  loadAndBuild();
})();
