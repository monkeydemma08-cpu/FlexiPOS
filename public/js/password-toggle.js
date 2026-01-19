(() => {
  const DEFAULT_SHOW_LABEL = 'Mostrar';
  const DEFAULT_HIDE_LABEL = 'Ocultar';
  const READY_ATTR = 'data-password-toggle-ready';

  const getInputForButton = (button) => {
    const container = button.closest('.password-field');
    if (!container) return null;
    return container.querySelector('input');
  };

  const syncButtonState = (button, input, showLabel, hideLabel) => {
    const isVisible = input.type === 'text';
    button.textContent = isVisible ? hideLabel : showLabel;
    button.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
    button.setAttribute('aria-label', isVisible ? 'Ocultar contrasena' : 'Mostrar contrasena');
  };

  const bindToggle = (button) => {
    if (!button || button.hasAttribute(READY_ATTR)) return;
    const input = getInputForButton(button);
    if (!input) return;

    const showLabel = button.getAttribute('data-show-label') || DEFAULT_SHOW_LABEL;
    const hideLabel = button.getAttribute('data-hide-label') || DEFAULT_HIDE_LABEL;

    const syncDisabled = () => {
      const disabled = input.disabled || input.getAttribute('aria-disabled') === 'true';
      button.disabled = disabled;
      button.classList.toggle('is-disabled', disabled);
    };

    syncButtonState(button, input, showLabel, hideLabel);
    syncDisabled();

    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (button.disabled) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      syncButtonState(button, input, showLabel, hideLabel);
      input.focus({ preventScroll: true });
    });

    const observer = new MutationObserver(syncDisabled);
    observer.observe(input, { attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });

    button.setAttribute(READY_ATTR, 'true');
  };

  const initPasswordToggles = (root = document) => {
    root.querySelectorAll('[data-password-toggle]').forEach(bindToggle);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initPasswordToggles());
  } else {
    initPasswordToggles();
  }

  window.KANMPasswordToggle = {
    init: initPasswordToggles,
  };
})();
