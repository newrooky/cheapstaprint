import type { StrumPattern } from '../model/song'

const p = (name: string, perBeat: number, strokes: string, beats = 4): StrumPattern => ({
  name,
  perBeat,
  beats,
  strokes: strokes.split(' ') as StrumPattern['strokes'],
})

// Eighth-note patterns read "1 & 2 & 3 & 4 &".
export const STARTER_STRUMS: StrumPattern[] = [
  p('All downs (start here)', 2, 'D - D - D - D -'),
  p('Eighth notes', 2, 'D U D U D U D U'),
  p('Old faithful', 2, 'D - D U - U D U'),
  p('Pop / folk', 2, 'D - D U D U D U'),
  p('Rock push', 2, 'D - D - D U D U'),
  p('Island / reggae offbeat', 2, '- U - U - U - U'),
  p('Muted backbeat', 2, 'D - xD U D U xD U'),
  p('Ballad 6/8', 3, 'D - - D U U', 2),
  p('Waltz 3/4', 2, 'D - D U D U', 3),
]

export function countLabels(perBeat: number, beats: number): string[] {
  const sub = perBeat === 4 ? ['', 'e', '&', 'a'] : perBeat === 3 ? ['', '&', 'a'] : ['', '&']
  const out: string[] = []
  for (let b = 1; b <= beats; b++) for (const s of sub) out.push(s || String(b))
  return out
}
