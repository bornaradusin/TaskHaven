<script setup lang="ts">
// A newer TaskHaven from GitHub: what's new, then the way to install it on this phone (src/update.ts).
import { computed, onMounted, onUnmounted } from 'vue'
import { Download, ExternalLink } from 'lucide-vue-next'
import Modal from './Modal.vue'
import {
  allowInstalls,
  checkForUpdate,
  closeDialog,
  currentVersion,
  installOnAndroid,
  installWith,
  later,
  openReleasePage,
  platform,
  resumeInstall,
  updates,
} from '@/update'

const title = computed(() => {
  const v = updates.update?.version
  switch (updates.step) {
    case 'checking':
      return 'Looking for updates…'
    case 'latest':
      return 'TaskHaven is up to date'
    case 'permission':
      return 'Allow TaskHaven to update itself'
    case 'failed':
      return v ? `TaskHaven ${v} is ready` : 'Updates'
    default:
      return v ? `TaskHaven ${v} is ready` : 'Updates'
  }
})

// back from Android's "install unknown apps" switch: carry on with the install
function visible() {
  if (document.visibilityState === 'visible') void resumeInstall()
}
onMounted(() => document.addEventListener('visibilitychange', visible))
onUnmounted(() => document.removeEventListener('visibilitychange', visible))
</script>

<template>
  <Modal :title="title" @close="closeDialog">
    <template v-if="updates.step === 'checking'">
      <div class="bar"><div class="moving" /></div>
    </template>

    <p v-else-if="updates.step === 'latest'">You have the newest version, {{ currentVersion }}.</p>

    <template v-else-if="updates.step === 'downloading'">
      <p>Downloading… {{ Math.round(updates.progress * 100) }}%</p>
      <div class="bar"><div class="done" :style="{ width: `${Math.round(updates.progress * 100)}%` }" /></div>
      <p class="help">Android’s installer opens when it’s done. The download is deleted once the update is in.</p>
    </template>

    <p v-else-if="updates.step === 'permission'">
      The update is downloaded. Android asks you to allow TaskHaven to install apps once: turn on “Allow from this source”, then come back here.
    </p>

    <p v-else-if="updates.step === 'failed'" class="problem">{{ updates.problem }}</p>

    <template v-else-if="updates.update">
      <p class="muted small">You have {{ currentVersion }}.</p>
      <pre v-if="updates.update.notes" class="notes">{{ updates.update.notes }}</pre>
      <p v-if="platform === 'ios' && updates.stores.length" class="help">
        An iPhone app from outside the App Store can’t replace itself: {{ updates.stores.join(' or ') }} installs the new version over this one, and your
        data stays.
      </p>
      <p v-else-if="platform === 'ios'" class="help">
        Download the .ipa and install it the way you installed TaskHaven (Sideloadly, say). It goes over this one, and your data stays.
      </p>
    </template>

    <template #footer>
      <template v-if="updates.step === 'ready' && updates.update">
        <button class="button ghost" @click="later">Not now</button>
        <span class="spacer" />
        <template v-if="platform === 'android'">
          <button class="button" @click="installOnAndroid"><Download :size="15" /> Update</button>
        </template>
        <template v-else>
          <button v-if="!updates.stores.length" class="button" @click="openReleasePage"><ExternalLink :size="15" /> Get the .ipa</button>
          <button v-for="s in updates.stores" :key="s" class="button" @click="installWith(s)">Update with {{ s }}</button>
        </template>
      </template>
      <template v-else-if="updates.step === 'permission'">
        <button class="button ghost" @click="later">Not now</button>
        <span class="spacer" />
        <button class="button" @click="allowInstalls">Allow</button>
      </template>
      <template v-else-if="updates.step === 'failed'">
        <button class="button ghost" @click="closeDialog">Close</button>
        <span class="spacer" />
        <button class="button" @click="platform === 'android' && updates.update ? installOnAndroid() : checkForUpdate(true)">Try again</button>
      </template>
      <template v-else-if="updates.step !== 'downloading'">
        <span class="spacer" />
        <button class="button" @click="closeDialog">OK</button>
      </template>
    </template>
  </Modal>
</template>

<style scoped>
.notes {
  max-height: 46vh;
  overflow: auto;
  margin: 8px 0 0;
  white-space: pre-wrap;
  font: inherit;
  line-height: 1.5;
}

.problem {
  color: var(--danger);
}

.bar {
  position: relative;
  height: 6px;
  margin: 8px 0;
  overflow: hidden;
  border-radius: 3px;
  background: var(--surface-3);
}

.done,
.moving {
  height: 100%;
  border-radius: 3px;
  background: var(--primary);
}

.done {
  transition: width 0.15s;
}

.moving {
  position: absolute;
  width: 35%;
  animation: slide 1.1s ease-in-out infinite;
}

@keyframes slide {
  from {
    left: -35%;
  }
  to {
    left: 100%;
  }
}
</style>
