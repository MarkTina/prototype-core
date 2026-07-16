import test from 'node:test'
import assert from 'node:assert/strict'
import { annotationPositionFromClientPoint, clampAnnotationPosition } from '../src/prototype/annotationPosition.ts'

test('使用注释层自身原点换算，避免内容容器内边距造成拖动偏移', () => {
  const layerRect = { left: 466, top: -90, width: 333, height: 756 }
  const position = annotationPositionFromClientPoint(466 + 333 * 0.5, -90 + 756 * 0.5, layerRect)

  assert.deepEqual(position, { x: 50, y: 50 })
})

test('可视矩形已包含画布缩放，换算结果保持为同一百分比', () => {
  const scaledLayerRect = { left: 120, top: 80, width: 196.5, height: 426 }
  const position = annotationPositionFromClientPoint(120 + 196.5 * 0.25, 80 + 426 * 0.75, scaledLayerRect)

  assert.deepEqual(position, { x: 25, y: 75 })
  assert.deepEqual(clampAnnotationPosition({ x: -10, y: 120 }), { x: 4, y: 96 })
})
