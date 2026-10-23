<script setup lang="ts">
// Text with a little formatting (for descriptions and comments): shown as it looks, edited in
// place with a small toolbar. Checklist items can be ticked without editing.
import { computed, nextTick, ref, watch } from 'vue'
import { Bold, Code, Heading2, Italic, Link, List, ListChecks, ListOrdered, Quote, Strikethrough } from 'lucide-vue-next'
import { isEmpty, sanitize } from './html'

const props = withDefaults(
  defineProps<{ modelValue: string; editable?: boolean; placeholder?: string; startEditing?: boolean; saveLabel?: string; keepOpen?: boolean }>(),
  { editable: true, placeholder: 'Add a description…', startEditing: false, saveLabel: 'Save', keepOpen: false },
)
const emit = defineEmits<{ 'update:modelValue': [html: string]; save: [html: string]; cancel: [] }>()

const editing = ref(props.startEditing)
const area = ref<HTMLDivElement | null>(null)
const safe = computed(() => sanitize(props.modelValue))

watch(
  () => props.startEditing,
  (v) => (editing.value = v),
)

async function edit() {
  if (!props.editable) return
  editing.value = true
  await nextTick()
  if (area.value) {
    area.value.innerHTML = safe.value
    area.value.focus()
    const range = document.createRange()
    range.selectNodeContents(area.value)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}

watch(editing, async (v) => {
  if (v) {
    await nextTick()
    if (area.value && !area.value.innerHTML) area.value.innerHTML = safe.value
  }
})

function html(): string {
  const value = sanitize(area.value?.innerHTML ?? '')
  return isEmpty(value) ? '' : value
}

function save() {
  const value = html()
  emit('update:modelValue', value)
  emit('save', value)
  if (props.keepOpen) {
    if (area.value) area.value.innerHTML = ''
  } else editing.value = false
}

function cancel() {
  editing.value = props.keepOpen
  if (area.value) area.value.innerHTML = props.keepOpen ? '' : safe.value
  emit('cancel')
}

function run(command: string, value?: string) {
  area.value?.focus()
  document.execCommand(command, false, value)
}

function checklist() {
  const before = new Set(area.value?.querySelectorAll('ul') ?? [])
  run('insertUnorderedList')
  // the list just made (or the one the caret is in)
  const sel = window.getSelection()
  const at = sel?.anchorNode
  const fromCaret = (at instanceof Element ? at : at?.parentElement)?.closest('ul')
  const ul = [...(area.value?.querySelectorAll('ul') ?? [])].find((u) => !before.has(u)) ?? (fromCaret && area.value?.contains(fromCaret) ? fromCaret : null)
  if (!ul) return
  ul.setAttribute('data-type', 'taskList')
  for (const li of ul.querySelectorAll(':scope > li')) if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false')
}

function link() {
  const url = prompt('Link to (https://…)')
  if (url && /^(https?:|mailto:)/i.test(url.trim())) run('createLink', url.trim())
}

function key(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    save()
  }
  if (e.key === 'Escape') cancel()
  // a new checklist item starts unticked
  if (e.key === 'Enter') {
    setTimeout(() => {
      for (const li of area.value?.querySelectorAll('ul[data-type="taskList"] > li:not([data-checked])') ?? []) li.setAttribute('data-checked', 'false')
    })
  }
}

/** Ticks a checklist item in the shown text. */
function tick(e: MouseEvent) {
  const li = (e.target as HTMLElement).closest('ul[data-type="taskList"] > li') as HTMLElement | null
  if (!li || !props.editable) return
  const rect = li.getBoundingClientRect()
  // only the box at its start
  if (e.clientX > rect.left + 26) return
  e.stopPropagation()
  const items = [...(e.currentTarget as HTMLElement).querySelectorAll('ul[data-type="taskList"] > li')]
  const index = items.indexOf(li)
  const doc = new DOMParser().parseFromString(`<body>${safe.value}</body>`, 'text/html')
  const target = doc.querySelectorAll('ul[data-type="taskList"] > li')[index]
  if (!target) return
  target.setAttribute('data-checked', target.getAttribute('data-checked') === 'true' ? 'false' : 'true')
  const value = sanitize(doc.body.innerHTML)
  emit('update:modelValue', value)
  emit('save', value)
}

function clicked(e: MouseEvent) {
  // links open; anything else starts editing
  if ((e.target as HTMLElement).closest('a')) return
  void edit()
}

defineExpose({ edit })
</script>

<template>
  <div class="editor" :class="{ editing }">
    <template v-if="editing">
      <div class="toolbar" @mousedown.prevent>
        <button class="tool" title="Bold" @click="run('bold')"><Bold :size="16" /></button>
        <button class="tool" title="Italic" @click="run('italic')"><Italic :size="16" /></button>
        <button class="tool" title="Strikethrough" @click="run('strikeThrough')"><Strikethrough :size="16" /></button>
        <button class="tool" title="Heading" @click="run('formatBlock', 'h3')"><Heading2 :size="16" /></button>
        <span class="gap" />
        <button class="tool" title="List" @click="run('insertUnorderedList')"><List :size="16" /></button>
        <button class="tool" title="Numbered list" @click="run('insertOrderedList')"><ListOrdered :size="16" /></button>
        <button class="tool" title="Checklist" @click="checklist"><ListChecks :size="16" /></button>
        <span class="gap" />
        <button class="tool" title="Quote" @click="run('formatBlock', 'blockquote')"><Quote :size="16" /></button>
        <button class="tool" title="Code" @click="run('formatBlock', 'pre')"><Code :size="16" /></button>
        <button class="tool" title="Link" @click="link"><Link :size="16" /></button>
      </div>
      <div ref="area" class="area prose" contenteditable="true" :data-placeholder="placeholder" @keydown="key" />
      <div class="actions">
        <button class="button small" @click="save">{{ saveLabel }}</button>
        <button v-if="!keepOpen" class="button ghost small" @click="cancel">Cancel</button>
      </div>
    </template>
    <div v-else-if="!isEmpty(safe)" class="shown prose" :class="{ editable }" @click.capture="tick" @click="clicked" v-html="safe" />
    <button v-else-if="editable" class="placeholder" @click="edit">{{ placeholder }}</button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: var(--surface-2);
}

.tool {
  display: grid;
  place-items: center;
  width: 32px;
  height: 30px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
}

.tool:hover {
  background: var(--surface);
  color: var(--text);
}

.gap {
  width: 8px;
}

.area {
  min-height: 110px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  background: var(--surface);
  outline: none;
}

.area:focus {
  border-color: var(--brand);
}

.area:empty::before {
  content: attr(data-placeholder);
  color: var(--faint);
}

.actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.shown.editable {
  cursor: text;
  border-radius: var(--radius-sm);
  padding: 4px 6px;
  margin: -4px -6px;
}

.shown.editable:hover {
  background: var(--hover);
}

.placeholder {
  width: 100%;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--faint);
  text-align: left;
}

.placeholder:hover {
  border-color: var(--faint);
  color: var(--muted);
}
</style>
