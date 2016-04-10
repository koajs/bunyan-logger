var Koa = require('koa');
var koaBunyanLogger = require('../');
var supertest = require('supertest');
var assert = require('assert');
var bunyan = require('bunyan');

require('co-mocha');
require('co-supertest');

describe('koaBunyanLogger', function () {
  var app;
  var server;
  var ringBuffer;

  beforeEach(function *() {
    app = new Koa();
    app.on('error', function () {}); // suppress errors

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

  afterEach(function *() {
    if (server) {
      server.close();
    }

    app = null;
    server = null;
  });

  var request = function () {
    if (!server) {
      server = app.listen(0);
    }

    return supertest(server);
  };

  var record = function (i) {
    assert.ok(i >= 0 || i < ringBuffer.records.length);
    return ringBuffer.records[i];
  };

  var helloWorld = function (ctx) {
    ctx.body = 'Hello world';
  };

  it('creates a default logger', function *() {
    app.use(koaBunyanLogger());
    app.use(function (ctx) {
      assert.ok(ctx.log);
      ctx.body = '';
    });

    yield request().get('/').expect(200).end();
  });

  it('can log simple requests', function * () {
    app.use(koaBunyanLogger(ringLogger));

    app.use(function (ctx) {
      ctx.log.info('Got request');
      ctx.body = 'Hello world';
    });

    yield request().get('/').expect(200).end();

    assert.equal(record(0).msg, 'Got request');
  });

  describe('koaBunyanLogger.requestLogger', function () {
    var REQ_MESSAGE = /  <-- GET \//;
    var RES_MESSAGE = /  --> GET \/ \d+ \d+ms/;

    beforeEach(function () {
      app.use(koaBunyanLogger(ringLogger));
    });

    function checkRequestResponse (status) {
      assert.equal(ringBuffer.records.length, 2);
      assert.ok(record(0).msg.match(REQ_MESSAGE));
      assert.ok(record(1).msg.match(RES_MESSAGE));
      assert.equal(record(1).res.statusCode, status);
    }

    it('logs requests', function *() {
      app.use(koaBunyanLogger.requestLogger());
      app.use(helloWorld);

      yield request().get('/').expect(200).end();

      checkRequestResponse(200);
    });

    it('logs 404 errors', function *() {
      app.use(koaBunyanLogger.requestLogger());

      app.use(function (ctx) {
        ctx.throw(404);
      });

      yield request().get('/').expect(404).end();

      checkRequestResponse(404);
    });

    it('logs 500 errors', function *() {
      app.use(koaBunyanLogger.requestLogger());

      app.use(function () {
        throw new Error('oh no');
      });

      yield request().get('/').expect(500).end();

      checkRequestResponse(500);
    });

    it('allows adding fields to request/response log data', function *() {
      app.use(koaBunyanLogger.requestLogger({
        updateLogFields: function (fields) {
          fields.foo = 'bar';
          fields.baz1 = 'fizz';
          fields.baz2 = 'fuzz';
        },

        updateRequestLogFields: function (fields) {
          fields.addedToReq = 'hello';
          delete fields.baz1;
        },

        updateResponseLogFields: function (fields, err) {
          fields.addedToRes = 'world';
          delete fields.baz2;

          if (err) {
            fields.error_handled = true;
          }
        }
      }));

      app.use(function () {
        throw new Error('uh oh');
      });

      yield request().get('/').expect(500).end();

      checkRequestResponse(500);

      assert.equal(record(0).foo, 'bar');
      assert.equal(record(1).foo, 'bar');

      assert.equal(typeof record(0).baz1, 'undefined');
      assert.equal(typeof record(1).baz2, 'undefined');
      assert.equal(record(0).baz2, 'fuzz');
      assert.equal(record(1).baz1, 'fizz');

      assert.equal(record(1).error_handled, true);
    });

    it('logs errors in update methods and then continues', function *() {
      app.use(koaBunyanLogger.requestLogger({
        updateResponseLogFields: function (fields) {
          throw new Error('clumsy');
        }
      }));

      app.use(helloWorld);

      yield request().get('/').expect(200).end();

      assert.equal(ringBuffer.records.length, 3);
      assert.ok(record(0).msg.match(REQ_MESSAGE));

      // error processing logging
      assert.ok(record(1).err);
      assert.ok(record(1).msg.match('clumsy'));

      assert.ok(record(2).msg.match(RES_MESSAGE));
      assert.equal(record(2).res.statusCode, 200);
    });
  });

  describe('koaBunyanLogger.requestIdContext', function () {
    it('throws an exception if this.log is not available', function *() {
      app.use(koaBunyanLogger.requestIdContext());
      yield request().get('/').expect(500).end();
    });

    it('adds req_id from X-Request-Header to log messages', function *() {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.requestIdContext());

      app.use(function (ctx) {
        ctx.log.info('hello world');
        ctx.body = "";
      });

      yield request().get('/').set({'X-Request-Id': '1234'}).expect(200).end();

      assert.equal(ringBuffer.records[0].req_id, '1234');
    });

    it('adds generated req_id to log messages if there is no header', function *() {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.requestIdContext());

      app.use(function (ctx) {
        ctx.log.info('hello world');
        ctx.body = "";
      });

      yield request().get('/').expect(200).end();

      assert.equal(ringBuffer.records[0].req_id.length, 36);
    });
  });

  describe('koaBunyanLogger.timeContext', function () {
    it('records the time between time() and timeEnd()', function *() {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext());

      app.use(function (ctx) {
        ctx.time('foo');
        ctx.timeEnd('foo');
        ctx.body = '';
      });

      yield request().get('/').expect(200).end();
      assert.equal(ringBuffer.records[0].label, 'foo');
      assert.equal(typeof ringBuffer.records[0].duration, 'number');
    });

    it('handles nested calls to time()', function *() {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext());

      app.use(function (ctx) {
        ctx.time('foo');
        ctx.time('bar');
        ctx.timeEnd('bar');
        ctx.timeEnd('foo');
        ctx.body = '';
      });

      yield request().get('/').expect(200).end();
      assert.equal(ringBuffer.records[0].label, 'bar');
      assert.equal(typeof ringBuffer.records[0].duration, 'number');
      assert.equal(ringBuffer.records[1].label, 'foo');
      assert.equal(typeof ringBuffer.records[1].duration, 'number');
    });

    it('warns if time() is called twice for the same label', function *() {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext());

      app.use(function (ctx) {
        ctx.time('x');
        ctx.time('x');
        ctx.body = '';
      });

      yield request().get('/').expect(200).end();
      assert.equal(ringBuffer.records[0].level, bunyan.WARN);
      assert.ok(ringBuffer.records[0].msg.match(/called for previously/));
    });

    it('warns if timeEnd(label) is called without time(label)', function *() {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext());

      app.use(function (ctx) {
        ctx.timeEnd('blam');
        ctx.body = '';
      });

      yield request().get('/').expect(200).end();
      assert.equal(ringBuffer.records[0].level, bunyan.WARN);
      assert.ok(ringBuffer.records[0].msg.match(/called without/));
    });

    it('allows returning custom log fields', function *() {
      app.use(koaBunyanLogger(ringLogger));
      app.use(koaBunyanLogger.timeContext({
        updateLogFields: function (fields) {
          return {
            request_trace: {
              name: fields.label,
              time: fields.duration
            }
          };
        }
      }));

      app.use(function (ctx) {
        ctx.time('foo');
        ctx.timeEnd('foo');
        ctx.body = '';
      });

      yield request().get('/').expect(200).end();
      assert.equal(ringBuffer.records[0].request_trace.name, 'foo');
      assert.equal(typeof ringBuffer.records[0].request_trace.time, 'number');
    });
  });
});
