<script setup lang="ts">
// A task's comments: everyone in the project sees them; one changes only one's own.
import { onUnmounted, ref, watch } from 'vue'
import { Pencil, Trash2 } from 'lucide-vue-next'
import Avatar from '../Avatar.vue'
import Editor from '../Editor.vue'
import { sanitize } from '../html'
import { relativeDay, formatTime } from '@/logic/dates'
import { addComment, attempt, deleteComment, personName, store, updateComment, watchComments } from '@/state'
import type { Comment, Task } from '@/model'

const props = defineProps<{ task: Task; editable: boolean }>()
const comments = ref<Comment[]>([])
const draft = ref('')
const editing = ref<string | null>(null)
let stop: (() => void) | null = null

watch(
  () => props.task.id,
  () => {
    stop?.()
    stop = store.backend ? watchComments(props.task.id, (c) => (comments.value = c)) : null
  },
  { immediate: true },
)
onUnmounted(() => stop?.())

async function send(html: string) {
  if (!html) return
  await attempt(() => addComment(props.task, html))
  draft.value = ''
}

async function save(c: Comment, html: string) {
  editing.value = null
  if (html && html !== c.text) await attempt(() => updateComment(props.task, c.id, html))
}

async function remove(c: Comment) {
  await attempt(() => deleteComment(props.task, c.id), 'Comment deleted.')
}

/** Changed after it was written (not just the moment it was saved). */
const edited = (c: Comment) => Date.parse(c.updated) - Date.parse(c.created) > 5000

const when = (iso: string) => {
  const d = new Date(iso)
  return `${relativeDay(d)[0].toUpperCase()}${relativeDay(d).slice(1)} at ${formatTime(d)}`
}
</script>

<template>
  <section class="comments">
    <h3>Comments</h3>
    <div v-for="c in comments" :key="c.id" class="comment">
      <Avatar :id="c.authorId" :size="32" />
      <div class="bubble">
        <div class="who">
          <b>{{ personName(c.authorId) }}</b>
          <span class="muted small">{{ when(c.created) }}{{ edited(c) ? ' · edited' : '' }}</span>
          <span class="spacer" />
          <template v-if="c.authorId === store.user?.id && editable && editing !== c.id">
            <button class="icon-button small" aria-label="Edit comment" @click="editing = c.id"><Pencil :size="14" /></button>
            <button class="icon-button small" aria-label="Delete comment" @click="remove(c)"><Trash2 :size="14" /></button>
          </template>
        </div>
        <Editor v-if="editing === c.id" :model-value="c.text" start-editing @save="(h) => save(c, h)" @cancel="editing = null" />
        <div v-else class="prose" v-html="sanitize(c.text)" />
      </div>
    </div>
    <p v-if="!comments.length" class="muted small">No comments yet.</p>
    <div v-if="editable" class="new">
      <Avatar v-if="store.user" :id="store.user.id" :size="32" />
      <Editor v-model="draft" class="grow" placeholder="Write a comment…" start-editing keep-open save-label="Comment" @save="send" />
    </div>
  </section>
</template>

<style scoped>
.comment,
.new {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.bubble,
.grow {
  flex: 1;
  min-width: 0;
}

.who {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.new :deep(.area) {
  min-height: 70px;
}
</style>
