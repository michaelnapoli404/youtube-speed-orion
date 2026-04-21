const _api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
  const input      = document.getElementById('maxSpeed');
  const snapCheck  = document.getElementById('snapToOne');
  const appearSel  = document.getElementById('appearance');
  const saveBtn    = document.getElementById('save');
  const status     = document.getElementById('status');
  const presets    = document.querySelectorAll('.preset');

  _api.storage.sync.get({ maxSpeed: 10, snapToOne: false, appearance: 'auto' }, (result) => {
    input.value       = parseFloat(result.maxSpeed) || 10;
    snapCheck.checked = !!result.snapToOne;
    appearSel.value   = result.appearance || 'auto';
    syncPresets(parseFloat(input.value));
  });

  presets.forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.value;
      syncPresets(parseFloat(btn.dataset.value));
    });
  });

  input.addEventListener('input', () => syncPresets(parseFloat(input.value)));

  function syncPresets(value) {
    presets.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.value) === value);
    });
  }

  saveBtn.addEventListener('click', () => {
    const value = parseFloat(input.value);
    if (isNaN(value) || value < 2) { showStatus('Must be 2 or greater', '#ff453a'); return; }
    if (value > 100)               { showStatus('Maximum is 100×', '#ff453a');      return; }

    _api.storage.sync.set(
      { maxSpeed: value, snapToOne: snapCheck.checked, appearance: appearSel.value },
      () => showStatus('Saved!', '#30d158')
    );
  });

  function showStatus(msg, color) {
    status.textContent = msg;
    status.style.color = color;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => { status.textContent = ''; }, 2000);
  }
});
