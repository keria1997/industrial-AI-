import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles.css';
import { clearPrototypeBusinessData, installPrototypeStoragePolicy } from './shared/prototypeStorage';

// Polyfill: crypto.randomUUID is only available in secure contexts (HTTPS/localhost).
// Production deploys over HTTP need this fallback.
if (!crypto.randomUUID) {
  (crypto as any).randomUUID = () => {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    ) as `${string}-${string}-${string}-${string}-${string}`;
  };
}

// Clean both storage areas before React mounts; reject legacy writers in dev and production.
clearPrototypeBusinessData(window);
installPrototypeStoragePolicy(Storage.prototype);
// Older tabs may still write retired keys; remove them on focus or cross-tab changes.
window.addEventListener('focus', () => clearPrototypeBusinessData(window));
window.addEventListener('storage', (event) => {
  if (event.key) clearPrototypeBusinessData(window);
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
