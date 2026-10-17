import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles.css';
import { installProductionStorageGuard } from './shared/productionStorage';
import { clearPrototypeBusinessData, installPrototypeStoragePolicy } from './shared/prototypeStorage';

// Clean both storage areas before React mounts; reject legacy writers in dev and production.
clearPrototypeBusinessData(window);
installPrototypeStoragePolicy(Storage.prototype);
// Older tabs may still write retired keys; remove them on focus or cross-tab changes.
window.addEventListener('focus', () => clearPrototypeBusinessData(window));
window.addEventListener('storage', (event) => {
  if (event.key) clearPrototypeBusinessData(window);
});
try {
  installProductionStorageGuard(window.localStorage, import.meta.env.PROD);
} catch {
  // Disabled browser storage must not prevent the login page from rendering.
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
