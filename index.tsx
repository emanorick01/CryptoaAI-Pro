
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Registro do Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Usamos um caminho relativo simples. O navegador resolve isso automaticamente 
    // em relação ao local do arquivo HTML atual.
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        console.log('CryptoAI: SW Registered:', reg.scope);
      })
      .catch(err => {
        // Silencia erros de segurança/origem comuns em ambientes de sandbox/iframe
        if (err.name === 'SecurityError' || err.message.includes('origin')) {
          console.debug('CryptoAI: Service Worker registration skipped due to environment restrictions.');
        } else {
          console.warn('CryptoAI: SW Registration Failed:', err);
        }
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
