<script setup lang="ts">
// Files on a task, kept on the server. Photos show small here; any file opens or downloads.
import { computed, onUnmounted, ref, watch } from 'vue'
import { Download, FileText, Paperclip, Trash2 } from 'lucide-vue-next'
import Modal from '../Modal.vue'
import { relativeDay } from '@/logic/dates'
import { attachmentUrl, attempt, deleteAttachment, personName, store, toast, uploadAttachment } from '@/state'
import type { Attachment, Task } from '@/model'

const props = defineProps<{ task: Task; editable: boolean }>()
const files = computed(() => props.task.attachments)
const picker = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const viewing = ref<Attachment | null>(null)
/** Files fetched so far, as addresses on the phone (by id). */
const urls = ref<Record<string, string>>({})
const fetching = new Set<string>()

/** The most the server takes ("20MB"), in bytes. */
const limit = computed(() => {
  const m = /^(\d+(?:\.\d+)?)\s*([KMG]?)B?$/i.exec(store.server?.maxFileSize ?? '')
  if (!m) return 20 * 1024 * 1024
  return Number(m[1]) * { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[2].toUpperCase() as '' | 'K' | 'M' | 'G']
})
const allowed = computed(() => store.server?.attachments !== false)

const isImage = (f: Attachment) => /^image\/(png|jpe?g|gif|webp|bmp|avif)$/.test(f.type)

async function fetchFile(f: Attachment): Promise<string | undefined> {
  if (urls.value[f.id]) return urls.value[f.id]
  if (fetching.has(f.id)) return
  fetching.add(f.id)
  try {
    const url = await attachmentUrl(props.task, f)
    urls.value = { ...urls.value, [f.id]: url }
    return url
  } catch {
    return undefined
  } finally {
    fetching.delete(f.id)
  }
}

// photos are fetched to show them small
watch(
  files,
  (list) => {
    for (const f of list) if (isImage(f) && f.size < 8 * 1024 * 1024) void fetchFile(f)
  },
  { immediate: true },
)
onUnmounted(() => {
  for (const url of Object.values(urls.value)) if (url.startsWith('blob:')) URL.revokeObjectURL(url)
})

async function chosen(e: Event) {
  const list = [...((e.target as HTMLInputElement).files ?? [])]
  ;(e.target as HTMLInputElement).value = ''
  busy.value = true
  for (const file of list) {
    if (file.size > limit.value) {
      toast(`“${file.name}” is too big (this server takes files up to ${store.server?.maxFileSize || '20MB'}).`, { error: true })
      continue
    }
    await attempt(() => uploadAttachment(props.task, file, file.name))
  }
  busy.value = false
}

function size(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

async function open(f: Attachment) {
  viewing.value = f
  await fetchFile(f)
}

async function remove(f: Attachment) {
  viewing.value = null
  await attempt(() => deleteAttachment(props.task, f.id), 'File deleted.')
}

defineExpose({ pick: () => picker.value?.click() })
</script>

<template>
  <section v-if="files.length || (editable && allowed)" class="attachments">
    <div class="row head">
      <h3>Attachments</h3>
      <span class="spacer" />
      <button v-if="editable && allowed" class="button secondary small" :disabled="busy" @click="picker?.click()"><Paperclip :size="15" /> {{ busy ? 'Adding…' : 'Add a file' }}</button>
      <input ref="picker" type="file" multiple hidden @change="chosen" />
    </div>
    <div v-if="files.length" class="grid">
      <button v-for="f in files" :key="f.id" class="file card" @click="open(f)">
        <img v-if="isImage(f) && urls[f.id]" :src="urls[f.id]" :alt="f.name" />
        <span v-else class="doc"><FileText :size="28" /></span>
        <span class="fname">{{ f.name }}</span>
        <span class="muted small">{{ size(f.size) }} · {{ personName(f.createdBy).split(' ')[0] }} · {{ relativeDay(new Date(f.created)) }}</span>
      </button>
    </div>
    <p v-else class="muted small">Photos and files (up to {{ store.server?.maxFileSize || '20MB' }}) are kept with the task on the server.</p>

    <Modal v-if="viewing" :title="viewing.name" wide @close="viewing = null">
      <img v-if="isImage(viewing) && urls[viewing.id]" :src="urls[viewing.id]" :alt="viewing.name" class="big" />
      <p v-else class="muted">{{ viewing.type }} · {{ size(viewing.size) }}{{ urls[viewing.id] ? '' : ' · fetching…' }}</p>
      <template #footer>
        <button v-if="editable" class="button ghost" @click="remove(viewing)"><Trash2 :size="15" /> Delete</button>
        <span class="spacer" />
        <a v-if="urls[viewing.id]" class="button" :href="urls[viewing.id]" :download="viewing.name" target="_blank" rel="noopener"><Download :size="15" /> Download</a>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.head {
  margin-bottom: 8px;
}

.head h3 {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}

.file {
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 0;
  text-align: left;
  overflow: hidden;
}

.file img,
.doc {
  width: 100%;
  height: 96px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--surface-2);
}

.doc {
  display: grid;
  place-items: center;
  color: var(--muted);
}

.fname {
  font-size: 0.88rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.big {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
  border-radius: var(--radius-sm);
}
</style>
