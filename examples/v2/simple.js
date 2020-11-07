const koa = require('koa')
const koaBunyanLogger = require('../..')

const app = koa()

app.use(koaBunyanLogger())

app.use(function (ctx, next) {
  ctx.log.info('Got a request from %s for %s', ctx.request.ip, ctx.path)
  ctx.body = 'Hello world\r\n'
})

app.listen(8000)
