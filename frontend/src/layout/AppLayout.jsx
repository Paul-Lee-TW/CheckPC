import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/scan', label: '掃描' },
  { to: '/history', label: '歷史紀錄' },
  { to: '/settings', label: '設定' },
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-8">
          <h1 className="text-lg font-bold text-primary whitespace-nowrap">
            CheckPC
          </h1>
          <nav className="flex gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-muted hover:bg-gray-100'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
