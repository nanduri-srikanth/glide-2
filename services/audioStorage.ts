/**
 * Audio Storage Service
 *
 * Handles persistent local storage of audio files using expo-file-system.
 * Audio files are saved to the app's document directory and survive app restarts.
 */

import { Paths, File, Directory } from 'expo-file-system';

// Audio directory name
const AUDIO_DIR_NAME = 'audio';

/**
 * Get the audio directory
 */
function getAudioDirectory(): Directory {
  return new Directory(Paths.document, AUDIO_DIR_NAME);
}

/**
 * Generate a unique filename for an audio file
 */
function generateAudioFilename(noteId: string): string {
  const timestamp = Date.now();
  return `${noteId}_${timestamp}.m4a`;
}

/**
 * Ensure the audio directory exists
 */
async function ensureAudioDirectory(): Promise<void> {
  const audioDir = getAudioDirectory();
  if (!audioDir.exists) {
    audioDir.create();
  }
}

/**
 * Save an audio file from a temporary URI to permanent storage
 * @param tempUri - The temporary URI from expo-av recording
 * @param noteId - The ID of the note this audio belongs to
 * @returns The permanent local file path (URI)
 */
export async function saveAudioPermanently(
  tempUri: string,
  noteId: string
): Promise<string> {
  await ensureAudioDirectory();

  const filename = generateAudioFilename(noteId);
  const audioDir = getAudioDirectory();
  const destFile = new File(audioDir, filename);

  // Create source file reference
  const sourceFile = new File(tempUri);

  // Copy the file
  sourceFile.copy(destFile);

  console.log('[AudioStorage] Saved audio:', destFile.uri);
  return destFile.uri;
}

/**
 * Check if an audio file exists at the given path
 */
export async function audioExists(localPath: string): Promise<boolean> {
  try {
    const file = new File(localPath);
    return file.exists;
  } catch {
    return false;
  }
}

/**
 * Get information about an audio file
 */
export async function getAudioInfo(localPath: string): Promise<{
  exists: boolean;
  size?: number;
} | null> {
  try {
    const file = new File(localPath);
    if (file.exists) {
      return {
        exists: true,
        size: file.size,
      };
    }
    return { exists: false };
  } catch {
    return null;
  }
}

/**
 * Delete an audio file
 */
export async function deleteAudio(localPath: string): Promise<boolean> {
  try {
    const file = new File(localPath);
    if (file.exists) {
      file.delete();
      console.log('[AudioStorage] Deleted audio:', localPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[AudioStorage] Failed to delete audio:', error);
    return false;
  }
}

/**
 * Delete all audio files for a specific note
 * Useful when a note is permanently deleted
 */
export async function deleteAudioForNote(noteId: string): Promise<void> {
  try {
    await ensureAudioDirectory();
    const audioDir = getAudioDirectory();

    // List files in directory
    const files = audioDir.list();

    for (const item of files) {
      if (item instanceof File && item.name.startsWith(noteId)) {
        item.delete();
        console.log('[AudioStorage] Deleted audio for note:', item.uri);
      }
    }
  } catch (error) {
    console.error('[AudioStorage] Failed to delete audio for note:', error);
  }
}

/**
 * Get the total size of all stored audio files
 */
export async function getTotalAudioSize(): Promise<number> {
  try {
    await ensureAudioDirectory();
    const audioDir = getAudioDirectory();
    const files = audioDir.list();

    let totalSize = 0;
    for (const item of files) {
      if (item instanceof File) {
        totalSize += item.size || 0;
      }
    }

    return totalSize;
  } catch {
    return 0;
  }
}

/**
 * List all stored audio files
 */
export async function listAudioFiles(): Promise<string[]> {
  try {
    await ensureAudioDirectory();
    const audioDir = getAudioDirectory();
    const files = audioDir.list();

    return files
      .filter((item): item is File => item instanceof File)
      .map(file => file.uri);
  } catch {
    return [];
  }
}

/**
 * Clean up orphaned audio files (files not associated with any note)
 * @param validNoteIds - List of note IDs that should have audio
 */
export async function cleanupOrphanedAudio(validNoteIds: string[]): Promise<number> {
  try {
    await ensureAudioDirectory();
    const audioDir = getAudioDirectory();
    const files = audioDir.list();

    let deletedCount = 0;
    for (const item of files) {
      if (item instanceof File) {
        // Extract note ID from filename (format: noteId_timestamp.m4a)
        const noteId = item.name.split('_')[0];
        if (!validNoteIds.includes(noteId)) {
          item.delete();
          deletedCount++;
          console.log('[AudioStorage] Cleaned up orphaned audio:', item.name);
        }
      }
    }

    return deletedCount;
  } catch (error) {
    console.error('[AudioStorage] Failed to cleanup orphaned audio:', error);
    return 0;
  }
}

/**
 * Get the audio directory path (for debugging/info)
 */
export function getAudioDirectoryPath(): string {
  return getAudioDirectory().uri;
}

export const audioStorage = {
  saveAudioPermanently,
  audioExists,
  getAudioInfo,
  deleteAudio,
  deleteAudioForNote,
  getTotalAudioSize,
  listAudioFiles,
  cleanupOrphanedAudio,
  getAudioDirectoryPath,
};

export default audioStorage;
