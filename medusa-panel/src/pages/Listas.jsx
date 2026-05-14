import { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud, CheckCircle, FileSpreadsheet, X, AlertCircle,
  Scissors, GitMerge, ToggleLeft, ToggleRight, RefreshCw, Loader2,
  Trash2, CheckSquare, Pencil, Search, ChevronLeft, ChevronRight, UserMinus,
} from 'lucide-react';
import {
  uploadList, getLists, mergeLists, splitList, toggleList, deleteList,
  getListContacts, addListContacts, removeListContact,
} from '../services/api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) { return Number(n ?? 0).toLocaleString('pt-BR'); }

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
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

// ── Modal Mesclar ─────────────────────────────────────────────────────────────

function ModalMerge({ selectedIds, onSuccess, onClose }) {
  const [name,      setName]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  async function handleMerge() {
    if (!name.trim()) return setError('Informe um nome para a nova lista.');
    setLoading(true);
    setError('');
    try {
      const { data } = await mergeLists(name.trim(), selectedIds);
      onSuccess(`${data.inserted.toLocaleString('pt-BR')} contatos mesclados em "${data.newListId ?? name.trim()}".`);
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
            <GitMerge size={17} className="text-emerald-500" />
            <h2 className="text-base font-semibold text-gray-800">Mesclar Listas</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X size={17} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Mesclando <strong>{selectedIds.length}</strong> listas com deduplicação automática.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da nova lista</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleMerge()}
              placeholder="Ex: lista-completa-maio"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                         placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleMerge} disabled={loading || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200
                       text-white disabled:text-gray-400 text-sm font-semibold transition">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <GitMerge size={15} />}
            Mesclar
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Modal Dividir ─────────────────────────────────────────────────────────────

function ModalSplit({ listId, totalContatos, onSuccess, onClose }) {
  const [blocks,  setBlocks]  = useState(2);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const perBlock = Math.ceil(totalContatos / blocks);

  async function handleSplit() {
    setLoading(true);
    setError('');
    try {
      const { data } = await splitList(listId, blocks);
      onSuccess(`"${listId}" dividida em ${data.blocks.length} sub-listas.`);
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
            <Scissors size={17} className="text-amber-500" />
            <h2 className="text-base font-semibold text-gray-800">Dividir Lista</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X size={17} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Dividindo <strong>{fmt(totalContatos)}</strong> contatos pendentes de{' '}
            <strong className="text-gray-700">{listId}</strong>.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Número de blocos (2 – 100)
            </label>
            <input
              type="number" min={2} max={100} value={blocks}
              onChange={(e) => setBlocks(Math.max(2, Math.min(100, Number(e.target.value))))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                         focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
            />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-700">
              ~<strong>{fmt(perBlock)}</strong> contatos por bloco · nomes: <em>{listId}-part-1</em>, <em>-part-2</em>...
            </p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleSplit} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200
                       text-white disabled:text-gray-400 text-sm font-semibold transition">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
            Dividir
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Modal Excluir ─────────────────────────────────────────────────────────────

function ModalDelete({ listId, onSuccess, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleDelete() {
    setLoading(true);
    setError('');
    try {
      await deleteList(listId);
      onSuccess(`Lista "${listId}" excluída permanentemente.`);
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
            <h2 className="text-base font-semibold text-gray-800">Excluir Lista</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X size={17} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4">
            <p className="text-sm font-semibold text-red-700 mb-1">Ação irreversível</p>
            <p className="text-sm text-red-600">
              Todos os contatos de <strong>{listId}</strong> serão deletados permanentemente do banco de dados.
              Esta ação não pode ser desfeita.
            </p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleDelete} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-red-500 hover:bg-red-600 disabled:bg-gray-200
                       text-white disabled:text-gray-400 text-sm font-semibold transition">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Excluir
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  importado:     'bg-gray-100 text-gray-500',
  pendente:      'bg-amber-100 text-amber-700',
  enfileirado:   'bg-blue-100 text-blue-700',
  enviado:       'bg-emerald-100 text-emerald-700',
  invalido:      'bg-red-100 text-red-500',
  falha_tecnica: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-400'}`}>
      {status}
    </span>
  );
}

// ── Modal Editar Lista ────────────────────────────────────────────────────────

function ModalEdit({ listId, onClose }) {
  const LIMIT = 50;

  // ── Add section
  const [rawInput,    setRawInput]    = useState('');
  const [addLoading,  setAddLoading]  = useState(false);
  const [addFeedback, setAddFeedback] = useState(null);

  // ── Contacts section
  const [contacts,    setContacts]    = useState([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [removing,    setRemoving]    = useState(null); // phone being removed

  const totalPages = Math.ceil(total / LIMIT) || 1;

  // Computed phones from textarea
  const phonesToAdd = rawInput
    .split('\n')
    .map((l) => l.replace(/\D/g, ''))
    .filter((p) => p.length >= 8);
  const uniqueToAdd = [...new Set(phonesToAdd)];

  // ── Load contacts
  const loadContacts = useCallback(async (p, s) => {
    setLoading(true);
    try {
      const { data } = await getListContacts(listId, p, LIMIT, s);
      setContacts(data.contacts);
      setTotal(data.total);
    } catch {
      /* silencia */
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => { loadContacts(1, ''); }, [loadContacts]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
      loadContacts(1, searchInput);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, loadContacts]);

  function goPage(p) {
    setPage(p);
    loadContacts(p, search);
  }

  // ── Add contacts
  async function handleAdd() {
    if (!uniqueToAdd.length) return;
    setAddLoading(true);
    setAddFeedback(null);
    try {
      const { data } = await addListContacts(listId, uniqueToAdd);
      setAddFeedback({
        type: 'success',
        message: `${data.inserted} inseridos${data.skipped > 0 ? `, ${data.skipped} já existiam` : ''}.`,
      });
      setRawInput('');
      loadContacts(1, search);
    } catch (err) {
      setAddFeedback({ type: 'error', message: err.response?.data?.error ?? err.message });
    } finally {
      setAddLoading(false);
    }
  }

  // ── Remove contact
  async function handleRemove(phone) {
    setRemoving(phone);
    try {
      await removeListContact(listId, phone);
      setContacts((prev) => prev.filter((c) => c.phone !== phone));
      setTotal((prev) => prev - 1);
    } catch { /* silencia */ }
    finally { setRemoving(null); }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Pencil size={17} className="text-emerald-500" />
            <h2 className="text-base font-semibold text-gray-800">Editar Lista: <span className="text-emerald-600">{listId}</span></h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Adicionar Contatos ──────────────────────────────────────── */}
          <div className="px-6 py-5 border-b border-gray-100 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Adicionar Contatos</h3>
            <p className="text-xs text-gray-400">Um número por linha. Dígitos apenas — formatação é ignorada.</p>
            <textarea
              rows={4}
              value={rawInput}
              onChange={(e) => { setRawInput(e.target.value); setAddFeedback(null); }}
              placeholder={"5511999999999\n5521888888888\n..."}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-800
                         placeholder-gray-400 resize-none focus:outline-none focus:ring-2
                         focus:ring-emerald-500 font-mono transition"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleAdd}
                disabled={addLoading || uniqueToAdd.length === 0}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600
                           disabled:bg-gray-200 disabled:cursor-not-allowed
                           text-white disabled:text-gray-400 text-sm font-semibold
                           px-4 py-2 rounded-lg transition"
              >
                {addLoading
                  ? <><Loader2 size={14} className="animate-spin" /> Adicionando...</>
                  : <><CheckCircle size={14} /> Adicionar {uniqueToAdd.length > 0 ? `${uniqueToAdd.length} contato${uniqueToAdd.length > 1 ? 's' : ''}` : ''}</>
                }
              </button>
              {uniqueToAdd.length > 0 && !addLoading && (
                <span className="text-xs text-gray-400">
                  {uniqueToAdd.length} número{uniqueToAdd.length > 1 ? 's' : ''} válido{uniqueToAdd.length > 1 ? 's' : ''} detectado{uniqueToAdd.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {addFeedback && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border
                               ${addFeedback.type === 'success'
                                 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                 : 'bg-red-50 border-red-200 text-red-600'
                               }`}>
                {addFeedback.type === 'success'
                  ? <CheckCircle size={14} className="flex-shrink-0" />
                  : <AlertCircle size={14} className="flex-shrink-0" />
                }
                {addFeedback.message}
              </div>
            )}
          </div>

          {/* ── Lista de Contatos ───────────────────────────────────────── */}
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                Contatos na Lista
                <span className="ml-2 text-xs font-normal text-gray-400">({total.toLocaleString('pt-BR')} total)</span>
              </h3>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar número..."
                  className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-300
                             focus:outline-none focus:ring-2 focus:ring-emerald-500 transition w-48"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                <Loader2 size={16} className="animate-spin" /> Carregando...
              </div>
            ) : contacts.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">
                {search ? 'Nenhum resultado para a busca.' : 'Nenhum contato nesta lista.'}
              </p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left">Número</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-gray-700">{c.phone}</td>
                        <td className="px-4 py-2.5 text-center"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => handleRemove(c.phone)}
                            disabled={removing === c.phone}
                            title="Remover contato"
                            className="text-red-400 hover:text-red-600 disabled:opacity-40 transition"
                          >
                            {removing === c.phone
                              ? <Loader2 size={14} className="animate-spin" />
                              : <UserMinus size={14} />
                            }
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => goPage(page - 1)}
                  disabled={page === 1 || loading}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300
                             text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft size={13} /> Anterior
                </button>
                <span className="text-xs text-gray-400">
                  Página {page} de {totalPages} · {total.toLocaleString('pt-BR')} contatos
                </span>
                <button
                  onClick={() => goPage(page + 1)}
                  disabled={page === totalPages || loading}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300
                             text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Próxima <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-300 text-sm font-medium
                       text-gray-600 hover:bg-gray-50 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Listas() {
  // ── Upload states ───────────────────────────────────────────────────────────
  const [campaignName, setCampaignName] = useState('');
  const [file,         setFile]         = useState(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [isUploading,  setIsUploading]  = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError,  setUploadError]  = useState(null);
  const fileInputRef = useRef(null);

  // ── Lists table states ──────────────────────────────────────────────────────
  const [lists,         setLists]         = useState([]);
  const [loadingLists,  setLoadingLists]  = useState(true);
  const [selectedIds,   setSelectedIds]   = useState([]);  // string[]
  const [feedback,      setFeedback]      = useState(null); // { type, message }

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [mergeOpen,    setMergeOpen]    = useState(false);
  const [splitTarget,  setSplitTarget]  = useState(null); // { id, pendentes }
  const [deleteTarget, setDeleteTarget] = useState(null); // string (listId)
  const [editTarget,   setEditTarget]   = useState(null); // string (listId)

  // ── Load lists ──────────────────────────────────────────────────────────────
  const fetchLists = useCallback(async () => {
    try {
      const { data } = await getLists();
      setLists(data);
    } catch {
      // silencia — pode estar offline
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  // ── Upload handlers ─────────────────────────────────────────────────────────
  function selectFile(f) { setFile(f); setUploadResult(null); setUploadError(null); }
  function clearFile()   { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && /\.(xlsx|xls)$/i.test(dropped.name)) selectFile(dropped);
  }

  async function handleUpload() {
    if (!file || !campaignName.trim()) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const { data } = await uploadList(campaignName.trim(), file);
      setUploadResult(data);
      setCampaignName('');
      clearFile();
      await fetchLists();
    } catch (err) {
      setUploadError(err.response?.data?.error ?? err.message ?? 'Erro desconhecido.');
    } finally {
      setIsUploading(false);
    }
  }

  // ── Selection handlers ──────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => prev.length === lists.length ? [] : lists.map((l) => l.id));
  }

  // ── Toggle enabled ──────────────────────────────────────────────────────────
  async function handleToggle(listId, currentEnabled) {
    try {
      await toggleList(listId, !currentEnabled);
      setLists((prev) => prev.map((l) => l.id === listId ? { ...l, enabled: !currentEnabled } : l));
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.error ?? err.message });
    }
  }

  // ── Feedback helpers ────────────────────────────────────────────────────────
  function onActionSuccess(msg) {
    setFeedback({ type: 'success', message: msg });
    setSelectedIds([]);
    fetchLists();
  }

  const canSubmit  = !!file && !!campaignName.trim() && !isUploading;
  const allChecked = lists.length > 0 && selectedIds.length === lists.length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {mergeOpen && (
        <ModalMerge
          selectedIds={selectedIds}
          onSuccess={onActionSuccess}
          onClose={() => setMergeOpen(false)}
        />
      )}
      {splitTarget && (
        <ModalSplit
          listId={splitTarget.id}
          totalContatos={splitTarget.pendentes}
          onSuccess={onActionSuccess}
          onClose={() => setSplitTarget(null)}
        />
      )}
      {deleteTarget && (
        <ModalDelete
          listId={deleteTarget}
          onSuccess={onActionSuccess}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {editTarget && (
        <ModalEdit
          listId={editTarget}
          onClose={() => { setEditTarget(null); fetchLists(); }}
        />
      )}

      <div className="space-y-8">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gestão de Listas</h1>
          <p className="text-sm text-gray-500 mt-1">Faça o upload, mescle ou divida suas planilhas de contatos.</p>
        </div>

        {/* ── Card de Upload ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-lg p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-gray-800">Nova Lista</h2>
            <p className="text-sm text-gray-400">
              Aceita <span className="font-medium">.xlsx</span> e <span className="font-medium">.xls</span>.
              Duplicados ignorados automaticamente.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nome / ID da Lista</label>
            <input type="text" value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex: campanha-maio-2025" disabled={isUploading}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800
                         placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500
                         disabled:bg-gray-50 disabled:cursor-not-allowed transition" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Arquivo</label>
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
                <FileSpreadsheet size={20} className="text-emerald-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-800 truncate">{file.name}</p>
                  <p className="text-xs text-emerald-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={clearFile} disabled={isUploading}
                  className="text-emerald-400 hover:text-emerald-600 disabled:opacity-40 transition">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
                            px-6 py-10 cursor-pointer select-none transition-colors duration-150
                            ${isDragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50'}`}>
                <UploadCloud size={32} className={isDragging ? 'text-emerald-500' : 'text-gray-400'} />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-600">
                    Arraste ou <span className="text-emerald-500 underline underline-offset-2">clique para selecionar</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">.xlsx ou .xls — até 50 MB</p>
                </div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f); }}
              className="hidden" />
          </div>

          <button onClick={handleUpload} disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600
                       active:bg-emerald-700 disabled:bg-gray-200 disabled:cursor-not-allowed
                       text-white disabled:text-gray-400 text-sm font-semibold
                       py-3 rounded-xl transition-colors duration-150">
            {isUploading
              ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg> Processando...</>
              : <><UploadCloud size={16} /> Processar e Salvar</>
            }
          </button>
        </div>

        {/* Upload feedback */}
        {uploadResult && (
          <div className="max-w-lg flex items-start gap-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-5">
            <CheckCircle size={22} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-emerald-800">Lista processada com sucesso!</p>
              <p className="text-sm text-emerald-700">
                <strong>{uploadResult.inserted?.toLocaleString('pt-BR')}</strong> inseridos de{' '}
                <strong>{uploadResult.totalProcessed?.toLocaleString('pt-BR')}</strong> lidos.
              </p>
              <p className="text-xs text-emerald-500">Campanha: <strong>{uploadResult.campaignId}</strong></p>
            </div>
          </div>
        )}
        {uploadError && (
          <div className="max-w-lg flex items-start gap-4 bg-red-50 border border-red-200 rounded-2xl px-6 py-5">
            <AlertCircle size={22} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div><p className="text-sm font-semibold text-red-700">Falha no upload</p><p className="text-sm text-red-500 mt-0.5">{uploadError}</p></div>
          </div>
        )}

        {/* ── Tabela de Listas ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Header da tabela */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">
              Listas Cadastradas
              {lists.length > 0 && <span className="ml-2 text-sm font-normal text-gray-400">({lists.length})</span>}
            </h2>
            <button onClick={fetchLists} className="text-gray-400 hover:text-gray-600 transition" title="Atualizar">
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Feedback de ação */}
          {feedback && (
            <div className={`flex items-center gap-3 px-6 py-3 text-sm border-b
                             ${feedback.type === 'success'
                               ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                               : 'bg-red-50 border-red-100 text-red-600'}`}>
              {feedback.type === 'success'
                ? <CheckCircle size={15} />
                : <AlertCircle size={15} />}
              {feedback.message}
              <button onClick={() => setFeedback(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          )}

          {loadingLists ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-sm">
              <Loader2 size={18} className="animate-spin" /> Carregando listas...
            </div>
          ) : lists.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">Nenhuma lista encontrada. Faça o upload acima.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="pl-6 pr-3 py-3 text-left w-10">
                      <input type="checkbox" checked={allChecked}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer" />
                    </th>
                    <th className="px-3 py-3 text-left">Lista</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-right">Pendentes</th>
                    <th className="px-3 py-3 text-right">Processados</th>
                    <th className="px-3 py-3 text-center">Progresso</th>
                    <th className="px-3 py-3 text-center">Habilitada</th>
                    <th className="px-6 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lists.map((list) => {
                    const isSelected = selectedIds.includes(list.id);
                    const progPct    = pct(list.processados, list.total);

                    return (
                      <tr key={list.id}
                        className={`transition-colors ${isSelected ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>

                        {/* Checkbox */}
                        <td className="pl-6 pr-3 py-3.5">
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleSelect(list.id)}
                            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer" />
                        </td>

                        {/* Nome */}
                        <td className="px-3 py-3.5 font-medium text-gray-800" title={list.id}>
                          {list.id}
                        </td>

                        {/* Total */}
                        <td className="px-3 py-3.5 text-right text-gray-600 tabular-nums">{fmt(list.total)}</td>

                        {/* Pendentes */}
                        <td className="px-3 py-3.5 text-right tabular-nums">
                          <span className={list.pendentes > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}>
                            {fmt(list.pendentes)}
                          </span>
                        </td>

                        {/* Processados */}
                        <td className="px-3 py-3.5 text-right tabular-nums">
                          <span className={list.processados > 0 ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                            {fmt(list.processados)}
                          </span>
                        </td>

                        {/* Barra de progresso */}
                        <td className="px-3 py-3.5 min-w-[80px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400 transition-all duration-500"
                                   style={{ width: `${progPct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 tabular-nums w-8 text-right">
                              {progPct}%
                            </span>
                          </div>
                        </td>

                        {/* Toggle habilitada */}
                        <td className="px-3 py-3.5 text-center">
                          <button onClick={() => handleToggle(list.id, list.enabled)}
                            title={list.enabled ? 'Desabilitar' : 'Habilitar'}
                            className="transition-opacity hover:opacity-75">
                            {list.enabled
                              ? <ToggleRight size={22} className="text-emerald-500" />
                              : <ToggleLeft  size={22} className="text-gray-400" />
                            }
                          </button>
                        </td>

                        {/* Ações */}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2 justify-center">
                            <button
                              onClick={() => setEditTarget(list.id)}
                              title="Editar lista"
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg
                                         bg-emerald-50 border border-emerald-200 text-emerald-700
                                         hover:bg-emerald-100 transition">
                              <Pencil size={12} /> Editar
                            </button>
                            <button
                              onClick={() => setSplitTarget({ id: list.id, pendentes: list.pendentes })}
                              disabled={list.pendentes === 0}
                              title="Dividir lista"
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg
                                         bg-amber-50 border border-amber-200 text-amber-700
                                         hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
                              <Scissors size={12} /> Dividir
                            </button>
                            <button
                              onClick={() => setDeleteTarget(list.id)}
                              title="Excluir lista"
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg
                                         bg-red-50 border border-red-200 text-red-600
                                         hover:bg-red-100 transition">
                              <Trash2 size={12} /> Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Botão flutuante de mesclagem */}
        {selectedIds.length >= 2 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
            <button onClick={() => setMergeOpen(true)}
              className="flex items-center gap-2.5 bg-gray-900 hover:bg-gray-800 active:bg-gray-950
                         text-white font-semibold text-sm px-6 py-3.5 rounded-2xl shadow-2xl
                         transition-colors duration-150 border border-gray-700">
              <GitMerge size={16} />
              Mesclar {selectedIds.length} listas selecionadas
              <span className="ml-1 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {selectedIds.length}
              </span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
