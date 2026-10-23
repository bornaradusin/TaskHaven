<script setup lang="ts">
// Settings: you, how it looks, quick add, notifications, the server, the account.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Filter, KeyRound, LogOut, RefreshCw, Trash2 } from 'lucide-vue-next'
import Modal from '@/ui/Modal.vue'
import { chooseDemo, demoChosen, saveServer } from '@/data/connect'
import { native } from '@/native'
import { DELETE_URL, PRIVACY_URL, REPORT_URL, TERMS_URL } from '@/links'
import { attempt, cancelDeletion, canEdit, changePassword, disconnect, refresh, requestDeletion, saveSettings, signOut, store, succeeded, updateProfile } from '@/state'
import { formatDateTime } from '@/logic/dates'
import type { Settings } from '@/model'

const router = useRouter()
const name = ref(store.user?.name ?? '')
const dialog = ref<'delete' | 'password' | 'keep' | null>(null)
const typed = ref('')
const fresh = ref('')
const busy = ref(false)
const asked = ref(false)
const version = __APP_VERSION__
const demo = demoChosen()
const server = computed(() => store.backend?.server ?? '')

watch(
  () => store.user?.name,
  (n) => (name.value = n ?? ''),
)

function set<K extends keyof Settings>(key: K, value: Settings[K]) {
  void attempt(() => saveSettings({ [key]: value } as Partial<Settings>))
}

async function saveName() {
  if (name.value.trim() !== (store.user?.name ?? '')) await attempt(() => updateProfile({ name: name.value.trim() }), 'Saved.')
}

function close() {
  dialog.value = null
  typed.value = ''
  fresh.value = ''
}

async function newPassword() {
  busy.value = true
  const done = await succeeded(() => changePassword(typed.value, fresh.value), 'Your password is changed.')
  busy.value = false
  if (done) close()
}

async function out() {
  await attempt(signOut)
  void router.push({ name: 'home' })
}

function switchServer() {
  disconnect()
  chooseDemo(false)
  saveServer(null)
  location.reload()
}

async function remove() {
  busy.value = true
  const done = await succeeded(() => requestDeletion(typed.value))
  busy.value = false
  if (done) {
    asked.value = true
    typed.value = ''
  }
}

async function keep() {
  busy.value = true
  const done = await succeeded(() => cancelDeletion(typed.value), 'Your account stays.')
  busy.value = false
  if (done) close()
}

const options = computed(() => store.projects.filter((p) => canEdit(p)))
</script>

<template>
  <div class="page narrow">
    <div class="page-title"><h1>Settings</h1></div>

    <section class="card card-body">
      <h2>You</h2>
      <label class="field">
        <span>Name</span>
        <input v-model="name" class="input" :placeholder="store.user?.username" @blur="saveName" @keydown.enter="saveName" />
      </label>
      <p class="muted small">
        Your username is <b>{{ store.user?.username }}</b>: others share projects and teams with you by it.
        <template v-if="store.user?.email"><br />Email: {{ store.user.email }}</template>
      </p>
    </section>

    <section class="card card-body">
      <h2>How it looks</h2>
      <div class="field">
        <span>Theme</span>
        <div class="tabs seg">
          <button v-for="t in ['system', 'light', 'dark'] as const" :key="t" class="tab" :class="{ active: store.settings.theme === t }" @click="set('theme', t)">
            {{ t === 'system' ? 'Like the phone' : t === 'light' ? 'Light' : 'Dark' }}
          </button>
        </div>
      </div>
      <div class="field">
        <span>Weeks start on</span>
        <div class="tabs seg">
          <button class="tab" :class="{ active: store.settings.weekStart === 1 }" @click="set('weekStart', 1)">Monday</button>
          <button class="tab" :class="{ active: store.settings.weekStart === 0 }" @click="set('weekStart', 0)">Sunday</button>
        </div>
      </div>
      <label class="field">
        <span>Quick add puts tasks in</span>
        <select class="select" :value="store.settings.defaultProjectId ?? ''" @change="set('defaultProjectId', ($event.target as HTMLSelectElement).value || null)">
          <option value="">The first project</option>
          <option v-for="p in options" :key="p.id" :value="p.id">{{ p.title }}</option>
        </select>
      </label>
      <RouterLink class="button secondary small" :to="{ name: 'filter', params: { id: 'new' } }"><Filter :size="15" /> New saved filter</RouterLink>
    </section>

    <section class="card card-body">
      <h2>Notifications</h2>
      <label class="switch"><input type="checkbox" :checked="store.settings.notifyReminders" @change="set('notifyReminders', ($event.target as HTMLInputElement).checked)" /> Reminders on this phone</label>
      <label class="switch"><input type="checkbox" :checked="store.settings.notifyDue" @change="set('notifyDue', ($event.target as HTMLInputElement).checked)" /> When a task is due</label>
      <p class="help">
        For tasks assigned to you (or that you made and nobody is assigned to).
        {{ native ? 'They come even when TaskHaven is closed, as set the last time it was open.' : 'Notifications work in the Android app.' }}
        What others do (assigning you, comments) shows in the bell at the top once the app has checked the server.
      </p>
    </section>

    <section v-if="demo" class="card card-body">
      <h2>The demo</h2>
      <p>This is a made-up family on this phone only: nothing is saved or shared.</p>
      <button class="button" @click="switchServer">Leave the demo</button>
    </section>
    <section v-else class="card card-body">
      <h2>Your server</h2>
      <p class="server">
        <b>{{ server }}</b><br />
        <span class="muted small">
          Vikunja {{ store.server?.version ?? '' }} ·
          <span :class="{ offline: !store.online }">{{ store.online ? 'connected' : 'can’t be reached right now (showing what was fetched last)' }}</span>
        </span>
      </p>
      <div class="row wrap">
        <button class="button secondary small" :disabled="store.refreshing" @click="attempt(refresh)"><RefreshCw :size="15" /> {{ store.refreshing ? 'Checking…' : 'Check for changes now' }}</button>
        <span class="spacer" />
        <button class="button ghost small" @click="switchServer">Use another server</button>
      </div>
      <p class="help">The app checks the server every minute or so while it’s open, and whenever you come back to it.</p>
    </section>

    <section v-if="store.user?.deletionAt" class="card card-body due">
      <h2>Your account is to be deleted</h2>
      <p>The server deletes it on <b>{{ formatDateTime(new Date(store.user.deletionAt)) }}</b>, as you confirmed.</p>
      <button class="button" @click="dialog = 'keep'">Keep my account</button>
    </section>

    <section class="card card-body">
      <h2>Account</h2>
      <div class="row wrap">
        <button class="button secondary" @click="dialog = 'password'"><KeyRound :size="16" /> Change password</button>
        <button class="button secondary" @click="out"><LogOut :size="16" /> Sign out</button>
        <span class="spacer" />
        <button v-if="store.server?.deletion !== false" class="button danger" @click="dialog = 'delete'"><Trash2 :size="16" /> Delete account</button>
      </div>
    </section>

    <p class="about muted small">
      TaskHaven {{ version }} · free software (GPL-3.0-or-later)<br />
      An independent app for Vikunja servers, not made by the Vikunja project.<br />
      <a :href="PRIVACY_URL" target="_blank" rel="noopener">Privacy policy</a> ·
      <a :href="TERMS_URL" target="_blank" rel="noopener">Terms of use</a> ·
      <a :href="REPORT_URL" target="_blank" rel="noopener">Report abuse</a>
    </p>

    <Modal v-if="dialog === 'password'" title="Change your password" @close="close">
      <label class="field"><span>Your password now</span><input v-model="typed" class="input" type="password" autocomplete="current-password" /></label>
      <label class="field">
        <span>A new password</span>
        <input v-model="fresh" class="input" type="password" autocomplete="new-password" minlength="8" @keydown.enter="typed && fresh && newPassword()" />
        <small class="muted">At least 8 characters. Other phones and browsers are signed out.</small>
      </label>
      <template #footer>
        <button class="button ghost" @click="close">Cancel</button>
        <button class="button" :disabled="!typed || fresh.length < 8 || busy" @click="newPassword">Change it</button>
      </template>
    </Modal>

    <Modal v-if="dialog === 'keep'" title="Keep your account?" @close="close">
      <p>The server won’t delete it, and everything stays as it is.</p>
      <label class="field"><span>Your password, to be sure it’s you</span><input v-model="typed" class="input" type="password" autocomplete="current-password" @keydown.enter="typed && keep()" /></label>
      <template #footer>
        <button class="button ghost" @click="close">Cancel</button>
        <button class="button" :disabled="!typed || busy" @click="keep">Keep my account</button>
      </template>
    </Modal>

    <Modal v-if="dialog === 'delete'" title="Delete your account?" @close="close">
      <template v-if="asked">
        <p>The server is sending an email to <b>{{ store.user?.email }}</b> with a link to confirm. Once you open it, the server deletes your account three days later (it reminds you by email, and you can keep the account until then).</p>
        <p class="muted small">No email? A server that can’t send email can’t do this: ask whoever runs it to delete your account. <a :href="DELETE_URL" target="_blank" rel="noopener">More about deleting an account</a>.</p>
      </template>
      <template v-else>
        <p>Your account is on <b>{{ server || 'this server' }}</b>, so the server deletes it: it emails you a link to confirm, then three days later deletes your account, the projects only you have (with their tasks), your saved filters, and your place in teams and shared projects. This can’t be undone.</p>
        <p class="muted small">Projects you shared with others stay theirs (one of them gets to manage each). Nothing about you is kept by TaskHaven itself.</p>
        <label class="field"><span>Your password, to be sure it’s you</span><input v-model="typed" class="input" type="password" autocomplete="current-password" @keydown.enter="typed && remove()" /></label>
      </template>
      <template #footer>
        <button class="button ghost" @click="close">{{ asked ? 'Close' : 'Cancel' }}</button>
        <button v-if="!asked" class="button danger" :disabled="!typed || busy" @click="remove">{{ busy ? 'Asking…' : 'Delete my account' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
}

section {
  margin-bottom: 16px;
}

.seg {
  align-self: start;
  padding: 3px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.switch {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  cursor: pointer;
}

.switch input {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.server {
  overflow-wrap: anywhere;
}

.offline {
  color: var(--danger);
}

.due {
  border: 1px solid var(--danger);
}

.wrap {
  flex-wrap: wrap;
}

.about {
  text-align: center;
}

.gone {
  margin: 0 0 12px;
  padding-left: 1.2em;
}
</style>
