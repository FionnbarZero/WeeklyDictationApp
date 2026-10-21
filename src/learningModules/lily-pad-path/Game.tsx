import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { activityClock } from '../../activity/activityLifecycle.ts'
import { stopActiveAudio } from '../../audio/promptAudio.ts'
import { Flag, Headphones } from 'lucide-react'
import Phaser from 'phaser'
import type {
  LearningGameAttempt,
  LearningGameBaseProps,
  PlayLearningAudio,
  SelectionGameRound,
} from './runtime/contracts'
import { LearningGameEmpty, LearningGameShell } from './runtime/GameShell'
import { playGameSound } from './runtime/gameFeel'
import { summarizeLearningGame, validSelectionRounds } from './runtime/model'

const GAME_WIDTH = 1280
const GAME_HEIGHT = 720
const REGION_WIDTH = 3000
const WORLD_WIDTH = REGION_WIDTH * 3
const JOURNEY_LENGTH = 10
const AREA_SCROLL = [0, 600, 1200, 1720, 3000, 3860, 4720, 6000, 6860, 7720]
const AREA_NAMES = [
  'Moonlit Marsh',
  'Firefly Reeds',
  'Silver Moon Gate',
  'Lotus Channel',
  'Rain Garden',
  'Waterfall Crossing',
  'Koi Bridge',
  'Sunset Lagoon',
  'Lantern Cove',
  'Celebration Shore',
]
const START_Y = 582
const POND_ASSETS = {
  night: new URL('./assets/moonlit-marsh-v2.webp', import.meta.url).href,
  waterfall: new URL('./assets/waterfall-gardens-v2.webp', import.meta.url).href,
  sunset: new URL('./assets/enchanted-pond.webp', import.meta.url).href,
  scoutIdle: new URL('./assets/scout-frog.webp', import.meta.url).href,
  scoutCrouch: new URL('./assets/scout-crouch-v2.webp', import.meta.url).href,
  scoutCelebrate: new URL('./assets/scout-celebrate-v2.webp', import.meta.url).href,
} as const

type FeedbackState = null | {
  readonly correct: boolean
  readonly answer: string
  readonly message: string
}

type PondSceneOptions = {
  readonly rounds: readonly SelectionGameRound[]
  readonly reducedMotion: boolean
  readonly playAudio?: PlayLearningAudio
  readonly onAttempt: (roundIndex: number, choiceId: string, correct: boolean) => void
  readonly onProgress: (completed: number, correct: number, streak: number, bestStreak: number) => void
  readonly onRoundChange: (roundIndex: number) => void
  readonly onInputReady: (ready: boolean) => void
  readonly onFeedback: (feedback: FeedbackState) => void
  readonly onFinish: () => void
  readonly registerChoiceHandler: (handler: ((choiceIndex: number) => void) | null) => void
}

type PadView = {
  readonly container: Phaser.GameObjects.Container
  readonly glow: Phaser.GameObjects.Ellipse
  readonly plate: Phaser.GameObjects.Ellipse
  readonly label: Phaser.GameObjects.Text
  readonly choiceId: string
  readonly choiceLabel: string
}

type FrogPose = 'idle' | 'crouch' | 'celebrate'

class LilyPondScene extends Phaser.Scene {
  private readonly options: PondSceneOptions
  private frog!: Phaser.GameObjects.Image
  private frogShadow!: Phaser.GameObjects.Ellipse
  private promptText!: Phaser.GameObjects.Text
  private areaText!: Phaser.GameObjects.Text
  private instructionText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private atmosphereTint!: Phaser.GameObjects.Rectangle
  private pads: PadView[] = []
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

  constructor(options: PondSceneOptions) {
    super({ key: 'LilyPondVerticalSlice' })
    this.options = options
  }

  private addMotionTween(config: Phaser.Types.Tweens.TweenBuilderConfig) {
    if (this.options.reducedMotion && config.repeat === -1) return
    this.tweens.add(this.options.reducedMotion ? { ...config, duration: 1, delay: 0, repeat: 0, yoyo: false } : config)
  }

  private addMotionCounter(config: Phaser.Types.Tweens.NumberTweenBuilderConfig) {
    this.tweens.addCounter(
      this.options.reducedMotion ? { ...config, duration: 1, delay: 0, repeat: 0, yoyo: false } : config,
    )
  }

  preload() {
    this.load.image('pond-night', POND_ASSETS.night)
    this.load.image('pond-waterfall', POND_ASSETS.waterfall)
    this.load.image('pond-sunset', POND_ASSETS.sunset)
    this.load.image('scout-idle', POND_ASSETS.scoutIdle)
    this.load.image('scout-crouch', POND_ASSETS.scoutCrouch)
    this.load.image('scout-celebrate', POND_ASSETS.scoutCelebrate)
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT)
    this.cameras.main.scrollX = AREA_SCROLL[0]

    ;['pond-night', 'pond-waterfall', 'pond-sunset'].forEach((key, regionIndex) => {
      this.add
        .image(regionIndex * REGION_WIDTH, -480, key)
        .setOrigin(0)
        .setDisplaySize(REGION_WIDTH, 1688)
        .setDepth(0)
    })

    this.add.rectangle(0, 0, WORLD_WIDTH, GAME_HEIGHT, 0x062837, 0.08).setOrigin(0).setDepth(1)

    this.atmosphereTint = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x123c59, 0.1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(2)

    this.createWaterShimmer()
    this.createHud()

    const startX = this.startXForArea(0)
    this.frogShadow = this.add.ellipse(startX, START_Y + 13, 118, 28, 0x032431, 0.48).setDepth(28)
    this.frog = this.add.image(startX, START_Y, 'scout-idle').setDepth(31)
    this.setFrogPose('idle')

    this.input.keyboard?.on('keydown-ONE', () => this.choosePad(0))
    this.input.keyboard?.on('keydown-TWO', () => this.choosePad(1))
    this.input.keyboard?.on('keydown-THREE', () => this.choosePad(2))
    this.input.keyboard?.on('keydown-NUMPAD_ONE', () => this.choosePad(0))
    this.input.keyboard?.on('keydown-NUMPAD_TWO', () => this.choosePad(1))
    this.input.keyboard?.on('keydown-NUMPAD_THREE', () => this.choosePad(2))
    this.options.registerChoiceHandler((choiceIndex) => this.choosePad(choiceIndex))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.options.registerChoiceHandler(null))

    this.game.canvas.setAttribute(
      'aria-label',
      `Lily-Pad Path. Help Scout cross ${this.options.rounds.length} changing pond areas by choosing one of three lily-pad answers.`,
    )
    this.game.canvas.setAttribute('tabindex', '0')
    this.renderRound()
  }

  private startXForArea(areaIndex: number) {
    return AREA_SCROLL[Math.min(areaIndex, AREA_SCROLL.length - 1)] + 172
  }

  private createWaterShimmer() {
    for (let index = 0; index < 22; index += 1) {
      const shimmer = this.add
        .ellipse(
          Phaser.Math.Between(80, WORLD_WIDTH - 80),
          Phaser.Math.Between(450, 700),
          Phaser.Math.Between(70, 180),
          Phaser.Math.Between(3, 8),
          index % 3 === 0 ? 0xffe4a3 : 0xb9f8ff,
          Phaser.Math.FloatBetween(0.07, 0.2),
        )
        .setDepth(5)
      this.addMotionTween({
        targets: shimmer,
        scaleX: { from: 0.45, to: 1.35 },
        alpha: { from: 0.04, to: 0.2 },
        duration: Phaser.Math.Between(1700, 3200),
        delay: Phaser.Math.Between(0, 1200),
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut',
      })
    }
  }

  private createHud() {
    const panel = this.add.graphics().setScrollFactor(0).setDepth(100)
    panel.fillStyle(0x061b28, 0.86)
    panel.fillRoundedRect(28, 22, GAME_WIDTH - 56, 157, 28)
    panel.lineStyle(2, 0xb7f7d4, 0.32)
    panel.strokeRoundedRect(28, 22, GAME_WIDTH - 56, 157, 28)

    this.areaText = this.add
      .text(61, 52, '', {
        fontFamily: 'Inter, Avenir Next, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#9af0c5',
        letterSpacing: 2,
      })
      .setScrollFactor(0)
      .setDepth(103)
      .setOrigin(0, 0.5)

    this.scoreText = this.add
      .text(GAME_WIDTH - 61, 52, '', {
        fontFamily: 'Inter, Avenir Next, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffe99b',
        letterSpacing: 1,
      })
      .setScrollFactor(0)
      .setDepth(103)
      .setOrigin(1, 0.5)

    this.promptText = this.add
      .text(GAME_WIDTH / 2, 101, '', {
        fontFamily: 'Arial Rounded MT Bold, Avenir Next, sans-serif',
        fontSize: '41px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        stroke: '#061c28',
        strokeThickness: 8,
        wordWrap: { width: 820 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(103)

    this.instructionText = this.add
      .text(GAME_WIDTH / 2, 139, '', {
        fontFamily: 'Inter, Avenir Next, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#b8ccda',
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(103)
  }

  private renderRound() {
    if (this.roundIndex >= this.options.rounds.length || this.finaleStarted) return

    this.clearRoundObjects()
    this.acceptingInput = false
    this.options.onInputReady(false)
    const round = this.options.rounds[this.roundIndex]
    const scrollX = AREA_SCROLL[this.roundIndex] ?? AREA_SCROLL[AREA_SCROLL.length - 1]
    const choices = round.choices.slice(0, 3)

    this.areaText.setText(`AREA ${this.roundIndex + 1}  ·  ${AREA_NAMES[this.roundIndex] ?? 'Celebration Shore'}`)
    this.scoreText.setText(
      `${this.correctCount} FIRST-TRY  ·  ${this.results.length}/${this.options.rounds.length} CROSSED`,
    )
    this.promptText.setText(round.cueText || 'Choose the matching word')
    this.instructionText.setText('CHOOSE A PAD  ·  SCOUT MOVES ON AUTOMATICALLY')
    this.options.onRoundChange(this.roundIndex)
    this.options.onFeedback(null)
    this.drawRouteProgress()
    this.setAtmosphereForArea(this.roundIndex)
    this.createAreaDetails(this.roundIndex, scrollX)
    this.createStartPad(this.frog.x, START_Y + 12)

    const positions = [
      { x: scrollX + 455, y: 518, rotation: -0.055 },
      { x: scrollX + 720, y: 586, rotation: 0.035 },
      { x: scrollX + 1010, y: 500, rotation: -0.03 },
    ]

    this.pads = choices.map((choice, index) => this.createAnswerPad(choice.id, choice.label, index, positions[index]))

    this.time.delayedCall(430, () => {
      if (!this.finaleStarted) {
        this.acceptingInput = true
        this.options.onInputReady(true)
      }
    })

    if (round.audioText && this.options.playAudio) {
      this.time.delayedCall(280, () => {
        void Promise.resolve(this.options.playAudio?.(round.audioText!)).catch(() => undefined)
      })
    }
  }

  private setAtmosphereForArea(areaIndex: number) {
    const palette = [
      { color: 0x152b70, alpha: 0.14 },
      { color: 0x244e70, alpha: 0.1 },
      { color: 0x9b83ff, alpha: 0.08 },
      { color: 0x3a817c, alpha: 0.07 },
      { color: 0x6d9fa6, alpha: 0.08 },
      { color: 0x79d6db, alpha: 0.06 },
      { color: 0x8edbb8, alpha: 0.06 },
      { color: 0xffb45d, alpha: 0.08 },
      { color: 0xff9d59, alpha: 0.08 },
      { color: 0xffd66e, alpha: 0.09 },
    ][areaIndex] ?? { color: 0xffffff, alpha: 0.04 }
    this.atmosphereTint.setFillStyle(palette.color, palette.alpha)
  }

  private createStartPad(x: number, y: number) {
    const ripple = this.add
      .ellipse(x, y + 25, 196, 45, 0xb8f7ff, 0)
      .setStrokeStyle(3, 0xb8f7ff, 0.42)
      .setDepth(13)
    const shadow = this.add.ellipse(x, y + 17, 190, 58, 0x052b35, 0.42).setDepth(14)
    const pad = this.add.ellipse(x, y, 184, 76, 0x4fae67, 1).setDepth(15).setStrokeStyle(5, 0xc6ffae, 0.9)
    const highlight = this.add.ellipse(x - 22, y - 10, 122, 32, 0xc9ffa9, 0.18).setDepth(16)
    const notch = this.add.triangle(x + 72, y - 4, 0, 0, 34, -15, 34, 15, 0x174a45, 1).setDepth(17)
    this.roundObjects.push(ripple, shadow, pad, highlight, notch)
    this.addMotionTween({
      targets: [shadow, pad, highlight, notch],
      y: '+=5',
      duration: 1600,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    })
    this.addMotionTween({
      targets: ripple,
      scaleX: 1.3,
      scaleY: 1.2,
      alpha: { from: 0.48, to: 0 },
      duration: 1750,
      repeat: -1,
      ease: 'Sine.easeOut',
    })
  }

  private createAnswerPad(
    choiceId: string,
    choiceLabel: string,
    index: number,
    position: { x: number; y: number; rotation: number },
  ): PadView {
    const ripple = this.add
      .ellipse(position.x, position.y + 26, 228, 52, 0xa8efff, 0)
      .setStrokeStyle(3, 0xa8efff, 0.36)
      .setDepth(13)
    this.roundObjects.push(ripple)
    this.addMotionTween({
      targets: ripple,
      scaleX: 1.25,
      scaleY: 1.12,
      alpha: { from: 0.4, to: 0 },
      duration: 1500 + index * 190,
      repeat: -1,
    })

    const container = this.add.container(position.x, position.y).setDepth(20).setRotation(position.rotation)
    const shadow = this.add.ellipse(0, 22, 226, 72, 0x052832, 0.52)
    const glow = this.add.ellipse(0, 1, 250, 112, 0xb8ffbf, 0.07)
    const plate = this.add.ellipse(0, 0, 218, 94, 0x5ec66f, 0.99).setStrokeStyle(5, 0xcfffad, 0.94)
    const veins = this.add.graphics()
    veins.lineStyle(2, 0x246b50, 0.28)
    for (let line = -2; line <= 2; line += 1) veins.lineBetween(10, 2, -88, line * 14)
    const shine = this.add.ellipse(-26, -13, 130, 34, 0xd8ffae, 0.2)
    const notch = this.add.triangle(88, -4, 0, 0, 39, -18, 39, 18, 0x174a45, 1)
    const flower = this.add.circle(-78, -28, 13, index === 1 ? 0xffdf80 : 0xff9bb8, 0.95)
    const flowerCore = this.add.circle(-78, -28, 5, 0xfff1a6, 1)
    const label = this.add
      .text(-1, -2, choiceLabel, {
        fontFamily: 'Arial Rounded MT Bold, Avenir Next, sans-serif',
        fontSize: '49px',
        fontStyle: 'bold',
        color: '#10342c',
        stroke: '#efffda',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
    const key = this.add
      .text(76, -38, `${index + 1}`, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#153a32',
        backgroundColor: '#e9ffd5',
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5)

    container.add([shadow, glow, plate, veins, shine, notch, flower, flowerCore, label, key])
    container.setSize(244, 118).setInteractive({ useHandCursor: true })
    container.on('pointerover', () => {
      if (!this.acceptingInput) return
      glow.setFillStyle(0xd9ff9f, 0.34)
      this.addMotionTween({ targets: container, scale: 1.075, duration: 140, ease: 'Back.easeOut' })
    })
    container.on('pointerout', () => {
      if (!this.acceptingInput) return
      glow.setFillStyle(0xb8ffbf, 0.07)
      this.addMotionTween({ targets: container, scale: 1, duration: 130 })
    })
    container.on('pointerdown', () => this.choosePad(index))
    container.setAlpha(0).setScale(0.68)
    this.addMotionTween({
      targets: container,
      alpha: 1,
      scale: 1,
      duration: 470,
      delay: 90 + index * 110,
      ease: 'Back.easeOut',
    })
    this.addMotionTween({
      targets: container,
      y: position.y + 8,
      duration: 1400 + index * 170,
      delay: index * 120,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    })
    this.roundObjects.push(container)

    return { container, glow, plate, label, choiceId, choiceLabel }
  }

  private createAreaDetails(areaIndex: number, scrollX: number) {
    if (areaIndex <= 2) {
      const colors: readonly [number, number] = areaIndex === 2 ? [0xcbb8ff, 0xffffff] : [0xffdc72, 0x9effc4]
      this.createFireflies(scrollX, areaIndex === 1 ? 30 : 22, colors)
      if (areaIndex === 2) this.createFloatingLights(scrollX, 8, 0xc7b6ff)
      return
    }
    if (areaIndex === 3) {
      this.createPetals(scrollX, 20, [0xffc2da, 0xc7eeff])
      this.createFishLeap(scrollX + 1080, 620, false)
      return
    }
    if (areaIndex === 4) {
      this.createRainfall(scrollX)
      this.createMist(scrollX, 15)
      return
    }
    if (areaIndex === 5) {
      this.createMist(scrollX, 24)
      this.createFloatingLights(scrollX, 7, 0xa8f7ff)
      return
    }
    if (areaIndex === 6) {
      this.createPetals(scrollX, 16, [0xffb6c9, 0xffffff])
      this.createFishLeap(scrollX + 380, 622, false)
      this.createFishLeap(scrollX + 1080, 642, false)
      return
    }
    if (areaIndex === 7) {
      this.createPetals(scrollX, 22, [0xffc0b2, 0xffe28f])
      return
    }
    if (areaIndex === 8) {
      this.createFloatingLights(scrollX, 14, 0xffd778)
      return
    }
    this.createPetals(scrollX, 26, [0xffa9c0, 0xffe475])
    this.createFloatingLights(scrollX, 18, 0xffd85e)
  }

  private createFireflies(scrollX: number, count: number, colors: readonly [number, number]) {
    for (let index = 0; index < count; index += 1) {
      const firefly = this.add
        .circle(
          scrollX + Phaser.Math.Between(55, GAME_WIDTH - 40),
          Phaser.Math.Between(208, 660),
          Phaser.Math.Between(2, 5),
          index % 4 === 0 ? colors[0] : colors[1],
          Phaser.Math.FloatBetween(0.25, 0.82),
        )
        .setDepth(11)
        .setBlendMode(Phaser.BlendModes.ADD)
      this.roundObjects.push(firefly)
      this.addMotionTween({
        targets: firefly,
        x: firefly.x + Phaser.Math.Between(-38, 38),
        y: firefly.y + Phaser.Math.Between(-30, 30),
        alpha: { from: 0.18, to: 0.98 },
        duration: Phaser.Math.Between(1200, 2500),
        delay: Phaser.Math.Between(0, 700),
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut',
      })
    }
  }

  private createMist(scrollX: number, count: number) {
    for (let index = 0; index < count; index += 1) {
      const mist = this.add
        .circle(
          scrollX + Phaser.Math.Between(0, GAME_WIDTH),
          Phaser.Math.Between(430, 680),
          Phaser.Math.Between(18, 55),
          0xd5fbff,
          Phaser.Math.FloatBetween(0.025, 0.1),
        )
        .setDepth(10)
      this.roundObjects.push(mist)
      this.addMotionTween({
        targets: mist,
        x: mist.x + Phaser.Math.Between(60, 150),
        alpha: 0,
        duration: Phaser.Math.Between(2400, 4200),
        repeat: -1,
      })
    }
  }

  private createPetals(scrollX: number, count: number, colors: readonly [number, number]) {
    for (let index = 0; index < count; index += 1) {
      const petal = this.add
        .ellipse(
          scrollX + Phaser.Math.Between(30, GAME_WIDTH - 30),
          Phaser.Math.Between(190, 620),
          Phaser.Math.Between(7, 13),
          Phaser.Math.Between(3, 7),
          colors[index % 2],
          Phaser.Math.FloatBetween(0.4, 0.85),
        )
        .setDepth(12)
        .setRotation(Phaser.Math.FloatBetween(0, Math.PI))
      this.roundObjects.push(petal)
      this.addMotionTween({
        targets: petal,
        x: petal.x + Phaser.Math.Between(-55, 65),
        y: petal.y + Phaser.Math.Between(65, 145),
        rotation: petal.rotation + Phaser.Math.FloatBetween(2, 5),
        alpha: 0.08,
        duration: Phaser.Math.Between(2600, 4600),
        repeat: -1,
      })
    }
  }

  private createRainfall(scrollX: number) {
    for (let index = 0; index < 34; index += 1) {
      const drop = this.add
        .rectangle(
          scrollX + Phaser.Math.Between(20, GAME_WIDTH - 20),
          Phaser.Math.Between(170, 650),
          2,
          Phaser.Math.Between(14, 30),
          0xcff9ff,
          Phaser.Math.FloatBetween(0.12, 0.34),
        )
        .setDepth(12)
        .setRotation(-0.12)
      this.roundObjects.push(drop)
      this.addMotionTween({
        targets: drop,
        x: drop.x - 38,
        y: drop.y + 175,
        alpha: 0,
        duration: Phaser.Math.Between(650, 1100),
        delay: Phaser.Math.Between(0, 500),
        repeat: -1,
      })
    }
  }

  private createFloatingLights(scrollX: number, count: number, color: number) {
    for (let index = 0; index < count; index += 1) {
      const light = this.add
        .circle(
          scrollX + Phaser.Math.Between(80, GAME_WIDTH - 80),
          Phaser.Math.Between(260, 640),
          Phaser.Math.Between(5, 9),
          color,
          0.72,
        )
        .setDepth(12)
        .setBlendMode(Phaser.BlendModes.ADD)
      this.roundObjects.push(light)
      this.addMotionTween({
        targets: light,
        y: light.y - Phaser.Math.Between(55, 125),
        scale: 1.8,
        alpha: 0,
        duration: Phaser.Math.Between(1800, 3100),
        delay: index * 120,
        repeat: -1,
        ease: 'Sine.easeOut',
      })
    }
  }

  private choosePad(choiceIndex: number) {
    if (activityClock.paused) return
    const pad = this.pads[choiceIndex]
    const round = this.options.rounds[this.roundIndex]
    if (!this.acceptingInput || !pad || !round) return

    this.acceptingInput = false
    this.options.onInputReady(false)
    this.pads.forEach((view) => view.container.disableInteractive())
    const correct = pad.choiceId === round.correctChoiceId
    const safePad = this.pads.find((view) => view.choiceId === round.correctChoiceId)
    const safeAnswer = safePad?.choiceLabel || round.targetText

    this.options.onAttempt(this.roundIndex, pad.choiceId, correct)
    this.results.push(correct)
    if (correct) {
      this.correctCount += 1
      this.streak += 1
      this.bestStreak = Math.max(this.bestStreak, this.streak)
    } else {
      this.streak = 0
    }
    this.options.onProgress(this.results.length, this.correctCount, this.streak, this.bestStreak)
    this.scoreText.setText(
      `${this.correctCount} FIRST-TRY  ·  ${this.results.length}/${this.options.rounds.length} CROSSED`,
    )
    this.drawRouteProgress()

    if (correct) {
      playGameSound('correct')
      this.playCorrectLanding(pad)
    } else {
      playGameSound('incorrect')
      this.playMissAndRecovery(pad, safePad, safeAnswer)
    }
  }

  private playCorrectLanding(pad: PadView) {
    pad.glow.setFillStyle(0xdcff91, 0.68)
    pad.plate.setFillStyle(0x7de286, 1)
    this.options.onFeedback({
      correct: true,
      answer: pad.choiceLabel,
      message: 'Perfect landing. The path is moving forward.',
    })
    this.showCallout(pad.container.x, pad.container.y - 122, 'PERFECT LANDING!', this.rewardCopyForArea(), true)
    this.jumpFrogTo(pad.container.x, pad.container.y - 17, false, () => {
      this.createLandingRipple(pad.container.x, pad.container.y + 30, 0xcaffb5)
      this.createSparkBurst(pad.container.x, pad.container.y - 30, 0xffe279)
      this.playAreaReward(this.roundIndex, pad.container.x, pad.container.y)
      this.time.delayedCall(930, () => this.advanceJourney())
    })
  }

  private playMissAndRecovery(chosenPad: PadView, safePad: PadView | undefined, safeAnswer: string) {
    chosenPad.glow.setFillStyle(0xff975e, 0.54)
    chosenPad.plate.setFillStyle(0x79a86b, 0.85)
    if (safePad) {
      safePad.glow.setFillStyle(0xdcff91, 0.7)
      safePad.plate.setFillStyle(0x79df82, 1)
      this.addMotionTween({ targets: safePad.container, scale: 1.08, duration: 220, repeat: 2, yoyo: true })
    }

    this.options.onFeedback({
      correct: false,
      answer: safeAnswer,
      message: `Splash. ${safeAnswer} is the safe route; Scout is recovering automatically.`,
    })
    this.showCallout(
      chosenPad.container.x,
      chosenPad.container.y - 122,
      'SPLASH!',
      `SAFE ROUTE  →  ${safeAnswer}`,
      false,
    )
    if (!this.options.reducedMotion) this.cameras.main.shake(220, 0.004)
    const waterX = chosenPad.container.x + 22
    const waterY = Math.min(658, chosenPad.container.y + 92)

    this.jumpFrogTo(waterX, waterY, true, () => {
      this.createSplash(waterX, waterY + 5)
      this.frog.setAlpha(0)
      this.frogShadow.setAlpha(0)
      this.time.delayedCall(690, () => {
        if (!safePad) {
          this.advanceJourney()
          return
        }
        this.setFrogPose('crouch')
        this.frog
          .setPosition(waterX, waterY + 12)
          .setAlpha(0.8)
          .setScale(this.frog.scaleX * 0.72, this.frog.scaleY * 0.72)
        this.frogShadow
          .setPosition(waterX, waterY + 18)
          .setAlpha(0.32)
          .setScale(0.65)
        this.createLandingRipple(waterX, waterY + 11, 0x9cecff)
        this.time.delayedCall(240, () =>
          this.jumpFrogTo(safePad.container.x, safePad.container.y - 17, false, () => {
            this.createLandingRipple(safePad.container.x, safePad.container.y + 30, 0xcaffb5)
            this.createSparkBurst(safePad.container.x, safePad.container.y - 28, 0x9ff4d0)
            playGameSound('progress')
            this.time.delayedCall(760, () => this.advanceJourney())
          }),
        )
      })
    })
  }

  private rewardCopyForArea() {
    return (
      [
        'FIREFLY FRIEND FOUND',
        'REED SONG UNLOCKED',
        'MOON GATE OPENED',
        'LOTUS BLOOM AWAKENED',
        'RAIN CHARM EARNED',
        'WATERFALL GLOW UNLOCKED',
        'KOI GUIDE JOINED',
        'SUNSET TRAIL LIT',
        'LANTERN PARADE STARTED',
        'CELEBRATION SHORE FOUND',
      ][this.roundIndex] ?? 'PATH UNLOCKED'
    )
  }

  private showCallout(x: number, y: number, title: string, subtitle: string, correct: boolean) {
    this.activeCallout?.destroy()
    const container = this.add.container(x, y).setDepth(85)
    this.activeCallout = container
    const panel = this.add.graphics()
    panel.fillStyle(correct ? 0xdfff98 : 0xffc06d, 0.96)
    panel.fillRoundedRect(-185, -45, 370, 90, 20)
    panel.lineStyle(3, correct ? 0xffffff : 0xffe4b0, 0.82)
    panel.strokeRoundedRect(-185, -45, 370, 90, 20)
    const heading = this.add
      .text(0, -14, title, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#173328',
      })
      .setOrigin(0.5)
    const detail = this.add
      .text(0, 18, subtitle, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#345144',
        letterSpacing: 1,
      })
      .setOrigin(0.5)
    container.add([panel, heading, detail]).setAlpha(0).setScale(0.72)
    this.roundObjects.push(container)
    this.addMotionTween({ targets: container, alpha: 1, scale: 1, y: y - 10, duration: 360, ease: 'Back.easeOut' })
  }

  private jumpFrogTo(targetX: number, targetY: number, dive: boolean, onComplete: () => void) {
    const startX = this.frog.x
    const startY = this.frog.y
    const startShadowX = this.frogShadow.x
    const startShadowY = this.frogShadow.y

    this.setFrogPose('crouch')
    const crouchScaleX = this.frog.scaleX
    const crouchScaleY = this.frog.scaleY
    this.addMotionTween({
      targets: this.frog,
      scaleX: crouchScaleX * 1.1,
      scaleY: crouchScaleY * 0.78,
      y: startY + 8,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.setFrogPose('idle')
        const flightScaleX = this.frog.scaleX
        const flightScaleY = this.frog.scaleY
        const controlX = (startX + targetX) / 2
        const controlY = Math.min(startY, targetY) - (dive ? 128 : 205)
        this.addMotionCounter({
          from: 0,
          to: 1,
          duration: dive ? 650 : 780,
          ease: 'Sine.easeInOut',
          onUpdate: (tween) => {
            const progress = tween.getValue() || 0
            const inverse = 1 - progress
            this.frog.x = inverse * inverse * startX + 2 * inverse * progress * controlX + progress * progress * targetX
            this.frog.y = inverse * inverse * startY + 2 * inverse * progress * controlY + progress * progress * targetY
            this.frog.setScale(
              flightScaleX * (1.08 + Math.sin(progress * Math.PI) * 0.12),
              flightScaleY * (0.9 - Math.sin(progress * Math.PI) * 0.08),
            )
            this.frog.setRotation(Math.sin(progress * Math.PI) * (dive ? 0.16 : -0.1))
            this.frogShadow.x = Phaser.Math.Linear(startShadowX, targetX, progress)
            this.frogShadow.y = Phaser.Math.Linear(startShadowY, targetY + 14, progress)
            this.frogShadow.setScale(1 - Math.sin(progress * Math.PI) * 0.58)
            this.frogShadow.setAlpha(0.45 - Math.sin(progress * Math.PI) * 0.32)
          },
          onComplete: () => {
            this.setFrogPose('idle')
            this.frog.setPosition(targetX, targetY).setRotation(0).setAlpha(1)
            this.frogShadow
              .setPosition(targetX, targetY + 14)
              .setScale(1)
              .setAlpha(0.45)
            const baseX = this.frog.scaleX
            const baseY = this.frog.scaleY
            this.addMotionTween({
              targets: this.frog,
              scaleX: baseX * 1.16,
              scaleY: baseY * 0.78,
              y: targetY + 8,
              duration: 105,
              yoyo: true,
              onComplete: () => {
                this.setFrogPose('idle')
                this.frog.setPosition(targetX, targetY)
                onComplete()
              },
            })
          },
        })
      },
    })
  }

  private setFrogPose(pose: FrogPose) {
    const config = {
      idle: { key: 'scout-idle', width: 166, height: 175 },
      crouch: { key: 'scout-crouch', width: 183, height: 157 },
      celebrate: { key: 'scout-celebrate', width: 184, height: 194 },
    }[pose]
    this.frog.setTexture(config.key).setOrigin(0.5, 0.92).setDisplaySize(config.width, config.height)
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
    const startX = this.frog.x
    const startY = this.frog.y
    const startScroll = this.cameras.main.scrollX
    const distance = Math.abs(nextScroll - startScroll)
    const travelDuration = Math.min(2450, 1250 + distance * 0.72)
    const hopCycles = distance > 900 ? 6 : 4

    this.instructionText.setText(`TRAVELING TO ${AREA_NAMES[nextIndex].toUpperCase()}…`)
    this.pads.forEach((pad) => this.addMotionTween({ targets: pad.container, alpha: 0.18, duration: 350 }))
    this.setFrogPose('idle')
    const baseScaleX = this.frog.scaleX
    const baseScaleY = this.frog.scaleY
    this.createTravelTrail(startX, targetX, startY)

    this.addMotionCounter({
      from: 0,
      to: 1,
      duration: travelDuration,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const progress = tween.getValue() || 0
        const hop = Math.abs(Math.sin(progress * Math.PI * hopCycles))
        this.cameras.main.scrollX = Phaser.Math.Linear(startScroll, nextScroll, progress)
        this.frog.x = Phaser.Math.Linear(startX, targetX, progress)
        this.frog.y = Phaser.Math.Linear(startY, START_Y, progress) - hop * 58
        this.frog.setRotation(Math.sin(progress * Math.PI * hopCycles) * -0.045)
        this.frog.setScale(baseScaleX * (1 + hop * 0.08), baseScaleY * (1 - hop * 0.07))
        this.frogShadow.x = this.frog.x
        this.frogShadow.y = Phaser.Math.Linear(startY + 14, START_Y + 14, progress)
        this.frogShadow.setScale(1 - hop * 0.46)
        this.frogShadow.setAlpha(0.44 - hop * 0.24)
      },
      onComplete: () => {
        this.roundIndex = nextIndex
        this.cameras.main.scrollX = nextScroll
        this.setFrogPose('idle')
        this.frog.setPosition(targetX, START_Y).setRotation(0)
        this.frogShadow
          .setPosition(targetX, START_Y + 14)
          .setScale(1)
          .setAlpha(0.46)
        if (nextIndex === 4 || nextIndex === 7)
          if (!this.options.reducedMotion) this.cameras.main.flash(420, 196, 250, 226, false)
        this.renderRound()
      },
    })
  }

  private createTravelTrail(startX: number, endX: number, y: number) {
    for (let index = 0; index < 16; index += 1) {
      const mote = this.add
        .circle(startX, y - 20, index % 4 === 0 ? 5 : 3, index % 2 ? 0xffdf78 : 0x8ff4c5, 0.85)
        .setDepth(30)
      this.addMotionTween({
        targets: mote,
        x: Phaser.Math.Linear(startX, endX, index / 15) + Phaser.Math.Between(-30, 30),
        y: y - Phaser.Math.Between(20, 130),
        alpha: 0,
        scale: 0.2,
        duration: 900,
        delay: index * 65,
        onComplete: () => mote.destroy(),
      })
    }
  }

  private playJourneyFinale() {
    if (this.finaleStarted) return
    this.finaleStarted = true
    this.acceptingInput = false
    if (this.activeCallout?.active) {
      this.activeCallout.destroy()
      this.activeCallout = undefined
    }
    this.options.onFeedback(null)
    this.areaText.setText('DESTINATION  ·  CELEBRATION SHORE')
    this.promptText.setText('Scout reached Celebration Shore!')
    this.instructionText.setText(`${this.options.rounds.length} RESPONSES  ·  SAFE PASSAGE COMPLETE`)
    this.pads.forEach((pad) => pad.container.disableInteractive())
    const destinationX = AREA_SCROLL[Math.max(0, this.options.rounds.length - 1)] + 1100
    const destinationY = 565

    this.jumpFrogTo(destinationX, destinationY, false, () => {
      this.setFrogPose('celebrate')
      this.frog.setPosition(destinationX, destinationY - 8)
      this.frogShadow.setPosition(destinationX, destinationY + 14).setScale(1.18)
      this.addMotionTween({
        targets: this.frog,
        y: destinationY - 26,
        rotation: -0.04,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      if (!this.options.reducedMotion) this.cameras.main.flash(480, 255, 232, 152, false)
      playGameSound('victory')
      this.createSparkBurst(destinationX, destinationY - 85, 0xffdc62)
      this.createSparkBurst(destinationX, destinationY - 55, 0x8ef0c4)
      this.launchCelebration(destinationX)
      this.time.delayedCall(1800, this.options.onFinish)
    })
  }

  private playAreaReward(areaIndex: number, x: number, y: number) {
    if (areaIndex === 0) return this.createRewardOrbit(x, y, [0xffe470, 0xa0ffcb])
    if (areaIndex === 1) return this.createReedSong(x, y)
    if (areaIndex === 2) {
      this.createRewardOrbit(x, y, [0xc8b7ff, 0xffffff])
      this.createLandingRipple(x, y + 26, 0xd5c7ff)
      return
    }
    if (areaIndex === 3) return this.createRewardPetals(x, y, [0xffa9ce, 0xffffff])
    if (areaIndex === 4) {
      this.createSplash(x, y + 42)
      this.createSparkBurst(x, y - 40, 0xa8f7ff)
      return
    }
    if (areaIndex === 5) {
      this.createFishLeap(x - 125, y + 58, true)
      this.createFishLeap(x + 145, y + 62, true)
      return
    }
    if (areaIndex === 6) {
      this.createFishLeap(x - 150, y + 62, true)
      this.createFishLeap(x, y + 74, true)
      this.createFishLeap(x + 150, y + 62, true)
      return
    }
    if (areaIndex === 7) return this.createSunburst(x, y)
    if (areaIndex === 8) return this.createRewardLanterns(x, y, 9)
    this.createRewardLanterns(x, y, 14)
    this.createSparkBurst(x, y - 60, 0xffe36e)
    this.createSparkBurst(x, y - 80, 0xff9dbc)
  }

  private createRewardOrbit(x: number, y: number, colors: readonly [number, number]) {
    for (let index = 0; index < 9; index += 1) {
      const orb = this.add
        .circle(x, y - 25, 5, colors[index % 2], 0.95)
        .setDepth(56)
        .setBlendMode(Phaser.BlendModes.ADD)
      this.addMotionTween({
        targets: orb,
        x: x + Math.cos((Math.PI * 2 * index) / 9) * 105,
        y: y - 55 + Math.sin((Math.PI * 2 * index) / 9) * 62,
        alpha: 0,
        duration: 980,
        delay: index * 45,
        ease: 'Sine.easeOut',
        onComplete: () => orb.destroy(),
      })
    }
  }

  private createReedSong(x: number, y: number) {
    for (let index = 0; index < 8; index += 1) {
      const note = this.add
        .text(x + Phaser.Math.Between(-110, 110), y, index % 3 === 0 ? '♫' : '♪', {
          fontFamily: 'Georgia, serif',
          fontSize: `${Phaser.Math.Between(24, 42)}px`,
          color: index % 2 ? '#fff2a3' : '#a8ffd5',
        })
        .setOrigin(0.5)
        .setDepth(58)
      this.addMotionTween({
        targets: note,
        x: note.x + Phaser.Math.Between(-35, 35),
        y: y - Phaser.Math.Between(115, 215),
        rotation: Phaser.Math.FloatBetween(-0.4, 0.4),
        alpha: 0,
        duration: 1250,
        delay: index * 90,
        ease: 'Sine.easeOut',
        onComplete: () => note.destroy(),
      })
    }
  }

  private createRewardPetals(x: number, y: number, colors: readonly [number, number]) {
    for (let index = 0; index < 18; index += 1) {
      const angle = (Math.PI * 2 * index) / 18
      const petal = this.add
        .ellipse(x, y - 28, 12, 6, colors[index % 2], 0.96)
        .setDepth(59)
        .setRotation(angle)
      this.addMotionTween({
        targets: petal,
        x: x + Math.cos(angle) * Phaser.Math.Between(85, 165),
        y: y - 35 + Math.sin(angle) * Phaser.Math.Between(60, 120),
        rotation: angle + 4,
        alpha: 0,
        duration: 1000,
        delay: index * 25,
        ease: 'Cubic.easeOut',
        onComplete: () => petal.destroy(),
      })
    }
  }

  private createSunburst(x: number, y: number) {
    for (let index = 0; index < 16; index += 1) {
      const angle = (Math.PI * 2 * index) / 16
      const ray = this.add
        .rectangle(x, y - 42, 7, 46, index % 2 ? 0xffd364 : 0xff9e73, 0.82)
        .setDepth(55)
        .setRotation(angle)
      this.addMotionTween({
        targets: ray,
        x: x + Math.sin(angle) * 150,
        y: y - 42 - Math.cos(angle) * 115,
        scaleY: 0.2,
        alpha: 0,
        duration: 920,
        delay: index * 22,
        ease: 'Cubic.easeOut',
        onComplete: () => ray.destroy(),
      })
    }
  }

  private createRewardLanterns(x: number, y: number, count: number) {
    for (let index = 0; index < count; index += 1) {
      const lantern = this.add.container(x + Phaser.Math.Between(-170, 170), y + 30).setDepth(58)
      const halo = this.add
        .circle(0, 0, 22, index % 3 === 0 ? 0xff9db8 : 0xffc85a, 0.24)
        .setBlendMode(Phaser.BlendModes.ADD)
      const light = this.add.circle(0, 0, 8, index % 3 === 0 ? 0xffb6ca : 0xffe998, 1)
      lantern.add([halo, light])
      this.addMotionTween({
        targets: lantern,
        y: y - Phaser.Math.Between(110, 220),
        alpha: 0,
        duration: 1350,
        delay: index * 75,
        onComplete: () => lantern.destroy(),
      })
    }
  }

  private createFishLeap(x: number, y: number, reward: boolean) {
    const fish = this.add
      .container(x, y)
      .setDepth(22)
      .setScale(reward ? 1 : 0.72)
    const body = this.add.ellipse(0, 0, 38, 18, reward ? 0xffc66c : 0xff9a70, 0.92)
    const tail = this.add.triangle(-24, 0, 0, 0, -17, -11, -17, 11, 0xffd27b, 0.92)
    const eye = this.add.circle(10, -3, 2, 0x112533, 1)
    fish.add([tail, body, eye]).setAlpha(0)
    this.roundObjects.push(fish)
    this.addMotionTween({
      targets: fish,
      alpha: { from: 0, to: 1 },
      x: x + (reward ? Phaser.Math.Between(70, 120) : -80),
      y: y - (reward ? 82 : 54),
      rotation: reward ? -0.45 : 0.35,
      duration: reward ? 520 : 760,
      yoyo: true,
      delay: reward ? 0 : 800,
      repeat: reward ? 0 : -1,
      hold: reward ? 0 : 1400,
      ease: 'Sine.easeInOut',
    })
  }

  private drawRouteProgress() {
    this.routeObjects.forEach((object) => object.destroy())
    this.routeObjects = []
    const graphics = this.add.graphics().setScrollFactor(0).setDepth(104)
    const startX = 420
    const endX = 860
    const y = 163
    graphics.lineStyle(5, 0xffffff, 0.13)
    graphics.lineBetween(startX, y, endX, y)
    if (this.results.length) {
      graphics.lineStyle(5, 0x8fecc0, 0.95)
      graphics.lineBetween(
        startX,
        y,
        Phaser.Math.Linear(startX, endX, this.results.length / this.options.rounds.length),
        y,
      )
    }
    for (let index = 0; index <= this.options.rounds.length; index += 1) {
      const x = Phaser.Math.Linear(startX, endX, index / this.options.rounds.length)
      const completed = index <= this.results.length
      const lastResult = index > 0 ? this.results[index - 1] : true
      graphics.fillStyle(completed ? (lastResult ? 0xd8ff8d : 0x8fe9da) : 0x254454, 1)
      graphics.fillCircle(x, y, index === this.results.length ? 8 : 6)
      graphics.lineStyle(2, completed ? 0xffffff : 0x67818c, 0.8)
      graphics.strokeCircle(x, y, index === this.results.length ? 8 : 6)
    }
    this.routeObjects.push(graphics)
  }

  private createLandingRipple(x: number, y: number, color: number) {
    for (let index = 0; index < 3; index += 1) {
      const ripple = this.add.ellipse(x, y, 72, 22, color, 0).setStrokeStyle(4, color, 0.72).setDepth(25).setScale(0.25)
      this.addMotionTween({
        targets: ripple,
        scaleX: 2.4,
        scaleY: 1.6,
        alpha: 0,
        duration: 760,
        delay: index * 100,
        onComplete: () => ripple.destroy(),
      })
    }
  }

  private createSparkBurst(x: number, y: number, color: number) {
    for (let index = 0; index < 18; index += 1) {
      const angle = (Math.PI * 2 * index) / 18
      const spark = this.add.circle(x, y, index % 4 === 0 ? 6 : 3, color, 0.96).setDepth(63)
      this.addMotionTween({
        targets: spark,
        x: x + Math.cos(angle) * Phaser.Math.Between(75, 155),
        y: y + Math.sin(angle) * Phaser.Math.Between(50, 115),
        alpha: 0,
        scale: 0.15,
        duration: 690,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      })
    }
  }

  private createSplash(x: number, y: number) {
    this.createLandingRipple(x, y, 0xa5f4ff)
    for (let index = 0; index < 22; index += 1) {
      const droplet = this.add
        .circle(x, y, Phaser.Math.Between(3, 7), index % 3 ? 0xa5f4ff : 0xffffff, 0.92)
        .setDepth(60)
      const direction = Phaser.Math.FloatBetween(-1.02, -2.12)
      const distance = Phaser.Math.Between(55, 145)
      this.addMotionTween({
        targets: droplet,
        x: x + Math.cos(direction) * distance,
        y: y + Math.sin(direction) * distance,
        alpha: 0,
        scale: 0.25,
        duration: Phaser.Math.Between(520, 820),
        ease: 'Cubic.easeOut',
        onComplete: () => droplet.destroy(),
      })
    }
  }

  private launchCelebration(centerX: number) {
    const colors = [0xffdd62, 0xff91aa, 0x86efbc, 0xa995ff, 0xffffff]
    for (let index = 0; index < 76; index += 1) {
      const piece = this.add
        .rectangle(
          centerX + Phaser.Math.Between(-520, 420),
          Phaser.Math.Between(-180, -20),
          Phaser.Math.Between(7, 13),
          Phaser.Math.Between(12, 23),
          Phaser.Utils.Array.GetRandom(colors),
          0.94,
        )
        .setDepth(120)
        .setRotation(Phaser.Math.FloatBetween(0, Math.PI))
      this.addMotionTween({
        targets: piece,
        y: GAME_HEIGHT + 70,
        x: piece.x + Phaser.Math.Between(-110, 110),
        rotation: piece.rotation + Phaser.Math.FloatBetween(4, 10),
        duration: Phaser.Math.Between(2300, 4000),
        delay: Phaser.Math.Between(0, 900),
        ease: 'Sine.easeIn',
        repeat: -1,
      })
    }
  }

  private clearRoundObjects() {
    this.pads = []
    this.roundObjects.forEach((object) => {
      if (object.active) object.destroy()
    })
    this.roundObjects = []
    this.activeCallout = undefined
  }
}

export function LilyPadPath({
  rounds,
  playAudio,
  title = 'Lily-Pad Path',
  eyebrow,
  onExit,
  onAttempt,
  onComplete,
}: LearningGameBaseProps & {
  readonly rounds: readonly SelectionGameRound[]
  readonly playAudio?: PlayLearningAudio
}) {
  const playableRounds = rounds
  const hostRef = useRef<HTMLDivElement>(null)
  const attemptsRef = useRef<LearningGameAttempt[]>([])
  const choiceHandlerRef = useRef<((choiceIndex: number) => void) | null>(null)
  const playAudioRef = useRef(playAudio)
  const [completed, setCompleted] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [roundIndex, setRoundIndex] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [finished, setFinished] = useState(false)
  const [ready, setReady] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const valid =
    playableRounds.length <= JOURNEY_LENGTH &&
    validSelectionRounds(playableRounds) &&
    playableRounds.every((round) => round.choices.length >= 3)
  const hasAudio = Boolean(playAudio)

  useEffect(() => {
    playAudioRef.current = playAudio
  }, [playAudio])

  const playLearningAudio = useCallback<PlayLearningAudio>(async (text, language, playbackRate) => {
    if (activityClock.paused) return
    try {
      await playAudioRef.current?.(text, language, playbackRate)
      setAudioError(false)
    } catch {
      setAudioError(true)
    }
  }, [])

  const handleAttempt = useCallback(
    (index: number, choiceId: string, wasCorrect: boolean) => {
      const round = playableRounds[index]
      if (!round) return
      const attempt: LearningGameAttempt = {
        gameId: 'lily-pad-path',
        promptId: round.id,
        targetId: round.targetId,
        correct: wasCorrect,
        response: choiceId,
        assessmentMode: 'automatic',
      }
      attemptsRef.current.push(attempt)
      onAttempt?.(attempt)
    },
    [onAttempt, playableRounds],
  )

  useEffect(() => {
    if (!valid || !hostRef.current) return
    const scene = new LilyPondScene({
      rounds: playableRounds,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      playAudio: hasAudio ? playLearningAudio : undefined,
      onAttempt: handleAttempt,
      onProgress: (nextCompleted, nextCorrect, nextStreak, nextBest) => {
        setCompleted(nextCompleted)
        setCorrect(nextCorrect)
        setStreak(nextStreak)
        setBestStreak(nextBest)
      },
      onRoundChange: setRoundIndex,
      onInputReady: setReady,
      onFeedback: setFeedback,
      onFinish: () => setFinished(true),
      registerChoiceHandler: (handler) => {
        choiceHandlerRef.current = handler
      },
    })
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      parent: hostRef.current,
      backgroundColor: '#082c3a',
      transparent: false,
      render: { antialias: true, roundPixels: true },
      // Audio is owned by the app's managed player/game effects, not Phaser.
      // Avoid creating a second browser AudioContext during Report/Exit.
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [scene],
    })
    const pauseScene = (paused: boolean) => {
      if (!scene.sys?.isActive() && !scene.sys?.isPaused()) return
      if (paused) scene.scene.pause()
      else scene.scene.resume()
    }
    const unsubscribe = activityClock.subscribe(pauseScene)
    game.events.once('ready', () => pauseScene(activityClock.paused))
    return () => {
      unsubscribe()
      stopActiveAudio()
      game.destroy(true)
    }
  }, [handleAttempt, hasAudio, playLearningAudio, playableRounds, valid])

  const finish = useCallback(() => {
    onComplete(summarizeLearningGame('lily-pad-path', attemptsRef.current))
  }, [onComplete])

  const currentRound = playableRounds[Math.min(roundIndex, playableRounds.length - 1)]
  const busy = !ready || Boolean(feedback) || finished
  const stageStyle = {
    '--pond-progress': `${playableRounds.length ? (completed / playableRounds.length) * 100 : 0}%`,
  } as CSSProperties

  return (
    <LearningGameShell
      gameId="lily-pad-path"
      title={title}
      eyebrow={eyebrow || `A ${playableRounds.length}-crossing storybook pond adventure`}
      progress={`${completed}/${playableRounds.length} crossings`}
      onExit={onExit}
    >
      {!valid ? (
        <LearningGameEmpty
          onExit={onExit}
          message={`Lily-Pad Path requires 1–${JOURNEY_LENGTH} rounds with at least three choices each.`}
        />
      ) : (
        <section className="lg-phaser-lily-card" style={stageStyle}>
          <div className="lg-phaser-meta" aria-live="polite">
            <span>
              <strong>{correct}</strong> first-try landings
            </span>
            <span>
              <strong>{streak}</strong> momentum
            </span>
            <span>
              <strong>{bestStreak}</strong> best run
            </span>
            <button
              type="button"
              onClick={() => {
                if (currentRound?.audioText)
                  void Promise.resolve(playLearningAudio(currentRound.audioText)).catch(() => undefined)
              }}
              disabled={finished || !currentRound?.audioText || !hasAudio}
            >
              <Headphones size={17} /> Hear clue
            </button>
          </div>
          <div className="lg-phaser-stage-wrap">
            <div ref={hostRef} className="lg-phaser-stage" data-input-ready={String(ready)} />
          </div>
          {audioError && (
            <p role="alert">
              The clue did not play. Tap Hear clue to try again. You can still exit or report a problem.
            </p>
          )}
          {!finished && (
            <div className="lg-mobile-pad-choices" role="group" aria-label="Touch-friendly lily-pad choices">
              {currentRound?.choices.slice(0, 3).map((choice, index) => (
                <button key={choice.id} type="button" disabled={busy} onClick={() => choiceHandlerRef.current?.(index)}>
                  <small>{index + 1}</small>
                  <strong>{choice.label}</strong>
                </button>
              ))}
              <span className="lg-mobile-feedback" role="status">
                {feedback?.message}
              </span>
            </div>
          )}
          <div className="lg-canvas-access" role="group" aria-label="Lily-pad answer choices">
            <span role="status">{feedback?.message}</span>
            {!finished &&
              currentRound?.choices.slice(0, 3).map((choice, index) => (
                <button key={choice.id} type="button" disabled={busy} onClick={() => choiceHandlerRef.current?.(index)}>
                  {choice.accessibleLabel || choice.label}
                </button>
              ))}
          </div>
          {finished ? (
            <div className="lg-phaser-finish-actions" aria-live="polite">
              <span>
                <Flag size={18} /> Celebration Shore reached
              </span>
              <strong>
                {correct}/{playableRounds.length} first-try landings
              </strong>
              <button type="button" onClick={finish}>
                Celebrate and finish
              </button>
            </div>
          ) : (
            <p className="lg-phaser-help">
              <kbd>1</kbd>
              <kbd>2</kbd>
              <kbd>3</kbd> choose a lily pad · the journey continues automatically
            </p>
          )}
        </section>
      )}
    </LearningGameShell>
  )
}
