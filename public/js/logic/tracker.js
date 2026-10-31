// Keeps the same id on a box from one detection cycle to the next. It knows nothing about who
// is in the box: telling the offender from the rest is the job of grudges.js, by appearance.

function iou([ax, ay, aw, ah], [bx, by, bw, bh]) {
  const w = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const h = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (aw * ah + bw * bh - inter);
}

// Measured in sizes of the old box, so a far face moving a little and a close face moving a
// lot count the same.
function centerShift([ax, ay, aw, ah], [bx, by, bw, bh]) {
  const size = Math.max(aw, ah, 1);
  return Math.hypot(bx + bw / 2 - (ax + aw / 2), by + bh / 2 - (ay + ah / 2)) / size;
}

export function createTracker({ prefix = 't', maxMissed = 8, minIou = 0.2, maxCenterShift = 0.6 } = {}) {
  let tracks = [];
  let nextId = 1;

  // A box last seen cycles ago says little about where that face is now, so a lost track only
  // takes a box that overlaps its old place, never one that merely appeared nearby.
  function candidates(bboxes, pool) {
    const pairs = [];
    for (const t of pool) {
      bboxes.forEach((bbox, b) => {
        const overlap = iou(tracks[t].bbox, bbox);
        const shift = centerShift(tracks[t].bbox, bbox);
        const near = tracks[t].missed === 0 ? overlap >= minIou || shift <= maxCenterShift : overlap >= minIou;
        if (near) pairs.push({ t, b, overlap, shift });
      });
    }
    return pairs.sort((x, y) => y.overlap - x.overlap || x.shift - y.shift);
  }

  // Greedy best-first: each box and each track is used at most once. Tracks seen in the last
  // cycle choose first: a face still in view keeps its own id even when it slides over the
  // place where someone else was last seen.
  function update(bboxes) {
    const ids = new Array(bboxes.length).fill(null);
    const usedTracks = new Set();
    const indexes = tracks.map((_, t) => t);
    const fresh = indexes.filter((t) => tracks[t].missed === 0);
    const lost = indexes.filter((t) => tracks[t].missed > 0);
    for (const pool of [fresh, lost]) {
      for (const { t, b } of candidates(bboxes, pool)) {
        if (usedTracks.has(t) || ids[b] !== null) continue;
        usedTracks.add(t);
        ids[b] = tracks[t].id;
        // gap: how many cycles the face was missing before this one, 0 when it never left.
        tracks[t] = { ...tracks[t], bbox: bboxes[b], gap: tracks[t].missed, missed: 0 };
      }
    }
    tracks = tracks
      .map((track, t) => (usedTracks.has(t) ? track : { ...track, missed: track.missed + 1 }))
      .filter((track) => track.missed <= maxMissed);
    bboxes.forEach((bbox, b) => {
      if (ids[b] !== null) return;
      ids[b] = `${prefix}${nextId++}`;
      tracks.push({ id: ids[b], bbox, missed: 0, gap: 0 });
    });
    return ids;
  }

  function reset() {
    tracks = [];
  }

  return { update, reset, tracks: () => tracks.map((track) => ({ ...track })) };
}
