import type { Entity } from '@iwsdk/core';

interface SubscribableQuery {
  entities: Set<Entity>;
  subscribe(event: 'qualify' | 'disqualify', cb: (entity: Entity) => void, replayExisting?: boolean): () => void;
}

export interface EntityRef {
  current: Entity | undefined;
}

/**
 * Holds the query's (single) matching entity, kept current by qualify/disqualify
 * events. Reading `ref.current` each frame replaces `entities.values().next()`,
 * which allocates an iterator and a result object on every call.
 */
export function trackSingle(query: SubscribableQuery, cleanup: Array<() => void>): EntityRef {
  const ref: EntityRef = { current: undefined };
  cleanup.push(
    query.subscribe(
      'qualify',
      (entity) => {
        ref.current ??= entity;
      },
      true,
    ),
    query.subscribe('disqualify', (entity) => {
      if (ref.current !== entity) return;
      ref.current = undefined;
      // Rare event; picking a replacement here is the only place iteration happens.
      for (const other of query.entities) {
        if (other !== entity) {
          ref.current = other;
          break;
        }
      }
    }),
  );
  return ref;
}

/** Dense array mirror of a query, for index loops that never allocate an iterator. */
export function trackAll(query: SubscribableQuery, cleanup: Array<() => void>): Entity[] {
  const list: Entity[] = [];
  cleanup.push(
    query.subscribe('qualify', (entity) => list.push(entity), true),
    query.subscribe('disqualify', (entity) => {
      const i = list.indexOf(entity);
      if (i < 0) return;
      list[i] = list[list.length - 1];
      list.pop();
    }),
  );
  return list;
}
