// How long the cat keeps the hero mask after Gemini recognised the logo. No DOM and no timers
// here: main.js feeds the events and a clock, so the rule is covered by tests.

// The mask stays for this many further answers, or this long, whichever ends first.
export const HERO_TAPS = 3;
export const HERO_MS = 30000;

export const HERO_OFF = Object.freeze({ on: false, tapsLeft: 0, until: 0 });

export function isMasked(state, now) {
  return state.on && now < state.until;
}

// Events: { type: 'hero', now } for a reply with the logo, { type: 'tap', now } for any other
// finished answer, { type: 'tick', now } from the timer. A tap is counted when its answer
// comes, not when the finger lands, so all HERO_TAPS answers are said in the mask and a hero
// answer to one of them puts it straight back on instead of blinking off and on.
export function heroStep(state, event) {
  if (event.type === 'hero') return { on: true, tapsLeft: HERO_TAPS, until: event.now + HERO_MS };
  if (!isMasked(state, event.now)) return HERO_OFF;
  if (event.type === 'tap') return state.tapsLeft <= 1 ? HERO_OFF : { ...state, tapsLeft: state.tapsLeft - 1 };
  return state;
}
