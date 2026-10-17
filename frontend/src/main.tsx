import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles.css';
import { installProductionStorageGuard } from './shared/productionStorage';

// 启动时清除所有 localStorage 原型数据，确保前端仅展示后端 API 返回的真实数据
(function clearPrototypeData() {
  const patterns = [
    'industrial-ai-sales:v8:',
    'industrial-ai-inventory-master-data:v1:',
    'industrial-ai-inventory-sales-outbound:v1:',
    'industrial-ai-production-legacy:',
  ];
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && patterns.some(p => key.startsWith(p))) keysToRemove.push(key);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
})();

installProductionStorageGuard(window.localStorage, import.meta.env.PROD);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
