
2.0.0 / 2017-04-14
==================

Thanks to [ifraixedes](https://github.com/ifraixedes) for
updating and refactoring to work with koa 2.x

  * Merge pull request #16 from venables/update-uuid-2x
  * Merge pull request #15 from marcbachmann/update-uuid
  * chore(package): update uuid to version 3.0.0
  * Include stdSerializers in custom bunyan logger example
  * Merge pull request #12 from umayr/2x
  * Update examples
  * Merge pull request #11 from kevinawoo/patch-1
  * fixed example typo.
  * Merge pull request #10 from alxarch/patch-1
  * Fix wrong method name

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
