import { lazy, Suspense, useEffect, useState } from 'react';

const OrganiserApp = lazy(() => import('./app/OrganiserApp'));
const ParticipantApp = lazy(() => import('./reveal/ParticipantApp'));

/** Participant links use #r= / #q= / #a= / #w= fragments; everything else is the organiser app. */
export function isParticipantHash(hash: string): boolean {
  return /^#[rqaw]=/.test(hash);
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-pine-950 text-gold-200" role="status" aria-live="polite">
      <span className="animate-pulse font-display text-lg">Unwrapping…</span>
    </div>
  );
}

export default function App() {
  const [participantMode, setParticipantMode] = useState(() => isParticipantHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setParticipantMode(isParticipantHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return <Suspense fallback={<Loading />}>{participantMode ? <ParticipantApp /> : <OrganiserApp />}</Suspense>;
}
