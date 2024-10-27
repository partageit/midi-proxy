import { Input as MidiInput, Message as MidiMessage, Output as MidiOutput, WebMidi } from "webmidi";
import { TypedEventEmitter } from "../typed-event-emitter";

type LaunchControlXlEventTypes = {
  'template-changed': [template: Template]
};

export class LaunchControlXl extends TypedEventEmitter<LaunchControlXlEventTypes> {
  private midiIn: MidiInput;
  private midiOut: MidiOutput;
  private midiProxyOut: MidiOutput;

  public template = new Template;

  public colors = Object.values(Color).filter(v => !isNaN(Number(v))) as number[];
  public buttons = new Buttons;

  public constructor(public midiIdentifier = 'Launch Control XL', public proxyIdentifier = 'Launch Control XL proxy') {
    super();
  }

  public initialize(): this {
    this.midiIn = WebMidi.inputs.find(device => device.name === this.midiIdentifier);
    if (!this.midiIn) throw Error(`launch control input not found: ${this.midiIdentifier}`);

    this.midiOut = WebMidi.outputs.find(device => device.name === this.midiIdentifier);
    if (!this.midiOut) throw Error(`launch control output not found: ${this.midiIdentifier}`);

    this.midiProxyOut = WebMidi.outputs.find(device => device.name === this.proxyIdentifier);
    if (!this.midiProxyOut) throw Error(`midi proxy output not found: ${this.proxyIdentifier}`);

    this.midiIn.addListener(
      'midimessage',
      (event) => {
        const code = event.message.data[1];
        // const excludedMessages = [78, 80, 81, 82, 83, 84];
        // if (excludedMessages.includes(discr)) return;

        if (event.message.type === 'sysex') {
          if (this.template.isTemplateChangeSysexData(event.message.data)) {
            this.template.fromSysexData(event.message.data);
            this.emit('template-changed', this.template);
          }
        }

        const button = this.buttons.getByCode(code, event.message.type as 'noteon' | 'noteoff' | 'controlchange');
        const send = button ? button.performCallback(event.message) : true;
        if (send) {
          this.midiProxyOut.send(event.message);

          console.log(`${event.message.channel} ${event.message.type} ${event.message.command} ${code}`);
          console.log(event.message.data);
          // console.log(event.message);
          // console.log('channel', event.message.channel);
          // console.log(event.message.command);
          // console.log(discr);
        }
      },
      { channels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] }
    );

    return this;
  }

  public goToTemplate(template: Template): this {
    console.log('goToTemplate');
    this.template.fromIndex(template.index);
    console.log('goToTemplate', this.template);
    this.sendMidiMessage(template.sysexData, null, true);
    return this;
  }

  public test(): this {
    let currentOnIndex = 0;
    let previousOnIndex = this.buttons.pads.length - 1;
    let currentColor = 1;
    const channel = 4;
    // console.log(this.buttons.pads);
    setInterval(() => {
      if (currentOnIndex >= this.buttons.pads.length) currentOnIndex = 0;
      if (previousOnIndex >= this.buttons.pads.length) previousOnIndex = 0;
      if (currentColor >= this.colors.length) currentColor = 1;

      this.setButtonColor(this.buttons.pads[currentOnIndex++], this.colors[currentColor++], channel);
      this.setButtonColor(this.buttons.pads[previousOnIndex++], Color.off, channel);
    }, 2000);

    return this;
  }

  public setButtonColor(button: Button, color: number, channel: number): this {
    const command = button.midiType === 'controlchange' ? 179 : 147;
    this.sendMidiMessage([command, button.code, color], channel);
    return this;
  }

  public sendMidiMessage(data: number[], channel?: number, isSystemMessage = false): this {
    const message = new MidiMessage(Uint8Array.from(data));
    if (channel) message.channel = channel;
    message.isSystemMessage = isSystemMessage;
    this.midiOut.send(message);
    return this;
  }

  public resetButtons(buttons: Button[], channel: number, color: Color = Color.off): this {
    for (const button of buttons) {
      this.setButtonColor(button, color, channel);
      button.resetCallback();
    }
    return this;
  }
}

export enum Color {
  off = 12,
  darkRed = 13,
  red = 15,
  darkAmber = 29,
  amber = 63,
  yellow = 62,
  darkGreen = 28,
  green = 60
}

type ButtonKind = 'pad' | 'direction' | 'function' | 'rotary' | 'fader';
type ButtonCallbackMode = 'all' | 'key-down' | 'key-up';
export type ButtonCallbackParams = {
  /** Full midi message */
  midiMessage: MidiMessage,
  // mode: ButtonCallbackMode,
  /** midi code i.e. message.data[1] */
  code: number,
  /** midi value i.e. message.data[2] */
  value: number,
  eventType: ButtonEventType,
  /** for key-up event only */
  specialEventType: ButtonSpecialEventType
}
export type ButtonCallback = (params: ButtonCallbackParams) => void;
export type ButtonCallbackOptions = {
  mode: ButtonCallbackMode,
  channels: number[],
  propagate: boolean
};
type ButtonEventType = 'unknown' | 'key-down' | 'key-up';
type ButtonSpecialEventType = 'unknown' | 'long-press';

export class Button {
  private callback: ButtonCallback;
  private callbackOptions: ButtonCallbackOptions;
  private defaultCallbackOptions: ButtonCallbackOptions = { mode: 'all', channels: [], propagate: true };

  public constructor(
    public kind: ButtonKind,
    public code: number,
    public midiType: 'note' | 'controlchange' | 'any' = 'any'
  ) {
    this.resetCallback();
  }

  public resetCallback(): this {
    this.callbackOptions = Object.assign({}, this.defaultCallbackOptions);
    this.setCallback(() => { });
    return this;
  }

  public setCallback(callback: ButtonCallback, options: Partial<ButtonCallbackOptions> = {}): this {
    this.callbackOptions = Object.assign({}, this.defaultCallbackOptions, options);
    this.callback = callback;
    return this;
  }

  public performCallback(midiMessage: MidiMessage): boolean {
    const buttonPressHandler = new ButtonPressHandler();
    const eventInfos = buttonPressHandler.getInfos(midiMessage);
    const params: ButtonCallbackParams = {
      midiMessage,
      code: midiMessage.data[1],
      value: midiMessage.data[2],
      eventType: eventInfos.eventType,
      specialEventType: eventInfos.specialEventType
    }

    if (this.callbackOptions.mode === 'key-down') {
      if (params.eventType === 'key-up') return;
    }
    if (this.callbackOptions.mode === 'key-up') {
      if (params.eventType === 'key-down') return;
    }
    if (this.callbackOptions.channels.length) {
      if (!this.callbackOptions.channels.includes(midiMessage.channel)) return;
    }
    this.callback(params);
    return this.callbackOptions.propagate;
  }
}

class ButtonPressHandler {
  public static cache: { [identifier: string]: { date: Date, eventType: ButtonEventType } } = {};

  private makeIdentifier(midiMessage: MidiMessage): string {
    const type = ['noteon', 'noteoff'].includes(midiMessage.type) ? 'note' : midiMessage.type;
    return `${midiMessage.channel}/${midiMessage.data[1]}/${type}`;
  }

  private register(identifier: string, eventType: ButtonEventType): this {
    ButtonPressHandler.cache[identifier] = { date: new Date, eventType };
    return this;
  }

  private getEventType(midiMessage: MidiMessage): ButtonEventType {
    if (midiMessage.type === 'noteoff') return 'key-up';
    if (midiMessage.type === 'noteon') return 'key-down';
    const value = midiMessage.data[2];
    if (midiMessage.type === 'controlchange' && value === 0) return 'key-up';
    if (midiMessage.type === 'controlchange' && value === 127) return 'key-down';
    return 'unknown';
  }

  public getInfos(midiMessage: MidiMessage): { eventType: ButtonEventType, specialEventType: ButtonSpecialEventType } {
    const result: ReturnType<ButtonPressHandler['getInfos']> = { eventType: this.getEventType(midiMessage), specialEventType: 'unknown' };
    const identifier = this.makeIdentifier(midiMessage);
    if (result.eventType === 'key-down') this.register(identifier, result.eventType);
    if (result.eventType !== 'key-up') return result;

    const lastAction = ButtonPressHandler.cache[identifier];
    if (!lastAction) return result;

    if (lastAction.eventType === 'key-down' && Date.now() - lastAction.date.getTime() > 1000) {
      result.specialEventType = 'long-press';
    }

    return result;
  }
}

class Buttons {
  public pad1 = new Button('pad', 41);
  public pad2 = new Button('pad', 42);
  public pad3 = new Button('pad', 43);
  public pad4 = new Button('pad', 44);
  public pad5 = new Button('pad', 57);
  public pad6 = new Button('pad', 58);
  public pad7 = new Button('pad', 59);
  public pad8 = new Button('pad', 60);
  public pad9 = new Button('pad', 73);
  public pad10 = new Button('pad', 74);
  public pad11 = new Button('pad', 75);
  public pad12 = new Button('pad', 76);
  public pad13 = new Button('pad', 89);
  public pad14 = new Button('pad', 90);
  public pad15 = new Button('pad', 91);
  public pad16 = new Button('pad', 92);
  public up = new Button('direction', 104, 'controlchange');
  public down = new Button('direction', 105, 'controlchange');
  public left = new Button('direction', 106, 'controlchange');
  public right = new Button('direction', 107, 'controlchange');
  public device = new Button('function', 105, 'note');
  public mute = new Button('function', 106, 'note');
  public solo = new Button('function', 107, 'note');
  public recordArm = new Button('function', 108, 'note');
  public rotary1 = new Button('rotary', 13);
  public rotary2 = new Button('rotary', 14);
  public rotary3 = new Button('rotary', 15);
  public rotary4 = new Button('rotary', 16);
  public rotary5 = new Button('rotary', 17);
  public rotary6 = new Button('rotary', 18);
  public rotary7 = new Button('rotary', 19);
  public rotary8 = new Button('rotary', 20);
  public rotary9 = new Button('rotary', 29);
  public rotary10 = new Button('rotary', 30);
  public rotary11 = new Button('rotary', 31);
  public rotary12 = new Button('rotary', 32);
  public rotary13 = new Button('rotary', 33);
  public rotary14 = new Button('rotary', 34);
  public rotary15 = new Button('rotary', 35);
  public rotary16 = new Button('rotary', 36);
  public rotary17 = new Button('rotary', 49);
  public rotary18 = new Button('rotary', 50);
  public rotary19 = new Button('rotary', 51);
  public rotary20 = new Button('rotary', 52);
  public rotary21 = new Button('rotary', 53);
  public rotary22 = new Button('rotary', 54);
  public rotary23 = new Button('rotary', 55);
  public rotary24 = new Button('rotary', 56);
  public fader1 = new Button('fader', 77);
  public fader2 = new Button('fader', 78);
  public fader3 = new Button('fader', 79);
  public fader4 = new Button('fader', 80);
  public fader5 = new Button('fader', 81);
  public fader6 = new Button('fader', 82);
  public fader7 = new Button('fader', 83);
  public fader8 = new Button('fader', 84);

  public pads = this.getList().filter(button => button.kind === 'pad');
  public directions = this.getList().filter(button => button.kind === 'direction');
  public functions = this.getList().filter(button => button.kind === 'function');
  public firstRowPads = this.pads.slice(0, 8);
  public secondRowPads = this.pads.slice(8, 16);
  public rotaries = this.getList().filter(button => button.kind === 'rotary');
  public firstRowRotaries = this.rotaries.slice(0, 8);
  public secondRowRotaries = this.rotaries.slice(8, 16);
  public thirdRowRotaries = this.rotaries.slice(16, 24);
  public faders = this.getList().filter(button => button.kind === 'fader');

  public getList(): Button[] {
    return Object.values(this).filter(value => value instanceof Button);
  }

  public getByCode(code: number, midiType: 'noteon' | 'noteoff' | 'controlchange'): Button {
    const midiTypeMatch = (button: Button) => {
      if (button.midiType === 'any') return true;
      if (button.midiType === 'controlchange' && midiType === 'controlchange') return true;
      if (button.midiType === 'note' && midiType.startsWith('note')) return true;
      return false;
    };
    return this.getList().find(button => button.code === code && midiTypeMatch(button));
  }
}

export class Template {
  private sysex = [240, 0, 32, 41, 2, 17, 119, 0, 247];

  public get sysexData(): number[] {
    const sysex = Object.assign([], this.sysex);
    sysex[7] = this.index;
    return sysex;
  }

  /** index is from 0 to 15 */
  public get index(): number { return (this.bank - 1) + (this.mode === 'factory' ? 8 : 0); };

  public constructor(
    public mode: 'user' | 'factory' = 'factory',
    /** mode is from 1 to 8 */
    public bank = 1
  ) { }

  public fromIndex(index: number): this {
    this.bank = index;
    this.mode = index < 8 ? 'user' : 'factory';
    return this;
  }

  public fromSysexData(data: number[]): this {
    this.fromIndex(data.at(-2));
    return this;
  }

  public isTemplateChangeSysexData(data: number[]): boolean {
    return data.length === 9 && data.slice(0, 7).join(',') === this.sysex.slice(0, 7).join(',') && data[8] === this.sysex[8];
  }
}
