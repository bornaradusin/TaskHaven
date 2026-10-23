<script setup lang="ts">
// The overview: a greeting, quick add, the projects lately opened and what's to do now.
import { computed } from 'vue'
import { FolderPlus, PartyPopper } from 'lucide-vue-next'
import QuickAdd from '@/ui/QuickAdd.vue'
import TaskRow from '@/ui/TaskRow.vue'
import ProjectCard from '@/ui/ProjectCard.vue'
import { currentTasks } from '@/logic/tasks'
import { allTasks, attempt, project, saveSettings, store } from '@/state'
import { displayName } from '@/model'

const greeting = computed(() => {
  const h = new Date().getHours()
  const name = store.user ? displayName(store.user).split(' ')[0] : ''
  if (h < 5) return `Good night, ${name}!`
  if (h < 12) return `Good morning, ${name}!`
  if (h < 18) return `Good afternoon, ${name}!`
  return `Good evening, ${name}!`
})

const recent = computed(() =>
  store.settings.recentProjects
    .map((id) => project(id))
    .filter((p) => p && !p.archived)
    .slice(0, 6),
)
const tasks = computed(() => currentTasks(allTasks(), store.settings.showUndated))
const loading = computed(() => store.projects.some((p) => !store.loaded[p.id]))
</script>

<template>
  <div class="page">
    <h1 class="greeting">{{ greeting }}</h1>

    <template v-if="!store.projects.length">
      <div class="card empty first">
        <FolderPlus :size="40" />
        <h2>Make your first project</h2>
        <p>A project holds tasks: “Home”, “Groceries”, “Garden”… Only you see your projects, until you share one with someone by their username.</p>
        <div class="row center">
          <RouterLink class="button" :to="{ name: 'new-project' }">New project</RouterLink>
        </div>
      </div>
    </template>

    <template v-else>
      <QuickAdd class="add" :project-id="store.settings.defaultProjectId" />

      <section v-if="recent.length" class="recent">
        <h2>Last viewed</h2>
        <div class="cards">
          <ProjectCard v-for="p in recent" :key="p!.id" :project="p!" />
        </div>
      </section>

      <section>
        <div class="row head">
          <h2>Current tasks</h2>
          <span class="spacer" />
          <label class="toggle small">
            <input type="checkbox" :checked="store.settings.showUndated" @change="attempt(() => saveSettings({ showUndated: ($event.target as HTMLInputElement).checked }))" />
            Show tasks without dates
          </label>
        </div>
        <div class="card list">
          <TaskRow v-for="t in tasks" :key="t.id" :task="t" show-project />
          <div v-if="!tasks.length && !loading" class="empty">
            <PartyPopper :size="36" />
            <p>Nothing to do right now. Enjoy it!</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.greeting {
  margin: 12px 0 22px;
  text-align: center;
  font-size: 2rem;
}

.add {
  margin-bottom: 28px;
}

.recent {
  margin-bottom: 28px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}

.head h2 {
  margin: 0;
}

.head {
  margin-bottom: 10px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  cursor: pointer;
}

.toggle input {
  accent-color: var(--primary);
  width: 16px;
  height: 16px;
}

.list {
  padding: 6px;
}

.first p {
  max-width: 420px;
  margin: 0 auto 18px;
}

.center {
  justify-content: center;
}

@media (max-width: 760px) {
  .greeting {
    font-size: 1.6rem;
    margin-top: 4px;
  }

  .cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
