import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { StartPage } from './StartPage';
import { UpdatePrompt } from './UpdatePrompt';

export function App() {
  return (
    <HashRouter>
      <div className="h-full overflow-y-auto overscroll-contain pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <UpdatePrompt />
    </HashRouter>
  );
}
