import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Flag, Volume2 } from 'lucide-react'
import Phaser from 'phaser'
import type {
  ContextGameRound,
  LearningGameAttempt,
  LearningGameBaseProps,
  PlayLearningAudio,
} from './runtime/contracts'
import { LearningGameEmpty, LearningGameShell } from './runtime/GameShell'
import { playGameSound } from './runtime/gameFeel'
import { summarizeLearningGame, validContextRounds } from './runtime/model'

const GAME_WIDTH = 1280
const GAME_HEIGHT = 720
const KAITI_SC_FONT = '"Kaiti SC", KaiTi, STKaiti, serif'
const REGION_WIDTH = 3000
const WORLD_WIDTH = REGION_WIDTH * 3
const JOURNEY_LENGTH = 10
const AREA_SCROLL = [0, 600, 1200, 1720, 3000, 3860, 4720, 6000, 6600, 7720]
const AREA_NAMES = [
  'Dawn Starting Line',
  'Riverside Sprint',
  'Garden Promenade',
  'City Bridge Run',
  'Cloud Garden',
  'Rainline Tunnel',
  'Skybridge Pass',
  'Stadium Approach',
  'Champions Curve',
  'Victory Stadium',
]
const START_Y = 606
const DASH_ASSETS = {
  riverfront: new URL('./assets/riverfront-dawn-v1.webp', import.meta.url).href,
  skybridge: new URL('./assets/rain-skybridge-v1.webp', import.meta.url).href,
  stadium: new URL('./assets/victory-stadium-v1.webp', import.meta.url).href,
  ready: new URL('./assets/kai-ready-v1.webp', import.meta.url).href,
  sprint: new URL('./assets/kai-sprint-v1.webp', import.meta.url).href,
  celebrate: new URL('./assets/kai-celebrate-v1.webp', import.meta.url).href,
} as const

type FeedbackState = null | {
  readonly correct: boolean
  readonly answer: string
  readonly message: string
}

type DashSceneOptions = {
  readonly rounds: readonly ContextGameRound[]
  readonly reducedMotion: boolean
  readonly onAttempt: (roundIndex: number, choiceId: string, correct: boolean) => void
  readonly onProgress: (completed: number, correct: number, streak: number, bestStreak: number) => void
  readonly onRoundChange: (roundIndex: number) => void
  readonly onFeedback: (feedback: FeedbackState) => void
  readonly onChoicePreview: (choiceLabel: string) => void
  readonly onFinish: () => void
  readonly registerChoiceHandler: (handler: ((choiceIndex: number) => void) | null) => void
}

type GateView = {
  readonly container: Phaser.GameObjects.Container
  readonly frame: Phaser.GameObjects.Graphics
  readonly glow: Phaser.GameObjects.Ellipse
  readonly barrier: Phaser.GameObjects.Rectangle
  readonly panel: Phaser.GameObjects.Rectangle
  readonly label: Phaser.GameObjects.Text
  readonly choiceId: string
  readonly choiceLabel: string
}

type RunnerPose = 'ready' | 'sprint' | 'celebrate'

class ContextDashScene extends Phaser.Scene {
  private readonly options: DashSceneOptions
  private runner!: Phaser.GameObjects.Image
  private runnerShadow!: Phaser.GameObjects.Ellipse
  private sentenceText!: Phaser.GameObjects.Text
  private areaText!: Phaser.GameObjects.Text
  private instructionText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private atmosphereTint!: Phaser.GameObjects.Rectangle
  private gates: GateView[] = []
  private roundObjects: Phaser.GameObjects.GameObject[] = []
  private routeObjects: Phaser.GameObjects.GameObject[] = []
  private activeCallout?: Phaser.GameObjects.Container
  private results: boolean[] = []
  private roundIndex = 0
  private correctCount = 0
  private streak = 0
  private bestStreak = 0
  private acceptingInput = false
  private finaleStarted = false

  constructor(options: DashSceneOptions) {
    super({ key: 'ContextGapDashJourney' })
    this.options = options
  }

  private addMotionTween(config: Phaser.Types.Tweens.TweenBuilderConfig) {
    if (this.options.reducedMotion && config.repeat === -1) return
    this.tweens.add(this.options.reducedMotion
      ? { ...config, duration: 1, delay: 0, repeat: 0, yoyo: false }
      : config)
  }

  private addMotionCounter(config: Phaser.Types.Tweens.NumberTweenBuilderConfig) {
    this.tweens.addCounter(this.options.reducedMotion
      ? { ...config, duration: 1, delay: 0, repeat: 0, yoyo: false }
      : config)
  }

  preload() {
    this.load.image('dash-riverfront', DASH_ASSETS.riverfront)
    this.load.image('dash-skybridge', DASH_ASSETS.skybridge)
    this.load.image('dash-stadium', DASH_ASSETS.stadium)
    this.load.image('kai-ready', DASH_ASSETS.ready)
    this.load.image('kai-sprint', DASH_ASSETS.sprint)
    this.load.image('kai-celebrate', DASH_ASSETS.celebrate)
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT)
    this.cameras.main.scrollX = AREA_SCROLL[0]

    ;['dash-riverfront', 'dash-skybridge', 'dash-stadium'].forEach((key, regionIndex) => {
      this.add.image(regionIndex * REGION_WIDTH, -480, key)
        .setOrigin(0)
        .setDisplaySize(REGION_WIDTH, 1688)
        .setDepth(0)
    })

    this.add.rectangle(0, 0, WORLD_WIDTH, GAME_HEIGHT, 0x061421, 0.1).setOrigin(0).setDepth(1)
    this.atmosphereTint = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0f4352, 0.05)
      .setOrigin(0).setScrollFactor(0).setDepth(2)

    this.createTrackGlints()
    this.createHud()

    const startX = this.startXForArea(0)
    this.runnerShadow = this.add.ellipse(startX, START_Y + 8, 105, 24, 0x07131b, 0.48).setDepth(28)
    this.runner = this.add.image(startX, START_Y, 'kai-ready').setDepth(31)
    this.setRunnerPose('ready')

    this.input.keyboard?.on('keydown-ONE', () => this.chooseGate(0))
    this.input.keyboard?.on('keydown-TWO', () => this.chooseGate(1))
    this.input.keyboard?.on('keydown-THREE', () => this.chooseGate(2))
    this.input.keyboard?.on('keydown-NUMPAD_ONE', () => this.chooseGate(0))
    this.input.keyboard?.on('keydown-NUMPAD_TWO', () => this.chooseGate(1))
    this.input.keyboard?.on('keydown-NUMPAD_THREE', () => this.chooseGate(2))
    this.options.registerChoiceHandler((choiceIndex) => this.chooseGate(choiceIndex))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.options.registerChoiceHandler(null))

    this.game.canvas.setAttribute('aria-label', `Context Gap Dash with ${this.options.rounds.length} gates. Listen to the Mandarin sentence, hover over a gate to hear its word, then guide Kai through the best answer.`)
    this.game.canvas.setAttribute('tabindex', '0')
    this.renderRound()
  }

  private startXForArea(areaIndex: number) {
    return AREA_SCROLL[Math.min(areaIndex, AREA_SCROLL.length - 1)] + 154
  }

  private createTrackGlints() {
    for (let x = 90; x < WORLD_WIDTH; x += 235) {
      const dash = this.add.rectangle(x, 650, 105, 4, 0xffffff, 0.14).setDepth(4).setRotation(-0.015)
      this.addMotionTween({ targets: dash, alpha: { from: 0.06, to: 0.24 }, duration: 1400 + (x % 900), repeat: -1, yoyo: true })
    }
  }

  private createHud() {
    const panel = this.add.graphics().setScrollFactor(0).setDepth(100)
    panel.fillStyle(0x071520, 0.88)
    panel.fillRoundedRect(28, 22, GAME_WIDTH - 56, 158, 28)
    panel.lineStyle(2, 0x78ead7, 0.34)
    panel.strokeRoundedRect(28, 22, GAME_WIDTH - 56, 158, 28)

    this.areaText = this.add.text(61, 51, '', {
      fontFamily: KAITI_SC_FONT, fontSize: '16px', fontStyle: 'normal', color: '#83f1dc', letterSpacing: 2,
    }).setScrollFactor(0).setDepth(103).setOrigin(0, 0.5)

    this.scoreText = this.add.text(GAME_WIDTH - 61, 51, '', {
      fontFamily: KAITI_SC_FONT, fontSize: '16px', fontStyle: 'normal', color: '#ffe99b', letterSpacing: 1,
    }).setScrollFactor(0).setDepth(103).setOrigin(1, 0.5)

    this.sentenceText = this.add.text(GAME_WIDTH / 2, 103, '', {
      fontFamily: KAITI_SC_FONT,
      fontSize: '48px', fontStyle: 'normal', color: '#ffffff', align: 'center',
      stroke: '#07131c', strokeThickness: 8, wordWrap: { width: 900 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(103)

    this.instructionText = this.add.text(GAME_WIDTH / 2, 143, '', {
      fontFamily: KAITI_SC_FONT, fontSize: '13px', fontStyle: 'normal', color: '#b9d0da', letterSpacing: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(103)
  }

  private renderRound() {
    if (this.roundIndex >= this.options.rounds.length || this.finaleStarted) return

    this.clearRoundObjects()
    this.acceptingInput = false
    const round = this.options.rounds[this.roundIndex]
    const scrollX = AREA_SCROLL[this.roundIndex] ?? AREA_SCROLL[AREA_SCROLL.length - 1]
    const choices = round.choices.slice(0, 3)

    this.areaText.setText('CHECKPOINT ' + (this.roundIndex + 1) + '  ·  ' + AREA_NAMES[this.roundIndex])
    this.scoreText.setText(this.correctCount + ' FIRST-TRY  ·  ' + this.results.length + '/' + this.options.rounds.length + ' GATES')
    this.sentenceText.setText(round.sentenceBefore + '____' + round.sentenceAfter)
    this.instructionText.setText('HOVER TO HEAR EACH WORD  ·  CHOOSE THE BEST FIT')
    this.options.onRoundChange(this.roundIndex)
    this.options.onFeedback(null)
    this.drawRouteProgress()
    this.setAtmosphereForArea(this.roundIndex)
    this.createAreaDetails(this.roundIndex, scrollX)
    this.createStartingMarker(this.runner.x, START_Y)

    const positions = [
      { x: scrollX + 474, y: 520, rotation: -0.025 },
      { x: scrollX + 744, y: 588, rotation: 0.015 },
      { x: scrollX + 1026, y: 512, rotation: 0.024 },
    ]
    this.gates = choices.map((choice, index) => this.createGate(choice.id, choice.label, index, positions[index]))

    this.time.delayedCall(450, () => {
      if (!this.finaleStarted) this.acceptingInput = true
    })
  }

  private setAtmosphereForArea(areaIndex: number) {
    const palette = [
      { color: 0xffb14f, alpha: 0.035 }, { color: 0xffc066, alpha: 0.04 },
      { color: 0x49c5ad, alpha: 0.035 }, { color: 0x4aa8bd, alpha: 0.04 },
      { color: 0x7ca7b7, alpha: 0.07 }, { color: 0x3c7794, alpha: 0.08 },
      { color: 0x82d8d0, alpha: 0.05 }, { color: 0xff9a69, alpha: 0.045 },
      { color: 0xff725e, alpha: 0.055 }, { color: 0xffc45e, alpha: 0.06 },
    ][areaIndex] ?? { color: 0xffffff, alpha: 0.02 }
    this.atmosphereTint.setFillStyle(palette.color, palette.alpha)
  }

  private createStartingMarker(x: number, y: number) {
    const ring = this.add.ellipse(x, y + 16, 126, 37, 0x6ff1d6, 0).setStrokeStyle(3, 0x91f8e2, 0.48).setDepth(13)
    const line = this.add.rectangle(x - 56, y + 16, 8, 76, 0xffffff, 0.6).setDepth(12).setRotation(Math.PI / 2)
    this.roundObjects.push(ring, line)
    this.addMotionTween({ targets: ring, scaleX: 1.5, scaleY: 1.3, alpha: 0, duration: 1350, repeat: -1, ease: 'Sine.easeOut' })
  }

  private createGate(choiceId: string, choiceLabel: string, index: number, position: { x: number; y: number; rotation: number }): GateView {
    const container = this.add.container(position.x, position.y).setDepth(20).setRotation(position.rotation)
    const ground = this.add.ellipse(0, 15, 212, 42, 0x071b25, 0.5)
    const glow = this.add.ellipse(0, 3, 220, 70, 0x65ecd2, 0.08)
    const barrier = this.add.rectangle(0, -57, 141, 103, 0x53e5d0, 0.12).setStrokeStyle(2, 0xb6fff3, 0.28)
    const frame = this.add.graphics()
    this.drawGateFrame(frame, 0xc9eef0)
    const panel = this.add.rectangle(0, -111, 166, 67, 0x0b3440, 0.95).setStrokeStyle(3, 0x79efda, 0.82)
    const shine = this.add.rectangle(0, -128, 142, 12, 0xffffff, 0.09)
    const label = this.add.text(0, -108, choiceLabel, {
      fontFamily: KAITI_SC_FONT, fontSize: '48px', fontStyle: 'normal', color: '#ffffff',
      stroke: '#04151d', strokeThickness: 5,
    }).setOrigin(0.5)
    const key = this.add.text(-88, -151, String(index + 1), {
      fontFamily: KAITI_SC_FONT, fontSize: '15px', fontStyle: 'normal', color: '#0a3636', backgroundColor: '#d7fff1', padding: { x: 8, y: 5 },
    }).setOrigin(0.5)
    const chevrons = this.add.text(0, -22, '›  ›  ›', {
      fontFamily: KAITI_SC_FONT, fontSize: '25px', fontStyle: 'normal', color: '#86f3de', letterSpacing: 4,
    }).setOrigin(0.5).setAlpha(0.62)

    container.add([ground, glow, barrier, frame, panel, shine, label, key, chevrons])
    container.setSize(222, 194).setInteractive({ useHandCursor: true })
    container.on('pointerover', () => {
      this.options.onChoicePreview(choiceLabel)
      if (!this.acceptingInput) return
      glow.setFillStyle(0xa4ffe9, 0.34)
      this.addMotionTween({ targets: container, scale: 1.065, duration: 140, ease: 'Back.easeOut' })
    })
    container.on('pointerout', () => {
      if (!this.acceptingInput) return
      glow.setFillStyle(0x65ecd2, 0.08)
      this.addMotionTween({ targets: container, scale: 1, duration: 130 })
    })
    container.on('pointerdown', () => this.chooseGate(index))
    container.setAlpha(0).setScale(0.7)
    this.addMotionTween({ targets: container, alpha: 1, scale: 1, duration: 470, delay: 80 + index * 105, ease: 'Back.easeOut' })
    this.addMotionTween({ targets: chevrons, x: 9, alpha: { from: 0.28, to: 0.88 }, duration: 820 + index * 90, repeat: -1, yoyo: true })
    this.roundObjects.push(container)

    return { container, frame, glow, barrier, panel, label, choiceId, choiceLabel }
  }

  private drawGateFrame(frame: Phaser.GameObjects.Graphics, color: number) {
    frame.clear()
    frame.lineStyle(11, color, 0.95)
    frame.strokeRoundedRect(-86, -154, 172, 154, 34)
    frame.fillStyle(0x1d4950, 1)
    frame.fillRoundedRect(-104, -9, 38, 21, 7)
    frame.fillRoundedRect(66, -9, 38, 21, 7)
  }

  private chooseGate(choiceIndex: number) {
    const gate = this.gates[choiceIndex]
    const round = this.options.rounds[this.roundIndex]
    if (!this.acceptingInput || !gate || !round) return

    this.acceptingInput = false
    this.gates.forEach((view) => view.container.disableInteractive())
    const correct = gate.choiceId === round.correctChoiceId
    const safeGate = this.gates.find((view) => view.choiceId === round.correctChoiceId)
    const safeAnswer = safeGate?.choiceLabel || round.targetText
    this.sentenceText.setText(round.sentenceBefore + safeAnswer + round.sentenceAfter)

    this.options.onAttempt(this.roundIndex, gate.choiceId, correct)
    this.results.push(correct)
    if (correct) {
      this.correctCount += 1
      this.streak += 1
      this.bestStreak = Math.max(this.bestStreak, this.streak)
    } else {
      this.streak = 0
    }
    this.options.onProgress(this.results.length, this.correctCount, this.streak, this.bestStreak)
    this.scoreText.setText(this.correctCount + ' FIRST-TRY  ·  ' + this.results.length + '/' + this.options.rounds.length + ' GATES')
    this.drawRouteProgress()

    if (correct) {
      playGameSound('correct')
      this.playCorrectGate(gate)
    } else {
      playGameSound('incorrect')
      this.playMissAndReroute(gate, safeGate, safeAnswer)
    }
  }

  private playCorrectGate(gate: GateView) {
    this.paintGate(gate, true)
    this.options.onFeedback({ correct: true, answer: gate.choiceLabel, message: 'Gate open. Kai is racing to the next checkpoint.' })
    this.showCallout(gate.container.x, gate.container.y - 184, 'GATE OPEN!', this.rewardCopyForArea(), true)
    this.runRunnerTo(gate.container.x, gate.container.y + 9, 820, () => {
      this.openGate(gate)
      this.createSpeedBurst(gate.container.x, gate.container.y - 32, 0x82f5d7)
      this.playCheckpointReward(this.roundIndex, gate.container.x, gate.container.y)
      this.time.delayedCall(920, () => this.advanceJourney())
    })
  }

  private playMissAndReroute(chosenGate: GateView, safeGate: GateView | undefined, safeAnswer: string) {
    this.paintGate(chosenGate, false)
    if (safeGate) {
      this.paintGate(safeGate, true)
      this.addMotionTween({ targets: safeGate.container, scale: 1.07, duration: 220, repeat: 2, yoyo: true })
    }
    this.options.onFeedback({ correct: false, answer: safeAnswer, message: 'Barrier hit. The safe gate is highlighted and Kai will reroute automatically.' })
    this.showCallout(chosenGate.container.x, chosenGate.container.y - 184, 'BARRIER!', 'SAFE GATE  →  ' + safeAnswer, false)

    this.runRunnerTo(chosenGate.container.x - 102, chosenGate.container.y + 10, 650, () => {
      if (!this.options.reducedMotion) this.cameras.main.shake(240, 0.006)
      this.createBarrierImpact(chosenGate.container.x - 62, chosenGate.container.y - 49)
      this.setRunnerPose('ready')
      this.time.delayedCall(650, () => {
        if (!safeGate) {
          this.advanceJourney()
          return
        }
        this.runRunnerTo(safeGate.container.x, safeGate.container.y + 9, 820, () => {
          this.openGate(safeGate)
          this.createSpeedBurst(safeGate.container.x, safeGate.container.y - 30, 0x9dffe3)
          playGameSound('progress')
          this.time.delayedCall(760, () => this.advanceJourney())
        })
      })
    })
  }

  private paintGate(gate: GateView, correct: boolean) {
    const frameColor = correct ? 0xd9ff9b : 0xffa064
    this.drawGateFrame(gate.frame, frameColor)
    gate.glow.setFillStyle(correct ? 0xc5ff89 : 0xff7a55, 0.48)
    gate.barrier.setFillStyle(correct ? 0x78efc5 : 0xff6b55, correct ? 0.08 : 0.58)
    gate.barrier.setStrokeStyle(3, correct ? 0xd8ffb0 : 0xffd09f, 0.86)
    gate.panel.setFillStyle(correct ? 0x246b50 : 0x743a31, 1)
  }

  private openGate(gate: GateView) {
    this.addMotionTween({ targets: gate.barrier, alpha: 0, scaleY: 0.08, duration: 320, ease: 'Cubic.easeIn' })
    this.addMotionTween({ targets: gate.glow, scaleX: 1.45, scaleY: 1.4, alpha: 0, duration: 680, ease: 'Sine.easeOut' })
  }

  private runRunnerTo(targetX: number, targetY: number, duration: number, onComplete: () => void) {
    const startX = this.runner.x
    const startY = this.runner.y
    const startShadowX = this.runnerShadow.x
    const startShadowY = this.runnerShadow.y
    this.setRunnerPose('sprint')
    this.runner.setFlipX(targetX < startX)
    const baseScaleX = Math.abs(this.runner.scaleX)
    const baseScaleY = this.runner.scaleY
    this.createSpeedTrail(startX, targetX, startY)

    this.addMotionCounter({
      from: 0, to: 1, duration, ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const progress = tween.getValue() || 0
        const stride = Math.abs(Math.sin(progress * Math.PI * 7))
        this.runner.x = Phaser.Math.Linear(startX, targetX, progress)
        this.runner.y = Phaser.Math.Linear(startY, targetY, progress) - stride * 8
        this.runner.setScale(baseScaleX * (1 + stride * 0.035), baseScaleY * (1 - stride * 0.025))
        this.runnerShadow.x = Phaser.Math.Linear(startShadowX, targetX, progress)
        this.runnerShadow.y = Phaser.Math.Linear(startShadowY, targetY + 8, progress)
        this.runnerShadow.setScale(1 - stride * 0.2)
      },
      onComplete: () => {
        this.runner.setFlipX(false)
        this.setRunnerPose('ready')
        this.runner.setPosition(targetX, targetY)
        this.runnerShadow.setPosition(targetX, targetY + 8).setScale(1)
        onComplete()
      },
    })
  }

  private setRunnerPose(pose: RunnerPose) {
    const config = {
      ready: { key: 'kai-ready', width: 151, height: 181 },
      sprint: { key: 'kai-sprint', width: 190, height: 228 },
      celebrate: { key: 'kai-celebrate', width: 170, height: 204 },
    }[pose]
    this.runner.setTexture(config.key).setOrigin(0.5, 0.92).setDisplaySize(config.width, config.height)
  }

  private advanceJourney() {
    if (this.roundIndex >= this.options.rounds.length - 1) {
      this.playJourneyFinale()
      return
    }
    this.acceptingInput = false
    if (this.activeCallout?.active) {
      this.activeCallout.destroy()
      this.activeCallout = undefined
    }
    const nextIndex = this.roundIndex + 1
    const nextScroll = AREA_SCROLL[nextIndex]
    const targetX = this.startXForArea(nextIndex)
    const startX = this.runner.x
    const startY = this.runner.y
    const startScroll = this.cameras.main.scrollX
    const distance = Math.abs(nextScroll - startScroll)
    const travelDuration = Math.min(2300, 1200 + distance * 0.72)

    this.instructionText.setText('RACING TO ' + AREA_NAMES[nextIndex].toUpperCase() + '…')
    this.gates.forEach((gate) => this.addMotionTween({ targets: gate.container, alpha: 0.12, duration: 320 }))
    this.setRunnerPose('sprint')
    const baseScaleX = this.runner.scaleX
    const baseScaleY = this.runner.scaleY
    this.createSpeedTrail(startX, targetX, startY)

    this.addMotionCounter({
      from: 0, to: 1, duration: travelDuration, ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const progress = tween.getValue() || 0
        const stride = Math.abs(Math.sin(progress * Math.PI * 10))
        this.cameras.main.scrollX = Phaser.Math.Linear(startScroll, nextScroll, progress)
        this.runner.x = Phaser.Math.Linear(startX, targetX, progress)
        this.runner.y = Phaser.Math.Linear(startY, START_Y, progress) - stride * 9
        this.runner.setScale(baseScaleX * (1 + stride * 0.03), baseScaleY * (1 - stride * 0.022))
        this.runnerShadow.x = this.runner.x
        this.runnerShadow.y = Phaser.Math.Linear(startY + 8, START_Y + 8, progress)
        this.runnerShadow.setScale(1 - stride * 0.18)
      },
      onComplete: () => {
        this.roundIndex = nextIndex
        this.cameras.main.scrollX = nextScroll
        this.setRunnerPose('ready')
        this.runner.setPosition(targetX, START_Y)
        this.runnerShadow.setPosition(targetX, START_Y + 8).setScale(1)
        if (nextIndex === 4 || nextIndex === 7) if (!this.options.reducedMotion) this.cameras.main.flash(420, 145, 245, 225, false)
        this.renderRound()
      },
    })
  }

  private playJourneyFinale() {
    if (this.finaleStarted) return
    this.finaleStarted = true
    this.acceptingInput = false
    if (this.activeCallout?.active) this.activeCallout.destroy()
    this.options.onFeedback(null)
    this.areaText.setText('DESTINATION  ·  VICTORY STADIUM')
    this.sentenceText.setText('Kai crossed the championship finish!')
    this.instructionText.setText(`${this.options.rounds.length} SENTENCES  ·  VICTORY ROUTE COMPLETE`)
    this.gates.forEach((gate) => gate.container.disableInteractive())
    const destinationX = AREA_SCROLL[Math.max(0, this.options.rounds.length - 1)] + 1115
    const destinationY = 598

    this.runRunnerTo(destinationX, destinationY, 880, () => {
      this.setRunnerPose('celebrate')
      this.runner.setPosition(destinationX, destinationY - 8)
      this.runnerShadow.setPosition(destinationX, destinationY + 8).setScale(1.15)
      this.addMotionTween({ targets: this.runner, y: destinationY - 27, rotation: -0.025, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      if (!this.options.reducedMotion) this.cameras.main.flash(520, 255, 226, 124, false)
      playGameSound('victory')
      this.createSpeedBurst(destinationX, destinationY - 85, 0xffda62)
      this.createSpeedBurst(destinationX, destinationY - 52, 0x72efcf)
      this.launchCelebration(destinationX)
      this.time.delayedCall(1850, this.options.onFinish)
    })
  }

  private rewardCopyForArea() {
    return [
      'START BOOST EARNED', 'RIVER BADGE UNLOCKED', 'GARDEN STREAK LIT', 'BRIDGE BOOST CLAIMED',
      'RAIN CHARM EARNED', 'TUNNEL LIGHTS ACTIVATED', 'SKYBRIDGE CROWN WON', 'STADIUM PASS UNLOCKED',
      'CHAMPIONS CURVE CLEARED', 'VICTORY STADIUM REACHED',
    ][this.roundIndex] ?? 'CHECKPOINT CLEARED'
  }

  private playCheckpointReward(areaIndex: number, x: number, y: number) {
    const palettes = [
      [0xffd266, 0x79efd0], [0x7debd3, 0xffed9d], [0xff9fc1, 0x7ee8bd], [0x6eddf1, 0xffcb64],
      [0xa8eaff, 0xffffff], [0x85dfff, 0xffdc75], [0x8effd5, 0xd2b7ff], [0xffb075, 0x79efd0],
      [0xff806d, 0xffdc70], [0xffd45d, 0xff8ba8],
    ]
    const colors = palettes[areaIndex] ?? palettes[0]
    for (let index = 0; index < 16; index += 1) {
      const angle = (Math.PI * 2 * index) / 16
      const spark = this.add.rectangle(x, y - 42, index % 3 === 0 ? 9 : 5, index % 3 === 0 ? 22 : 11, colors[index % 2], 0.94)
        .setDepth(60).setRotation(angle)
      this.addMotionTween({
        targets: spark,
        x: x + Math.cos(angle) * Phaser.Math.Between(75, 160),
        y: y - 45 + Math.sin(angle) * Phaser.Math.Between(55, 125),
        rotation: angle + 4, scale: 0.2, alpha: 0, duration: 900, delay: index * 22,
        ease: 'Cubic.easeOut', onComplete: () => spark.destroy(),
      })
    }
  }

  private showCallout(x: number, y: number, title: string, subtitle: string, correct: boolean) {
    this.activeCallout?.destroy()
    const safeY = Math.max(242, y)
    const container = this.add.container(x, safeY).setDepth(88)
    this.activeCallout = container
    const panel = this.add.graphics()
    panel.fillStyle(correct ? 0xc9ff9a : 0xffb56d, 0.97)
    panel.fillRoundedRect(-185, -45, 370, 90, 20)
    panel.lineStyle(3, 0xffffff, 0.75)
    panel.strokeRoundedRect(-185, -45, 370, 90, 20)
    const heading = this.add.text(0, -14, title, { fontFamily: KAITI_SC_FONT, fontSize: '22px', fontStyle: 'normal', color: '#173328' }).setOrigin(0.5)
    const detail = this.add.text(0, 18, subtitle, { fontFamily: KAITI_SC_FONT, fontSize: '13px', fontStyle: 'normal', color: '#345144', letterSpacing: 1 }).setOrigin(0.5)
    container.add([panel, heading, detail]).setAlpha(0).setScale(0.72)
    this.roundObjects.push(container)
    this.addMotionTween({ targets: container, alpha: 1, scale: 1, y: safeY - 10, duration: 360, ease: 'Back.easeOut' })
  }

  private createAreaDetails(areaIndex: number, scrollX: number) {
    if (areaIndex <= 1) return this.createFloatingMotes(scrollX, 18, areaIndex === 0 ? 0xffd16b : 0x8df4d7)
    if (areaIndex <= 3) return this.createPetals(scrollX, 19)
    if (areaIndex <= 5) {
      this.createRain(scrollX, areaIndex === 5 ? 38 : 26)
      return this.createFloatingMotes(scrollX, 10, 0xb9efff)
    }
    if (areaIndex === 6) return this.createLightStreaks(scrollX, 20, 0x87f6dc)
    if (areaIndex === 7) return this.createLightStreaks(scrollX, 24, 0xffb06e)
    if (areaIndex === 8) {
      this.createPetals(scrollX, 24)
      return this.createLightStreaks(scrollX, 18, 0xffd16b)
    }
    this.createFloatingMotes(scrollX, 28, 0xffdc70)
    this.createPetals(scrollX, 28)
  }

  private createFloatingMotes(scrollX: number, count: number, color: number) {
    for (let index = 0; index < count; index += 1) {
      const mote = this.add.circle(scrollX + Phaser.Math.Between(40, GAME_WIDTH - 40), Phaser.Math.Between(210, 665), Phaser.Math.Between(2, 5), color, Phaser.Math.FloatBetween(0.25, 0.8))
        .setDepth(11).setBlendMode(Phaser.BlendModes.ADD)
      this.roundObjects.push(mote)
      this.addMotionTween({ targets: mote, x: mote.x + Phaser.Math.Between(-36, 55), y: mote.y + Phaser.Math.Between(-40, 26), alpha: { from: 0.16, to: 0.92 }, duration: Phaser.Math.Between(1300, 2700), repeat: -1, yoyo: true })
    }
  }

  private createPetals(scrollX: number, count: number) {
    for (let index = 0; index < count; index += 1) {
      const petal = this.add.ellipse(scrollX + Phaser.Math.Between(30, GAME_WIDTH - 30), Phaser.Math.Between(190, 620), Phaser.Math.Between(7, 13), Phaser.Math.Between(3, 7), index % 2 ? 0xffb4c9 : 0xffe8a0, Phaser.Math.FloatBetween(0.38, 0.82))
        .setDepth(12).setRotation(Phaser.Math.FloatBetween(0, Math.PI))
      this.roundObjects.push(petal)
      this.addMotionTween({ targets: petal, x: petal.x + Phaser.Math.Between(-45, 80), y: petal.y + Phaser.Math.Between(70, 150), rotation: petal.rotation + Phaser.Math.FloatBetween(2, 5), alpha: 0.05, duration: Phaser.Math.Between(2500, 4500), repeat: -1 })
    }
  }

  private createRain(scrollX: number, count: number) {
    for (let index = 0; index < count; index += 1) {
      const drop = this.add.rectangle(scrollX + Phaser.Math.Between(20, GAME_WIDTH - 20), Phaser.Math.Between(175, 650), 2, Phaser.Math.Between(16, 34), 0xd7f7ff, Phaser.Math.FloatBetween(0.14, 0.38))
        .setDepth(12).setRotation(-0.1)
      this.roundObjects.push(drop)
      this.addMotionTween({ targets: drop, x: drop.x - 38, y: drop.y + 190, alpha: 0, duration: Phaser.Math.Between(620, 1050), delay: Phaser.Math.Between(0, 550), repeat: -1 })
    }
  }

  private createLightStreaks(scrollX: number, count: number, color: number) {
    for (let index = 0; index < count; index += 1) {
      const streak = this.add.rectangle(scrollX + Phaser.Math.Between(60, GAME_WIDTH - 60), Phaser.Math.Between(250, 655), Phaser.Math.Between(45, 120), 3, color, Phaser.Math.FloatBetween(0.08, 0.3)).setDepth(11)
      this.roundObjects.push(streak)
      this.addMotionTween({ targets: streak, x: streak.x + Phaser.Math.Between(90, 220), alpha: 0, duration: Phaser.Math.Between(900, 1800), delay: index * 55, repeat: -1 })
    }
  }

  private createSpeedTrail(startX: number, endX: number, y: number) {
    for (let index = 0; index < 18; index += 1) {
      const trail = this.add.rectangle(startX - 20, y - Phaser.Math.Between(25, 145), Phaser.Math.Between(24, 70), 3, index % 2 ? 0x77edd4 : 0xffd671, 0.72).setDepth(29)
      this.addMotionTween({ targets: trail, x: Phaser.Math.Linear(startX, endX, index / 17) - Phaser.Math.Between(25, 80), alpha: 0, scaleX: 0.2, duration: 650, delay: index * 38, onComplete: () => trail.destroy() })
    }
  }

  private createBarrierImpact(x: number, y: number) {
    for (let index = 0; index < 24; index += 1) {
      const angle = (Math.PI * 2 * index) / 24
      const shard = this.add.triangle(x, y, 0, -8, 6, 6, -6, 6, index % 2 ? 0xff9a66 : 0xffdc9d, 0.94).setDepth(63).setRotation(angle)
      this.addMotionTween({ targets: shard, x: x + Math.cos(angle) * Phaser.Math.Between(45, 125), y: y + Math.sin(angle) * Phaser.Math.Between(35, 100), rotation: angle + 4, alpha: 0, duration: 720, ease: 'Cubic.easeOut', onComplete: () => shard.destroy() })
    }
  }

  private createSpeedBurst(x: number, y: number, color: number) {
    for (let index = 0; index < 20; index += 1) {
      const angle = (Math.PI * 2 * index) / 20
      const ray = this.add.rectangle(x, y, 6, Phaser.Math.Between(28, 66), color, 0.9).setDepth(62).setRotation(angle)
      this.addMotionTween({ targets: ray, x: x + Math.sin(angle) * Phaser.Math.Between(60, 145), y: y - Math.cos(angle) * Phaser.Math.Between(45, 115), scaleY: 0.2, alpha: 0, duration: 720, ease: 'Cubic.easeOut', onComplete: () => ray.destroy() })
    }
  }

  private drawRouteProgress() {
    this.routeObjects.forEach((object) => object.destroy())
    this.routeObjects = []
    const graphics = this.add.graphics().setScrollFactor(0).setDepth(104)
    const startX = 408
    const endX = 872
    const y = 164
    graphics.lineStyle(5, 0xffffff, 0.13)
    graphics.lineBetween(startX, y, endX, y)
    if (this.results.length) {
      graphics.lineStyle(5, 0x79ead2, 0.96)
      graphics.lineBetween(startX, y, Phaser.Math.Linear(startX, endX, this.results.length / this.options.rounds.length), y)
    }
    for (let index = 0; index <= this.options.rounds.length; index += 1) {
      const x = Phaser.Math.Linear(startX, endX, index / this.options.rounds.length)
      const completed = index <= this.results.length
      const lastResult = index > 0 ? this.results[index - 1] : true
      graphics.fillStyle(completed ? lastResult ? 0xd9ff8c : 0x85e9db : 0x294652, 1)
      graphics.fillCircle(x, y, index === this.results.length ? 8 : 6)
      graphics.lineStyle(2, completed ? 0xffffff : 0x6d838c, 0.82)
      graphics.strokeCircle(x, y, index === this.results.length ? 8 : 6)
    }
    this.routeObjects.push(graphics)
  }

  private launchCelebration(centerX: number) {
    const colors = [0xffd95d, 0xff7f9d, 0x7be9cf, 0x9b8fff, 0xffffff]
    for (let index = 0; index < 82; index += 1) {
      const piece = this.add.rectangle(centerX + Phaser.Math.Between(-520, 420), Phaser.Math.Between(-180, -20), Phaser.Math.Between(7, 13), Phaser.Math.Between(12, 23), Phaser.Utils.Array.GetRandom(colors), 0.95)
        .setDepth(120).setRotation(Phaser.Math.FloatBetween(0, Math.PI))
      this.addMotionTween({ targets: piece, y: GAME_HEIGHT + 70, x: piece.x + Phaser.Math.Between(-110, 110), rotation: piece.rotation + Phaser.Math.FloatBetween(4, 10), duration: Phaser.Math.Between(2300, 4000), delay: Phaser.Math.Between(0, 900), ease: 'Sine.easeIn', repeat: -1 })
    }
  }

  private clearRoundObjects() {
    this.gates = []
    this.roundObjects.forEach((object) => {
      if (object.active) object.destroy()
    })
    this.roundObjects = []
    this.activeCallout = undefined
  }
}

export function ContextGapDash({
  rounds,
  playAudio,
  title = 'Context Gap Dash',
  eyebrow,
  onExit,
  onAttempt,
  onComplete,
}: LearningGameBaseProps & {
  readonly rounds: readonly ContextGameRound[]
  readonly playAudio?: PlayLearningAudio
}) {
  const playableRounds = rounds
  const hostRef = useRef<HTMLDivElement>(null)
  const attemptsRef = useRef<LearningGameAttempt[]>([])
  const choiceHandlerRef = useRef<((choiceIndex: number) => void) | null>(null)
  const playAudioRef = useRef(playAudio)
  const lastChoicePreviewRef = useRef({ label: '', time: 0 })
  const [completed, setCompleted] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [roundIndex, setRoundIndex] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [finished, setFinished] = useState(false)
  const valid = playableRounds.length <= JOURNEY_LENGTH
    && validContextRounds(playableRounds)
    && playableRounds.every((round) => round.choices.length >= 3)
  const currentRound = playableRounds[Math.min(roundIndex, playableRounds.length - 1)]
  const contextAudioText = currentRound?.audioText || currentRound?.cueText || ''

  useEffect(() => {
    playAudioRef.current = playAudio
  }, [playAudio])

  const playLearningText = useCallback((text: string, language: string, playbackRate = 1) => {
    if (!text || !playAudioRef.current) return
    try {
      void Promise.resolve(playAudioRef.current(text, language, playbackRate)).catch(() => undefined)
    } catch {
      // Audio is enrichment; a playback failure should never stop the race.
    }
  }, [])

  const previewChoice = useCallback((choiceLabel: string) => {
    const now = performance.now()
    const lastPreview = lastChoicePreviewRef.current
    if (lastPreview.label === choiceLabel && now - lastPreview.time < 400) return
    lastChoicePreviewRef.current = { label: choiceLabel, time: now }
    playLearningText(choiceLabel, 'zh-CN')
  }, [playLearningText])

  const replayContext = useCallback(() => {
    playLearningText(contextAudioText, 'zh-CN', 0.75)
  }, [contextAudioText, playLearningText])

  useEffect(() => {
    if (!contextAudioText || !playAudio || finished) return
    const timer = window.setTimeout(() => playLearningText(contextAudioText, 'zh-CN', 0.75), 350)
    return () => window.clearTimeout(timer)
  }, [contextAudioText, finished, playAudio, playLearningText])

  const handleAttempt = useCallback((index: number, choiceId: string, wasCorrect: boolean) => {
    const round = playableRounds[index]
    if (!round) return
    const attempt: LearningGameAttempt = {
      gameId: 'context-gap-dash', promptId: round.id, targetId: round.targetId,
      correct: wasCorrect, response: choiceId, assessmentMode: 'automatic',
    }
    attemptsRef.current.push(attempt)
    onAttempt?.(attempt)
  }, [onAttempt, playableRounds])

  useEffect(() => {
    if (!valid || !hostRef.current) return
    const scene = new ContextDashScene({
      rounds: playableRounds,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onAttempt: handleAttempt,
      onProgress: (nextCompleted, nextCorrect, nextStreak, nextBest) => {
        setCompleted(nextCompleted)
        setCorrect(nextCorrect)
        setStreak(nextStreak)
        setBestStreak(nextBest)
      },
      onRoundChange: setRoundIndex,
      onFeedback: setFeedback,
      onChoicePreview: previewChoice,
      onFinish: () => setFinished(true),
      registerChoiceHandler: (handler) => { choiceHandlerRef.current = handler },
    })
    const game = new Phaser.Game({
      type: Phaser.AUTO, width: GAME_WIDTH, height: GAME_HEIGHT, parent: hostRef.current,
      backgroundColor: '#081923', transparent: false, render: { antialias: true, roundPixels: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [scene],
    })
    return () => game.destroy(true)
  }, [handleAttempt, playableRounds, previewChoice, valid])

  const finish = useCallback(() => {
    onComplete(summarizeLearningGame('context-gap-dash', attemptsRef.current))
  }, [onComplete])

  const busy = Boolean(feedback) || finished
  const stageStyle = { '--dash-progress': (playableRounds.length ? (completed / playableRounds.length) * 100 : 0) + '%' } as CSSProperties

  return <LearningGameShell
    gameId="context-gap-dash"
    title={title}
    eyebrow={eyebrow || `A ${playableRounds.length}-gate cinematic reading race`}
    progress={completed + '/' + playableRounds.length + ' gates'}
    onExit={onExit}
  >
    {!valid ? <LearningGameEmpty onExit={onExit} message={`Context Gap Dash requires 1–${JOURNEY_LENGTH} rounds with at least three choices each.`} /> : <section className="lg-phaser-lily-card lg-phaser-dash-card" style={stageStyle}>
      <div className="lg-phaser-meta" aria-live="polite">
        <span><strong>{correct}</strong> first-try gates</span>
        <span><strong>{streak}</strong> momentum</span>
        <span><strong>{bestStreak}</strong> best run</span>
      </div>
      <div className="lg-dash-context-clue">
        <span><Volume2 size={18} aria-hidden="true" /> Chinese sentence</span>
        <strong>{currentRound?.cueText}</strong>
        <button type="button" onClick={replayContext} disabled={finished || !contextAudioText || !playAudio}>
          <Volume2 size={16} aria-hidden="true" /> Replay sentence
        </button>
      </div>
      <div className="lg-phaser-stage-wrap lg-dash-stage-wrap">
        <div ref={hostRef} className="lg-phaser-stage" />
      </div>
      {!finished && <div className="lg-mobile-gate-choices" role="group" aria-label="Touch-friendly answer gates">
        {currentRound?.choices.slice(0, 3).map((choice, index) => <button key={choice.id} type="button" disabled={busy} onPointerEnter={() => previewChoice(choice.label)} onFocus={() => previewChoice(choice.label)} onClick={() => choiceHandlerRef.current?.(index)}><small>{index + 1}</small><strong>{choice.label}</strong></button>)}
        <span className="lg-mobile-feedback" role="status">{feedback?.message}</span>
      </div>}
      <div className="lg-canvas-access" role="group" aria-label="Context-gap answer choices">
        <span role="status">{feedback?.message}</span>
        {!finished && currentRound?.choices.slice(0, 3).map((choice, index) => <button key={choice.id} type="button" disabled={busy} onFocus={() => previewChoice(choice.label)} onClick={() => choiceHandlerRef.current?.(index)}>{choice.accessibleLabel || choice.label}</button>)}
      </div>
      {finished ? <div className="lg-phaser-finish-actions lg-dash-finish-actions" aria-live="polite">
        <span><Flag size={18} /> Victory Stadium reached</span>
        <strong>{correct}/{playableRounds.length} first-try gates</strong>
        <button type="button" onClick={finish}>Celebrate and finish</button>
      </div> : <p className="lg-phaser-help">Hover a gate to hear its word · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> choose · the race continues automatically</p>}
    </section>}
  </LearningGameShell>
}
