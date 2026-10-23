<script setup lang="ts">
// Who a project is shared with, and what each may do: people on the server (by their username),
// teams, and links. Nobody else on the server sees it.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, AtSign, Copy, Link2, LogOut, Trash2, UserPlus, Users } from 'lucide-vue-next'
import Avatar from '@/ui/Avatar.vue'
import { canManage, RIGHT_NAMES } from '@/logic/sharing'
import { REPORT_URL } from '@/links'
import {
  attempt,
  createLinkShare,
  deleteLinkShare,
  getShares,
  leaveProject,
  linkShareUrl,
  person,
  personName,
  project,
  setTeamRight,
  setUserRight,
  shareWithTeam,
  shareWithUser,
  store,
  succeeded,
  toast,
  unshareTeam,
  unshareUser,
} from '@/state'
import type { Right, Shares } from '@/model'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const p = computed(() => project(id.value))
const admin = computed(() => canManage(p.value))
const shares = ref<Shares | null>(null)
const failed = ref('')
const username = ref('')
const userRight = ref<Right>('write')
const teamId = ref('')
const teamRight = ref<Right>('write')
const linkName = ref('')
const linkRight = ref<Right>('read')
const linkPassword = ref('')
const linksOn = computed(() => store.server?.linkSharing !== false)

async function load() {
  if (!p.value) return
  try {
    shares.value = await getShares(p.value)
    failed.value = ''
  } catch (e) {
    failed.value = (e as Error).message
  }
}
onMounted(load)

/** Does a change, then shows who it's shared with as it is now. */
async function change(work: () => Promise<unknown>, done?: string): Promise<boolean> {
  const ok = await succeeded(work, done)
  await load()
  return ok
}

const people = computed(() => [...(shares.value?.users ?? [])].sort((a, b) => personName(a.userId).localeCompare(personName(b.userId))))
const sharedTeams = computed(() => (shares.value?.teams ?? []).map((t) => ({ ...t, team: store.teams.find((x) => x.id === t.teamId) })))
const freeTeams = computed(() => store.teams.filter((t) => !shares.value?.teams.some((x) => x.teamId === t.id)))
const mineDirectly = computed(() => shares.value?.users.some((u) => u.userId === store.user?.id) ?? false)

async function addPerson() {
  if (!p.value) return
  const name = username.value.trim().replace(/^@/, '')
  if (await change(() => shareWithUser(p.value!, name, userRight.value), `Shared with ${name}.`)) username.value = ''
}

async function addTeam() {
  const team = store.teams.find((t) => t.id === teamId.value)
  if (!p.value || !team) return
  if (await change(() => shareWithTeam(p.value!, team.id, teamRight.value), `Shared with ${team.name}.`)) teamId.value = ''
}

async function addLink() {
  if (!p.value) return
  const link = await attempt(() => createLinkShare(p.value!, linkRight.value, linkName.value, linkPassword.value))
  if (!link) return
  linkName.value = ''
  linkPassword.value = ''
  await load()
  await copy(linkShareUrl(link))
}

async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast('Link copied.')
  } catch {
    toast(url)
  }
}

async function leave() {
  if (!store.user) return
  const done = await succeeded(() => leaveProject(id.value), 'You left the project.')
  if (done) void router.push({ name: 'home' })
}
</script>

<template>
  <div v-if="p" class="page narrow">
    <div class="page-title">
      <RouterLink :to="{ name: 'project', params: { id } }" class="icon-button" aria-label="Back"><ArrowLeft :size="20" /></RouterLink>
      <h1>Share “{{ p.title }}”</h1>
    </div>

    <p v-if="failed" class="error-text">{{ failed }}</p>

    <section class="card">
      <div class="card-header"><Users :size="17" /> People</div>
      <div class="card-body">
        <form v-if="admin" class="add" @submit.prevent="addPerson">
          <label class="with-icon">
            <AtSign :size="16" />
            <input v-model="username" class="input" placeholder="Their username" autocapitalize="off" spellcheck="false" aria-label="Username" />
          </label>
          <select v-model="userRight" class="select slim" aria-label="What they may do">
            <option v-for="(name, r) in RIGHT_NAMES" :key="r" :value="r">{{ name }}</option>
          </select>
          <button class="button" :disabled="!username.trim()"><UserPlus :size="16" /> Share</button>
        </form>
        <p v-if="admin" class="muted small">They need an account on this server. Type their username exactly (they see it in TaskHaven’s settings).</p>

        <div class="member">
          <Avatar :id="p.ownerId" :size="34" />
          <div class="who">
            <b>{{ personName(p.ownerId) }}{{ p.ownerId === store.user?.id ? ' (you)' : '' }}</b>
            <span class="muted small">@{{ person(p.ownerId).username }}</span>
          </div>
          <span class="chip owner">Owner</span>
        </div>
        <div v-for="u in people" :key="u.userId" class="member">
          <Avatar :id="u.userId" :size="34" />
          <div class="who">
            <b>{{ personName(u.userId) }}{{ u.userId === store.user?.id ? ' (you)' : '' }}</b>
            <span class="muted small">@{{ person(u.userId).username }}</span>
          </div>
          <template v-if="admin">
            <select class="select slim" :value="u.right" :aria-label="`What ${personName(u.userId)} may do`" @change="change(() => setUserRight(p!, u.userId, ($event.target as HTMLSelectElement).value as Right))">
              <option v-for="(name, r) in RIGHT_NAMES" :key="r" :value="r">{{ name }}</option>
            </select>
            <button class="icon-button small" :aria-label="`Stop sharing with ${personName(u.userId)}`" @click="change(() => unshareUser(p!, u.userId))"><Trash2 :size="16" /></button>
          </template>
          <span v-else class="muted small">{{ RIGHT_NAMES[u.right] }}</span>
        </div>
        <p v-if="shares && !people.length && !sharedTeams.length" class="muted small">Nobody else sees this project yet.</p>

        <p class="help">
          Only these people (and the teams below) see this project. <b>Can see</b>: sees the tasks. <b>Can edit</b>: adds, changes and ticks off tasks.
          <b>Admin</b>: also changes the project and who it’s shared with.
        </p>
        <p class="help">Someone here being abusive? An admin can stop sharing with them. <a :href="REPORT_URL" target="_blank" rel="noopener">Report them</a>.</p>
      </div>
    </section>

    <section v-if="admin || sharedTeams.length" class="card">
      <div class="card-header">Teams</div>
      <div class="card-body">
        <div v-for="t in sharedTeams" :key="t.teamId" class="member">
          <span class="team-icon"><Users :size="18" /></span>
          <div class="who">
            <b>{{ t.team?.name ?? t.name }}</b>
            <span class="muted small">{{ t.team ? `${t.team.memberIds.length} people` : '' }}</span>
          </div>
          <template v-if="admin">
            <select class="select slim" :value="t.right" aria-label="What the team may do" @change="change(() => setTeamRight(p!, t.teamId, ($event.target as HTMLSelectElement).value as Right))">
              <option v-for="(name, r) in RIGHT_NAMES" :key="r" :value="r">{{ name }}</option>
            </select>
            <button class="icon-button small" aria-label="Stop sharing with the team" @click="change(() => unshareTeam(p!, t.teamId))"><Trash2 :size="16" /></button>
          </template>
          <span v-else class="muted small">{{ RIGHT_NAMES[t.right] }}</span>
        </div>
        <form v-if="admin && freeTeams.length" class="add" @submit.prevent="addTeam">
          <select v-model="teamId" class="select" aria-label="Team">
            <option value="" disabled>Choose a team…</option>
            <option v-for="t in freeTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <select v-model="teamRight" class="select slim" aria-label="What the team may do">
            <option v-for="(name, r) in RIGHT_NAMES" :key="r" :value="r">{{ name }}</option>
          </select>
          <button class="button" :disabled="!teamId">Share</button>
        </form>
        <p v-else-if="admin && !sharedTeams.length" class="muted small">
          A team is a group of people (your family, say) to share projects with all at once. <RouterLink :to="{ name: 'teams' }">Make one</RouterLink>.
        </p>
        <p v-if="sharedTeams.length" class="help">Whoever joins a team later sees its projects too.</p>
      </div>
    </section>

    <section v-if="admin && linksOn" class="card">
      <div class="card-header"><Link2 :size="17" /> Links</div>
      <div class="card-body">
        <p class="muted small">Anyone with a link opens the project in a browser (the server’s own web pages), without an account. Delete a link to stop it working.</p>
        <div v-for="l in shares?.links ?? []" :key="l.id" class="member">
          <span class="team-icon"><Link2 :size="18" /></span>
          <div class="who">
            <b>{{ l.name || 'A link' }}</b>
            <span class="muted small">{{ RIGHT_NAMES[l.right] }}{{ l.hasPassword ? ' · with a password' : '' }}</span>
          </div>
          <button class="icon-button small" aria-label="Copy the link" @click="copy(linkShareUrl(l))"><Copy :size="16" /></button>
          <button class="icon-button small" aria-label="Delete the link" @click="change(() => deleteLinkShare(p!, l.id), 'The link doesn’t work any more.')"><Trash2 :size="16" /></button>
        </div>
        <form class="add" @submit.prevent="addLink">
          <input v-model="linkName" class="input" placeholder="What it’s for (optional)" aria-label="Link name" />
          <input v-model="linkPassword" class="input" type="password" autocomplete="new-password" placeholder="Password (optional)" aria-label="Link password" />
          <select v-model="linkRight" class="select slim" aria-label="What the link may do">
            <option v-for="(name, r) in RIGHT_NAMES" :key="r" :value="r">{{ name }}</option>
          </select>
          <button class="button">Make a link</button>
        </form>
      </div>
    </section>

    <template v-if="p.ownerId !== store.user?.id">
      <button v-if="admin && mineDirectly" class="button secondary leave" @click="leave"><LogOut :size="16" /> Leave this project</button>
      <p v-else class="muted small">To stop seeing this project, ask {{ personName(p.ownerId) }} (or another admin) to stop sharing it with you{{ mineDirectly ? '' : ', or leave the team it’s shared through' }}.</p>
    </template>
  </div>
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
  min-height: 52px;
  border-bottom: 1px solid var(--border);
}

.member:last-of-type {
  border-bottom: 0;
}

.who {
  flex: 1;
  display: grid;
  min-width: 0;
}

.who > b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.who > span {
  overflow-wrap: anywhere;
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
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 8px;
}

.add > .with-icon,
.add > .select:not(.slim) {
  flex: 1;
  min-width: 200px;
}

.with-icon {
  position: relative;
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

.team-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--muted);
}

.leave {
  margin-top: 4px;
}

.link-url {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
}

.add .input {
  flex: 1;
  min-width: 160px;
}
</style>
