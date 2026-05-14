import { useState, useEffect } from 'react';
import {
  PieChart, Download, CheckCircle, AlertTriangle,
  Clock, RefreshCw, FileText, AlertCircle,
} from 'lucide-react';
import { getCampaignsHistory } from '../services/api.js';

const API_BASE = 'http://localhost:3000/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportUrl(campaignId, status) {
  return `${API_BASE}/reports/export/${encodeURIComponent(campaignId)}/${status}`;
}

function campaignStatus(c) {
  if (!c.enabled)           return { label: 'Pausada',       color: 'gray' };
  if (c.totalPendentes > 0) return { label: 'Em andamento',  color: 'emerald' };
  return                           { label: 'Concluída',      color: 'blue' };
}

const COLOR = {
  emerald: 'bg-emerald-100 text-emerald-700',
  blue:    'bg-blue-100 text-blue-700',
  gray:    'bg-gray-100 text-gray-500',
};

const DOT = {
  emerald: 'bg-emerald-400 animate-pulse',
  blue:    'bg-blue-400',
  gray:    'bg-gray-400',
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

function StatusBadge({ campaign }) {
  const s = campaignStatus(campaign);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${COLOR[s.color]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.color]}`} />
      {s.label}
    </span>
  );
}

function ProgressBar({ campaign }) {
  const { total, totalEnviados, totalFalhas, totalPendentes } = campaign;
  if (!total) return <span className="text-xs text-gray-400">—</span>;

  const pEnviados  = (totalEnviados  / total) * 100;
  const pFalhas    = (totalFalhas    / total) * 100;
  const pPendentes = (totalPendentes / total) * 100;

  return (
    <div className="w-32">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 gap-px">
        <div className="bg-emerald-400 transition-all" style={{ width: `${pEnviados}%` }} />
        <div className="bg-red-400 transition-all"     style={{ width: `${pFalhas}%` }} />
        <div className="bg-amber-300 transition-all"   style={{ width: `${pPendentes}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {pEnviados.toFixed(0)}% enviado
      </p>
    </div>
  );
}

function DownloadBtn({ href, icon: Icon, label, color }) {
  const base = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 border';
  const styles = {
    red:  `${base} border-red-200 text-red-600 hover:bg-red-50`,
    gray: `${base} border-gray-200 text-gray-500 hover:bg-gray-50`,
  };

  return (
    <a href={href} target="_blank" rel="noreferrer" download className={styles[color]}>
      <Icon size={12} />
      {label}
    </a>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Relatorios() {
  const [campaigns,  setCampaigns]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  async function fetchHistory() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getCampaignsHistory();
      setCampaigns(data);
    } catch {
      setError('Não foi possível conectar ao backend.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchHistory(); }, []);

  return (
    <div className="space-y-8">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Relatórios</h1>
          <p className="text-sm text-gray-500 mt-1">Histórico e exportação de dados das campanhas.</p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300
                     text-sm font-medium text-gray-600 hover:bg-gray-50
                     disabled:opacity-50 transition"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Erro de conexão */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200
                        rounded-2xl px-5 py-4 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Legenda das cores */}
        <div className="flex items-center gap-5 px-6 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-2">
            Legenda da barra
          </p>
          {[
            { color: 'bg-emerald-400', label: 'Enviados' },
            { color: 'bg-red-400',     label: 'Falhas' },
            { color: 'bg-amber-300',   label: 'Pendentes' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`h-2 w-2 rounded-full ${color}`} />
              {label}
            </span>
          ))}
        </div>

        {loading && !campaigns.length ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">Carregando campanhas...</span>
          </div>
        ) : !campaigns.length ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
            <FileText size={32} className="opacity-30" />
            <p className="text-sm">Nenhuma campanha encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-6 py-4">Campanha</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Progresso</th>
                  <th className="px-4 py-4 text-right">
                    <span className="flex items-center justify-end gap-1">
                      <CheckCircle size={12} className="text-emerald-500" />
                      Enviados
                    </span>
                  </th>
                  <th className="px-4 py-4 text-right">
                    <span className="flex items-center justify-end gap-1">
                      <AlertTriangle size={12} className="text-red-400" />
                      Falhas
                    </span>
                  </th>
                  <th className="px-4 py-4 text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Clock size={12} className="text-amber-400" />
                      Pendentes
                    </span>
                  </th>
                  <th className="px-6 py-4">Exportar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">

                    {/* Nome */}
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800 truncate max-w-[220px]" title={c.id}>
                        {c.id}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(c.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <StatusBadge campaign={c} />
                    </td>

                    {/* Progresso */}
                    <td className="px-4 py-4">
                      <ProgressBar campaign={c} />
                    </td>

                    {/* Enviados (inclui inválidos) */}
                    <td className="px-4 py-4 text-right">
                      <span className="font-semibold text-gray-700">
                        {c.totalEnviados.toLocaleString('pt-BR')}
                      </span>
                      {c.totalInvalidos > 0 && (
                        <span className="block text-xs text-gray-400">
                          {c.totalInvalidos.toLocaleString('pt-BR')} inválidos
                        </span>
                      )}
                    </td>

                    {/* Falhas */}
                    <td className="px-4 py-4 text-right">
                      <span className={`font-semibold ${c.totalFalhas > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {c.totalFalhas.toLocaleString('pt-BR')}
                      </span>
                    </td>

                    {/* Pendentes */}
                    <td className="px-4 py-4 text-right">
                      <span className={`font-semibold ${c.totalPendentes > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {c.totalPendentes.toLocaleString('pt-BR')}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        {c.totalFalhas > 0 && (
                          <DownloadBtn
                            href={exportUrl(c.id, 'falha_tecnica')}
                            icon={Download}
                            label="Falhas (.txt)"
                            color="red"
                          />
                        )}
                        {c.totalInvalidos > 0 && (
                          <DownloadBtn
                            href={exportUrl(c.id, 'invalido')}
                            icon={Download}
                            label="Inválidos (.txt)"
                            color="gray"
                          />
                        )}
                        {c.totalFalhas === 0 && c.totalInvalidos === 0 && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
