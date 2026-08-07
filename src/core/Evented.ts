export type Listener<T = unknown> = (event: T) => void;

/** Minimal typed event bus used by Map and handlers. */
export class Evented<Events extends object> {
  private _listeners = new Map<keyof Events, Set<Listener>>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): this {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(listener as Listener);
    return this;
  }

  once<K extends keyof Events>(type: K, listener: Listener<Events[K]>): this {
    const wrap: Listener<Events[K]> = (event) => {
      this.off(type, wrap);
      listener(event);
    };
    return this.on(type, wrap);
  }

  off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): this {
    const set = this._listeners.get(type);
    if (!set) return this;
    set.delete(listener as Listener);
    if (set.size === 0) this._listeners.delete(type);
    return this;
  }

  fire<K extends keyof Events>(type: K, event: Events[K]): this {
    const set = this._listeners.get(type);
    if (!set) return this;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (err) {
        console.error(`[joymap] event handler error (${String(type)})`, err);
      }
    }
    return this;
  }

  /** Drop all listeners (call from Map.remove). */
  removeAllListeners(): void {
    this._listeners.clear();
  }
}
