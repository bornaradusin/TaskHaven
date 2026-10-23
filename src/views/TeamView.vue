<script setup lang="ts">
// A team: its name, its people (added by their username) and their roles.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, AtSign, LogOut, Trash2, UserPlus } from 'lucide-vue-next'
import Avatar from '@/ui/Avatar.vue'
import Modal from '@/ui/Modal.vue'
import { addTeamMember, attempt, succeeded, deleteTeam, leaveTeam, person, personName, removeTeamMember, setTeamRole, store, updateTeam } from '@/state'
import type { TeamRole } from '@/model'

const route = useRoute()
const router = useRouter()
const team = computed(() => store.teams.find((t) => t.id === route.params.id))
const admin = computed(() => !!team.value && team.value.members[store.user?.id ?? ''] === 'admin')
const name = ref('')
const description = ref('')
const confirmDelete = ref(false)

watch(
  team,
  (t) => {
    if (t) {
      name.value = t.name
      description.value = t.description
    }
  },
  { immediate: true },
)

const username = ref('')

async function add() {
  const who = username.value.trim().replace(/^@/, '')
  if (!team.value || !who) return
  if (await succeeded(() => addTeamMember(team.value!, who), `${who} is in the team.`)) username.value = ''
}

async function saveName() {
  if (!team.value || !name.value.trim()) return
  if (name.value.trim() === team.value.name && description.value === team.value.description) return
  await attempt(() => updateTeam(team.value!, { name: name.value.trim(), description: description.value }), 'Saved.')
}

async function leave() {
  const done = await succeeded(() => leaveTeam(team.value!), 'You left the team.')
  if (done) void router.push({ name: 'teams' })
}

async function remove() {
  confirmDelete.value = false
  const done = await succeeded(() => deleteTeam(team.value!), 'Team deleted.')
  if (done) void router.push({ name: 'teams' })
}
</script>

<template>
  <div v-if="team" class="page narrow">
    <div class="page-title">
      <RouterLink :to="{ name: 'teams' }" class="icon-button" aria-label="Back"><ArrowLeft :size="20" /></RouterLink>
      <h1>{{ team.name }}</h1>
    </div>

    <section v-if="admin" class="card card-body">
      <label class="field"><span>Name</span><input v-model="name" class="input" @blur="saveName" @keydown.enter="saveName" /></label>
      <label class="field"><span>Description</span><input v-model="description" class="input" placeholder="Optional" @blur="saveName" /></label>
    </section>
    <p v-else-if="team.description" class="muted">{{ team.description }}</p>

    <section class="card">
      <div class="card-header">People</div>
      <div class="card-body">
        <div v-for="m in team.memberIds" :key="m" class="member">
          <Avatar :id="m" :size="34" />
          <div class="who">
            <b>{{ personName(m) }}{{ m === store.user?.id ? ' (you)' : '' }}</b>
            <span class="muted small">@{{ person(m).username }}</span>
          </div>
          <span v-if="m === team.ownerId" class="chip owner">Owner</span>
          <template v-else-if="admin">
            <select class="select slim" :value="team.members[m]" aria-label="Role" @change="attempt(() => setTeamRole(team!, m, ($event.target as HTMLSelectElement).value as TeamRole))">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button class="icon-button small" :aria-label="`Take ${personName(m)} out`" @click="attempt(() => removeTeamMember(team!, m))"><Trash2 :size="16" /></button>
          </template>
          <span v-else class="muted small">{{ team.members[m] === 'admin' ? 'Admin' : 'Member' }}</span>
        </div>
      </div>
    </section>

    <section v-if="admin" class="card">
      <div class="card-header">Add someone</div>
      <div class="card-body">
        <form class="add" @submit.prevent="add">
          <label class="with-icon">
            <AtSign :size="16" />
            <input v-model="username" class="input" placeholder="Their username" autocapitalize="off" spellcheck="false" aria-label="Username" />
          </label>
          <button class="button" :disabled="!username.trim()"><UserPlus :size="16" /> Add</button>
        </form>
        <p class="muted small">They need an account on this server. Everyone in the team sees the projects shared with it: share one from its Share page (Teams).</p>
      </div>
    </section>

    <div class="row">
      <button v-if="team.memberIds.length > 1" class="button secondary" @click="leave"><LogOut :size="16" /> Leave the team</button>
      <button v-if="admin" class="button danger" @click="confirmDelete = true"><Trash2 :size="16" /> Delete the team</button>
    </div>

    <Modal v-if="confirmDelete" title="Delete this team?" @close="confirmDelete = false">
      <p>Projects shared with it stop being shared with its people (unless they’re shared with them some other way). The projects aren’t deleted.</p>
      <template #footer>
        <button class="button ghost" @click="confirmDelete = false">Cancel</button>
        <button class="button danger" @click="remove">Delete</button>
      </template>
    </Modal>
  </div>
  <div v-else class="page"><div class="card empty">You’re not in this team.</div></div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
}

.card {
  margin-bottom: 16px;
}

.member {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  border-bottom: 1px solid var(--border);
}

.member:last-of-type {
  border-bottom: 0;
}

.who {
  flex: 1;
  display: grid;
  min-width: 0;
  color: var(--text);
}

.owner {
  background: var(--primary-soft);
  color: var(--primary);
}

.slim {
  width: auto;
  min-height: 34px;
  padding: 4px 8px;
}

.add {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.with-icon {
  position: relative;
  flex: 1;
}

.with-icon svg {
  position: absolute;
  left: 11px;
  top: 12px;
  color: var(--faint);
}

.with-icon .input {
  padding-left: 34px;
}
</style>
