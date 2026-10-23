<script setup lang="ts">
// Editing a project, and the things done to it (archive, duplicate, delete), all for admins.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Archive, ArchiveRestore, ArrowLeft, Copy, Download, Trash2 } from 'lucide-vue-next'
import ProjectForm, { type ProjectFields } from '@/ui/ProjectForm.vue'
import Modal from '@/ui/Modal.vue'
import { canManage } from '@/logic/sharing'
import { attempt, succeeded, deleteProject, duplicateProject, project, store, toast, updateProject } from '@/state'
import { native } from '@/native'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const p = computed(() => project(id.value))
const admin = computed(() => canManage(p.value))
const fields = ref<ProjectFields>({ title: '', identifier: '', color: '', parentId: null, description: '' })
const confirmDelete = ref(false)

watch(
  p,
  (x) => {
    if (x && !fields.value.title) fields.value = { title: x.title, identifier: x.identifier, color: x.color, parentId: x.parentId, description: x.description }
  },
  { immediate: true },
)

async function save() {
  if (!fields.value.title.trim()) return
  const done = await succeeded(() => updateProject(id.value, { ...fields.value, title: fields.value.title.trim() }), 'Saved.')
  if (done) void router.push({ name: 'project', params: { id: id.value } })
}

async function duplicate() {
  const copy = await attempt(() => duplicateProject(id.value), 'Project copied.')
  if (copy) void router.push({ name: 'project', params: { id: copy } })
}

async function remove() {
  confirmDelete.value = false
  const done = await succeeded(() => deleteProject(id.value), 'Project deleted.')
  if (done) void router.push({ name: 'home' })
}

/** Everything in the project as a file (JSON), to keep or move elsewhere. */
async function exportJson() {
  if (!p.value) return
  const data = { project: p.value, tasks: store.tasks[id.value] ?? [], exported: new Date().toISOString(), from: 'TaskHaven' }
  const text = JSON.stringify(data, null, 2)
  if (native) {
    // the app's web view can't save files: it goes to the clipboard, to paste into a note or an email
    try {
      await navigator.clipboard.writeText(text)
      toast('The project is copied (as JSON): paste it into a note or an email to keep it.')
    } catch {
      toast('Couldn’t copy the project.', { error: true })
    }
    return
  }
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${p.value.title.replace(/[^\w -]+/g, '').trim() || 'project'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
</script>

<template>
  <div v-if="p && admin" class="page narrow">
    <div class="page-title">
      <RouterLink :to="{ name: 'project', params: { id } }" class="icon-button" aria-label="Back"><ArrowLeft :size="20" /></RouterLink>
      <h1>Edit “{{ p.title }}”</h1>
    </div>
    <form class="card card-body" @submit.prevent="save">
      <ProjectForm v-model="fields" :self-id="id" />
      <div class="row end">
        <RouterLink class="button ghost" :to="{ name: 'project', params: { id } }">Cancel</RouterLink>
        <button class="button" :disabled="!fields.title.trim()">Save</button>
      </div>
    </form>

    <div class="card card-body more">
      <button class="button secondary" @click="attempt(() => updateProject(id, { archived: !p!.archived }), p!.archived ? 'Project restored.' : 'Project archived.')">
        <component :is="p.archived ? ArchiveRestore : Archive" :size="16" /> {{ p.archived ? 'Restore from archive' : 'Archive' }}
      </button>
      <button class="button secondary" @click="duplicate"><Copy :size="16" /> Duplicate</button>
      <button class="button secondary" @click="exportJson"><Download :size="16" /> Export</button>
      <span class="spacer" />
      <button class="button danger" @click="confirmDelete = true"><Trash2 :size="16" /> Delete</button>
    </div>
    <p class="help">Archived projects can still be seen (and restored), but not changed.</p>

    <Modal v-if="confirmDelete" title="Delete this project?" @close="confirmDelete = false">
      <p>“{{ p.title }}”, all its tasks and its sub-projects will be deleted, for everyone in it. This can’t be undone.</p>
      <template #footer>
        <button class="button ghost" @click="confirmDelete = false">Cancel</button>
        <button class="button danger" @click="remove">Delete</button>
      </template>
    </Modal>
  </div>
  <div v-else class="page"><div class="card empty">Only the project’s admins can change it.</div></div>
</template>

<style scoped>
.narrow {
  max-width: 640px;
}

.end {
  justify-content: flex-end;
}

.more {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.help {
  margin-top: 8px;
}
</style>
