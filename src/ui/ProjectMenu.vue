<script setup lang="ts">
// A project's "…" menu: edit, share, sub-project, archive, duplicate, delete, leave.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, ArchiveRestore, Copy, Ellipsis, FolderPlus, LogOut, Pencil, Share2, Star, Trash2 } from 'lucide-vue-next'
import Dropdown from './Dropdown.vue'
import Modal from './Modal.vue'
import { canManage } from '@/logic/sharing'
import { attempt, canEdit, succeeded, deleteProject, duplicateProject, isFavorite, leaveProject, store, toggleFavorite, updateProject } from '@/state'
import type { Project } from '@/model'

const props = defineProps<{ project: Project; small?: boolean }>()
const router = useRouter()
const admin = computed(() => canManage(props.project))
const owner = computed(() => props.project.ownerId === store.user?.id)
const confirming = ref<'delete' | 'leave' | null>(null)

async function duplicate() {
  const id = await attempt(() => duplicateProject(props.project.id), 'Project copied.')
  if (id) void router.push({ name: 'project', params: { id } })
}

async function remove() {
  confirming.value = null
  const done = await succeeded(() => deleteProject(props.project.id), 'Project deleted.')
  if (done) void router.push({ name: 'home' })
}

async function leave() {
  confirming.value = null
  const done = await succeeded(() => leaveProject(props.project.id), `You left ${props.project.title}.`)
  if (done) void router.push({ name: 'home' })
}
</script>

<template>
  <Dropdown :label="`${project.title} menu`">
    <template #icon><Ellipsis :size="small ? 16 : 20" /></template>
    <button v-if="canEdit(project)" class="item" @click="attempt(() => toggleFavorite(project.id))">
      <Star :size="16" /> {{ isFavorite(project.id) ? 'Remove from favorites' : 'Add to favorites' }}
    </button>
    <template v-if="admin">
      <RouterLink class="item" :to="{ name: 'project-settings', params: { id: project.id } }"><Pencil :size="16" /> Edit</RouterLink>
      <RouterLink class="item" :to="{ name: 'project-share', params: { id: project.id } }"><Share2 :size="16" /> Share</RouterLink>
      <RouterLink class="item" :to="{ name: 'new-project', query: { parent: project.id } }"><FolderPlus :size="16" /> New sub-project</RouterLink>
      <button class="item" @click="attempt(() => updateProject(project.id, { archived: !project.archived }), project.archived ? 'Project restored.' : 'Project archived.')">
        <component :is="project.archived ? ArchiveRestore : Archive" :size="16" /> {{ project.archived ? 'Restore from archive' : 'Archive' }}
      </button>
    </template>
    <button class="item" @click="duplicate"><Copy :size="16" /> Duplicate</button>
    <hr />
    <button v-if="admin" class="item danger" @click="confirming = 'delete'"><Trash2 :size="16" /> Delete</button>
    <button v-if="!owner" class="item danger" @click="confirming = 'leave'"><LogOut :size="16" /> Leave project</button>
  </Dropdown>

  <Modal v-if="confirming === 'delete'" title="Delete this project?" @close="confirming = null">
    <p>“{{ project.title }}” and all its tasks (and its sub-projects) will be deleted from the server, for everyone it’s shared with. This can’t be undone.</p>
    <template #footer>
      <button class="button ghost" @click="confirming = null">Cancel</button>
      <button class="button danger" @click="remove">Delete</button>
    </template>
  </Modal>
  <Modal v-if="confirming === 'leave'" title="Leave this project?" @close="confirming = null">
    <p>You won’t see “{{ project.title }}” any more, until someone shares it with you again.</p>
    <template #footer>
      <button class="button ghost" @click="confirming = null">Cancel</button>
      <button class="button danger" @click="leave">Leave</button>
    </template>
  </Modal>
</template>
