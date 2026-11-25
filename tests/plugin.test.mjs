import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

// Stub only the host boundary. Register and run the real disk plugin; real canvas,
// Radix focus and native attachment staging are exercised by the Desktop spec.
const jsx = (type, props) => ({ type, props })
const sdk = {
  IMAGE_LIGHTBOX_ACTIONS_AREA: 'imageLightbox.actions',
  Button: 'Button', Dialog: 'Dialog', DialogContent: 'DialogContent',
  DialogDescription: 'DialogDescription', DialogFooter: 'DialogFooter', DialogTitle: 'DialogTitle',
  atom(value) { return { get: () => value, set: next => { value = next } } },
  useValue: store => store.get(),
  usePluginI18n: () => key => key,
  host: { composer: {}, notify() {} }
}
const pluginUrl = new URL('../desktop/plugin.js', import.meta.url)
let load = 0
async function loadPlugin(host = sdk.host, withLightbox = true) {
  globalThis.__annotatorTestSdk = { ...sdk, host }
  globalThis.__annotatorTestJsx = jsx
  if (!withLightbox) delete globalThis.__annotatorTestSdk.IMAGE_LIGHTBOX_ACTIONS_AREA
  const toModule = source => `data:text/javascript,${encodeURIComponent(source)}`
  const resolve = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@hermes/plugin-sdk') {
      const exports = Object.keys(globalThis.__annotatorTestSdk)
        .map(key => `export const ${key} = globalThis.__annotatorTestSdk.${key};`).join('\n')
      return { url: toModule(`// ${load}\n${exports}`), shortCircuit: true }
    }
    if (specifier === 'react/jsx-runtime') {
      return { url: toModule('export const jsx = globalThis.__annotatorTestJsx; export const jsxs = jsx;'), shortCircuit: true }
    }
    const resolution = next(specifier, context)
    // Desktop loads this disk entry as ESM regardless of nearby package.json.
    return resolution.url.startsWith(`${pluginUrl.href}?`) ? { ...resolution, format: 'module' } : resolution
  } })
  try { return (await import(`${pluginUrl.href}?case=${++load}`)).default }
  finally {
    resolve.deregister()
    delete globalThis.__annotatorTestSdk
    delete globalThis.__annotatorTestJsx
  }
}

async function harness({ attachImage = async () => true, withLightbox = true } = {}) {
  const notices = []
  const contributions = new Map()
  const cleanups = []
  const plugin = await loadPlugin({ composer: { attachImage }, notify: notice => notices.push(notice) }, withLightbox)
  plugin.register({
    register(contribution) {
      contributions.set(contribution.area, contribution)
      return () => contributions.delete(contribution.area)
    },
    onDispose: fn => cleanups.push(fn),
    i18n: { register() {}, t: key => key, onLocaleChange() {} }
  })
  const render = () => {
    let node = [...contributions.values()].find(entry => entry.render)?.render()
    while (typeof node?.type === 'function') node = node.type(node.props)
    return node
  }
  return { plugin, contributions, notices, render, dispose: () => cleanups.forEach(fn => fn()),
    select: context => contributions.get(sdk.IMAGE_LIGHTBOX_ACTIONS_AREA).data.onSelect(context) }
}

function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate))
  if (!node?.props) return []
  return [...(predicate(node) ? [node] : []), ...nodes(node.props.children, predicate)]
}
const hasText = (root, key) => nodes(root, el => el.props.children === key).length > 0
const image = new Blob(['selected'], { type: 'image/png' })

// Avoid replacing anything in browser runtime; the Node-only stand-in models
// resource ownership and decode failure, not real pixels.
function useDecoder(t, fn) {
  const previous = globalThis.createImageBitmap
  globalThis.createImageBitmap = fn
  t.after(() => { if (previous) globalThis.createImageBitmap = previous; else delete globalThis.createImageBitmap })
}

test('registers opt-in action only with both SDK seams', async () => {
  const supported = await harness()
  assert.equal(supported.plugin.defaultEnabled, false)
  assert.equal(supported.contributions.get(sdk.IMAGE_LIGHTBOX_ACTIONS_AREA).data.label, 'open')
  assert.equal((await harness({ withLightbox: false })).contributions.size, 0)
  assert.equal((await harness({ attachImage: null })).contributions.size, 0)
})

test('does not read pixels without the originating draft', async () => {
  const h = await harness()
  await h.select({ draft: null, readImage: () => assert.fail('unneeded pixel read') })
  assert.equal(h.render(), null)
  assert.equal(h.notices.length, 1)
})

test('decode failure stays inside the plugin dialog and does not attach', async t => {
  useDecoder(t, async () => { throw new Error('invalid image') })
  const h = await harness({ attachImage: () => assert.fail('unexpected attachment') })
  await h.select({ draft: Object.freeze({}), readImage: async () => image })
  assert.equal(hasText(h.render(), 'sourceError'), true)
})

test('closing during a pending decode releases the bitmap and does not reopen the editor', async t => {
  let complete
  const decoding = new Promise(resolve => { complete = resolve })
  useDecoder(t, () => decoding)
  const h = await harness()
  const pending = h.select({ draft: Object.freeze({}), readImage: async () => image })
  await Promise.resolve()
  h.render().props.onOpenChange(false)
  let closed = false
  complete({ width: 160, height: 100, close() { closed = true } })
  await pending
  assert.equal(closed, true)
  assert.equal(h.render(), null)
})

function button(h, label) {
  return nodes(h.render(), node => node.type === 'Button' && node.props.children === label)[0].props
}

async function drawDot(t, h, draft) {
  useDecoder(t, async () => ({ width: 160, height: 100, close() {} }))
  let reads = 0
  await h.select({ draft, readImage: () => { reads++; return Promise.resolve(image) } })
  assert.equal(reads, 1)
  const control = nodes(h.render(), el => el.type === 'canvas')[0].props
  const png = new Blob(['canvas output'], { type: 'image/png' })
  control.ref({
    width: 160, height: 100,
    getBoundingClientRect: () => ({ width: 160, height: 100, left: 0, top: 0 }),
    setPointerCapture() {},
    getContext: () => ({ clearRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {} }),
    toBlob(callback, type) { assert.equal(type, 'image/png'); callback(png) }
  })
  const dot = { pointerId: 1, button: 0, clientX: 12, clientY: 26 }
  control.onPointerDown(dot)
  control.onPointerUp(dot)
  return png
}

test('submits one PNG with the exact originating draft handle and closes only on true', async t => {
  let complete
  const ack = new Promise(resolve => { complete = resolve })
  const calls = []
  const h = await harness({ attachImage: (...args) => { calls.push(args); return ack } })
  const draft = Object.freeze({})
  const png = await drawDot(t, h, draft)
  const attach = button(h, 'add').onClick
  const pending = attach()
  await attach() // A rapid second click must not stage a second file.
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], draft)
  assert.equal(calls[0][1], png)
  assert.deepEqual(calls[0][2], { filename: 'annotated-image.png' })
  complete(true)
  await pending
  assert.equal(h.render(), null)
})

test('a non-true attachment result does not retarget or report success', async t => {
  let calls = 0
  const draft = Object.freeze({})
  const h = await harness({ attachImage: address => {
    assert.equal(address, draft)
    calls++
    return calls === 1 ? false : { unexpected: 'non-boolean result' }
  } })
  await drawDot(t, h, draft)
  await button(h, 'add').onClick()
  assert.equal(hasText(h.render(), 'attachError'), true)
  assert.equal(calls, 1)
  await button(h, 'add').onClick()
  assert.equal(hasText(h.render(), 'attachError'), true)
  assert.equal(calls, 2)
})
