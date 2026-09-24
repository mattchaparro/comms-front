<script setup lang="ts">
// Layout con la identidad propia de Connect (chrome blanco + wordmark
// propio, ver src/theme/nexoluPreset.ts): ya no comparte el look del
// POS/admin - decision de Alejandro, sesion 15/09/2026.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { chatOnlyNavItems, clientNavItems, platformNavItems } from '@/router/navigation'
import { useAuthStore } from '@/stores/auth.store'
import PushToggle from '@/modules/push/components/PushToggle.vue'
import { NxNavbar, NxSidebar } from '@/ui'

const auth = useAuthStore()
const router = useRouter()

const navItems = computed(() =>
  auth.isPlatform ? platformNavItems : auth.isChatOnly ? chatOnlyNavItems : clientNavItems,
)
const menuOpen = ref(false)

async function handleLogout(): Promise<void> {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <!-- 100dvh y no 100vh: en el celular la barra del navegador aparece y
       desaparece, y con vh el chat quedaba con la caja de escribir detras
       de ella. -->
  <div class="flex min-h-dvh bg-[#f7f8fa]">
    <NxSidebar v-model:mobile-open="menuOpen" :items="navItems" />
    <div class="flex min-w-0 flex-1 flex-col">
      <NxNavbar
        :user-name="auth.user?.full_name ?? ''"
        @logout="handleLogout"
        @menu="menuOpen = true"
      >
        <template #actions>
          <PushToggle />
        </template>
      </NxNavbar>
      <main class="min-w-0 flex-1 p-3 sm:p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
