<script setup lang="ts">
// Quién es esta persona, al lado de la conversación.
//
// Lo que Connect SABE: teléfono, cómo se llama, tags, campos, desde
// cuándo escribe y las notas del equipo. Nada de citas, pedidos ni saldos
// -- eso lo sabe la app dueña y lo pinta su propio panel cuando embeba
// esta bandeja (principio 45 del brief).
//
// Las notas no se guardan en cada tecla: se guardan al salir del campo.
// Un autosave por carácter contra el servidor convierte escribir tres
// líneas en treinta peticiones.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Chip from 'primevue/chip'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { computed, ref, watch } from 'vue'

import { fetchContactCard, updateContactCard } from '../services/chatService'

const props = defineProps<{ contactId: string }>()

const toast = useToast()
const queryClient = useQueryClient()

const { data: card } = useQuery({
  queryKey: computed(() => ['contact-card', props.contactId] as const),
  queryFn: () => fetchContactCard(props.contactId),
})

const notes = ref('')
const newTag = ref('')

/*
 * Corregir cómo se llama. El nombre lo trae la app dueña (el Spa) o el
 * perfil de WhatsApp, y a veces llega mal: Alejandra quedó como
 * «Reiniciar» y no había dónde arreglarlo. Al guardarlo, Connect le avisa
 * al Spa (`contact_updated`) y la ficha de allá también cambia.
 */
const editingName = ref(false)
const nameDraft = ref('')

function startEditName(): void {
  nameDraft.value = card.value?.name ?? ''
  editingName.value = true
}

function saveName(): void {
  const nombre = nameDraft.value.trim()
  editingName.value = false
  if (!card.value || nombre === '' || nombre === card.value.name) return
  saveMutation.mutate({ name: nombre })
}

watch(
  card,
  (value) => {
    if (value) notes.value = value.notes
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: (patch: { name?: string; notes?: string; tags?: string[] }) =>
    updateContactCard(props.contactId, patch),
  onSuccess: (updated) => {
    queryClient.setQueryData(['contact-card', props.contactId], updated)
    queryClient.invalidateQueries({ queryKey: ['chats'] })
  },
  onError: () => toast.add({ severity: 'error', summary: 'No se pudo guardar', life: 4000 }),
})

function saveNotes(): void {
  if (card.value && notes.value !== card.value.notes) {
    saveMutation.mutate({ notes: notes.value })
  }
}

function addTag(): void {
  const tag = newTag.value.trim()
  if (!tag || !card.value) return
  newTag.value = ''
  if (card.value.tags.includes(tag)) return
  saveMutation.mutate({ tags: [...card.value.tags, tag] })
}

function removeTag(tag: string): void {
  if (!card.value) return
  saveMutation.mutate({ tags: card.value.tags.filter((t) => t !== tag) })
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(`${iso}Z`).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const campos = computed(() => Object.entries(card.value?.fields ?? {}))
</script>

<template>
  <aside
    v-if="card"
    class="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-slate-50/60 p-4"
  >
    <div>
      <form v-if="editingName" class="flex items-center gap-1" @submit.prevent="saveName">
        <InputText
          v-model="nameDraft"
          size="small"
          class="min-w-0 flex-1"
          maxlength="128"
          autofocus
          aria-label="Nombre del contacto"
          @keydown.esc="editingName = false"
        />
        <Button type="submit" icon="pi pi-check" size="small" text aria-label="Guardar nombre" />
      </form>
      <p v-else class="flex items-center gap-1 text-sm font-semibold text-slate-800">
        {{ card.name || 'Sin nombre' }}
        <Button
          icon="pi pi-pencil"
          size="small"
          text
          rounded
          class="!h-6 !w-6"
          aria-label="Cambiar nombre"
          @click="startEditName"
        />
      </p>
      <p class="text-xs text-slate-500">{{ card.phone }}</p>
      <Tag
        class="mt-2"
        :severity="card.window_open ? 'success' : 'secondary'"
        :value="card.window_open ? 'Ventana 24h abierta' : 'Ventana cerrada'"
      />
    </div>

    <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
      <div>
        <p class="font-semibold text-slate-700">{{ card.messages_in }}</p>
        <p>recibidos</p>
      </div>
      <div>
        <p class="font-semibold text-slate-700">{{ card.messages_out }}</p>
        <p>enviados</p>
      </div>
      <div class="col-span-2">
        <p class="font-semibold text-slate-700">{{ fecha(card.first_seen_at) }}</p>
        <p>primera vez que escribió</p>
      </div>
    </div>

    <div>
      <p class="mb-1 text-xs font-semibold text-slate-600">Etiquetas</p>
      <div class="flex flex-wrap gap-1">
        <Chip
          v-for="tag in card.tags"
          :key="tag"
          :label="tag"
          removable
          class="!text-[11px]"
          @remove="removeTag(tag)"
        />
      </div>
      <InputText
        v-model="newTag"
        placeholder="Agregar etiqueta…"
        fluid
        class="mt-2 !text-xs"
        @keyup.enter="addTag"
      />
    </div>

    <div>
      <p class="mb-1 text-xs font-semibold text-slate-600">Notas del equipo</p>
      <Textarea
        v-model="notes"
        rows="5"
        fluid
        class="!text-xs"
        placeholder="Alérgica al acrílico. Siempre pide con María…"
        @blur="saveNotes"
      />
      <p class="mt-1 text-[10px] text-slate-400">
        Solo las ve el equipo. Se guardan al salir del campo.
      </p>
    </div>

    <div v-if="campos.length">
      <p class="mb-1 text-xs font-semibold text-slate-600">Datos guardados</p>
      <dl class="flex flex-col gap-1 text-[11px]">
        <div v-for="[clave, valor] in campos" :key="clave" class="flex justify-between gap-2">
          <dt class="shrink-0 text-slate-500">{{ clave }}</dt>
          <dd class="truncate text-right text-slate-700">{{ valor }}</dd>
        </div>
      </dl>
    </div>

    <p v-if="card.assigned_name" class="text-[11px] text-teal-700">
      <i class="pi pi-user mr-1 text-[10px]" />Atiende {{ card.assigned_name }}
    </p>

    <Button
      v-if="saveMutation.isPending.value"
      label="Guardando…"
      text
      size="small"
      disabled
      class="!text-[11px]"
    />
  </aside>
</template>
