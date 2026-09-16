<script setup lang="ts">
// Layout con la identidad propia de Connect (chrome blanco + wordmark
// propio, ver src/theme/nexoluPreset.ts): ya no comparte el look del
// POS/admin - decision de Alejandro, sesion 15/09/2026.
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { clientNavItems, platformNavItems } from '@/router/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { NxNavbar, NxSidebar } from '@/ui'

const auth = useAuthStore()
const router = useRouter()

const navItems = computed(() => (auth.isPlatform ? platformNavItems : clientNavItems))

async function handleLogout(): Promise<void> {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-screen bg-[#f7f8fa]">
    <NxSidebar :items="navItems" />
    <div class="flex min-w-0 flex-1 flex-col">
      <NxNavbar :user-name="auth.user?.full_name ?? ''" @logout="handleLogout" />
      <main class="flex-1 p-6 pb-20 lg:pb-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
