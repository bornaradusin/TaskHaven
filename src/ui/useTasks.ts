// A project's tasks as a view shows them: filtered by its options.
import { computed, type Ref } from 'vue'
import { compileFilter } from '@/logic/filter'
import { store } from '@/state'
import type { Task } from '@/model'
import type { ViewOptions } from './ViewFilter.vue'

export function filtered(tasks: Ref<Task[]>, options: Ref<ViewOptions>, keepDone = false) {
  return computed(() => {
    let list = tasks.value
    if (!options.value.showDone && !keepDone) list = list.filter((t) => !t.done)
    const words = options.value.search.trim().toLowerCase()
    if (words) list = list.filter((t) => t.title.toLowerCase().includes(words) || t.description.toLowerCase().includes(words))
    if (options.value.query.trim()) {
      try {
        const test = compileFilter(options.value.query, { projects: store.projects, people: Object.values(store.people), now: new Date() })
        list = list.filter(test)
      } catch {
        // a filter that can't be read filters nothing (it's shown as an error)
      }
    }
    return list
  })
}
