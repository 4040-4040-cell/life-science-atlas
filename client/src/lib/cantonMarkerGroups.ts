export type AddressMarker<T> = { id: string; position: { x: number; y: number }; record: T };

/** Group intersecting 44px pointer targets. The representative stays on an original postal anchor. */
export function groupAddressMarkers<T>(points: AddressMarker<T>[], width: number, height: number) {
  const parents = points.map((_, i) => i);
  const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]));
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const dx = Math.abs(points[i].position.x - points[j].position.x) * width / 100;
    const dy = Math.abs(points[i].position.y - points[j].position.y) * height / 100;
    if (dx < 52 && dy < 52) parents[root(j)] = root(i);
  }
  const groups = new Map<number, AddressMarker<T>[]>();
  points.forEach((point, i) => { const key = root(i); groups.set(key, [...(groups.get(key) ?? []), point]); });
  return [...groups.values()].map(members => ({ id: members[0].id, position: members[0].position, members }));
}
