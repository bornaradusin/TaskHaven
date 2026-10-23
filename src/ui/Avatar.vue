<script setup lang="ts">
import { computed } from 'vue'
import { initials, textOn } from './color'
import { personName } from '@/state'
import { colorFor } from '@/model'

const props = withDefaults(defineProps<{ id: string; size?: number; title?: boolean }>(), { size: 28, title: true })
const name = computed(() => personName(props.id))
const color = computed(() => colorFor(props.id))
</script>

<template>
  <span
    class="avatar"
    :style="{ width: `${size}px`, height: `${size}px`, background: color, color: textOn(color), fontSize: `${Math.round(size * 0.4)}px` }"
    :title="title ? name : undefined"
  >{{ initials(name) }}</span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  font-weight: 700;
  letter-spacing: 0.02em;
  user-select: none;
}
</style>
