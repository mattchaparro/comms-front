export interface NavItem {
  label: string
  icon: string
  routeName?: string
  /** true = todavia no existe el modulo/pantalla. */
  disabled?: boolean
}
