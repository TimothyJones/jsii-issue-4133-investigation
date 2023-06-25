import * as fs from 'fs';

const INPUT_BUFFER_SIZE = 2; // 1MiB (aka: 1024 * 1024), not related to max line length

export class SyncStdio {
  private bufferedData = Buffer.alloc(0);

  private readonly stderr: number;

  private readonly stdin: number;

  private readonly stdout: number;

  // A buffer that will be used for all reading operations.
  private readonly readBuffer = Buffer.alloc(INPUT_BUFFER_SIZE);

  public constructor({ errorFD, readFD, writeFD }: SyncStdioOptions) {
    this.stderr = errorFD;
    this.stdin = readFD;
    this.stdout = writeFD;
  }

  public writeErrorLine(line: string): void {
    this.writeBuffer(Buffer.from(`${line}\n`), this.stderr);
  }

  public writeLine(line: string): void {
    this.writeBuffer(Buffer.from(`${line}\n`), this.stdout);
  }

  public async readLineAsync(): Promise<string | undefined> {
    let count = 0;
    while (!this.bufferedData.includes('\n', 0, 'utf-8')) {
      count += 1;
      console.log('Old readbuffer: ', this.readBuffer.toString());
      // eslint-disable-next-line no-await-in-loop
      const newData = await new Promise<Buffer>((resolve, reject) => {
        fs.read(
          this.stdin,
          this.readBuffer,
          0,
          this.readBuffer.length,
          null,
          (err, bytesRead) => {
            console.log('READ Callback ', err, bytesRead);
            if (err != null) {
              reject(err);
              return;
            }
            resolve(this.readBuffer.subarray(0, bytesRead));
          }
        );
      });
      console.log('PARTIAL ASYNC: ', newData.toString());
      this.bufferedData = Buffer.concat([this.bufferedData, newData]);
    }

    const newLinePos = this.bufferedData.indexOf('\n', 0, 'utf-8');
    const next = this.bufferedData.subarray(0, newLinePos).toString('utf-8');
    this.bufferedData = this.bufferedData.subarray(newLinePos + 1);

    console.log(`Read ASYNC: "${next}" in ${count} iterations`);

    return next;
  }

  public readLine(): string | undefined {
    while (!this.bufferedData.includes('\n', 0, 'utf-8')) {
      console.log('Old SYNC readbuffer: ', this.readBuffer.toString());
      const read = fs.readSync(
        this.stdin,
        this.readBuffer,
        0,
        this.readBuffer.length,
        null
      );

      if (read === 0) {
        return undefined;
      }

      const newData = this.readBuffer.slice(0, read);
      console.log('PARTIAL SYNC: ', newData.toString());
      this.bufferedData = Buffer.concat([this.bufferedData, newData]);
    }

    const newLinePos = this.bufferedData.indexOf('\n', 0, 'utf-8');
    const next = this.bufferedData.subarray(0, newLinePos).toString('utf-8');
    this.bufferedData = this.bufferedData.subarray(newLinePos + 1);

    console.log(`Read SYNC: ${next}`);

    return next;
  }

  // eslint-disable-next-line class-methods-use-this
  private writeBuffer(buffer: Buffer, fd: number): void {
    let offset = 0;
    while (offset < buffer.length) {
      try {
        offset += fs.writeSync(fd, buffer, offset);
      } catch (e: unknown) {
        const err = e as Error & { code: string };

        // We might get EAGAIN if the file descriptor was not opened for
        // blocking (O_SYNC) writes. In such cases, we'll keep trying until it
        // succeeds. This shouldn't take long as the process on the other side
        // is expected to actively wait for data on those pipes.
        if ('code' in err && err.code !== 'EAGAIN') {
          throw e;
        }
      }
    }
  }
}

export interface SyncStdioOptions {
  /**
   * The file descriptor from which data is to be read. This MUST be opened for
   * blocking (O_SYNC) reading.
   */
  readonly readFD: number;

  /**
   * The file descriptor to which data is to be written. This SHOULD be opened
   * for blocking (O_SYNC) writing.
   */
  readonly writeFD: number;

  /**
   * The file descriptor to which errors data is to be written. This SHOULD be
   * opened for blocking (O_SYNC) writing.
   */
  readonly errorFD: number;
}
