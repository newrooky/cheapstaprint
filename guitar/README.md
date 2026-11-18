# Fretboard

A beginner-friendly guitar tab app. Installable web app for phone, tablet and laptop.

- **Add songs** by name (searches Ultimate Guitar, best-rated first), by pasting an Ultimate Guitar link, or by pasting any chord sheet / ChordPro text.
- **Chords**: diagrams for every chord in the song, tap any chord for other shapes and easier stand-ins. Mark the chords you know; songs flag the ones you don't.
- **Make it easier**: suggests a capo position with easier shapes that still sounds like the record, or swaps hard chords (F → Fmaj7, Bm → Bm7).
- **Strum patterns** from the tab (when Ultimate Guitar has one) or a starter library, with a metronome that lights up each strum, tap tempo and 50/75% practice speed.
- **Auto-scroll** at a steady speed, or locked to the Spotify song. Tap "Sync" and tap each line as the song reaches it once; after that the tab follows the song, and "Loop part" repeats the section you're on.
- **Spotify** (Premium): plays in the browser on desktop and Android; on iPhone it remote-controls the Spotify app.
- **Extras**: tuner (microphone), one-minute chord changes trainer, practice minutes and streak, backup/restore.

Songs and settings are stored on the device (IndexedDB / localStorage). No account.

## Run locally

```
npm install
npm run build
npm run preview      # http://localhost:8788 (serves the app and the /api functions)
npm test
```

`npm run dev` runs Vite with hot reload and proxies `/api` to the preview server, so run both for development.

## Deploy

Cloudflare Pages: build command `npm run build`, output `dist`, root directory `guitar`. The `functions/` folder becomes the `/api/search` and `/api/tab` endpoints.

## Notes

- Ultimate Guitar has no public API. `functions/_lib/ug.ts` reads the JSON embedded in their pages. It's for personal use, is against their terms of service, and will break when they change their site. Pasting a tab always works.
- Spotify no longer gives new apps tempo data, so scroll speed comes from the track length, your sync marks, or the speed buttons.
- Chord shapes come from [chords-db](https://github.com/tombatossals/chords-db) (MIT).
