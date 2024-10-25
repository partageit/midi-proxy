import { AbletonOsc } from './abletonosc/abletonosc';
import { SessionRing } from './abletonosc/session-ring';
import { Song } from './abletonosc/song';
import { ButtonCallbackOptions, Color, LaunchControlXl, Template } from './launch-control-xl/launch-control-xl';

export class MyLaunchControlXl {
  private sessionRing = new SessionRing(this.osc, 8, 1);
  private isSessionRingEnabled = true;

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
    this.song.on('ready', () => this.updateSessionRing());
    this.song.on('other-song', () => this.updateSessionRing());
    this.song.on('clip-has-changed', () => this.updateSessionRing());

    this.sessionRing.on('ring-moved', () => {
      console.log('ring moved');
      this.updateSessionRing()
    });

    return this;
  }

  private enableSessionRing(): this {
    this.isSessionRingEnabled = true;
    this.launchControlXl.resetButtons(this.launchControlXl.buttons.pads, 4);
    const buttonOptions: Partial<ButtonCallbackOptions> = { mode: 'key-press', channels: [4], propagate: false };
    this.launchControlXl.buttons.up.setCallback(() => this.sessionRing.up(), buttonOptions);
    this.launchControlXl.buttons.down.setCallback(() => this.sessionRing.down(), buttonOptions);
    this.launchControlXl.buttons.left.setCallback(() => this.sessionRing.left(), buttonOptions);
    this.launchControlXl.buttons.right.setCallback(() => this.sessionRing.right(), buttonOptions);

    this.launchControlXl.buttons.recordArm.setCallback(() => this.song.reset(), buttonOptions);
    this.launchControlXl.buttonColor(this.launchControlXl.buttons.recordArm.code, Color.darkAmber, 4);
    // this.launchControlXl.buttons.solo.setCallback(() =>  this.toggleSessionRing()  , buttonOptions);
    // this.launchControlXl.buttonColor(this.launchControlXl.buttons.solo.code, Color.darkAmber, 4);

    this.launchControlXl.buttons.pad9.setCallback(() => this.osc.sendMessage('/live/api/reload'), buttonOptions);

    return this;
  }

  private disableSessionRing(): this {
    this.isSessionRingEnabled = false;
    this.launchControlXl.resetButtons([
      ...this.launchControlXl.buttons.pads,
      ...this.launchControlXl.buttons.directions,
      this.launchControlXl.buttons.recordArm,
      this.launchControlXl.buttons.solo
    ], 4);
    return this;
  }

  // private toggleSessionRing(): this {
  //   this.launchControlXl.buttonColor(this.launchControlXl.buttons.solo.code, Color.darkAmber, 4);
  //   return this.isSessionRingEnabled ? this.disableSessionRing() : this.enableSessionRing().updateSessionRing();
  // }

  private updateSessionRing(): this {
    if (!this.isSessionRingEnabled) return this;
    const [clips] = this.sessionRing.getClipsFromSong(this.song).lines;
    // console.log('clips');
    console.log(clips);
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const button = this.launchControlXl.buttons.firstRowPads[i];
      if (clip && clip.isSet) {
        this.launchControlXl.buttonColor(button.code, clip.isPlaying ? Color.red : Color.green, 4);
        button.setCallback(() => {
          this.song.playClip(clip, !clip.isPlaying);
          this.launchControlXl.buttonColor(button.code, Color.yellow, 4);
        }, { mode: 'key-press', channels: [4], propagate: false });
      } else {
        this.launchControlXl.buttonColor(button.code, Color.off, 4);
        button.resetCallback();
      }
    }
    return this;
  }
}