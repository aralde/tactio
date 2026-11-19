import { randomUUID } from 'crypto';
import { withRequest } from './claudeCli';

export interface Schedule {
    id: string;
    dir: string;
    request: string;
    everyDays: number;
    /** when it next starts a task, as an ISO date */
    nextAt: string;
}

interface ScheduleStore {
    get(key: string): any;
    set(key: string, val: any): void;
}

const STORE_KEY = 'agentSchedules';
const DAY_MS = 24 * 60 * 60_000;

/**
 * Requests that run again every few days. A due one starts a normal task, which proposes and waits
 * for approval like any other: nothing is changed without the user.
 */
export class AgentSchedules {
    private schedules: Schedule[];

    constructor(private store: ScheduleStore, private start: (dir: string, request: string) => void, private now: () => Date = () => new Date()) {
        this.schedules = (store.get(STORE_KEY) || []).map(withRequest);
    }

    list(): Schedule[] {
        return [...this.schedules];
    }

    find(dir: string, request: string): Schedule | undefined {
        return this.schedules.find(s => s.dir === dir && s.request === request);
    }

    /** Repeats a request every `everyDays` days, counting from now; the same request is kept once. */
    add(dir: string, request: string, everyDays = 7): Schedule {
        const existing = this.find(dir, request);
        if (existing) return existing;
        const schedule = { id: randomUUID().slice(0, 8), dir, request, everyDays, nextAt: new Date(this.now().getTime() + everyDays * DAY_MS).toISOString() };
        this.schedules.push(schedule);
        this.save();
        return schedule;
    }

    remove(id: string) {
        this.schedules = this.schedules.filter(s => s.id !== id);
        this.save();
    }

    /**
     * Starts every due request once, even after days with Tactio closed, and moves its next run to
     * the first slot after now. A request that fails to start still moves on, so it doesn't retry
     * every tick.
     */
    tick() {
        const now = this.now().getTime();
        let changed = false;
        for (const s of this.schedules) {
            let next = Date.parse(s.nextAt);
            if (next > now) continue;
            while (next <= now) next += s.everyDays * DAY_MS;
            s.nextAt = new Date(next).toISOString();
            changed = true;
            try {
                this.start(s.dir, s.request);
            } catch (e) {
                console.error('[Agent] A repeating task could not start:', e);
            }
        }
        if (changed) this.save();
    }

    private save() {
        this.store.set(STORE_KEY, this.schedules);
    }
}
