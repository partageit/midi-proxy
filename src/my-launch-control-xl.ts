import { AbletonOsc } from './abletonosc/abletonosc';
import { SessionRing } from './abletonosc/session-ring';
import { Clip, Song } from './abletonosc/song';
import { Button, ButtonCallbackOptions, Color, LaunchControlXl, Template } from './launch-control-xl/launch-control-xl';

export class MyLaunchControlXl {
  private sessionRing = new SessionRing(this.osc, 8, 1);
  private isSessionRingEnabled = true;
  private templateChannel = 4;
  private rotariesColors: Color[] = [];

  public constructor(
    private launchControlXl: LaunchControlXl,
    private osc: AbletonOsc,
    private song: Song
  ) {
    this
      .initializeTemplate()
      .initializeSessionRing()
      .initializeBeatFollower();
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

    this.song.on('is-playing', (playing) => {
      this.updatePlayingButtonColor(playing);
      if (!playing) this.setRotariesColor();
    });

    return this;
  }

  private initializeBeatFollower(): this {
    this.setRotariesColor();
    this.song.on('beat', newBeat => {
      const beat = newBeat % 16;
      this.launchControlXl.setButtonColor(this.launchControlXl.buttons.rotaries[beat], Color.off, this.templateChannel);
      const previousBeat = beat === 0 ? 15 : beat - 1;
      this.launchControlXl.setButtonColor(this.launchControlXl.buttons.rotaries[previousBeat], this.rotariesColors[previousBeat], this.templateChannel);
    });
    return this;
  }

  private enableSessionRing(): this {
    this.isSessionRingEnabled = true;
    this.updateDirectionButtonsColor().setRotariesColor();
    this.launchControlXl.resetButtons(this.launchControlXl.buttons.pads, this.templateChannel);
    const buttonOptions: Partial<ButtonCallbackOptions> = { mode: 'key-down', channels: [this.templateChannel], propagate: false };
    const buttonOptionsForLongPress = Object.assign({}, buttonOptions, { mode: 'key-up' });
    this.launchControlXl.buttons.up.setCallback(() => this.sessionRing.up(), buttonOptions);
    this.launchControlXl.buttons.down.setCallback(() => this.sessionRing.down(), buttonOptions);
    this.launchControlXl.buttons.left.setCallback(() => this.sessionRing.left(), buttonOptions);
    this.launchControlXl.buttons.right.setCallback(() => this.sessionRing.right(), buttonOptions);

    this.launchControlXl.buttons.recordArm.setCallback(params => {
      if (params.specialEventType === 'long-press') { this.osc.reset(); } else { this.song.reset(); }
    }, buttonOptionsForLongPress);
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.recordArm, Color.darkAmber, this.templateChannel);
    this.launchControlXl.buttons.device.setCallback(() => this.song.togglePlaying(), buttonOptions);
    this.updatePlayingButtonColor(this.song.isPlaying);

    this.launchControlXl.buttons.solo.setCallback(params => {
      if (params.specialEventType === 'long-press') {
        const previousScenesCount = this.sessionRing.scenesCount;
        this.sessionRing.changeSceneSize(8, previousScenesCount === 1 ? 2 : 1);
        if (previousScenesCount === 2) this.launchControlXl.resetButtons(this.launchControlXl.buttons.secondRowPads, this.templateChannel);
        this.updateSessionRing();
        return;
      }
      if (this.isSessionRingEnabled) {
        this.disableSessionRing('soft');
      } else {
        this.enableSessionRing().updateSessionRing();
      }
      this.launchControlXl.setButtonColor(this.launchControlXl.buttons.solo, this.isSessionRingEnabled ? Color.amber : Color.darkAmber, this.templateChannel);
    }, buttonOptionsForLongPress);

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

    if (mode === 'hard') this.launchControlXl.resetButtons([this.launchControlXl.buttons.solo], this.templateChannel);

    return this;
  }

  private updatePlayingButtonColor(playing: boolean): this {
    if (!this.isSessionRingEnabled) return this;
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.device, playing ? Color.amber : Color.off, this.templateChannel);
    return this;
  }

  private updateDirectionButtonsColor(): this {
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.up, this.sessionRing.isAt('top-most', this.song) ? Color.off : Color.darkRed, this.templateChannel);
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.down, this.sessionRing.isAt('bottom-most', this.song) ? Color.off : Color.darkRed, this.templateChannel);
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.left, this.sessionRing.isAt('left-most', this.song) ? Color.off : Color.darkRed, this.templateChannel);
    this.launchControlXl.setButtonColor(this.launchControlXl.buttons.right, this.sessionRing.isAt('right-most', this.song) ? Color.off : Color.darkRed, this.templateChannel);
    return this;
  }

  private setRotariesColor(): this {
    if (!this.rotariesColors.length) {
      const baseColors = [Color.red, Color.yellow, Color.green, Color.amber];
      for (let i = 0; i < this.launchControlXl.buttons.rotaries.length; i++) {
        this.rotariesColors[i] = baseColors[i % 4];
      }
    }
    for (let i = 0; i < this.rotariesColors.length; i++) {
      this.launchControlXl.setButtonColor(this.launchControlXl.buttons.rotaries[i], this.rotariesColors[i], this.templateChannel);
    }

    return this;
  }

  private updateSessionRing(): this {
    if (!this.isSessionRingEnabled) return this;

    const fillLine = (clips: Clip[], pads: Button[]): void => {
      // console.log('clips');
      // console.table(clips);
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const button = pads[i];
        if (clip && clip.isSet) {
          this.launchControlXl.setButtonColor(button, clip.isPlaying ? Color.red : Color.green, this.templateChannel);
          button.setCallback(() => {
            this.song.playClip(clip, !clip.isPlaying);
            this.launchControlXl.setButtonColor(button, Color.yellow, this.templateChannel);
          }, { mode: 'key-down', channels: [this.templateChannel], propagate: false });
        } else {
          this.launchControlXl.setButtonColor(button, Color.off, this.templateChannel);
          button.setCallback(() => {
            this.song.stopTrack({ clip });
            this.launchControlXl.setButtonColor(button, Color.yellow, this.templateChannel);
          }, { mode: 'key-down', channels: [this.templateChannel], propagate: false });
        }
      }
    }

    const lines = this.sessionRing.getClipsFromSong(this.song).lines;
    fillLine(lines[0], this.launchControlXl.buttons.firstRowPads);
    if (lines[1]) fillLine(lines[1], this.launchControlXl.buttons.secondRowPads);

    return this;
  }
}