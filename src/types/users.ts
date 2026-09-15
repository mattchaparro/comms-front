// Refleja PanelUserAdminOut / PanelUserIn / PanelUserPatch
// (api/v1/admin_users.py en nexolu-comms-api) - mantener sincronizado.

export const PANEL_ROLES = ['platform', 'client'] as const
export type PanelRole = (typeof PANEL_ROLES)[number]

export interface PanelUser {
  id: string
  email: string
  full_name: string
  role: PanelRole
  is_active: boolean
  has_password: boolean // false = solo puede entrar por SSO
  app_ids: string[]
  last_login_at: string | null
  created_at: string
}

export interface PanelUserList {
  items: PanelUser[]
}

export interface PanelUserCreatePayload {
  email: string
  full_name?: string
  role: PanelRole
  password?: string
  app_ids?: string[]
}

export interface PanelUserPatchPayload {
  full_name?: string
  role?: PanelRole
  is_active?: boolean
  password?: string
  app_ids?: string[]
}
