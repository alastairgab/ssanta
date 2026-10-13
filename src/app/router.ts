import { useEffect, useState } from 'react';

/**
 * Minimal hash router for the organiser UI: "#/events/<id>/rules".
 * Hash routing needs no server rewrites, so deep links work on GitHub Pages after refresh.
 */
export function parseRoute(hash: string): string[] {
  const raw = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  return raw.split('/').filter(Boolean).map(decodeURIComponent);
}

export function routeQuery(hash: string): URLSearchParams {
  const q = hash.split('?')[1] ?? '';
  return new URLSearchParams(q);
}

export function navigate(path: string) {
  const target = `#/${path.replace(/^\/+/, '')}`;
  if (window.location.hash !== target) window.location.hash = target;
  window.scrollTo?.({ top: 0 });
}

export function useRoute(): { segments: string[]; query: URLSearchParams } {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return { segments: parseRoute(hash), query: routeQuery(hash) };
}

export const href = (path: string) => `#/${path.replace(/^\/+/, '')}`;
