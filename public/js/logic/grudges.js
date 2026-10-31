import { colorSimilarity, geometryDifference, mixColor, mixGeometry } from './appearance.js';

// Who the cat is offended at. The tracker only keeps ids by position, so a turn of the camera
// can hand an offender's id to someone else: every cycle the face on that id is checked
// against how the offender looks. An offender out of sight is remembered for a while and
// recognised on return; nothing outlives the page, nothing leaves the phone.

// Starting values, not measured on people yet: dev mode shows the scores to tune them.
export const GRUDGE_TUNING = Object.freeze({
  // Colour score of the same face from one cycle to the next; below it the id shows someone else.
  keepColor: 0.5,
  // A face coming back must match better: a mistake here puts the mark on the wrong person.
  reidColor: 0.62,
  // Proportions this far apart are another face, whatever the colours say.
  geometryVeto: 0.09,
  geometryMatch: 0.07,
  // Past these the face is plainly someone else: no second look.
  clearColor: 0.35,
  clearGeometry: 0.13,
  // Cycles in a row a returning face must match, and by how much better than anyone else.
  reidCycles: 3,
  margin: 0.08,
  // A dropout this short (in cycles) is bridged: the mark stays where the face was.
  shortGap: 2,
  memoryMs: 120_000,
  maxOffenders: 3,
  // Share of the new frame in the running look of an offender and of every visible face.
  learn: 0.2,
  trackLearn: 0.35,
  forgetLookCycles: 12,
});

export function createGrudges(tuning = {}) {
  const t = { ...GRUDGE_TUNING, ...tuning };
  let offenders = [];
  let nextId = 1;
  let cycle = 0;
  const looks = new Map();

  function isAway(offender) {
    return offender.track === null || offender.missing > t.shortGap;
  }

  // strict: after a gap or for a face coming back, when the id itself proves nothing.
  function judge(offender, look, strict) {
    const color = colorSimilarity(offender.color, look.color);
    const geometry = geometryDifference(offender.geometry, look.geometry);
    const minColor = strict ? t.reidColor : t.keepColor;
    const maxGeometry = strict ? t.geometryMatch : t.geometryVeto;
    const clear = (color !== null && color < t.clearColor) || (geometry !== null && geometry > t.clearGeometry);
    const same =
      !(color !== null && color < minColor) &&
      !(geometry !== null && geometry > maxGeometry) &&
      !(strict && color === null);
    return { same, clear, color, geometry };
  }

  // The chest must be on both: hair alone is too common to recognise anyone by.
  function recognizes(offender, look) {
    const color = colorSimilarity(offender.color, look.color, ['body']);
    const geometry = geometryDifference(offender.geometry, look.geometry);
    return { color, geometry, fits: color !== null && color >= t.reidColor && (geometry === null || geometry <= t.geometryMatch) };
  }

  function confirm(offender, track, now) {
    offender.track = track;
    offender.missing = 0;
    offender.low = 0;
    offender.confirmed = true;
    offender.seenAt = now;
    offender.candidate = null;
  }

  function release(offender) {
    offender.track = null;
    offender.low = 0;
    offender.confirmed = false;
    offender.candidate = null;
  }

  function backEvent(offender, track, now) {
    return { type: 'back', track, awayMs: now - offender.seenAt };
  }

  // face: { track, color, geometry } of the face the finger is on. A hold on someone the cat
  // already remembers renews that grudge instead of adding a twin; the look is taken afresh,
  // since the hold says exactly who is meant.
  function start({ track, color, geometry }, now) {
    const known =
      offenders.find((offender) => offender.track === track) ??
      offenders.find((offender) => isAway(offender) && recognizes(offender, { color, geometry }).fits);
    if (known) {
      for (const other of offenders) if (other !== known && other.track === track) release(other);
      known.color = color ?? known.color;
      known.geometry = geometry ?? known.geometry;
      confirm(known, track, now);
      return known.id;
    }
    if (offenders.length >= t.maxOffenders) offenders.shift();
    const offender = { id: nextId++, color, geometry, track: null, missing: 0, low: 0, confirmed: false, seenAt: now, candidate: null };
    confirm(offender, track, now);
    offenders.push(offender);
    return offender.id;
  }

  // Peace is made with someone in view only; returns whether there was a grudge to drop.
  function forgive(track) {
    const before = offenders.length;
    offenders = offenders.filter((offender) => offender.track !== track || isAway(offender));
    return offenders.length < before;
  }

  function isOffender(track) {
    return offenders.some((offender) => offender.track === track && offender.confirmed);
  }

  // faces: this cycle's { track, gap, color, geometry }, gap from the tracker. Returns events:
  // { type: 'back', track, awayMs } when an offender is recognised after being out of sight.
  function update(faces, now) {
    cycle += 1;
    const events = [];
    // A running look per visible face: a returning face is judged on a few frames, not one.
    for (const face of faces) {
      const previous = looks.get(face.track);
      const fresh = !previous || face.gap > t.shortGap;
      looks.set(face.track, {
        color: fresh ? face.color : mixColor(previous.color, face.color, t.trackLearn),
        geometry: fresh ? face.geometry : mixGeometry(previous.geometry, face.geometry, t.trackLearn),
        cycle,
      });
    }
    for (const [track, look] of looks) if (cycle - look.cycle > t.forgetLookCycles) looks.delete(track);
    const byTrack = new Map(faces.map((face) => [face.track, face]));

    for (const offender of offenders) {
      if (offender.track === null) continue;
      const face = byTrack.get(offender.track);
      if (!face) {
        offender.missing += 1;
        if (offender.missing > t.shortGap) offender.confirmed = false;
        continue;
      }
      const away = isAway(offender);
      const strict = away || face.gap > t.shortGap;
      const verdict = judge(offender, face, strict);
      if (verdict.same) {
        if (away) events.push(backEvent(offender, face.track, now));
        const sure = (verdict.color === null || verdict.color >= t.reidColor) && (verdict.geometry === null || verdict.geometry <= t.geometryMatch);
        if (!strict && sure) {
          offender.color = mixColor(offender.color, face.color, t.learn);
          offender.geometry = mixGeometry(offender.geometry, face.geometry, t.learn);
        }
        confirm(offender, face.track, now);
      } else if (verdict.clear || strict || offender.low > 0) {
        release(offender);
      } else {
        // One doubtful frame hides the mark; a second one in a row lets the id go.
        offender.low += 1;
        offender.missing = 0;
        offender.confirmed = false;
      }
    }

    offenders = offenders.filter((offender) => now - offender.seenAt <= t.memoryMs);

    const held = new Set(offenders.filter((offender) => !isAway(offender)).map((offender) => offender.track));
    for (const offender of offenders) {
      if (!isAway(offender)) continue;
      const [best, second] = faces
        .filter((face) => !held.has(face.track))
        .map((face) => ({ track: face.track, ...recognizes(offender, looks.get(face.track)) }))
        .filter((score) => score.color !== null)
        .sort((a, b) => b.color - a.color);
      // Two faces that both look like the offender: better to forget than to guess.
      if (!best?.fits || (second && best.color - second.color < t.margin)) {
        offender.candidate = null;
        continue;
      }
      const streak = offender.candidate?.track === best.track ? offender.candidate.streak + 1 : 1;
      if (streak < t.reidCycles) {
        offender.candidate = { track: best.track, streak };
        continue;
      }
      for (const other of offenders) if (other !== offender && other.track === best.track) release(other);
      events.push(backEvent(offender, best.track, now));
      confirm(offender, best.track, now);
      held.add(best.track);
    }
    return events;
  }

  // The tracker starts over (a rotation, the page in the background): its ids mean nothing
  // now, but how the offenders look is still remembered.
  function detach() {
    for (const offender of offenders) release(offender);
    looks.clear();
  }

  // For the developer mode: how much a visible face looks like the closest offender.
  function likeness(track) {
    const look = looks.get(track);
    if (!look) return null;
    let best = null;
    for (const offender of offenders) {
      const color = colorSimilarity(offender.color, look.color);
      if (color !== null && (!best || color > best.color)) {
        best = { color, geometry: geometryDifference(offender.geometry, look.geometry) };
      }
    }
    return best;
  }

  return {
    start,
    forgive,
    update,
    isOffender,
    detach,
    likeness,
    active: () => offenders.length > 0,
    count: () => offenders.length,
  };
}
