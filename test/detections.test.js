import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bodyDetections, faceBox, faceDetections, privacyMasks } from '../public/js/logic/detections.js';

const frame = { width: 1000, height: 500 };
const smile = [
  { categoryName: 'mouthSmileLeft', score: 0.9 },
  { categoryName: 'mouthSmileRight', score: 0.9 },
];
const frown = [
  { categoryName: 'browDownLeft', score: 0.9 },
  { categoryName: 'browDownRight', score: 0.9 },
];

function assertBox(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 1e-9, `${actual} is not close to ${expected}`);
  });
}

test('bodyDetections keeps only people from COCO results', () => {
  const results = [
    { bbox: [1, 2, 3, 4], class: 'cup', score: 0.8 },
    { bbox: [5, 6, 7, 8], class: 'person', score: 0.9 },
  ];
  assert.deepEqual(bodyDetections(results), [{ kind: 'object', label: 'person', bbox: [5, 6, 7, 8] }]);
});

test('faceBox wraps the landmarks in frame pixels', () => {
  const landmarks = [{ x: 0.2, y: 0.4 }, { x: 0.5, y: 0.2 }, { x: 0.3, y: 0.8 }];
  assertBox(faceBox(landmarks, frame), [200, 100, 300, 300]);
});

test('faceBox clamps points outside the frame', () => {
  const landmarks = [{ x: -0.5, y: 0.5 }, { x: 0.5, y: 1.4 }];
  assertBox(faceBox(landmarks, frame), [0, 250, 500, 250]);
});

test('faceDetections links blendshapes to the face by index', () => {
  const result = {
    faceLandmarks: [
      [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }],
      [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }],
    ],
    faceBlendshapes: [{ categories: smile }, { categories: frown }],
  };
  const [first, second] = faceDetections(result, frame);
  assert.equal(first.kind, 'person');
  assert.equal(first.emotion, 'happy');
  assertBox(first.bbox, [0, 0, 100, 50]);
  assert.equal(second.emotion, 'angry');
  assertBox(second.bbox, [500, 250, 100, 50]);
});

test('face without blendshapes stays neutral and keeps its box', () => {
  const result = { faceLandmarks: [[{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }]], faceBlendshapes: [] };
  const [face] = faceDetections(result, frame);
  assert.equal(face.emotion, 'neutral');
  assertBox(face.bbox, [0, 0, 100, 50]);
});

test('no faces gives an empty list', () => {
  assert.deepEqual(faceDetections({ faceLandmarks: [], faceBlendshapes: [] }, frame), []);
});

test('privacyMasks expands each face by 30% on every side', () => {
  const masks = privacyMasks([{ kind: 'person', emotion: 'happy', bbox: [100, 200, 100, 50] }]);
  assert.equal(masks.length, 1);
  assertBox(masks[0], [70, 185, 160, 80]);
});

test('person without a face gets the top 35% of the box as a head', () => {
  const masks = privacyMasks([{ kind: 'object', label: 'person', bbox: [100, 100, 200, 400] }]);
  assert.equal(masks.length, 1);
  assertBox(masks[0], [100, 100, 200, 140]);
});

test('person with a face gets no head mask', () => {
  const body = { kind: 'object', label: 'person', bbox: [100, 100, 200, 400] };
  const face = { kind: 'person', emotion: 'neutral', bbox: [150, 120, 100, 100] };
  assert.equal(privacyMasks([body, face]).length, 1);
});

test('a face of someone else does not cancel the head mask', () => {
  const body = { kind: 'object', label: 'person', bbox: [100, 100, 200, 400] };
  const stranger = { kind: 'person', emotion: 'neutral', bbox: [700, 120, 100, 100] };
  assert.equal(privacyMasks([body, stranger]).length, 2);
});

test('plain objects produce no masks', () => {
  assert.deepEqual(privacyMasks([{ kind: 'object', label: 'cup', bbox: [0, 0, 10, 10] }]), []);
});

test('empty input gives no masks', () => {
  assert.deepEqual(privacyMasks([]), []);
});
