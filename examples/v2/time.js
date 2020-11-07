const koa = require('koa')
const koaBunyanLogger = require('../..')

const app = koa()

app.use(koaBunyanLogger({ level: 'trace' }))
app.use(koaBunyanLogger.timeContext())

function wait (ms) {
  return function (cb) {
    setTimeout(function () {
      cb(null)
    }, ms)
  }
}

app.use(async function (ctx, next) {
  ctx.time('sitting around')

  ctx.time('short wait')
  await wait(100)
  ctx.timeEnd('short wait')

  ctx.time('longer wait')
  await wait(500)
  ctx.timeEnd('longer wait')

  ctx.timeEnd('sitting around')

  ctx.body = 'Hello world\r\n'
})

app.listen(8000)
