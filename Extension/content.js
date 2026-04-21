(function () {
  'use strict';

  // ── Page-context prototype patch ───────────────────────────────────────────
  // Content scripts run in an isolated JS world — patching prototypes here
  // won't affect YouTube's code. We inject a <script> tag so the patch runs
  // in the SAME context as YouTube, before YouTube's player initialises.
  // Communication uses video.dataset.ytBlockFs (DOM is shared across worlds).
  (function injectPagePatch() {
    const s = document.createElement('script');
    s.textContent = `(function(){
      // Patch webkitEnterFullScreen on the video element prototype
      var origEnterFs = HTMLVideoElement.prototype.webkitEnterFullScreen;
      if (origEnterFs) {
        HTMLVideoElement.prototype.webkitEnterFullScreen = function() {
          if (this.dataset && this.dataset.ytBlockFs === '1') return;
          return origEnterFs.apply(this, arguments);
        };
      }
      // Patch requestFullscreen / webkitRequestFullscreen on Element prototype
      ['requestFullscreen', 'webkitRequestFullscreen'].forEach(function(method) {
        var orig = Element.prototype[method];
        if (!orig) return;
        Element.prototype[method] = function() {
          var vid = document.querySelector('video');
          if (vid && vid.dataset && vid.dataset.ytBlockFs === '1') {
            return (method === 'requestFullscreen') ? Promise.resolve() : undefined;
          }
          return orig.apply(this, arguments);
        };
      });
    })();`;
    // document.documentElement always exists at document_start
    document.documentElement.appendChild(s);
    s.remove();
  })();

  // ── Rest of extension runs after DOM is ready ──────────────────────────────
  const _api = typeof browser !== 'undefined' ? browser : chrome;
  const SLIDER_ID = 'yt-speed-container';
  const DEFAULT_MAX = 10;
  const SNAP_ZONE  = 30;

  let maxSpeed   = DEFAULT_MAX;
  let snapToOne  = false;
  let appearance = 'auto';
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

  function getVideo()  { return document.querySelector('video'); }
  function getPlayer() { return document.querySelector('.html5-video-player'); }

  // ── Apply speed via YouTube's own API (preserves audio on WebKit/MSE) ──────
  // IMPORTANT: never set video.playbackRate after player.setPlaybackRate —
  // the direct write drops audio on WebKit MSE streams.
  function applySpeed(speed) {
    speed = Math.max(0, speed);
    const player = getPlayer();
    if (player && typeof player.setPlaybackRate === 'function') {
      player.setPlaybackRate(speed);
      return;
    }
    const v = getVideo();
    if (v) v.playbackRate = speed;
  }

  // ── Ensure video never auto-fullscreens on iOS ────────────────────────────
  // iOS WebKit auto-enters fullscreen when a video plays without playsinline.
  // Setting these attributes tells WebKit to play inline regardless.
  function ensurePlaysinline() {
    const v = getVideo();
    if (!v) return;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
  }

  // ── Block flag: set on video dataset (shared DOM, visible to page context) ─
  let _blockFsTimer = null;
  function armFullscreenBlock() {
    const v = getVideo();
    if (!v) return;
    ensurePlaysinline();          // belt-and-suspenders: inline attr + prototype patch
    v.dataset.ytBlockFs = '1';
    clearTimeout(_blockFsTimer);
    // Clear after 1.5s in case play never triggers fullscreen
    _blockFsTimer = setTimeout(() => { delete v.dataset.ytBlockFs; }, 1500);
  }

  // ── Play / Pause ───────────────────────────────────────────────────────────
  function ytTogglePlayPause() {
    const player = getPlayer();

    if (player && typeof player.playVideo === 'function') {
      const state = player.getPlayerState();
      if (state === 1 || state === 3) {
        player.pauseVideo();
      } else {
        armFullscreenBlock();   // set flag BEFORE play so patch sees it
        player.playVideo();
      }
      return;
    }

    const ytBtn = document.querySelector('.ytp-play-button');
    if (ytBtn) {
      armFullscreenBlock();
      ytBtn.click();
      return;
    }

    const v = getVideo();
    if (!v) return;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    if (v.paused) { armFullscreenBlock(); v.play(); }
    else { v.pause(); }
  }

  // ── YouTube dark mode ──────────────────────────────────────────────────────
  function applyYouTubeDarkMode() {
    if (darkModeObserver) { darkModeObserver.disconnect(); darkModeObserver = null; }
    if (appearance === 'auto') return;
    const wantDark = appearance === 'dark';
    function enforce() {
      const has = document.documentElement.hasAttribute('dark');
      if (wantDark && !has) document.documentElement.setAttribute('dark', '');
      if (!wantDark && has) document.documentElement.removeAttribute('dark');
    }
    enforce();
    darkModeObserver = new MutationObserver(enforce);
    darkModeObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ['dark']
    });
  }

  function applyTheme(container) {
    if (appearance === 'auto') container.removeAttribute('data-theme');
    else container.setAttribute('data-theme', appearance);
    applyYouTubeDarkMode();
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

    // Row 1: speed label + settings
    const topRow = document.createElement('div');
    topRow.id = 'yt-speed-top-row';

    const label = document.createElement('div');
    label.id = 'yt-speed-label';
    label.textContent = '1x';

    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'yt-speed-settings-btn';
    settingsBtn.textContent = `max ${maxSpeed}x ✎`;

    topRow.appendChild(label);
    topRow.appendChild(settingsBtn);

    // Row 2: play/pause
    const playRow = document.createElement('div');
    playRow.id = 'yt-speed-play-row';

    const playBtn = document.createElement('button');
    playBtn.id = 'yt-speed-playpause';
    const video = getVideo();
    playBtn.textContent = (video && video.paused) ? '▶' : '⏸';
    playRow.appendChild(playBtn);

    // Row 3: slider
    const trackWrap = document.createElement('div');
    trackWrap.id = 'yt-speed-track-wrap';

    const midMark = document.createElement('div');
    midMark.id = 'yt-speed-midmark';

    const slider = document.createElement('input');
    slider.type = 'range'; slider.id = 'yt-speed-slider';
    slider.min = '0'; slider.max = '1000'; slider.step = '1'; slider.value = '500';

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

    container.appendChild(topRow);
    container.appendChild(playRow);
    container.appendChild(trackWrap);
    container.appendChild(endLabels);
    container.appendChild(panel);
    document.body.appendChild(container);

    // Ensure inline playback from the start
    ensurePlaysinline();

    // Sync to current speed
    if (video && video.playbackRate !== 1) {
      const clamped = Math.min(video.playbackRate, maxSpeed);
      slider.value = speedToSlider(clamped);
      label.textContent = fmt(clamped);
    }

    // ── Slider ────────────────────────────────────────────────────────────
    slider.addEventListener('input', () => {
      let val = parseInt(slider.value, 10);
      if (snapToOne && Math.abs(val - 500) <= SNAP_ZONE) { val = 500; slider.value = '500'; }
      const speed = sliderToSpeed(val);
      label.textContent = fmt(speed);
      applySpeed(speed);
    });

    ['touchstart', 'touchmove', 'touchend'].forEach(evt =>
      slider.addEventListener(evt, e => e.stopPropagation(), { passive: true })
    );

    // ── Play button ───────────────────────────────────────────────────────
    ['touchstart', 'touchmove'].forEach(evt =>
      playBtn.addEventListener(evt, e => e.stopPropagation(), { passive: true })
    );
    playBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ytTogglePlayPause();
    }, { passive: false });
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ytTogglePlayPause();
    });

    if (video) {
      video.addEventListener('play',  () => { playBtn.textContent = '⏸'; });
      video.addEventListener('pause', () => { playBtn.textContent = '▶'; });
    }

    // ── Double-tap label → 1× ─────────────────────────────────────────────
    let lastTap = 0;
    label.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - lastTap < 300) { slider.value = '500'; label.textContent = '1x'; applySpeed(1); }
      lastTap = now;
    });

    // ── Settings panel ────────────────────────────────────────────────────
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
      const cs = sliderToSpeed(parseInt(slider.value, 10));
      if (cs > maxSpeed) { slider.value = '1000'; label.textContent = fmt(maxSpeed); applySpeed(maxSpeed); }
    });

    // ── Fight YouTube reasserting playbackRate ────────────────────────────
    // Guard flag prevents our own applySpeed call from re-triggering this.
    if (video) {
      let _rateChangeBusy = false;
      video.addEventListener('ratechange', () => {
        if (_rateChangeBusy) return;
        const expected = sliderToSpeed(parseInt(slider.value, 10));
        if (Math.abs(video.playbackRate - expected) > 0.05) {
          _rateChangeBusy = true;
          setTimeout(() => { applySpeed(expected); _rateChangeBusy = false; }, 50);
        }
      });
    }
  }

  function removeSlider() {
    const el = document.getElementById(SLIDER_ID);
    if (el) el.remove();
  }

  function isWatchPage() { return location.pathname === '/watch'; }

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
  });

  // ── Startup — wait for DOM since we run at document_start ─────────────────
  function init() {
    navObserver.observe(document.documentElement, { subtree: true, childList: true });

    setInterval(() => {
      if (isWatchPage() && !document.getElementById(SLIDER_ID)) loadAndBuild();
      hideRecommendations();
    }, 3000);

    _api.storage.onChanged.addListener((changes) => {
      if (changes.maxSpeed)  maxSpeed  = parseFloat(changes.maxSpeed.newValue)  || DEFAULT_MAX;
      if (changes.snapToOne) snapToOne = !!changes.snapToOne.newValue;
      if (changes.appearance) {
        appearance = changes.appearance.newValue || 'auto';
        const c = document.getElementById(SLIDER_ID);
        if (c) applyTheme(c); else applyYouTubeDarkMode();
      }
      if (changes.maxSpeed || changes.snapToOne) {
        removeSlider();
        if (isWatchPage()) buildSlider();
      }
    });

    hideRecommendations();
    loadAndBuild();
  }

  // document_start fires before DOM is parsed — wait for it to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
