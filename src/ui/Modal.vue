<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

withDefaults(defineProps<{ title?: string; wide?: boolean }>(), { title: '' })
const emit = defineEmits<{ close: [] }>()

function key(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', key))
onUnmounted(() => document.removeEventListener('keydown', key))
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @mousedown.self="emit('close')">
      <div class="modal card" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
        <header v-if="title" class="head">
          <h2>{{ title }}</h2>
          <button class="icon-button small" aria-label="Close" @click="emit('close')"><X :size="18" /></button>
        </header>
        <div class="body"><slot /></div>
        <footer v-if="$slots.footer" class="foot"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(10, 10, 10, 0.45);
  animation: fade 0.12s;
}

.modal {
  width: min(480px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  animation: rise 0.16s;
}

.modal.wide {
  width: min(720px, 100%);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px 0 18px;
}

.head h2 {
  flex: 1;
  margin: 0;
  font-size: 1.15rem;
}

.body {
  padding: 16px 18px;
  overflow-y: auto;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px 16px;
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes rise {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
}
</style>
