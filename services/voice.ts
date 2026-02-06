/**
 * Voice Processing Service
 */

import api from './api';

export interface VoiceProcessingResponse {
  note_id: string;
  title: string;
  transcript: string;
  summary: string | null;
  duration: number;
  folder_id: string | null;
  folder_name: string;
  tags: string[];
  actions: ActionExtractionResult;
  actions_count?: number;
  created_at: string;
}

export interface InputHistoryEntry {
  type: 'text' | 'audio';
  content: string;
  timestamp: string;
  duration?: number;
  audio_key?: string;
}

export interface UpdateDecision {
  update_type: 'append' | 'resynthesize';
  confidence: number;
  reason: string;
}

export interface SynthesisResponse {
  note_id: string;
  title: string;
  narrative: string;
  raw_inputs: InputHistoryEntry[];
  summary: string | null;
  duration: number;
  folder_id: string | null;
  folder_name: string;
  tags: string[];
  actions: ActionExtractionResult;
  created_at: string;
  updated_at: string;
}

export interface SmartSynthesisResponse extends SynthesisResponse {
  decision?: UpdateDecision;
}

// New schema types for enhanced prompt engineering

export interface ClassificationHints {
  considered_types: string[];
  ambiguity_note: string | null;
}

export interface TypeDetection {
  primary_type: 'PLANNING' | 'MEETING' | 'BRAINSTORM' | 'TASKS' | 'REFLECTION' | 'TECHNICAL' | 'QUICK_NOTE';
  secondary_type: 'PLANNING' | 'MEETING' | 'BRAINSTORM' | 'TASKS' | 'REFLECTION' | 'TECHNICAL' | 'QUICK_NOTE' | null;
  confidence: number;
  hybrid_format: boolean;
  classification_hints?: ClassificationHints;
}

export interface RelatedEntities {
  people: string[];
  projects: string[];
  companies: string[];
  concepts: string[];
}

export interface OpenLoop {
  item: string;
  status: 'unresolved' | 'question' | 'blocked' | 'deferred';
  context: string | null;
}

export interface ReminderAction {
  title: string;
  due_date: string;
  due_time: string | null;
  priority: string;
  intent_source?: 'COMMITMENT_TO_SELF' | 'COMMITMENT_TO_OTHER' | 'TIME_BINDING' | 'DELEGATION';
}

export interface CalendarAction {
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  attendees: string[];
}

export interface EmailAction {
  to: string;
  subject: string;
  body: string;
}

export interface ActionExtractionResult {
  title: string;
  folder: string;
  tags: string[];
  summary: string | null;
  type_detection?: TypeDetection;
  related_entities?: RelatedEntities;
  open_loops?: OpenLoop[];
  calendar: CalendarAction[];
  email: EmailAction[];
  reminders: ReminderAction[];
  next_steps: string[];
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

class VoiceService {
  async processVoiceMemo(
    audioUri: string,
    folderId?: string,
    onProgress?: (progress: number, status: string) => void,
    userNotes?: string
  ): Promise<{ data?: VoiceProcessingResponse; error?: string }> {
    try {
      onProgress?.(10, 'Preparing audio...');

      const formData = new FormData();
      const filename = audioUri.split('/').pop() || 'recording.m4a';
      const fileType = this.getContentType(filename);

      formData.append('audio_file', {
        uri: audioUri,
        name: filename,
        type: fileType,
      } as unknown as Blob);

      if (folderId) formData.append('folder_id', folderId);
      if (userNotes) formData.append('user_notes', userNotes);

      onProgress?.(30, 'Uploading audio...');

      const response = await api.postFormData<VoiceProcessingResponse>('/voice/process', formData);

      if (response.error) return { error: response.error.message };

      onProgress?.(100, 'Complete!');
      return { data: response.data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to process voice memo' };
    }
  }

  async appendToNote(
    noteId: string,
    audioUri: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<{ data?: VoiceProcessingResponse; error?: string }> {
    try {
      onProgress?.(10, 'Preparing audio...');

      const formData = new FormData();
      const filename = audioUri.split('/').pop() || 'recording_append.m4a';
      const fileType = this.getContentType(filename);

      formData.append('audio_file', {
        uri: audioUri,
        name: filename,
        type: fileType,
      } as unknown as Blob);

      onProgress?.(30, 'Uploading audio...');

      const response = await api.postFormData<VoiceProcessingResponse>(`/voice/append/${noteId}`, formData);

      if (response.error) return { error: response.error.message };

      onProgress?.(100, 'Complete!');
      return { data: response.data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to append to note' };
    }
  }

  async transcribeOnly(audioUri: string): Promise<{ data?: TranscriptionResult; error?: string }> {
    try {
      const formData = new FormData();
      const filename = audioUri.split('/').pop() || 'recording.m4a';
      formData.append('audio_file', {
        uri: audioUri,
        name: filename,
        type: this.getContentType(filename),
      } as unknown as Blob);

      const response = await api.postFormData<TranscriptionResult>('/voice/transcribe', formData);
      if (response.error) return { error: response.error.message };
      return { data: response.data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Transcription failed' };
    }
  }

  /**
   * Synthesize a note from text and/or audio.
   * This is the new primary method for creating notes.
   */
  async synthesizeNote(
    options: {
      textInput?: string;
      audioUri?: string;
      folderId?: string;
    },
    onProgress?: (progress: number, status: string) => void
  ): Promise<{ data?: SynthesisResponse; error?: string }> {
    try {
      const { textInput, audioUri, folderId } = options;

      if (!textInput?.trim() && !audioUri) {
        return { error: 'Please provide text or audio' };
      }

      onProgress?.(10, 'Preparing...');

      const formData = new FormData();

      // Add text input if provided
      if (textInput?.trim()) {
        formData.append('text_input', textInput.trim());
      }

      // Add audio file if provided
      if (audioUri) {
        const filename = audioUri.split('/').pop() || 'recording.m4a';
        const fileType = this.getContentType(filename);
        formData.append('audio_file', {
          uri: audioUri,
          name: filename,
          type: fileType,
        } as unknown as Blob);
        onProgress?.(20, 'Uploading audio...');
      }

      // Add folder if specified
      if (folderId) {
        formData.append('folder_id', folderId);
      }

      onProgress?.(40, audioUri ? 'Transcribing audio...' : 'Processing...');

      const response = await api.postFormData<SynthesisResponse>('/voice/synthesize', formData);

      if (response.error) return { error: response.error.message };

      onProgress?.(80, 'Extracting actions...');
      onProgress?.(100, 'Complete!');

      return { data: response.data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to synthesize note' };
    }
  }

  /**
   * Add more content to an existing note with smart synthesis.
   * Optimized for faster append operations with granular progress feedback.
   */
  async addToNote(
    noteId: string,
    options: {
      textInput?: string;
      audioUri?: string;
      resynthesize?: boolean;
      autoDecide?: boolean;
    },
    onProgress?: (progress: number, status: string) => void
  ): Promise<{ data?: SmartSynthesisResponse; error?: string }> {
    try {
      const { textInput, audioUri, resynthesize, autoDecide = true } = options;

      if (!textInput?.trim() && !audioUri) {
        return { error: 'Please provide text or audio' };
      }

      onProgress?.(5, 'Preparing content...');

      const formData = new FormData();

      if (textInput?.trim()) {
        formData.append('text_input', textInput.trim());
      }

      if (audioUri) {
        const filename = audioUri.split('/').pop() || 'recording_add.m4a';
        const fileType = this.getContentType(filename);
        formData.append('audio_file', {
          uri: audioUri,
          name: filename,
          type: fileType,
        } as unknown as Blob);
        onProgress?.(15, 'Uploading audio...');
      }

      // Only add resynthesize if explicitly set (not undefined)
      if (resynthesize !== undefined) {
        formData.append('resynthesize', resynthesize.toString());
      }
      formData.append('auto_decide', autoDecide.toString());

      // Show appropriate progress based on operation type
      if (audioUri) {
        onProgress?.(35, 'Processing audio & transcribing...');
      } else {
        onProgress?.(35, 'Processing text...');
      }

      // Start the request - backend now runs upload+transcription in parallel
      const response = await api.postFormData<SmartSynthesisResponse>(
        `/voice/synthesize/${noteId}`,
        formData
      );

      if (response.error) return { error: response.error.message };

      onProgress?.(90, 'Updating note...');
      onProgress?.(100, 'Complete!');
      return { data: response.data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to add to note' };
    }
  }

  /**
   * Delete an input from a note's input history.
   */
  async deleteInput(
    noteId: string,
    inputIndex: number,
    onProgress?: (progress: number, status: string) => void
  ): Promise<{ data?: SynthesisResponse; error?: string }> {
    try {
      onProgress?.(20, 'Deleting input...');

      const response = await api.delete<SynthesisResponse>(
        `/voice/notes/${noteId}/inputs/${inputIndex}`
      );

      if (response.error) return { error: response.error.message };

      onProgress?.(100, 'Complete!');
      return { data: response.data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to delete input' };
    }
  }

  /**
   * Re-synthesize an existing note from its input history.
   */
  async resynthesizeNote(
    noteId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<{ data?: SynthesisResponse; error?: string }> {
    try {
      onProgress?.(20, 'Re-synthesizing...');

      const response = await api.post<SynthesisResponse>(`/voice/resynthesize/${noteId}`, {});

      if (response.error) return { error: response.error.message };

      onProgress?.(100, 'Complete!');
      return { data: response.data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to resynthesize note' };
    }
  }

  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      mp3: 'audio/mpeg', m4a: 'audio/x-m4a', wav: 'audio/wav',
      mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
    };
    return contentTypes[ext || ''] || 'audio/mpeg';
  }
}

export const voiceService = new VoiceService();
export default voiceService;
