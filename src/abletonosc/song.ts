import { AbletonOsc } from "./abletonosc";
import { ArgumentType } from "node-osc";
import { TypedEventEmitter } from "../typed-event-emitter";

type SongEventTypes = {
  'ready': []
  'clip-has-changed': [clip: Clip, trackId: number, clipId: number],
  /** new or open song */
  'other-song': [],
  'is-playing': [playing: boolean]
};

export class Song extends TypedEventEmitter<SongEventTypes> {
  public scenesCount = 0;
  public tracks: Track[] = [];
  public isPlaying = false;
  public get scenes(): Scene[] {
    const scenes: Scene[] = [];
    for (let sceneId = 0; sceneId < this.scenesCount; sceneId++) {
      scenes.push(new Scene().fromTracks(this.tracks, sceneId));
    }
    return scenes;
  }

  public constructor(private osc: AbletonOsc) {
    super();
    this.initialize();
  }

  public reset(): this {
    this.osc.sendMessage('/live/track/stop_listen/playing_slot_index', '*');
    return this.initialize();
  }

  private initialize(): this {
    this.osc.on('/live/song/get/is_playing', (data: ArgumentType[]) => {
      this.isPlaying = !!data[0];
      this.emit('is-playing', this.isPlaying);
    });
    this.osc.sendMessage('/live/song/start_listen/is_playing');

    this.osc.on('/live/startup', () => {
      this.emit('other-song');
      this.reset();
    });

    this.osc.once('/live/song/get/num_scenes', (data: ArgumentType[]) => {
      this.scenesCount = data[0] as number;

      this.osc.once('/live/song/get/num_tracks', (data: ArgumentType[]) => this.initializeTracks(data[0] as number));
      this.osc.sendMessage('/live/song/get/num_tracks');
    });
    this.osc.sendMessage('/live/song/get/num_scenes');

    // this.osc.sendMessage('/live/view/start_listen/selected_scene');
    // this.osc.sendMessage('/live/view/start_listen/selected_track');

    return this;
  }

  private initializeTracks(tracksCount: number): this {
    this.tracks = [];
    this.osc.once('/live/song/get/track_data', (data: ArgumentType[]) => {
      const trackParamsCount = 3;
      const clipParamsCount = 4;

      while (data.length) {
        const trackData = data.splice(0, (this.scenesCount * clipParamsCount) + trackParamsCount);
        const track = new Track(trackData.shift() as string, trackData.shift() as number, trackData.shift() as boolean);
        this.tracks.push(track);
        for (let i = 0; i < this.scenesCount; i++) {
          track.clips.push(new Clip(
            trackData[i] as string,
            trackData[i + this.scenesCount * 1] as number,
            trackData[i + this.scenesCount * 2] as number,
            !!(trackData[i + this.scenesCount * 3]),
            track.isGroup
          ));
        }
      }

      this.emit('ready');
      this.startListeners();
    });
    this.osc.sendMessage('/live/song/get/track_data', 0, tracksCount, 'track.name', 'track.color', 'track.is_foldable', 'clip.name', 'clip.color', 'clip.length', 'clip.is_playing');
    return this;
  }

  private startListeners(): this {
    return this.listenOnPlayingClips();
  }

  private listenOnPlayingClips(): this {
    this.osc.on('/live/track/get/playing_slot_index', (data: ArgumentType[]) => {
      const [trackIndex, clipIndex] = data;
      const previousPlayingClipIndex = this.tracks[trackIndex as number].clips.findIndex(c => c.isPlaying);
      if (previousPlayingClipIndex !== -1 && previousPlayingClipIndex !== clipIndex) {
        const clip = this.tracks[trackIndex as number].clips[previousPlayingClipIndex];
        clip.isPlaying = false;
        this.emit('clip-has-changed', clip, trackIndex as number, previousPlayingClipIndex);
      }
      if (clipIndex as number >= 0) {
        const clip = this.tracks[trackIndex as number].clips[clipIndex as number];
        clip.isPlaying = true;
        this.emit('clip-has-changed', clip, trackIndex as number, clipIndex as number);
      }
    });

    // must be restarted when one track is added/removed
    this.osc.sendMessage('/live/track/start_listen/playing_slot_index', '*');

    return this;
  }

  private findClip(clip: Clip): { trackIndex: number, clipIndex: number } {
    for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex++) {
      const clipIndex = this.tracks[trackIndex].clips.findIndex(c => c === clip);
      if (clipIndex !== -1) return { trackIndex, clipIndex };
    }
    return null;
  }

  public playClip(clip: Clip, play = true): this {
    if (!clip.isSet) return this;
    const clipCoordinates = this.findClip(clip);
    if (!clipCoordinates) {
      console.error('playClip: clip not found', clip);
      return;
    }
    const address = play ? '/live/clip_slot/fire' : '/live/clip_slot/stop';
    this.osc.sendMessage(address, clipCoordinates.trackIndex, clipCoordinates.clipIndex);
    // return value is handled in startListeners for every tracks at once with /live/track/get/playing_slot_index
    return this;
  }

  public stopClip(clip: Clip): this {
    this.playClip(clip, false)
    return this;
  }

  public selectTrack(trackIndex: number): this {
    this.osc.sendMessage('/live/view/set/selected_track', trackIndex);
    return this;
  }

  public play(): this {
    this.osc.sendMessage('/live/song/start_playing');
    return this;
  }

  public stop(): this {
    this.osc.sendMessage('/live/song/stop_playing');
    return this;
  }

  public togglePlaying(): this {
    return this.isPlaying ? this.stop() : this.play();
  }
}

export class Track {
  public get hexaColor(): string { return '#' + this.color.toString(16).padStart(6, '0'); };

  public constructor(
    public name: string,
    public color: number,
    public isGroup: boolean,
    public clips: Clip[] = []
  ) { }
}

export class Clip {
  public get hexaColor(): string { return '#' + this.color.toString(16).padStart(6, '0'); };
  public get isSet(): boolean { return this.isGroup || this.name !== null; };

  public constructor(
    public name: string,
    public color: number,
    public length: number,
    public isPlaying: boolean,
    public isGroup: boolean
  ) { }

  public unSet(): this {
    this.name = null;
    this.color = null;
    this.length = null;
    this.isPlaying = null;
    return this;
  }
}

class Scene {
  public clips: Clip[] = [];

  public fromTracks(tracks: Track[], sceneId: number): this {
    this.clips = [...tracks.map(track => track.clips[sceneId])];
    return this;
  }
}
