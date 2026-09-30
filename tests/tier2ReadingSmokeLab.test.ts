import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildTier2SmokeSnapshot,
  tier2SmokeAcquisitionTargetSet,
  tier2SmokePathwayTargets,
  tier2SmokePathways,
  tier2SmokeScenarioOptions,
} from '../src/tier2Lab/fixtures.ts'
import { TIER2_PROTOTYPE_CURRICULUM } from '../src/tier2Lab/prototypeCurriculum.ts'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function summary(grade: 'Kindergarten' | 'Grade 2' | 'Grade 5', scenarioId?: string) {
  const snapshot = buildTier2SmokeSnapshot(grade, scenarioId)
  return tier2SmokePathways(snapshot).map((pathway) => ({
    kind: pathway.kind,
    cycle: pathway.cycle,
    reviewGroupId: pathway.reviewGroupId,
    datasetIds: pathway.cohorts.map((cohort) => cohort.datasetId),
    available: pathway.available,
  }))
}

test('the Tier 2 smoke fixtures expose each grade’s actual lifecycle pattern', () => {
  assert.deepEqual(summary('Grade 2'), [
    { kind: 'acquisition', cycle: undefined, reviewGroupId: undefined, datasetIds: ['grade2-smoke-w4'], available: true },
    { kind: 'test-review', cycle: 1, reviewGroupId: undefined, datasetIds: ['grade2-smoke-w3'], available: true },
    { kind: 'mastery', cycle: undefined, reviewGroupId: undefined, datasetIds: ['grade2-smoke-w1', 'grade2-smoke-w2'], available: true },
  ])
  assert.deepEqual(summary('Grade 5'), [
    { kind: 'acquisition', cycle: undefined, reviewGroupId: undefined, datasetIds: ['grade5-smoke-w4'], available: true },
    { kind: 'test-review', cycle: 1, reviewGroupId: undefined, datasetIds: ['grade5-smoke-w3'], available: true },
    { kind: 'test-review', cycle: 2, reviewGroupId: undefined, datasetIds: ['grade5-smoke-w2'], available: true },
    { kind: 'mastery', cycle: undefined, reviewGroupId: undefined, datasetIds: ['grade5-smoke-w1'], available: true },
  ])
})

test('Kindergarten smoke scenarios preserve active cumulative review and later Mastery', () => {
  assert.deepEqual(tier2SmokeScenarioOptions('Kindergarten').map((option) => option.id), ['active-unit', 'completed-unit'])
  assert.deepEqual(summary('Kindergarten', 'active-unit'), [
    { kind: 'acquisition', cycle: undefined, reviewGroupId: undefined, datasetIds: ['kindergarten-smoke-w4'], available: true },
    {
      kind: 'test-review',
      cycle: 1,
      reviewGroupId: 'kindergarten-2026-27-unit-1',
      datasetIds: ['kindergarten-smoke-w1', 'kindergarten-smoke-w2', 'kindergarten-smoke-w3', 'kindergarten-smoke-w4'],
      available: true,
    },
    { kind: 'mastery', cycle: undefined, reviewGroupId: undefined, datasetIds: [], available: false },
  ])
  assert.deepEqual(summary('Kindergarten', 'completed-unit'), [
    {
      kind: 'mastery',
      cycle: undefined,
      reviewGroupId: undefined,
      datasetIds: ['kindergarten-smoke-w1', 'kindergarten-smoke-w2', 'kindergarten-smoke-w3', 'kindergarten-smoke-w4'],
      available: true,
    },
  ])
})

test('every smoke target remains a separate Tier 2 Mandarin reading occurrence', () => {
  for (const grade of ['Kindergarten', 'Grade 2', 'Grade 5'] as const) {
    const snapshot = buildTier2SmokeSnapshot(grade)
    assert.equal(snapshot.profile.releaseStatus, 'inactive')
    assert.equal(snapshot.profile.responseRule.recording, 'prompted-ephemeral')
    assert.equal(snapshot.profile.responseRule.comparisonOrder, 'child-then-model')
    for (const pathway of tier2SmokePathways(snapshot)) {
      for (const target of tier2SmokePathwayTargets(pathway)) {
        assert.equal(target.language, 'mandarin')
        assert.equal(target.tier, 'tier-2')
        assert.equal(target.activityType, 'reading')
      }
    }
    const acquisition = snapshot.lifecycle.acquisition
    assert.ok(acquisition)
    const targetSet = tier2SmokeAcquisitionTargetSet(acquisition)
    assert.equal(targetSet.id, acquisition.cohorts[0].datasetId)
    assert.deepEqual(targetSet.targets, acquisition.cohorts[0].targets)
  }
})

test('the prototype curriculum preserves every known source term without a three-target cap', () => {
  assert.deepEqual(
    TIER2_PROTOTYPE_CURRICULUM.Kindergarten.map((cycle) => cycle.tier2Terms),
    [
      ['爸爸', '妈妈', '小'],
      ['我', '开心'],
      ['有', '没有'],
      ['红色', '蓝色'],
    ],
  )
  assert.deepEqual(
    TIER2_PROTOTYPE_CURRICULUM['Grade 2'].map((cycle) => cycle.tier2Terms),
    [
      ['爱心', '难过', '帮助', '同学', '比如'],
      ['帮助', '找', '语', '食物'],
      ['身体', '手', '脚', '嘴巴', '国家', '事情', '生活'],
      ['城市', '上班', '公园', '图书馆', '散步', '漂亮', '各种各样的'],
    ],
  )
  assert.deepEqual(
    TIER2_PROTOTYPE_CURRICULUM['Grade 5'].map((cycle) => cycle.tier2Terms),
    [
      ['海洋', '阳光', '鲨鱼', '天敌', '生存'],
      ['空气', '根', '帮助', '植物', '食物', '得到', '关', '打开'],
      ['提醒', '沟通', '快速地', '有意思', '年长的', '并且', '表达', '碰'],
      ['河流', '躺', '留', '不断地', '美味的', '刷牙', '洒', '沉', '浮'],
    ],
  )

  for (const grade of ['Kindergarten', 'Grade 2', 'Grade 5'] as const) {
    const snapshot = buildTier2SmokeSnapshot(grade)
    for (const [index, cycle] of TIER2_PROTOTYPE_CURRICULUM[grade].entries()) {
      const dataset = snapshot.datasets[index]
      assert.deepEqual(dataset.vocabulary?.tier1.map((word) => word.text), cycle.tier1Terms)
      assert.deepEqual(dataset.vocabulary?.tier2.map((word) => word.text), cycle.tier2Terms)
      assert.equal(new Set(cycle.tier2Terms).size, cycle.tier2Terms.length)
    }
  }
})

test('the Tier 2 smoke screen is development-only and disconnected from production and persistence', () => {
  const productionEntries = [
    source('index.html'),
    source('src/main.tsx'),
    source('src/App.tsx'),
    source('src/config.ts'),
    source('src/firestoreClient.ts'),
  ].join('\n')
  const html = source('tier2-reading-lab.html')
  const harness = source('src/tier2ReadingLabHarness.tsx')
  const fixtures = source('src/tier2Lab/fixtures.ts')

  assert.doesNotMatch(productionEntries, /tier2-reading-lab|tier2ReadingLabHarness|tier2Lab\//)
  assert.match(html, /tier2-reading-lab-root/)
  assert.match(html, /src\/tier2ReadingLabHarness\.tsx/)
  assert.match(harness, /import\.meta\.env\.DEV/)
  assert.match(harness, /startAcquisition/)
  assert.match(harness, /transitionAcquisition/)
  assert.match(harness, /buildTier2SmokeSnapshot/)
  assert.match(harness, /ReadingResponsePanel/)
  assert.match(harness, /recording-comparison/)
  assert.doesNotMatch(`${harness}\n${fixtures}`, /from ['"].*(firebase|firestore)|localStorage\.|googleapis|fetch\(['"]https:/i)
})
