import { useEffect, useRef, useState } from 'react';
import { useChat } from '../store/chat';
import { ChatView } from './ChatView';
import { SettingsDialog } from './SettingsDialog';
import { Sidebar } from './Sidebar';
import { cx } from './ui';

export function ChatLayout() {
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { loadConversations, loadPersonas, loadTools, newChat } = useChat();

  useEffect(() => {
    void loadConversations('');
    void loadPersonas();
    void loadTools();
  }, [loadConversations, loadPersonas, loadTools]);

  // 단축키: Ctrl+Shift+O 새 대화, Ctrl+K 검색, Esc 드로어 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        newChat();
      } else if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDrawer(true);
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        setDrawer(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* 모바일 드로어 배경 */}
      <div
        onClick={() => setDrawer(false)}
        className={cx(
          'fixed inset-0 z-(--z-drawer) bg-overlay transition-opacity duration-(--duration-layout) md:hidden',
          drawer ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        className={cx(
          'z-(--z-drawer) w-72 shrink-0 transition-transform duration-(--duration-layout)',
          'max-md:fixed max-md:inset-y-0 max-md:left-0',
          drawer ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
      >
        <Sidebar searchRef={searchRef} onNavigate={() => setDrawer(false)} onOpenSettings={() => setSettings(true)} />
      </aside>
      <ChatView onOpenSidebar={() => setDrawer(true)} />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
