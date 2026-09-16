<script setup lang="ts">
// La vista previa del flujo: un chat estilo WhatsApp que camina la
// definición ACTUAL del canvas (simulator.ts) sin enviar nada. Botones y
// listas se tocan, capture se escribe, la condición/dado/espera se
// muestran como chips, y el contacto simulado (tags/campos) se ve abajo.
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { computed, nextTick, ref, watch } from 'vue'

import TemplatePreview from '@/modules/templates/components/TemplatePreview.vue'
import type { FlowDefinition } from '@/types/flows'
import type { WhatsAppTemplate } from '@/types/templates'

import { FlowSimulator, interpolate, type SimContact } from './simulator'

const props = defineProps<{
  definition: FlowDefinition
  templates: WhatsAppTemplate[]
  variablesHint: string[]
}>()

const emit = defineEmits<{ close: [] }>()

const contactName = ref('Valentina')
const variablesText = ref('')
const sim = ref<FlowSimulator | null>(null)
const reply = ref('')
const transcript = ref<HTMLElement | null>(null)

function parseVariables(): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const line of variablesText.value.split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0) variables[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return variables
}

function restart(): void {
  const contact: SimContact = {
    name: contactName.value || 'Valentina',
    phone: '573000000000',
    tags: [],
    fields: {},
  }
  const simulator = new FlowSimulator(props.definition, contact, parseVariables())
  simulator.start()
  sim.value = simulator
  reply.value = ''
}

watch(
  () => props.definition,
  () => restart(),
  { immediate: true },
)

watch(
  () => sim.value?.events.length,
  () => void nextTick(() => transcript.value?.scrollTo({ top: 99999, behavior: 'smooth' })),
)

function send(): void {
  if (!sim.value || sim.value.waiting !== 'text') return
  sim.value.input(reply.value)
  reply.value = ''
}

function templateFor(name: string, language: string): WhatsAppTemplate | null {
  return props.templates.find((t) => t.name === name && t.language === language) ?? null
}

function templateFallback(name: string, params: string[]): string {
  return `Plantilla «${name}»${params.length ? ` (${params.join(', ')})` : ''}`
}

const lastChoicesIndex = computed(() => {
  const events = sim.value?.events ?? []
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === 'choices') return i
  }
  return -1
})

defineExpose({ interpolate }) // evita el aviso de import sin uso; util en tests
</script>

<template>
  <aside
    class="absolute bottom-0 right-0 top-0 z-20 flex w-[340px] flex-col border-l border-slate-200 bg-white shadow-xl"
  >
    <div class="flex items-center gap-2 bg-slate-900 px-4 py-3">
      <i class="pi pi-play-circle text-sm text-teal-400" />
      <span class="text-sm font-bold text-white">Vista previa</span>
      <button
        type="button"
        class="ml-auto rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        title="Reiniciar"
        @click="restart"
      >
        <i class="pi pi-refresh text-xs" />
      </button>
      <button
        type="button"
        class="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        title="Cerrar"
        @click="emit('close')"
      >
        <i class="pi pi-times text-xs" />
      </button>
    </div>

    <!-- config del ensayo -->
    <div class="flex flex-col gap-2 border-b border-slate-100 p-3">
      <div class="flex items-center gap-2">
        <label class="w-16 text-[11px] font-medium text-slate-500">Clienta</label>
        <InputText v-model="contactName" class="!h-7 flex-1 !text-xs" @change="restart" />
      </div>
      <div v-if="variablesHint.length || variablesText" class="flex items-start gap-2">
        <label class="w-16 pt-1 text-[11px] font-medium text-slate-500">Variables</label>
        <textarea
          v-model="variablesText"
          rows="2"
          class="flex-1 rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-700 focus:outline-teal-500"
          :placeholder="variablesHint.map((v) => `${v}=…`).join('\n') || 'fecha=mañana 3pm'"
          @change="restart"
        />
      </div>
    </div>

    <!-- chat -->
    <div ref="transcript" class="flex-1 overflow-y-auto bg-[#e5ddd5] p-3">
      <div class="flex flex-col gap-2">
        <template v-for="(event, index) in sim?.events ?? []" :key="index">
          <!-- burbuja del bot -->
          <div
            v-if="event.kind === 'bubble'"
            class="max-w-[85%] self-start whitespace-pre-wrap rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-800 shadow-sm"
          >
            {{ event.text }}
          </div>

          <!-- multimedia -->
          <div
            v-else-if="event.kind === 'media'"
            class="max-w-[85%] self-start overflow-hidden rounded-xl rounded-tl-sm bg-white shadow-sm"
          >
            <img
              v-if="event.mediaKind === 'image' && event.url.startsWith('http')"
              :src="event.url"
              class="max-h-40 w-full object-cover"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
            <div v-else class="flex h-20 w-56 items-center justify-center bg-slate-100 text-slate-400">
              <i
                :class="{ image: 'pi pi-image', video: 'pi pi-video', audio: 'pi pi-volume-up', document: 'pi pi-paperclip' }[event.mediaKind] ?? 'pi pi-file'"
                class="text-2xl"
              />
            </div>
            <p v-if="event.caption" class="px-3 py-1.5 text-[13px] text-slate-800">{{ event.caption }}</p>
          </div>

          <!-- plantilla -->
          <div v-else-if="event.kind === 'template'" class="max-w-[90%] self-start">
            <TemplatePreview
              v-if="templateFor(event.name, event.language)"
              :components="templateFor(event.name, event.language)!.components"
              :params="event.params"
            />
            <div
              v-else
              class="rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[13px] italic text-slate-500 shadow-sm"
            >
              {{ templateFallback(event.name, event.params) }}
            </div>
          </div>

          <!-- cta url -->
          <div v-else-if="event.kind === 'cta'" class="max-w-[85%] self-start">
            <div class="rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[13px] text-slate-800 shadow-sm">
              {{ event.text }}
            </div>
            <a
              :href="event.url"
              target="_blank"
              class="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-[13px] font-medium text-teal-700 shadow-sm"
            >
              <i class="pi pi-external-link text-xs" />{{ event.button }}
            </a>
          </div>

          <!-- opciones (botones o lista) -->
          <div v-else-if="event.kind === 'choices'" class="flex max-w-[85%] flex-col gap-1 self-start">
            <p v-if="event.listButton" class="text-center text-[11px] text-slate-500">
              <i class="pi pi-bars mr-1" />{{ event.listButton }}
            </p>
            <button
              v-for="option in event.options"
              :key="option.id"
              type="button"
              class="rounded-lg bg-white px-3 py-1.5 text-left shadow-sm transition-colors"
              :class="
                index === lastChoicesIndex && sim?.waiting === 'choice'
                  ? 'text-teal-700 hover:bg-teal-50'
                  : 'pointer-events-none text-slate-300'
              "
              @click="sim?.choose(option.id)"
            >
              <span class="block text-[13px] font-medium">{{ option.title }}</span>
              <span v-if="option.description" class="block text-[11px] text-slate-400">
                {{ option.description }}
              </span>
            </button>
          </div>

          <!-- respuesta de la clienta -->
          <div
            v-else-if="event.kind === 'user'"
            class="max-w-[85%] self-end rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13px] text-slate-800 shadow-sm"
          >
            {{ event.text }}
          </div>

          <!-- chip informativo -->
          <div v-else class="self-center rounded-full bg-black/10 px-3 py-0.5 text-[11px] text-slate-600">
            <i :class="event.icon" class="mr-1 text-[10px]" />{{ event.text }}
          </div>
        </template>
      </div>
    </div>

    <!-- entrada de texto (capture) -->
    <div class="flex items-center gap-2 border-t border-slate-100 p-2">
      <InputText
        v-model="reply"
        :disabled="sim?.waiting !== 'text'"
        :placeholder="sim?.waiting === 'text' ? 'Escribe la respuesta…' : 'El flujo no espera texto'"
        class="!h-8 flex-1 !text-xs"
        @keyup.enter="send"
      />
      <Button icon="pi pi-send" size="small" :disabled="sim?.waiting !== 'text'" @click="send" />
    </div>

    <!-- contacto simulado -->
    <div class="border-t border-slate-100 px-3 py-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contacto simulado</p>
      <div class="mt-1 flex flex-wrap gap-1">
        <span
          v-for="tag in sim?.contact.tags ?? []"
          :key="tag"
          class="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700"
        >
          {{ tag }}
        </span>
        <span
          v-for="(value, key) in sim?.contact.fields ?? {}"
          :key="key"
          class="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
        >
          {{ key }}={{ value }}
        </span>
        <span
          v-if="!(sim?.contact.tags.length || Object.keys(sim?.contact.fields ?? {}).length)"
          class="text-[10px] italic text-slate-300"
        >
          Sin tags ni campos todavía
        </span>
      </div>
    </div>
  </aside>
</template>
