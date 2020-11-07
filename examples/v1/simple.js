const koa = require('koa')
const koaBunyanLogger = require('../..')

const app = koa()

app.use(koaBunyanLogger())

app.use(function * () {
  this.log.info('Got a request from %s for %s', this.request.ip, this.path)
  this.body = 'Hello world\r\n'
})

app.listen(8000)
