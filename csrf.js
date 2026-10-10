(function () {
  function getCsrfToken() {
    const cookies = (document.cookie || '').split(';');
    for (const raw of cookies) {
      const part = raw.trim();
      if (part.startsWith('merisia_csrf=')) {
        return decodeURIComponent(part.slice('merisia_csrf='.length));
      }
    }
    return null;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    init = init || {};
    const requestMethod = init.method
      || (input && typeof input === 'object' && input.method)
      || 'GET';
    const method = String(requestMethod).toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return originalFetch(input, init);
    }
    const token = getCsrfToken();
    if (token) {
      const headers = new Headers(
        init.headers || (input && typeof input === 'object' && input.headers) || {}
      );
      if (!headers.has('x-csrf-token')) headers.set('x-csrf-token', token);
      init.headers = headers;
    }
    return originalFetch(input, init);
  };
})();
