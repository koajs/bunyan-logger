const koa = require('koa')
const koaBunyanLogger = require('../..')

const app = koa()

app.use(koaBunyanLogger())
app.use(koaBunyanLogger.requestLogger())

const userByToken = {
  token123: { id: 1, name: 'alice' },
  token345: { id: 2, name: 'bob' }
}

app.use(async function (ctx, next) {
  const token = ctx.query.token

  if (!token) {
    ctx.throw(403, 'expected token\r\n')
  }

  ctx.log.trace('looking up user with token "%s"', token)
  ctx.user = userByToken[token]

  if (!ctx.user) {
    ctx.throw(403, 'invalid user token\r\n')
  }

  await next
})

// All log messages from downstream middleware
// will now have 'authorized_user' added to the log fields
app.use(async function (ctx, next) {
  ctx.log = ctx.log.child({
    authorized_user: ctx.user.id
  })

  await next
})

app.use(function (ctx, next) {
  ctx.log.info('doing stuff')

  ctx.body = 'OK\r\n'
})

app.listen(8000)
