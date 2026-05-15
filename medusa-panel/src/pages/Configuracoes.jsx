import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wifi, WifiOff, Loader2, QrCode, Trash2, X, RefreshCw, AlertCircle, Shield, Users, Copy, CheckCheck,
} from 'lucide-react';
import { startWhatsApp, getQrCode, disconnectWhatsApp, deleteWhatsApp, getConnectedInstances, getWhatsAppGroups } from '../services/api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeBase64(raw) {
  if (!raw) return null;
  return raw.startsWith('data:image') ? raw : `data:image/png;base64,${raw}`;
}

const ALL_IDS = Array.from({ length: 49 }, (_, i) => `WA-${String(i + 1).padStart(2, '0')}`);

// ── Modal backdrop ────────────────────────────────────────────────────────────

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

// ── Modal QR Code ─────────────────────────────────────────────────────────────

function ModalQr({ accountId, onClose }) {
  const [qrCode,  setQrCode]  = useState(null);
  const [phase,   setPhase]   = useState('starting'); // starting|polling|connected|error
  const [message, setMessage] = useState('Iniciando instância...');
  const intervalRef = useRef(null);
  const startedRef  = useRef(false); // evita duplo disparo do StrictMode em dev

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let alive = true;

    async function run() {
      try {
        const { data } = await startWhatsApp(accountId);
        if (!alive) return;
        if (data?.alreadyConnected) {
          setPhase('connected');
          setMessage('Instância já estava conectada!');
          return;
        }
        poll();
      } catch (err) {
        if (!alive) return;
        setPhase('error');
        setMessage(err.response?.data?.error ?? err.message);
      }
    }

    function poll() {
      setPhase('polling');
      setMessage('Aguardando QR Code...');
      let hasShownQr = false;

      intervalRef.current = setInterval(async () => {
        if (!alive) { clearInterval(intervalRef.current); return; }
        try {
          const { data } = await getQrCode(accountId);
          if (!alive) { clearInterval(intervalRef.current); return; }
          const b64 = normalizeBase64(data?.connectData?.base64 ?? null);

          if (b64) {
            hasShownQr = true;
            setQrCode(b64);
            setMessage('Escaneie com o WhatsApp do chip.');
            return;
          }

          if (hasShownQr) {
            clearInterval(intervalRef.current);
            setQrCode(null);
            setPhase('connected');
            setMessage(`${accountId} conectado com sucesso!`);
          }
        } catch (err) {
          if (!alive) { clearInterval(intervalRef.current); return; }
          const code = err.response?.status;
          if (code === 404 && hasShownQr) {
            clearInterval(intervalRef.current);
            setQrCode(null);
            setPhase('connected');
            setMessage(`${accountId} conectado com sucesso!`);
            return;
          }
          if (code === 404) return;
          clearInterval(intervalRef.current);
          setPhase('error');
          setMessage(`Erro: ${err.message}`);
        }
      }, 3_000);
    }

    run();
    return () => { alive = false; clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <QrCode size={18} className="text-emerald-500" />
            <h2 className="text-base font-semibold text-gray-800">Conectar {accountId}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={17} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          <div className="flex items-center gap-2">
            {phase === 'connected'
              ? <Wifi size={16} className="text-emerald-500" />
              : phase === 'error'
                ? <WifiOff size={16} className="text-red-500" />
                : <Loader2 size={16} className="animate-spin text-amber-500" />
            }
            <p className={`text-sm ${
              phase === 'connected' ? 'text-emerald-700 font-semibold'
              : phase === 'error'  ? 'text-red-600'
              : 'text-gray-500'
            }`}>
              {message}
            </p>
          </div>

          {qrCode && (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl border-2 border-emerald-200 p-3 bg-white shadow-inner">
                <img src={qrCode} alt="QR Code" className="w-48 h-48 object-contain" />
              </div>
              <p className="text-xs text-gray-400 text-center">
                O QR expira em ~120 s.<br />A página detecta a conexão automaticamente.
              </p>
            </div>
          )}

          {phase === 'connected' && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <Wifi size={18} className="text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700">{accountId} online!</p>
                <p className="text-xs text-emerald-500 mt-0.5">Pronto para disparos.</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-300 text-sm font-medium
                       text-gray-600 hover:bg-gray-50 transition"
          >
            {phase === 'connected' ? 'Fechar' : 'Cancelar'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Modal Confirmar Exclusão ───────────────────────────────────────────────────

function ModalConfirmDelete({ accountId, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleDelete() {
    setLoading(true);
    setError('');
    try {
      await deleteWhatsApp(accountId);
      onDeleted(accountId);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Trash2 size={17} className="text-red-500" />
            <h2 className="text-base font-semibold text-gray-800">Excluir {accountId}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={17} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4">
            <p className="text-sm font-semibold text-red-700 mb-1">Ação irreversível</p>
            <p className="text-sm text-red-600">
              A instância <strong>{accountId}</strong> será removida da Evolution API e desconectada do WhatsApp.
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={14} />{error}
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium
                       text-gray-600 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-red-500 hover:bg-red-600 disabled:bg-gray-200
                       text-white disabled:text-gray-400 text-sm font-semibold transition"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Modal Confirmar Desconexão ────────────────────────────────────────────────

function ModalConfirmDisconnect({ accountId, onClose, onDisconnected }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleDisconnect() {
    setLoading(true);
    setError('');
    try {
      await disconnectWhatsApp(accountId);
      onDisconnected(accountId);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <WifiOff size={17} className="text-orange-500" />
            <h2 className="text-base font-semibold text-gray-800">Desconectar {accountId}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={17} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-4">
            <p className="text-sm font-semibold text-orange-700 mb-1">Sessão será encerrada</p>
            <p className="text-sm text-orange-600">
              <strong>{accountId}</strong> será deslogada do WhatsApp. A instância permanece na Evolution
              e pode ser reconectada a qualquer momento via QR Code.
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={14} />{error}
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium
                       text-gray-600 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200
                       text-white disabled:text-gray-400 text-sm font-semibold transition"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <WifiOff size={14} />}
            Desconectar
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Bloco individual ──────────────────────────────────────────────────────────

function ZapBlock({ id, online, isAdmin, onConnect, onDisconnect, onDelete }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-white
                     shadow-sm hover:shadow-md transition-shadow
                     ${online ? 'border-emerald-200' : 'border-gray-100'}
                     ${isAdmin ? 'ring-1 ring-amber-300' : ''}`}>

      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0
                        ${online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />

      <span className="text-[11px] font-bold text-gray-700 leading-none">{id}</span>

      {isAdmin && (
        <span className="flex items-center gap-0.5 text-[9px] bg-amber-100 text-amber-700
                         px-1.5 py-0.5 rounded-full font-semibold leading-none">
          <Shield size={8} /> ADMIN
        </span>
      )}

      <span className={`text-[9px] font-medium ${online ? 'text-emerald-600' : 'text-gray-400'}`}>
        {online ? 'Online' : 'Offline'}
      </span>

      <div className="flex gap-1 w-full mt-0.5">
        {online ? (
          <button
            onClick={onDisconnect}
            className="flex-1 flex items-center justify-center gap-1 text-[9px] font-semibold
                       py-1.5 rounded-lg text-white bg-orange-500 hover:bg-orange-600 transition"
          >
            <WifiOff size={9} /> Desconectar
          </button>
        ) : (
          <button
            onClick={onConnect}
            className={`flex-1 flex items-center justify-center gap-1 text-[9px] font-semibold
                        py-1.5 rounded-lg text-white transition
                        ${isAdmin
                          ? 'bg-amber-500 hover:bg-amber-600'
                          : 'bg-emerald-500 hover:bg-emerald-600'
                        }`}
          >
            <QrCode size={9} /> Conectar
          </button>
        )}
        {!isAdmin && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-500
                       hover:bg-red-100 transition"
            title="Excluir instância"
          >
            <Trash2 size={9} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Configuracoes() {
  const [instances,       setInstances]       = useState({});
  const [loading,         setLoading]         = useState(true);
  const [connectingId,    setConnectingId]    = useState(null);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [deletingId,      setDeletingId]      = useState(null);

  // ── Administração Inbound ────────────────────────────────────────────────────
  const [adminGroups,    setAdminGroups]    = useState([]);
  const [loadingGroups,  setLoadingGroups]  = useState(false);
  const [groupsError,    setGroupsError]    = useState('');
  const [copiedId,       setCopiedId]       = useState('');

  async function fetchAdminGroups() {
    setLoadingGroups(true);
    setGroupsError('');
    try {
      const { data } = await getWhatsAppGroups('WA-49');
      setAdminGroups(data);
    } catch (err) {
      setGroupsError(err.response?.data?.error ?? err.message ?? 'Erro ao buscar grupos.');
    } finally {
      setLoadingGroups(false);
    }
  }

  function copyGroupId(id) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2_000);
    });
  }

  const fetchInstances = useCallback(async () => {
    try {
      const { data } = await getConnectedInstances();
      const map = {};
      data.forEach((inst) => { map[inst.id] = inst; });
      setInstances(map);
    } catch { /* backend offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchInstances();
    const id = setInterval(fetchInstances, 5_000);
    return () => clearInterval(id);
  }, [fetchInstances]);

  function onDisconnected(id) {
    setInstances((prev) => ({ ...prev, [id]: { ...prev[id], online: false } }));
  }

  function onDeleted(id) {
    setInstances((prev) => ({ ...prev, [id]: { ...prev[id], online: false } }));
  }

  const totalOnline = Object.values(instances).filter((i) => i.online).length;

  return (
    <>
      {connectingId && (
        <ModalQr
          accountId={connectingId}
          onClose={() => { setConnectingId(null); fetchInstances(); }}
        />
      )}
      {disconnectingId && (
        <ModalConfirmDisconnect
          accountId={disconnectingId}
          onClose={() => setDisconnectingId(null)}
          onDisconnected={onDisconnected}
        />
      )}
      {deletingId && (
        <ModalConfirmDelete
          accountId={deletingId}
          onClose={() => setDeletingId(null)}
          onDeleted={onDeleted}
        />
      )}

      <div className="space-y-6">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
            <p className="text-sm text-gray-500 mt-1">
              Gerencie as 49 instâncias WhatsApp. WA-49 é o admin de inbound.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              <span className="font-bold text-emerald-600">{totalOnline}</span> / 49 online
            </span>
            <button
              onClick={fetchInstances}
              disabled={loading}
              className="p-2 rounded-xl border border-gray-300 text-gray-500
                         hover:bg-gray-50 transition"
              title="Atualizar status"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Grid único de todas as instâncias */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {ALL_IDS.map((id) => (
              <ZapBlock
                key={id}
                id={id}
                online={instances[id]?.online ?? false}
                isAdmin={id === 'WA-49'}
                onConnect={() => setConnectingId(id)}
                onDisconnect={() => setDisconnectingId(id)}
                onDelete={() => setDeletingId(id)}
              />
            ))}
          </div>
        </div>

        {/* ── Administração Inbound (WA-49) ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-emerald-500" />
            <h2 className="text-base font-semibold text-gray-800">Administração Inbound (WA-49)</h2>
          </div>

          <p className="text-sm text-gray-500">
            Adicione o <strong>WA-49</strong> aos seus grupos de controle no WhatsApp e clique em
            {' '}<strong>Buscar</strong> para copiar o ID do grupo e colar no <code className="bg-gray-100 px-1 rounded text-xs">.env</code>.
          </p>

          <button
            onClick={fetchAdminGroups}
            disabled={loadingGroups}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600
                       disabled:bg-gray-200 disabled:cursor-not-allowed
                       text-white disabled:text-gray-400 text-sm font-semibold
                       px-5 py-2.5 rounded-xl transition"
          >
            {loadingGroups
              ? <><Loader2 size={14} className="animate-spin" /> Buscando...</>
              : <><RefreshCw size={14} /> Buscar Grupos do WA-49</>
            }
          </button>

          {groupsError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50
                            border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="flex-shrink-0" />
              {groupsError}
            </div>
          )}

          {adminGroups.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">Nome do Grupo</th>
                    <th className="px-4 py-2.5 text-left">ID (@g.us)</th>
                    <th className="px-4 py-2.5 text-center w-16">Copiar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adminGroups.map((group) => {
                    const gid  = group.id ?? group.remoteJid ?? '';
                    const name = group.subject ?? group.name ?? gid;
                    const copied = copiedId === gid;
                    return (
                      <tr key={gid} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{gid}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => copyGroupId(gid)}
                            title="Copiar ID"
                            className={`inline-flex items-center gap-1 text-xs font-semibold
                                        px-2.5 py-1.5 rounded-lg border transition
                                        ${copied
                                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                          : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                                        }`}
                          >
                            {copied
                              ? <><CheckCheck size={12} /> Copiado!</>
                              : <><Copy size={12} /> Copiar</>
                            }
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loadingGroups && !groupsError && adminGroups.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              Clique em <strong>Buscar</strong> para listar os grupos do WA-49.
            </p>
          )}

        </div>

      </div>
    </>
  );
}
