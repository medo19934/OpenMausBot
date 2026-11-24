---
name: kinetic-type-video
description: "Make vertical kinetic-typography videos (TikTok, Reels, Shorts) in a measured Arabic explainer style: words land on the voiceover, three flat grounds, blur-in reveals, whip pushes, floating mockups, UI props. Writes the script, voices it, renders a finished mp4."
---

# Kinetic type video

A 9:16 talking-text video. Words land on the voice the moment they are said, over flat colour, with a few props and
mockups that move like real objects. No stock footage, no templates, no emoji, no gradients. Every frame should look
like a designer set it by hand.

Everything here was measured from a reference edit frame by frame, so treat the numbers as the style, not suggestions.

## Files

All in the folder named by this skill's `root`:

| File | Does |
|---|---|
| `voice.mjs` | Script text → `vo.mp3` + `vo.timestamps.json` in the house voice (ElevenLabs, with word timing). |
| `align.mjs` | Writes the spoken time of every on-screen word into the spec. |
| `render.mjs` | Renders the spec to stills (to review) or to the final mp4 (1080×1920, 30 fps, −14 LUFS). |
| `mockup.mjs` | An HTML file of `data-mockup` elements → one transparent 2× PNG each, in the video's fonts and colours. |
| `mockups-example.html` | Six finished mockups (clocks, laptop, notification, load board, route map, comment box) to copy from. |
| `browser.mjs` | The fonts and Chromium setup shared by the two renderers. |
| `stage.js` | The animation engine. Every motion is a function of time, so a frame always renders the same. |
| `example.json` | A complete spec using every prop. Copy it to start. |
| `package.json` | Browser and fonts. |

## Steps

1. Make a work folder for the video. Copy `package.json` and `example.json` into it and run `npm install`. If Chromium
   is missing, run `npx playwright install chromium`. ffmpeg must be on the PATH.
2. Write the script (below) to `script.txt`.
3. Voice it: `node <root>/voice.mjs script.txt --out vo`. This needs `ELEVENLABS_API_KEY`. If the person recorded their own
   voice, transcribe it with word timestamps instead (ElevenLabs speech-to-text or Whisper `verbose_json`). Either file
   works in step 5.
4. Write `spec.json` (below). Put each on-screen line in its own text item and don't give text items times.
5. Sync: `node <root>/align.mjs spec.json vo.timestamps.json`. It reports any on-screen word it didn't hear in the voice. Fix
   the spelling to match what is said, or accept the guessed time.
6. Review stills before you render: `node <root>/render.mjs spec.json --stills auto --safe`. This writes `stills/sheet.png`
   with two frames per scene and TikTok's UI zones shaded red. Look at the sheet, fix what fails the checklist, and
   repeat.
7. Render: `node <root>/render.mjs spec.json video.mp4`. Use `--range 10:16 --fast` to check a moment's motion quickly.
   `--scale 0.5` gives a half-size draft.
8. Show the person the video. Say what you'd change next.

## The voice

The house voice is `mUrAdOukT8TtEOpp0uKv`: a young Saudi woman in Hijazi dialect, warm, bright and conversational. It is
a voice designed on the owner's ElevenLabs account, so it works only with that account's key. Use it for every voiceover
unless the person names another; `--voice <id>` or `KTV_VOICE_ID` change it.

- Model `eleven_v3`. Raise `--stability 0.65` if a take wobbles, and use `--speed 1.05` for a brisker read.
- Write the script in spoken dialect, not formal Arabic: «ليش صرنا نشوف…», «مو كل…», «حابة أذكرها». Leave loanwords in
  Latin script the way people say them (trend, brand, scroll, bio).
- Punctuation drives delivery. Use «؟» for a lift, «،» for a breath and «.» for a full stop. The reference averages 2.0
  spoken words a second, with a 0.6–0.7 s pause between ideas. Don't cram.
- Speech starts within 0.15 s. There's no intro, no music sting, and no "hi guys".

## Script shape

60–75 seconds, about 130–150 spoken words:

1. **Hook question** (0–3 s), naming what the viewer keeps seeing: «ليش صرنا نشوف X كذا؟».
2. **Answer in one blunt line**, with the audience as the subject: «ببساطة، لأن جيل زد ما ينبهر بـ…».
3. **The reason**, with 2–3 concrete examples. These become the checklist and the mockups.
4. **The nuance turn**: «ونقطة مهمة حابة أذكرها…», where you correct the obvious takeaway.
5. **A contrast**: what fails vs what works, said once each.
6. **A memorable closer**: «الناس ما تنسى براند خلاها تحس بشي».
7. **Sign-off**: name, role, what you post, then «تابعني وشوف البايو».

## What goes on screen

The screen shows a condensed version of the voice, never a transcript: about 40% of the spoken words. Cut the fillers and
keep the words that carry meaning, spelled the way they're spoken.

- 1–6 words per line and at most 3 lines on screen. A new idea replaces the screen; it doesn't add to it.
- Each scene gets one accent word (`*word*`), the word the sentence hinges on. Never two.
- Size tells you the weight:
  - `s` 46 for a setup phrase above a big word.
  - `m` 66 for normal lines.
  - `l` 96 for a line standing alone.
  - `xl` 140 or `xxl` 190 for the hero word, in the `display` font.
- A small setup word sits above a huge hero word («لان» then «جيل زد»). This is the signature layout; use it 2–3 times
  per video.
- Words land about 0.1 s before they're spoken, and a line fills in at most 0.13 s a word (`cadence: "eager"`), so the eye
  is never behind the ear. Use `cadence: "spoken"` only for a slow, dramatic line.

## Grounds and rhythm

| Ground | Hex | Text | Use it for |
|---|---|---|---|
| `cream` | #F2E9E0 | ink, accent blue | The default: examples, mockups, the sign-off |
| `ink` | #111111 | white, accent #576DF5 | The blunt answer, the problem, anything that fades |
| `blue` | #253493 | white, accent #AFC0FF, pill #384CD8 | Thesis lines, «وهنا نقول», the closer |

- Change the scene every 1.5–4 s and on the idea, never mid-phrase. Never put the same ground on both sides of a push.
  A cut between two scenes on the same ground is a "replace", and it's fine.
- `enter: "push-right"`, or `"push-left"` for the next beat in a list. Use 3–5 pushes a minute. The rest are cuts. Pushes
  get an automatic whoosh.
- End a scene with `exit: "blur"` when its idea is about forgetting or fading, and `exit: "zoom"` to punch into a
  mockup. Use a `select` highlight on the last line to "grab" a phrase before a hard cut.
- The camera drifts in about 3.5% over each scene. Keep it.
- The series label (`footer`) sits small at 79% height on the opening scenes only, then goes.

## Props

Each item is an object in a scene's `items`; they stack top to bottom. `at` is a time in seconds or a cue:

- `"#id"` (ids are letters, digits and `_`) is that item's start, `"#id.3"` its fourth word (or a checklist's fourth row), `"#id.end"` its end.
- Add an offset with `"#id.2+0.15"`.

Text items get their times from `align.mjs`. Time everything else from cues, so it moves with the voice.

| `type` | Fields | Use |
|---|---|---|
| `text` (default) | `text` (with `\n` and `*accent*`), `size`, `font: "display"`, `reveal: "soft"\|"pop"`, `select: {from,to,at}`, `out`, `leading` | Every line |
| `pill` | `text` | A label above a hero line («وهنا نقول») |
| `badge` | `icon`: eye-off, eye, alert, heart, check, star, play | A small cue above a line, with a ring pulse |
| `checklist` | `items: [{text}]`, `size` | Spoken lists, with a tick per row as it's said |
| `cards` | `images: [{src,x,y,rot,w,h,at,bare}]`, `layout: "row"\|"carousel"\|"free"`, `focus: [{at,index}]`, `h`, `w`, `boxH`, `tilt`, `bare` | Mockups. In `carousel` the focused card is in colour and the others go grey |
| `phone` | `src` (a tall screenshot), `w`, `scroll: [{at,to,dur}]`, `spin` | A feed being scrolled |
| `meter` | `fill: [[at, 0..1], …]`, `icon` | A trend dying, a timer, progress |
| `image` | `src`, `w`, `swap: {src, at}` | A logo, recoloured with a swap |
| `cta` | `text`, `click` | A dot grows into a button and a cursor clicks it. Use it once, at the end |
| `gap` | `h` | Breathing room |

Scene fields: `bg`, `enter`, `exit`, `layout: "center"|"upper"` (upper puts a word above mockups), `top`, `centerY`,
`gap`, `drift`, `start`/`end` (cues; you rarely need them).

Spec fields: `audio: {voice, music, musicGain, sfx: [{src,at,gain}], autoSfx, lufs}`, `footer: {text, scenes: [0,1]}`,
`lead`, `cadence`, `fonts`, `palette`, `duration`.

## Mockups

Use the person's real work or images whenever they have them, and never invent brand work and pass it off as theirs.
Without them, design honest interface mockups of what the voice is describing. Use AI images only when the person asks
for them.

1. Pick one mockup per idea the voice names: a place and time → clocks, "online" → a laptop on a search, a result →
   a notification, the job itself → its real tool (a load board, an editor, a dashboard), "someone guides you" → a route,
   "comment X" → a comment box with X typed in it. Use 4–6 per minute, never two in a row.
2. Write them in one HTML file, one `data-mockup="name"` element each, and copy patterns from `mockups-example.html`. Use
   the tokens it gets for free: `var(--cream)`, `--blue`, `--ink`, `--periwinkle`, `--pill`, `--text`, `--display`.
   - White cards with a 34px radius, one accent per mockup, and tabular numbers.
   - Keep the interface in the language the real tool uses: English for a US load board, Arabic for anything the viewer
     types.
3. Every figure must be plausible: real distances, real time zones, normal market rates. Use `example.com` for addresses,
   and never use a real company's name or logo.
4. Run `node <root>/mockup.mjs mockups.html img` to get `img/<name>.png` and its size.
5. Place each one under the line that names it, as a single-card `row` with `"bare": true` (it keeps its own corners and
   gets a soft drop shadow). Scale `w` and `h` together, keep the card 520–660 wide, and give it a 1–3° `rot` or a small
   `tilt`. Start it at the cue of the word that names it, `"#line.end"` or `"#line.2"`.

```json
{ "type": "cards", "layout": "row", "bare": true, "at": "#disp.end", "w": 560, "h": 427, "boxH": 467,
  "images": [ { "src": "img/board.png", "rot": -2 } ] }
```

## Sound

The voice carries the video. If there's music, it sits at −24 dB and ducks under the voice; with none, leave silence
rather than add generic music. Automatic effects are a soft whoosh on pushes and zooms, a tick on pills and badges and a
click on the button. Turn them off with `"autoSfx": false`. The mix is normalised to −14 LUFS with peaks at −1.5 dBTP.

## Checklist before you call it done

- [ ] No text in the red zones of `--safe`: the bottom 20%, and the right edge from 35% to 80% height.
- [ ] Each scene shows one idea and has no more than one accent word.
- [ ] No word appears after it's spoken. Scrub `--range` across the three busiest seconds.
- [ ] Arabic letters join, and nothing renders in a fallback font. The render stops if a font fails to load.
- [ ] A ground change at least every 4 s, and no push between two scenes on the same ground.
- [ ] The video ends on the CTA held at least 1.5 s after the click.
- [ ] Check the file with `ffprobe`: 1080×1920, 30 fps, H.264 and AAC.
