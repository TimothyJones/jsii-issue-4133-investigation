import { SyncStdio } from './sync-stdio';

/**
 * An IO provider for jsii API exchanges.
 */
export interface IInputOutput {
  /**
   * Writes a message to the jsii API host.
   * @param line - the message to be sent.
   */
  write(line: string): void;

  /**
   * Wait for a message from the jsii API host, then return it.
   *
   * @returns the received message, or `undefined` if the API host has no more
   *          requests to send.
   */
  readSync(): string | undefined;

  /**
   * Wait asynchronously for a message from the jsii API host, then return it.
   *
   * @returns the received message, or `undefined` if the API host has no more
   *          requests to send.
   */
  readAsync(): Promise<string | undefined>;
}

export class InputOutput implements IInputOutput {
  public debug = false;

  public constructor(private readonly stdio: SyncStdio) {}

  public write(obj: string): void {
    const output = JSON.stringify(obj);
    this.stdio.writeLine(output);

    if (this.debug) {
      this.stdio.writeErrorLine(`< ${output}`);
    }
  }

  public async readAsync(): Promise<string | undefined> {
    let reqLine = await this.stdio.readLineAsync();
    if (reqLine === undefined) {
      return undefined;
    }

    // skip recorded responses
    if (reqLine.startsWith('< ')) {
      return this.readAsync();
    }

    // strip "> " from recorded requests
    if (reqLine.startsWith('> ')) {
      reqLine = reqLine.slice(2);
    }

    const input = reqLine;

    if (this.debug) {
      this.stdio.writeErrorLine(`> ${JSON.stringify(input)}`);
    }
    return input;
  }

  public readSync(): string | undefined {
    let reqLine = this.stdio.readLine();
    if (!reqLine) {
      return undefined;
    }

    // skip recorded responses
    if (reqLine.startsWith('< ')) {
      return this.readSync();
    }

    // strip "> " from recorded requests
    if (reqLine.startsWith('> ')) {
      reqLine = reqLine.slice(2);
    }

    const input = reqLine;

    if (this.debug) {
      this.stdio.writeErrorLine(`> ${JSON.stringify(input)}`);
    }

    return input;
  }
}
