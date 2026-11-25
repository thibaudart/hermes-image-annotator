import fs from 'node:fs'
import path from 'node:path'

import { expect, type ElectronApplication, type Page, test } from '@playwright/test'

import {
  composer, coreAppEnv, createCoreSandbox, currentSessionId, launchCoreApp,
  recordWebSockets, send, waitForInteractive, writeProviderHome
} from './harness'
import { startScriptedProvider } from './provider'

// A fully decodable 160 × 100 fixture, not a real chat image.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAAsUlEQVR42u3RAQkAAAgEsY9kKxPazxoig0twy1TrcbEAsAALsAALsAALMGABFmABFmABFmDAAizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmABBizAAizAAizAAgxYgAVYgAVYgAUYsAuABViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEWYMACLMACLMACLMCABViABViABViAAQuwAOteC0rNEsC6dC/GAAAAAElFTkSuQmCC',
  'base64'
)

async function inspectPng(page: Page, bytes: Buffer) {
  return page.evaluate(async (data: number[]) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }))
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data]
      return { dimensions: [bitmap.width, bitmap.height], ink: pixel(80, 30), undone: pixel(80, 70), corner: pixel(0, 0) }
    } finally { bitmap.close() }
  }, [...bytes])
}

test('the opted-in unified plugin annotates and stages a PNG on the originating unsent draft', async () => {
  const packageRoot = process.env.IMAGE_ANNOTATOR_PACKAGE
  expect(packageRoot, 'set IMAGE_ANNOTATOR_PACKAGE to the unified package checkout').toBeTruthy()
  const sandbox = createCoreSandbox('image-annotator')
  const provider = await startScriptedProvider()
  let app: ElectronApplication | undefined
  try {
    const pkg = path.join(sandbox.hermesHome, 'plugins', 'image-annotator')
    fs.mkdirSync(path.join(pkg, 'desktop'), { recursive: true })
    for (const file of ['plugin.yaml', '__init__.py', 'desktop/plugin.js']) {
      fs.copyFileSync(path.join(packageRoot!, file), path.join(pkg, file))
    }
    const original = path.join(sandbox.root, 'annotation-source.png')
    fs.writeFileSync(original, PNG)
    writeProviderHome(sandbox.hermesHome, provider.url, 'display:\n  language: en\n', 'manual')
    const seed = 'U1-imageannotation'
    provider.script(seed, [{ text: [`MEDIA:${original}\n\nSeeded annotation image`] }])

    const desktop = await launchCoreApp(coreAppEnv(sandbox))
    app = desktop.app
    const { page } = desktop
    const ws = recordWebSockets(page)
    await waitForInteractive(app, page)
    const source = await inspectPng(page, PNG)
    expect(source.dimensions).toEqual([160, 100])
    const ink = [0, 255, 17, 255]
    expect(source.ink).not.toEqual(ink)

    const start = await page.evaluate(() => location.hash)
    // The per-half switches live in the package detail, not on the catalog card.
    await page.evaluate(() => { location.hash = '#/capabilities?tab=plugins&plugin=image-annotator' })
    const copied = path.join(sandbox.hermesHome, 'desktop-plugins', 'image-annotator', '.hermes-package.json')
    await expect.poll(() => fs.existsSync(copied), { timeout: 10_000 }).toBe(true)
    const toggle = page.getByRole('switch', { name: /Desktop: (?:Image Annotator|image-annotator)$/i })
    await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await page.evaluate(hash => { location.hash = hash || '#/' }, start)
    await waitForInteractive(app, page)

    await send(page, seed, 'Enter', ws)
    const transcript = page.locator('[data-slot="aui_thread-viewport"]')
    await expect(transcript.getByText('Seeded annotation image')).toBeVisible()
    await expect.poll(() => provider.completions.some(item => item.marker === seed && item.finished)).toBe(true)
    const session = await currentSessionId(page)
    expect(session).not.toBe('')
    const prompts = () => ws.sent.filter(frame => frame.method === 'prompt.submit')
    expect(prompts()).toHaveLength(1)
    const draft = 'Keep this unsent draft exactly as typed'
    const editor = composer(page)
    await editor.fill(draft)
    const attachment = page.locator('[data-slot="composer-attachments"]')
      .getByRole('button', { name: /^Preview.*annotated-image_.*\.png$/i })
    const staging = path.join(sandbox.userDataDir, 'composer-images')
    const staged = () => fs.existsSync(staging) ? fs.readdirSync(staging) : []
    const lightbox = page.locator('[data-variant="media-lightbox"]')
    const dialog = page.getByRole('dialog', { name: 'Annotate image' })
    const canvas = dialog.locator('canvas')
    const add = dialog.getByRole('button', { name: 'Attach to reply', exact: true })
    const color = dialog.getByLabel('Ink color', { exact: true })
    const open = async () => {
      const original = transcript.getByRole('button', { name: 'Open image', exact: true })
      await original.click()
      await lightbox.getByRole('button', { name: 'Annotate', exact: true }).click({ timeout: 10_000 })
      await expect(dialog).toHaveCount(1)
      await expect(lightbox).toHaveCount(0)
      await expect(color).toBeFocused()
      await expect(canvas).toHaveAttribute('width', '160')
      await expect(canvas).toHaveAttribute('height', '100')
      await expect(add).toBeDisabled()
    }
    const stroke = async (y: number) => {
      const box = (await canvas.boundingBox())!
      await page.mouse.move(box.x + box.width * .25, box.y + box.height * y)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * .75, box.y + box.height * y, { steps: 10 })
      await page.mouse.up()
    }

    await open()
    await stroke(.3)
    await expect(add).toBeEnabled()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(staged()).toEqual([])
    await expect(attachment).toHaveCount(0)
    await expect(editor).toHaveText(draft)

    await open()
    await expect(color).toHaveValue('#ef4444')
    await color.fill('#00ff11')
    const width = dialog.getByLabel('Width', { exact: true })
    await expect(width).toHaveValue('6')
    await width.fill('14')
    await stroke(.3)
    await color.fill('#ff00ba')
    await stroke(.7)
    await dialog.getByRole('button', { name: 'Undo stroke' }).click()
    await add.click()
    await expect(dialog).toHaveCount(0, { timeout: 10_000 })
    await expect(attachment).toBeVisible()
    const files = staged()
    expect(files).toHaveLength(1)
    const result = fs.readFileSync(path.join(staging, files[0]!))
    expect(result.subarray(0, 8)).toEqual(PNG.subarray(0, 8))
    expect(await inspectPng(page, result)).toEqual({ ...source, ink })
    expect(fs.readFileSync(original)).toEqual(PNG)
    expect(await currentSessionId(page)).toBe(session)
    await expect(editor).toHaveText(draft)
    await expect(transcript.getByText(draft, { exact: true })).toHaveCount(0)
    expect(prompts()).toHaveLength(1)
    expect(provider.completions.filter(item => item.stream && item.marker === seed)).toHaveLength(1)
  } finally {
    await app?.close().catch(() => undefined)
    await provider.close()
    sandbox.cleanup()
  }
})
