// MediaStreamTrackProcessor is part of the Insertable Streams API (Chrome 94+)
// and is not yet included in TypeScript's dom lib.

interface MediaStreamTrackProcessorInit {
  track: MediaStreamTrack;
  maxBufferSize?: number;
}

declare class MediaStreamTrackProcessor {
  constructor(init: MediaStreamTrackProcessorInit);
  readonly readable: ReadableStream<VideoFrame | AudioData>;
}
