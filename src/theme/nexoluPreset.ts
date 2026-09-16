import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/**
 * Identidad propia de Nexolu Connect (decidida con Alejandro, sesion del
 * 15/09/2026, afinada el mismo dia: "no quiero mas apps con color azul").
 * Este panel no comparte el indigo del POS/admin ni usa azul: el lenguaje
 * es el de las herramientas de automatizacion de conversaciones (el
 * referente es ManyChat, sin copiar su marca) - chrome blanco/negro
 * neutro, TEAL como primario, y acentos pastel por categoria de nodo en
 * el builder (ver modules/flows/builder/graph.ts).
 */
export const nexoluPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{teal.50}',
      100: '{teal.100}',
      200: '{teal.200}',
      300: '{teal.300}',
      400: '{teal.400}',
      500: '{teal.500}',
      600: '{teal.600}',
      700: '{teal.700}',
      800: '{teal.800}',
      900: '{teal.900}',
      950: '{teal.950}',
    },
  },
})
