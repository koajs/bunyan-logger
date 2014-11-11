
1.1.0 / 2014-11-10
==================

 * Add timeContext() utility to enable this.time() and this.timeEnd()

1.0.1 / 2014-11-03
==================

Fix locking down dependencies. Avoid using bunyan-1.2 since dtrace-provider
has problems on OSX. Move mocha to devDependencies.
