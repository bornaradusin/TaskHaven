<script setup lang="ts">
// The frame: setting up (which server), signing in, then the menu, the top bar and the screen.
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '@/ui/Sidebar.vue'
import TopBar from '@/ui/TopBar.vue'
import Toasts from '@/ui/Toasts.vue'
import Logo from '@/ui/Logo.vue'
import SetupView from '@/views/SetupView.vue'
import AuthView from '@/views/AuthView.vue'
import { connect, store } from '@/state'
import { makeBackend } from '@/data/connect'

const route = useRoute()
const checked = ref(false)

async function start() {
  const b = await makeBackend()
  if (b) connect(b)
  checked.value = true
}

onMounted(start)
watch(
  () => route.fullPath,
  () => (store.menuOpen = false),
)
</script>

<template>
  <div v-if="!checked || (store.backend && !store.ready)" class="splash">
    <Logo :size="72" :word="false" />
  </div>
  <SetupView v-else-if="!store.backend" @connected="start" />
  <AuthView v-else-if="!store.user" />
  <div v-else class="shell" :class="{ menu: store.menuOpen }">
    <Sidebar />
    <div class="scrim" @click="store.menuOpen = false" />
    <div class="content">
      <TopBar />
      <main>
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="route.name === 'project' ? `${route.params.id}` : route.fullPath" />
        </RouterView>
      </main>
    </div>
  </div>
  <Toasts />
</template>

<style scoped>
.splash {
  display: grid;
  place-items: center;
  min-height: 100vh;
  animation: breathe 1.6s ease-in-out infinite;
}

@keyframes breathe {
  50% {
    opacity: 0.6;
    transform: scale(0.96);
  }
}

.shell {
  display: flex;
  min-height: 100vh;
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
  min-width: 0;
}

.scrim {
  display: none;
}

@media (max-width: 960px) {
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 29;
    background: rgba(0, 0, 0, 0.4);
  }

  .shell.menu :deep(.sidebar) {
    transform: none;
  }

  .shell.menu .scrim {
    display: block;
    animation: fade 0.15s;
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }
}
</style>
