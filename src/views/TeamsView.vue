<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Plus, Users } from 'lucide-vue-next'
import Avatars from '@/ui/Avatars.vue'
import { attempt, createTeam, store } from '@/state'

const router = useRouter()
const name = ref('')

async function create() {
  if (!name.value.trim()) return
  const id = await attempt(() => createTeam(name.value))
  name.value = ''
  if (id) void router.push({ name: 'team', params: { id } })
}
</script>

<template>
  <div class="page narrow">
    <div class="page-title">
      <h1>Teams</h1>
    </div>
    <p class="muted">A team is a group of people, like your family. Share a project with a team, and everyone in it (now or later) sees it. Add people to a team by their username on the server.</p>
    <form class="card card-body add" @submit.prevent="create">
      <input v-model="name" class="input" placeholder="New team (e.g. Family)" aria-label="Team name" />
      <button class="button" :disabled="!name.trim()"><Plus :size="16" /> Create</button>
    </form>
    <div class="card">
      <RouterLink v-for="t in store.teams" :key="t.id" :to="{ name: 'team', params: { id: t.id } }" class="team-row">
        <span class="icon"><Users :size="18" /></span>
        <span class="who">
          <b>{{ t.name }}</b>
          <span class="muted small">{{ t.memberIds.length }} {{ t.memberIds.length === 1 ? 'person' : 'people' }}{{ t.members[store.user?.id ?? ''] === 'admin' ? ' · you’re an admin' : '' }}</span>
        </span>
        <Avatars :ids="t.memberIds" :size="26" :max="4" />
        <ChevronRight :size="18" class="muted" />
      </RouterLink>
      <div v-if="!store.teams.length" class="empty"><Users :size="36" /><p>You’re not in a team yet.</p></div>
    </div>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
}

.add {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.team-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  text-decoration: none !important;
}

.team-row:last-child {
  border-bottom: 0;
}

.team-row:hover {
  background: var(--hover);
}

.icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
}

.who {
  flex: 1;
  display: grid;
}
</style>
