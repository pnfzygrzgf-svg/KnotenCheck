// Web Worker: führt die Stochastik-Simulation ausserhalb des UI-Threads aus,
// damit die Oberfläche während langer Läufe (z. B. mit Fussgänger*innen)
// bedienbar bleibt und die Simulation abgebrochen werden kann.

import { runStochasticSN640022, runStochasticSN640022Multi } from './engine/stochasticSN640022'
import type {
  StochasticConfig, StochasticSN640022Result, StochasticMultiResult, SimInterval,
} from './engine/stochasticSN640022'
import type { SN640022LaneFlags } from './engine/types'

export type SimRequest =
  | { kind: 'single'; volumes: number[][]; raw: number[][]; flags: SN640022LaneFlags; config: StochasticConfig }
  | { kind: 'multi'; intervals: SimInterval[]; flags: SN640022LaneFlags; config: StochasticConfig }

export type SimResponse =
  | { ok: true; result: StochasticSN640022Result | StochasticMultiResult | null }
  | { ok: false; error: string }

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SimRequest>) => void) | null
  postMessage: (msg: SimResponse) => void
}

ctx.onmessage = e => {
  const req = e.data
  try {
    const result = req.kind === 'single'
      ? runStochasticSN640022(req.volumes, req.flags, req.raw, req.config)
      : runStochasticSN640022Multi(req.intervals, req.flags, req.config)
    ctx.postMessage({ ok: true, result })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
