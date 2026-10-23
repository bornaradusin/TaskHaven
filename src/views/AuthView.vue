<script setup lang="ts">
// Signing in to the server, making an account on it, and a new password.
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Logo from '@/ui/Logo.vue'
import { PRIVACY_URL, TERMS_URL } from '@/links'
import { chooseDemo, demoChosen, saveServer } from '@/data/connect'
import { BackendError } from '@/data/backend'
import { disconnect, resetPassword, signIn, signUp, store } from '@/state'

const route = useRoute()
const router = useRouter()
const mode = ref<'in' | 'up' | 'reset'>(route.name === 'register' ? 'up' : 'in')
const demo = demoChosen()
const login = ref(demo ? 'alex' : '')
const username = ref('')
const email = ref('')
const password = ref(demo ? 'taskhaven' : '')
const totp = ref('')
const askTotp = ref(false)
const error = ref('')
const message = ref('')
const busy = ref(false)
const server = computed(() => store.backend?.server.replace(/^https?:\/\//, '') ?? '')
// a server may not take new accounts (then whoever runs it makes them)
const canRegister = computed(() => store.server?.registration !== false)

async function submit() {
  error.value = ''
  message.value = ''
  busy.value = true
  try {
    if (mode.value === 'in') await signIn(login.value, password.value, askTotp.value ? totp.value : undefined)
    else if (mode.value === 'up') await signUp(username.value, email.value, password.value)
    else {
      await resetPassword(email.value)
      message.value = `If there's an account for ${email.value}, the server is sending an email with a link to set a new password. (A server that can’t send email can’t do this: ask whoever runs it.)`
      mode.value = 'in'
    }
    if (route.name === 'register' || route.name === 'login') void router.replace({ name: 'home' })
  } catch (e) {
    if (e instanceof BackendError && e.code === 'totp') {
      // two-factor sign-in: the code from the authenticator app, then again
      askTotp.value = true
      if (!totp.value) {
        error.value = ''
        return
      }
    }
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function change() {
  disconnect()
  chooseDemo(false)
  saveServer(null)
  location.reload()
}

function tryDemo() {
  disconnect()
  chooseDemo(true)
  location.reload()
}
</script>

<template>
  <div class="auth">
    <div class="panel">
      <Logo :size="44" class="logo" />
      <div class="card form">
        <div class="tabs switch">
          <button class="tab" :class="{ active: mode !== 'up' }" @click="mode = 'in'">Sign in</button>
          <button v-if="canRegister" class="tab" :class="{ active: mode === 'up' }" @click="mode = 'up'">Create account</button>
        </div>
        <form @submit.prevent="submit">
          <h2 v-if="mode === 'reset'">Set a new password</h2>
          <template v-if="mode === 'in'">
            <label class="field">
              <span>Username or email</span>
              <input v-model="login" class="input" autocomplete="username" autocapitalize="off" spellcheck="false" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input v-model="password" class="input" type="password" autocomplete="current-password" required />
            </label>
            <label v-if="askTotp" class="field">
              <span>Code from your authenticator app</span>
              <input v-model="totp" class="input code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
            </label>
          </template>
          <template v-else-if="mode === 'up'">
            <label class="field">
              <span>Username</span>
              <input v-model="username" class="input" autocomplete="username" autocapitalize="off" spellcheck="false" required />
              <small class="muted">People share projects with you by it.</small>
            </label>
            <label class="field"><span>Email</span><input v-model="email" class="input" type="email" autocomplete="email" required /></label>
            <label class="field">
              <span>Password</span>
              <input v-model="password" class="input" type="password" autocomplete="new-password" minlength="8" required />
              <small class="muted">At least 8 characters.</small>
            </label>
          </template>
          <label v-else class="field"><span>Email</span><input v-model="email" class="input" type="email" autocomplete="email" required /></label>
          <p v-if="error" class="error-text">{{ error }}</p>
          <p v-if="message" class="note">{{ message }}</p>
          <p v-if="mode === 'up'" class="agree">
            Your account is on this server. By making it you agree to TaskHaven’s <a :href="TERMS_URL" target="_blank" rel="noopener">terms of use</a> and
            <a :href="PRIVACY_URL" target="_blank" rel="noopener">privacy policy</a>.
          </p>
          <button class="button wide" :disabled="busy">{{ mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send the email' }}</button>
          <div class="links">
            <a v-if="mode === 'in'" href="#" @click.prevent="mode = 'reset'">Forgot your password?</a>
            <a v-if="mode === 'reset'" href="#" @click.prevent="mode = 'in'">Back to signing in</a>
          </div>
        </form>
      </div>
      <p v-if="!canRegister && !demo" class="where">This server doesn’t take new accounts: ask whoever runs it to make you one.</p>
      <p v-if="demo" class="where">This is the demo: a made-up family on this phone only. <a href="#" @click.prevent="change">Leave the demo</a></p>
      <template v-else>
        <p class="where small">
          Server: <b>{{ server }}</b><template v-if="store.server?.version"> (Vikunja {{ store.server.version }})</template> ·
          <a href="#" @click.prevent="change">Change</a>
        </p>
        <p class="where small">Just looking? <a href="#" @click.prevent="tryDemo">Try the demo</a> · <a :href="PRIVACY_URL" target="_blank" rel="noopener">Privacy policy</a></p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.auth {
  display: grid;
  place-items: start center;
  min-height: 100vh;
  padding: calc(48px + env(safe-area-inset-top)) 16px 40px;
}

.panel {
  width: min(420px, 100%);
}

.logo {
  display: flex;
  justify-content: center;
  margin-bottom: 26px;
}

.form {
  padding: 18px 20px 20px;
}

.switch {
  margin-bottom: 18px;
  padding: 4px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.switch .tab {
  flex: 1;
  justify-content: center;
}

.agree {
  color: var(--muted);
  font-size: 0.85rem;
}

.links {
  margin-top: 14px;
  text-align: center;
  font-size: 0.9rem;
}

.note {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--success-soft);
  color: var(--success);
  font-size: 0.9rem;
}

.code {
  letter-spacing: 0.2em;
  font-variant-numeric: tabular-nums;
}

.where {
  margin-top: 18px;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
</style>
