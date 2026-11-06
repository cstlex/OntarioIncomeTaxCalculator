/**
 * Build-time entry: renders the app with default inputs to static HTML so search engines and
 * link previews see real content (see scripts/prerender.mjs). The browser re-renders from scratch.
 */
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
