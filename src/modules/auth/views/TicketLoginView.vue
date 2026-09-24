<script setup lang="ts">
// Lo que ve quien viene del Spa SOLO si su pase no sirvio (ya usado o
// vencido): el canje en si pasa en el guard del router y, si sale bien,
// esta vista ni se monta.
import { ticketError } from '@/services/http/ticketError'
import ConnectWordmark from '@/ui/ConnectWordmark.vue'
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-[#f7f8fa] p-6">
    <div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div class="mb-4 flex justify-center"><ConnectWordmark /></div>
      <p class="text-sm text-slate-700">
        {{ ticketError ?? 'Abriendo el chat…' }}
      </p>
      <p v-if="ticketError" class="mt-3 text-xs text-slate-500">
        El enlace sirve una sola vez. Vuelve a tu app y toca otra vez «WhatsApp».
      </p>
    </div>
  </div>
</template>
