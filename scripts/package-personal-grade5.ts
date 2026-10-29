import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

const root = resolve(import.meta.dirname, '..')
const evidence = resolve(root, 'family-beta-artifacts/personal-grade5-2026-10-27')
const source = resolve(root, 'family-beta-artifacts/grade5-cumulative-2026-10-26/package-final')
const reference = JSON.parse(readFileSync(resolve(evidence, 'reference-manifest.json'), 'utf8'))
assert.equal(reference.sourceRevision, 'b36e8982ffd9d26845bfc8e5fabc28747f58a5c4')
assert.equal(reference.readingReview.targets, 50)
assert.equal(reference.readingReview.writing, 'coming-soon-disabled')
for (const file of reference.files) {
  assert.equal(
    createHash('sha256')
      .update(readFileSync(resolve(source, file.path)))
      .digest('hex'),
    file.sha256,
    file.path,
  )
}
const publicationRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const headers = JSON.parse(readFileSync(resolve(evidence, 'reference-headers.json'), 'utf8'))
for (const [slug, nickname] of [
  ['maxton', 'Maxton'],
  ['aaron', 'Aaron'],
] as const) {
  const name = `${nickname} grade 5`,
    output = resolve(evidence, slug)
  if (existsSync(output)) throw new Error('Use a new immutable copy directory; never overwrite a release.')
  cpSync(source, output, { recursive: true })
  // The old manifests describe the reference, not this newly branded copy.
  for (const file of ['kore-voice-manifest.json', 'dojo-launch-manifest.json']) rmSync(resolve(output, file))
  const entry = resolve(output, 'family-beta-preview.html')
  writeFileSync(
    entry,
    readFileSync(entry, 'utf8')
      .replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`)
      .replace('</head>', '<script src="./personal-dojo.js"></script></head>'),
  )
  writeFileSync(
    resolve(output, 'personal-dojo.js'),
    `(() => {
  const name = ${JSON.stringify(name)}, nickname = ${JSON.stringify(nickname)};
  // New-origin initialization only. Never replace existing profiles or history.
  try {
    const key = 'automatic-curriculum-preview-profiles';
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify([
      {id:'automatic-curriculum-preview-2', nickname, grade:'Grade 5', active:true}
    ]));
  } catch { /* The existing app owns storage failure/retry notices. */ }
  const brand = () => {
    if (document.title !== name) document.title = name;
    const grade = document.querySelector('.beta-workspace')?.getAttribute('data-report-grade');
    const label = document.querySelector('.beta-preview-child-label');
    if (grade === 'Grade 5' && label && label.textContent !== name) label.textContent = name;
    const title = document.querySelector('.beta-toolbar > strong');
    if (title && title.textContent !== name) title.textContent = name;
    const note = document.querySelector('.beta-preview-details');
    const text = name + ' · 50-word reading review · b36e898. Progress saves in this browser on this device; no account or cross-device syncing.';
    if (note && note.textContent !== text) note.textContent = text;
  };
  new MutationObserver(brand).observe(document.documentElement, {childList:true,subtree:true,characterData:true});
  brand();
})();\n`,
  )
  writeFileSync(
    resolve(output, '_headers'),
    '/*\n' +
      Object.entries(headers)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join('\n') +
      '\n',
  )
  writeFileSync(resolve(output, '_redirects'), '/ /family-beta-preview.html?grade=grade5 302\n')
  const files = artifactFileRecords(output)
  const manifest = {
    schema: 1,
    name,
    edition: 'Personal Grade 5 reading review 1',
    sourceRevision: reference.sourceRevision,
    publicationRevision,
    referenceUrl:
      'https://weekly-dictation-staging--grade5-recognition-nov6-v1-yvx9mrv0.web.app/family-beta-preview.html?grade=grade5',
    referenceTree: reference.fileTreeSha256,
    readingReview: reference.readingReview,
    voice: reference.voice,
    speakingRate: reference.speakingRate,
    persistence:
      'Separate browser/device-only progress. No account, cloud sync or migration. Recordings and unfinished ink stay temporary.',
    entry: 'family-beta-preview.html?grade=grade5',
    fileTreeSha256: fileTreeSha256(files),
    files,
  }
  writeFileSync(resolve(output, 'personal-dojo-manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(
    JSON.stringify({ name, output, sourceRevision: reference.sourceRevision, fileTreeSha256: manifest.fileTreeSha256 }),
  )
}
