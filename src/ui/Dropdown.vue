<script setup lang="ts">
// A menu that opens from a button; closes on a click outside or Escape.
import { nextTick, onUnmounted, ref } from 'vue'

const props = withDefaults(defineProps<{ align?: 'left' | 'right'; label?: string }>(), { align: 'right', label: 'More' })
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const up = ref(false)

function outside(e: Event) {
  if (root.value && !root.value.contains(e.target as Node)) close()
}

function key(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', key)
    await nextTick()
    // open upwards when there's no room below
    const r = root.value?.getBoundingClientRect()
    up.value = !!r && r.bottom + 300 > window.innerHeight && r.top > 300
  } else close()
}

function close() {
  open.value = false
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('keydown', key)
}

onUnmounted(close)
defineExpose({ close })
void props
</script>

<template>
  <div ref="root" class="dropdown">
    <slot name="trigger" :toggle="toggle" :open="open">
      <button class="icon-button" :aria-label="label" :aria-expanded="open" @click.stop="toggle"><slot name="icon" /></button>
    </slot>
    <div v-if="open" class="menu card" :class="[align, { up }]" role="menu" @click="close">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
  display: inline-flex;
}

.menu {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 40;
  min-width: 210px;
  padding: 6px;
  box-shadow: var(--shadow-lg);
  animation: show 0.1s;
}

.menu.up {
  top: auto;
  bottom: calc(100% + 4px);
}

.menu.right {
  right: 0;
}

.menu.left {
  left: 0;
}

.menu :deep(.item) {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
}

.menu :deep(.item:hover) {
  background: var(--hover);
}

.menu :deep(.item svg) {
  color: var(--muted);
  flex: none;
}

.menu :deep(.item.danger),
.menu :deep(.item.danger svg) {
  color: var(--danger);
}

.menu :deep(hr) {
  margin: 4px 2px;
  border: 0;
  border-top: 1px solid var(--border);
}

@keyframes show {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
