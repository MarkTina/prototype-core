export interface AnnotationPositionRect {
  left: number
  top: number
  width: number
  height: number
}

export interface AnnotationPosition {
  x: number
  y: number
}

export function annotationPositionFromClientPoint(
  clientX: number,
  clientY: number,
  rect: AnnotationPositionRect,
): AnnotationPosition {
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  }
}

export function clampAnnotationPosition(position: AnnotationPosition): AnnotationPosition {
  return {
    x: Math.min(96, Math.max(4, position.x)),
    y: Math.min(96, Math.max(4, position.y)),
  }
}
