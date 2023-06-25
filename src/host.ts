import { EventEmitter } from 'events';

import { IInputOutput } from './in-out';

// Rough sketch of possible states
const NOT_WAITING = 'NOT_WAITING' as const;
const WAITING_ASYNC = 'WAITING_ASYNC' as const;
const PROCESSING_ASYNC = 'PROCESSING_ASYNC' as const;
const PROCESSING_SYNC = 'PROCESSING_SYNC' as const;

type ReadState =
  | typeof NOT_WAITING
  | typeof WAITING_ASYNC
  | typeof PROCESSING_ASYNC
  | typeof PROCESSING_SYNC;

/**
 * Returns true if the value is a promise.
 */
export const isPromise = (v: unknown): v is Promise<unknown> =>
  typeof (v as Promise<unknown>)?.then === 'function';

export class KernelHost {
  private readonly eventEmitter = new EventEmitter();

  private state: ReadState = NOT_WAITING;

  public constructor(
    private readonly inout: IInputOutput,
    private readonly opts: {
      debug?: boolean;
      debugTiming?: boolean;
      noStack?: boolean;
    } = {}
  ) {}

  public run(): void {
    if (this.state === NOT_WAITING) {
      this.state = WAITING_ASYNC;
      this.inout.readAsync().then((req) => {
        this.state = PROCESSING_ASYNC;
        if (req === undefined || req === 'exit') {
          console.log('Exiting as req', req);
          this.eventEmitter.emit('exit', 0);
          return; // done
        }

        this.processRequest(req, () => {
          this.state = NOT_WAITING;
          // Schedule the call to run on the next event loop iteration to
          // avoid recursion.
          setImmediate(() => this.run());
        });
      });
    } else {
      console.log(`Not waiting, because state is ${this.state}`);
    }
  }

  public once(event: 'exit', listener: (code: number) => void): void {
    this.eventEmitter.once(event, listener);
  }

  /**
   * Processes the input request `req` and writes the output response to
   * stdout. This method invokes `next` when the request was fully processed.
   * This either happens synchronously or asynchronously depending on the api
   * (e.g. the "end" api will wait for an async promise to be fulfilled before
   * it writes the response)
   *
   * @param req - The input request
   * @param next - A callback to invoke to continue
   * @param sync - If this is 'true', "next" must be called synchronously. This means
   *             that we won't process any async activity (begin/complete). The kernel
   *             doesn't allow any async operations during a sync callback, so this shouldn't
   *             happen, so we assert in this case to find bugs.
   */
  private processRequest<T>(
    req: string,
    next: () => T,
    sync = false
  ): T | undefined {
    if (req === 'completeCallback') {
      throw new Error(
        'Unexpected `callback` result. This request should have been processed by a callback handler'
      );
    }

    // Async actually turns out not to be the problem here
    /* function checkIfAsyncIsAllowed() {
      if (sync) {
        throw new Error(
          'Cannot handle async operations while waiting for a sync callback to return'
        );
      }
    }
    */

    //  This is a loose replacement for the handler
    if (req.startsWith('defer')) {
      setTimeout(() => {
        this.callbackHandler('WOAH');
      }, 1000);
    }
    const response = req.startsWith('b') ? this.callbackHandler(req) : req;

    try {
      this.writeOkay(
        sync ? `Ack SYNC: ${response}` : `asynchronous: ${response}`
      );
    } catch (e: unknown) {
      this.writeError(e as Error);
    }

    // indicate this request was processed (synchronously).
    return next();
  }

  private callbackHandler(callback: string) {
    // write a "callback" response, which is a special response that tells
    // the client that there's synchronous callback it needs to invoke and
    // bring back the result via a "complete" request.

    if (this.state === WAITING_ASYNC) {
      console.error(
        'THIS SHOULD PROBABLY FAIL BECAUSE WE ARE CURRENTLY WAITING ON AN ASYNC READ. The next read will be missing some data'
      );
    }
    const oldState = this.state;
    console.log('beginning sync callback, old state was: ', oldState);
    this.state = PROCESSING_SYNC;
    this.inout.write(`Callback: ${callback}`);

    function completeCallback(this: KernelHost): string | undefined {
      const req = this.inout.readSync();
      if (!req || req === 'exit') {
        throw new Error('Interrupted before callback returned');
      }

      // if this is a completion for the current callback, then we can
      // finally stop this nonsense and return the result.
      if (req.startsWith('completeCallback')) {
        this.state = oldState;
        return `${req} (${callback})`;
      }

      // otherwise, process the request normally, but continue to wait for
      // our callback to be completed. sync=true to enforce that `completeCallback`
      // will be called synchronously and return value will be chained back so we can
      // return it to the callback handler.
      return this.processRequest(
        req,
        completeCallback.bind(this),
        /* sync */ true
      );
    }

    return completeCallback.call(this);
  }

  /**
   * Writes an "ok" result to stdout.
   */
  private writeOkay(result: string) {
    const res = { ok: result };
    this.inout.write(JSON.stringify(res));
  }

  /**
   * Writes an "error" result to stdout.
   */
  private writeError(error: Error) {
    const res = {
      error: error.message,
      name: error.name,
      stack: this.opts.noStack ? undefined : error.stack,
    };
    this.inout.write(JSON.stringify(res, null, 2));
  }
}
