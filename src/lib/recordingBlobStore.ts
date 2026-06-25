let _blob: Blob | null = null;

export function setRecordingBlob(blob: Blob | null): void {
  _blob = blob;
}

export function getRecordingBlob(): Blob | null {
  return _blob;
}
