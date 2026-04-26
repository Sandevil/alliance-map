import { Coord, ExternalReference } from './models';

export function toExternal(internal: Coord, reference: ExternalReference): Coord {
  return {
    x: reference.anchorExternal.x + (internal.x - reference.anchorInternal.x),
    y: reference.anchorExternal.y + (internal.y - reference.anchorInternal.y),
  };
}

export function toInternal(external: Coord, reference: ExternalReference): Coord {
  return {
    x: reference.anchorInternal.x + (external.x - reference.anchorExternal.x),
    y: reference.anchorInternal.y + (external.y - reference.anchorExternal.y),
  };
}
