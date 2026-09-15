<script setup lang="ts">
import { isAxiosError } from 'axios'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useForm } from 'vee-validate'
import { computed, watch } from 'vue'
import { z } from 'zod'

import type { CommsAppCreated } from '@/types/commsCore'

import { useCommsAppMutations } from '../composables/useCommsAppMutations'

const modelValue = defineModel<boolean>({ required: true })
const emit = defineEmits<{ created: [app: CommsAppCreated] }>()

const schema = z.object({
  appId: z
    .string()
    .min(1, 'El app_id es obligatorio')
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Solo minusculas, numeros y guiones, sin empezar con guion'),
  name: z.string().max(128).optional().or(z.literal('')),
})

const { handleSubmit, defineField, errors, setErrors, resetForm } = useForm({
  initialValues: { appId: '', name: '' },
})

const [appId, appIdAttrs] = defineField('appId')
const [name, nameAttrs] = defineField('name')

const { createMutation } = useCommsAppMutations()

watch(modelValue, (open) => {
  if (open) {
    resetForm()
    createMutation.reset()
  }
})

const onSubmit = handleSubmit(async (values) => {
  const result = schema.safeParse(values)
  setErrors({ appId: undefined, name: undefined })
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors
    setErrors({ appId: fieldErrors.appId?.[0], name: fieldErrors.name?.[0] })
    return
  }

  try {
    const created = await createMutation.mutateAsync({ app_id: result.data.appId, name: result.data.name || '' })
    modelValue.value = false
    emit('created', created)
  } catch {
    // submitError (computed) ya muestra el mensaje.
  }
})

const submitError = computed(() => {
  const error = createMutation.error.value
  if (!error) return null
  return isAxiosError<{ detail?: string }>(error) && error.response
    ? (error.response.data?.detail ?? 'No pudimos crear la app.')
    : 'No pudimos crear la app.'
})
</script>

<template>
  <Dialog
    v-model:visible="modelValue"
    header="Nueva app de Comunicaciones"
    modal
    :draggable="false"
    :pt="{ root: { class: 'w-full max-w-md' } }"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <Message v-if="submitError" severity="error" :closable="false">{{ submitError }}</Message>

      <div class="flex flex-col gap-1.5">
        <label for="comms-app-id" class="text-sm font-medium text-slate-700">app_id</label>
        <InputText
          id="comms-app-id"
          v-model="appId"
          v-bind="appIdAttrs"
          placeholder="Ej. spa"
          :invalid="Boolean(errors.appId)"
          fluid
        />
        <Message v-if="errors.appId" severity="error" size="small" variant="simple">{{ errors.appId }}</Message>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="comms-app-name" class="text-sm font-medium text-slate-700">
          Nombre <span class="font-normal text-slate-400">(opcional)</span>
        </label>
        <InputText id="comms-app-name" v-model="name" v-bind="nameAttrs" placeholder="Ej. Nexolu Spa" fluid />
      </div>

      <div class="flex gap-2 pt-2">
        <Button
          type="button"
          label="Cancelar"
          severity="secondary"
          outlined
          class="flex-1"
          @click="modelValue = false"
        />
        <Button type="submit" label="Crear" class="flex-[2]" :loading="createMutation.isPending.value" />
      </div>
    </form>
  </Dialog>
</template>
