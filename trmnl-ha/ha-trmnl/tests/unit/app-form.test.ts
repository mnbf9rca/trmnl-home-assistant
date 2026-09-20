import { afterAll, beforeAll, beforeEach, expect, it } from 'bun:test'
import type { Schedule, TimestampPosition } from '../../types/domain.js'
import { buildSchedule } from '../helpers/schedule-fixtures.js'

interface FormApp {
  init(): Promise<void>
  updateScheduleFromForm(): Promise<void>
}
const globals = globalThis as unknown as {
  window: { app: FormApp }
  document: Document
  localStorage: Storage
}
const originals = {
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch'),
}
const inputs = new Map<string, unknown>()
let App: new () => FormApp
let app: FormApp
let schedule: Schedule
let saves: Schedule[]

beforeAll(async () => {
  globals.window = {
    location: { search: '' },
    addEventListener() {},
  } as unknown as typeof globals.window
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: () => null },
  })
  globals.document = {
    getElementById: (id: string) => inputs.get(id) ?? null,
    createElement: () => ({ value: '', dataset: {} }),
  } as unknown as Document
  // Browser modules are transpiled by Bun; tsconfig excludes html/js.
  const appModule = '../../html/js/app.js'
  await import(appModule)
  App = globals.window.app.constructor as new () => FormApp
})

beforeEach(async () => {
  inputs.clear()
  saves = []
  schedule = buildSchedule({
    dithering: { enabled: false, palette: 'gray-4' } as Schedule['dithering'],
  })
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      schedule = JSON.parse(init.body as string) as Schedule
      saves.push(schedule)
      return Response.json(schedule)
    }
    if (String(url).endsWith('/schedules')) return Response.json([schedule])
    if (String(url).endsWith('/presets')) return Response.json({})
    return Response.json([])
  }) as typeof fetch
  app = new App()
  globals.window.app = app
  await app.init()

})

afterAll(() => {
  for (const [name, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

for (const position of ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as TimestampPosition[]) {
  it(`round-trips the ${position} timestamp corner through the form`, async () => {
    const content = { innerHTML: '' }
    inputs.set('tabContent', content)
    inputs.set('s_timestamp', { checked: true })
    inputs.set('s_timestamp_position', { value: position })
    await app.updateScheduleFromForm()
    expect(saves).toHaveLength(1)
    expect(saves[0]!.timestampPosition).toBe(position)
    await app.init()
    const select = content.innerHTML.match(/<select[^>]*id="s_timestamp_position"[^>]*>([\s\S]*?)<\/select>/)?.[1]
    expect(select).toContain(`value="${position}" selected`)
  })
}

it('loads bottom-right for a schedule without a timestamp corner', async () => {
  const content = { innerHTML: '' }
  inputs.set('tabContent', content)
  await app.init()
  const select = content.innerHTML.match(/<select[^>]*id="s_timestamp_position"[^>]*>([\s\S]*?)<\/select>/)?.[1]
  expect(select).toContain('value="bottom-right" selected')
})
