import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/**
 * Mismo preset que nexolu-pos-front (src/theme/nexoluPreset.ts) - Aura con
 * el color "primary" (foco, boton primario, checked states, highlight de
 * listas) puesto en el indigo de marca en vez del emerald por defecto de
 * Aura. Este repo no tiene capa Nexolu UI (NxButton, etc. - ver CLAUDE.md
 * "Sin Nexolu UI por ahora"): las pantallas importan PrimeVue directo, asi
 * que este tema es la unica fuente de identidad visual compartida con
 * nexolu-pos-front mientras esa decision no se revierta.
 */
export const nexoluPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{indigo.50}',
      100: '{indigo.100}',
      200: '{indigo.200}',
      300: '{indigo.300}',
      400: '{indigo.400}',
      500: '{indigo.500}',
      600: '{indigo.600}',
      700: '{indigo.700}',
      800: '{indigo.800}',
      900: '{indigo.900}',
      950: '{indigo.950}',
    },
  },
})
