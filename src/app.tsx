import { LocationProvider, Router, Route } from 'preact-iso';
import { ListView } from './routes/ListView';
import { EntryView } from './routes/EntryView';
import { SettingsView } from './routes/SettingsView';
import { ToastHost } from './ui/ToastHost';
import { recordNavigation } from './ui/history';
import PWABadge from './PWABadge.tsx';
import './app.css';

function NotFound() {
  return (
    <div class="page">
      <p>ページが見つかりませんでした。</p>
      <a class="btn" href="/">
        一覧へ戻る
      </a>
    </div>
  );
}

export function App() {
  return (
    <LocationProvider>
      <main class="app">
        {/* 遷移のたびに履歴エントリへ深さを刻む（「一覧へ戻る」で巻き戻す量の判断に使う）。 */}
        <Router onRouteChange={recordNavigation}>
          <Route path="/" component={ListView} />
          <Route path="/entry/new" component={EntryView} />
          <Route path="/entry/:id" component={EntryView} />
          <Route path="/settings" component={SettingsView} />
          <Route default component={NotFound} />
        </Router>
      </main>
      <ToastHost />
      <PWABadge />
    </LocationProvider>
  );
}
