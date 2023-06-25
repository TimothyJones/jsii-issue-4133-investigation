# Investigating ways to unblock the node thread in JSii

This is a loose copy of the relevant internals from
[JSii](https://aws.github.io/jsii/), investigating how to unblock the node
thread which [currently hangs while waiting for the
host](https://github.com/aws/jsii/issues/4133).

It replaces the JSON parsing input and accepts strings on standard input.

You can test it with:

```
npm install
npx tsc && node bin/jsii-runtime
```

It includes the setTimeout ticker used in the [issue repro](https://github.com/TimothyJones/jsii-async-issue), so that you can see when node is running / not running.

## Commands

- Most strings will just be echoed back
- Strings prefixed with `completeCallback` indicate the completion of a synchronous callback
- Strings prefixed with `b` indicate that the start of a **b**locking callback (to be completed with a matching `completeCallback`)
- The exact string `defer` means to start a promise that starts a sync callback after 1 second
