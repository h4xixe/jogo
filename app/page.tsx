"use client"

import React, { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

// Retro pixel scaling constants
const BASE_W = 256
const BASE_H = 144

// Controls
type Keys = {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  jump: boolean
  fire: boolean
  crouch: boolean
}

// Palette
const COLORS = {
  bgSkyTop: "#081119",
  bgSkyBottom: "#14243a",
  bgDuskTop: "#150c1a",
  bgDuskBottom: "#271338",
  mountainFar: "#273854",
  mountainNear: "#3a5177",

  // Bamboo
  bamboo: "#3f7b44",
  bambooDark: "#2a5a31",
  bambooNode: "#5a8f5e",

  // Ground and stones
  ground: "#3b2a1f",
  stoneLight: "#8b8f9b",
  stoneMid: "#6e737f",
  stoneDark: "#505764",
  stoneCrack: "#2d3240",

  // Platform face (fallback if needed)
  platform: "#534031",

  // Temple/pagoda
  templeCol: "#9b2f2d",
  templeColDark: "#6a1f1d",
  roofTile: "#5c2e2d",
  roofTileDark: "#3f1f1e",
  roofEdge: "#c45a3c",
  lattice: "#c88d65",
  gold: "#d9a441",
  lantern: "#f2c14e",
  lanternGlow: "rgba(242, 193, 78, 0.3)",

  // Characters
  playerSkin: "#f0e0c0",
  playerArmor: "#6e3a2f",
  playerCloth: "#b5312e",
  steel: "#b8c2cc",

  // Enemies/boss
  samuraiArmor: "#6b3a32",
  samuraiTrim: "#c04a41",
  samuraiFace: "#e9d6b4",

  enemy: "#a8b2c0", // legacy (unused now)
  arrow: "#d0d3d8",
  boss: "#4b1f40",

  // Effects
  fire: "#ff6a2a",
  fireBright: "#ffd26b",

  // UI
  ui: "#ffffff",
  panel: "rgba(0,0,0,0.55)",
}

// Physics
const GRAVITY = 0.35
const MOVE_SPEED = 1.0
// Achievable jumps with shorter height (already reduced)
const JUMP_VEL = -6.0
const MAX_FALL = 6.5

// Entities
type Rect = { x: number; y: number; w: number; h: number }
type Platform = Rect & { vx?: number; range?: [number, number] } // moving optional

type Projectile = Rect & { vx: number; vy: number; life: number; friendly: boolean }

type EnemyBase = Rect & { alive: boolean; type: "swordsman" | "archer" }
type Swordsman = EnemyBase & {
  type: "swordsman"
  dir: number
  minX: number
  maxX: number
  speed: number
}
type Archer = EnemyBase & {
  type: "archer"
  cooldown: number
  fireRate: number
}
type Enemy = Swordsman | Archer

type Boss = Rect & {
  hp: number
  alive: boolean
  phase: number
  timer: number
  vx: number
  vy: number
  grounded: boolean
}

type Player = Rect & {
  vx: number
  vy: number
  facing: 1 | -1
  onGround: boolean
  crouch: boolean
  canFireAt: number
  invuln: number
}

type LevelKind = "intro" | "fase1" | "fase2" | "fase3" | "boss"
type GameMode = "menu" | "playing" | "win" | "gameover"

type Level = {
  kind: LevelKind
  platforms: Platform[]
  enemies: Enemy[]
  arrows: Projectile[]
  projs: Projectile[]
  gem: Rect
  boss?: Boss
  cameraX: number
  worldW: number
  worldH: number
  tick: number
}

// Audio (WebAudio simple 8-bit style)
class AudioEngine {
  ctx: AudioContext | null = null
  gain: GainNode | null = null
  musicGain: GainNode | null = null
  started = false
  musicInterval: number | null = null

  ensure() {
    if (!this.ctx) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const gain = ctx.createGain()
      gain.gain.value = 0.15
      gain.connect(ctx.destination)
      const mGain = ctx.createGain()
      mGain.gain.value = 0.08
      mGain.connect(ctx.destination)
      this.ctx = ctx
      this.gain = gain
      this.musicGain = mGain
    }
  }

  resume() {
    this.ensure()
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume()
    }
  }

  beep(freq: number, durMs: number, type: OscillatorType = "square", vol = 0.2) {
    if (!this.ctx || !this.gain) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    g.gain.value = vol
    osc.connect(g)
    g.connect(this.gain)
    osc.start()
    const end = t + durMs / 1000
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.stop(end)
  }

  sfxJump() {
    this.beep(440, 40, "square", 0.25)
    this.beep(660, 60, "square", 0.2)
  }
  sfxShoot() {
    this.beep(880, 50, "square", 0.2)
  }
  sfxHit() {
    this.beep(200, 90, "square", 0.25)
  }
  sfxCollect() {
    this.beep(1200, 60, "square", 0.18)
    setTimeout(() => this.beep(1600, 60, "square", 0.18), 70)
  }
  sfxDeath() {
    this.beep(300, 120, "square", 0.25)
    setTimeout(() => this.beep(220, 140, "square", 0.25), 120)
  }

  startMusic() {
    if (this.started) return
    this.ensure()
    this.started = true
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0]
    const playNote = (freq: number, durMs: number) => {
      if (!this.ctx || !this.musicGain) return
      const t = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      osc.type = "square"
      osc.frequency.setValueAtTime(freq, t)
      g.gain.value = 0.09
      osc.connect(g)
      g.connect(this.musicGain)
      osc.start()
      const end = t + durMs / 1000
      g.gain.setValueAtTime(0.09, t)
      g.gain.exponentialRampToValueAtTime(0.0001, end)
      osc.stop(end)
    }
    this.musicInterval = window.setInterval(() => {
      const motif = [0, 2, 4, 2, 0, 2, 3, 2]
      const base = Math.random() < 0.5 ? 0 : 12
      motif.forEach((idx, i) => {
        const freq = scale[idx % scale.length] * Math.pow(2, base / 12)
        setTimeout(() => playNote(freq, 160), i * 180)
      })
    }, 8 * 180)
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval)
      this.musicInterval = null
    }
    this.started = false
  }
}
const audio = new AudioEngine()

// Utils
function aabb(a: Rect, b: Rect) {
  return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h)
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
function makePlayer(spawnX: number, spawnY: number): Player {
  return {
    x: spawnX,
    y: spawnY,
    w: 8,
    h: 12,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    crouch: false,
    canFireAt: 0,
    invuln: 0,
  }
}

// Levels
function levelIntro(): Level {
  const worldW = 520
  const groundY = 110
  const platforms: Platform[] = [
    { x: 0, y: groundY, w: worldW, h: 8 },
    { x: 160, y: groundY - 12, w: 30, h: 6 },
  ]
  return {
    kind: "intro",
    platforms,
    enemies: [],
    projs: [],
    arrows: [],
    gem: { x: worldW - 30, y: groundY - 20, w: 10, h: 10 },
    cameraX: 0,
    worldW,
    worldH: BASE_H,
    tick: 0,
  }
}

// Fase 1: adjusted gaps and slower moving platform (already achievable with JUMP_VEL)
function levelFase1(): Level {
  const worldW = 820
  const groundY = 110
  const platforms: Platform[] = [
    { x: 0, y: groundY, w: 180, h: 8 },
    { x: 196, y: groundY, w: 110, h: 8 }, // gap 16
    { x: 324, y: groundY, w: 100, h: 8 }, // gap 18
    { x: 444, y: groundY, w: 90, h: 8 }, // gap 20
    { x: 552, y: groundY, w: 90, h: 8 }, // gap 18
    { x: 662, y: groundY, w: 120, h: 8 }, // gap 20
    { x: 308, y: groundY - 22, w: 34, h: 6, vx: 0.3, range: [300, 360] },
  ]
  return {
    kind: "fase1",
    platforms,
    enemies: [],
    projs: [],
    arrows: [],
    gem: { x: worldW - 26, y: groundY - 20, w: 10, h: 10 },
    cameraX: 0,
    worldW,
    worldH: BASE_H,
    tick: 0,
  }
}

function levelFase2(): Level {
  const worldW = 700
  const groundY = 110
  const platforms: Platform[] = [
    { x: 0, y: groundY, w: worldW, h: 8 },
    { x: 220, y: groundY - 24, w: 36, h: 6 },
    { x: 420, y: groundY - 18, w: 36, h: 6 },
  ]
  const swordsman: Swordsman = {
    type: "swordsman",
    x: 360,
    y: groundY - 16,
    w: 10,
    h: 14,
    alive: true,
    dir: -1,
    minX: 330,
    maxX: 480,
    speed: 0.4,
  }
  return {
    kind: "fase2",
    platforms,
    enemies: [swordsman],
    projs: [],
    arrows: [],
    gem: { x: worldW - 26, y: groundY - 20, w: 10, h: 10 },
    cameraX: 0,
    worldW,
    worldH: BASE_H,
    tick: 0,
  }
}

function levelFase3(): Level {
  const worldW = 720
  const groundY = 110
  const platforms: Platform[] = [
    { x: 0, y: groundY, w: worldW, h: 8 },
    { x: 160, y: groundY - 22, w: 40, h: 6 },
    { x: 220, y: groundY - 32, w: 40, h: 6 },
    { x: 280, y: groundY - 22, w: 40, h: 6 },
  ]
  const archer: Archer = {
    type: "archer",
    x: 380,
    y: groundY - 16,
    w: 10,
    h: 14,
    alive: true,
    cooldown: 0,
    fireRate: 180,
  }
  return {
    kind: "fase3",
    platforms,
    enemies: [archer],
    projs: [],
    arrows: [],
    gem: { x: worldW - 26, y: groundY - 20, w: 10, h: 10 },
    cameraX: 0,
    worldW,
    worldH: BASE_H,
    tick: 0,
  }
}

function levelBoss(): Level {
  const worldW = 640
  const groundY = 110
  const platforms: Platform[] = [{ x: 0, y: groundY, w: worldW, h: 8 }]
  const boss: Boss = {
    x: worldW - 90,
    y: groundY - 20,
    w: 18,
    h: 20,
    hp: 3,
    alive: true,
    phase: 0,
    timer: 0,
    vx: 0,
    vy: 0,
    grounded: true,
  }
  return {
    kind: "boss",
    platforms,
    enemies: [],
    projs: [],
    arrows: [],
    gem: { x: worldW - 32, y: groundY - 20, w: 12, h: 12 },
    cameraX: 0,
    worldW,
    worldH: BASE_H,
    tick: 0,
    boss,
  }
}

// Rendering helpers
function drawPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function drawGem(ctx: CanvasRenderingContext2D, r: Rect, t: number) {
  const c = ctx
  const pulse = 0.5 + 0.5 * Math.sin(t / 300)
  c.fillStyle = COLORS.gold
  c.fillRect(r.x + r.w / 2 - 2, r.y, 4, 4)
  c.fillRect(r.x + 1, r.y + 4, r.w - 2, 4)
  c.fillStyle = COLORS.jade
  c.fillRect(r.x + 2, r.y + 8, r.w - 4, 4)
  c.globalAlpha = 0.6
  c.fillStyle = COLORS.ui
  c.fillRect(r.x + r.w - 1, r.y + 1, 1, 1)
  c.globalAlpha = 1
  c.globalAlpha = 0.2 + 0.2 * pulse
  c.fillStyle = COLORS.gold
  c.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 6)
  c.globalAlpha = 1
}

// Enhanced background (mountains, bamboo or pagoda)
function drawBackground(ctx: CanvasRenderingContext2D, level: Level, t: number) {
  const dusk = level.kind === "boss"
  // Sky gradient (striped)
  const stripes = 8
  for (let i = 0; i < stripes; i++) {
    const k = i / (stripes - 1)
    const rTop = dusk ? 0x15 : 0x08
    const gTop = dusk ? 0x0c : 0x11
    const bTop = dusk ? 0x1a : 0x19
    const rBot = dusk ? 0x27 : 0x14
    const gBot = dusk ? 0x13 : 0x24
    const bBot = dusk ? 0x38 : 0x3a
    const r = Math.round(rTop + (rBot - rTop) * k)
    const g = Math.round(gTop + (gBot - gTop) * k)
    const b = Math.round(bTop + (bBot - bTop) * k)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, Math.floor((BASE_H / stripes) * i), BASE_W, Math.ceil(BASE_H / stripes))
  }

  // Parallax mountains
  ctx.fillStyle = COLORS.mountainFar
  for (let i = -30; i < BASE_W + 30; i += 60) {
    const peakH = 26 + ((i / 60) % 2) * 12
    const x = Math.floor(i - (level.cameraX * 0.2) % 60)
    ctx.fillRect(x, BASE_H - 64, 44, peakH)
  }
  ctx.fillStyle = COLORS.mountainNear
  for (let i = -20; i < BASE_W + 20; i += 50) {
    const peakH = 34 + (((i + 25) / 50) % 2) * 14
    const x = Math.floor(i - (level.cameraX * 0.45) % 50)
    ctx.fillRect(x, BASE_H - 52, 34, peakH)
  }

  // Cloud strips
  ctx.fillStyle = "rgba(255,255,255,0.15)"
  const drift = (t * 0.02) % (BASE_W + 60)
  for (let i = 0; i < 3; i++) {
    const cx = Math.floor((i * 90 - drift + BASE_W + 60) % (BASE_W + 60) - 30)
    const cy = 18 + i * 12
    ctx.fillRect(cx, cy, 24, 4)
    ctx.fillRect(cx + 8, cy - 3, 18, 4)
    ctx.fillRect(cx + 16, cy + 2, 20, 3)
  }

  // Foreground: bamboo or pagoda temple
  if (level.kind === "intro" || level.kind === "fase1" || level.kind === "fase3") {
    drawBambooGrove(ctx, level)
  } else {
    drawPagodaTemple(ctx, level.kind === "boss", t)
  }
}

// Bamboo grove with nodes and leaves in two parallax layers
function drawBambooGrove(ctx: CanvasRenderingContext2D, level: Level) {
  for (let layer = 0; layer < 2; layer++) {
    const par = layer === 0 ? 0.25 : 0.45
    const colorStem = layer === 0 ? COLORS.bambooDark : COLORS.bamboo
    const colorNode = COLORS.bambooNode
    const count = layer === 0 ? 6 : 7
    for (let i = 0; i < count; i++) {
      const baseX = (i * 36 + Math.floor(level.cameraX * par)) % (BASE_W + 30) - 15
      const height = layer === 0 ? 54 : 64
      const yBase = BASE_H - 72
      // stem + light edge
      ctx.fillStyle = colorStem
      ctx.fillRect(baseX, yBase, 3, height)
      ctx.fillStyle = colorNode
      for (let n = 6; n < height; n += 8) ctx.fillRect(baseX - 1, yBase + n, 6, 1)
      // leaves clusters
      ctx.fillStyle = colorStem
      ctx.fillRect(baseX - 5, yBase + 10, 7, 2)
      ctx.fillRect(baseX - 3, yBase + 18, 9, 2)
      ctx.fillRect(baseX - 6, yBase + 28, 8, 2)
      ctx.fillRect(baseX - 4, yBase + 38, 9, 2)
    }
  }
}

// Significantly enhanced pagoda temple with curved eaves, columns, lattice and lanterns
function drawPagodaTemple(ctx: CanvasRenderingContext2D, bossDusk: boolean, t: number) {
  const baseY = BASE_H - 68
  // Columns
  ctx.fillStyle = bossDusk ? COLORS.templeColDark : COLORS.templeCol
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(24 + i * 14, baseY + 14, 4, 26)
  }

  // Roof tiers (5 levels)
  const tiers = [
    { y: baseY + 12, w: 104, h: 6 },
    { y: baseY + 4, w: 84, h: 6 },
    { y: baseY - 6, w: 64, h: 6 },
    { y: baseY - 16, w: 44, h: 6 },
    { y: baseY - 26, w: 30, h: 6 },
  ]
  for (let i = 0; i < tiers.length; i++) {
    const tr = tiers[i]
    const x = Math.floor(BASE_W / 2 - tr.w / 2)
    // main roof tile
    ctx.fillStyle = COLORS.roofTile
    ctx.fillRect(x, tr.y, tr.w, tr.h)
    // shadow under roof
    ctx.fillStyle = COLORS.roofTileDark
    ctx.fillRect(x, tr.y + tr.h - 1, tr.w, 1)
    // upturned eaves
    ctx.fillStyle = COLORS.roofEdge
    ctx.fillRect(x - 6, tr.y + tr.h - 2, 6, 2)
    ctx.fillRect(x + tr.w, tr.y + tr.h - 2, 6, 2)
  }

  // Lattice window band
  const winY = baseY + 8
  const winW = 64
  const winX = Math.floor(BASE_W / 2 - winW / 2)
  ctx.fillStyle = COLORS.lattice
  ctx.fillRect(winX, winY, winW, 4)
  for (let i = 0; i < winW; i += 6) {
    ctx.fillRect(winX + i, winY - 1, 1, 6)
  }

  // Top finial
  ctx.fillStyle = COLORS.gold
  ctx.fillRect(Math.floor(BASE_W / 2 - 1), baseY - 34, 2, 10)

  // Hanging lanterns (with subtle pulsating glow)
  const glowPulse = 0.25 + 0.15 * Math.sin(t / 350)
  ctx.globalAlpha = glowPulse
  ctx.fillStyle = COLORS.lanternGlow
  ctx.fillRect(22, baseY + 10, 6, 8)
  ctx.fillRect(BASE_W - 28, baseY + 10, 6, 8)
  ctx.globalAlpha = 1
  ctx.fillStyle = COLORS.lantern
  ctx.fillRect(24, baseY + 12, 2, 2)
  ctx.fillRect(BASE_W - 26, baseY + 12, 2, 2)
  // tassels
  ctx.fillRect(25, baseY + 14, 1, 2)
  ctx.fillRect(BASE_W - 25, baseY + 14, 1, 2)
}

// Stone design: tile platforms as stone blocks with seams and cracks; ground pebbles
function drawStonePlatform(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // Base body
  drawPixelRect(ctx, x, y, w, h, COLORS.stoneMid)
  // Top highlight strip
  ctx.fillStyle = COLORS.stoneLight
  ctx.fillRect(x, y, w, 1)
  // Vertical seams every 12px
  ctx.fillStyle = COLORS.stoneDark
  for (let sx = x + 10; sx < x + w; sx += 12) {
    ctx.fillRect(sx, y + 1, 1, h - 1)
  }
  // Small cracks: deterministic pattern
  ctx.fillStyle = COLORS.stoneCrack
  for (let sx = x + 6; sx < x + w - 4; sx += 16) {
    ctx.fillRect(sx, y + Math.max(2, (sx % 7) + 2), 2, 1)
    if ((sx / 8) % 2 < 1) ctx.fillRect(sx + 4, y + h - 3, 1, 1)
  }
}

function drawGroundPebbles(ctx: CanvasRenderingContext2D, cam: number) {
  // Scatter pebbles along the ground strip based on screen positions
  for (let i = -16; i < BASE_W + 16; i += 24) {
    const px = i + Math.floor(cam * 0.5) % 24
    const gy = BASE_H - 6
    ctx.fillStyle = COLORS.stoneDark
    ctx.fillRect(px, gy, 2, 1)
    ctx.fillStyle = COLORS.stoneLight
    ctx.fillRect(px + 3, gy + 1, 1, 1)
    ctx.fillStyle = COLORS.stoneMid
    ctx.fillRect(px + 6, gy, 2, 1)
  }
}

function drawGroundAndPlatforms(ctx: CanvasRenderingContext2D, level: Level, cam: number) {
  // Ground strip
  ctx.fillStyle = COLORS.ground
  ctx.fillRect(0, BASE_H - 10, BASE_W, 10)
  drawGroundPebbles(ctx, cam)

  // Stone platforms
  level.platforms.forEach((p) => {
    const screenX = Math.floor(p.x - cam)
    drawStonePlatform(ctx, screenX, p.y, p.w, p.h)
  })
}

// Player (samurai-inspired, already updated previously)
function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, cam: number, tick: number) {
  const x = Math.floor(p.x - cam)
  const y = Math.floor(p.y)

  // subtle ground shadow
  ctx.globalAlpha = 0.22
  ctx.fillStyle = "#000000"
  ctx.fillRect(x + 1, y + p.h, p.w - 2, 2)
  ctx.globalAlpha = 1

  // kabuto crest
  ctx.fillStyle = COLORS.roofEdge
  ctx.fillRect(x + 3, y - 1, 2, 1)
  ctx.fillRect(x + 1, y, 6, 1)

  // head/face
  drawPixelRect(ctx, x + 2, y + 1, 4, 2, COLORS.playerSkin)
  // eyes
  ctx.fillStyle = "#2a2a2a"
  ctx.fillRect(x + (p.facing === 1 ? 4 : 3), y + 1, 1, 1)

  // shoulder pads + chest armor
  drawPixelRect(ctx, x - 1, y + 3, 2, 2, COLORS.playerArmor)
  drawPixelRect(ctx, x + p.w - 1, y + 3, 2, 2, COLORS.playerArmor)
  drawPixelRect(ctx, x + 1, y + 3, p.w - 2, 3, COLORS.playerArmor)
  // sash
  drawPixelRect(ctx, x + 1, y + 6, p.w - 2, 2, COLORS.playerCloth)
  // hakama
  drawPixelRect(ctx, x, y + 8, p.w, 4, COLORS.playerCloth)
  // katana sheath
  ctx.fillStyle = COLORS.steel
  const sheathX = p.facing === 1 ? x - 1 : x + p.w
  ctx.fillRect(sheathX, y + 2, 1, 8)

  // legs simple walk
  const walking = Math.abs(p.vx) > 0.2 && p.onGround && !p.crouch
  const phase = walking ? ((tick >> 3) & 1) : 0
  ctx.fillStyle = COLORS.playerSkin
  if (!p.crouch) {
    if (walking) {
      if (phase === 0) {
        ctx.fillRect(x + 1, y + 12, 2, 2)
        ctx.fillRect(x + p.w - 3, y + 13, 2, 1)
      } else {
        ctx.fillRect(x + 1, y + 13, 2, 1)
        ctx.fillRect(x + p.w - 3, y + 12, 2, 2)
      }
    } else {
      ctx.fillRect(x + 1, y + 12, 2, 2)
      ctx.fillRect(x + p.w - 3, y + 12, 2, 2)
    }
  } else {
    ctx.fillRect(x + 1, y + 10, p.w - 2, 2)
  }
}

// Samurai-styled enemies (swordsman and archer) with simple 2-frame animation
function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, cam: number, tick: number) {
  if (!e.alive) return
  const x = Math.floor(e.x - cam)
  const y = Math.floor(e.y)

  const walking = e.type === "swordsman"
  const phase = walking ? ((tick >> 4) & 1) : 0

  // Helmet crest
  ctx.fillStyle = COLORS.samuraiTrim
  ctx.fillRect(x + 3, y, 2, 1)

  // Face
  drawPixelRect(ctx, x + 2, y + 1, 4, 2, COLORS.samuraiFace)

  // Armor torso
  drawPixelRect(ctx, x + 1, y + 3, e.w - 2, 4, COLORS.samuraiArmor)
  // Shoulder plates
  ctx.fillRect(x - 1, y + 3, 2, 2)
  ctx.fillRect(x + e.w - 1, y + 3, 2, 2)

  // Lower armor
  drawPixelRect(ctx, x, y + 7, e.w, 3, COLORS.samuraiArmor)

  // Legs animation
  ctx.fillStyle = COLORS.samuraiFace
  if (phase === 0) {
    ctx.fillRect(x + 1, y + e.h - 2, 2, 2)
    ctx.fillRect(x + e.w - 3, y + e.h - 1, 2, 1)
  } else {
    ctx.fillRect(x + 1, y + e.h - 1, 2, 1)
    ctx.fillRect(x + e.w - 3, y + e.h - 2, 2, 2)
  }

  // Weapon hint
  if (e.type === "swordsman") {
    // katana at hip
    ctx.fillStyle = COLORS.steel
    ctx.fillRect(x + e.w, y + 8, 2, 1)
  } else {
    // archer bow outline (right side)
    ctx.fillStyle = COLORS.steel
    ctx.fillRect(x + e.w, y + 5, 1, 6)
    ctx.fillRect(x + e.w - 1, y + 5, 1, 1)
    ctx.fillRect(x + e.w - 1, y + 10, 1, 1)
  }
}

// Samurai warlord boss with animated crest and heavier armor
function drawBoss(ctx: CanvasRenderingContext2D, b: Boss, cam: number, tick: number) {
  if (!b.alive) return
  const x = Math.floor(b.x - cam)
  const y = Math.floor(b.y)

  // Large shadow
  ctx.globalAlpha = 0.25
  ctx.fillStyle = "#000000"
  ctx.fillRect(x + 2, y + b.h, b.w - 4, 2)
  ctx.globalAlpha = 1

  // Horned crest animation
  ctx.fillStyle = COLORS.samuraiTrim
  const crestPulse = (tick >> 4) % 2 === 0 ? 0 : 1
  ctx.fillRect(x + 6, y - 1 - crestPulse, 2, 1)
  ctx.fillRect(x + b.w - 8, y - 1 - crestPulse, 2, 1)

  // Helmet
  drawPixelRect(ctx, x + 4, y, b.w - 8, 2, COLORS.roofEdge)

  // Face
  drawPixelRect(ctx, x + 6, y + 2, b.w - 12, 3, COLORS.samuraiFace)
  ctx.fillStyle = "#2a2a2a"
  ctx.fillRect(x + 7, y + 3, 1, 1)
  ctx.fillRect(x + b.w - 8, y + 3, 1, 1)

  // Heavy armor chest
  drawPixelRect(ctx, x + 3, y + 5, b.w - 6, 6, COLORS.samuraiArmor)
  // Shoulder guards
  ctx.fillRect(x + 1, y + 6, 2, 3)
  ctx.fillRect(x + b.w - 3, y + 6, 2, 3)
  // Waist plates
  drawPixelRect(ctx, x + 2, y + 11, b.w - 4, 4, COLORS.samuraiArmor)

  // Leg plates (slight bob)
  const bob = (tick >> 3) & 1
  ctx.fillStyle = COLORS.samuraiFace
  ctx.fillRect(x + 4, y + 16 + bob, 3, 2)
  ctx.fillRect(x + b.w - 7, y + 16 + (1 - bob), 3, 2)
}

// Projectiles (enhanced fireball already)
function drawProjectile(ctx: CanvasRenderingContext2D, pr: Projectile, cam: number) {
  const x = Math.floor(pr.x - cam)
  const y = Math.floor(pr.y)
  if (pr.friendly) {
    // aura
    ctx.globalAlpha = 0.35
    ctx.fillStyle = COLORS.fireBright
    ctx.fillRect(x - 1, y - 1, pr.w + 2, pr.h + 2)
    ctx.globalAlpha = 1
    // core
    drawPixelRect(ctx, x, y, pr.w, pr.h, COLORS.fire)
    // center sparkle
    ctx.fillStyle = COLORS.fireBright
    ctx.fillRect(x + 1, y, 1, 1)
    // trailing sparks
    const dir = Math.sign(pr.vx) || 1
    ctx.globalAlpha = 0.6
    ctx.fillStyle = COLORS.fire
    ctx.fillRect(x - dir * 2, y, 2, 1)
    ctx.globalAlpha = 0.4
    ctx.fillStyle = COLORS.fireBright
    ctx.fillRect(x - dir * 3, y + 1, 1, 1)
    ctx.globalAlpha = 1
  } else {
    drawPixelRect(ctx, x, y, pr.w, pr.h, COLORS.arrow)
  }
}

// HUD (canvas) – cooldown bar only; labels are HTML overlays
function drawHUDCanvas(ctx: CanvasRenderingContext2D, player: Player, t: number) {
  const cd = Math.max(0, player.canFireAt - t)
  const cdFrac = 1 - clamp(cd / 5000, 0, 1)
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.fillRect(4, 14, 56, 6)
  ctx.fillStyle = "#444444"
  ctx.fillRect(6, 16, 52, 2)
  ctx.fillStyle = COLORS.fire
  ctx.fillRect(6, 16, Math.floor(52 * cdFrac), 2)
}

// Input hook
function useKeys(): Keys {
  const keysRef = useRef<Keys>({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    fire: false,
    crouch: false,
  })

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) keysRef.current.left = true
      if (["ArrowRight", "d", "D"].includes(e.key)) keysRef.current.right = true
      if (["ArrowUp", "w", "W"].includes(e.key)) keysRef.current.up = true
      if (["ArrowDown", "s", "S"].includes(e.key)) keysRef.current.down = true
      if (e.key === " " || e.code === "Space") keysRef.current.jump = true
      if (e.key === "f" || e.key === "F") keysRef.current.fire = true
      if (["ArrowDown", "s", "S"].includes(e.key)) keysRef.current.crouch = true
    }
    const onUp = (e: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) keysRef.current.left = false
      if (["ArrowRight", "d", "D"].includes(e.key)) keysRef.current.right = false
      if (["ArrowUp", "w", "W"].includes(e.key)) keysRef.current.up = false
      if (["ArrowDown", "s", "S"].includes(e.key)) keysRef.current.down = false
      if (e.key === " " || e.code === "Space") keysRef.current.jump = false
      if (e.key === "f" || e.key === "F") keysRef.current.fire = false
      if (["ArrowDown", "s", "S"].includes(e.key)) keysRef.current.crouch = false
    }
    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
    }
  }, [])

  return keysRef.current
}

export default function Page() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-black">
      <div className="w-full max-w-5xl aspect-video relative">
        <Game />
      </div>
    </main>
  )
}

function Game() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [mode, setMode] = useState<GameMode>("menu")
  const [levelIndex, setLevelIndex] = useState<number>(0) // 0:intro,1..3:fases,4:boss
  const [hint, setHint] = useState<string>("")
  const [showCredits, setShowCredits] = useState<boolean>(false)
  const keys = useKeys()
  const playerRef = useRef<Player>(makePlayer(16, 40))
  const levelRef = useRef<Level>(levelIntro())
  const lastTimeRef = useRef<number>(0)
  const [started, setStarted] = useState(false)

  // Handle start/restart with Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (mode === "menu" || mode === "win" || mode === "gameover") {
          startGame()
        }
      }
      if (!started) {
        setStarted(true)
        audio.ensure()
        audio.resume()
        audio.startMusic()
      } else {
        audio.resume()
      }
    }
    const onClick = () => {
      if (!started) {
        setStarted(true)
        audio.ensure()
        audio.resume()
        audio.startMusic()
      }
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onClick)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onClick)
    }
  }, [mode, started])

  function startGame() {
    setMode("playing")
    setShowCredits(false)
    setLevelIndex(0)
    playerRef.current = makePlayer(16, 40)
    levelRef.current = levelIntro()
    setHint("Bem-vindo! Ande com ← → (A D). Pular: Espaço. Agachar: S. Fogo: F.")
  }

  function nextLevel() {
    const idx = levelIndex + 1
    setLevelIndex(idx)
    if (idx === 1) {
      levelRef.current = levelFase1()
      playerRef.current = makePlayer(16, 40)
      setHint("Fase 1: pule abismos curtos. Plataforma móvel é opcional.")
    } else if (idx === 2) {
      levelRef.current = levelFase2()
      playerRef.current = makePlayer(16, 40)
      setHint("Fase 2: derrote o Espadachim com uma bola de fogo (F).")
    } else if (idx === 3) {
      levelRef.current = levelFase3()
      playerRef.current = makePlayer(16, 40)
      setHint("Fase 3: desvie das flechas agachando com S.")
    } else if (idx === 4) {
      levelRef.current = levelBoss()
      playerRef.current = makePlayer(24, 40)
      setHint("Chefe Doni: padrão previsível—pular ataques e contra-atacar com F.")
    } else {
      setMode("win")
    }
  }

  // Main loop
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    let raf = 0

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (lastTimeRef.current === 0) lastTimeRef.current = t
      const dt = clamp((t - lastTimeRef.current) / 16.67, 0.5, 1.5)
      lastTimeRef.current = t

      // Render first (background anims independent of mode)
      render(ctx, levelRef.current, playerRef.current, t, mode === "playing")

      if (mode !== "playing") {
        return
      }

      // Update world
      update(levelRef.current, playerRef.current, keys, t, dt)

      // Level completion
      if (aabb(playerRef.current, levelRef.current.gem)) {
        audio.sfxCollect()
        nextLevel()
      }

      // Lose condition
      if (playerRef.current.y > BASE_H + 10) {
        audio.sfxDeath()
        setMode("gameover")
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mode, levelIndex])

  function render(
    ctx: CanvasRenderingContext2D,
    level: Level,
    player: Player,
    t: number,
    showPlayerAndEntities: boolean
  ) {
    ctx.clearRect(0, 0, BASE_W, BASE_H)
    drawBackground(ctx, level, t)
    drawGroundAndPlatforms(ctx, level, level.cameraX)

    if (showPlayerAndEntities) {
      level.enemies.forEach((e) => drawEnemy(ctx, e, level.cameraX, level.tick))
      if (level.boss) drawBoss(ctx, level.boss, level.cameraX, level.tick)
      level.arrows.forEach((a) => drawProjectile(ctx, a, level.cameraX))
      level.projs.forEach((p) => drawProjectile(ctx, p, level.cameraX))
      drawPlayer(ctx, player, level.cameraX, level.tick)
      drawHUDCanvas(ctx, player, t)
    }

    // Gem (always visible)
    drawGem(ctx, { ...level.gem, x: level.gem.x - level.cameraX }, t)
  }

  // UI overlays (crisp HTML text)
  const levelName =
    levelRef.current.kind === "intro"
      ? "Introdução"
      : levelRef.current.kind === "fase1"
      ? "Fase 1: Abismos"
      : levelRef.current.kind === "fase2"
      ? "Fase 2: Espadachim"
      : levelRef.current.kind === "fase3"
      ? "Fase 3: Flechas"
      : "Chefe: Doni das Trevas"

  return (
    <div className="relative h-full w-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={BASE_W}
        height={BASE_H}
        style={{
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
          background: "black",
        }}
        aria-label="Jogo de plataforma 2D em pixel art ambientado na China Antiga"
      />

      {/* HUD overlay: crisp text */}
      <div className="pointer-events-none absolute inset-0 text-white">
        {/* Top bar: left label and right level name */}
        {mode === "playing" && (
          <>
            <div
              className="absolute top-2 left-2 px-2 py-1 rounded"
              style={{ background: COLORS.panel, textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}
            >
              <span className="text-[12px] sm:text-sm leading-none font-medium">F: Bola de Fogo</span>
            </div>
            <div
              className="absolute top-2 right-2 max-w-[70%] px-2 py-1 rounded text-right"
              style={{ background: COLORS.panel, textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}
            >
              <span className="text-[12px] sm:text-sm leading-tight font-semibold break-words">{levelName}</span>
            </div>
            {hint && (
              <div
                className="absolute left-1/2 -translate-x-1/2 bottom-2 max-w-[92%] sm:max-w-[80%] px-3 py-2 rounded"
                style={{ background: COLORS.panel, textShadow: "0 2px 4px rgba(0,0,0,0.9)" }}
              >
                <p className="text-[12px] sm:text-sm leading-snug text-center break-words">{hint}</p>
              </div>
            )}
          </>
        )}

        {/* Menu overlay */}
        {mode === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
            <h1
              className="text-2xl sm:text-3xl font-extrabold text-center"
              style={{ textShadow: "0 2px 6px rgba(0,0,0,0.95)" }}
            >
              A Jornada na China Antiga
            </h1>
            <p
              className="text-sm sm:text-base max-w-[90%] text-center"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}
            >
              Plataforma 2D estilo retrô. Ande com ← → (A D). Pular: Espaço. Agachar: S. Fogo: F.
            </p>
            <div className="pointer-events-auto mt-2 flex gap-2">
              <Button
                onClick={() => startGame()}
                className="bg-emerald-700 hover:bg-emerald-600"
                aria-label="Iniciar o jogo"
              >
                Iniciar (Enter)
              </Button>
              <Button
                onClick={() => setShowCredits(true)}
                className="bg-zinc-700 hover:bg-zinc-600"
                aria-label="Ver créditos"
              >
                Créditos
              </Button>
            </div>
          </div>
        )}

        {/* Credits overlay */}
        {mode === "menu" && showCredits && (
          <div className="pointer-events-auto absolute inset-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCredits(false)} />
            <div className="relative z-10 max-w-[90%] sm:max-w-md bg-zinc-900/90 text-white rounded-lg p-4 shadow-lg">
              <h2 className="text-lg font-semibold mb-2">Créditos</h2>
              <p className="text-sm leading-snug">
                Desenvolvido por Miguel Pietro (303)
                <br />
                Grupo: Ana Laura, Ana Luiza, Leticia, Linkeker, Maria Fernanda, Miguel, Vitoria, Yasmin.
              </p>
              <div className="mt-3 text-right">
                <Button onClick={() => setShowCredits(false)} className="bg-emerald-700 hover:bg-emerald-600">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Win overlay */}
        {mode === "win" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
            <div
              className="px-3 py-2 rounded"
              style={{ background: COLORS.panel, textShadow: "0 2px 6px rgba(0,0,0,0.95)" }}
            >
              <h2 className="text-xl sm:text-2xl font-bold text-center">Venceu!</h2>
            </div>
            <p
              className="text-sm sm:text-base text-center max-w-[90%]"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}
            >
              Aperte Enter para reiniciar
            </p>
          </div>
        )}

        {/* Game over overlay */}
        {mode === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
            <div
              className="px-3 py-2 rounded"
              style={{ background: COLORS.panel, textShadow: "0 2px 6px rgba(0,0,0,0.95)" }}
            >
              <h2 className="text-xl sm:text-2xl font-bold text-center">Game Over</h2>
            </div>
            <p
              className="text-sm sm:text-base text-center max-w-[90%]"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}
            >
              Aperte Enter para reiniciar
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Update logic
function update(level: Level, p: Player, keys: Keys, t: number, dt: number) {
  level.tick++

  // Move platforms (optional)
  for (const pl of level.platforms) {
    if (pl.vx && pl.range) {
      pl.x += pl.vx * dt
      if (pl.x < pl.range[0] || pl.x + pl.w > pl.range[1]) pl.vx *= -1
    }
  }

  // Input
  const wantLeft = keys.left && !keys.right
  const wantRight = keys.right && !keys.left
  const onGround = p.onGround
  p.crouch = keys.crouch && onGround
  const maxSpeed = p.crouch ? MOVE_SPEED * 0.6 : MOVE_SPEED

  if (wantLeft) {
    p.vx = -maxSpeed
    p.facing = -1
  } else if (wantRight) {
    p.vx = maxSpeed
    p.facing = 1
  } else {
    p.vx *= 0.8
    if (Math.abs(p.vx) < 0.02) p.vx = 0
  }

  if (keys.jump && onGround && !p.crouch) {
    p.vy = JUMP_VEL
    p.onGround = false
    audio.sfxJump()
  }

  // Fireball
  if (keys.fire && t >= p.canFireAt) {
    const fb: Projectile = {
      x: p.facing === 1 ? p.x + p.w : p.x - 4,
      y: p.y + 4,
      w: 4,
      h: 3,
      vx: p.facing * 2.2,
      vy: 0,
      life: 120,
      friendly: true,
    }
    level.projs.push(fb)
    p.canFireAt = t + 5000
    audio.sfxShoot()
  }

  // Gravity
  p.vy += GRAVITY * dt
  p.vy = clamp(p.vy, -999, MAX_FALL)

  // Crouch height
  const baseH = 12
  const crouchH = 8
  const prevH = p.h
  p.h = p.crouch ? crouchH : baseH
  if (p.h < prevH) p.y += prevH - p.h

  // Integrate and collide
  moveAndCollide(p, level.platforms, dt)

  // Camera follow
  level.cameraX = clamp(p.x - BASE_W / 2 + p.w / 2, 0, level.worldW - BASE_W)

  // Enemies AI
  for (const e of level.enemies) {
    if (!e.alive) continue
    if (e.type === "swordsman") {
      e.x += e.dir * e.speed * dt
      if (e.x < e.minX || e.x + e.w > e.maxX) e.dir *= -1
      const ground = findGroundBelow(e, level.platforms)
      if (ground) e.y = ground.y - e.h
      if (aabb(p, e)) {
        p.vx = (p.x < e.x ? -1 : 1) * 1.2
        p.vy = -2
      }
    } else if (e.type === "archer") {
      e.cooldown--
      const ground = findGroundBelow(e, level.platforms)
      if (ground) e.y = ground.y - e.h
      if (e.cooldown <= 0) {
        const arrow: Projectile = {
          x: e.x + e.w,
          y: e.y + 6,
          w: 5,
          h: 2,
          vx: -1.6,
          vy: 0,
          life: 240,
          friendly: false,
        }
        arrow.vx = p.x > e.x ? 1.6 : -1.6
        level.arrows.push(arrow)
        e.cooldown = e.fireRate
      }
    }
  }

  // Projectiles
  for (const pr of level.projs) {
    pr.x += pr.vx * dt
    pr.y += pr.vy * dt
    pr.life--
  }
  for (const ar of level.arrows) {
    ar.x += ar.vx * dt
    ar.y += ar.vy * dt
    ar.life--
  }
  level.projs = level.projs.filter((pr) => pr.life > 0 && pr.x > -10 && pr.x < level.worldW + 10)
  level.arrows = level.arrows.filter((ar) => ar.life > 0 && ar.x > -10 && ar.x < level.worldW + 10)

  // Fireball collisions
  for (const pr of level.projs) {
    if (!pr.friendly) continue
    for (const e of level.enemies) {
      if (!e.alive) continue
      if (aabb(pr, e)) {
        e.alive = false
        pr.life = 0
        audio.sfxHit()
      }
    }
    if (level.boss && level.boss.alive && aabb(pr, level.boss)) {
      level.boss.hp -= 1
      pr.life = 0
      audio.sfxHit()
      if (level.boss.hp <= 0) {
        level.boss.alive = false
      }
    }
  }

  // Arrows hit player (crouch aids)
  for (const ar of level.arrows) {
    if (aabb(ar, p)) {
      const arrowMidY = ar.y + ar.h / 2
      const headHeight = p.y + (p.crouch ? 4 : 6)
      if (!(p.crouch && arrowMidY < headHeight)) {
        p.vx = -Math.sign(ar.vx) * 1.6
        p.vy = -2.5
        audio.sfxHit()
      }
    }
  }

  // Boss AI
  if (level.boss && level.boss.alive) {
    const b = level.boss
    b.timer++
    if (b.phase === 0) {
      if (b.timer === 1) {
        b.vx = p.x < b.x ? -1.2 : 1.2
        b.vy = -4.5
      }
      bossIntegrate(b, level.platforms, dt)
      if (b.grounded && b.timer > 90) {
        b.phase = 1
        b.timer = 0
      }
    } else if (b.phase === 1) {
      if (b.timer === 1) spawnShockwave(level, b)
      if (b.timer > 100) {
        b.phase = 2
        b.timer = 0
      }
    } else if (b.phase === 2) {
      if (b.timer === 1 || b.timer === 30 || b.timer === 60) {
        const dir = p.x < b.x ? -1 : 1
        level.arrows.push({
          x: b.x + (dir === 1 ? b.w : -4),
          y: b.y + 7,
          w: 5,
          h: 2,
          vx: dir * 1.8,
          vy: 0,
          life: 200,
          friendly: false,
        })
      }
      if (b.timer > 100) {
        b.phase = 0
        b.timer = 0
      }
    }
    if (aabb(b, p)) {
      p.vx = p.x < b.x ? -1.5 : 1.5
      p.vy = -3
    }
  }
}

// Movement and collisions
function moveAndCollide(body: Player | Boss, platforms: Platform[], dt: number) {
  // Horizontal
  body.x += (body as any).vx * dt
  for (const p of platforms) {
    if (aabb(body, p)) {
      if ((body as any).vx > 0) body.x = p.x - (body as any).w
      else if ((body as any).vx < 0) body.x = p.x + p.w
      ;(body as any).vx = 0
    }
  }
  // Vertical
  ;(body as any).onGround = false
  if ("grounded" in body) (body as Boss).grounded = false
  body.y += (body as any).vy * dt

  for (const p of platforms) {
    if (aabb(body, p)) {
      if ((body as any).vy > 0) {
        body.y = p.y - (body as any).h
        ;(body as any).vy = 0
        ;(body as any).onGround = true
        if ("grounded" in body) (body as Boss).grounded = true
      } else if ((body as any).vy < 0) {
        body.y = p.y + p.h
        ;(body as any).vy = 0
      }
    }
  }
}

function bossIntegrate(b: Boss, platforms: Platform[], dt: number) {
  b.vy += GRAVITY * dt
  b.vy = clamp(b.vy, -999, MAX_FALL)
  moveAndCollide(b, platforms, dt)
}

function findGroundBelow(a: Rect, platforms: Platform[]): Platform | null {
  let best: Platform | null = null
  let bestY = Infinity
  for (const p of platforms) {
    if (a.x + a.w > p.x && a.x < p.x + p.w) {
      if (p.y >= a.y && p.y < bestY) {
        bestY = p.y
        best = p
      }
    }
  }
  return best
}

function spawnShockwave(level: Level, boss: Boss) {
  const left: Projectile = { x: boss.x, y: boss.y + boss.h - 2, w: 6, h: 2, vx: -1.6, vy: 0, life: 90, friendly: false }
  const right: Projectile = { x: boss.x + boss.w - 6, y: boss.y + boss.h - 2, w: 6, h: 2, vx: 1.6, vy: 0, life: 90, friendly: false }
  level.arrows.push(left, right)
}
