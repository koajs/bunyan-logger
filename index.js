'use strict';

var bunyan = require('bunyan');
var uuid = require('uuid');
var util = require('util');
var onFinished = require('on-finished');

/*
 * If logger is a bunyan logger instance, return it;
 * otherwise, create a new logger with some reasonable defaults.
 */
function createOrUseLogger(logger) {
  if (!logger || !logger.info || !logger.child) {
    var loggerOpts = logger || {};
    loggerOpts.name = loggerOpts.name || 'koa';
    loggerOpts.serializers = loggerOpts.serializers || bunyan.stdSerializers;

    logger = bunyan.createLogger(loggerOpts);
  }

  return logger;
}

/*
 * Koa middleware that adds this.log property to the koa context
 * containing a bunyan logger instance.
 *
 * Parameters:
 *  - loggerInstance: bunyan logger instance, or an object with properties
 *                    that will be passed to bunyan.createLogger. If not
 *                    specified, a default logger will be used.
 */
module.exports = function (loggerInstance) {
  loggerInstance = createOrUseLogger(loggerInstance);

  return function logger(ctx, next) {
    ctx.log = loggerInstance;

    return next();
  };
};

/*
 * Koa middleware that gets a unique request id from a header or
 * generates a new one, and adds the requestId to all messages logged
 * using this.log in downstream middleware and handlers.
 *
 * Must use(koaBunyanLogger()) before using this middleware.
 *
 * Parameters:
 *  - opts: object with optional properties:
 *    - header: name of header to get request id from (default X-Request-Id)
 *    - prop: property to store on 'this' context (default 'reqId')
 *    - requestProp: property to store on 'this.request' (default 'reqId')
 *    - field: log field name for bunyan (default 'req_id')
 */
module.exports.requestIdContext = function (opts) {
  opts = opts || {};

  var header = opts.header || 'X-Request-Id';
  var ctxProp = opts.prop || 'reqId';
  var requestProp = opts.requestProp || 'reqId';
  var logField = opts.field || 'req_id';
  var fallbackLogger;

  return function requestIdContext(ctx, next) {
    var reqId = ctx.request.get(header) || uuid.v4();

    ctx[ctxProp] = reqId;
    ctx.request[requestProp] = reqId;

    var logFields = {};
    logFields[logField] = reqId;

    if (!ctx.log) {
      throw new Error('must use(koaBunyanLogger()) before this middleware');
    }

    ctx.log = ctx.log.child(logFields);

    return next();
  };
};

/*
 * Logs requests and responses.
 *
 * Must use(koaBunyanLogger()) before using this middleware.
 *
 * Parameters:
 *  - opts: object with optional properties
 *    - durationField: name of duration field
 *    - levelFn: function (status, err)
 *    - updateLogFields: function (data)
 *    - updateRequestLogFields: function (requestData)
 *    - updateResponseLogFields: function (responseData)
 *    - formatRequestMessage: function (requestData)
 *    - formatResponseMessage: function (responseData)
 */
module.exports.requestLogger = function (opts) {
  opts = opts || {};

  var levelFn = opts.levelFn || function (status, err) {
    if (status >= 500) {
      return 'error';
    } else if (status >= 400) {
      return 'warn';
    } else {
      return 'info';
    }
  };

  var durationField = opts.durationField || 'duration';

  var formatRequestMessage = opts.formatRequestMessage || function (data) {
    return util.format('  <-- %s %s',
                       this.request.method, this.request.originalUrl);
  };

  var formatResponseMessage = opts.formatResponseMessage || function (data) {
    return util.format('  --> %s %s %d %sms',
                       this.request.method, this.request.originalUrl,
                       this.status, data[durationField]);
  };

  return function requestLogger(ctx, next) {
    var url = ctx.url;

    var requestData = {
      req: ctx.req
    };

    requestData = updateFields(ctx, opts.updateLogFields, requestData);
    requestData = updateFields(ctx, opts.updateRequestLogFields, requestData);

    ctx.log.info(requestData, formatRequestMessage.call(ctx, requestData));

    var startTime = new Date().getTime();
    var err;

    var onResponseFinished = function () {
      var responseData = {
        req: ctx.req,
        res: ctx.res
      };

      if (err) {
        responseData.err = err;
      }

      responseData[durationField] = new Date().getTime() - startTime;

      responseData = updateFields(ctx, opts.updateLogFields, responseData);
      responseData = updateFields(ctx, opts.updateResponseLogFields,
                                  responseData, err);

      var level = levelFn.call(ctx, ctx.status, err);

      ctx.log[level](responseData,
                      formatResponseMessage.call(ctx, responseData));

      // Remove log object to mitigate accidental leaks
      ctx.log = null;
    };

    return next().catch(e => {
      err = e;
    }).then(() => { // Emulate a finally
      // Handle response logging and cleanup when request is finished
      // This ensures that the default error handler is done
      onFinished(ctx.response.res, onResponseFinished.bind(ctx));

      if (err) {
        throw err; // rethrow
      }
    });
  };
};

function updateFields (ctx, func, data, err) {
  if (!func) return data;

  try {
    if (err) {
      return func.call(ctx, data, err) || data;
    } else {
      return func.call(ctx, data) || data;
    }
  } catch (e) {
    ctx.log.error(e);
    return data;
  }
}

/**
 * Middleware which adds methods this.time(label) and this.timeEnd(label)
 * to koa context.
 *
 * Parameters:
 * - opts: object with the following optional properties
 *   - logLevel: name of log level to use; defaults to 'trace'
 *   - updateLogFields: function which will be called with
 *     arguments (fields) in koa context; can update fields or
 *     return a new object.
 *
 * Must use(koaBunyanLogger()) before using this middleware.
 */
module.exports.timeContext = function (opts) {
  opts = opts || {};

  var logLevel = opts.logLevel || 'trace';
  var updateLogFields = opts.updateLogFields;

  return function timeContext(ctx, next) {
    ctx._timeContextStartTimes = {};

    ctx.time = time;
    ctx.timeEnd = timeEnd;

    return next();
  };

  function time (label) {
    /*jshint validthis:true */
    var startTimes = this._timeContextStartTimes;

    if (startTimes[label]) {
      this.log.warn('time() called for previously used label %s', label);
    }

    startTimes[label] = new Date().getTime();
  }

  function timeEnd (label) {
    /*jshint validthis:true */
    var startTimes = this._timeContextStartTimes;
    var startTime = startTimes[label];

    if (!startTime) { // whoops!
      this.log.warn('timeEnd() called without time() for label %s', label);
      return;
    }

    var duration = new Date().getTime() - startTime;
    var fields = {
      label: label,
      duration: duration,
      msg: label + ': ' + duration + 'ms'
    };

    fields = updateFields(this, updateLogFields, fields);
    this.log[logLevel](fields);

    startTimes[label] = null;
  }
};

// Export our copy of bunyan
module.exports.bunyan = bunyan;
