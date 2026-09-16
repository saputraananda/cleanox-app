import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { startPwaInstallCapture } from '@shared/utils/pwaInstallCapture.js';
import { startPwaAutoReload } from '@shared/utils/pwaAutoReload.js';
import App from './App.jsx';
import './index.css';

startPwaInstallCapture();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true).then(() => {
      window.location.reload();
    });
  },
});

startPwaAutoReload();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
