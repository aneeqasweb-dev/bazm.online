import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import {
  EmailService,
  LocalPreviewEmailProvider,
  type EmailProvider,
  type EmailProviderMessage,
} from "./email-service.js";

type StoredDocument = Record<string, unknown>;

class MemoryDocSnapshot {
  constructor(
    readonly id: string,
    private readonly stored: StoredDocument | null,
  ) {}

  get exists() {
    return this.stored !== null;
  }

  data() {
    return this.stored;
  }

  get(field: string) {
    return this.stored?.[field];
  }
}

class MemoryDocRef {
  constructor(
    private readonly db: MemoryFirestore,
    readonly path: string,
  ) {}

  get id() {
    return this.path.split("/").at(-1) ?? this.path;
  }

  async get() {
    return new MemoryDocSnapshot(this.id, this.db.read(this.path));
  }

  async create(data: StoredDocument) {
    if (this.db.read(this.path)) throw new Error("already-exists");
    this.db.write(this.path, data);
  }

  async update(data: StoredDocument) {
    const current = this.db.read(this.path);
    if (!current) throw new Error("not-found");
    this.db.write(this.path, { ...current, ...data });
  }

  async set(data: StoredDocument, options?: { merge?: boolean }) {
    const current = this.db.read(this.path);
    this.db.write(
      this.path,
      options?.merge && current ? { ...current, ...data } : data,
    );
  }
}

class MemoryQuery {
  private readonly queryLimit: number | null;

  constructor(
    protected readonly db: MemoryFirestore,
    protected readonly collectionPath: string,
    private readonly filters: { field: string; value: unknown }[] = [],
    queryLimit: number | null = null,
  ) {
    this.queryLimit = queryLimit;
  }

  where(field: string, operator: string, value: unknown) {
    if (operator !== "==") throw new Error("unsupported-operator");
    return new MemoryQuery(this.db, this.collectionPath, [
      ...this.filters,
      { field, value },
    ]);
  }

  limit(queryLimit: number) {
    return new MemoryQuery(
      this.db,
      this.collectionPath,
      this.filters,
      queryLimit,
    );
  }

  async get() {
    const docs = this.db
      .collectionEntries(this.collectionPath)
      .filter((entry) =>
        this.filters.every(
          (filter) => entry.data[filter.field] === filter.value,
        ),
      )
      .slice(0, this.queryLimit ?? undefined)
      .map((entry) => new MemoryDocSnapshot(entry.id, entry.data));
    return { docs };
  }
}

class MemoryCollection extends MemoryQuery {
  constructor(
    db: MemoryFirestore,
    private readonly path: string,
  ) {
    super(db, path);
  }

  doc(id = `doc-${Math.random().toString(36).slice(2)}`) {
    return new MemoryDocRef(this.db, `${this.path}/${id}`);
  }
}

class MemoryTransaction {
  async get(ref: MemoryDocRef) {
    return ref.get();
  }

  create(ref: MemoryDocRef, data: StoredDocument) {
    return ref.create(data);
  }

  update(ref: MemoryDocRef, data: StoredDocument) {
    return ref.update(data);
  }
}

class MemoryFirestore {
  private readonly documents = new Map<string, StoredDocument>();

  collection(path: string) {
    return new MemoryCollection(this, path);
  }

  async runTransaction<T>(callback: (transaction: MemoryTransaction) => T) {
    return callback(new MemoryTransaction());
  }

  read(path: string) {
    return this.documents.get(path) ?? null;
  }

  write(path: string, data: StoredDocument) {
    this.documents.set(path, data);
  }

  collectionEntries(collectionPath: string) {
    const prefix = `${collectionPath}/`;
    return [...this.documents.entries()]
      .filter(
        ([path]) =>
          path.startsWith(prefix) && !path.slice(prefix.length).includes("/"),
      )
      .map(([path, data]) => ({
        id: path.slice(prefix.length),
        data,
      }));
  }
}

class RecordingProvider implements EmailProvider {
  readonly calls: EmailProviderMessage[] = [];

  constructor(readonly name: string) {}

  async send(message: EmailProviderMessage) {
    this.calls.push(message);
    return { providerMessageId: `${this.name}-${this.calls.length}` };
  }
}

class FailingProvider implements EmailProvider {
  readonly name = "FAILING";

  async send(): Promise<{ providerMessageId: string }> {
    throw new Error("temporary outage");
  }
}

const sender = { email: "hello@bazm.example", name: "Bazm" };
const welcomeCommand = {
  template: "WELCOME" as const,
  to: { email: "customer@example.test", name: "Customer One" },
  userId: "customer-1",
  source: { type: "AUTH" as const, id: "customer-1" },
  payload: {
    customerName: "Customer One",
    accountUrl: "https://bazm.online/account",
  },
};

function firestore(memory: MemoryFirestore) {
  return memory as unknown as Firestore;
}

describe("EmailService", () => {
  it("sends once for one idempotency key", async () => {
    const memory = new MemoryFirestore();
    const provider = new RecordingProvider("PRIMARY");
    const service = new EmailService(firestore(memory), provider, sender);

    await expect(
      service.sendTemplate("email:welcome:1", welcomeCommand),
    ).resolves.toMatchObject({ status: "SENT", duplicate: false });
    await expect(
      service.sendTemplate("email:welcome:1", welcomeCommand),
    ).resolves.toMatchObject({ status: "SENT", duplicate: true });

    expect(provider.calls).toHaveLength(1);
    const delivery = await memory
      .collection("emailDeliveries")
      .doc("email:welcome:1")
      .get();
    expect(delivery.get("status")).toBe("SENT");
  });

  it("retries failed deliveries through a swapped provider", async () => {
    const memory = new MemoryFirestore();
    const failingService = new EmailService(
      firestore(memory),
      new FailingProvider(),
      sender,
    );

    await expect(
      failingService.sendTemplate("email:retry:1", welcomeCommand),
    ).resolves.toMatchObject({ status: "FAILED" });

    const provider = new RecordingProvider("SECONDARY");
    const retryService = new EmailService(firestore(memory), provider, sender);
    const retried = await retryService.retryPending({ includeFuture: true });

    expect(retried.attempted).toHaveLength(1);
    expect(retried.attempted[0]).toMatchObject({ status: "SENT" });
    expect(provider.calls).toHaveLength(1);
    const delivery = await memory
      .collection("emailDeliveries")
      .doc("email:retry:1")
      .get();
    expect(delivery.get("provider")).toBe("SECONDARY");
    expect(delivery.get("attempts")).toBe(2);
  });

  it("writes a local preview with the same provider contract", async () => {
    const memory = new MemoryFirestore();
    const service = new EmailService(
      firestore(memory),
      new LocalPreviewEmailProvider(firestore(memory)),
      sender,
    );

    await expect(
      service.sendTemplate("email:local:1", welcomeCommand),
    ).resolves.toMatchObject({ status: "SENT" });

    const preview = await memory
      .collection("emailPreviews")
      .doc("email:local:1")
      .get();
    expect(preview.exists).toBe(true);
    expect(preview.get("htmlBody")).toContain("Welcome to Bazm");
  });
});
