// Het voorbeeld van het beheer op de homepage: klik links op een onderdeel en het scherm wisselt.
document.querySelectorAll('[data-mock]').forEach((mock) => {
  const buttons = mock.querySelectorAll('.mock-side button');
  const panels = mock.querySelectorAll('.mock-panel');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      panels.forEach((p) => { p.hidden = p.dataset.id !== btn.dataset.panel; });
    });
  });
});
