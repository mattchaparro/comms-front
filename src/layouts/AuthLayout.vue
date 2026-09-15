<script setup lang="ts">
// Mismo layout que nexolu-pos-front/src/layouts/AuthLayout.vue (degradado
// indigo + panel de login) - identidad visual compartida entre las dos
// SPAs de Nexolu, aunque esta no tenga la capa Nexolu UI (ver CLAUDE.md).
import logo from '@/assets/nexolu-logo.png'

const dotPattern =
  "url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'0.06\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')"
</script>

<template>
  <div class="flex min-h-screen">
    <div
      class="relative hidden w-1/2 items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 lg:flex"
    >
      <div class="absolute inset-0 opacity-80" :style="{ backgroundImage: dotPattern }" />
      <div class="relative z-10 px-12 text-center">
        <img :src="logo" alt="Nexolú" class="mx-auto mb-8 h-20 w-auto" />
        <h2 class="mb-4 text-3xl font-bold text-white">Nexolú Connect</h2>
        <p class="mx-auto max-w-md text-lg text-white/80">
          Conecta tu negocio con tus clientes: WhatsApp, plantillas, webhooks y números por negocio.
        </p>
        <div class="mt-10 flex justify-center gap-6 text-white/70">
          <div class="flex flex-col items-center">
            <i class="pi pi-whatsapp mb-1 text-2xl" />
            <span class="text-xs">Canales</span>
          </div>
          <div class="flex flex-col items-center">
            <i class="pi pi-send mb-1 text-2xl" />
            <span class="text-xs">Mensajería</span>
          </div>
          <div class="flex flex-col items-center">
            <i class="pi pi-arrow-right-arrow-left mb-1 text-2xl" />
            <span class="text-xs">Webhooks</span>
          </div>
        </div>
      </div>
    </div>
    <div class="flex w-full items-center justify-center bg-slate-50 px-6 py-12 lg:w-1/2">
      <div class="w-full max-w-md">
        <img :src="logo" alt="Nexolú" class="mx-auto mb-8 h-16 w-auto lg:hidden" />
        <router-view />
      </div>
    </div>
  </div>
</template>
