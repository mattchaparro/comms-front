import { isAxiosError } from 'axios'

import { httpClient } from '@/services/http/client'
import type {
  FlowIssue,
  FlowLibraryEntry,
  FlowTarget,
  FlowValidationErrorDetail,
  WhatsAppFlow,
  WhatsAppFlowCreatePayload,
  WhatsAppFlowGeneratePayload,
  WhatsAppFlowGenerateResult,
  WhatsAppFlowList,
} from '@/types/whatsappFlows'

// Refleja api/v1/admin_whatsapp_flows.py en nexolu-comms-api (autorizado
// por scope: un cliente externo opera solo los formularios de sus apps).

const BASE = '/v1/admin/whatsapp-flows'

export async function fetchWhatsAppFlows(appId?: string): Promise<WhatsAppFlow[]> {
  const { data } = await httpClient.get<WhatsAppFlowList>(BASE, {
    params: appId ? { app_id: appId } : undefined,
  })
  return data.items
}

export async function fetchFlowLibrary(): Promise<FlowLibraryEntry[]> {
  const { data } = await httpClient.get<{ items: FlowLibraryEntry[] }>(`${BASE}/library`)
  return data.items
}

/** Solo el validador local de Connect (no toca Meta). */
export async function validateFlowJsonLocally(flowJson: unknown): Promise<FlowIssue[]> {
  const { data } = await httpClient.post<{ issues: FlowIssue[] }>(`${BASE}/validate`, {
    flow_json: flowJson,
  })
  return data.issues
}

export async function createWhatsAppFlow(
  payload: WhatsAppFlowCreatePayload,
): Promise<WhatsAppFlow> {
  const { data } = await httpClient.post<WhatsAppFlow>(BASE, payload)
  return data
}

export async function updateWhatsAppFlowJson(
  flowId: string,
  flowJson: Record<string, unknown>,
): Promise<WhatsAppFlow> {
  const { data } = await httpClient.put<WhatsAppFlow>(`${BASE}/${flowId}/json`, {
    flow_json: flowJson,
  })
  return data
}

export async function refreshWhatsAppFlow(flowId: string): Promise<WhatsAppFlow> {
  const { data } = await httpClient.post<WhatsAppFlow>(`${BASE}/${flowId}/refresh`)
  return data
}

export async function publishWhatsAppFlow(flowId: string): Promise<WhatsAppFlow> {
  const { data } = await httpClient.post<WhatsAppFlow>(`${BASE}/${flowId}/publish`)
  return data
}

export async function deprecateWhatsAppFlow(flowId: string): Promise<WhatsAppFlow> {
  const { data } = await httpClient.post<WhatsAppFlow>(`${BASE}/${flowId}/deprecate`)
  return data
}

export async function deleteWhatsAppFlow(flowId: string): Promise<void> {
  await httpClient.delete(`${BASE}/${flowId}`)
}

export async function syncWhatsAppFlows(target: FlowTarget): Promise<WhatsAppFlow[]> {
  const { data } = await httpClient.post<WhatsAppFlowList>(`${BASE}/sync`, target)
  return data.items
}

export async function createWhatsAppFlowFromLibrary(
  target: FlowTarget & { key: string; publish: boolean },
): Promise<WhatsAppFlow> {
  const { data } = await httpClient.post<WhatsAppFlow>(`${BASE}/from-library`, target)
  return data
}

export async function generateWhatsAppFlow(
  payload: WhatsAppFlowGeneratePayload,
): Promise<WhatsAppFlowGenerateResult> {
  const { data } = await httpClient.post<WhatsAppFlowGenerateResult>(`${BASE}/generate`, payload)
  return data
}

export async function regenerateWhatsAppFlow(
  flowId: string,
  description: string,
): Promise<WhatsAppFlowGenerateResult> {
  const { data } = await httpClient.post<WhatsAppFlowGenerateResult>(`${BASE}/${flowId}/generate`, {
    description,
  })
  return data
}

/**
 * Los errores del backend llegan de dos formas: `detail` texto (Meta caído,
 * conflicto de estado...) o `detail: {message, issues}` (422 del validador
 * local). Devuelve ambas cosas por separado para pintarlas donde van.
 */
export function describeFlowError(
  error: unknown,
  fallback: string,
): { message: string; issues: FlowIssue[] } {
  if (!isAxiosError<{ detail?: string | FlowValidationErrorDetail }>(error) || !error.response) {
    return { message: fallback, issues: [] }
  }
  const detail = error.response.data?.detail
  if (typeof detail === 'string') return { message: detail, issues: [] }
  if (detail && typeof detail === 'object' && Array.isArray(detail.issues)) {
    return { message: detail.message, issues: detail.issues }
  }
  return { message: fallback, issues: [] }
}
