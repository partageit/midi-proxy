import EventEmitter from 'events';
import { ArgumentType, Client, Message, Server } from 'node-osc';

export class AbletonOsc extends EventEmitter {
  private excludedAdressesFromLogs = ['/live/song/get/beat'];

  private config = {
    bindAddress: '127.0.0.1',
    remotePort: 11000,
    localPort: 11001
  }

  private client: Client;
  private server: Server;

  public start(): this {
    this.startServerListening();
    this.client = new Client(this.config.bindAddress, this.config.remotePort);
    return this;
  }

  public sendMessage(address: string, ...params: ArgumentType[]): void {
    const message = new Message(address, ...params);
    this.client.send(message);
  }

  private startServerListening(): this {
    this.server = new Server(this.config.localPort, this.config.bindAddress, () => {
      console.log(`OSC Server is listening: ${this.config.bindAddress}:${this.config.localPort}`);
    });

    this.server.on('bundle',  (bundle) => {
      bundle.elements.forEach((element, i) => {
        console.log(`Timestamp: ${bundle.timetag[i]}`);
        console.log(`Message: ${element}`);
      });
    });

    this.server.on('message',  (message) => {
      const [address, ...parameters] = message;
      if (!this.excludedAdressesFromLogs.includes(address)) console.log(`Received message: ${message}`);
      this.emit('message', address, parameters);
      this.emit(address, parameters);
      // console.log(`Message:`, message);
    });

    this.server.on('error',  (error) => {
      console.error(`Received error: ${error}`);
    });

    return this;
  }

  /** reload ableton osc on ableton side, mainly to reload it after python code changes */
  public reset(): this {
    this.sendMessage('/live/api/reload')
    return this;
  }
}

/*
// https://github.com/ideoforms/AbletonOSC
*/