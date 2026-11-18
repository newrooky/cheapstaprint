// Public-domain hymn (John Newton, 1779) used as a practice song.
import { songFromText } from '../lib/importer'

const TEXT = `[Intro]
G   C   G   D

[Verse 1]
         G              G7         C        G
Amazing grace, how sweet the sound
                            Em      D
That saved a wretch like me
      G               G7          C          G
I once was lost, but now am found
           Em       D       G
Was blind, but now I see

[Verse 2]
         G                  G7           C          G
'Twas grace that taught my heart to fear
                                  Em     D
And grace my fears relieved
         G                 G7        C        G
How precious did that grace appear
          Em        D       G
The hour I first believed`

export const DEMO_SONG = {
  ...songFromText(TEXT, 'Amazing Grace', 'Traditional'),
  bpm: 90,
  strumIndex: 7, // Waltz 3/4
}
