import { requireOptionalNativeModule } from 'expo';

/**
 * The device file system, reached through the native module Expo already
 * ships in the app rather than through the expo-file-system JS package.
 *
 * The module is linked into every build — `expo` depends on it — but adding
 * its JS package to package.json would change the native fingerprint, and a
 * new fingerprint means a new store build before anyone could download a
 * track. Talking to the module directly ships over the air.
 *
 * Everything here is defensive: a missing module, or a method that throws,
 * turns downloads off with a reason rather than taking the app down.
 */

export interface NativeFile {
  readonly uri: string;
  readonly exists: boolean;
  /** Bytes on disk; null when the file does not exist. */
  readonly size: number | null;
  delete(): void;
  create(options?: { intermediates?: boolean; overwrite?: boolean; idempotent?: boolean }): void;
  moveSync(destination: NativeFile | NativeDirectory, options?: { overwrite?: boolean }): void;
  textSync(): string;
  bytesSync(): Uint8Array;
}

export interface NativeDirectory {
  readonly uri: string;
  readonly exists: boolean;
  delete(): void;
  create(options?: { intermediates?: boolean; idempotent?: boolean }): void;
  listAsRecords(): { isDirectory: boolean; uri: string }[];
}

export interface DownloadProgressEvent {
  bytesWritten: number;
  /** -1 when the server sent no length. */
  totalBytes: number;
}

export interface NativeDownloadTask {
  /** Resolves with the file's URI, or null if paused before it finished. */
  start(url: string, to: NativeFile, options?: { headers?: Record<string, string> }): Promise<string | null>;
  /** Continues from `resumeData` bytes with a Range request. */
  resume(
    url: string,
    to: NativeFile,
    resumeData: string,
    options?: { headers?: Record<string, string> },
  ): Promise<string | null>;
  pause(): { resumeData?: string } | null | undefined;
  cancel(): void;
  addListener(event: 'progress', listener: (progress: DownloadProgressEvent) => void): { remove(): void };
  release(): void;
}

interface FileSystemModule {
  FileSystemFile: new (uri: string) => NativeFile;
  FileSystemDirectory: new (uri: string) => NativeDirectory;
  FileSystemDownloadTask?: new () => NativeDownloadTask;
  documentDirectory?: string;
  availableDiskSpace?: number;
  totalDiskSpace?: number;
}

let cached: FileSystemModule | null | undefined;

function native(): FileSystemModule | null {
  if (cached !== undefined) return cached;
  try {
    const module = requireOptionalNativeModule<FileSystemModule>('FileSystem');
    cached =
      module &&
      typeof module.FileSystemFile === 'function' &&
      typeof module.FileSystemDirectory === 'function' &&
      typeof module.FileSystemDownloadTask === 'function' &&
      typeof module.documentDirectory === 'string'
        ? module
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Why downloads cannot work on this build, or null when they can. */
export function unsupportedReason(): string | null {
  return native() ? null : 'Downloads need a newer build of the app on this device.';
}

/** The app's private documents folder, ending in "/". */
function documents(): string {
  const root = native()?.documentDirectory ?? '';
  return root.endsWith('/') ? root : `${root}/`;
}

/** Where everything downloaded lives. Deleting this folder deletes it all. */
export const dirs = {
  root: () => `${documents()}offline/`,
  tracks: () => `${documents()}offline/tracks/`,
  covers: () => `${documents()}offline/covers/`,
  partial: () => `${documents()}offline/partial/`,
};

function fs(): FileSystemModule {
  const module = native();
  if (!module) throw new Error(unsupportedReason() ?? 'File system unavailable');
  return module;
}

export function file(uri: string): NativeFile {
  return new (fs().FileSystemFile)(uri);
}

export function directory(uri: string): NativeDirectory {
  return new (fs().FileSystemDirectory)(uri);
}

export function createDownloadTask(): NativeDownloadTask {
  const Task = fs().FileSystemDownloadTask;
  if (!Task) throw new Error(unsupportedReason() ?? 'Downloads unavailable');
  return new Task();
}

/** Creates the folders downloads are written to. Safe to call repeatedly. */
export function ensureDirectories(): void {
  for (const uri of [dirs.tracks(), dirs.covers(), dirs.partial()]) {
    const dir = directory(uri);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  }
}

/** Size of a file in bytes, or 0 when it is missing or unreadable. */
export function sizeOf(uri: string): number {
  try {
    const f = file(uri);
    return f.exists ? (f.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function exists(uri: string): boolean {
  try {
    return file(uri).exists;
  } catch {
    return false;
  }
}

/** Deletes a file if it is there. Never throws. */
export function removeFile(uri: string): void {
  try {
    const f = file(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone, or out of reach — either way nothing to keep.
  }
}

/** Deletes a folder and everything in it. Never throws. */
export function removeDirectory(uri: string): void {
  try {
    const dir = directory(uri);
    if (dir.exists) dir.delete();
  } catch {
    // As above.
  }
}

/** Moves a finished file into place, replacing anything already there. */
export function moveInto(from: string, to: string): void {
  file(from).moveSync(file(to), { overwrite: true });
}

/** File names in a folder; empty when it is missing or unreadable. */
export function listNames(uri: string): string[] {
  try {
    const dir = directory(uri);
    if (!dir.exists) return [];
    return dir
      .listAsRecords()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => decodeURIComponent(entry.uri.slice(entry.uri.replace(/\/$/, '').lastIndexOf('/') + 1)));
  } catch {
    return [];
  }
}

/** Reads a small file as text. Null when it cannot be read. */
export function readText(uri: string): string | null {
  try {
    return file(uri).textSync();
  } catch {
    return null;
  }
}

/** Reads a small file's bytes. Null when it cannot be read. */
export function readBytes(uri: string): Uint8Array | null {
  try {
    return file(uri).bytesSync();
  } catch {
    return null;
  }
}

/** Free bytes on the volume downloads are written to; null if unknown. */
export function freeSpace(): number | null {
  try {
    const value = native()?.availableDiskSpace;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Total bytes on that volume; null if unknown. */
export function totalSpace(): number | null {
  try {
    const value = native()?.totalDiskSpace;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
