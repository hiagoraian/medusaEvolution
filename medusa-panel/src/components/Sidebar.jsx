import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Flame,
  Send,
  Settings,
  Zap,
  PieChart,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/',              label: 'Dashboard',        icon: LayoutDashboard, end: true },
  { to: '/relatorios',    label: 'Relatórios',       icon: PieChart },
  { to: '/listas',        label: 'Gestão de Listas', icon: Users },
  { to: '/aquecimento',   label: 'Aquecimento',      icon: Flame },
  { to: '/disparo',       label: 'Disparo',          icon: Send },
  { to: '/configuracoes', label: 'Configurações',    icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-white h-screen flex flex-col flex-shrink-0">

      {/* Marca */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
        <div className="bg-emerald-500 rounded-lg p-1.5">
          <Zap size={18} className="text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-white font-bold text-base leading-none">Medusa</p>
          <p className="text-gray-400 text-xs mt-0.5">Painel de Controle</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ` +
              (isActive
                ? 'bg-gray-800 text-emerald-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100')
            }
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Rodapé */}
      <div className="px-6 py-4 border-t border-gray-700">
        <p className="text-gray-500 text-xs">medusaEvolution © 2025</p>
      </div>
    </aside>
  );
}
