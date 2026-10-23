<script setup lang="ts">
// The menu: the main screens, then favourites, projects (with their sub-projects) and filters.
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Calendar, ChevronRight, Filter, House, Layers, Plus, Star, Tag, Users } from 'lucide-vue-next'
import Logo from './Logo.vue'
import ProjectMenu from './ProjectMenu.vue'
import { allTasks, childProjects, isFavorite, store } from '@/state'
import type { Project } from '@/model'

const route = useRoute()
const open = ref<Record<string, boolean>>({})

const active = computed(() => store.projects.filter((p) => !p.archived))
const favorites = computed(() => active.value.filter((p) => isFavorite(p.id)))
const top = computed(() => childProjects(null).filter((p) => !p.archived))
const kids = (p: Project) => childProjects(p.id).filter((c) => !c.archived)
const favoriteTasks = computed(() => allTasks().some((t) => t.favorite))

function current(id: string): boolean {
  return (route.name === 'project' || route.name === 'project-settings' || route.name === 'project-share') && route.params.id === id
}
</script>

<template>
  <aside class="sidebar" aria-label="Menu">
    <RouterLink :to="{ name: 'home' }" class="brand"><Logo :size="30" /></RouterLink>

    <nav class="main-nav">
      <RouterLink :to="{ name: 'home' }" class="nav" exact-active-class="active"><House :size="18" /> Overview</RouterLink>
      <RouterLink :to="{ name: 'upcoming' }" class="nav" active-class="active"><Calendar :size="18" /> Upcoming</RouterLink>
      <RouterLink :to="{ name: 'projects' }" class="nav" exact-active-class="active"><Layers :size="18" /> Projects</RouterLink>
      <RouterLink :to="{ name: 'labels' }" class="nav" active-class="active"><Tag :size="18" /> Labels</RouterLink>
      <RouterLink :to="{ name: 'teams' }" class="nav" active-class="active"><Users :size="18" /> Teams</RouterLink>
    </nav>

    <div class="projects">
      <RouterLink v-if="favoriteTasks" :to="{ name: 'favorites' }" class="project" active-class="active">
        <span class="bullet"><Star :size="14" fill="currentColor" class="star" /></span>
        <span class="name">Favorite tasks</span>
      </RouterLink>

      <template v-if="favorites.length">
        <div class="heading">Favorites</div>
        <div v-for="p in favorites" :key="`f${p.id}`" class="project" :class="{ active: current(p.id) }">
          <span class="bullet"><span class="dot" :style="{ background: p.color || 'var(--faint)' }" /></span>
          <RouterLink :to="{ name: 'project', params: { id: p.id } }" class="name">{{ p.title }}</RouterLink>
          <ProjectMenu :project="p" small class="menu" />
        </div>
      </template>

      <div class="heading">
        Projects
        <RouterLink :to="{ name: 'new-project' }" class="icon-button small add" aria-label="New project" title="New project"><Plus :size="16" /></RouterLink>
      </div>
      <template v-for="p in top" :key="p.id">
        <div class="project" :class="{ active: current(p.id) }">
          <button v-if="kids(p).length" class="bullet toggle" :aria-label="open[p.id] === false ? 'Show sub-projects' : 'Hide sub-projects'" @click="open[p.id] = open[p.id] === false">
            <ChevronRight :size="15" :class="{ turned: open[p.id] !== false }" />
          </button>
          <span v-else class="bullet"><span class="dot" :style="{ background: p.color || 'var(--faint)' }" /></span>
          <RouterLink :to="{ name: 'project', params: { id: p.id } }" class="name">{{ p.title }}</RouterLink>
          <ProjectMenu :project="p" small class="menu" />
        </div>
        <template v-if="open[p.id] !== false">
          <div v-for="c in kids(p)" :key="c.id" class="project child" :class="{ active: current(c.id) }">
            <span class="bullet"><span class="dot" :style="{ background: c.color || 'var(--faint)' }" /></span>
            <RouterLink :to="{ name: 'project', params: { id: c.id } }" class="name">{{ c.title }}</RouterLink>
            <ProjectMenu :project="c" small class="menu" />
          </div>
        </template>
      </template>
      <p v-if="!top.length" class="none">No projects yet.</p>

      <template v-if="store.filters.length">
        <div class="heading">Saved filters</div>
        <RouterLink v-for="f in store.filters" :key="f.id" :to="{ name: 'filter', params: { id: f.id } }" class="project" active-class="active">
          <span class="bullet"><Filter :size="14" /></span>
          <span class="name">{{ f.title }}</span>
        </RouterLink>
      </template>
    </div>

    <RouterLink :to="{ name: 'new-project' }" class="button secondary new"><Plus :size="16" /> New project</RouterLink>
  </aside>
</template>

<style scoped>
.sidebar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  flex: none;
  width: var(--sidebar);
  height: 100vh;
  padding: calc(14px + env(safe-area-inset-top)) 12px calc(14px + env(safe-area-inset-bottom));
  background: var(--bg);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.brand {
  display: flex;
  padding: 4px 10px 16px;
  text-decoration: none;
}

.nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--text);
  font-weight: 550;
  text-decoration: none;
}

.nav svg {
  color: var(--muted);
}

.nav:hover {
  background: var(--hover);
}

.nav.active {
  background: var(--primary-soft);
  color: var(--primary);
}

.nav.active svg {
  color: var(--primary);
}

.projects {
  flex: 1;
  margin-top: 14px;
}

.heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  margin-top: 10px;
  padding: 0 4px 0 10px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.project {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 2px 0 4px;
  border-radius: var(--radius-sm);
  color: var(--text);
  text-decoration: none;
}

.project:hover {
  background: var(--hover);
}

.project.active {
  background: var(--surface);
  box-shadow: var(--shadow);
}

.project.active .name {
  color: var(--primary);
  font-weight: 600;
}

.project.child {
  padding-left: 24px;
}

.bullet {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  color: var(--muted);
}

.toggle {
  border: 0;
  border-radius: 4px;
  background: transparent;
  padding: 0;
}

.toggle:hover {
  background: var(--surface-3);
}

.toggle svg {
  transition: transform 0.15s;
}

.toggle .turned {
  transform: rotate(90deg);
}

.star {
  color: #e0a21b;
}

.name {
  flex: 1;
  min-width: 0;
  padding: 7px 0;
  color: inherit;
  text-decoration: none !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu {
  opacity: 0;
}

.project:hover .menu,
.project.active .menu,
.menu:focus-within {
  opacity: 1;
}

@media (hover: none) {
  .menu {
    opacity: 1;
  }
}

.none {
  padding: 4px 10px;
  color: var(--muted);
  font-size: 0.9rem;
}

.new {
  margin-top: 16px;
}

@media (max-width: 960px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: min(300px, 86vw);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    transform: translateX(-105%);
    transition: transform 0.2s ease;
  }

  .project.active {
    background: var(--primary-soft);
    box-shadow: none;
  }
}
</style>
