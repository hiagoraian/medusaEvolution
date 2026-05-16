import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send, Clock, ShieldAlert, MessageSquare, Eye, Smartphone,
  Square, RefreshCw, CheckCircle, AlertCircle, Loader2, X, Zap,
  Image as ImageIcon, Film, Upload, Calendar,
} from 'lucide-react';
import {
  startCampaign, stopCampaign, getCampaignStatus, sendTestMessage,
  getLists, getConnectedInstances, uploadMedia,
} from '../services/api.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const CAMPAIGN_IDS = Array.from({ length: 48 }, (_, i) => `WA-${String(i + 1).padStart(2, '0')}`);

// ── Sub-componentes utilitários ───────────────────────────────────────────────

function InputLabel({ children }) {
  return <label className="block text-sm font-medium text-gray-700 mb-1.5">{children}</label>;
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <Icon size={18} className="text-emerald-500" />
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ModalBackdrop({ onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

function formatLocal(dtLocal) {
  if (!dtLocal) return '—';
  const [date, time] = dtLocal.split('T');
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y} ${time}`;
}

// ── Modal: Visualizar Plano ───────────────────────────────────────────────────

function ModalPlan({
  campaignId, durationHours, maxPerZap, zaps, texts,
  media, startAt, endAt,
  isStarting, onStart, onClose,
}) {
  const delayMin    = maxPerZap > 0 ? ((durationHours * 60) / maxPerZap).toFixed(1) : '∞';
  const zapList     = Array.isArray(zaps) ? zaps : [];
  const filledTexts = texts.map((t, i) => ({ label: ['A','B','C'][i], text: t })).filter((t) => t.text.trim());

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Eye size={18} className="text-emerald-500" />
            <h2 className="text-base font-semibold text-gray-800">Visualizar Plano</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <Row label="Campanha ID"  value={campaignId || '—'} />
            <Row label="Duração"      value={`${durationHours} hora${durationHours !== 1 ? 's' : ''}`} />
            <Row label="Máx. / Zap"   value={`${maxPerZap} mensagens`} />
            <Row
              label="Zaps Alocados"
              value={zapList.length ? zapList.join(', ') : '— (detecta automaticamente)'}
            />
            {media && (
              <Row label="Mídia" value={`${media.fileName} (${media.sizeKb} KB)`} />
            )}
            {startAt && (
              <Row label="Início agendado" value={formatLocal(startAt)} />
            )}
            {endAt && (
              <Row label="Fim agendado" value={formatLocal(endAt)} />
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              Matemática de Segurança
            </p>
            <p className="text-sm text-amber-800">
              Com <strong>{durationHours}h</strong> e limite de{' '}
              <strong>{maxPerZap} msgs/zap</strong>, o delay estimado entre disparos é de{' '}
              <strong>{delayMin} min por Zap</strong>.
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Fórmula: ({durationHours}h × 60 min) ÷ {maxPerZap} msgs = {delayMin} min/msg
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Textos disponíveis para sorteio ({filledTexts.length})
            </p>
            {filledTexts.length === 0 ? (
              <p className="text-sm text-red-500">Nenhum texto preenchido.</p>
            ) : (
              <div className="space-y-2">
                {filledTexts.map(({ label, text }) => (
                  <div key={label} className="flex gap-2">
                    <span className="flex-shrink-0 text-xs font-bold text-gray-400 mt-0.5 w-4">{label}</span>
                    <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 flex-1 leading-relaxed">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium
                       text-gray-600 hover:bg-gray-50 transition"
          >
            Voltar / Editar
          </button>
          <button
            onClick={onStart}
            disabled={isStarting || filledTexts.length === 0 || !campaignId.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
                       disabled:bg-gray-200 disabled:cursor-not-allowed
                       text-white disabled:text-gray-400 text-sm font-semibold
                       shadow-md transition-colors duration-150"
          >
            {isStarting
              ? <><Loader2 size={15} className="animate-spin" /> Iniciando...</>
              : <><Send size={15} /> Iniciar Campanha</>
            }
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Modal: Envio Teste ────────────────────────────────────────────────────────

function ModalTest({ texts, instances, onClose }) {
  const textOptions = texts.map((t, i) => ({ label: ['A','B','C'][i], text: t, i }))
                           .filter((o) => o.text.trim());

  const onlineZaps = Object.values(instances)
    .filter((i) => i.online && i.id !== 'WA-49')
    .sort((a, b) => a.id.localeCompare(b.id));

  const [testZap,     setTestZap]     = useState(onlineZaps[0]?.id ?? '');
  const [testPhone,   setTestPhone]   = useState('');
  const [selectedIdx, setSelectedIdx] = useState(textOptions[0]?.i ?? 0);
  const [isSending,   setIsSending]   = useState(false);
  const [testStatus,  setTestStatus]  = useState(null);

  async function handleSend() {
    const zap   = testZap.trim();
    const phone = testPhone.trim();
    const text  = texts[selectedIdx]?.trim();

    if (!zap || !phone || !text) {
      return setTestStatus({ type: 'error', message: 'Preencha todos os campos.' });
    }

    setIsSending(true);
    setTestStatus(null);
    try {
      await sendTestMessage(zap, phone, text);
      setTestStatus({ type: 'success', message: `Mensagem enfileirada para +${phone} via ${zap}.` });
    } catch (err) {
      setTestStatus({ type: 'error', message: err.response?.data?.error ?? err.message });
    } finally {
      setIsSending(false);
    }
  }

  const canSend = !!testZap && !!testPhone.trim() && textOptions.length > 0;

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Smartphone size={18} className="text-gray-600" />
            <h2 className="text-base font-semibold text-gray-800">Envio Teste</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <InputLabel>Zap Remetente</InputLabel>
            {onlineZaps.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
                Nenhum Zap online. Conecte um chip primeiro.
              </p>
            ) : (
              <select
                value={testZap}
                onChange={(e) => setTestZap(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition"
              >
                {onlineZaps.map((z) => (
                  <option key={z.id} value={z.id}>{z.id}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <InputLabel>Seu Número de Teste</InputLabel>
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Ex: 5511999999999"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                         placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          <div>
            <InputLabel>Texto a Enviar</InputLabel>
            {textOptions.length === 0 ? (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3 border border-red-200">
                Nenhum texto preenchido na campanha.
              </p>
            ) : (
              <select
                value={selectedIdx}
                onChange={(e) => setSelectedIdx(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition"
              >
                {textOptions.map(({ label, text, i }) => (
                  <option key={i} value={i}>
                    Texto {label} — {text.slice(0, 45)}{text.length > 45 ? '…' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {testStatus && (
            <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border text-sm
                             ${testStatus.type === 'success'
                               ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                               : 'bg-red-50 border-red-200 text-red-600'
                             }`}>
              {testStatus.type === 'success'
                ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              }
              {testStatus.message}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={handleSend}
            disabled={isSending || !canSend}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-gray-800 hover:bg-gray-700 active:bg-gray-900
                       disabled:bg-gray-200 disabled:cursor-not-allowed
                       text-white disabled:text-gray-400 text-sm font-semibold
                       transition-colors duration-150"
          >
            {isSending
              ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
              : <><Send size={15} /> Disparar Teste</>
            }
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Disparo() {
  const [campaignId,      setCampaignId]      = useState('');
  const [zaps,            setZaps]            = useState([]);
  const [durationHours,   setDurationHours]   = useState(1);
  const [maxPerZap,       setMaxPerZap]       = useState(30);
  const [texts,           setTexts]           = useState(['', '', '']);
  const [instances,       setInstances]       = useState({});
  const [isStarting,      setIsStarting]      = useState(false);
  const [isStopping,      setIsStopping]      = useState(false);
  const [feedback,        setFeedback]        = useState(null);
  const [campaignState,   setCampaignState]   = useState(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [enabledLists,    setEnabledLists]    = useState([]);
  const [listsLoading,    setListsLoading]    = useState(false);

  // Mídia
  const [mediaUpload,  setMediaUpload]  = useState(null); // { filePath, fileName, mediaType, sizeKb }
  const [mediaPreview, setMediaPreview] = useState(null); // object URL — apenas para imagens
  const [isUploading,  setIsUploading]  = useState(false);
  const fileInputRef = useRef(null);

  // Agendamento
  const [startAt, setStartAt] = useState('');
  const [endAt,   setEndAt]   = useState('');

  // ── Listas habilitadas ────────────────────────────────────────────────────
  const fetchEnabledLists = useCallback(async () => {
    setListsLoading(true);
    try {
      const { data } = await getLists();
      const enabled = data.filter((l) => l.enabled && l.pendentes > 0);
      setEnabledLists(enabled);
      if (campaignId && !enabled.find((l) => l.id === campaignId)) {
        setCampaignId('');
      }
    } catch { /* backend offline */ }
    finally { setListsLoading(false); }
  }, [campaignId]);

  useEffect(() => { fetchEnabledLists(); }, []);

  // ── Instâncias (polling 5 s) ──────────────────────────────────────────────
  const fetchInstances = useCallback(async () => {
    try {
      const { data } = await getConnectedInstances();
      const map = {};
      data.forEach((i) => { map[i.id] = i; });
      setInstances(map);
    } catch { /* backend offline */ }
  }, []);

  useEffect(() => {
    fetchInstances();
    const id = setInterval(fetchInstances, 5_000);
    return () => clearInterval(id);
  }, [fetchInstances]);

  // ── Polling de status da campanha ─────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await getCampaignStatus();
      setCampaignState(data);
    } catch { /* backend offline */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  function setText(index, value) {
    setTexts((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function toggleZap(id) {
    setZaps((prev) =>
      prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]
    );
  }

  // ── Upload de mídia ───────────────────────────────────────────────────────
  async function handleMediaSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const preview = file.type.startsWith('image') ? URL.createObjectURL(file) : null;
    setMediaPreview(preview);
    setIsUploading(true);
    setFeedback(null);
    try {
      const { data } = await uploadMedia(file);
      setMediaUpload(data);
    } catch (err) {
      setFeedback({ type: 'error', message: `Upload falhou: ${err.response?.data?.error ?? err.message}` });
      if (preview) URL.revokeObjectURL(preview);
      setMediaPreview(null);
    } finally {
      setIsUploading(false);
    }
  }

  function handleMediaClear() {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaUpload(null);
    setMediaPreview(null);
  }

  // ── Iniciar ───────────────────────────────────────────────────────────────
  async function handleStart() {
    const id = campaignId.trim();
    if (!id || !texts.some((t) => t.trim())) return;

    setIsStarting(true);
    setFeedback(null);
    try {
      const { data } = await startCampaign({
        campaignId:    id,
        texts:         texts.filter((t) => t.trim()),
        durationHours,
        maxPerZap,
        zaps,
        startAt:       startAt ? new Date(startAt).toISOString() : null,
        endAt:         endAt   ? new Date(endAt).toISOString()   : null,
        media:         mediaUpload
          ? { filePath: mediaUpload.filePath, mediaType: mediaUpload.mediaType }
          : null,
      });
      setIsPlanModalOpen(false);
      setFeedback({
        type:    'success',
        message: `Campanha "${data.campaignId ?? id}" iniciada em background.`,
      });
      await fetchStatus();
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.error ?? err.message });
    } finally {
      setIsStarting(false);
    }
  }

  // ── Parar ─────────────────────────────────────────────────────────────────
  async function handleStop() {
    setIsStopping(true);
    setFeedback(null);
    try {
      const { data } = await stopCampaign();
      setFeedback({ type: 'success', message: data.message ?? 'Parada solicitada.' });
      await fetchStatus();
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.error ?? err.message });
    } finally {
      setIsStopping(false);
    }
  }

  const isRunning   = campaignState?.running;
  const canStop     = isRunning && !campaignState?.stopRequested;
  const canOpenPlan = !!campaignId.trim() && texts.some((t) => t.trim()) && !isRunning && !isUploading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {isPlanModalOpen && (
        <ModalPlan
          campaignId={campaignId}
          durationHours={durationHours}
          maxPerZap={maxPerZap}
          zaps={zaps}
          texts={texts}
          media={mediaUpload}
          startAt={startAt}
          endAt={endAt}
          isStarting={isStarting}
          onStart={handleStart}
          onClose={() => setIsPlanModalOpen(false)}
        />
      )}
      {isTestModalOpen && (
        <ModalTest
          texts={texts}
          instances={instances}
          onClose={() => setIsTestModalOpen(false)}
        />
      )}

      <div className="space-y-8">

        {/* Cabeçalho */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Disparo</h1>
            <p className="text-sm text-gray-500 mt-1">Configure e inicie a campanha no orquestrador.</p>
          </div>

          <div
            onClick={fetchStatus}
            title="Clique para atualizar"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold
                        cursor-pointer select-none border transition
                        ${isRunning
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-gray-100 border-gray-200 text-gray-500'
                        }`}
          >
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`} />
            {isRunning
              ? `Rodando: ${campaignState.campaign?.campaignId ?? '—'}`
              : campaignState?.stopRequested ? 'Encerrando...' : 'Parado'
            }
            <RefreshCw size={11} className="ml-0.5 opacity-50" />
          </div>
        </div>

        {/* Grid de configurações */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ── Regras de Envio ───────────────────────────────────────────── */}
          <Card title="Regras de Envio" icon={ShieldAlert}>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <InputLabel>Lista de Destino</InputLabel>
                <button
                  type="button"
                  onClick={fetchEnabledLists}
                  disabled={listsLoading || isRunning}
                  title="Recarregar listas"
                  className="text-gray-400 hover:text-emerald-500 disabled:opacity-40 transition"
                >
                  <RefreshCw size={13} className={listsLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                disabled={isRunning || listsLoading}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                           bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500
                           disabled:bg-gray-50 disabled:cursor-not-allowed transition"
              >
                <option value="">
                  {listsLoading
                    ? 'Carregando listas...'
                    : enabledLists.length === 0
                      ? 'Nenhuma lista habilitada'
                      : '— Selecione uma lista —'
                  }
                </option>
                {enabledLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id} ({l.pendentes.toLocaleString('pt-BR')} pendentes)
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Apenas listas habilitadas com contatos pendentes aparecem aqui.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <InputLabel>
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} className="text-gray-400" /> Duração (horas)
                  </span>
                </InputLabel>
                <input
                  type="number" min={1} max={24} value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                             focus:outline-none focus:ring-2 focus:ring-emerald-500
                             disabled:bg-gray-50 disabled:cursor-not-allowed transition"
                />
              </div>
              <div>
                <InputLabel>
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert size={13} className="text-gray-400" /> Máx. msgs / Zap
                  </span>
                </InputLabel>
                <input
                  type="number" min={1} max={200} value={maxPerZap}
                  onChange={(e) => setMaxPerZap(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                             focus:outline-none focus:ring-2 focus:ring-emerald-500
                             disabled:bg-gray-50 disabled:cursor-not-allowed transition"
                />
              </div>
            </div>
          </Card>

          {/* ── Conteúdo da Mensagem ──────────────────────────────────────── */}
          <Card title="Conteúdo da Mensagem" icon={MessageSquare}>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              O sistema sorteará um dos textos preenchidos a cada envio.
              Preencha pelo menos um.
            </p>
            {['A', 'B', 'C'].map((label, i) => (
              <div key={label}>
                <InputLabel>Texto {label}</InputLabel>
                <textarea
                  rows={4}
                  value={texts[i]}
                  onChange={(e) => setText(i, e.target.value)}
                  placeholder={i === 0 ? 'Mensagem principal da campanha...' : `Variação ${label} (opcional)`}
                  disabled={isRunning}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-800
                             placeholder-gray-400 resize-none focus:outline-none focus:ring-2
                             focus:ring-emerald-500 disabled:bg-gray-50 disabled:cursor-not-allowed
                             transition leading-relaxed"
                />
              </div>
            ))}
          </Card>

          {/* ── Mídia da Campanha ─────────────────────────────────────────── */}
          <Card title="Mídia da Campanha (opcional)" icon={ImageIcon}>
            <p className="text-xs text-gray-500">
              Imagem ou vídeo enviado junto com a mensagem. O arquivo é carregado uma vez
              e reutilizado para toda a campanha sem repetir o upload a cada envio.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp"
              className="hidden"
              onChange={handleMediaSelect}
              disabled={isRunning || isUploading}
            />

            {!mediaUpload && !isUploading && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning}
                className="flex items-center justify-center gap-2 w-full px-4 py-8 rounded-xl
                           border-2 border-dashed border-gray-300 hover:border-emerald-400
                           text-sm text-gray-500 hover:text-emerald-600 transition
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={16} />
                Escolher arquivo (JPG, PNG, WEBP, MP4)
              </button>
            )}

            {isUploading && (
              <div className="flex items-center gap-3 px-4 py-6 text-sm text-gray-500
                              border-2 border-dashed border-gray-200 rounded-xl justify-center">
                <Loader2 size={15} className="animate-spin text-emerald-500" />
                Enviando para o servidor...
              </div>
            )}

            {mediaUpload && !isUploading && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {mediaPreview ? (
                  <img
                    src={mediaPreview}
                    alt="preview"
                    className="w-full h-40 object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-28 bg-gray-100 gap-2">
                    <Film size={28} className="text-gray-400" />
                    <span className="text-xs text-gray-400">Vídeo</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{mediaUpload.fileName}</p>
                    <p className="text-xs text-gray-400 capitalize">{mediaUpload.mediaType} · {mediaUpload.sizeKb} KB</p>
                  </div>
                  <button
                    onClick={handleMediaClear}
                    disabled={isRunning}
                    title="Remover mídia"
                    className="ml-3 flex-shrink-0 text-gray-400 hover:text-red-500 transition
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* ── Agendamento ───────────────────────────────────────────────── */}
          <Card title="Agendamento (opcional)" icon={Calendar}>
            <p className="text-xs text-gray-500">
              Deixe em branco para iniciar imediatamente e sem data de encerramento.
              A janela diária 08:00–19:45 é sempre respeitada, independente do período configurado.
            </p>

            <div>
              <InputLabel>Data e Hora de Início</InputLabel>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                disabled={isRunning}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                           focus:outline-none focus:ring-2 focus:ring-emerald-500
                           disabled:bg-gray-50 disabled:cursor-not-allowed transition"
              />
            </div>

            <div>
              <InputLabel>Data e Hora de Fim</InputLabel>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                disabled={isRunning}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                           focus:outline-none focus:ring-2 focus:ring-emerald-500
                           disabled:bg-gray-50 disabled:cursor-not-allowed transition"
              />
            </div>

            {(startAt || endAt) && (
              <button
                type="button"
                onClick={() => { setStartAt(''); setEndAt(''); }}
                disabled={isRunning}
                className="text-xs text-gray-400 hover:text-red-500 transition disabled:opacity-40"
              >
                Limpar agendamento
              </button>
            )}
          </Card>
        </div>

        {/* ── Seleção de Zaps (full width) ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Zap size={18} className="text-emerald-500" />
              <h2 className="text-base font-semibold text-gray-800">Zaps para Disparo</h2>
            </div>
            <span className="text-xs font-medium text-gray-400">
              {zaps.length === 0
                ? 'Nenhum selecionado — usa todos os online'
                : `${zaps.length} selecionado${zaps.length > 1 ? 's' : ''}`
              }
            </span>
          </div>

          <p className="text-sm text-gray-500">
            Deixe vazio para usar todos os chips online automaticamente.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {CAMPAIGN_IDS.map((id) => {
              const online  = instances[id]?.online ?? false;
              const checked = zaps.includes(id);
              return (
                <label
                  key={id}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2
                              cursor-pointer transition-all text-center select-none
                              ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}
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
                    disabled={isRunning}
                    onChange={() => toggleZap(id)}
                    className="h-3 w-3 accent-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* ── Área de ação ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => { setFeedback(null); setIsPlanModalOpen(true); }}
            disabled={!canOpenPlan}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
                       disabled:bg-gray-200 disabled:cursor-not-allowed
                       text-white disabled:text-gray-400 font-semibold text-sm
                       px-6 py-3 rounded-xl shadow-md transition-colors duration-150"
          >
            <Eye size={16} /> Visualizar Plano
          </button>

          <button
            onClick={() => { setFeedback(null); setIsTestModalOpen(true); }}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 active:bg-gray-100
                       border border-gray-300 text-gray-700 font-semibold text-sm
                       px-6 py-3 rounded-xl shadow-sm transition-colors duration-150"
          >
            <Smartphone size={16} /> Envio Teste
          </button>

          {isRunning && (
            <button
              onClick={handleStop}
              disabled={!canStop || isStopping}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700
                         disabled:bg-gray-200 disabled:cursor-not-allowed
                         text-white disabled:text-gray-400 font-semibold text-sm
                         px-6 py-3 rounded-xl shadow-md transition-colors duration-150"
            >
              {isStopping
                ? <><Loader2 size={15} className="animate-spin" /> Parando...</>
                : <><Square size={13} className="fill-white" /> Cancelar Campanha</>
              }
            </button>
          )}
        </div>

        {/* Feedback global */}
        {feedback && (
          <div className={`max-w-lg flex items-start gap-4 rounded-2xl px-6 py-4 border
                           ${feedback.type === 'success'
                             ? 'bg-emerald-50 border-emerald-200'
                             : 'bg-red-50 border-red-200'
                           }`}>
            {feedback.type === 'success'
              ? <CheckCircle size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
              : <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            }
            <p className={`text-sm font-medium ${feedback.type === 'success' ? 'text-emerald-800' : 'text-red-700'}`}>
              {feedback.message}
            </p>
          </div>
        )}

        {/* Info da campanha em execução */}
        {isRunning && campaignState?.campaign && (
          <div className="max-w-lg bg-gray-900 rounded-2xl px-6 py-5 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Campanha em execução</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-400">ID</span>
              <span className="text-white font-medium">{campaignState.campaign.campaignId}</span>
              <span className="text-gray-400">Iniciada em</span>
              <span className="text-white">
                {new Date(campaignState.campaign.startedAt).toLocaleTimeString('pt-BR')}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
