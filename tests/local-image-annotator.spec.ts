import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { writeEnvFile, writeMockProviderConfig } from '../../../tests-js/scripts/mock-provider-config'
import { startMockServer } from '../../../tests-js/scripts/mock-server'
import { buildAppEnv, createSandbox, launchDesktop, waitForAppReady } from './fixtures'
import { RealSessionBuilder } from './real-session-builder'
import type { DownloadItem, Event as ElectronEvent, Session } from 'electron'
import { type ElectronApplication, expect, test } from './test'

const fixturePng = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAA30lEQVR42u3dwQ2AIBAAQTAWAx1iBXYI7diCuWhEMvP2dZsj+CL30hLr2oxAYARGYARGYARGYIERGIH53n7nozpOk5rQqIcNdkQjMAIjMNPeomP3N54V+5exwY5oBEZgBEZgBEZggREYgREYgREYgQVGYARGYARGYARGYIERGIERGIERGIEFRmAERmAERmAEFhiBERiBERiBERiBBUZgBEZgBEZgBBYYgREYgREYgRFYYCMQGIERmPSj94Njb9ligxEYgRFYYJaQe2mmYIMRGIERGIERGIEFRmAERmDedAFtjAtAGWDnoAAAAABJRU5ErkJggg=='

test('exports the rendered PNG without writing to the chat draft', async () => {
  test.setTimeout(120_000)
  const mock = await startMockServer()
  const sandbox = createSandbox('image-annotator')
  let app: ElectronApplication | undefined
  try {
    writeMockProviderConfig(sandbox.hermesHome, mock.url, undefined, 'agent:\n  image_input_mode: native')
    writeEnvFile(sandbox.hermesHome)
    const plugin = path.join(sandbox.hermesHome, 'desktop-plugins', 'image-annotator')
    fs.mkdirSync(path.dirname(plugin), { recursive: true })
    const original = path.join(sandbox.root, 'source.png')
    fs.writeFileSync(original, Buffer.from(fixturePng, 'base64'))
    const builder = await RealSessionBuilder.start(sandbox.hermesHome)
    let sessionId: string
    try {
      ;({ sessionId } = await builder.createSession({ title: 'Image annotation QA', turns: ['Image annotation QA'] }))
    } finally {
      await builder.close()
    }
    const db = new DatabaseSync(path.join(sandbox.hermesHome, 'state.db'))
    try {
      const result = db.prepare("UPDATE messages SET content = ? WHERE session_id = ? AND role = 'assistant'")
        .run(`Original image\n\nMEDIA:${original}`, sessionId)
      expect(result.changes).toBe(1)
    } finally {
      db.close()
    }
    const desktop = await launchDesktop(buildAppEnv(sandbox))
    app = desktop.app
    const { page } = desktop
    await waitForAppReady(desktop)
    if (process.env.IMAGE_ANNOTATOR_JS) {
      const stage = path.join(sandbox.hermesHome, 'annotation-stage')
      fs.mkdirSync(stage)
      fs.copyFileSync(process.env.IMAGE_ANNOTATOR_JS, path.join(stage, 'plugin.js'))
      fs.renameSync(stage, plugin)
      await expect(page.locator('style[data-image-annotator-style]')).toHaveCount(1, { timeout: 15_000 })
    }
    await page.locator('[data-slot="sidebar"] button').filter({ hasText: 'Image annotation QA' }).first().click()
    const editor = page.locator('[data-slot="composer-rich-input"]:visible').first()
    await editor.fill('Draft must stay')
    await page.locator('[data-slot="aui_thread-viewport"] button img').first().click()
    const viewer = page.locator('[data-variant="media-lightbox"][data-state="open"]')
    await expect(viewer).toBeVisible()
    const annotate = viewer.getByRole('button', { name: /^(Annoter|Annotate)$/ })
    await expect(annotate, 'clicking the transcript image should expose an annotation action').toBeVisible({ timeout: 4000 })
    await annotate.click()
    const dialog = page.locator('dialog[data-image-annotator]')
    const canvas = dialog.locator('canvas')
    await expect(dialog).toBeVisible()
    await expect(canvas).toHaveAttribute('width', '160')
    await dialog.locator('input[type="color"]').fill('#00ff11')
    const box = (await canvas.boundingBox())!
    const draw = async () => {
      await page.mouse.move(box.x + box.width * 0.30, box.y + box.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.70, box.y + box.height * 0.5, { steps: 12 })
      await page.mouse.up()
    }
    await draw()
    const pixels = (c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(80, 50, 1, 1).data]
    expect(await canvas.evaluate(pixels)).toEqual([0, 255, 17, 255])
    await dialog.getByRole('button', { name: /^(Annuler le trait|Undo stroke)$/ }).click()
    expect(await canvas.evaluate(pixels)).not.toEqual([0, 255, 17, 255])
    await draw()
    await page.screenshot({ path: test.info().outputPath('annotation-editor.png') })
    const save = dialog.getByRole('button', { name: /^(Enregistrer le PNG|Save PNG)$/ })
    await expect(save, 'standalone release must export instead of editing a chat draft').toBeVisible({ timeout: 4000 })
    const output = path.join(sandbox.root, 'annotation.png')
    await app.evaluate(async ({ session }: { session: { defaultSession: Session } }, savePath: string) => {
      session.defaultSession.once('will-download', (_event: ElectronEvent, item: DownloadItem) => item.setSavePath(savePath))
    }, output)
    await save.click()
    await expect.poll(() => fs.existsSync(output) && fs.statSync(output).size).toBeGreaterThan(100)
    const actual = await page.evaluate(async (bytes: number[]) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      image.close()
      return { size: [canvas.width, canvas.height], center: [...context.getImageData(80, 50, 1, 1).data] }
    }, [...fs.readFileSync(output)])
    expect(actual).toEqual({ size: [160, 100], center: [0, 255, 17, 255] })
    await expect(editor).toHaveText('Draft must stay')
    await expect(page.locator('[data-slot="aui_thread-viewport"]').getByText('Draft must stay', { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-slot="composer-attachments"] > *')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(viewer).toBeVisible()
  } finally {
    await app?.close().catch(() => undefined)
    await mock.close()
    sandbox.cleanup()
  }
})
