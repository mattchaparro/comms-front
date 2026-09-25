<script setup lang="ts">
// Mismo patron que nexolu-pos-front/src/modules/auth/views/LoginView.vue:
// useForm() sin validationSchema + Zod en el submit (bug de integracion
// vee-validate 4.15.1 / @vee-validate/zod 4.15.1, ver CLAUDE.md). Unica
// diferencia real: PrimeVue directo (InputText/Password/Button) en vez de
// NxInput/NxButton - este repo no tiene la capa Nexolu UI todavia.
import { isAxiosError } from 'axios'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Password from 'primevue/password'
import InputText from 'primevue/inputtext'
import { useForm } from 'vee-validate'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { z } from 'zod'

import { readCameFromApp } from '@/services/http/cameFromApp'
import { redirectToSso, ssoError, ssoIsConfigured } from '@/services/http/ssoAssertion'
import { useAuthStore } from '@/stores/auth.store'

const loginSchema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Ingresa un correo válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

const { handleSubmit, defineField, errors, setErrors } = useForm({
  initialValues: { email: '', password: '' },
})

const [email, emailAttrs] = defineField('email')
const [password, passwordAttrs] = defineField('password')

const authStore = useAuthStore()
const router = useRouter()
const submitError = ref<string | null>(null)
const isSubmitting = ref(false)

const ssoAvailable = ssoIsConfigured()
// Con SSO disponible el formulario local arranca plegado: es para el
// break-glass del admin y para clientes externos con contraseña propia.
const showLocalForm = ref(!ssoAvailable)

// `ssoError` lo pone el guard del router cuando un canje falla; NO se
// reintenta el SSO solo (un 403 fallaria igual: bucle sin formulario).
const displayError = computed(() => submitError.value ?? ssoError.value)

// Quien entro alguna vez desde otra app (la recepcionista del Spa) no
// tiene contrasena aca: si su sesion vencio, este formulario no le sirve.
const cameFromApp = readCameFromApp()

/*
 * La puerta para la gente de los salones.
 *
 * Su cuenta vive en el Spa, no aqui: Connect le cree al Spa. Antes, para
 * entrar habia que abrir la agenda, ir al menu «WhatsApp» y tocar «Abrir el
 * chat». Este boton lleva a esa misma puerta del Spa: si ya hay sesion alla
 * entra derecho, y si no pide el mismo correo y la misma contrasena de la
 * agenda y vuelve aqui con la persona adentro, como usuaria de SU salon.
 */
const spaUrl = (import.meta.env.VITE_SPA_APP_URL || 'https://agenda.nexolu.co').replace(/\/$/, '')
const entrarConElSpa = `${spaUrl}/abrir-connect`
const localFormVisible = computed(() => showLocalForm.value || Boolean(ssoError.value))

function entrarConNexolu(): void {
  submitError.value = null
  ssoError.value = null
  try {
    redirectToSso(router.currentRoute.value.query.redirect as string | undefined)
  } catch {
    submitError.value = 'El acceso con Nexolú no está configurado en esta instalación.'
    showLocalForm.value = true
  }
}

const onSubmit = handleSubmit(async (values) => {
  const result = loginSchema.safeParse(values)
  // Sin validationSchema, vee-validate no revalida solo al tipear (ver
  // CLAUDE.md) - sin este clear, un error de un submit anterior ("correo
  // obligatorio") se queda pegado en pantalla aunque el campo ya sea valido.
  setErrors({ email: undefined, password: undefined })
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors
    setErrors({
      email: fieldErrors.email?.[0],
      password: fieldErrors.password?.[0],
    })
    return
  }

  submitError.value = null
  isSubmitting.value = true
  try {
    await authStore.login({ email: result.data.email, password: result.data.password })
    await router.push({ name: 'dashboard' })
  } catch (error) {
    submitError.value =
      isAxiosError<{ detail?: string }>(error) && error.response
        ? (error.response.data?.detail ?? 'No pudimos iniciar sesión. Intenta de nuevo.')
        : 'No pudimos iniciar sesión. Intenta de nuevo.'
  } finally {
    isSubmitting.value = false
  }
})
</script>

<template>
  <div>
    <div class="mb-8 text-center">
      <h1 class="text-3xl font-bold text-slate-900">Nexolú Connect</h1>
      <p class="mt-2 text-slate-500">Conecta tu negocio con tus clientes · inicia sesión para continuar</p>
    </div>

    <Message v-if="cameFromApp" severity="info" :closable="false" class="mb-5">
      Tu sesión se cerró. Vuelve a entrar con tu cuenta del Spa.
    </Message>

    <div class="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p class="text-sm text-emerald-900">¿Trabajas en un salón con Nexolú Spa?</p>
      <a
        :href="entrarConElSpa"
        class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Entrar con mi cuenta del Spa
        <i class="pi pi-arrow-right text-xs" />
      </a>
      <p class="mt-2 text-xs text-emerald-800">Con el mismo correo y contraseña de la agenda.</p>
    </div>

    <Message v-if="displayError" severity="error" :closable="false" class="mb-5">
      {{ displayError }}
    </Message>

    <div v-if="ssoAvailable" class="space-y-4">
      <Button label="Entrar con Nexolú" class="w-full" @click="entrarConNexolu" />

      <button
        v-if="!localFormVisible"
        type="button"
        class="w-full text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        @click="showLocalForm = true"
      >
        Entrar con correo y contraseña
      </button>
    </div>

    <form
      v-show="localFormVisible"
      class="space-y-5"
      :class="{ 'mt-6 border-t border-slate-200 pt-6': ssoAvailable }"
      novalidate
      @submit.prevent="onSubmit"
    >
      <div class="flex flex-col gap-1.5">
        <label for="email" class="text-sm font-medium text-slate-700">Correo</label>
        <InputText
          id="email"
          v-model="email"
          v-bind="emailAttrs"
          type="email"
          autocomplete="username"
          :invalid="Boolean(errors.email)"
          fluid
        />
        <Message v-if="errors.email" severity="error" size="small" variant="simple">
          {{ errors.email }}
        </Message>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="password" class="text-sm font-medium text-slate-700">Contraseña</label>
        <Password
          v-model="password"
          input-id="password"
          v-bind="passwordAttrs"
          autocomplete="current-password"
          :invalid="Boolean(errors.password)"
          :feedback="false"
          toggle-mask
          fluid
        />
        <Message v-if="errors.password" severity="error" size="small" variant="simple">
          {{ errors.password }}
        </Message>
      </div>

      <Button
        type="submit"
        label="Ingresar"
        class="w-full"
        :severity="ssoAvailable ? 'secondary' : undefined"
        :outlined="ssoAvailable"
        :loading="isSubmitting"
      />
    </form>
  </div>
</template>
