export const CHRONOS_DEFAULT_CSS = `
:root {
  --chronos-semi-gray: rgba(0,0,0,0.08);
  --chronos-opacity: 0.2;
  --chronos-bg: #ffffff;
  --chronos-accent: #0b63ff;
  --chronos-text: #111111;
}
.chronos-timeline-root .chronos-timeline-container {
  background-color: var(--chronos-bg);
  position: relative;
}
.chronos-timeline-root .chronos-timeline-refit-button {
  position: absolute;
  bottom: 2px;
  right: 5px;
  padding: 2px 5px;
  background-color: transparent;
  border: none;
  cursor: pointer;
  z-index: 99;
  color: var(--chronos-text);
}
.chronos-timeline-root .chronos-error-message-container {
  padding: 1rem 1.5rem;
  color: var(--chronos-text);
}
.chronos-timeline-root .is-link { cursor: pointer; }
.chronos-timeline-root .vis-item { border-radius: 4px; }
.chronos-timeline-root .vis-range.with-caps { border-radius: 50px; padding-left: 8px; }
`;
