<script setup lang="ts">
import { computed } from 'vue'
import { Star, Users } from 'lucide-vue-next'
import { textOn } from './color'
import { attempt, canEdit, isFavorite, personName, store, toggleFavorite } from '@/state'
import type { Project } from '@/model'

const props = defineProps<{ project: Project }>()
const color = computed(() => props.project.color || '#9aa0a6')
const open = computed(() => (store.tasks[props.project.id] ?? []).filter((t) => !t.done).length)
</script>

<template>
  <RouterLink :to="{ name: 'project', params: { id: project.id } }" class="project-card" :style="{ background: color, color: textOn(color) }">
    <div class="top">
      <span v-if="project.archived" class="badge">Archived</span>
      <span v-if="project.ownerId !== store.user?.id" class="badge" :title="`Shared by ${personName(project.ownerId)}`"><Users :size="12" /> Shared</span>
      <span class="spacer" />
      <button v-if="canEdit(project) || isFavorite(project.id)" class="fav" :class="{ on: isFavorite(project.id) }" :aria-label="isFavorite(project.id) ? 'Remove from favorites' : 'Add to favorites'" @click.prevent="attempt(() => toggleFavorite(project.id))">
        <Star :size="18" :fill="isFavorite(project.id) ? 'currentColor' : 'none'" />
      </button>
    </div>
    <div class="title">{{ project.title }}</div>
    <div class="count">{{ open }} to do</div>
  </RouterLink>
</template>

<style scoped>
.project-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 118px;
  padding: 12px 14px;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  text-decoration: none !important;
  overflow: hidden;
  transition: transform 0.12s, box-shadow 0.12s;
}

.project-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.12));
  pointer-events: none;
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.top {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
  z-index: 1;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
  font-size: 0.72rem;
  font-weight: 700;
}

.fav {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin: -6px -8px 0 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  opacity: 0.65;
}

.fav:hover,
.fav.on {
  opacity: 1;
}

.title {
  position: relative;
  z-index: 1;
  margin-top: auto;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.count {
  position: relative;
  z-index: 1;
  font-size: 0.82rem;
  opacity: 0.85;
}
</style>
