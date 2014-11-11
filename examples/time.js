var koa = require('koa');
var koaBunyanLogger = require('../');

var app = koa();

app.use(koaBunyanLogger({level: 'trace'}));
app.use(koaBunyanLogger.timeContext());

function wait (ms) {
  return function (cb) {
    setTimeout(function () {
      cb(null);
    }, ms);
  };
}

app.use(function *() {
  this.time('sitting around');

  this.time('short wait');
  yield wait(100);
  this.timeEnd('short wait');

  this.time('longer wait');
  yield wait(500);
  this.timeEnd('longer wait');

  this.timeEnd('sitting around');

  this.body = 'Hello world\r\n';
});

app.listen(8000);
