import type { Shape } from '../model/song'

interface Props {
  shape?: Shape
  name?: string
  width?: number
  leftHanded?: boolean
  showFingers?: boolean
  dim?: boolean
}

const FRETS = 5

export function ChordDiagram({ shape, name, width = 72, leftHanded, showFingers = true, dim }: Props) {
  const pad = 10
  const top = 20
  const gw = 100
  const gh = 110
  const sx = gw / 5
  const fy = gh / FRETS
  const vbW = gw + pad * 2 + 8
  const vbH = gh + top + (name ? 26 : 8)
  const order = [0, 1, 2, 3, 4, 5]
  if (leftHanded) order.reverse()
  const x = (string: number) => pad + 8 + order.indexOf(string) * sx

  if (!shape) {
    return (
      <svg viewBox={`0 0 ${vbW} ${vbH}`} width={width} role="img" aria-label={`${name ?? 'chord'}: no diagram`}>
        <rect x={pad + 8} y={top} width={gw} height={gh} rx={4} className="fill-none stroke-[var(--line)]" strokeDasharray="4 4" />
        <text x={pad + 8 + gw / 2} y={top + gh / 2 + 5} textAnchor="middle" className="fill-[var(--muted)] text-[14px]">?</text>
        {name && <text x={pad + 8 + gw / 2} y={vbH - 4} textAnchor="middle" className="fill-[var(--ink)] text-[18px] font-semibold">{name}</text>}
      </svg>
    )
  }

  const base = shape.baseFret
  const barreFrets = shape.barres ?? []
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} width={width} role="img" aria-label={`${name ?? 'chord'} chord diagram`} className={dim ? 'opacity-50' : ''}>
      {/* nut or fret number */}
      {base <= 1 ? (
        <rect x={pad + 8} y={top - 4} width={gw} height={5} className="fill-[var(--ink)]" />
      ) : (
        <text x={pad + 2} y={top + fy * 0.65} textAnchor="end" className="fill-[var(--muted)] text-[13px]">{base}</text>
      )}
      {Array.from({ length: FRETS + 1 }, (_, i) => (
        <line key={'f' + i} x1={pad + 8} x2={pad + 8 + gw} y1={top + i * fy} y2={top + i * fy} className="stroke-[var(--line)]" strokeWidth={1.5} />
      ))}
      {order.map((s) => (
        <line key={'s' + s} x1={x(s)} x2={x(s)} y1={top} y2={top + gh} className="stroke-[var(--line)]" strokeWidth={s < 3 ? 2 : 1.4} />
      ))}
      {/* open / muted markers */}
      {shape.frets.map((f, s) =>
        f < 0 ? (
          <text key={'m' + s} x={x(s)} y={top - 8} textAnchor="middle" className="fill-[var(--muted)] text-[13px]">×</text>
        ) : f === 0 ? (
          <circle key={'o' + s} cx={x(s)} cy={top - 12} r={4.5} className="fill-none stroke-[var(--ink)]" strokeWidth={1.5} />
        ) : null,
      )}
      {/* barres */}
      {barreFrets.map((bf) => {
        const strings = shape.frets.map((f, s) => (f === bf ? s : -1)).filter((s) => s >= 0)
        if (strings.length < 2) return null
        const xs = strings.map(x)
        return (
          <rect key={'b' + bf} x={Math.min(...xs) - 7} y={top + (bf - 0.5) * fy - 7} width={Math.max(...xs) - Math.min(...xs) + 14} height={14} rx={7} className="fill-[var(--accent)]" />
        )
      })}
      {shape.frets.map((f, s) =>
        f > 0 ? (
          <g key={'d' + s}>
            <circle cx={x(s)} cy={top + (f - 0.5) * fy} r={8} className="fill-[var(--accent)]" />
            {showFingers && shape.fingers?.[s] ? (
              <text x={x(s)} y={top + (f - 0.5) * fy + 4.5} textAnchor="middle" className="fill-[var(--accent-ink)] text-[12px] font-bold">{shape.fingers[s]}</text>
            ) : null}
          </g>
        ) : null,
      )}
      {name && <text x={pad + 8 + gw / 2} y={vbH - 4} textAnchor="middle" className="fill-[var(--ink)] text-[18px] font-semibold">{name}</text>}
    </svg>
  )
}
