var koa = require('koa');
var koaBunyanLogger = require('../');

var app = koa();

app.use(koaBunyanLogger());
app.use(koaBunyanLogger.requestIdContext());
app.use(koaBunyanLogger.requestLogger());

app.use(function *() {
  this.body = 'Hello world\r\n';
});

app.listen(8000);

