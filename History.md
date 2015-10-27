
1.3.0 / 2015-10-26
==================

  * Bump bunyan to 1.5.0, bump test dependencies
  * Export bunyan
  * Fix req object (was incorrectly using koa's request object)

1.2.0 / 2015-01-23
==================

  * Merge pull request #5 from pebble/standard-req-res
  * Pass this.req/this.res instead of this.request/this.response

1.1.1 / 2015-01-13
==================

 * use named middleware for better debugging #4 [mpal9000](https://github.com/mpal9000)

1.1.0 / 2014-11-10
==================

 * Add timeContext() utility to enable this.time() and this.timeEnd()

1.0.1 / 2014-11-03
==================

Fix locking down dependencies. Avoid using bunyan-1.2 since dtrace-provider
has problems on OSX. Move mocha to devDependencies.
