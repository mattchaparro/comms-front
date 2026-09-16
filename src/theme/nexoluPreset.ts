import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/**
 * Identidad propia de Nexolu Connect (decidida con Alejandro, sesion del
 * 15/09/2026): este panel YA NO comparte el indigo de nexolu-pos-front /
 * nexolu-admin-front. El lenguaje visual es el de las herramientas de
 * automatizacion de conversaciones (el referente es ManyChat, sin copiar
 * su marca): chrome blanco con texto oscuro, un azul electrico como
 * primario, superficies claras y acentos pastel por categoria de nodo en
 * el builder (ver modules/flows/builder/graph.ts).
 */
export const nexoluPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}',
    },
  },
})
