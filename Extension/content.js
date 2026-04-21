(function () {
  'use strict';

  const _api = typeof browser !== 'undefined' ? browser : chrome;
  const SLIDER_ID = 'yt-speed-container';
  const DEFAULT_MAX = 10;
  const SNAP_ZONE  = 30;

  let maxSpeed   = DEFAULT_MAX;
  let snapToOne  = false;
  let appearance = 'auto'; // 'auto' | 'dark' | 'light'
  let lastUrl    = location.href;
  let darkModeObserver = null;

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

  function getVideo() { return document.querySelector('video'); }
  function applySpeed(speed) {
    const v = getVideo();
    if (v) v.playbackRate = Math.max(0, speed);
  }

  // ── YouTube dark mode ──────────────────────────────────────────────────────
  // 'auto'  → leave html[dark] alone (YouTube controls it)
  // 'dark'  → force html[dark] on and watch for YouTube removing it
  // 'light' → force html[dark] off and watch for YouTube re-adding it
  function applyYouTubeDarkMode() {
    if (darkModeObserver) {
      darkModeObserver.disconnect();
      darkModeObserver = null;
    }

    if (appearance === 'auto') return; // let YouTube manage it

    const wantDark = appearance === 'dark';

    function enforce() {
      const has = document.documentElement.hasAttribute('dark');
      if (wantDark && !has) document.documentElement.setAttribute('dark', '');
      if (!wantDark && has) document.documentElement.removeAttribute('dark');
    }

    enforce();

    // Re-enforce if YouTube's JS fights back
    darkModeObserver = new MutationObserver(enforce);
    darkModeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dark']
    });
  }

  // ── Apply theme attribute to our container ────────────────────────────────
  function applyTheme(container) {
    if (appearance === 'auto') {
      container.removeAttribute('data-theme');
    } else {
      container.setAttribute('data-theme', appearance);
    }
    applyYouTubeDarkMode();
  }

  // ── Play / Pause via YouTube's internal API ───────────────────────────────
  // Using YouTube's own playVideo()/pauseVideo() avoids the iOS fullscreen
  // that video.play() can trigger when called outside YouTube's player context.
  function ytTogglePlayPause() {
    // Preferred: YouTube's internal player methods
    const player = document.querySelector('.html5-video-player');
    if (player && typeof player.playVideo === 'function') {
      const state = player.getPlayerState();
      // 1 = playing, 3 = buffering → pause; everything else → play
      if (state === 1 || state === 3) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
      return;
    }

    // Fallback: click YouTube's native play button (desktop layout)
    const ytBtn = document.querySelector('.ytp-play-button');
    if (ytBtn) { ytBtn.click(); return; }

    // Last resort: direct video control with playsinline guard
    const v = getVideo();
    if (!v) return;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    if (v.paused) { v.play(); } else { v.pause(); }
  }

  // ── Recommendation hiding ─────────────────────────────────────────────────
  const REC_SELECTORS = [
    '#secondary',
    'ytd-watch-next-secondary-results-renderer',
    'ytd-compact-video-renderer',
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-compact-autoplay-renderer',
    'ytd-autoplay-renderer',
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer',
    'ytd-rich-grid-renderer',
    'ytd-rich-section-renderer',
    'ytm-reel-shelf-renderer',
    'ytm-item-section-renderer[data-content-type="home-feed"]',
  ];

  function hideRecommendations() {
    REC_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
    });
  }

  // ── Build slider UI ─────────────────────────────────────────────────────────
  function buildSlider() {
    if (document.getElementById(SLIDER_ID)) return;

    const container = document.createElement('div');
    container.id = SLIDER_ID;
    applyTheme(container);

    // Row 1: speed label + settings button
    const topRow = document.createElement('div');
    topRow.id = 'yt-speed-top-row';

    const label = document.createElement('div');
    label.id = 'yt-speed-label';
    label.textContent = '1x';
    label.title = 'Double-tap to reset to 1×';

    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'yt-speed-settings-btn';
    settingsBtn.textContent = `max ${maxSpeed}x ✎`;

    topRow.appendChild(label);
    topRow.appendChild(settingsBtn);

    // Row 2: centered play/pause
    const playRow = document.createElement('div');
    playRow.id = 'yt-speed-play-row';

    const playBtn = document.createElement('button');
    playBtn.id = 'yt-speed-playpause';
    const video = getVideo();
    playBtn.textContent = (video && video.paused) ? '▶' : '⏸';

    playRow.appendChild(playBtn);

    // Row 3: slider track
    const trackWrap = document.createElement('div');
    trackWrap.id = 'yt-speed-track-wrap';

    const midMark = document.createElement('div');
    midMark.id = 'yt-speed-midmark';

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.id    = 'yt-speed-slider';
    slider.min   = '0'; slider.max = '1000'; slider.step = '1'; slider.value = '500';

    trackWrap.appendChild(midMark);
    trackWrap.appendChild(slider);

    // Row 4: end labels
    const endLabels = document.createElement('div');
    endLabels.id = 'yt-speed-ends';
    endLabels.innerHTML =
      `<span>0x</span><span>1x</span><span id="yt-speed-max-label">${maxSpeed}x</span>`;

    // Settings panel
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

    // Stop all container touches from reaching YouTube's player beneath
    ['touchstart', 'touchmove', 'touchend'].forEach(evt =>
      container.addEventListener(evt, e => e.stopPropagation(), { passive: true })
    );

    container.appendChild(topRow);
    container.appendChild(playRow);
    container.appendChild(trackWrap);
    container.appendChild(endLabels);
    container.appendChild(panel);
    document.body.appendChild(container);

    // Sync slider to current video speed
    if (video && video.playbackRate !== 1) {
      const clamped = Math.min(video.playbackRate, maxSpeed);
      slider.value = speedToSlider(clamped);
      label.textContent = fmt(clamped);
    }

    // ── Slider input ──────────────────────────────────────────────────────
    slider.addEventListener('input', () => {
      let val = parseInt(slider.value, 10);
      if (snapToOne && Math.abs(val - 500) <= SNAP_ZONE) {
        val = 500; slider.value = '500';
      }
      const speed = sliderToSpeed(val);
      label.textContent = fmt(speed);
      applySpeed(speed);
    });

    ['touchstart', 'touchmove', 'touchend'].forEach(evt =>
      slider.addEventListener(evt, e => e.stopPropagation(), { passive: true })
    );

    // ── Play/pause — use YouTube's internal API to avoid fullscreen ───────
    playBtn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });

    playBtn.addEventListener('touchend', (e) => {
      e.preventDefault();  // suppress synthetic click so YouTube's overlay never sees it
      e.stopPropagation();
      ytTogglePlayPause();
    }, { passive: false });

    // Non-touch fallback (Orion desktop mode)
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ytTogglePlayPause();
    });

    // Keep icon in sync with actual video state
    if (video) {
      video.addEventListener('play',  () => { playBtn.textContent = '⏸'; });
      video.addEventListener('pause', () => { playBtn.textContent = '▶'; });
    }

    // ── Double-tap speed label → reset to 1× ─────────────────────────────
    let lastTap = 0;
    label.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - lastTap < 300) {
        slider.value = '500'; label.textContent = '1x'; applySpeed(1);
      }
      lastTap = now;
    });

    // ── Settings panel toggle ─────────────────────────────────────────────
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });

    document.getElementById('yt-sp-save').addEventListener('click', () => {
      const newMax  = parseFloat(document.getElementById('yt-sp-max').value);
      const newSnap = document.getElementById('yt-sp-snap').checked;
      if (isNaN(newMax) || newMax < 2) return;

      maxSpeed = newMax; snapToOne = newSnap;
      _api.storage.sync.set({ maxSpeed, snapToOne });

      settingsBtn.textContent = `max ${maxSpeed}x ✎`;
      document.getElementById('yt-speed-max-label').textContent = maxSpeed + 'x';
      panel.classList.remove('open');

      const currentSpeed = sliderToSpeed(parseInt(slider.value, 10));
      if (currentSpeed > maxSpeed) {
        slider.value = '1000'; label.textContent = fmt(maxSpeed); applySpeed(maxSpeed);
      }
    });

    // ── Fight YouTube reasserting playbackRate ────────────────────────────
    if (video) {
      video.addEventListener('ratechange', () => {
        const expected = sliderToSpeed(parseInt(slider.value, 10));
        if (Math.abs(video.playbackRate - expected) > 0.05) {
          setTimeout(() => applySpeed(expected), 50);
        }
      });
    }
  }

  function removeSlider() {
    const el = document.getElementById(SLIDER_ID);
    if (el) el.remove();
  }

  function isWatchPage() { return location.pathname === '/watch'; }

  // ── Init ───────────────────────────────────────────────────────────────────
  function loadAndBuild() {
    _api.storage.sync.get(
      { maxSpeed: DEFAULT_MAX, snapToOne: false, appearance: 'auto' },
      (result) => {
        maxSpeed   = parseFloat(result.maxSpeed) || DEFAULT_MAX;
        snapToOne  = !!result.snapToOne;
        appearance = result.appearance || 'auto';
        applyYouTubeDarkMode();
        if (isWatchPage()) buildSlider();
      }
    );
  }

  // ── SPA navigation watcher ─────────────────────────────────────────────────
  const navObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      removeSlider();
      if (isWatchPage()) setTimeout(loadAndBuild, 1200);
    }
    hideRecommendations();
  });
  navObserver.observe(document.documentElement, {
    subtree: true, childList: true,
    // exclude our own dark-mode attribute mutations to avoid loop
    attributeFilter: []
  });

  setInterval(() => {
    if (isWatchPage() && !document.getElementById(SLIDER_ID)) loadAndBuild();
    hideRecommendations();
  }, 2000);

  // Settings changes from popup
  _api.storage.onChanged.addListener((changes) => {
    if (changes.maxSpeed)  maxSpeed  = parseFloat(changes.maxSpeed.newValue) || DEFAULT_MAX;
    if (changes.snapToOne) snapToOne = !!changes.snapToOne.newValue;
    if (changes.appearance) {
      appearance = changes.appearance.newValue || 'auto';
      const c = document.getElementById(SLIDER_ID);
      if (c) applyTheme(c);
      else applyYouTubeDarkMode();
    }
    if (changes.maxSpeed || changes.snapToOne) {
      removeSlider();
      if (isWatchPage()) buildSlider();
    }
  });

  hideRecommendations();
  loadAndBuild();
})();
