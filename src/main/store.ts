import Store from 'electron-store';

interface StoreSchema {
  settings: {
    whitelist: string[];
    keywords: string[];
    intervalMin: number;
    minScore: number;
    gmailUser: string | null;
  };
  auth: {
    accessToken: string | null;
    refreshToken: string | null;
    expiryDate: number | null;
  };
  cache: {
    scoredEmailIds: string[];  // 重複評価防止
  };
  senderFeedback: Record<string, number>;  // 送信者フィードバック蓄積値
}

const defaultSettings: StoreSchema['settings'] = {
  whitelist: [],
  keywords: ['至急', '請求', '締切'],
  intervalMin: 5,
  minScore: 4,
  gmailUser: null,
};

export const store = new Store<StoreSchema>({
  defaults: {
    settings: defaultSettings,
    auth: {
      accessToken: null,
      refreshToken: null,
      expiryDate: null,
    },
    cache: {
      scoredEmailIds: [],
    },
    senderFeedback: {},
  },
  encryptionKey: 'gmail-widget-store-key',  // electron-storeの暗号化
});

export function getSettings() {
  return store.get('settings');
}

export function saveSettings(settings: Partial<StoreSchema['settings']>) {
  const current = store.get('settings');
  store.set('settings', { ...current, ...settings });
}

export function getAuth() {
  return store.get('auth');
}

export function saveAuth(auth: Partial<StoreSchema['auth']>) {
  const current = store.get('auth');
  store.set('auth', { ...current, ...auth });
}

export function clearAuth() {
  store.set('auth', {
    accessToken: null,
    refreshToken: null,
    expiryDate: null,
  });
}

export function getScoredEmailIds(): string[] {
  return store.get('cache.scoredEmailIds', []);
}

export function addScoredEmailId(id: string) {
  const ids = getScoredEmailIds();
  if (!ids.includes(id)) {
    // 最大1000件まで保持（古いものは削除）
    const updated = [...ids, id].slice(-1000);
    store.set('cache.scoredEmailIds', updated);
  }
}

export function getSenderFeedback(): Record<string, number> {
  return store.get('senderFeedback', {});
}

export function updateSenderFeedback(email: string, delta: number) {
  const feedback = getSenderFeedback();
  const current = feedback[email] ?? 0;
  const next = Math.max(-10, Math.min(10, current + delta));
  store.set('senderFeedback', { ...feedback, [email]: next });
}
