import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { basename } from 'node:path'
import { readRepositoryGitRevision, resolveBuildGitRevision } from './scripts/buildMetadata.ts'
import { APP_VERSION } from './src/releaseMetadata.ts'

function page(path: string) {
  return fileURLToPath(new URL(path, import.meta.url))
}

const archivedPrototypeInputs = {
  tier2ReadingLab: page('./tier2-reading-lab.html'),
  grade2TestReviewPrototype: page('./grade2-test-review-prototype.html'),
  learningGamesHarness: page('./learning-games-harness.html'),
  skywritingHarness: page('./skywriting-harness.html'),
  skywritingAcquisitionHarness: page('./skywriting-acquisition-harness.html'),
  skywritingFontComparison: page('./skywriting-font-comparison.html'),
  grade5SourceHarness: page('./grade5-source-harness.html'),
  kindergartenSourceHarness: page('./kindergarten-source-harness.html'),
}

const familyBetaInputByGrade = {
  kindergarten: page('./kindergarten-learning-lab.html'),
  grade2: page('./index.html'),
  grade5: page('./grade5-learning-hub.html'),
} as const

const releaseIdentityByPage = {
  'index.html': {
    grade: 'Grade 2',
    status: 'Family beta',
    persistence: 'Tier 1 writing durable here · Tier 2 reading session only',
  },
  'kindergarten-learning-lab.html': {
    grade: 'Kindergarten',
    status: 'Experimental',
    persistence: 'Session only',
  },
  'grade5-learning-hub.html': {
    grade: 'Grade 5',
    status: 'Experimental',
    persistence: 'Session only',
  },
} as const

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function releaseIdentityHtml(fileName: string, gitRevision: string, familySync = false) {
  const baseIdentity = releaseIdentityByPage[fileName as keyof typeof releaseIdentityByPage]
  const identity =
    baseIdentity && familySync
      ? { ...baseIdentity, status: 'Family beta', persistence: 'Parent account sync · recordings session only' }
      : baseIdentity
  if (!identity) return ''
  const summary = `${identity.grade} · ${identity.status} · v${APP_VERSION} · r${gitRevision.slice(0, 7)} · ${identity.persistence}`
  const report = [
    `grade=${identity.grade}`,
    `status=${identity.status}`,
    `version=${APP_VERSION}`,
    `revision=${gitRevision}`,
    `persistence=${identity.persistence}`,
  ].join(' | ')
  return `<details class="release-identity" aria-label="Release information"><summary>${escapeHtml(summary)}</summary><div class="release-identity-panel"><strong>Report a problem</strong><p>Include this safe release summary. It contains no name, response, recording, or progress data.</p><dl><div><dt>Grade</dt><dd>${escapeHtml(identity.grade)}</dd></div><div><dt>Release</dt><dd>${escapeHtml(identity.status)}</dd></div><div><dt>Application</dt><dd>${escapeHtml(APP_VERSION)}</dd></div><div><dt>Git revision</dt><dd>${escapeHtml(gitRevision)}</dd></div><div><dt>Persistence</dt><dd>${escapeHtml(identity.persistence)}</dd></div></dl><code>${escapeHtml(report)}</code></div></details>`
}

export default defineConfig(({ command, mode }) => {
  const familyBetaGrade = process.env.VITE_FAMILY_BETA_GRADE
  if (
    mode === 'family-beta' &&
    familyBetaGrade !== 'kindergarten' &&
    familyBetaGrade !== 'grade2' &&
    familyBetaGrade !== 'grade5'
  ) {
    throw new Error('A family-beta build requires VITE_FAMILY_BETA_GRADE=kindergarten, grade2, or grade5.')
  }
  const gitRevision = resolveBuildGitRevision({
    environmentRevision: process.env.VITE_GIT_REVISION,
    repositoryRevision: () => readRepositoryGitRevision(page('.')),
    required: command === 'build',
  })

  return {
    base: mode === 'public-preview' ? '/WeeklyDictationApp/' : mode === 'family-beta' ? './' : '/',
    plugins: [
      react(),
      {
        name: 'release-identity',
        transformIndexHtml(html, context) {
          const identity = releaseIdentityHtml(basename(context.filename), gitRevision, mode === 'family-sync')
          return identity ? html.replace(/<body\b[^>]*>/, (body) => `${body}\n    ${identity}`) : html
        },
      },
    ],
    build: {
      manifest: true,
      rollupOptions: {
        input:
          mode === 'family-beta'
            ? { app: familyBetaInputByGrade[familyBetaGrade as keyof typeof familyBetaInputByGrade] }
            : mode === 'production' || mode === 'staging'
              ? { app: page('./index.html') }
              : {
                  app: page('./index.html'),
                  grade5LearningHub: page('./grade5-learning-hub.html'),
                  kindergartenLearningLab: page('./kindergarten-learning-lab.html'),
                  testing: page('./testing.html'),
                  ...(['reconciliation', 'family-sync'].includes(mode)
                    ? { familyPreview: page('./family-beta-preview.html'), familyGame: page('./family-game.html') }
                    : {}),
                  ...(mode === 'prototype-baseline' ? archivedPrototypeInputs : {}),
                },
      },
    },
  }
})
