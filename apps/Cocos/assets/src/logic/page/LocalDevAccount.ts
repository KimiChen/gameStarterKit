import { PROJECT_ID } from '../../shared/project';

export const LOCAL_DEV_ACCOUNT_KEY = `${PROJECT_ID}.dev-account.v1`;
const VALID_KEY = /^[a-zA-Z0-9_-]{1,32}$/;

export interface LocalAccountStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function validDevAccountKey(value: string | null): string | null {
    const key = value?.trim();
    return key && VALID_KEY.test(key) ? key : null;
}

/** Query overrides are temporary; they must never replace this browser's default account. */
export function resolveLocalDevAccount(
    override: string | null,
    storage: LocalAccountStorage,
    createKey: () => string,
): string {
    const explicit = validDevAccountKey(override);
    if (explicit) return explicit;
    const cached = validDevAccountKey(storage.getItem(LOCAL_DEV_ACCOUNT_KEY));
    if (cached) return cached;
    const key = createKey();
    if (!validDevAccountKey(key)) throw new Error('Invalid generated development account');
    storage.setItem(LOCAL_DEV_ACCOUNT_KEY, key);
    // Do not register a disposable identity if the platform silently rejects persistence.
    const saved = validDevAccountKey(storage.getItem(LOCAL_DEV_ACCOUNT_KEY));
    if (!saved) throw new Error('Local account could not be saved');
    return saved;
}
