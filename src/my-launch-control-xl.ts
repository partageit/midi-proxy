import { AbletonOsc } from './abletonosc/abletonosc';
import { SessionRing } from './abletonosc/session-ring';
import { Song } from './abletonosc/song';
import { ButtonCallbackOptions, Color, LaunchControlXl, Template } from './launch-control-xl/launch-control-xl';

export class MyLaunchControlXl {
  private sessionRing = new SessionRing(this.osc, 8, 1);
  private isSessionRingEnabled = true;
  private templateChannel = 4;

  public constructor(
    private launchControlXl: LaunchControlXl,
    private osc: AbletonOsc,
    private song: Song
  ) {
    this
      .initializeTemplate()
      .initializeSessionRing();
  }

  private initializeTemplate(): this {
    this.launchControlXl.on('template-changed', template => {
      if (template.mode === 'user') {
        this.enableSessionRing().updateSessionRing();
      } else {
        this.disableSessionRing();
      }
    });

    this.launchControlXl.goToTemplate(new Template('user', 1));
    return this;
  }

  private initializeSessionRing(): this {
    this.song.on('ready', () => this.updateDirectionButtonsColor().updateSessionRing());
    this.song.on('other-song', () => this.updateSessionRing());
    this.song.on('clip-has-changed', () => this.updateSessionRing());

    this.sessionRing.on('ring-moved', () => {
      console.log('ring moved');
      this
        .updateDirectionButtonsColor()
        .updateSessionRing();
    });

    this.song.on('is-playing', (playing) => this.updatePlayingButtonColor(playing));

    return this;
  }

  private enableSessionRing(): this {
    this.isSessionRingEnabled = true;
    this.launchControlXl.resetButtons(this.launchControlXl.buttons.pads, this.templateChannel);
    const buttonOptions: Partial<ButtonCallbackOptions> = { mode: 'key-press', channels: [this.templateChannel], propagate: false };
    this.launchControlXl.buttons.up.setCallback(() => this.sessionRing.up(), buttonOptions);
    this.launchControlXl.buttons.down.setCallback(() => this.sessionRing.down(), buttonOptions);
    this.launchControlXl.buttons.left.setCallback(() => this.sessionRing.left(), buttonOptions);
    this.launchControlXl.buttons.right.setCallback(() => this.sessionRing.right(), buttonOptions);

    this.launchControlXl.buttons.recordArm.setCallback(() => this.song.reset(), buttonOptions);
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.recordArm, Color.darkAmber, this.templateChannel);
    this.launchControlXl.buttons.device.setCallback(() => this.song.togglePlaying(), buttonOptions);
    this.updatePlayingButtonColor(this.song.isPlaying);

    this.launchControlXl.buttons.solo.setCallback(() => {
      if (this.isSessionRingEnabled) {
        this.disableSessionRing('soft');
      } else {
        this.enableSessionRing().updateSessionRing();
      }
      this.launchControlXl.setButtonColor(this.launchControlXl.buttons.solo, this.isSessionRingEnabled ? Color.amber : Color.darkAmber, this.templateChannel);
    }, buttonOptions);

    this.launchControlXl.buttons.pad9.setCallback(() => this.osc.sendMessage('/live/api/reload'), buttonOptions);

    return this;
  }

  /** hard disable = switch template, soft = from the button in the same template */
  private disableSessionRing(mode: 'soft' | 'hard' = 'hard'): this {
    this.isSessionRingEnabled = false;
    this.launchControlXl.resetButtons([
      ...this.launchControlXl.buttons.pads,
      ...this.launchControlXl.buttons.directions,
      this.launchControlXl.buttons.recordArm,
      this.launchControlXl.buttons.device
    ], this.templateChannel);

    if (mode === 'hard') this.launchControlXl.resetButtons([this.launchControlXl.buttons.solo,], this.templateChannel);

    return this;
  }

  private updatePlayingButtonColor(playing: boolean): this {
    if (!this.isSessionRingEnabled) return this;
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.device, playing ? Color.amber : Color.off, this.templateChannel);
  }

  private updateDirectionButtonsColor(): this {
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.up, this.sessionRing.sceneOffset === 0 ? Color.off : Color.darkRed, this.templateChannel);
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.down, this.sessionRing.sceneOffset + this.sessionRing.scenesCount >= this.song.scenesCount ? Color.off : Color.darkRed, this.templateChannel);
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.left, this.sessionRing.trackOffset === 0 ? Color.off : Color.darkRed, this.templateChannel);
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.right, this.sessionRing.trackOffset + this.sessionRing.tracksCount >= this.song.tracks.length ? Color.off : Color.darkRed, this.templateChannel);
    return this;
  }

  private updateSessionRing(): this {
    if (!this.isSessionRingEnabled) return this;
    const [clips] = this.sessionRing.getClipsFromSong(this.song).lines;
    // console.log('clips');
    // console.log(clips);
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const button = this.launchControlXl.buttons.firstRowPads[i];
      if (clip && clip.isSet) {
        this.launchControlXl.setButtonColor(button, clip.isPlaying ? Color.red : Color.green, this.templateChannel);
        button.setCallback(() => {
          this.song.playClip(clip, !clip.isPlaying);
          this.launchControlXl.setButtonColor(button, Color.yellow, this.templateChannel);
        }, { mode: 'key-press', channels: [this.templateChannel], propagate: false });
      } else {
        this.launchControlXl.setButtonColor(button, Color.off, this.templateChannel);
        button.setCallback(() => { }, { propagate: false });
      }
    }
    return this;
  }
}