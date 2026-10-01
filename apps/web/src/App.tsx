import { useEffect } from 'react';
import { ChatLayout } from './components/ChatLayout';
import { ConnectionBanner, UpdatePrompt } from './components/Banners';
import { LoginPage } from './components/LoginPage';
import { Spinner } from './components/ui';
import { useAuth } from './store/auth';

export function App() {
  const { status, init } = useAuth();

  useEffect(() => void init(), [init]);

  return (
    <div className="flex h-dvh flex-col">
      {status === 'authed' && <ConnectionBanner />}
      <div className="min-h-0 flex-1">
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center text-fg-muted">
            <Spinner size={24} />
          </div>
        )}
        {status === 'guest' && <LoginPage />}
        {status === 'authed' && <ChatLayout />}
      </div>
      <UpdatePrompt />
    </div>
  );
}
