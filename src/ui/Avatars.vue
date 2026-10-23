<script setup lang="ts">
import Avatar from './Avatar.vue'

withDefaults(defineProps<{ ids: string[]; size?: number; max?: number }>(), { size: 24, max: 3 })
</script>

<template>
  <span class="avatars">
    <Avatar v-for="id in ids.slice(0, max)" :key="id" :id="id" :size="size" class="one" />
    <span v-if="ids.length > max" class="more" :style="{ height: `${size}px`, minWidth: `${size}px` }">+{{ ids.length - max }}</span>
  </span>
</template>

<style scoped>
.avatars {
  display: inline-flex;
  align-items: center;
}

.one,
.more {
  box-shadow: 0 0 0 2px var(--surface);
}

.one + .one,
.one + .more {
  margin-left: -6px;
}

.more {
  display: inline-grid;
  place-items: center;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
}
</style>
