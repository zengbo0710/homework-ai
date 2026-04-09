import { Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">HomeworkAI</span>
        <span className="text-sm opacity-75">Tokens: –</span>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <div className="pb-safe" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
    </div>
  );
}
