<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { dismiss, store } from '@/state'
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="t in store.toasts" :key="t.id" class="toast" :class="{ error: t.error }">
      <span class="text">{{ t.text }}</span>
      <button v-if="t.undo" class="undo" @click="t.undo?.(); dismiss(t.id)">Undo</button>
      <button class="icon-button small" aria-label="Dismiss" @click="dismiss(t.id)"><X :size="16" /></button>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 80;
  display: grid;
  gap: 8px;
  width: min(460px, calc(100% - 24px));
  transform: translateX(-50%);
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px 8px 16px;
  border-radius: var(--radius);
  background: #24262a;
  color: #f2f2f2;
  box-shadow: var(--shadow-lg);
  animation: up 0.18s;
}

.toast.error {
  background: #7f1d1d;
}

.text {
  flex: 1;
}

.undo {
  border: 0;
  background: transparent;
  color: #ffb08f;
  font-weight: 700;
  padding: 6px 8px;
}

.toast .icon-button {
  color: #c9c9c9;
}

.toast .icon-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

@keyframes up {
  from {
    transform: translateY(12px);
    opacity: 0;
  }
}
</style>
