import { useEffect, useState, type ReactNode } from 'react';
import '@fontsource-variable/inter';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import { useRoute, href } from './router';
import { Icon } from '../components/ui/icons';
import { ToastProvider } from '../components/ui/ui';
import { requestPersistentStorage } from '../services/storage';
import DashboardPage from '../pages/DashboardPage';
import NewEventPage from '../pages/NewEventPage';
import EventWorkspace from '../pages/event/EventWorkspace';
import PeoplePage from '../pages/PeoplePage';
import HistoryPage from '../pages/HistoryPage';
import BackupPage from '../pages/BackupPage';
import HelpPage from '../pages/HelpPage';
import SeriesPage from '../pages/SeriesPage';

const NAV = [
  { path: '', label: 'Dashboard', icon: Icon.Home },
  { path: 'people', label: 'People & groups', icon: Icon.Users },
  { path: 'history', label: 'Exchange history', icon: Icon.History },
  { path: 'backup', label: 'Backups & imports', icon: Icon.Save },
  { path: 'help', label: 'Privacy & help', icon: Icon.Shield },
];

function Brand() {
  return (
    <a href={href('')} className="flex items-center gap-2.5 rounded-lg">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-berry-600 text-white shadow-sm">
        <Icon.Gift className="h-5 w-5" />
      </span>
      <span className="font-display text-lg font-semibold leading-tight text-white">
        Secret Santa
        <span className="block text-[11px] font-sans font-medium uppercase tracking-[0.14em] text-gold-300">Organiser</span>
      </span>
    </a>
  );
}

function Shell({ children, active }: { children: ReactNode; active: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [active]);
  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map((item) => {
        const isActive = item.path === active;
        return (
          <a
            key={item.path}
            href={href(item.path)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-white/10 text-white' : 'text-pine-100 hover:bg-white/5 hover:text-white'
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded bg-white px-3 py-2 text-sm font-semibold" onClick={(e) => {
        e.preventDefault();
        document.getElementById('main')?.focus();
      }}>
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <div className="hidden w-64 shrink-0 bg-pine-950 lg:block">
        <aside className="sticky top-0 flex h-screen flex-col gap-8 px-4 py-6">
          <Brand />
          {nav}
          <div className="mt-auto rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-pine-200">
            <Icon.Lock className="mb-1 h-4 w-4 text-gold-300" />
            Your workspace lives only in this browser. Export a backup to keep it safe or move devices.
          </div>
        </aside>
      </div>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-pine-950 px-4 py-3 lg:hidden">
        <Brand />
        <button type="button" className="btn-ghost btn-sm text-white hover:bg-white/10" aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen((o) => !o)}>
          <Icon.Menu className="h-6 w-6" />
          <span className="sr-only">Menu</span>
        </button>
      </div>
      {menuOpen ? (
        <div id="mobile-nav" className="sticky top-[60px] z-20 bg-pine-950 px-4 pb-4 lg:hidden">
          {nav}
        </div>
      ) : null}
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

export default function OrganiserApp() {
  const { segments, query } = useRoute();
  useEffect(() => {
    void requestPersistentStorage();
    document.title = 'Secret Santa Organiser';
  }, []);
  const [first, second, third] = segments;
  let page: ReactNode;
  let active = '';
  switch (first) {
    case undefined:
      page = <DashboardPage />;
      break;
    case 'events':
      if (second === 'new') page = <NewEventPage seriesId={query.get('series') ?? undefined} />;
      else if (second) page = <EventWorkspace eventId={second} step={third} />;
      else page = <DashboardPage />;
      break;
    case 'series':
      page = second ? <SeriesPage seriesId={second} /> : <DashboardPage />;
      break;
    case 'people':
      active = 'people';
      page = <PeoplePage tab={second} />;
      break;
    case 'history':
      active = 'history';
      page = <HistoryPage />;
      break;
    case 'backup':
      active = 'backup';
      page = <BackupPage />;
      break;
    case 'help':
      active = 'help';
      page = <HelpPage />;
      break;
    default:
      page = (
        <div className="py-20 text-center">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <a className="btn-primary mt-4" href={href('')}>
            Back to dashboard
          </a>
        </div>
      );
  }
  return (
    <ToastProvider>
      <Shell active={active}>{page}</Shell>
    </ToastProvider>
  );
}
