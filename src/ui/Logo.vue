<script setup lang="ts">
// The Listo mark: a ticked box on the TaskHaven orange.
withDefaults(defineProps<{ size?: number; word?: boolean }>(), { size: 32, word: true })
</script>

<template>
  <span class="logo">
    <svg :width="size" :height="size" viewBox="0 0 220 220" aria-hidden="true">
      <rect width="220" height="220" rx="52" fill="#f2683a" />
      <rect x="52" y="66" width="98" height="98" rx="24" fill="none" stroke="#fff" stroke-width="12" />
      <path d="M77 112 L100 135 L170 58" fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="word" class="word">Task<b>Haven</b></span>
  </span>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}

.word {
  font-size: 1.2rem;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.word b {
  font-weight: 750;
}
</style>
