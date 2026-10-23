import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createWritingLesson,
  COPY_MEMORY_WRITING_POLICY,
  KINDERGARTEN_WRITING_POLICY,
  GRADE5_WRITING_POLICY,
} from '../src/application/writingAcquisition/lesson.ts'
import { kindergartenAudioForText } from '../src/audio/kindergartenAudio.ts'
import { validateCurriculum } from '../src/familyBeta/curriculum.ts'

for (const [slug, policy] of [
  ['kindergarten', KINDERGARTEN_WRITING_POLICY],
  ['grade2', COPY_MEMORY_WRITING_POLICY],
  ['grade5', GRADE5_WRITING_POLICY],
] as const)
  test(`${slug}: every retained writing cohort has every guide; Kindergarten recordings exist locally`, async () => {
    const raw = readFileSync(new URL(`./fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8')
    const { datasets } = await validateCurriculum(raw, JSON.parse(raw).grade)
    for (const d of datasets) {
      const lesson = createWritingLesson(d, policy)
      assert.deepEqual(
        lesson.targets.map((t) => t.text),
        d.words.map((w) => w.text),
      )
      for (const t of lesson.targets) {
        assert.ok(t.guideFingerprint)
        if (slug === 'kindergarten') {
          const audio = kindergartenAudioForText(t.text)
          assert.ok(audio?.storagePath, t.text)
          assert.ok(existsSync(new URL(`../public/${audio.storagePath.replace(/^\//, '')}`, import.meta.url)), t.text)
        }
      }
    }
  })
