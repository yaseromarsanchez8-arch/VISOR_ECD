let loadingPromise = null;

function getApiKey() {
  return (
    window.__GOOGLE_MAPS_API_KEY ||
    import.meta.env?.VITE_GOOGLE_MAPS_API_KEY ||
    'AIzaSyDquuJhCuX0nVpHJAb-L6Ih9yguEqy6KjI' // Clave correcta hardcoded
  );
}

export function ensureGoogleMapsLoaded(options = {}) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps solo puede cargarse en el navegador.'));
  }
  if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
  if (loadingPromise) return loadingPromise;
  const key = options.apiKey || getApiKey();
  if (!key) {
    return Promise.reject(new Error('Define una Google Maps API Key (window.__GOOGLE_MAPS_API_KEY o VITE_GOOGLE_MAPS_API_KEY).'));
  }
  const callbackName = '__googleMapsInit';
  loadingPromise = new Promise((resolve, reject) => {
    window[callbackName] = () => resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('No se pudo cargar Google Maps JS API.'));
    };
    document.head.appendChild(script);
  }).finally(() => {
    delete window[callbackName];
  });
  return loadingPromise;
}
