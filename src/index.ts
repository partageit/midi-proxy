import { WebMidi } from 'webmidi';
import { AbletonOsc } from './abletonosc/abletonosc';
import { Song } from './abletonosc/song';
import { LaunchControlXl } from './launch-control-xl/launch-control-xl';
import { MyLaunchControlXl } from './my-launch-control-xl';

function onEnabled() {
  console.log('inputs:');
  WebMidi.inputs.forEach(input => console.log(`input: manufacturer='${input.manufacturer}' name='${input.name}'`));
  console.log('outputs:');
  WebMidi.outputs.forEach(output => console.log(`output: manufacturer='${output.manufacturer}' name='${output.name}'`));


  const launchControlXl = new LaunchControlXl('Launch Control XL', 'midi proxy').initialize();
  const buttons = launchControlXl.buttons;
  for (const button of [buttons.fader2, buttons.fader4, buttons.fader5, buttons.fader6, buttons.fader7, buttons.fader8]) {
    button.setCallback(() => { }, { propagate: false });
  }
  // launchControlXl.test();

  const osc = new AbletonOsc().start();
  // osc.sendMessage('/live/test');

  const song = new Song(osc);
  new MyLaunchControlXl(launchControlXl, osc, song);
}

process
  .on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at Promise', { reason, p });
  })
  .on('uncaughtException', err => {
    console.error('Uncaught Exception thrown', { err });
    process.exit(1);
  });


WebMidi
  .enable({ sysex: true })
  .then(onEnabled)
  .catch(err => console.error(err));

