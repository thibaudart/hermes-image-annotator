const VIEWER = '[data-variant="media-lightbox"][data-state="open"]'
const THREAD = '[data-slot="aui_thread-viewport"]'

const copy = {
  en: {
    open: 'Annotate', title: 'Annotate image', color: 'Ink color', width: 'Width', undo: 'Undo stroke',
    cancel: 'Close', add: 'Save PNG', loading: 'Loading image…', drawing: 'Image and annotation canvas',
    sourceError: 'This image cannot be edited here. The source may block image export.',
    exportError: 'Could not prepare a PNG.'
  },
  fr: {
    open: 'Annoter', title: 'Annoter l’image', color: 'Couleur', width: 'Épaisseur', undo: 'Annuler le trait',
    cancel: 'Fermer', add: 'Enregistrer le PNG', loading: 'Chargement de l’image…', drawing: 'Image à annoter au feutre',
    sourceError: 'Impossible d’annoter cette image ici. Sa source peut bloquer l’export.',
    exportError: 'Impossible de préparer le PNG.'
  }
}

const css = `
  .hia-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:34px;
    padding:0 12px; border:1px solid var(--dt-border); border-radius:8px; white-space:nowrap;
    background:var(--background); color:var(--foreground); font:inherit; font-size:13px; line-height:1.2; cursor:pointer; }
  .hia-btn:hover:not(:disabled) { background:var(--dt-accent); color:var(--dt-accent-foreground); }
  .hia-btn:disabled { opacity:.55; cursor:default; }
  .hia-btn:focus-visible, [data-image-annotator] input:focus-visible { outline:2px solid var(--dt-ring); outline-offset:2px; }
  .hia-open { position:absolute; z-index:2; left:50%; bottom:calc(100% + 12px); transform:translateX(-50%); box-shadow:var(--shadow-md); }
  dialog[data-image-annotator] { position:fixed; inset:0; margin:auto; width:min(880px, calc(100vw - 28px));
    height:min(790px, calc(100vh - 34px)); max-width:none; max-height:none; padding:0; overflow:auto;
    background:var(--background); color:var(--foreground); border:1px solid var(--dt-border); border-radius:14px;
    box-shadow:var(--shadow-lg); pointer-events:auto; }
  dialog[data-image-annotator][open] { display:grid; grid-template-rows:auto minmax(80px,1fr) auto; }
  dialog[data-image-annotator]::backdrop { background:color-mix(in srgb, var(--background) 74%, transparent); backdrop-filter:blur(5px); }
  .hia-header, .hia-footer, .hia-controls { display:flex; align-items:center; flex-wrap:wrap; gap:8px 12px; }
  .hia-header { padding:11px 14px; border-bottom:1px solid var(--dt-border); justify-content:space-between; }
  .hia-title { font-size:14px; font-weight:650; margin:0; }
  .hia-controls label { display:inline-flex; align-items:center; gap:7px; font-size:12px; color:var(--dt-muted-foreground); }
  .hia-controls input[type=color] { width:36px; height:30px; padding:2px; border:1px solid var(--dt-border); border-radius:6px; cursor:pointer; }
  .hia-controls input[type=range] { width:74px; accent-color:var(--dt-primary); }
  .hia-stage { display:grid; place-items:center; min-width:0; min-height:0; overflow:hidden; padding:12px;
    background:color-mix(in srgb, var(--foreground) 4%, var(--background)); }
  .hia-stage canvas:not([hidden]) { display:block; max-width:none; max-height:none; border-radius:2px; touch-action:none;
    user-select:none; cursor:crosshair; box-shadow:var(--shadow-sm); }
  .hia-footer { min-height:54px; padding:9px 14px; border-top:1px solid var(--dt-border); justify-content:flex-end; }
  .hia-status { color:var(--dt-muted-foreground); flex:1 1 180px; font-size:12px; }
  .hia-primary:not(:disabled) { background:var(--dt-primary); color:var(--dt-primary-foreground); border-color:var(--dt-primary); }
  .hia-primary:hover:not(:disabled) { background:color-mix(in srgb, var(--dt-primary) 90%, var(--background)); color:var(--dt-primary-foreground); }
`

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function button(text, className = '') {
  const node = element('button', `hia-btn ${className}`, text)
  node.type = 'button'
  return node
}

async function baseBitmap(image) {
  await image.decode()
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('No image dimensions')
  const w = image.naturalWidth
  const h = image.naturalHeight
  const scale = Math.min(1, 4096 / Math.max(w, h), Math.sqrt(12_000_000 / (w * h)))
  const base = document.createElement('canvas')
  base.width = Math.max(1, Math.round(w * scale))
  base.height = Math.max(1, Math.round(h * scale))
  const context = base.getContext('2d')
  context.drawImage(image, 0, 0, base.width, base.height)
  try {
    context.getImageData(0, 0, 1, 1)
  } catch (error) {
    const url = image.currentSrc || image.src
    if (error.name !== 'SecurityError' || !/^https?:\/\//i.test(url)) throw error
    // Only the already displayed URL, no credentials or referrer. No proxy.
    const readable = new Image()
    readable.crossOrigin = 'anonymous'
    readable.referrerPolicy = 'no-referrer'
    readable.src = url
    await readable.decode()
    base.width = base.width // Clear the tainted backing bitmap, not just its pixels.
    context.drawImage(readable, 0, 0, base.width, base.height)
    context.getImageData(0, 0, 1, 1)
  }
  return base
}

function openEditor({ viewer, source, opener, t, previous, onClosed }) {
  const dialog = element('dialog')
  dialog.dataset.imageAnnotator = ''
  dialog.setAttribute('aria-label', t('title'))
  const header = element('div', 'hia-header')
  const tools = element('div', 'hia-controls')
  const color = element('input')
  color.type = 'color'
  color.value = previous.color
  const width = element('input')
  width.type = 'range'
  Object.assign(width, { min: 2, max: 30, step: 1, value: previous.width })
  const undo = button(t('undo'))
  undo.disabled = true
  for (const [text, input] of [[t('color'), color], [t('width'), width]]) {
    const label = element('label', '', text)
    label.append(input)
    tools.append(label)
  }
  tools.append(undo)
  header.append(element('h2', 'hia-title', t('title')), tools)
  const stage = element('div', 'hia-stage')
  const canvas = element('canvas')
  canvas.setAttribute('aria-label', t('drawing'))
  canvas.hidden = true
  stage.append(canvas)
  const footer = element('div', 'hia-footer')
  const status = element('div', 'hia-status', t('loading'))
  status.setAttribute('aria-live', 'polite')
  const cancel = button(t('cancel'))
  const add = button(t('add'), 'hia-primary')
  add.disabled = true
  footer.append(status, cancel, add)
  dialog.append(header, stage, footer)
  viewer.append(dialog)

  const lifetime = new AbortController()
  const { signal } = lifetime
  const strokes = []
  const context = canvas.getContext('2d')
  let base
  let active = null
  let adding = false
  const resize = new ResizeObserver(() => fit())
  const fit = () => {
    if (!base) return
    const ratio = Math.max(.01, Math.min((stage.clientWidth - 24) / base.width,
      (stage.clientHeight - 24) / base.height, 3))
    canvas.style.width = `${base.width * ratio}px`
    canvas.style.height = `${base.height * ratio}px`
  }
  const close = (restore = true) => {
    if (signal.aborted) return
    lifetime.abort()
    resize.disconnect()
    viewerLifetime.disconnect()
    if (dialog.open) dialog.close()
    dialog.remove()
    if (restore && opener.isConnected) opener.focus({ preventScroll: true })
    onClosed()
  }
  const viewerLifetime = new MutationObserver(() => {
    if (!dialog.isConnected || !viewer.matches(VIEWER)) close(false)
  })
  const controls = () => {
    undo.disabled = adding || !!active || !strokes.length
    add.disabled = adding || !!active || !strokes.length
    cancel.disabled = adding
  }
  dialog.showModal()
  viewerLifetime.observe(document.body, { subtree: true, childList: true })
  viewerLifetime.observe(viewer, { attributes: true, attributeFilter: ['data-state'] })
  cancel.focus()
  resize.observe(stage)
  cancel.addEventListener('click', () => close(), { signal })
  dialog.addEventListener('cancel', event => {
    event.preventDefault()
    if (!adding) close()
  }, { signal })
  // Radix also listens for Escape on the underlying viewer. Keep it open
  // when dismissing only the editor; let the next Escape belong to Hermes.
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !dialog.open || event.defaultPrevented) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!adding) close()
  }, { capture: true, signal })

  void baseBitmap(source).then(bitmap => {
    if (signal.aborted) return
    base = bitmap
    canvas.width = base.width
    canvas.height = base.height
    context.drawImage(base, 0, 0)
    canvas.hidden = false
    fit()
    status.textContent = ''
  }).catch(() => {
    if (!signal.aborted) status.textContent = t('sourceError')
  })

  function point(event) {
    const rect = canvas.getBoundingClientRect()
    return [(event.clientX - rect.left) * canvas.width / rect.width,
      (event.clientY - rect.top) * canvas.height / rect.height]
  }
  function brush(stroke, a, b) {
    context.beginPath()
    if (!b) {
      context.fillStyle = stroke.color
      context.arc(a[0], a[1], stroke.width / 2, 0, 2 * Math.PI)
      context.fill()
    } else {
      context.strokeStyle = stroke.color
      context.lineWidth = stroke.width
      context.lineCap = 'round'
      context.moveTo(...a)
      context.lineTo(...b)
      context.stroke()
    }
  }
  canvas.addEventListener('pointerdown', event => {
    if (!base || adding || active || event.button !== 0) return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    previous.color = color.value
    previous.width = width.value
    active = { id: event.pointerId, width: Number(width.value) * canvas.width / canvas.getBoundingClientRect().width,
      color: color.value, points: [point(event)] }
    brush(active, active.points[0])
    controls()
  }, { signal })
  const extend = event => {
    if (active?.id !== event.pointerId) return
    const samples = event.getCoalescedEvents?.()
    for (const sample of samples?.length ? samples : [event]) {
      const next = point(sample)
      brush(active, active.points.at(-1), next)
      active.points.push(next)
    }
  }
  canvas.addEventListener('pointermove', extend, { signal })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => {
      if (active?.id !== event.pointerId) return
      if (type === 'pointerup') extend(event)
      strokes.push(active)
      active = null
      controls()
    }, { signal })
  }
  undo.addEventListener('click', () => {
    strokes.pop()
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(base, 0, 0)
    for (const stroke of strokes) {
      brush(stroke, stroke.points[0])
      for (let i = 1; i < stroke.points.length; i++) brush(stroke, stroke.points[i - 1], stroke.points[i])
    }
    controls()
  }, { signal })

  add.addEventListener('click', async () => {
    if (adding || active || !strokes.length) return
    adding = true
    controls()
    status.textContent = ''
    try {
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (signal.aborted) return
      if (!png?.size) throw new Error(t('exportError'))
      // Export only. Do not use the async native paste path: it can stage
      // into a different chat if the main composer switches sessions.
      const url = URL.createObjectURL(png)
      const link = element('a')
      link.href = url
      link.download = 'annotation.png'
      link.hidden = true
      try {
        dialog.append(link)
        link.click()
      } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 30_000)
      }
    } catch {
      if (!signal.aborted) status.textContent = t('exportError')
    } finally {
      adding = false
      if (!signal.aborted) controls()
    }
  }, { signal })
  return close
}

export default {
  id: 'image-annotator',
  name: 'Image Annotator',
  description: 'Mark up chat images and save a PNG copy.',
  register(ctx) {
    ctx.i18n.register(copy)
    const t = key => ctx.i18n.t(key)
    const style = element('style', '', css)
    style.dataset.imageAnnotatorStyle = ''
    document.head.append(style)
    const previous = { color: '#ef4444', width: '6' }
    let pending = null
    let editor = null
    const buttons = new Set()

    ctx.addEventListener(document, 'click', event => {
      const buttonTarget = event.target instanceof Element ? event.target.closest('button') : null
      const thread = buttonTarget?.closest(THREAD)
      if (!thread || !buttonTarget.querySelector('img') || event.defaultPrevented || event.button !== 0) return
      pending?.()
      // A short, gesture-scoped observer picks up Hermes's own lightbox. Its
      // img has the real source, not necessarily the transcript thumbnail.
      const before = new Set(document.querySelectorAll(VIEWER))
      const stop = () => { observer.disconnect(); clearTimeout(timer); pending = null }
      const observer = new MutationObserver(() => {
        const viewer = [...document.querySelectorAll(VIEWER)].find(node => !before.has(node))
        const source = viewer?.querySelector('img')
        if (!viewer || !source || !thread.isConnected) return
        stop()
        for (const stale of buttons) if (!stale.isConnected) buttons.delete(stale)
        const open = button(t('open'), 'hia-open')
        buttons.add(open)
        viewer.append(open)
        open.addEventListener('click', () => {
          if (editor || !viewer.matches(VIEWER)) return
          editor = openEditor({ viewer, source, opener: open, t, previous, onClosed: () => { editor = null } })
        })
      })
      const timer = setTimeout(stop, 900)
      pending = stop
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
    }, true)
    ctx.onDispose(() => {
      pending?.()
      editor?.(false)
      for (const node of buttons) node.remove()
      style.remove()
    })
  }
}
