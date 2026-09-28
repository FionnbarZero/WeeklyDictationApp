import type {
  AcquisitionPhase,
  AcquisitionPromptKind,
  AcquisitionStrategy,
  AcquisitionTarget,
  AcquisitionTargetSet,
  EngineAcquisitionFlow,
} from './contracts.ts'

function shuffleTargets<TTarget>(targets: readonly TTarget[], random: () => number) {
  const output = [...targets]
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }
  return output
}

function drawFromBag<TTarget extends AcquisitionTarget>(targets: readonly TTarget[], bag: TTarget[], lastDtWordId: string | undefined, random: () => number) {
  const eligibleIds = new Set(targets.map((target) => target.id))
  let nextBag = bag.filter((target) => eligibleIds.has(target.id))
  if (nextBag.length === 0) nextBag = shuffleTargets(targets, random)
  if (nextBag.length > 1 && nextBag[0].id === lastDtWordId) {
    const alternativeIndex = nextBag.findIndex((target) => target.id !== lastDtWordId)
    if (alternativeIndex > 0) [nextBag[0], nextBag[alternativeIndex]] = [nextBag[alternativeIndex], nextBag[0]]
  }
  const [word, ...remaining] = nextBag
  return { word, bag: remaining }
}

function bagCanAvoidRepeat<TTarget extends AcquisitionTarget>(targets: readonly TTarget[], bag: TTarget[], lastDtWordId: string | undefined) {
  const eligibleIds = new Set(targets.map((target) => target.id))
  const activeBag = bag.filter((target) => eligibleIds.has(target.id))
  const candidates = activeBag.length > 0 ? activeBag : targets
  return candidates.some((target) => target.id !== lastDtWordId)
}

function acquisitionPromptTimer<TTarget extends AcquisitionTarget>(strategy: AcquisitionStrategy<TTarget>, phase: AcquisitionPhase, kind: AcquisitionPromptKind, expandedTargetAttempts: number) {
  const config = strategy.timers
  if (kind === 'established-dt') return config.establishedDtSeconds
  if (kind === 'earned-dt') return config.earnedDtSeconds
  if (kind === 'show-copy') return phase === 'correction' ? config.correctionShowCopySeconds : config.introductionShowCopySeconds
  if (phase === 'introduction') return config.introductionHiddenTargetSeconds
  if (phase === 'correction') return config.correctionHiddenSeconds
  return Math.max(config.expandedMinimumSeconds, config.expandedStartSeconds - expandedTargetAttempts * config.expandedDecrementSeconds)
}

function makeAcquisitionPrompt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, kind: AcquisitionPromptKind, word: TTarget, targetWordId?: string): EngineAcquisitionFlow<TTarget> {
  const trialNumber = flow.trialNumber + 1
  const weeklyTarget = kind === 'target' && flow.correctionRole !== 'earned-dt'
  const dtPoolType = kind === 'established-dt' ? 'established' as const : kind === 'earned-dt' || (kind === 'target' && flow.correctionRole === 'earned-dt') ? 'earned' as const : undefined
  return {
    ...flow,
    trialNumber,
    prompt: {
      id: `${flow.datasetId}-${flow.targetIndex}-${flow.phase}-${flow.step}-${trialNumber}-${kind}-${word.id}`,
      kind,
      phase: flow.phase,
      word,
      targetWordId,
      scored: weeklyTarget,
      countsTowardWeeklyScore: weeklyTarget,
      dtPoolType,
      timerSeconds: acquisitionPromptTimer(strategy, flow.phase, kind, flow.expandedTargetAttempts),
      revealed: false,
    },
  }
}

function establishedDtPrompt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const drawn = drawFromBag(strategy.establishedDtTargets, flow.establishedDtBag, flow.lastDtWordId, random)
  return makeAcquisitionPrompt({ ...flow, establishedDtBag: drawn.bag, lastDtWordId: drawn.word.id }, strategy, 'established-dt', drawn.word)
}

function dtPrompt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const preferEarned = flow.earnedDtPool.length > 0 && random() >= 0.5
  const earnedCanAvoidRepeat = bagCanAvoidRepeat(flow.earnedDtPool, flow.earnedDtBag, flow.lastDtWordId)
  if (preferEarned && earnedCanAvoidRepeat) {
    const drawn = drawFromBag(flow.earnedDtPool, flow.earnedDtBag, flow.lastDtWordId, random)
    const resumePosition = flow.mode === 'teaching' && flow.phase === 'expanded-trials' && flow.currentTarget
      ? { phase: 'expanded-trials' as const, step: flow.step + 1, expandedTargetAttempts: flow.expandedTargetAttempts, currentTarget: flow.currentTarget, targetIndex: flow.targetIndex }
      : flow.resumePosition
    return makeAcquisitionPrompt({ ...flow, earnedDtBag: drawn.bag, lastDtWordId: drawn.word.id, resumePosition }, strategy, 'earned-dt', drawn.word, drawn.word.id)
  }
  return establishedDtPrompt(flow, strategy, random)
}

function coreAcquisitionPrompt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number): EngineAcquisitionFlow<TTarget> {
  if (flow.mode === 'dt-practice' && !flow.currentTarget) return dtPrompt({ ...flow, complete: false }, strategy, random)
  if (!flow.currentTarget) return { ...flow, prompt: null, complete: true }
  const token = flow.phase === 'introduction' ? strategy.introductionSequence[flow.step] : flow.phase === 'expanded-trials' ? strategy.expandedSequence[flow.step] : strategy.correctionSequence[flow.step]
  if (!token) return flow
  if (token === 'established-dt') return establishedDtPrompt(flow, strategy, random)
  if (token === 'dt') return dtPrompt(flow, strategy, random)
  if (token === 'show-copy') return makeAcquisitionPrompt(flow, strategy, 'show-copy', flow.currentTarget, flow.currentTarget.id)
  return makeAcquisitionPrompt(flow, strategy, 'target', flow.currentTarget, flow.currentTarget.id)
}

export function startAcquisition<TTarget extends AcquisitionTarget>(targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number): EngineAcquisitionFlow<TTarget> {
  const currentTarget = targetSet.targets[0] || null
  return coreAcquisitionPrompt({
    datasetId: targetSet.id,
    mode: 'teaching',
    targetIndex: 0,
    currentTarget,
    phase: 'introduction',
    step: 0,
    trialNumber: 0,
    expandedTargetAttempts: 0,
    earnedDtPool: [],
    establishedDtBag: [],
    earnedDtBag: [],
    consecutiveErrors: {},
    prompt: null,
    teachingComplete: !currentTarget,
    complete: !currentTarget,
  }, strategy, random)
}

export function resumeAcquisition<TTarget extends AcquisitionTarget>(saved: EngineAcquisitionFlow<TTarget> | undefined, targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  if (!saved || saved.datasetId !== targetSet.id) return startAcquisition(targetSet, strategy, random)
  if (saved.complete || saved.teachingComplete) return coreAcquisitionPrompt({ ...saved, mode: 'dt-practice', currentTarget: null, prompt: null, teachingComplete: true, complete: false, correctionRole: undefined, resumePosition: undefined }, strategy, random)
  return saved
}

function withEarnedWord<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, word: TTarget) {
  return flow.earnedDtPool.some((candidate) => candidate.id === word.id) ? flow : { ...flow, earnedDtPool: [...flow.earnedDtPool, word] }
}

function withoutEarnedWord<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, wordId: string) {
  return { ...flow, earnedDtPool: flow.earnedDtPool.filter((word) => word.id !== wordId), earnedDtBag: flow.earnedDtBag.filter((word) => word.id !== wordId) }
}

function resumeInterruptedTarget<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const resume = flow.resumePosition
  if (!resume) return coreAcquisitionPrompt({ ...flow, mode: 'dt-practice', currentTarget: null, correctionRole: undefined, prompt: null, complete: false }, strategy, random)
  return coreAcquisitionPrompt({ ...flow, mode: 'teaching', targetIndex: resume.targetIndex, currentTarget: resume.currentTarget, phase: resume.phase, step: resume.step, expandedTargetAttempts: resume.expandedTargetAttempts, correctionRole: undefined, resumePosition: undefined, prompt: null }, strategy, random)
}

function advanceToNextTarget<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const nextIndex = flow.targetIndex + 1
  if (nextIndex >= targetSet.targets.length) return { ...flow, currentTarget: null, prompt: null, teachingComplete: true, complete: true, correctionRole: undefined, resumePosition: undefined }
  return coreAcquisitionPrompt({ ...flow, targetIndex: nextIndex, currentTarget: targetSet.targets[nextIndex], phase: 'introduction', step: 0, expandedTargetAttempts: 0, correctionRole: undefined, resumePosition: undefined, prompt: null, complete: false }, strategy, random)
}

function completeCurrentTarget<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const target = flow.currentTarget
  if (!target) return { ...flow, prompt: null, complete: true }
  const earned = withEarnedWord(flow, target)
  return flow.correctionRole === 'earned-dt' ? resumeInterruptedTarget(earned, strategy, random) : advanceToNextTarget(earned, targetSet, strategy, random)
}

function errorsAfter<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, wordId: string, correct: boolean) {
  return { ...flow.consecutiveErrors, [wordId]: correct ? 0 : (flow.consecutiveErrors[wordId] || 0) + 1 }
}

function restartIntroduction<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, word: TTarget, role: 'current-target' | 'earned-dt', strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  const restarted = role === 'earned-dt' ? withoutEarnedWord(flow, word.id) : flow
  return coreAcquisitionPrompt({ ...restarted, currentTarget: word, phase: 'introduction', step: 0, expandedTargetAttempts: 0, correctionRole: role, prompt: null }, strategy, random)
}

function enterCorrection<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, word: TTarget, role: 'current-target' | 'earned-dt', resumePosition: EngineAcquisitionFlow<TTarget>['resumePosition'], strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  return coreAcquisitionPrompt({ ...flow, currentTarget: word, phase: 'correction', step: 0, correctionRole: role, resumePosition, prompt: null }, strategy, random)
}

function advanceUnscoredOrEstablishedDt<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, strategy: AcquisitionStrategy<TTarget>, random: () => number) {
  if (flow.mode === 'dt-practice') return coreAcquisitionPrompt({ ...flow, prompt: null }, strategy, random)
  return coreAcquisitionPrompt({ ...flow, step: flow.step + 1, prompt: null }, strategy, random)
}

export function revealAcquisition<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>) {
  if (!flow.prompt) return flow
  return { ...flow, prompt: { ...flow.prompt, revealed: true } }
}

export function answerAcquisition<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, targetSet: AcquisitionTargetSet<TTarget>, strategy: AcquisitionStrategy<TTarget>, correct: boolean, random: () => number): EngineAcquisitionFlow<TTarget> {
  const prompt = flow.prompt
  if (!prompt || !prompt.revealed) return flow
  if (prompt.kind === 'show-copy' || prompt.kind === 'established-dt') return advanceUnscoredOrEstablishedDt(flow, strategy, random)

  const consecutiveErrors = errorsAfter(flow, prompt.word.id, correct)
  const updated = { ...flow, consecutiveErrors }

  if (prompt.kind === 'earned-dt') {
    if (correct) return flow.mode === 'dt-practice' ? coreAcquisitionPrompt({ ...updated, prompt: null }, strategy, random) : resumeInterruptedTarget(updated, strategy, random)
    if (consecutiveErrors[prompt.word.id] >= 3) return restartIntroduction(updated, prompt.word, 'earned-dt', strategy, random)
    return enterCorrection(updated, prompt.word, 'earned-dt', flow.resumePosition, strategy, random)
  }

  if (!correct && consecutiveErrors[prompt.word.id] >= 3) return restartIntroduction(updated, prompt.word, flow.correctionRole === 'earned-dt' ? 'earned-dt' : 'current-target', strategy, random)

  if (flow.phase === 'introduction') {
    if (correct) return coreAcquisitionPrompt({ ...updated, phase: 'expanded-trials', step: 0, expandedTargetAttempts: 0, prompt: null }, strategy, random)
    const resumePosition = { phase: 'expanded-trials' as const, step: 0, expandedTargetAttempts: 0, currentTarget: prompt.word, targetIndex: flow.targetIndex }
    return enterCorrection(updated, prompt.word, flow.correctionRole === 'earned-dt' ? 'earned-dt' : 'current-target', resumePosition, strategy, random)
  }

  if (flow.phase === 'expanded-trials') {
    const expandedTargetAttempts = flow.expandedTargetAttempts + 1
    const nextStep = flow.step + 1
    if (!correct) {
      const resumePosition = { phase: 'expanded-trials' as const, step: nextStep, expandedTargetAttempts, currentTarget: prompt.word, targetIndex: flow.targetIndex }
      return enterCorrection({ ...updated, expandedTargetAttempts }, prompt.word, flow.correctionRole === 'earned-dt' ? 'earned-dt' : 'current-target', resumePosition, strategy, random)
    }
    return nextStep >= strategy.expandedSequence.length
      ? completeCurrentTarget({ ...updated, expandedTargetAttempts, prompt: null }, targetSet, strategy, random)
      : coreAcquisitionPrompt({ ...updated, step: nextStep, expandedTargetAttempts, prompt: null }, strategy, random)
  }

  const finalCorrectionStep = strategy.correctionSequence.length - 1
  if (flow.step < finalCorrectionStep) return coreAcquisitionPrompt({ ...updated, step: flow.step + 1, prompt: null }, strategy, random)
  if (correct) {
    if (flow.correctionRole === 'earned-dt') return resumeInterruptedTarget(withEarnedWord(updated, prompt.word), strategy, random)
    const resume = updated.resumePosition
    if (resume && resume.step >= strategy.expandedSequence.length) {
      return completeCurrentTarget({ ...updated, targetIndex: resume.targetIndex, currentTarget: resume.currentTarget, correctionRole: undefined, resumePosition: undefined, prompt: null }, targetSet, strategy, random)
    }
    return resumeInterruptedTarget(updated, strategy, random)
  }
  return coreAcquisitionPrompt({ ...updated, step: 0, prompt: null }, strategy, random)
}
