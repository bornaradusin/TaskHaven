<script setup lang="ts">
// A task's done box: round, ticks with a little pop.
defineProps<{ checked: boolean; disabled?: boolean; label?: string }>()
defineEmits<{ change: [checked: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    class="check"
    :class="{ checked }"
    :aria-checked="checked"
    :aria-label="label ?? (checked ? 'Mark as not done' : 'Mark as done')"
    :disabled="disabled"
    @click.stop="$emit('change', !checked)"
  >
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 10.5l3 3 6-7" /></svg>
  </button>
</template>

<style scoped>
.check {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid var(--faint);
  border-radius: 50%;
  background: var(--surface);
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}

.check:hover:not(:disabled) {
  border-color: var(--primary);
}

.check svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--on-primary);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 16;
  stroke-dashoffset: 16;
  transition: stroke-dashoffset 0.2s 0.05s;
}

.check.checked {
  border-color: var(--primary);
  background: var(--primary);
  animation: pop 0.25s;
}

.check.checked svg {
  stroke-dashoffset: 0;
}

.check:disabled {
  cursor: default;
  opacity: 0.6;
}

@keyframes pop {
  50% {
    transform: scale(1.18);
  }
}
</style>
