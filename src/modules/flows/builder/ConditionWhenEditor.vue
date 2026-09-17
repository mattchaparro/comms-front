<script setup lang="ts">
// El editor de UN `when` de condición (tag / not_tag / campo+operador),
// reutilizado por cada caso de la condición multi-rama. v-model clásico:
// cada cambio emite un objeto NUEVO (el `when` canónico tiene exactamente
// una forma valida, así que se reconstruye entero).
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { computed } from 'vue'

import type { ConditionWhen } from '@/types/flows'

const props = defineProps<{ modelValue: ConditionWhen }>()
const emit = defineEmits<{ 'update:modelValue': [ConditionWhen] }>()

const kind = computed({
  get(): 'tag' | 'not_tag' | 'field' {
    if (props.modelValue.not_tag !== undefined) return 'not_tag'
    if (props.modelValue.field !== undefined) return 'field'
    return 'tag'
  },
  set(value: 'tag' | 'not_tag' | 'field') {
    if (value === 'field') emit('update:modelValue', { field: '', equals: '' })
    else if (value === 'tag') emit('update:modelValue', { tag: '' })
    else emit('update:modelValue', { not_tag: '' })
  },
})

const tagValue = computed({
  get: () => props.modelValue.tag ?? props.modelValue.not_tag ?? '',
  set(value: string) {
    emit('update:modelValue', kind.value === 'tag' ? { tag: value } : { not_tag: value })
  },
})

const op = computed({
  get(): 'equals' | 'not_equals' | 'contains' | 'exists' {
    if (props.modelValue.not_equals !== undefined) return 'not_equals'
    if (props.modelValue.contains !== undefined) return 'contains'
    if (props.modelValue.exists !== undefined) return 'exists'
    return 'equals'
  },
  set(value: 'equals' | 'not_equals' | 'contains' | 'exists') {
    const field = props.modelValue.field ?? ''
    emit(
      'update:modelValue',
      value === 'exists' ? { field, exists: true } : { field, [value]: '' },
    )
  },
})

const fieldValue = computed({
  get: () => props.modelValue.field ?? '',
  set(value: string) {
    emit('update:modelValue', { ...props.modelValue, field: value })
  },
})

const opValue = computed({
  get: () =>
    String(props.modelValue.equals ?? props.modelValue.not_equals ?? props.modelValue.contains ?? ''),
  set(value: string) {
    if (op.value === 'exists') return
    emit('update:modelValue', { field: props.modelValue.field ?? '', [op.value]: value })
  },
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <Select
      v-model="kind"
      :options="[
        { label: 'Tiene el tag', value: 'tag' },
        { label: 'NO tiene el tag', value: 'not_tag' },
        { label: 'Un campo / variable', value: 'field' },
      ]"
      option-label="label"
      option-value="value"
      fluid
      class="!text-sm"
    />
    <InputText v-if="kind !== 'field'" v-model="tagValue" placeholder="vip" fluid class="!text-sm" />
    <template v-else>
      <InputText v-model="fieldValue" placeholder="sede (o contact.name)" fluid class="!text-sm" />
      <div class="flex gap-1.5">
        <Select
          v-model="op"
          :options="[
            { label: 'es igual a', value: 'equals' },
            { label: 'es distinto de', value: 'not_equals' },
            { label: 'contiene', value: 'contains' },
            { label: 'tiene valor', value: 'exists' },
          ]"
          option-label="label"
          option-value="value"
          class="w-36 !text-sm"
        />
        <InputText v-if="op !== 'exists'" v-model="opValue" placeholder="valor" fluid class="flex-1 !text-sm" />
      </div>
    </template>
  </div>
</template>
