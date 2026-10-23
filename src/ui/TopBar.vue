<script setup lang="ts">
// The bar along the top: the menu (on a phone), checking the server, search, the inbox and you.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, CloudOff, LogOut, Menu, RefreshCw, Search, Settings } from 'lucide-vue-next'
import Avatar from './Avatar.vue'
import Dropdown from './Dropdown.vue'
import Logo from './Logo.vue'
import { attempt, refresh, signOut, store } from '@/state'
import { displayName } from '@/model'

const router = useRouter()
const unread = computed(() => store.notices.filter((n) => !n.read).length)

async function leave() {
  await attempt(signOut)
  void router.push({ name: 'home' })
}
</script>

<template>
  <header class="top">
    <button class="icon-button menu-button" aria-label="Menu" @click="store.menuOpen = !store.menuOpen"><Menu :size="22" /></button>
    <RouterLink :to="{ name: 'home' }" class="mobile-logo"><Logo :size="28" :word="false" /></RouterLink>
    <span class="spacer" />
    <button
      v-if="!store.online"
      class="icon-button offline"
      title="The server can’t be reached: showing what was fetched last. Tap to try again."
      aria-label="Offline: try again"
      @click="attempt(refresh)"
    >
      <CloudOff :size="20" />
    </button>
    <button v-else class="icon-button refresh" :class="{ spinning: store.refreshing }" aria-label="Check for changes" title="Check for changes" @click="attempt(refresh)">
      <RefreshCw :size="19" />
    </button>
    <RouterLink :to="{ name: 'search' }" class="icon-button" aria-label="Search" title="Search"><Search :size="20" /></RouterLink>
    <RouterLink :to="{ name: 'notifications' }" class="icon-button bell" :aria-label="`Notifications${unread ? ` (${unread} new)` : ''}`" title="Notifications">
      <Bell :size="20" />
      <span v-if="unread" class="count">{{ unread > 9 ? '9+' : unread }}</span>
    </RouterLink>
    <Dropdown label="You">
      <template #trigger="{ toggle }">
        <button class="me" aria-label="Your account" @click.stop="toggle">
          <Avatar v-if="store.user" :id="store.user.id" :size="32" :title="false" />
          <span class="name">{{ store.user ? displayName(store.user) : '' }}</span>
        </button>
      </template>
      <div class="who">
        <b>{{ store.user ? displayName(store.user) : '' }}</b>
        <span class="muted small">@{{ store.user?.username }}</span>
      </div>
      <hr />
      <RouterLink class="item" :to="{ name: 'settings' }"><Settings :size="16" /> Settings</RouterLink>
      <hr />
      <button class="item" @click="leave"><LogOut :size="16" /> Sign out</button>
    </Dropdown>
  </header>
</template>

<style scoped>
.top {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 4px;
  height: calc(var(--top) + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 12px 0 16px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(8px);
}

.menu-button,
.mobile-logo {
  display: none;
}

.bell {
  position: relative;
}

.offline {
  color: var(--danger);
}

.spinning svg {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.count {
  position: absolute;
  top: 3px;
  right: 2px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 17px;
  text-align: center;
}

.me {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
  padding: 3px 10px 3px 3px;
  border: 0;
  border-radius: 999px;
  background: transparent;
}

.me:hover {
  background: var(--hover);
}

.name {
  font-weight: 600;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.who {
  display: grid;
  padding: 6px 10px;
}

@media (max-width: 960px) {
  .menu-button,
  .mobile-logo {
    display: inline-grid;
    place-items: center;
  }

  .top {
    padding-left: 6px;
  }

  .name {
    display: none;
  }

  .me {
    padding-right: 3px;
  }
}
</style>
