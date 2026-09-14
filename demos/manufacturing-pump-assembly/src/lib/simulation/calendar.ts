export type CalendarEvent = {
  at: number;
  seq: number;
  kind: 'model' | 'sample';
  action: () => void;
};

/** Stable minimum heap. Sequence order makes simultaneous events deterministic. */
export class EventCalendar {
  events: CalendarEvent[] = [];
  private sequence = 0;

  push(at: number, action: () => void, kind: CalendarEvent['kind'] = 'model') {
    if (!Number.isFinite(at) || at < 0) throw new Error(`Invalid event time: ${at}`);
    const event: CalendarEvent = { at, seq: this.sequence++, kind, action };
    this.events.push(event);
    let index = this.events.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.before(this.events[parent], event)) break;
      this.events[index] = this.events[parent];
      index = parent;
    }
    this.events[index] = event;
  }

  private before(left: CalendarEvent, right: CalendarEvent) {
    return left.at < right.at || (left.at === right.at && left.seq < right.seq);
  }

  pop() {
    const root = this.events[0];
    if (!root) throw new Error('Cannot pop an empty event calendar');
    const last = this.events.pop()!;
    if (this.events.length > 0) {
      let index = 0;
      while (index * 2 + 1 < this.events.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.events.length && this.before(this.events[child + 1], this.events[child])) child++;
        if (this.before(last, this.events[child])) break;
        this.events[index] = this.events[child];
        index = child;
      }
      this.events[index] = last;
    }
    return root;
  }

  peek() {
    return this.events[0]?.at ?? Infinity;
  }

  get size() {
    return this.events.length;
  }

  hasModelEvent() {
    return this.events.some((event) => event.kind === 'model');
  }
}
