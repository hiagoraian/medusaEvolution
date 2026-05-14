import { useState, useEffect } from 'react';
import { TrendingUp, Clock, AlertTriangle, Flame, Activity } from 'lucide-react';
import { getDashboardStats } from '../services/api.js';

// ── Configuração dos cards ────────────────────────────────────────────────────

const CARD_DEFS = [
  {
    key:    'totalEnviados',
    label:  'Total Enviados',
    icon:   TrendingUp,
    color:  'text-emerald-600',
    bg:     'bg-emerald-50',
    border: 'border-emerald-200',
    iconBg: 'bg-emerald-100',
  },
  {
    key:    'totalPendentes',
    label:  'Aguardando (Pendentes)',
    icon:   Clock,
    color:  'text-amber-600',
    bg:     'bg-amber-50',
    border: 'border-amber-200',
    iconBg: 'bg-amber-100',
  },
  {
    key:    'totalFalhas',
    label:  'Falhas Técnicas',
    icon:   AlertTriangle,
    color:  'text-red-600',
    bg:     'bg-red-50',
    border: 'border-red-200',
    iconBg: 'bg-red-100',
  },
  {
    key:    'warmup',
    label:  'Aquecimento Ativo',
    icon:   Flame,
    color:  'text-emerald-600',
    bg:     'bg-emerald-50',
    border: 'border-emerald-200',
    iconBg: 'bg-emerald-100',
    static: '0 chips',
    badge:  'Inativo',
  },
];

// ── Sub-componentes ───────────────────────────────────────────────────────────

function StatCard({ def, value }) {
  const Icon        = def.icon;
  const displayVal  = def.static ?? (value ?? 0).toLocaleString('pt-BR');

  return (
    <div className={`rounded-xl border ${def.border} ${def.bg} p-6 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className={`${def.iconBg} rounded-lg p-2`}>
          <Icon size={16} className={def.color} strokeWidth={2} />
        </div>
        {def.badge && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
            {def.badge}
          </span>
        )}
      </div>
      <div>
        <p className={`text-3xl font-bold ${def.color} leading-none`}>{displayVal}</p>
        <p className="text-sm font-medium text-gray-500 mt-1">{def.label}</p>
      </div>
    </div>
  );
}

function CampaignBanner({ campanhaAtiva }) {
  if (!campanhaAtiva) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
        <p className="text-sm text-gray-400">Nenhuma campanha em execução.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
      <p className="text-sm text-emerald-800">
        Campanha ativa:{' '}
        <span className="font-bold">{campanhaAtiva}</span>
        {' '}— Disparando em background...
      </p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const INITIAL_STATS = {
  totalEnviados:  0,
  totalPendentes: 0,
  totalFalhas:    0,
  campanhaAtiva:  null,
};

export default function Dashboard() {
  const [stats,      setStats]      = useState(INITIAL_STATS);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [offline,    setOffline]    = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data } = await getDashboardStats();
        setStats(data);
        setLastUpdate(new Date());
        setOffline(false);
      } catch {
        setOffline(true);
      }
    }

    fetchStats();
    const id = setInterval(fetchStats, 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-8">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Visão geral da campanha atual</p>
        </div>

        {/* Indicador de atualização */}
        <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border
                         ${offline
                           ? 'bg-red-50 border-red-200 text-red-500'
                           : 'bg-gray-100 border-gray-200 text-gray-400'
                         }`}>
          <Activity size={11} className={offline ? 'text-red-400' : 'text-gray-400'} />
          {offline
            ? 'Backend offline'
            : lastUpdate
              ? `Atualizado às ${lastUpdate.toLocaleTimeString('pt-BR')}`
              : 'Aguardando...'
          }
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {CARD_DEFS.map((def) => (
          <StatCard key={def.key} def={def} value={stats[def.key]} />
        ))}
      </div>

      {/* Banner de campanha ativa */}
      <CampaignBanner campanhaAtiva={stats.campanhaAtiva} />

      {/* Atividade Recente */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Atividade Recente</h2>

        {stats.totalEnviados === 0 && stats.totalPendentes === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma campanha iniciada ainda.</p>
        ) : (
          <div className="space-y-3">

            {/* Barra de progresso */}
            {(() => {
              const total  = stats.totalEnviados + stats.totalPendentes + stats.totalFalhas;
              const pctEnv = total ? Math.round((stats.totalEnviados  / total) * 100) : 0;
              const pctPen = total ? Math.round((stats.totalPendentes / total) * 100) : 0;
              const pctFal = total ? Math.round((stats.totalFalhas    / total) * 100) : 0;

              return (
                <>
                  <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-gray-100">
                    {pctEnv > 0 && (
                      <div className="bg-emerald-400 transition-all duration-700"
                           style={{ width: `${pctEnv}%` }} title={`Enviados: ${pctEnv}%`} />
                    )}
                    {pctPen > 0 && (
                      <div className="bg-amber-400 transition-all duration-700"
                           style={{ width: `${pctPen}%` }} title={`Pendentes: ${pctPen}%`} />
                    )}
                    {pctFal > 0 && (
                      <div className="bg-red-400 transition-all duration-700"
                           style={{ width: `${pctFal}%` }} title={`Falhas: ${pctFal}%`} />
                    )}
                  </div>

                  <div className="flex gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Enviados {pctEnv}%
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      Pendentes {pctPen}%
                    </span>
                    {pctFal > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-400" />
                        Falhas {pctFal}%
                      </span>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
