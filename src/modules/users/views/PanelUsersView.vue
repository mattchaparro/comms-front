<script setup lang="ts">
// Usuarios del panel (solo plataforma): la distincion dura admin de
// Nexolu / cliente externo se administra aca - quien entra, con que rol, y
// a que apps (negocios) queda atado un cliente. Un usuario sin contraseña
// solo puede entrar por SSO (auth.nexolu.co).
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { computed, ref, watch } from 'vue'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { formatDateTime } from '@/utils/formatDateTime'
import type { PanelRole, PanelUser } from '@/types/users'

import { createPanelUser, fetchPanelUsers, updatePanelUser } from '../services/usersService'

const queryClient = useQueryClient()
const toast = useToast()

const { data: users, isLoading } = useQuery({
  queryKey: ['panel-users'] as const,
  queryFn: fetchPanelUsers,
})

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))

// --- crear / editar (mismo dialogo, `editing` decide) ---

const dialogVisible = ref(false)
const editing = ref<PanelUser | null>(null)
const formEmail = ref('')
const formName = ref('')
const formRole = ref<PanelRole>('client')
const formPassword = ref('')
const formAppIds = ref<string[]>([])
const formError = ref<string | null>(null)

function openCreate(): void {
  editing.value = null
  formEmail.value = ''
  formName.value = ''
  formRole.value = 'client'
  formPassword.value = ''
  formAppIds.value = []
  formError.value = null
  dialogVisible.value = true
}

function openEdit(user: PanelUser): void {
  editing.value = user
  formEmail.value = user.email
  formName.value = user.full_name
  formRole.value = user.role
  formPassword.value = ''
  formAppIds.value = [...user.app_ids]
  formError.value = null
  dialogVisible.value = true
}

watch(formRole, (role) => {
  if (role === 'platform') formAppIds.value = []
})

const saveMutation = useMutation({
  mutationFn: async () => {
    if (editing.value) {
      return updatePanelUser(editing.value.id, {
        full_name: formName.value,
        role: formRole.value,
        app_ids: formAppIds.value,
        ...(formPassword.value ? { password: formPassword.value } : {}),
      })
    }
    return createPanelUser({
      email: formEmail.value,
      full_name: formName.value,
      role: formRole.value,
      app_ids: formAppIds.value,
      ...(formPassword.value ? { password: formPassword.value } : {}),
    })
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['panel-users'] })
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: editing.value ? 'Usuario actualizado' : 'Usuario creado', life: 4000 })
  },
  onError: (error) => {
    formError.value =
      isAxiosError<{ detail?: string }>(error) && error.response
        ? (error.response.data?.detail ?? 'No pudimos guardar el usuario.')
        : 'No pudimos guardar el usuario.'
  },
})

function save(): void {
  formError.value = null
  if (!editing.value && !formEmail.value.trim()) {
    formError.value = 'El correo es obligatorio.'
    return
  }
  if (formRole.value === 'client' && formAppIds.value.length === 0) {
    formError.value = 'Un cliente externo necesita al menos una app (negocio).'
    return
  }
  saveMutation.mutate()
}

const toggleMutation = useMutation({
  mutationFn: (user: PanelUser) => updatePanelUser(user.id, { is_active: !user.is_active }),
  onSuccess: (user) => {
    queryClient.invalidateQueries({ queryKey: ['panel-users'] })
    toast.add({
      severity: user.is_active ? 'success' : 'warn',
      summary: user.is_active ? 'Usuario activado' : 'Usuario desactivado (su sesión muere ya)',
      life: 4000,
    })
  },
})
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:items-center">
      <div>
        <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Usuarios</h1>
        <p class="mt-1 text-sm text-slate-500">
          Quién entra a Connect: administradores de Nexolú (plataforma completa) y clientes
          externos atados a su negocio.
        </p>
      </div>
      <Button label="Nuevo usuario" icon="pi pi-plus" @click="openCreate" />
    </div>

    <DataTable :value="users ?? []" :loading="isLoading" size="small" striped-rows>
      <Column field="email" header="Correo" />
      <Column field="full_name" header="Nombre" />
      <Column header="Rol">
        <template #body="{ data: row }">
          <Tag
            :value="row.role === 'platform' ? 'Nexolú' : 'cliente'"
            :severity="row.role === 'platform' ? 'info' : 'secondary'"
          />
        </template>
      </Column>
      <Column header="Apps">
        <template #body="{ data: row }">
          <span class="text-sm text-slate-600">
            {{ row.role === 'platform' ? 'todas' : row.app_ids.join(', ') || '—' }}
          </span>
        </template>
      </Column>
      <Column header="Acceso">
        <template #body="{ data: row }">
          <span class="text-sm text-slate-600">{{ row.has_password ? 'SSO + contraseña' : 'solo SSO' }}</span>
        </template>
      </Column>
      <Column header="Último ingreso">
        <template #body="{ data: row }">
          {{ row.last_login_at ? formatDateTime(row.last_login_at) : '—' }}
        </template>
      </Column>
      <Column header="Activo">
        <template #body="{ data: row }">
          <ToggleSwitch
            :model-value="row.is_active"
            @update:model-value="toggleMutation.mutate(row)"
          />
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
          Solo existe el operador de emergencia (variables de entorno). Crea aquí a los demás.
        </p>
      </template>
    </DataTable>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="editing ? `Editar ${editing.email}` : 'Nuevo usuario'"
      :draggable="false"
      class="w-full max-w-md"
    >
      <div class="flex flex-col gap-4">
        <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>

        <div v-if="!editing" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Correo</label>
          <InputText v-model="formEmail" type="email" fluid />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Nombre</label>
          <InputText v-model="formName" fluid />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Rol</label>
          <Select
            v-model="formRole"
            :options="[
              { label: 'Cliente externo (solo su negocio)', value: 'client' },
              { label: 'Admin de Nexolú (plataforma completa)', value: 'platform' },
            ]"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>

        <div v-if="formRole === 'client'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Apps (negocios)</label>
          <MultiSelect
            v-model="formAppIds"
            :options="appOptions"
            placeholder="Selecciona las apps del cliente"
            display="chip"
            fluid
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">
            Contraseña
            <span class="font-normal text-slate-400">
              ({{ editing ? 'dejar vacía para no cambiarla' : 'opcional: sin ella, solo SSO' }})
            </span>
          </label>
          <Password v-model="formPassword" :feedback="false" toggle-mask fluid />
        </div>

        <div class="flex gap-2 pt-2">
          <Button label="Cancelar" severity="secondary" outlined class="flex-1" @click="dialogVisible = false" />
          <Button label="Guardar" class="flex-[2]" :loading="saveMutation.isPending.value" @click="save" />
        </div>
      </div>
    </Dialog>
  </div>
</template>
