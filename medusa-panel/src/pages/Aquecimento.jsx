import { useState, useEffect } from 'react';
import {
  Flame, Calendar, Zap, Settings2,
  Save, RefreshCw, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import { getWarmupConfig, updateWarmupConfig, getConnectedInstances } from '../services/api.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const DAYS = [
  { value: 0, short: 'D', long: 'Dom' },
  { value: 1, short: 'S', long: 'Seg' },
  { value: 2, short: 'T', long: 'Ter' },
  { value: 3, short: 'Q', long: 'Qua' },
  { value: 4, short: 'Q', long: 'Qui' },
  { value: 5, short: 'S', long: 'Sex' },
  { value: 6, short: 'S', long: 'Sáb' },
];

const LEVEL_LABELS = {
  1: { label: 'Apenas Texto',          desc: 'Seguro — ideal para chips novos',              color: 'text-emerald-600' },
  2: { label: 'Apenas Texto',          desc: 'Seguro — volume um pouco maior',               color: 'text-emerald-600' },
  3: { label: 'Texto + Mídia',         desc: 'Humano — imagens + textos variados',           color: 'text-amber-600'   },
  4: { label: 'Texto + Mídia + Áudio', desc: 'Intenso — comportamento diversificado',        color: 'text-orange-500'  },
  5: { label: 'Máximo (Humano)',        desc: 'Intenso — maior frequência + todos os tipos', color: 'text-red-500'     },
};

// WA-01 a WA-48 (WA-49 é admin/inbound, não entra no aquecimento)
const CAMPAIGN_IDS = Array.from({ length: 48 }, (_, i) => `WA-${String(i + 1).padStart(2, '0')}`);

// ── Sub-componentes ───────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5 ${className}`}>
      <div className="flex items-center gap-2.5">
        <Icon size={18} className="text-emerald-500" />
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Aquecimento() {
  const [active,      setActive]      = useState(false);
  const [level,       setLevel]       = useState(3);
  const [allowedDays, setAllowedDays] = useState([1, 2, 3, 4, 5]);
  const [activeZaps,  setActiveZaps]  = useState([]);
  const [instances,   setInstances]   = useState({});

  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState(null);

  // ── Carrega config + instâncias ───────────────────────────────────────────
  async function loadAll() {
    setLoading(true);
    setFeedback(null);
    try {
      const [cfgRes, instRes] = await Promise.all([
        getWarmupConfig(),
        getConnectedInstances(),
      ]);
      const cfg = cfgRes.data;
      const map = {};
      instRes.data.forEach((i) => { map[i.id] = i; });

      setActive(cfg.active);
      setLevel(cfg.level);
      setAllowedDays(cfg.allowedDays);
      setActiveZaps(cfg.activeZaps);
      setInstances(map);
    } catch {
      setFeedback({ type: 'error', message: 'Não foi possível carregar a configuração do backend.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      await updateWarmupConfig({ active, level, allowedDays, activeZaps });
      setFeedback({ type: 'success', message: 'Configurações salvas com sucesso!' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.error ?? err.message });
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day) {
    setAllowedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function toggleZap(id) {
    setActiveZaps((prev) =>
      prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]
    );
  }

  const levelInfo = LEVEL_LABELS[level] ?? LEVEL_LABELS[3];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Aquecimento de Chips</h1>
          <p className="text-sm text-gray-500 mt-1">
            Simulação de comportamento humano para proteção dos JIDs.
          </p>
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300
                     text-sm font-medium text-gray-600 hover:bg-gray-50
                     disabled:opacity-50 transition"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Recarregar
        </button>
      </div>

      {/* Aviso fixo */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200
                      rounded-2xl px-5 py-4 text-sm text-amber-800">
        <Calendar size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
        <span>
          O aquecimento funciona automaticamente entre <strong>08:00 e 20:00</strong> nos dias selecionados.
          Fora desse horário o motor fica em silêncio.
        </span>
      </div>

      {/* Grid 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Card 1: Status do Motor ──────────────────────────────────────── */}
        <SectionCard icon={Flame} title="Status do Motor">
          <p className="text-sm text-gray-500">
            Ligue para ativar o envio automático de mensagens de aquecimento.
          </p>
          <button
            onClick={() => setActive((v) => !v)}
            className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl
                        border-2 transition-all duration-200 cursor-pointer
                        ${active
                          ? 'bg-emerald-50 border-emerald-400'
                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                        }`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${active ? 'bg-emerald-500' : 'bg-gray-300'} transition-colors`}>
                <Flame size={22} className="text-white" />
              </div>
              <div className="text-left">
                <p className={`text-base font-bold ${active ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {active ? 'Motor Ativado' : 'Motor Desligado'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {active ? 'Enviando mensagens nos horários permitidos' : 'Clique para ligar'}
                </p>
              </div>
            </div>
            <div className={`relative w-14 h-7 rounded-full transition-colors duration-200
                             ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md
                                transition-transform duration-200
                                ${active ? 'translate-x-7' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </SectionCard>

        {/* ── Card 2: Intensidade ──────────────────────────────────────────── */}
        <SectionCard icon={Settings2} title="Intensidade (Nível)">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Nível selecionado:</span>
            <span className={`text-sm font-bold ${levelInfo.color}`}>
              {level} — {levelInfo.label}
            </span>
          </div>
          <input
            type="range" min={1} max={5} step={1}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer
                       accent-emerald-500 bg-gray-200"
          />
          <div className="flex justify-between text-xs text-gray-400 -mt-1 px-0.5">
            {[1,2,3,4,5].map((n) => (
              <span key={n} className={n === level ? 'font-bold text-emerald-600' : ''}>{n}</span>
            ))}
          </div>
          <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 border text-sm
                           ${level <= 2
                             ? 'bg-emerald-50 border-emerald-200'
                             : level <= 3
                               ? 'bg-amber-50 border-amber-200'
                               : 'bg-red-50 border-red-200'
                           }`}>
            <Flame size={15} className={`flex-shrink-0 mt-0.5 ${levelInfo.color}`} />
            <div>
              <p className={`font-semibold ${levelInfo.color}`}>{levelInfo.label}</p>
              <p className="text-gray-500 text-xs mt-0.5">{levelInfo.desc}</p>
            </div>
          </div>
        </SectionCard>

        {/* ── Card 3: Dias de Operação ─────────────────────────────────────── */}
        <SectionCard icon={Calendar} title="Dias de Operação">
          <p className="text-sm text-gray-500">
            Selecione em quais dias da semana o motor pode disparar.
          </p>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((d) => {
              const selected = allowedDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  onClick={() => toggleDay(d.value)}
                  title={d.long}
                  className={`flex flex-col items-center justify-center
                              w-12 h-14 rounded-xl text-sm font-semibold
                              border-2 transition-all duration-150
                              ${selected
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                              }`}
                >
                  <span className="text-xs opacity-70">{d.long}</span>
                  <span className="text-base leading-none">{d.short}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            {allowedDays.length === 0
              ? 'Nenhum dia selecionado — o motor ficará inativo.'
              : `${allowedDays.length} dia${allowedDays.length > 1 ? 's' : ''} selecionado${allowedDays.length > 1 ? 's' : ''}.`
            }
          </p>
        </SectionCard>

        {/* ── Card 4: Seleção de Zaps (full width) ─────────────────────────── */}
        <SectionCard icon={Zap} title="Zaps para Aquecer" className="lg:col-span-2">
          <div className="flex items-center justify-between -mt-1">
            <p className="text-sm text-gray-500">
              Marque quais chips participam do aquecimento. WA-49 é reservado para inbound.
            </p>
            <span className="text-xs font-medium text-gray-400 whitespace-nowrap ml-4">
              {activeZaps.length === 0
                ? 'Nenhum selecionado'
                : `${activeZaps.length} selecionado${activeZaps.length > 1 ? 's' : ''}`
              }
            </span>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <Loader2 size={14} className="animate-spin" />
              Carregando instâncias...
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {CAMPAIGN_IDS.map((id) => {
                const online  = instances[id]?.online ?? false;
                const checked = activeZaps.includes(id);
                return (
                  <label
                    key={id}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2
                                cursor-pointer transition-all text-center select-none
                                ${checked
                                  ? 'border-emerald-400 bg-emerald-50'
                                  : 'border-transparent hover:border-gray-200 bg-gray-50'
                                }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0
                                      ${online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                    <span className="text-[10px] font-bold text-gray-700 leading-none">{id}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleZap(id)}
                      className="h-3 w-3 accent-emerald-500 cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </SectionCard>

      </div>

      {/* ── Área de ação ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
                     disabled:bg-gray-200 disabled:cursor-not-allowed
                     text-white disabled:text-gray-400 font-semibold text-sm
                     px-6 py-3 rounded-xl shadow-md transition-colors duration-150"
        >
          {saving
            ? <><Loader2 size={15} className="animate-spin" /> Salvando...</>
            : <><Save size={15} /> Salvar Configurações</>
          }
        </button>

        {feedback && (
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border text-sm
                           ${feedback.type === 'success'
                             ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                             : 'bg-red-50 border-red-200 text-red-600'
                           }`}>
            {feedback.type === 'success'
              ? <CheckCircle size={15} className="flex-shrink-0" />
              : <AlertCircle size={15} className="flex-shrink-0" />
            }
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  );
}
