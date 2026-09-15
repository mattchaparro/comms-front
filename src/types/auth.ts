// Refleja PanelUserOut (api/panel.py) en nexolu-comms-api - mantener
// sincronizado.
export interface User {
  email: string
  full_name: string
  roles: string[] // ['platform'] (admin de Nexolu) | ['client'] (negocio externo)
  app_ids: string[] // solo para client: sus apps; vacia para platform
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}
