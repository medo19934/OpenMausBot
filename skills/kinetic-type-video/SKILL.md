---
name: kinetic-type-video
description: "Make vertical Arabic explainer videos (TikTok, Reels, Shorts) in three measured formats: kinetic type on flat colour, a ruled-paper tips format with hand-drawn annotations, and screen footage with word-by-word captions. Writes the script, voices it, renders a finished mp4."
---

# Kinetic type video

A 9:16 Arabic explainer in one creator's house style. Words land on the voice the moment they are said, and props and
mockups move like real objects. No stock footage, no templates, no emoji, no gradients. Every frame should look like a
designer set it by hand.

Everything here was measured frame by frame from six of the creator's edits, so treat the numbers as the style, not
suggestions.

## Pick the format

| Format | Looks like | Use it when | Start from |
|---|---|---|---|
| **Studio** (default) | Cream, royal blue and ink grounds, big kinetic words, whip pushes, floating UI mockups | An opinion, a story or a trend, with no footage | `example.json` |
| **Paper** (`"theme": "paper"`) | Ruled light-grey paper and near-black, numbered tips, hand-drawn circles, crosses and brackets, sparkle, circle-wipe | "3 mistakes in this logo", a critique, steps, before and after | `example-paper.json` |
| **Footage** (`"footage"` + `"captions"`) | The person's own screen or camera recording, captions of 2–3 words with the spoken word lit, banners and logo stickers | A tool demo, a tutorial, news about an app | the footage example below |

The formats mix: a footage video can cut to a paper or studio title card, since scenes with a solid `bg` cover the
footage.

## Files

All in this skill's folder, written `<root>` below. OpenMausBot gives it as the skill's `root`, and Claude Code shows it
as the skill's base directory when the skill loads.

| File | Does |
|---|---|
| `voice.mjs` | Script text → `vo.mp3` + `vo.timestamps.json` in the house voice (ElevenLabs, with word timing). |
| `align.mjs` | Writes the spoken time of every on-screen word into the spec. |
| `render.mjs` | Renders the spec to stills (to review) or to the final mp4 (1080×1920, 30 fps, −14 LUFS). |
| `mockup.mjs` | An HTML file of `data-mockup` elements → one transparent 2× PNG each, in the video's fonts and colours. |
| `mockups-example.html` | Finished mockups to copy from: clocks, laptop, notification, empty truck, load board, route map, rate confirmation, commission sum and comment box. |
| `browser.mjs` | The fonts and Chromium setup shared by the two renderers. |
| `example-paper.json` | The paper format with every new prop, renderable without images or audio. |
| `stage.js` | The animation engine. Every motion is a function of time, so a frame always renders the same. |
| `example.json` | A complete spec using every prop. Copy it to start. |
| `package.json` | Browser and fonts. |

## Steps

1. Make a work folder for the video. Copy `package.json` and `example.json` into it and run `npm install`. If Chromium
   is missing, run `npx playwright install chromium`. ffmpeg must be on the PATH.
2. Write the script (below) to `script.txt`.
3. Voice it (see "The voice" below). Either `node <root>/voice.mjs script.txt --out vo` on the API, or
   `node <root>/voice.mjs --from take.mp3` for a take downloaded from the ElevenLabs website or recorded by the person.
   Both write `vo.mp3` and `vo.stt.json`. Transcription needs `ELEVENLABS_API_KEY`. Without one, transcribe with
   Whisper (`verbose_json` with word timestamps) and pass that file to step 5 instead.
4. Write `spec.json` (below). Put each on-screen line in its own text item and don't give text items times.
5. Sync: `node <root>/align.mjs spec.json vo.stt.json --fallback vo.timestamps.json` (leave out `--fallback` when there
   is no timestamps file). The transcript of the real audio sets the timing, and the speech model's own timings fill in
   loanwords the transcript spells in Latin script. It reports any on-screen word it couldn't place. Write numbers on
   screen as digits, the way the transcript writes them («780 ميل»، «8%»).
6. Review stills before you render: `node <root>/render.mjs spec.json --stills auto --safe`. This writes `stills/sheet.png`
   with two frames per scene and TikTok's UI zones shaded red. Look at the sheet, fix what fails the checklist, and
   repeat.
7. Render: `node <root>/render.mjs spec.json video.mp4`. Use `--range 10:16 --fast` to check a moment's motion quickly.
   `--scale 0.5` gives a half-size draft.
8. Show the person the video. Say what you'd change next.

## The voice

The creator's voice is a real person talking. Use a real person's voice too, and say which source you used:

1. **The house voice: Jumana** (`4uJbyDJGijiDphW2T3vP`, "Jumana – Hijazi Voice – Warm"). This is a professional
   ElevenLabs library voice recorded and licensed by a young Saudi speaker with a soft Hijazi accent. It is the default
   for every voiceover. Two ways to get a take:
   - **From the ElevenLabs website** (works on any plan that can use library voices): paste the script there, choose
     Jumana, model **Eleven v3**, stability 0.5, similarity 0.75, and download the mp3. Then run
     `node <root>/voice.mjs --from take.mp3` to tighten the pauses, add presence and transcribe it.
   - **From the API** (a paid plan; `ELEVENLABS_API_KEY` must be set): `node <root>/voice.mjs script.txt --out vo`.
2. **The person's own recording.** A phone voice memo in a quiet room is enough: `node <root>/voice.mjs --from memo.m4a`.
3. **Another voice**, only if the person names one: `--voice <id>` or `KTV_VOICE_ID`. Never clone anyone's voice without
   their consent, including the creator whose style this is. An instant clone of the person's **own** voice, made from
   their own recording, is fine.

Every voice goes through `voice.mjs`, which writes `vo.mp3`, `vo.stt.json` (a transcript of the final audio, used for
timing) and, for API takes, `vo.timestamps.json`.

**Write the script for a human mouth.** The script controls the rhythm more than any setting:

- Use long flowing phrases and only a few commas. Every «،» and «…» becomes a pause, and a pause every few words sounds
  like a robot.
- Use spoken dialect with the speaker's own asides: «طيب»، «والمضحك إنه…»، «والله»، «خلاص». Write loanwords the way
  they're said (لابتوب، أونلاين، dispatch).
- For Eleven v3, add a few emotion tags where a person would react: `[curious]` on the hook, `[sighs]` on the setback,
  `[excited]` on the win, `[whispers]` before the reveal, `[serious]` on the warning, `[warmly]` on the sign-off. Use 4–6
  a minute; they are acted, never read aloud. Delete them before using Multilingual v2, which would read them.
- Keep it true. No invented personal success story, income claim or testimonial. Expertise comes from specifics (real
  tools, real numbers framed with «تقريباً» or «حوالي», a worked example introduced with «تخيل»), and trust comes from
  saying the hard part out loud.

**Humanize (on by default).** About 30% of the longest pauses stay as breaths (0.3–0.7 s), and the rest close to
0.07–0.2 s at varied lengths, the way an editor cuts. Timings shift to match. The voice also gets warm and present EQ, a
de-esser, gentle compression, early room reflections and a faint room tone. `--pitch` (semitones, default 0) is only
for a synthetic voice that sits too high. `--raw` skips all processing. To process a take again without paying:
`--from take.raw.mp3 --timings take.raw.timestamps.json`.

Speech starts within 0.15 s. There's no intro, no music sting, and no "hi guys".

## Script shape

Six edits measured: 25–87 seconds, 2.2–2.33 spoken words a second, speech starting within 0.36 s.

**Hook (0–3 s), one of four:**

- **Challenge:** «هذا الشعار يحتاج تصحيح. تعرف ليه؟ قبل لا أشرح، وقف الفيديو وحاول تكتشف ثلاث أخطاء». Pair it with a
  countdown.
- **Pain question:** «للحين تسأل نفسك كم سعر خدماتي كمصمم؟»
- **Bold claim:** «إذا هذه مو أفضل أداة نزلت في Illustrator، فأنا ما أعرف شي.»
- **News or trend:** «في نموذج AI جديد بدأ يغير طريقة توليد الصور.» or «ليش صرنا نشوف X كذا؟»

**Body, by format:**

- **Opinion (studio):** a blunt answer («ببساطة، لأن…»), the reason with 2–3 examples, the nuance turn («ونقطة مهمة حابة
  أذكرها…»), a contrast, and a memorable closer.
- **Critique (paper):** numbered faults («أول شي… / ثاني خطأ… / ثلاثة…»), then the turn «طيب، كيف ممكن نفكر بطريقة
  مختلفة؟», then the fix built from the brand's story element by element, then «وبكذا…» stating what changed.
- **Demo (footage):** «تعالوا معي نجربها», the steps in first person («رسمت… نقلت… اخترت… ضغطت»), «وإيش صار؟» before
  the result, then one honest caveat («طبعاً أحب أوضح إنه…»).

**Ending, one of three:**

- **Identity:** name, role, what you post, then «تابعني وشوف الـ bio».
- **Question:** «سؤالي هو: هل…؟», which drives comments.
- **Share:** «ولا تنسى تشارك الفيديو مع صديقك المصمم».

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
- Words lay out right to left one at a time, so an Arabic prefix on an English word («الـ dispatcher») or several English
  words in a row come out reversed. Join them with a non-breaking space (`الـ\u00a0dispatcher`) to keep them together.
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
| `text` (default) | `text` (with `\n` and `*accent*`), `size`, `font: "display"`, `reveal: "soft"\|"pop"`, `select: {from,to,at}`, `strike: {at}`, `kick`, `out`, `leading` | Every line. `strike` sweeps a line through it and dims it ("no, not X"). `kick` (true or a size such as 0.1) punches the camera in as it lands: use it on hero words, at most once a scene |
| `pill` | `text` | A label above a hero line («وهنا نقول») |
| `badge` | `icon`: eye-off, eye, alert, heart, check, star, play | A small cue above a line, with a ring pulse |
| `checklist` | `items: [{text}]`, `size` | Spoken lists, with a tick per row as it's said |
| `cards` | `images: [{src,x,y,rot,w,h,at,bare}]`, `layout: "row"\|"carousel"\|"free"`, `focus: [{at,index}]`, `h`, `w`, `boxH`, `tilt`, `bare` | Mockups. In `carousel` the focused card is in colour and the others go grey |
| `phone` | `src` (a tall screenshot), `w`, `scroll: [{at,to,dur}]`, `spin` | A feed being scrolled |
| `meter` | `fill: [[at, 0..1], …]`, `icon` | A trend dying, a timer, progress |
| `image` | `src`, `w`, `swap: {src, at}` | A logo, recoloured with a swap |
| `cta` | `text`, `click` | A dot grows into a button and a cursor clicks it. Use it once, at the end |
| `gap` | `h` | Breathing room |
| `heading` | `text`, `n`, `size`, `bar` | A numbered tip: a blue number badge, a 1–2 line title and a blue bar drawn under it. One per tip |
| `annotate` | `shape`: ellipse, box, underline, bracket, cross, check, arrow; `target: "#id"`, `area: [x0,y0,x1,y1]`, `side`, `pad`, `x`, `y`, `color`, `out` | A hand-drawn mark that draws itself onto another item and follows it. A red `cross` for "wrong", a blue `ellipse` on the exact fault (`area` is fractions of the target), a `bracket` under the thing being judged, a yellow `arrow` (`side`) for "tap here" |
| `sparkle` | `size`, `color` | The 8-point star before a turn («نفكر بطريقة مختلفة») |
| `countdown` | `from`, `step` | 3-2-1 in a ring, for "pause the video and find them" |

`pill` also takes `"style": "banner"`, a square-cornered title bar, for a footage title such as «تحديث اليستريتور 2026».

Scene fields: `bg`, `enter` (`cut`, `push-right`, `push-left`, `iris`), `exit` (`blur`, `zoom`), `layout:
"center"|"upper"` (upper puts a word above mockups), `top`, `centerY`, `gap`, `drift`, `rules` (ruled paper lines),
`brand: false` (hide the logo), `captions: false` (hide captions over this scene), and `start`/`end` (cues; you rarely
need them).

Spec fields: `theme`, `brand: {src, srcOnDark, w, y}` (the person's own logo, small and top-centre on every scene),
`audio: {voice, music, musicGain, sfx: [{src,at,gain}], autoSfx, lufs}`, `footage`, `captions`, `footer: {text,
scenes: [0,1]}`, `lead`, `cadence`, `fonts`, `palette`, `duration`.

## The paper format

Measured from the creator's critique videos:

| Ground | Hex | Use it for |
|---|---|---|
| `paper` | #ECEDF2, rules #D4D5DA | Tips, the thing being judged, the fix |
| `night` | #1E1F24, accent #7DA5FB | The first fault (a market of look-alikes), the turn («نفكر بطريقة مختلفة») |
| `electric` | #0048E2, accent #F7FF59 | A one-line verdict |

- Set `"theme": "paper"` and put the person's logo in `brand`. Use `rules: true` on the tip scenes, not on the opening
  hook.
- Open by showing the subject large with «هذا الشعار يحتاج تصحيح!», then «3 أخطاء» with a `countdown`.
- Give each fault its own scene: a `heading` (`n`: 1, 2, 3), the subject, then one `annotate` drawn as the voice names the
  fault, using `target` on the subject's card `id`.
- The turn is an `iris` into `night` with a `sparkle`. The fix builds element by element (a 2×2 grid of line icons
  with labels works well as a mockup), ending on before and after: «قبل», the old card, an `arrow` with `side:
  "bottom"`, «بعد», and the new card.
- End on the course or product card and a blue `cta`.

## The footage format

The person's own recordings carry the picture: their screen, their iPad, their desk. The engine cuts the clips
together, crops each to 9:16 with a slow push-in, grades it lightly, and lays the captions and props on top.

```json
"footage": { "clips": [ { "src": "screen.mov", "from": 2.5, "to": 11 }, { "src": "ipad.mp4", "from": 0, "to": 6, "zoom": [1.08, 1] } ] },
"captions": { "transcript": "vo.stt.json", "words": 3, "highlight": "active", "color": "#F7FF59", "y": 0.7 },
"scenes": [ { "bg": "clear", "layout": "upper", "top": 0.3, "items": [
  { "type": "pill", "style": "banner", "text": "تحديث اليستريتور 2026", "at": 0.3, "out": 3.4 } ] } ]
```

- Cut the footage on the voice: one clip per step, 2–6 s each, with the action (the click, the result) landing on the
  word that names it.
- Captions break at 2–3 words, at pauses longer than 0.45 s, and at punctuation. `highlight: "active"` lights each word
  as it is spoken. `"keyword"` with `"keywords": [...]` lights only the words that matter. Use yellow `#F7FF59` on busy
  footage and blue `#3B5BFF` on light footage, and keep them at 0.68–0.74 height.
- Use `clear` scenes (transparent) to add a banner, a logo sticker (a `bare` card of the app's logo the person supplies,
  shown when the voice names it), an `annotate` arrow on the button being clicked, or a `cards` screenshot.
- A solid scene (`paper`, `cream`…) between clips works as a title card; set `captions: false` on it if the title already
  says the words.

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
- [ ] Every `annotate` sits on its target in the stills, not beside it.
- [ ] In footage videos, captions never cover the thing being clicked; move them with `y` if they do.
- [ ] Say which voice source you used, and offer the better one if it wasn't the person's own recording.
- [ ] Check the file with `ffprobe`: 1080×1920, 30 fps, H.264 and AAC.
