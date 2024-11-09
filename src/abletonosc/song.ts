import { AbletonOsc } from "./abletonosc";
import { ArgumentType } from "node-osc";
import { TypedEventEmitter } from "../typed-event-emitter";

type SongEventTypes = {
  'ready': []
  'clip-has-changed': [clip: Clip, trackId: number, clipId: number],
  /** new or open song */
  'other-song': [],
  'is-playing': [playing: boolean],
  /** newBeat starts from 0 and never ends until song is stopped */
  'beat': [newBeat: number]
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
    this.initializeListeners().initialize();
  }

  public reset(): this {
    this.osc.sendMessage('/live/track/stop_listen/playing_slot_index', '*');
    return this.initialize();
  }

  /** start this.osc.on(*) once here */
  private initializeListeners(): this {
    this.osc.on('/live/song/get/is_playing', (data: ArgumentType[]) => {
      this.isPlaying = !!data[0];
      this.emit('is-playing', this.isPlaying);
    });

    this.osc.on('/live/startup', () => {
      this.emit('other-song');
      this.reset();
    });

    this.osc.on('/live/track/get/playing_slot_index', (data: ArgumentType[]) => {
      this.handleClipPlayingChanges(data[0] as number, data[1] as number);
    });

    this.osc.on('/live/song/get/beat', (data: ArgumentType[]) => {
      this.emit('beat', data[0] as number);
    });

    return this;
  }

  /**
   * @param clipIndex negative value when every clips of the track are stopped
   */
  private handleClipPlayingChanges(trackIndex: number, clipIndex: number): this {
    const track = this.tracks[trackIndex];

    // group track is not updated directly, because an unwanted event is received for the group when starting/stopping the first track of the group
    if (track.isGroup) return this;

    const updateGroupPlayingState = (track: Track, clipIndex: number) => {
      if (track.parentTrackId === null) return;
      const tracksInGroup = this.tracks.filter(t => t.parentTrackId === track.parentTrackId);
      const clipsInGroup = tracksInGroup.map(t => t.clips[clipIndex]);
      const atLeastOneClipInGroupIsPlaying = clipsInGroup.some(c => c.isPlaying);
      const clip = this.tracks[track.parentTrackId].clips[clipIndex];
      clip.isPlaying = atLeastOneClipInGroupIsPlaying;
      this.emit('clip-has-changed', clip, track.parentTrackId, clipIndex);
    };

    const previousPlayingClipIndex = track.clips.findIndex(c => c.isPlaying);
    if (previousPlayingClipIndex !== -1 && previousPlayingClipIndex !== clipIndex) {
      const clip = track.clips[previousPlayingClipIndex];
      clip.isPlaying = false;
      updateGroupPlayingState(track, previousPlayingClipIndex);
      this.emit('clip-has-changed', clip, trackIndex, previousPlayingClipIndex);
    }
    if (clipIndex >= 0) {
      const clip = track.clips[clipIndex];
      clip.isPlaying = true;
      updateGroupPlayingState(track, clipIndex);
      this.emit('clip-has-changed', clip, trackIndex, clipIndex);
    }

    return this;
  }

  private initialize(): this {
    // listeners are in inititializeListeners
    this.osc.sendMessage('/live/song/start_listen/is_playing');
    this.osc.sendMessage('/live/song/start_listen/beat');

    this.osc.once('/live/song/get/num_scenes', (data: ArgumentType[]) => {
      this.scenesCount = data[0] as number;

      this.osc.once('/live/song/get/num_tracks', (data: ArgumentType[]) => this.initializeTracks(data[0] as number));
      this.osc.sendMessage('/live/song/get/num_tracks');
    });
    this.osc.sendMessage('/live/song/get/num_scenes');

    return this;
  }

  private initializeTracks(tracksCount: number): this {
    this.tracks = [];
    const trackParams = ['track.name', 'track.color', 'track.is_foldable', 'track.is_grouped'] as const;
    const clipParams = ['clip.name', 'clip.color', 'clip.length', 'clip.is_playing'];
    this.osc.once('/live/song/get/track_data', (data: ArgumentType[]) => {
      const trackParamsCount = trackParams.length;
      const clipParamsCount = clipParams.length;

      let trackIndex = 0;
      let lastGroupTrackId = 0;
      while (data.length) {
        const trackData = data.splice(0, (this.scenesCount * clipParamsCount) + trackParamsCount);
        const params: { [k in typeof trackParams[number]]?: ArgumentType } = {};
        for (const trackParam of trackParams) params[trackParam] = trackData.shift();
        const track = new Track(params['track.name'] as string, params['track.color'] as number, params['track.is_foldable'] as boolean, params['track.is_grouped'] as boolean ? lastGroupTrackId : null);
        if (track.isGroup) lastGroupTrackId = trackIndex;
        this.tracks.push(track);
        for (let i = 0; i < this.scenesCount; i++) {
          const clipIsEmpty = trackData[i] === null;
          track.clips.push(new Clip(
            trackData[i] as string,
            trackData[i + this.scenesCount * 1] as number,
            trackData[i + this.scenesCount * 2] as number,
            !!(trackData[i + this.scenesCount * 3]),
            track.isGroup
          ));
          if (track.parentTrackId !== null && !clipIsEmpty) this.tracks[lastGroupTrackId].clips[i].groupHasClip = true;
        }
        trackIndex++;
      }

      this.emit('ready');

      // must be restarted when one track is added/removed
      this.osc.sendMessage('/live/track/start_listen/playing_slot_index', '*');
    });
    this.osc.sendMessage('/live/song/get/track_data', 0, tracksCount, ...trackParams, ...clipParams);
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

  public stopTrack(params: { track?: Track, clip?: Clip, trackIndex?: number }): this {
    let trackIndex: number = null;
    if (params.trackIndex) trackIndex = params.trackIndex;
    if (params.clip) {
      const clipCoordinates = this.findClip(params.clip);
      if (clipCoordinates) trackIndex = clipCoordinates.trackIndex;
    }
    if (params.track) {
      const index = this.tracks.findIndex(t => t === params.track);
      if (index !== -1) trackIndex = index;
    }

    if (trackIndex === null) {
      console.error('stopTrack: track not found', params);
      return this;
    }

    this.osc.sendMessage('/live/track/stop_all_clips', trackIndex);
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
    /** for grouped tracks, the parent track id */
    public parentTrackId: number,
    public clips: Clip[] = []
  ) { }
}

export class Clip {
  public groupHasClip = false;
  public get hexaColor(): string { return '#' + this.color.toString(16).padStart(6, '0'); };
  public get isSet(): boolean { return (this.isGroup && this.groupHasClip) || this.name !== null; };

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
