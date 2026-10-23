// Little choices kept on this device (which columns, show done tasks …), per screen.
import { ref, watch, type Ref } from 'vue'

const plainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function remembered<T>(key: string, initial: T): Ref<T> {
  let start = initial
  try {
    const saved = localStorage.getItem(`taskhaven.${key}`)
    if (saved !== null) {
      const parsed: unknown = JSON.parse(saved)
      // new options get their defaults
      start = (plainObject(initial) && plainObject(parsed) ? { ...initial, ...parsed } : parsed) as T
    }
  } catch {
    // nothing kept, or it can't be read
  }
  const value = ref(start) as Ref<T>
  watch(
    value,
    (v) => {
      try {
        localStorage.setItem(`taskhaven.${key}`, JSON.stringify(v))
      } catch {
        // private mode
      }
    },
    { deep: true },
  )
  return value
}
