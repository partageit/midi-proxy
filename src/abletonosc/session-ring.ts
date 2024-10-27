import { AbletonOsc } from "./abletonosc";
import { Clip, Song } from "./song";
import { TypedEventEmitter } from "../typed-event-emitter";

type SessionRingEventTypes = {
  'ring-moved': []
};

export class SessionRing extends TypedEventEmitter<SessionRingEventTypes> {
  public trackOffset = 0;
  public sceneOffset = 0;

  public constructor(
    private osc: AbletonOsc,
    public tracksCount = 8,
    public scenesCount = 1
  ) {
    super();
    this
      .initialize()
      .startListeners();
  }

  private initialize(): this {
    this.osc.sendMessage('/live/session_ring/set/enabled', true);
    this.osc.sendMessage('/live/session_ring/set_offsets', this.trackOffset, this.sceneOffset);
    this.osc.sendMessage('/live/session_ring/set/num_scenes', this.scenesCount);
    this.osc.sendMessage('/live/session_ring/set/num_tracks', this.tracksCount);
    return this;
  }

  public changeSceneSize(tracksCount: number, scenesCount: number): this {
    this.tracksCount = tracksCount;
    this.scenesCount = scenesCount;
    this.initialize();
    return this;
  }

  private startListeners(): this {
    this.osc.on('/live/startup', () => {
      this.trackOffset = this.sceneOffset = 0;
      this.initialize();
    });
    return this;
  }

  private synchronizeCoordinates(): this {
    this.osc.once('/live/session_ring/get/coordinates', (coordinates: number[]) => {
      this.trackOffset = coordinates[0];
      this.sceneOffset = coordinates[1];
      this.tracksCount = coordinates[2];
      this.scenesCount = coordinates[3];
      this.emit('ring-moved');
    });
    this.osc.sendMessage('/live/session_ring/get/coordinates');
    return this;
  }

  public move(tracks: number, scenes: number): this {
    this.osc.sendMessage('/live/session_ring/move', tracks, scenes);
    this.synchronizeCoordinates();
    return this;
  }

  public up(): this { return this.move(0, -1); }
  public down(): this { return this.move(0, 1); }
  public left(): this { return this.move(-1, 0); }
  public right(): this { return this.move(1, 0); }

  public isAt(position: 'top-most' | 'bottom-most' | 'left-most' | 'right-most', song: Song): boolean {
    switch (position) {
      case 'top-most': return this.sceneOffset === 0;
      case 'bottom-most': return this.sceneOffset + this.scenesCount >= song.scenesCount;
      case 'left-most': return this.trackOffset === 0;
      case 'right-most': return this.trackOffset + this.tracksCount >= song.tracks.length;
    }
  }

  public getClipsFromSong(song: Song): SessionRingClips {
    const sessionRingClips = new SessionRingClips(this.tracksCount, this.scenesCount);
    for (let trackIndex = 0; trackIndex < this.tracksCount; trackIndex++) {
      const track = song.tracks[trackIndex + this.trackOffset];
      if (track === undefined) continue;
      for (let clipIndex = 0; clipIndex < this.scenesCount; clipIndex++) {
        const clip = track.clips[clipIndex + this.sceneOffset];
        if (clip === undefined) continue;
        sessionRingClips.lines[clipIndex][trackIndex] = clip;
      }
    }
    return sessionRingClips;
  }
}

class SessionRingClips {
  public lines: Clip[][] = [];

  public constructor(
    public tracksCount = 8,
    public scenesCount = 1
  ) {
    for (let i = 0; i < this.scenesCount; i++) this.lines.push(Array(this.tracksCount));
  }
}