import { eq } from 'drizzle-orm';
import { db } from '../database/client';
import { metadata, type MetadataRow } from '../database/schema';

class MetadataRepository {
  /**
   * Get a metadata value by key
   */
  async get(key: string): Promise<string | null> {
    const results = await db
      .select()
      .from(metadata)
      .where(eq(metadata.key, key))
      .limit(1);

    return results[0]?.value || null;
  }

  /**
   * Set a metadata value
   */
  async set(key: string, value: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.get(key);

    if (existing !== null) {
      await db
        .update(metadata)
        .set({ value, updated_at: now })
        .where(eq(metadata.key, key));
    } else {
      await db.insert(metadata).values({
        key,
        value,
        updated_at: now,
      });
    }
  }

  /**
   * Delete a metadata key
   */
  async delete(key: string): Promise<void> {
    await db.delete(metadata).where(eq(metadata.key, key));
  }

  /**
   * Get all metadata
   */
  async getAll(): Promise<Record<string, string>> {
    const results = await db.select().from(metadata);
    return Object.fromEntries(results.map(r => [r.key, r.value]));
  }

  /**
   * Clear all metadata
   */
  async clear(): Promise<void> {
    await db.delete(metadata);
  }
}

export const metadataRepository = new MetadataRepository();
export default metadataRepository;
