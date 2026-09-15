<script setup lang="ts">
// Contactos con tags y campos (el modelo subscriber de ManyChat): lo que
// los flujos van marcando y lo que las apps pueden consultar. Editables a
// mano para corregir o segmentar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Chip from 'primevue/chip'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { computed, ref } from 'vue'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { formatDateTime } from '@/utils/formatDateTime'
import type { Contact } from '@/types/flows'

import { fetchContacts, updateContact } from '../services/flowsService'

const queryClient = useQueryClient()
const toast = useToast()

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))

const appFilter = ref<string | null>(null)
const { data: contacts, isLoading } = useQuery({
  queryKey: ['contacts', appFilter] as const,
  queryFn: () => fetchContacts(appFilter.value ?? undefined),
})

const dialogVisible = ref(false)
const editing = ref<Contact | null>(null)
const formName = ref('')
const formTags = ref('')
const formFields = ref('')
const formError = ref<string | null>(null)

function openEdit(contact: Contact): void {
  editing.value = contact
  formName.value = contact.name
  formTags.value = contact.tags.join(', ')
  formFields.value = JSON.stringify(contact.fields, null, 2)
  formError.value = null
  dialogVisible.value = true
}

const saveMutation = useMutation({
  mutationFn: async () => {
    const fields = JSON.parse(formFields.value || '{}') as Record<string, unknown>
    return updateContact((editing.value as Contact).id, {
      name: formName.value,
      tags: formTags.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      fields,
    })
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Contacto actualizado', life: 4000 })
  },
  onError: (error) => {
    formError.value =
      error instanceof SyntaxError
        ? `Los campos no son JSON válido: ${error.message}`
        : 'No pudimos guardar el contacto.'
  },
})
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">Contactos</h1>
      <p class="mt-1 text-sm text-slate-500">
        Cada teléfono que interactúa por WhatsApp, con los tags y campos que los flujos y las apps
        le van dejando.
      </p>
    </div>

    <div class="mb-4">
      <Select
        v-model="appFilter"
        :options="appOptions"
        placeholder="Todas las apps"
        show-clear
        class="w-56"
      />
    </div>

    <DataTable :value="contacts ?? []" :loading="isLoading" size="small" striped-rows>
      <Column field="app_id" header="App" />
      <Column header="Negocio">
        <template #body="{ data: row }">{{ row.business_id || '—' }}</template>
      </Column>
      <Column field="phone" header="Teléfono" />
      <Column field="name" header="Nombre" />
      <Column header="Tags">
        <template #body="{ data: row }">
          <div class="flex max-w-64 flex-wrap gap-1">
            <Chip v-for="tag in row.tags" :key="tag" :label="tag" class="!py-0.5 text-xs" />
            <span v-if="!row.tags.length" class="text-sm text-slate-400">—</span>
          </div>
        </template>
      </Column>
      <Column header="Último mensaje">
        <template #body="{ data: row }">
          {{ row.last_inbound_at ? formatDateTime(row.last_inbound_at) : '—' }}
        </template>
      </Column>
      <Column header="">
        <template #body="{ data: row }">
          <div class="flex justify-end">
            <Button icon="pi pi-pencil" text severity="secondary" title="Editar" @click="openEdit(row)" />
          </div>
        </template>
      </Column>
      <template #empty>
        <p class="py-6 text-center text-slate-500">
          Todavía no hay contactos: se crean solos con el primer mensaje entrante o el primer flujo
          disparado.
        </p>
      </template>
    </DataTable>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="`Editar ${editing?.phone}`"
      :draggable="false"
      class="w-full max-w-md"
    >
      <div class="flex flex-col gap-4">
        <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Nombre</label>
          <InputText v-model="formName" fluid />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">
            Tags <span class="font-normal text-slate-400">(separados por coma)</span>
          </label>
          <InputText v-model="formTags" fluid />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Campos (JSON)</label>
          <Textarea v-model="formFields" rows="5" class="font-mono !text-xs" auto-resize fluid />
        </div>

        <div class="flex gap-2 pt-2">
          <Button label="Cancelar" severity="secondary" outlined class="flex-1" @click="dialogVisible = false" />
          <Button label="Guardar" class="flex-[2]" :loading="saveMutation.isPending.value" @click="saveMutation.mutate()" />
        </div>
      </div>
    </Dialog>
  </div>
</template>
