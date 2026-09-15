<script setup lang="ts">
// Mismo layout que nexolu-pos-front (NxSidebar + NxNavbar, ver su
// SuperAdminLayout.vue) - sin capa completa de Nexolu UI todavia (ver
// CLAUDE.md, "sin Nexolu UI por ahora"), pero el sidebar/navbar son
// genericos (sin nada especifico del dominio de POS) asi que se copian
// directo en vez de reinventar un menu de texto plano.
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { clientNavItems, platformNavItems } from '@/router/navigation'
import logo from '@/assets/nexolu-logo.png'
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
  <div class="flex min-h-screen bg-slate-50">
    <NxSidebar :items="navItems" :logo="logo" />
    <div class="flex min-w-0 flex-1 flex-col">
      <NxNavbar :logo="logo" :user-name="auth.user?.full_name ?? ''" @logout="handleLogout" />
      <main class="flex-1 p-6 pb-20 lg:pb-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
