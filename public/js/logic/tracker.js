// Keeps the same id on a box from one detection cycle to the next. It knows nothing about who
// is in the box: two people crossing paths may swap ids, which is accepted for the grudge.

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

  function candidates(bboxes) {
    const pairs = [];
    tracks.forEach((track, t) => {
      bboxes.forEach((bbox, b) => {
        const overlap = iou(track.bbox, bbox);
        const shift = centerShift(track.bbox, bbox);
        if (overlap >= minIou || shift <= maxCenterShift) pairs.push({ t, b, overlap, shift });
      });
    });
    return pairs.sort((x, y) => y.overlap - x.overlap || x.shift - y.shift);
  }

  // Greedy best-first: each box and each track is used at most once.
  function update(bboxes) {
    const ids = new Array(bboxes.length).fill(null);
    const usedTracks = new Set();
    for (const { t, b } of candidates(bboxes)) {
      if (usedTracks.has(t) || ids[b] !== null) continue;
      usedTracks.add(t);
      ids[b] = tracks[t].id;
      tracks[t] = { ...tracks[t], bbox: bboxes[b], missed: 0 };
    }
    tracks = tracks
      .map((track, t) => (usedTracks.has(t) ? track : { ...track, missed: track.missed + 1 }))
      .filter((track) => track.missed <= maxMissed);
    bboxes.forEach((bbox, b) => {
      if (ids[b] !== null) return;
      ids[b] = `${prefix}${nextId++}`;
      tracks.push({ id: ids[b], bbox, missed: 0, grudged: false });
    });
    return ids;
  }

  function mark(id) {
    tracks = tracks.map((track) => (track.id === id ? { ...track, grudged: true } : track));
  }

  function isGrudged(id) {
    return tracks.some((track) => track.id === id && track.grudged);
  }

  function reset() {
    tracks = [];
  }

  return { update, mark, isGrudged, reset, tracks: () => tracks.map((track) => ({ ...track })) };
}
