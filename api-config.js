/* Shared browser configuration. Keep local development completely local. */
(() => {
  const hostname = window.location.hostname;
  const isLocal = window.location.protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1';
  const localOrigin = 'http://localhost:3001';

  window.ScrapMeConfig = Object.freeze({
    isLocal,
    appOrigin: isLocal ? localOrigin : 'https://www.scrapme.in',
    apiBase: isLocal ? `${localOrigin}/api` : 'https://scrapme-backend.onrender.com/api'
  });
})();
