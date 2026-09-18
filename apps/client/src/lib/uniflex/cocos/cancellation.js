/** Native JSB / mini-games need not provide the DOM AbortController global. */
export class Cancellation {
    constructor() {
        this.aborted = false;
        this.listeners = new Set();
    }
    subscribe(listener) {
        if (this.aborted)
            listener();
        else
            this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    abort() {
        if (this.aborted)
            return;
        this.aborted = true;
        const pending = [...this.listeners];
        this.listeners.clear();
        for (const listener of pending)
            listener();
    }
}
