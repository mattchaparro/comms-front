import type { NavItem } from '@/types/navigation'

// Dos menus, una distincion dura (ver CLAUDE.md): el admin de Nexolu opera
// la plataforma completa; un cliente externo ve su negocio. Que item se
// muestra es UX - el recorte real de datos lo hace el backend por scope.
export const platformNavItems: NavItem[] = [
  { label: 'Dashboard', icon: 'pi pi-th-large', routeName: 'dashboard' },
  { label: 'Apps y credenciales', icon: 'pi pi-box', routeName: 'comms-core.apps' },
  { label: 'Webhooks', icon: 'pi pi-arrow-right-arrow-left', routeName: 'webhooks' },
  { label: 'Negocios / Canales', icon: 'pi pi-whatsapp', routeName: 'channels' },
  { label: 'Usuarios', icon: 'pi pi-users', routeName: 'users' },
  // Fases 3 y 4 del plan (nexolu-utils/docs/research/whatsapp-plan-implementacion.md):
  { label: 'Plantillas', icon: 'pi pi-file-check' },
  { label: 'Catálogo', icon: 'pi pi-shopping-bag' },
]

export const clientNavItems: NavItem[] = [
  { label: 'Dashboard', icon: 'pi pi-th-large', routeName: 'dashboard' },
  { label: 'Mi negocio', icon: 'pi pi-box', routeName: 'comms-core.apps' },
  { label: 'Webhooks', icon: 'pi pi-arrow-right-arrow-left', routeName: 'webhooks' },
  { label: 'Canales', icon: 'pi pi-whatsapp', routeName: 'channels' },
  { label: 'Plantillas', icon: 'pi pi-file-check' },
  { label: 'Catálogo', icon: 'pi pi-shopping-bag' },
]
