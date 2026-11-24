/**
 * نقطة الدخول الرئيسية لتطبيق zoldix مع مزود الإعدادات الحية وتطبيق الويب التقدمي.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { SiteProvider } from './context/SiteContext';
import App from './App';
import './index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteProvider>
      <App />
    </SiteProvider>
  </StrictMode>
);
