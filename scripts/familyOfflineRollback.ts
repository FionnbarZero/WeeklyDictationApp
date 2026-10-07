import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256, requireFullGitRevision } from './familyBetaRelease.ts'
import { packageOfflineShell } from './familyOfflineShell.ts'

/** An old engine must never normalize newer local records. This synchronous
 * guard runs before every module, on every entry route, and writes no data. */
export const rollbackGuard = `
(() => {
  let newer = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('family-beta-')) continue;
      if (key.includes(':lesson-launch-v1:') || key.includes(':lesson-retirement-v1:')) { newer = true; break; }
      if (key.startsWith('family-beta-acquisition-v1:') || key.endsWith(':weekly-dictation-state-v2')) {
        const raw = localStorage.getItem(key) || '';
        if (raw.includes('"lessonSnapshot"') || raw.includes('"curriculumRevision"')) { newer = true; break; }
      }
    }
  } catch { newer = true; }
  window.__dojoRollbackPreserve = newer;
  if (!newer) return;
  document.addEventListener('DOMContentLoaded', () => {
    document.title = 'Ninja Dojo — progress preserved';
    document.body.innerHTML = '<main><h1>Your saved work is preserved</h1><p>Ninja Dojo is temporarily using a recovery version. Lessons saved by the newer app cannot be opened by this older version.</p><p>Please keep this browser’s data. Do not clear it or restart your lessons. Return when the updated app is available.</p><button onclick="location.reload()">Check for the updated app</button></main>';
  }, { once: true });
})();
`

/** Local-only: verify, copy, then add compatibility/worker support. The input
 * artifact is never edited, and this function cannot upload or change hosting. */
export function prepareOfflineRollback(sourceDirectory: string, compatibilityRevision: string) {
  requireFullGitRevision(compatibilityRevision)
  const source = resolve(sourceDirectory)
  const previous = JSON.parse(readFileSync(join(source, 'family-beta-manifest.json'), 'utf8'))
  const originalFiles = artifactFileRecords(source)
  if (
    previous.schema !== 1 ||
    previous.grade !== 'Family' ||
    previous.canonicalOrigin !== 'https://ninjadojo.meghangames.com' ||
    previous.firebaseProject !== 'weeklydictationapp' ||
    !Array.isArray(previous.files) ||
    fileTreeSha256(originalFiles) !== previous.fileTreeSha256 ||
    JSON.stringify(originalFiles) !== JSON.stringify(previous.files)
  )
    throw new Error('The previous family artifact failed integrity verification. Nothing was packaged.')
  requireFullGitRevision(previous.sourceRevision)
  const directory = mkdtempSync(join(tmpdir(), 'ninja-dojo-offline-rollback-'))
  cpSync(source, directory, { recursive: true, errorOnExist: true, force: false })
  for (const file of originalFiles.filter((file) => file.path.endsWith('.html'))) {
    const path = join(directory, file.path)
    const guarded = readFileSync(path, 'utf8')
      .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (_tag, attributes: string, body: string) => {
        const src = attributes.match(/\bsrc="([^"]+)"/)?.[1]
        if (src) {
          if (!attributes.includes('type="module"') || !/^\.\/assets\/[\w.-]+\.js$/.test(src))
            throw new Error('Unexpected older entry script; rollback requires review.')
          return `<script type="module">if (!window.__dojoRollbackPreserve) await import(${JSON.stringify(src)});</script>`
        }
        return `<script${attributes}>if (!window.__dojoRollbackPreserve) {${body}}</script>`
      })
      .replace('<head>', '<head><script src="./rollback-guard.js"></script>')
    writeFileSync(path, guarded)
  }
  writeFileSync(join(directory, 'rollback-guard.js'), rollbackGuard)
  packageOfflineShell(directory, `rollback-${previous.sourceRevision}-${compatibilityRevision}`)
  const files = artifactFileRecords(directory)
  const manifest = {
    ...previous,
    files,
    fileTreeSha256: fileTreeSha256(files),
    rollbackCompatibilityRevision: compatibilityRevision,
    rollbackMode: 'previous-engine-with-newer-record-preservation-guard',
    previousFileTreeSha256: previous.fileTreeSha256,
  }
  writeFileSync(join(directory, 'family-beta-manifest.json'), JSON.stringify(manifest, null, 2))
  return { directory, manifest }
}
