<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { chipStyle } from './color'
import type { LabelRef } from '@/model'

defineProps<{ label: LabelRef; removable?: boolean }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <span class="chip label" :style="chipStyle(label.color)">
    {{ label.title }}
    <button v-if="removable" type="button" class="x" :aria-label="`Take off ${label.title}`" @click.stop="$emit('remove')"><X :size="12" /></button>
  </span>
</template>

<style scoped>
.x {
  display: inline-grid;
  place-items: center;
  margin-right: -4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.8;
}
</style>
