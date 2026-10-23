<script setup lang="ts">
// All projects, as cards (and the archived ones when asked).
import { computed } from 'vue'
import { Layers, Plus } from 'lucide-vue-next'
import ProjectCard from '@/ui/ProjectCard.vue'
import { remembered } from '@/ui/remember'
import { store } from '@/state'

const showArchived = remembered('projects.archived', false)
const projects = computed(() => store.projects.filter((p) => showArchived.value || !p.archived))
</script>

<template>
  <div class="page">
    <div class="page-title">
      <h1>Projects</h1>
      <span class="spacer" />
      <RouterLink class="button" :to="{ name: 'new-project' }"><Plus :size="16" /> New project</RouterLink>
    </div>
    <label class="check small"><input v-model="showArchived" type="checkbox" /> Show archived projects</label>
    <div v-if="projects.length" class="cards">
      <ProjectCard v-for="p in projects" :key="p.id" :project="p" />
    </div>
    <div v-else class="card empty">
      <Layers :size="38" />
      <p>No projects yet. Make one; projects others share with you show here too.</p>
    </div>
  </div>
</template>

<style scoped>
.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  cursor: pointer;
  color: var(--muted);
}

.check input {
  accent-color: var(--primary);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}

@media (max-width: 760px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .page-title .button {
    padding: 0 10px;
  }
}
</style>
