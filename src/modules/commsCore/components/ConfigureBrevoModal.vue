<script setup lang="ts">
import { isAxiosError } from 'axios'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useForm } from 'vee-validate'
import { computed, watch } from 'vue'
import { z } from 'zod'

import { useConfigureBrevoMutation } from '../composables/useBrevo'

const props = defineProps<{ appId: string }>()
const modelValue = defineModel<boolean>({ required: true })
const emit = defineEmits<{ configured: [] }>()

const schema = z.object({
  fromEmail: z.string().email('Debe ser un email valido'),
  fromName: z.string().max(128).optional().or(z.literal('')),
  brevoApiKey: z.string().min(1, 'La API key de Brevo es obligatoria'),
})

const { handleSubmit, defineField, errors, setErrors, resetForm } = useForm({
  initialValues: { fromEmail: '', fromName: '', brevoApiKey: '' },
})

const [fromEmail, fromEmailAttrs] = defineField('fromEmail')
const [fromName, fromNameAttrs] = defineField('fromName')
const [brevoApiKey, brevoApiKeyAttrs] = defineField('brevoApiKey')

const mutation = useConfigureBrevoMutation()

watch(modelValue, (open) => {
  if (open) {
    resetForm()
    mutation.reset()
  }
})

const onSubmit = handleSubmit(async (values) => {
  const result = schema.safeParse(values)
  setErrors({ fromEmail: undefined, fromName: undefined, brevoApiKey: undefined })
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors
    setErrors({
      fromEmail: fieldErrors.fromEmail?.[0],
      fromName: fieldErrors.fromName?.[0],
      brevoApiKey: fieldErrors.brevoApiKey?.[0],
    })
    return
  }

  try {
    await mutation.mutateAsync({
      appId: props.appId,
      payload: {
        from_email: result.data.fromEmail,
        from_name: result.data.fromName || '',
        brevo_api_key: result.data.brevoApiKey,
      },
    })
    modelValue.value = false
    emit('configured')
  } catch {
    // submitError (computed) ya muestra el mensaje.
  }
})

const submitError = computed(() => {
  const error = mutation.error.value
  if (!error) return null
  return isAxiosError<{ detail?: string }>(error) && error.response
    ? (error.response.data?.detail ?? 'No pudimos configurar Brevo.')
    : 'No pudimos configurar Brevo.'
})
</script>

<template>
  <Dialog
    v-model:visible="modelValue"
    header="Configurar Brevo"
    modal
    :draggable="false"
    :pt="{ root: { class: 'w-full max-w-md' } }"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <Message v-if="submitError" severity="error" :closable="false">{{ submitError }}</Message>
      <Message severity="info" :closable="false">
        La API key se genera manualmente en el dashboard de Brevo - no hay forma de generarla desde
        aca. Sin esto, la app usa la cuenta de Brevo compartida de la plataforma.
      </Message>

      <div class="flex flex-col gap-1.5">
        <label for="brevo-from-email" class="text-sm font-medium text-slate-700">Remitente (from_email)</label>
        <InputText
          id="brevo-from-email"
          v-model="fromEmail"
          v-bind="fromEmailAttrs"
          placeholder="no-reply@spa.nexolu.co"
          :invalid="Boolean(errors.fromEmail)"
          fluid
        />
        <Message v-if="errors.fromEmail" severity="error" size="small" variant="simple">
          {{ errors.fromEmail }}
        </Message>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="brevo-from-name" class="text-sm font-medium text-slate-700">
          Nombre del remitente <span class="font-normal text-slate-400">(opcional)</span>
        </label>
        <InputText id="brevo-from-name" v-model="fromName" v-bind="fromNameAttrs" placeholder="Nexolu Spa" fluid />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="brevo-api-key" class="text-sm font-medium text-slate-700">API key de Brevo</label>
        <InputText
          id="brevo-api-key"
          v-model="brevoApiKey"
          v-bind="brevoApiKeyAttrs"
          :invalid="Boolean(errors.brevoApiKey)"
          fluid
        />
        <Message v-if="errors.brevoApiKey" severity="error" size="small" variant="simple">
          {{ errors.brevoApiKey }}
        </Message>
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
        <Button type="submit" label="Guardar" class="flex-[2]" :loading="mutation.isPending.value" />
      </div>
    </form>
  </Dialog>
</template>
