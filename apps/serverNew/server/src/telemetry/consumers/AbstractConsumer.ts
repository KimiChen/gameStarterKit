export abstract class AbstractConsumer {
    public abstract send(message: string): void

    public flush() {}

    public abstract close(): void
}
