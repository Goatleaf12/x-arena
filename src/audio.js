// Tiny synthesized sound effects — no audio files needed.
export class Sfx {
  constructor() {
    this.ctx = null
    this.muted = false
  }

  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      } catch { /* audio unavailable */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
  }

  _tone(freqA, freqB, dur, type = 'sine', vol = 0.12, delay = 0) {
    if (!this.ctx || this.muted) return
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freqA, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqB), t0 + dur)
    gain.gain.setValueAtTime(vol, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.connect(gain).connect(this.ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  shoot() { this._tone(720, 180, 0.12, 'square', 0.07) }
  enemyShoot() { this._tone(420, 140, 0.12, 'square', 0.04) }
  hit() { this._tone(300, 90, 0.1, 'triangle', 0.12) }
  hurt() { this._tone(180, 60, 0.22, 'sawtooth', 0.14) }
  splat() { this._tone(500, 60, 0.25, 'triangle', 0.14); this._tone(900, 300, 0.12, 'sine', 0.08, 0.02) }
  coin() { this._tone(880, 880, 0.08, 'sine', 0.1); this._tone(1318, 1318, 0.14, 'sine', 0.1, 0.08) }
  count() { this._tone(660, 660, 0.12, 'sine', 0.12) }
  go() { this._tone(660, 660, 0.1, 'sine', 0.12); this._tone(990, 990, 0.22, 'sine', 0.12, 0.1) }
  win() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, f, 0.18, 'sine', 0.12, i * 0.12))
  }
}
