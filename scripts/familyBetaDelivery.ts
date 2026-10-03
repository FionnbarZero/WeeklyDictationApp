import type { FamilyBetaGrade } from './familyBetaRelease.ts'
import { candidateChannelId, requireFullGitRevision, rollbackChannelId } from './familyBetaRelease.ts'

export type FamilyBetaDeliveryIdentity = {
  grade: FamilyBetaGrade
  projectId: string
  siteId: string
}

export type FamilyBetaHostingChannel = {
  name: string
  url: string
  release?: { version?: { name?: string } }
}

export function channelHasRelease(channel: FamilyBetaHostingChannel | undefined) {
  return Boolean(channel?.release?.version?.name)
}

export const familyBetaHostingHeaders = [
  { source: '**/*.html', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
  { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public,max-age=31536000,immutable' }] },
  {
    source: '**',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
    ],
  },
] as const

export function familyBetaHostingConfig(siteId: string, artifactDirectory: string) {
  return {
    hosting: {
      site: siteId,
      public: artifactDirectory,
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      cleanUrls: true,
      trailingSlash: false,
      headers: familyBetaHostingHeaders,
      rewrites: [{ source: '**', destination: '/index.html' }],
    },
  }
}

export function previewDeliveryPlan(
  identity: FamilyBetaDeliveryIdentity,
  revision: string,
  generatedConfigPath: string,
) {
  const channel = candidateChannelId(revision)
  return {
    channel,
    commands: [
      [
        'npx',
        'firebase',
        'hosting:channel:deploy',
        channel,
        '--project',
        identity.projectId,
        '--config',
        generatedConfigPath,
        '--expires',
        '7d',
        '--no-authorized-domains',
        '--json',
      ],
    ],
  }
}

export function promotionDeliveryPlan(
  identity: FamilyBetaDeliveryIdentity,
  revision: string,
  previousRevision?: string,
) {
  const candidate = candidateChannelId(revision)
  const commands: string[][] = []
  if (previousRevision) {
    commands.push([
      'npx',
      'firebase',
      'hosting:clone',
      `${identity.siteId}:live`,
      `${identity.siteId}:${rollbackChannelId(previousRevision)}`,
      '--project',
      identity.projectId,
      '--json',
    ])
  }
  commands.push([
    'npx',
    'firebase',
    'hosting:clone',
    `${identity.siteId}:${candidate}`,
    `${identity.siteId}:live`,
    '--project',
    identity.projectId,
    '--json',
  ])
  return { candidate, commands }
}

export function rollbackDeliveryPlan(identity: FamilyBetaDeliveryIdentity, revision: string) {
  const source = rollbackChannelId(requireFullGitRevision(revision))
  return {
    source,
    commands: [
      [
        'npx',
        'firebase',
        'hosting:clone',
        `${identity.siteId}:${source}`,
        `${identity.siteId}:live`,
        '--project',
        identity.projectId,
        '--json',
      ],
    ],
  }
}
