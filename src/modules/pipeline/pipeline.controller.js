import multer from 'multer';
import { processExcelBuffer } from './pipeline.service.js';
import {
  bulkInsertContacts,
  getLists,
  mergeLists,
  splitList,
  toggleListEnabled,
  deleteList,
  getListContacts,
  addContactsToList,
  removeContactFromList,
} from './pipeline.repository.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// POST /api/pipeline/upload
export async function uploadPipeline(req, res) {
  const campaignId = req.body?.campaign_id;

  if (!campaignId) return res.status(400).json({ error: 'campaign_id é obrigatório no body.' });
  if (!req.file)   return res.status(400).json({ error: 'Nenhum arquivo enviado. Use o campo "file".' });

  try {
    console.log(
      `[PIPELINE] Upload — campanha: ${campaignId} | ` +
      `arquivo: ${req.file.originalname} | tamanho: ${(req.file.size / 1024).toFixed(1)} KB`
    );

    const { totalProcessed, totalValid, uniquePhones } = processExcelBuffer(req.file.buffer);
    const inserted = await bulkInsertContacts(campaignId, uniquePhones);

    console.log(`[PIPELINE] ${inserted} registros gravados para "${campaignId}".`);
    return res.json({ status: 'ok', campaignId, totalProcessed, totalValid, inserted });
  } catch (err) {
    console.error(`[PIPELINE] Erro no upload para "${campaignId}":`, err.message);
    return res.status(500).json({ error: 'Falha ao processar o arquivo.', detail: err.message });
  }
}

// GET /api/pipeline/lists
export async function listCampaigns(_req, res) {
  try {
    const lists = await getLists();
    return res.json(lists);
  } catch (err) {
    console.error('[PIPELINE] Erro ao listar campanhas:', err.message);
    return res.status(500).json({ error: 'Falha ao consultar listas.' });
  }
}

// POST /api/pipeline/merge
export async function mergeCampaigns(req, res) {
  const { newName, listIds } = req.body;

  if (!newName || typeof newName !== 'string' || !newName.trim()) {
    return res.status(400).json({ error: 'newName é obrigatório.' });
  }
  if (!Array.isArray(listIds) || listIds.length < 2) {
    return res.status(400).json({ error: 'listIds deve ser um array com pelo menos 2 IDs.' });
  }

  try {
    console.log(`[PIPELINE] Mesclando ${listIds.length} listas em "${newName}"...`);
    const result = await mergeLists(newName.trim(), listIds);
    console.log(`[PIPELINE] Mesclagem concluída — ${result.inserted} contatos inseridos.`);
    return res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error('[PIPELINE] Erro na mesclagem:', err.message);
    return res.status(500).json({ error: 'Falha ao mesclar listas.', detail: err.message });
  }
}

// POST /api/pipeline/split
export async function splitCampaign(req, res) {
  const { listId, blocks } = req.body;

  if (!listId) return res.status(400).json({ error: 'listId é obrigatório.' });

  const numBlocks = parseInt(blocks, 10);
  if (!numBlocks || numBlocks < 2 || numBlocks > 100) {
    return res.status(400).json({ error: 'blocks deve ser um número entre 2 e 100.' });
  }

  try {
    console.log(`[PIPELINE] Dividindo "${listId}" em ${numBlocks} blocos...`);
    const result = await splitList(listId, numBlocks);
    console.log(`[PIPELINE] Divisão concluída — ${result.blocks.length} sub-listas criadas.`);
    return res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error('[PIPELINE] Erro na divisão:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// DELETE /api/pipeline/:id
export async function deleteCampaign(req, res) {
  const { id } = req.params;
  try {
    console.log(`[PIPELINE] Excluindo lista "${id}"...`);
    await deleteList(id);
    console.log(`[PIPELINE] Lista "${id}" excluída com sucesso.`);
    return res.json({ status: 'ok', deleted: id });
  } catch (err) {
    console.error(`[PIPELINE] Erro ao excluir "${id}":`, err.message);
    return res.status(500).json({ error: 'Falha ao excluir lista.', detail: err.message });
  }
}

// GET /api/pipeline/:id/contacts?page=&limit=&search=
export async function getContacts(req, res) {
  const { id }   = req.params;
  const page     = Math.max(1, parseInt(req.query.page  ?? '1',  10));
  const limit    = Math.min(100, Math.max(10, parseInt(req.query.limit ?? '50', 10)));
  const search   = (req.query.search ?? '').trim();

  try {
    const result = await getListContacts(id, page, limit, search);
    return res.json(result);
  } catch (err) {
    console.error(`[PIPELINE] Erro ao listar contatos de "${id}":`, err.message);
    return res.status(500).json({ error: 'Falha ao consultar contatos.' });
  }
}

// POST /api/pipeline/:id/contacts
export async function addContacts(req, res) {
  const { id }     = req.params;
  const { phones } = req.body;

  if (!Array.isArray(phones) || phones.length === 0) {
    return res.status(400).json({ error: 'phones deve ser um array não-vazio.' });
  }

  const normalized = [...new Set(
    phones
      .map((p) => String(p).replace(/\D/g, ''))
      .filter((p) => p.length >= 8)
  )];

  if (!normalized.length) {
    return res.status(400).json({ error: 'Nenhum número válido fornecido (mín. 8 dígitos).' });
  }

  try {
    const result = await addContactsToList(id, normalized);
    console.log(`[PIPELINE] "${id}" — ${result.inserted} inseridos, ${result.skipped} duplicatas ignoradas.`);
    return res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error(`[PIPELINE] Erro ao adicionar contatos em "${id}":`, err.message);
    return res.status(500).json({ error: 'Falha ao adicionar contatos.', detail: err.message });
  }
}

// DELETE /api/pipeline/:id/contacts
export async function removeContact(req, res) {
  const { id }    = req.params;
  const { phone } = req.body;

  if (!phone) return res.status(400).json({ error: 'phone é obrigatório.' });

  try {
    const removed = await removeContactFromList(id, String(phone).trim());
    return res.json({ status: 'ok', removed });
  } catch (err) {
    console.error(`[PIPELINE] Erro ao remover contato de "${id}":`, err.message);
    return res.status(500).json({ error: 'Falha ao remover contato.' });
  }
}

// PATCH /api/pipeline/lists/:listId/toggle
export async function toggleCampaign(req, res) {
  const { listId } = req.params;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: '"enabled" deve ser boolean.' });
  }

  try {
    await toggleListEnabled(listId, enabled);
    return res.json({ status: 'ok', listId, enabled });
  } catch (err) {
    console.error('[PIPELINE] Erro ao alternar estado:', err.message);
    return res.status(500).json({ error: 'Falha ao atualizar lista.' });
  }
}
