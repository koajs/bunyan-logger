const Koa = require('koa');
const koaBunyanLogger = require('../');
const supertest = require('supertest');
const assert = require('assert');
const bunyan = require('bunyan');

describe('koaBunyanLogger', () => {
  var app;
  var server;
  var ringBuffer;

  beforeEach(async () => {
    app = new Koa();
    app.on('error', () => {}); // suppress errors

    ringBuffer = new bunyan.RingBuffer({limit: 100});
    ringLogger = bunyan.createLogger({
      name: 'test',
      streams: [{
        type: 'raw',
        stream: ringBuffer,
        level: 'trace'
      }]
    });
  });

  afterEach(async () => {
    if (server) {
      server.close();
    }

    app = null;
    server = null;
  });

  const request = () => {
    if (!server) {
      server = app.listen(0);
    }

    return supertest(server);
  };

  const record = (i) => {
    assert.ok(i >= 0 || i < ringBuffer.records.length);
    return ringBuffer.records[i];
  };

  const helloWorld = (ctx) => {
    ctx.body = 'Hello world';
  };

  const pingResponse = (ctx) => {
    ctx.body = 'ping';
  };

  it('creates a default logger', async () => {
    app.use(koaBunyanLogger());
    app.use(ctx => {
      assert.ok(ctx.log);
      ctx.body = '';
    });

    await request().get('/').expect(200);
  });

  it('can log simple requests', async () => {
    app.use(koaBunyanLogger(ringLogger));

    app.use(ctx => {
      ctx.log.info('Got request');
      ctx.body = 'Hello world';
    });

    await request().get('/').expect(200);

    assert.equal(record(0).msg, 'Got request');
  });

  describe('koaBunyanLogger.requestLogger', () => {
    const REQ_MESSAGE = /  <-- GET \//;
    const RES_MESSAGE = /  --> GET \/ \d+ \d+ms/;

    beforeEach(() => {
      app.use(koaBunyanLogger(ringLogger));
    });

    const checkRequestResponse = status => {
      assert.equal(ringBuffer.records.length, 2);
      assert.ok(record(0).msg.match(REQ_MESSAGE));
      assert.ok(record(1).msg.match(RES_MESSAGE));
      assert.equal(record(1).res.statusCode, status);
    }

    it('logs requests', async () => {
      app.use(koaBunyanLogger.requestLogger());
      app.use(helloWorld);

      await request().get('/').expect(200);

      checkRequestResponse(200);
    });

    it('ignore logs requests', async () => {
      app.use(koaBunyanLogger.requestLogger({ ignorePath: ['/ping'] }));
      app.use(pingResponse);
       await request().get('/ping?t=xxx').expect(200);
       assert.equal(ringBuffer.records.length, 0);
    });

    it('logs 404 errors', async () => {
      app.use(koaBunyanLogger.requestLogger());

      app.use(ctx => {
        ctx.throw(404);
      });

      await request().get('/').expect(404);

      checkRequestResponse(404);
    });

    it('logs 500 errors', async () => {
      app.use(koaBunyanLogger.requestLogger());

      app.use(() => {
        throw new Error('oh no');
      });

      await request().get('/').expect(500);

      checkRequestResponse(500);
    });

    it('allows adding fields to request/response log data', async () => {
      app.use(koaBunyanLogger.requestLogger({
        updateLogFields: fields => {
          fields.foo = 'bar';
          fields.baz1 = 'fizz';
          fields.baz2 = 'fuzz';
        },

        updateRequestLogFields: fields => {
          fields.addedToReq = 'hello';
          delete fields.baz1;
        },

        updateResponseLogFields: (fields, err) => {
          fields.addedToRes = 'world';
          delete fields.baz2;

          if (err) {
            fields.error_handled = true;
          }
        }
      }));

      app.use(() => {
        throw new Error('uh oh');
      });

      await request().get('/').expect(500);

      checkRequestResponse(500);

      assert.equal(record(0).foo, 'bar');
      assert.equal(record(1).foo, 'bar');

      assert.equal(typeof record(0).baz1, 'undefined');
      assert.equal(typeof record(1).baz2, 'undefined');
      assert.equal(record(0).baz2, 'fuzz');
      assert.equal(record(1).baz1, 'fizz');

      assert.equal(record(1).error_handled, true);
    });

    it('logs errors in update methods and then continues', async () => {
      app.use(koaBunyanLogger.requestLogger({
        updateResponseLogFields: fields => {
          throw new Error('clumsy');
        }
      }));

      app.use(helloWorld);

      await request().get('/').expect(200);

      assert.equal(ringBuffer.records.length, 3);
      assert.ok(record(0).msg.match(REQ_MESSAGE));

      // error processing logging
      assert.ok(record(1).err);
      assert.ok(record(1).msg.match('clumsy'));

      assert.ok(record(2).msg.match(RES_MESSAGE));
      assert.equal(record(2).res.statusCode, 200);
    });
  });

  describe('koaBunyanLogger.requestIdContext', () => {
    it('throws an exception if this.log is not available', async () => {
      app.use(koaBunyanLogger.requestIdContext());
      await request().get('/').expect(500);
    });

    it('adds req_id from X-Request-Header to log messages', async () => {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.requestIdContext());

      app.use(ctx => {
        ctx.log.info('hello world');
        ctx.body = "";
      });

      await request().get('/').set({'X-Request-Id': '1234'}).expect(200);

      assert.equal(ringBuffer.records[0].req_id, '1234');
    });

    it('adds generated req_id to log messages if there is no header', async () => {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.requestIdContext());

      app.use(ctx => {
        ctx.log.info('hello world');
        ctx.body = "";
      });

      await request().get('/').expect(200);

      assert.equal(ringBuffer.records[0].req_id.length, 36);
    });
  });

  describe('koaBunyanLogger.timeContext', () => {
    it('records the time between time() and timeEnd()', async () => {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext());

      app.use(ctx => {
        ctx.time('foo');
        ctx.timeEnd('foo');
        ctx.body = '';
      });

      await request().get('/').expect(200);
      assert.equal(ringBuffer.records[0].label, 'foo');
      assert.equal(typeof ringBuffer.records[0].duration, 'number');
    });

    it('handles nested calls to time()', async () => {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext());

      app.use(ctx => {
        ctx.time('foo');
        ctx.time('bar');
        ctx.timeEnd('bar');
        ctx.timeEnd('foo');
        ctx.body = '';
      });

      await request().get('/').expect(200);
      assert.equal(ringBuffer.records[0].label, 'bar');
      assert.equal(typeof ringBuffer.records[0].duration, 'number');
      assert.equal(ringBuffer.records[1].label, 'foo');
      assert.equal(typeof ringBuffer.records[1].duration, 'number');
    });

    it('warns if time() is called twice for the same label', async () => {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext());

      app.use(ctx => {
        ctx.time('x');
        ctx.time('x');
        ctx.body = '';
      });

      await request().get('/').expect(200);
      assert.equal(ringBuffer.records[0].level, bunyan.WARN);
      assert.ok(ringBuffer.records[0].msg.match(/called for previously/));
    });

    it('warns if timeEnd(label) is called without time(label)', async () => {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext());

      app.use(ctx => {
        ctx.timeEnd('blam');
        ctx.body = '';
      });

      await request().get('/').expect(200);
      assert.equal(ringBuffer.records[0].level, bunyan.WARN);
      assert.ok(ringBuffer.records[0].msg.match(/called without/));
    });

    it('allows returning custom log fields', async () => {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext({
        updateLogFields: fields => {
          return {
            request_trace: {
              name: fields.label,
              time: fields.duration
            }
          };
        }
      }));

      app.use(ctx => {
        ctx.time('foo');
        ctx.timeEnd('foo');
        ctx.body = '';
      });

      await request().get('/').expect(200);
      assert.equal(ringBuffer.records[0].request_trace.name, 'foo');
      assert.equal(typeof ringBuffer.records[0].request_trace.time, 'number');
    });
  });
});
