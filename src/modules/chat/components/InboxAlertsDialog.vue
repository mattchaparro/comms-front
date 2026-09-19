<script setup lang="ts">
// A quién se le avisa que hay conversaciones sin responder.
//
// Existe porque el panel solo avisa mientras alguien lo tiene abierto, y el
// número del negocio no tiene app móvil. Es configuración y no una regla en
// el código porque quien recibe los avisos cambia (entra una recepcionista,
// el dueño viaja) y cada negocio aguanta un silencio distinto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { computed, ref, watch } from 'vue'

import { fetchTemplates } from '@/modules/templates/services/templatesService'

import { fetchAlertConfigs, previewAlert, saveAlertConfig } from '../services/alertsService'

const props = defineProps<{ apps: string[]; defaultApp: string | null }>()
const visible = defineModel<boolean>('visible', { required: true })

const toast = useToast()
const queryClient = useQueryClient()

const appId = ref<string>(props.defaultApp ?? props.apps[0] ?? '')
const isActive = ref(true)
const emails = ref('')
const whatsappTo = ref('')
const urgentTemplate = ref<string | null>(null)
const quietMinutes = ref(10)

const { data: configs } = useQuery({
  queryKey: ['inbox-alerts'] as const,
  queryFn: fetchAlertConfigs,
  enabled: computed(() => visible.value),
})

const { data: templates } = useQuery({
  queryKey: computed(() => ['chat-templates', appId.value] as const),
  queryFn: () => fetchTemplates(appId.value),
  enabled: computed(() => visible.value && !!appId.value),
})

const templateOptions = computed(() => [
  { label: 'Ninguna (fuera de ventana no mando WhatsApp)', value: null },
  ...(templates.value ?? [])
    .filter((t) => t.status === 'APPROVED')
    .map((t) => ({ label: `${t.name} (${t.language})`, value: t.name })),
])

// Al abrir (o al cambiar de app) se carga lo que ya estaba guardado.
watch(
  [visible, appId, configs],
  () => {
    if (!visible.value) return
    const saved = (configs.value ?? []).find((c) => c.app_id === appId.value)
    isActive.value = saved?.is_active ?? true
    emails.value = (saved?.emails ?? []).join(', ')
    whatsappTo.value = saved?.whatsapp_to ?? ''
    urgentTemplate.value = saved?.urgent_template || null
    quietMinutes.value = saved?.quiet_minutes ?? 10
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: () =>
    saveAlertConfig({
      app_id: appId.value,
      business_id: '',
      is_active: isActive.value,
      emails: emails.value
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
      whatsapp_to: whatsappTo.value.trim(),
      urgent_template: urgentTemplate.value ?? '',
      urgent_template_language: 'es',
      quiet_minutes: quietMinutes.value,
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['inbox-alerts'] })
    toast.add({ severity: 'success', summary: 'Avisos guardados', life: 3000 })
    visible.value = false
  },
  onError: () => toast.add({ severity: 'error', summary: 'No se pudo guardar', life: 5000 }),
})

const preview = ref<string | null>(null)
const previewMutation = useMutation({
  mutationFn: () => previewAlert(appId.value),
  onSuccess: (data) => {
    preview.value =
      data.pending === 0
        ? 'Ahora mismo no hay nada sin responder: no se mandaría ningún aviso.'
        : `${data.subject}\n\n${data.body}`
  },
  onError: () =>
    toast.add({
      severity: 'warn',
      summary: 'Guarda primero',
      detail: 'La vista previa usa la configuración ya guardada.',
      life: 6000,
    }),
})
</script>

<template>
  <Dialog v-model:visible="visible" modal header="Avisos de la bandeja" class="w-[38rem] max-w-[95vw]">
    <p class="mb-4 text-xs text-slate-500">
      El panel solo avisa mientras lo tienes abierto. Esto manda un correo
      <strong>agrupado</strong> con las conversaciones que llevan rato sin responder, y se calla
      solo cuando alguien las atiende.
    </p>

    <div class="flex flex-col gap-4">
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-600">App</span>
        <Select v-model="appId" :options="props.apps" class="!text-sm" />
      </label>

      <label class="flex items-center gap-2">
        <ToggleSwitch v-model="isActive" />
        <span class="text-sm text-slate-700">Avisos activos</span>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-600">Correos (separados por coma)</span>
        <InputText v-model="emails" placeholder="duena@luxury.co, recepcion@luxury.co" fluid class="!text-sm" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-600">
          Avisar después de… (minutos sin responder)
        </span>
        <InputNumber v-model="quietMinutes" :min="1" :max="1440" class="w-32" />
        <span class="text-[11px] text-slate-400">
          Por debajo de esto no se molesta a nadie: normalmente el bot ya está contestando.
        </span>
      </label>

      <div class="rounded-lg border border-slate-200 p-3">
        <p class="mb-2 text-xs font-semibold text-slate-600">WhatsApp al encargado (opcional)</p>
        <InputText v-model="whatsappTo" placeholder="573001112233" fluid class="!text-sm" />
        <p class="mt-2 text-[11px] text-slate-500">
          Sale <strong>gratis</strong> si ese número le escribió al negocio en las últimas 24 horas
          (por ejemplo con un atajo del celular que mande algo una vez al día). Si la ventana está
          cerrada, WhatsApp solo entrega una plantilla, y esa sí se cobra:
        </p>
        <Select
          v-model="urgentTemplate"
          :options="templateOptions"
          option-label="label"
          option-value="value"
          class="mt-2 !text-sm"
          fluid
        />
      </div>

      <div v-if="preview" class="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
        {{ preview }}
      </div>
    </div>

    <template #footer>
      <Button
        label="Ver qué se mandaría"
        severity="secondary"
        text
        :loading="previewMutation.isPending.value"
        @click="previewMutation.mutate()"
      />
      <Button
        label="Guardar"
        icon="pi pi-check"
        :loading="saveMutation.isPending.value"
        :disabled="!appId"
        @click="saveMutation.mutate()"
      />
    </template>
  </Dialog>
</template>
