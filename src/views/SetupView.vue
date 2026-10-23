<script setup lang="ts">
// The first thing on a new phone: which Vikunja server to use (one at home, or one on the internet
// at an https address), or the demo.
import { ref } from 'vue'
import { ExternalLink, PlayCircle, Server } from 'lucide-vue-next'
import Logo from '@/ui/Logo.vue'
import { checkServer, chooseDemo, saveServer, savedServer } from '@/data/connect'

const emit = defineEmits<{ connected: [] }>()
const mode = ref<'choose' | 'server' | 'help'>('choose')
const address = ref(savedServer() ?? '')
const error = ref('')
const busy = ref(false)

async function use() {
  error.value = ''
  busy.value = true
  try {
    const found = await checkServer(address.value)
    saveServer(found.address)
    chooseDemo(false)
    emit('connected')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function demo() {
  chooseDemo(true)
  emit('connected')
}
</script>

<template>
  <div class="setup">
    <div class="panel">
      <Logo :size="44" class="logo" />

      <template v-if="mode === 'choose'">
        <h1>Connect to your server</h1>
        <p class="lead">
          TaskHaven keeps your projects on your own Vikunja server: one at home, or one on the internet. Everyone on the server sees only their own
          projects, and those shared with them.
        </p>
        <button class="choice card" @click="mode = 'server'">
          <Server :size="22" />
          <span><b>I have a server</b><span class="muted">Type its address, then sign in or make an account.</span></span>
        </button>
        <button class="choice card" @click="mode = 'help'">
          <ExternalLink :size="22" />
          <span><b>I don’t have one yet</b><span class="muted">How to run one on a home computer, a NAS or a Raspberry Pi.</span></span>
        </button>
        <button class="choice card" @click="demo">
          <PlayCircle :size="22" />
          <span><b>Try the demo</b><span class="muted">A made-up family on this phone only. Nothing is saved.</span></span>
        </button>
        <p class="muted note">TaskHaven is an independent app that works with Vikunja servers. It isn’t made by, or connected with, the Vikunja project.</p>
      </template>

      <template v-else-if="mode === 'server'">
        <h1>Your server’s address</h1>
        <p class="lead">The address you open Vikunja at in a browser.</p>
        <form @submit.prevent="use">
          <input
            v-model="address"
            class="input address"
            type="text"
            inputmode="url"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="192.168.1.20:3456 or tasks.example.com"
            aria-label="Server address"
          />
          <p class="muted examples">
            At home: its address on your network (like <code>192.168.1.20:3456</code>; plain http is fine there).<br />
            On the internet: an <b>https://</b> address (like <code>https://tasks.example.com</code>).
          </p>
          <p v-if="error" class="error-text">{{ error }}</p>
          <div class="row">
            <button type="button" class="button ghost" @click="mode = 'choose'">Back</button>
            <span class="spacer" />
            <button class="button" :disabled="!address.trim() || busy">{{ busy ? 'Checking…' : 'Continue' }}</button>
          </div>
        </form>
      </template>

      <template v-else>
        <h1>Running a server</h1>
        <ol class="steps">
          <li>Vikunja is free and open source. It runs on a computer that stays on at home: a NAS, a Raspberry Pi, or a home server (with Docker it’s one command).</li>
          <li>
            Follow its install guide at
            <a href="https://vikunja.io/docs/installing/" target="_blank" rel="noopener">vikunja.io/docs <ExternalLink :size="13" /></a>.
            It listens on port 3456.
          </li>
          <li>Phones on your Wi-Fi reach it at the computer’s address, like <code>192.168.1.20:3456</code>.</li>
          <li>To use it away from home too, put it behind a domain with https (a reverse proxy such as Caddy, or a tunnel), or use a VPN like Tailscale.</li>
          <li>Then come back here, choose <b>I have a server</b>, and make your account. Add your family by sharing a project or a team with their usernames.</li>
        </ol>
        <div class="row">
          <button class="button ghost" @click="mode = 'choose'">Back</button>
          <span class="spacer" />
          <button class="button" @click="mode = 'server'">I have a server</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.setup {
  display: grid;
  place-items: start center;
  min-height: 100vh;
  padding: calc(40px + env(safe-area-inset-top)) 16px 40px;
}

.panel {
  width: min(520px, 100%);
}

.logo {
  margin-bottom: 28px;
}

.lead {
  color: var(--muted);
  font-size: 1.05rem;
  margin-bottom: 22px;
}

.choice {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  margin-bottom: 12px;
  padding: 16px 18px;
  border: 1px solid transparent;
  text-align: left;
}

.choice:hover {
  border-color: var(--brand);
}

.choice > svg {
  color: var(--primary);
  flex: none;
}

.choice b {
  display: block;
  margin-bottom: 2px;
}

.choice .muted {
  display: block;
  font-size: 0.9rem;
}

.address {
  margin-bottom: 10px;
}

.examples {
  margin: 0 0 16px;
  font-size: 0.9rem;
}

.steps {
  padding-left: 1.3em;
  margin: 0 0 14px;
}

.steps li {
  margin-bottom: 10px;
}

.note {
  margin-top: 18px;
  font-size: 0.85rem;
}

code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 0.85em;
}

.help {
  margin-top: 14px;
}
</style>
