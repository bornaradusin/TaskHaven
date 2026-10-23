<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProjectForm, { type ProjectFields } from '@/ui/ProjectForm.vue'
import { attempt, createProject, store } from '@/state'
import { COLORS } from '@/model'

const route = useRoute()
const router = useRouter()
const fields = ref<ProjectFields>({
  title: '',
  identifier: '',
  color: COLORS[store.projects.length % COLORS.length],
  parentId: typeof route.query.parent === 'string' ? route.query.parent : null,
  description: '',
})
const busy = ref(false)

async function create() {
  if (!fields.value.title.trim()) return
  busy.value = true
  const id = await attempt(() => createProject(fields.value))
  busy.value = false
  if (id) void router.replace({ name: 'project', params: { id } })
}
</script>

<template>
  <div class="page narrow">
    <div class="page-title"><h1>New project</h1></div>
    <form class="card card-body" @submit.prevent="create">
      <ProjectForm v-model="fields" />
      <p class="help">Only you see it. To work on it with someone, share it with their username (its menu → Share).</p>
      <div class="row end">
        <button type="button" class="button ghost" @click="router.back()">Cancel</button>
        <button class="button" :disabled="busy || !fields.title.trim()">Create</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 640px;
}

.end {
  justify-content: flex-end;
}
</style>
