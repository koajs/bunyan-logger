var koa = require('koa');
var koaBunyanLogger = require('../');

var app = koa();

app.use(koaBunyanLogger());
app.use(koaBunyanLogger.requestLogger());

var userByToken = {
  'token123': {id: 1, name: 'alice'},
  'token345': {id: 2, name: 'bob'}
};

app.use(function *(next) {
  var token = this.query.token;

  if (!token) {
    this.throw(403, 'expected token\r\n');
  }

  this.log.trace('looking up user with token "%s"', token);
  this.user = userByToken[token];

  if (!this.user) {
    this.throw(403, 'invalid user token\r\n');
  }

  yield next;
});

// All log messages from downstream middleware
// will now have 'authorized_user' added to the log fields
app.use(function *(next) {
  this.log = this.log.child({
    authorized_user: this.user.id
  });

  yield next;
});

app.use(function *() {
  this.log.info('doing stuff');

  this.body = "OK\r\n";
});

app.listen(8000);

