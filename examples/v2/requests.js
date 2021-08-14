const koa = require('koa')
const koaBunyanLogger = require('../..')

const app = koa()

app.use(koaBunyanLogger())
app.use(koaBunyanLogger.requestIdContext())
app.use(koaBunyanLogger.requestLogger())

app.use(function (ctx, next) {
  ctx.body = 'Hello world\r\n'
})

app.listen(8000)
