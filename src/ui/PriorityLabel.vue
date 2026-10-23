<script setup lang="ts">
// "High", "Urgent", "DO NOW": shown for the important ones (all of them when asked).
import { computed } from 'vue'
import { PRIORITIES, type Priority } from '@/model'

const props = withDefaults(defineProps<{ priority: Priority; done?: boolean; always?: boolean }>(), { done: false, always: false })
const shown = computed(() => !props.done && (props.always ? props.priority > 0 : props.priority >= 3))
</script>

<template>
  <span v-if="shown" class="priority" :class="`p${priority}`">
    <template v-if="priority >= 4">!</template>{{ PRIORITIES[priority] }}
  </span>
</template>

<style scoped>
.priority {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: none;
}

.p3 {
  color: var(--warning);
}

.p4,
.p5 {
  color: var(--danger);
}

.p5 {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
}
</style>
