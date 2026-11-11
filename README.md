# Cat Sense

**English** | [Русский](README.ru.md)

A web app for your phone. Point the camera and see the world through a cat's eyes. Tap an object or a person, and a ginger cat tells you what it sees and what it wants.

**[cat-sense.vercel.app](https://cat-sense.vercel.app/)**: open it on your phone, nothing to install.

<p align="center">
  <img src="docs/screenshots/start.png" width="220" alt="Start screen: the cat asks to turn on the camera">
  <img src="docs/screenshots/object.webp" width="220" alt="Tapping a mug: the cat says it's a mug with a flying pig and asks for water">
  <img src="docs/screenshots/grudge.webp" width="220" alt="Grudge: an angry cat sits on a person's head">
</p>

Built in 3 days at the "Arena of Heroes" hackathon by team **BugBusters** (2 people). The hackathon theme was "Feel". Out of the three suggested ideas we took two: "the world through a cat's eyes" and "a noise canceller for one specific person".

> The app's UI and the cat's lines are in Russian.

## Features

### Cat vision

Cats see fewer colors: red and green blend together, and the picture is softer. The filter runs on live video, and the "Cat/Human" toggle shows the difference.

<p align="center">
  <img src="docs/screenshots/cat-vision.png" width="260" alt="A bookshelf in cat vision mode: muted colors, blurred image">
  <img src="docs/screenshots/human-vision.webp" width="260" alt="The same shelf in human mode">
</p>

It's based on a deuteranopia matrix (Machado, 2009), plus saturation, blur and a vignette. It's rendered with a WebGL shader because Safari on iPhone ignores SVG filters on `<video>`. Without WebGL a fallback CSS filter kicks in. This is an approximation: there's no exact scientific model of cat vision.

### The cat comments on objects

Tap any object: a crop of the frame around your finger goes to Gemini, and the cat answers in its own words. Every line is written by the model. If the model isn't sure what it sees, the cat asks or guesses. While the model is thinking, the cat shows that it's pondering. If no answer arrives within 9.5 seconds, the cat says a fallback line from `phrases.json`, and the app keeps going.

### The cat reacts to emotions

Tap a face: the emotion (happy, surprised, angry, neutral) is detected by MediaPipe Face Landmarker right on the phone. Only the name of the emotion goes to the server, never the face itself.

### Grudge

This is our take on the "noise canceller". Hold your finger on a person and the cat takes offense: it sits on their head as an angry cat and stops being friends. The cat remembers the offender for 2 minutes, even if they leave the frame, and recognizes them by hair and clothing colors and face proportions. Everything is computed on the phone, nothing is stored or sent. Hold again to make peace.

### Hero mask

An Easter egg for the booth. When the cat spots the hackathon organizer's logo on a T-shirt, it puts on a mask and answers like a superhero for a few lines.

### Save a frame

A frame with the cat and its line is composed on a canvas and opened in the system "Share" menu. The photo never goes online.

## Privacy

The camera looks at people at the booth, so we designed for this from the start:

- Faces, people and emotions are recognized on the phone (TensorFlow.js + COCO-SSD, MediaPipe). The video stream never goes to the server.
- The server only receives a crop of the frame when you tap an object. All faces in it are painted over before sending. For the T-shirt logo, a crop of the clothing is sent, and only if it passed the local filter; faces in it are painted over too.
- A body without a face is treated as a person, and then no image is sent at all. Figurines are told apart by detector confidence.
- The production chain: phone → Vercel function → ProxyAPI (third-party proxy) → Gemini.
- The API key lives only in Vercel environment variables. The function limits request size and rate.

## How it works

```
Phone (browser)                                Vercel (serverless)
  camera + WebGL filter
  COCO-SSD: people
  Face Landmarker: faces and emotions
  tap
    |-- cat is "thinking"
    `-- POST /api/ask  ------------------------>  input validation, limits
                                                    |
                                                  Gemini (image + cat prompt)
                                                    |
        cat's line and mood  <-------------------- { text, mood, sure }
        (error or timeout: line from phrases.json)
```

| Part | Technology |
|---|---|
| Frontend | plain JavaScript (ES modules), no framework or build step |
| Cat vision | WebGL shader over `<video>` |
| People | TensorFlow.js + COCO-SSD |
| Faces and emotions | MediaPipe Face Landmarker, blendshapes and rules |
| Objects and lines | Gemini via `/api/ask` |
| Backend | Node.js serverless functions |
| Hosting | Vercel: static files from `public/`, functions from `api/` |
| Tests | `node --test`, 310 tests for logic and API |

Logic without DOM or camera lives in [`public/js/logic/`](public/js/logic/) and is covered by tests: tap target selection, emotions from blendshapes, tracking and recognizing the offender, the logo filter, timeouts and fallback lines. Camera, animation and sound were tested by hand on an iPhone.

More details (in Russian): [architecture and API contract](.memory-bank/architecture.md), [decisions](.memory-bank/decisions.md).

## How we worked

We wrote the code together with [Claude Code](https://claude.com/claude-code), one of us on Windows, the other on Linux. The process is based on a lightweight version of [labs-harness](https://github.com/ayusavin/labs-harness):

- **Memory Bank** ([`.memory-bank/`](.memory-bank/)): project facts and decisions. Agents read it before any task.
- **Cycle** `/plan` → `/build` → `/debug` → `/review`: a plan with acceptance criteria, implementation by the agent that owns the files, debugging that starts from a reproduction, review before deploy. Plans and reports are in [`swarm-report/`](swarm-report/).
- **Test gate**: a Stop hook doesn't let an agent say "done" if logic changed and tests weren't run.

Rules for agents (in Russian): [AGENTS.md](AGENTS.md).

## Running locally

You need Node.js 22 or newer. There are no dependencies.

```bash
npm run dev
```

The site opens at `http://localhost:5173/` together with `/api/ask` and `/api/ping`. Put the Gemini key in `.env` as `GEMINI_API_KEY` (see `.env.example`). Without a key the cat says fallback lines. The camera works on `localhost`; from another device over Wi-Fi you need HTTPS.

```bash
npm test
```

Deploy: `npx vercel deploy`. On iPhone it's best opened from the Home Screen (Safari → Share → Add to Home Screen) so there's no browser UI. Deploy check: `/check.html`.

## License

Code, cat, sounds and project name: © BugBusters, all rights reserved. You may view and study it, but you may not use or distribute it without the authors' permission.

Files in `.claude/` are based on [labs-harness](https://github.com/ayusavin/labs-harness), MIT, license text in [.claude/HARNESS-LICENSE](.claude/HARNESS-LICENSE).
