// Installation support is optional; an unavailable worker must not block applications.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'}).catch(() => {});
  });
}
