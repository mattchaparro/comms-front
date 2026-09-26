import { httpClient } from '@/services/http/client'
import type {
  TemplateCreatePayload,
  TemplateDraft,
  TemplateDraftPayload,
  TemplateList,
  WhatsAppTemplate,
} from '@/types/templates'

// Refleja api/v1/admin_templates.py en nexolu-comms-api (autorizado por
// scope: un cliente externo opera solo las plantillas de sus apps).

export async function fetchTemplates(appId?: string): Promise<WhatsAppTemplate[]> {
  const { data } = await httpClient.get<TemplateList>('/v1/admin/templates', {
    params: appId ? { app_id: appId } : undefined,
  })
  return data.items
}

export async function createTemplate(payload: TemplateCreatePayload): Promise<WhatsAppTemplate> {
  const { data } = await httpClient.post<WhatsAppTemplate>('/v1/admin/templates', payload)
  return data
}

export async function syncTemplates(appId: string, businessId?: string): Promise<WhatsAppTemplate[]> {
  const { data } = await httpClient.post<TemplateList>('/v1/admin/templates/sync', {
    app_id: appId,
    business_id: businessId,
  })
  return data.items
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await httpClient.delete(`/v1/admin/templates/${templateId}`)
}

// La IA redacta; no crea nada en Meta. Puede tardar (una o dos pasadas del
// modelo), de ahi el timeout largo.
export async function draftTemplate(payload: TemplateDraftPayload): Promise<TemplateDraft> {
  const { data } = await httpClient.post<TemplateDraft>('/v1/admin/templates/draft', payload, {
    timeout: 120000,
  })
  return data
}
