import * as sdk from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const { atom, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, host, usePluginI18n, useValue } = sdk
const ID = 'image-annotator'
const MAX_PNG_BYTES = 16 * 1024 * 1024
const locales = {
  en: {
    open: 'Annotate', title: 'Annotate image', color: 'Ink color', width: 'Width', undo: 'Undo stroke',
    cancel: 'Cancel', add: 'Attach to reply', drawing: 'Image and annotation canvas', loading: 'Loading image…',
    description: 'Draw on a copy. Attaching it will not send your reply.', attaching: 'Preparing attachment…',
    noDraft: 'The original reply draft is unavailable.', sourceError: 'This image could not be read or decoded.',
    exportError: 'Could not prepare a PNG within the 16 MiB attachment limit.',
    attachError: 'Could not attach the PNG to the original reply draft. Nothing was sent.'
  },
  fr: {
    open: 'Annoter', title: 'Annoter l’image', color: 'Couleur', width: 'Épaisseur', undo: 'Annuler le trait',
    cancel: 'Annuler', add: 'Joindre à la réponse', drawing: 'Image à annoter au feutre', loading: 'Chargement de l’image…',
    description: 'Dessinez sur une copie. La joindre n’enverra pas votre réponse.', attaching: 'Préparation de la pièce jointe…',
    noDraft: 'Le brouillon de la réponse d’origine est indisponible.', sourceError: 'Impossible de lire ou de décoder cette image.',
    exportError: 'Impossible de préparer un PNG dans la limite de 16 Mio.',
    attachError: 'Impossible de joindre le PNG au brouillon d’origine. Rien n’a été envoyé.'
  }
}

function fit(width, height) {
  const scale = Math.min(1, 4096 / Math.max(width, height), Math.sqrt(12_000_000 / (width * height)))
  return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))]
}

function mark(ctx, stroke, from, to) {
  ctx.beginPath()
  if (!to) {
    ctx.fillStyle = stroke.color
    ctx.arc(...from, stroke.width / 2, 0, 2 * Math.PI)
    ctx.fill()
  } else {
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.moveTo(...from)
    ctx.lineTo(...to)
    ctx.stroke()
  }
}

function createEditor(draft, brush, dismiss) {
  const state = atom({ size: null, status: 'loading', busy: false, dragging: false, canUndo: false })
  const update = changes => state.set({ ...state.get(), ...changes })
  const strokes = []
  let bitmap, canvas, pen, active
  let closed = false

  function repaint() {
    if (!pen || !bitmap) return
    pen.clearRect(0, 0, canvas.width, canvas.height)
    pen.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const stroke of strokes) {
      mark(pen, stroke, stroke.points[0])
      for (let i = 1; i < stroke.points.length; i++) mark(pen, stroke, stroke.points[i - 1], stroke.points[i])
    }
  }

  function position(event, box = canvas.getBoundingClientRect()) {
    return [(event.clientX - box.left) * canvas.width / box.width, (event.clientY - box.top) * canvas.height / box.height]
  }

  function extend(event) {
    if (active?.id !== event.pointerId || !pen) return
    const next = position(event)
    mark(pen, active, active.points.at(-1), next)
    active.points.push(next)
  }

  function end(event, keep) {
    if (active?.id !== event.pointerId) return
    if (keep) {
      extend(event)
      strokes.push(active)
    }
    active = null
    if (!keep) repaint()
    update({ dragging: false, canUndo: strokes.length > 0 })
  }

  return {
    state,
    async load(readImage) {
      try {
        const image = await readImage()
        if (closed) return
        if (!image) throw new Error('Image is unavailable')
        const decoded = await createImageBitmap(image)
        if (closed) { decoded.close(); return }
        bitmap = decoded
        update({ size: fit(bitmap.width, bitmap.height), status: null })
      } catch {
        if (!closed) update({ status: 'sourceError' })
      }
    },
    bindCanvas(node) {
      canvas = node
      pen = node?.getContext('2d')
      if (node && !pen) update({ status: 'sourceError' })
      repaint()
    },
    start(event) {
      if (closed || !pen || active || state.get().busy || event.button !== 0) return
      const box = canvas.getBoundingClientRect()
      if (!box.width || !box.height) return
      canvas.setPointerCapture(event.pointerId)
      active = { id: event.pointerId, color: brush.color, width: brush.width * canvas.width / box.width, points: [position(event, box)] }
      mark(pen, active, active.points[0])
      update({ dragging: true })
    },
    extend,
    finish: event => end(event, true),
    abort: event => end(event, false),
    undo() {
      if (closed || active || state.get().busy) return
      strokes.pop()
      repaint()
      update({ canUndo: strokes.length > 0 })
    },
    cancel() {
      if (!state.get().busy) dismiss()
    },
    async attach() {
      if (closed || !canvas || active || !strokes.length || state.get().busy) return
      update({ busy: true, status: 'attaching' })
      let png
      try { png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')) } catch { /* invalid canvas */ }
      if (closed) return
      if (!png?.size || png.size > MAX_PNG_BYTES || png.type !== 'image/png') {
        update({ busy: false, status: 'exportError' })
        return
      }
      // Pass the opaque draft from this exact SDK action, never recapture focus.
      let attached = false
      try { attached = await host.composer.attachImage(draft, png, { filename: 'annotated-image.png' }) } catch { /* fail closed */ }
      if (closed) return
      if (attached) dismiss()
      else update({ busy: false, status: 'attachError' })
    },
    dispose() {
      closed = true
      bitmap?.close()
      bitmap = canvas = pen = active = null
      strokes.length = 0
    }
  }
}

function Editor({ editor, brush, t }) {
  const { size, status, busy, dragging, canUndo } = useValue(editor.state)
  const blocked = !canUndo || busy || dragging
  const [width, height] = size ?? []
  return jsx(Dialog, {
    open: true, onOpenChange: open => { if (!open) editor.cancel() },
    children: jsxs(DialogContent, {
      showCloseButton: false,
      style: { width: 'min(94vw, 850px)', maxWidth: 'none' },
      onEscapeKeyDown: event => { if (busy) event.preventDefault() },
      onInteractOutside: event => event.preventDefault(),
      children: [
        jsx(DialogTitle, { children: t('title') }),
        jsx(DialogDescription, { children: t('description') }),
        jsxs('div', {
          style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px' },
          children: [
            jsxs('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [
              t('color'), jsx('input', { type: 'color', defaultValue: brush.color, disabled: busy,
                style: { width: 38, height: 28 }, onChange: event => { brush.color = event.currentTarget.value } })
            ] }),
            jsxs('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [
              t('width'), jsx('input', { type: 'range', min: 2, max: 30, step: 1, defaultValue: brush.width, disabled: busy,
                style: { width: 100, accentColor: 'var(--dt-primary)' }, onChange: event => { brush.width = event.currentTarget.valueAsNumber } })
            ] }),
            jsx(Button, { type: 'button', variant: 'outline', disabled: blocked, onClick: editor.undo, children: t('undo') })
          ]
        }),
        size && jsx('canvas', {
          ref: editor.bindCanvas, width, height, 'aria-label': t('drawing'),
          style: {
            display: 'block', margin: '0 auto', width: `min(100%, ${width * 3}px, ${44 * width / height}vh)`, height: 'auto',
            touchAction: 'none', userSelect: 'none', cursor: busy ? 'wait' : 'crosshair'
          },
          onPointerDown: editor.start, onPointerMove: editor.extend, onPointerUp: editor.finish,
          onPointerCancel: editor.abort, onLostPointerCapture: editor.abort
        }),
        jsx('div', { role: 'status', 'aria-live': 'polite', children: status ? t(status) : '' }),
        jsxs(DialogFooter, { children: [
          jsx(Button, { type: 'button', variant: 'outline', disabled: busy, children: t('cancel'), onClick: editor.cancel }),
          jsx(Button, { type: 'button', disabled: blocked, children: t('add'), onClick: editor.attach })
        ] })
      ]
    })
  })
}

export default {
  id: ID,
  name: 'Image Annotator',
  description: 'Draw on a chat image and stage a PNG on its original reply draft.',
  defaultEnabled: false,
  register(ctx) {
    // Namespace import permits a clean no-op on hosts missing the new export.
    const area = sdk.IMAGE_LIGHTBOX_ACTIONS_AREA
    if (!area || typeof host.composer?.attachImage !== 'function') return
    const selected = atom(null)
    const brush = { color: '#ef4444', width: 6 }
    let disposed = false
    function dismiss() {
      selected.get()?.dispose()
      selected.set(null)
    }
    ctx.onDispose(() => { disposed = true; dismiss() })
    ctx.i18n.register(locales)
    // The titlebar slot is window-scoped, so split composer tiles do not each
    // instantiate a modal. With no editor open this contribution draws nothing.
    function EditorHost() {
      const editor = useValue(selected)
      const t = usePluginI18n(ID)
      return editor ? jsx(Editor, { editor, brush, t }) : null
    }
    ctx.register({ id: 'editor', area: 'titleBar.center', render: () => jsx(EditorHost, {}) })
    function onSelect({ draft, readImage }) {
      if (disposed || selected.get()) return
      if (!draft) {
        host.notify({ kind: 'warning', message: ctx.i18n.t('noDraft') })
        return
      }
      const editor = createEditor(draft, brush, dismiss)
      selected.set(editor)
      return editor.load(readImage)
    }
    let removeAction
    function registerAction() {
      removeAction?.()
      removeAction = ctx.register({ id: 'annotate', area, data: { label: ctx.i18n.t('open'), onSelect } })
    }
    registerAction()
    ctx.i18n.onLocaleChange(registerAction)
  }
}
