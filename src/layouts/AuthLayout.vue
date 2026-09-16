<script setup lang="ts">
// Login con la identidad propia de Connect (azul->teal, ver
// src/theme/nexoluPreset.ts): el panel dejo de compartir el degradado
// indigo del POS - decision de Alejandro, sesion 15/09/2026.
import ConnectWordmark from '@/ui/ConnectWordmark.vue'

const dotPattern =
  "url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'0.06\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')"
</script>

<template>
  <div class="flex min-h-screen">
    <div
      class="relative hidden w-1/2 items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-teal-600 lg:flex"
    >
      <div class="absolute inset-0 opacity-80" :style="{ backgroundImage: dotPattern }" />
      <div class="relative z-10 px-12 text-center">
        <span
          class="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 backdrop-blur"
        >
          <svg viewBox="0 0 24 24" fill="none" class="h-11 w-11 text-white">
            <path
              d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-4.2 3.4c-.66.53-1.8.1-1.8-.87z"
              fill="currentColor"
              opacity="0.92"
            />
            <circle cx="9" cy="9.5" r="1.4" fill="#2563eb" />
            <circle cx="15" cy="9.5" r="1.4" fill="#2563eb" />
            <path d="M10.4 9.5h3.2" stroke="#2563eb" stroke-width="1.1" />
          </svg>
        </span>
        <h2 class="mb-4 text-3xl font-bold text-white">Nexolú Connect</h2>
        <p class="mx-auto max-w-md text-lg text-white/80">
          Conversaciones que trabajan por tu negocio: flujos, campañas, catálogo y WhatsApp en un
          solo lugar.
        </p>
        <div class="mt-10 flex justify-center gap-6 text-white/70">
          <div class="flex flex-col items-center">
            <i class="pi pi-sitemap mb-1 text-2xl" />
            <span class="text-xs">Flujos</span>
          </div>
          <div class="flex flex-col items-center">
            <i class="pi pi-whatsapp mb-1 text-2xl" />
            <span class="text-xs">Canales</span>
          </div>
          <div class="flex flex-col items-center">
            <i class="pi pi-shopping-bag mb-1 text-2xl" />
            <span class="text-xs">Catálogo</span>
          </div>
        </div>
      </div>
    </div>
    <div class="flex w-full items-center justify-center bg-[#f7f8fa] px-6 py-12 lg:w-1/2">
      <div class="w-full max-w-md">
        <div class="mb-8 flex justify-center lg:hidden">
          <ConnectWordmark />
        </div>
        <router-view />
      </div>
    </div>
  </div>
</template>
