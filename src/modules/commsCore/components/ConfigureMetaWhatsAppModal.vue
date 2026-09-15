<script setup lang="ts">
import { isAxiosError } from 'axios'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ToggleSwitch from 'primevue/toggleswitch'
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'
import { z } from 'zod'

import { useConfigureMetaWhatsAppMutation } from '../composables/useMetaWhatsApp'

const props = defineProps<{ appId: string }>()
const modelValue = defineModel<boolean>({ required: true })
const emit = defineEmits<{ configured: [] }>()

const schema = z.object({
  phoneNumberId: z.string().min(1, 'El phone_number_id es obligatorio'),
  accessToken: z.string().min(1, 'El access token es obligatorio'),
  wabaId: z.string().optional().or(z.literal('')),
  webhookVerifyToken: z.string().optional().or(z.literal('')),
  metaAppSecret: z.string().optional().or(z.literal('')),
  callbackSecret: z.string().optional().or(z.literal('')),
  callbackUrl: z.string().url('Debe ser una URL valida').optional().or(z.literal('')),
})

const { handleSubmit, defineField, errors, setErrors, resetForm } = useForm({
  initialValues: {
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    webhookVerifyToken: '',
    metaAppSecret: '',
    callbackSecret: '',
    callbackUrl: '',
  },
})

// Fuera del form de vee-validate: es un booleano simple sin validacion.
// Con esto en true, comms-api rechaza con 401 cualquier webhook de esta
// app sin firma de Meta verificable - encenderlo cuando la app tenga
// meta_app_secret configurado y trafico real.
const enforceMetaSignature = ref(false)

const [phoneNumberId, phoneNumberIdAttrs] = defineField('phoneNumberId')
const [accessToken, accessTokenAttrs] = defineField('accessToken')
const [wabaId, wabaIdAttrs] = defineField('wabaId')
const [webhookVerifyToken, webhookVerifyTokenAttrs] = defineField('webhookVerifyToken')
const [metaAppSecret, metaAppSecretAttrs] = defineField('metaAppSecret')
const [callbackSecret, callbackSecretAttrs] = defineField('callbackSecret')
const [callbackUrl, callbackUrlAttrs] = defineField('callbackUrl')

const mutation = useConfigureMetaWhatsAppMutation()

watch(modelValue, (open) => {
  if (open) {
    resetForm()
    enforceMetaSignature.value = false
    mutation.reset()
  }
})

const onSubmit = handleSubmit(async (values) => {
  const result = schema.safeParse(values)
  setErrors({ phoneNumberId: undefined, accessToken: undefined, callbackUrl: undefined })
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors
    setErrors({
      phoneNumberId: fieldErrors.phoneNumberId?.[0],
      accessToken: fieldErrors.accessToken?.[0],
      callbackUrl: fieldErrors.callbackUrl?.[0],
    })
    return
  }

  try {
    await mutation.mutateAsync({
      appId: props.appId,
      payload: {
        phone_number_id: result.data.phoneNumberId,
        access_token: result.data.accessToken,
        waba_id: result.data.wabaId || null,
        webhook_verify_token: result.data.webhookVerifyToken || null,
        meta_app_secret: result.data.metaAppSecret || null,
        callback_secret: result.data.callbackSecret || null,
        callback_url: result.data.callbackUrl || null,
        enforce_meta_signature: enforceMetaSignature.value,
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
    ? (error.response.data?.detail ?? 'No pudimos configurar Meta WhatsApp.')
    : 'No pudimos configurar Meta WhatsApp.'
})
</script>

<template>
  <Dialog
    v-model:visible="modelValue"
    header="Configurar Meta WhatsApp Cloud API"
    modal
    :draggable="false"
    :pt="{ root: { class: 'w-full max-w-md' } }"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <Message v-if="submitError" severity="error" :closable="false">{{ submitError }}</Message>
      <Message severity="info" :closable="false">
        El access token se genera manualmente en Meta Business Manager (System User) - no hay forma
        de generarlo desde aca. Pegalo aca una vez lo tengas; estas credenciales quedan cifradas y
        no se vuelven a mostrar en claro salvo con "Ver credenciales".
      </Message>

      <div class="flex flex-col gap-1.5">
        <label for="wa-phone-number-id" class="text-sm font-medium text-slate-700">phone_number_id</label>
        <InputText
          id="wa-phone-number-id"
          v-model="phoneNumberId"
          v-bind="phoneNumberIdAttrs"
          :invalid="Boolean(errors.phoneNumberId)"
          fluid
        />
        <Message v-if="errors.phoneNumberId" severity="error" size="small" variant="simple">
          {{ errors.phoneNumberId }}
        </Message>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="wa-access-token" class="text-sm font-medium text-slate-700">Access token</label>
        <InputText
          id="wa-access-token"
          v-model="accessToken"
          v-bind="accessTokenAttrs"
          :invalid="Boolean(errors.accessToken)"
          fluid
        />
        <Message v-if="errors.accessToken" severity="error" size="small" variant="simple">
          {{ errors.accessToken }}
        </Message>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="wa-waba-id" class="text-sm font-medium text-slate-700">
          WABA ID <span class="font-normal text-slate-400">(opcional)</span>
        </label>
        <InputText id="wa-waba-id" v-model="wabaId" v-bind="wabaIdAttrs" fluid />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="wa-callback-url" class="text-sm font-medium text-slate-700">
          Callback URL <span class="font-normal text-slate-400">(opcional)</span>
        </label>
        <InputText
          id="wa-callback-url"
          v-model="callbackUrl"
          v-bind="callbackUrlAttrs"
          placeholder="https://spa.nexolu.co/webhooks/whatsapp"
          :invalid="Boolean(errors.callbackUrl)"
          fluid
        />
        <Message v-if="errors.callbackUrl" severity="error" size="small" variant="simple">
          {{ errors.callbackUrl }}
        </Message>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="wa-webhook-verify-token" class="text-sm font-medium text-slate-700">
          Webhook verify token <span class="font-normal text-slate-400">(opcional)</span>
        </label>
        <InputText id="wa-webhook-verify-token" v-model="webhookVerifyToken" v-bind="webhookVerifyTokenAttrs" fluid />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="wa-meta-app-secret" class="text-sm font-medium text-slate-700">
          Meta app secret <span class="font-normal text-slate-400">(opcional)</span>
        </label>
        <InputText id="wa-meta-app-secret" v-model="metaAppSecret" v-bind="metaAppSecretAttrs" fluid />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="wa-callback-secret" class="text-sm font-medium text-slate-700">
          Callback secret <span class="font-normal text-slate-400">(opcional)</span>
        </label>
        <InputText id="wa-callback-secret" v-model="callbackSecret" v-bind="callbackSecretAttrs" fluid />
      </div>

      <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
        <div>
          <p class="text-sm font-medium text-slate-700">Exigir firma de Meta</p>
          <p class="text-xs text-slate-500">
            Rechaza (401) todo webhook sin firma verificable. Requiere el app secret configurado.
          </p>
        </div>
        <ToggleSwitch v-model="enforceMetaSignature" />
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
