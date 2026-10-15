import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[app] #root element not found in DOM');
} else {
  console.log('[app] mounting to #root');
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
