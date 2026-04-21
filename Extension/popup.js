// Orion supports both browser.* and chrome.* — prefer browser, fall back to chrome
const _api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
  const input    = document.getElementById('maxSpeed');
  const saveBtn  = document.getElementById('save');
  const status   = document.getElementById('status');
  const presets  = document.querySelectorAll('.preset');

  // Load saved setting
  _api.storage.sync.get({ maxSpeed: 10 }, (result) => {
    const saved = parseFloat(result.maxSpeed) || 10;
    input.value = saved;
    syncPresets(saved);
  });

  // Preset buttons
  presets.forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.value;
      syncPresets(parseFloat(btn.dataset.value));
    });
  });

  // Typing a custom value clears preset highlight
  input.addEventListener('input', () => {
    syncPresets(parseFloat(input.value));
  });

  function syncPresets(value) {
    presets.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.value) === value);
    });
  }

  // Save
  saveBtn.addEventListener('click', () => {
    const value = parseFloat(input.value);

    if (isNaN(value) || value < 2) {
      showStatus('Must be 2 or greater', '#ff453a');
      return;
    }
    if (value > 100) {
      showStatus('Maximum allowed is 100×', '#ff453a');
      return;
    }

    _api.storage.sync.set({ maxSpeed: value }, () => {
      showStatus('Saved!', '#30d158');
    });
  });

  function showStatus(msg, color) {
    status.textContent = msg;
    status.style.color = color;
    status.style.opacity = '1';
    clearTimeout(showStatus._timer);
    showStatus._timer = setTimeout(() => {
      status.style.opacity = '0';
    }, 2000);
  }
});
