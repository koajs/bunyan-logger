'use strict';

var bunyan = require('bunyan');
var uuid = require('node-uuid');
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
 *  - logger: bunyan logger instance, or an object with properties
 *            that will be passed to bunyan.createLogger. If not
 *            specified, a default logger will be used.
 */
module.exports = function (logger) {
  logger = createOrUseLogger(logger);

  return function *(next) {
    this.log = logger;

    yield *next; // jshint ignore:line
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

  return function * (next) {
    var reqId = this.request.get(header) || uuid.v4();

    this[ctxProp] = reqId;
    this.request[requestProp] = reqId;

    var logFields = {};
    logFields[logField] = reqId;

    if (!this.log) {
      throw new Error('must use(koaBunyanLogger()) before this middleware');
    }

    this.log = this.log.child(logFields);

    yield *next; // jshint ignore:line
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
 *    - formatReponseMessage: function (responseData)
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

  return function *(next) {
    var url = this.url;

    var requestData = {
      req: this.request
    };

    requestData = updateFields(this, opts.updateLogFields, requestData);
    requestData = updateFields(this, opts.updateRequestLogFields, requestData);

    this.log.info(requestData, formatRequestMessage.call(this, requestData));

    var startTime = new Date().getTime();
    var err;

    var onResponseFinished = function () {
      var responseData = {
        req: this.request,
        res: this.response
      };

      if (err) {
        responseData.err = err;
      }

      responseData[durationField] = new Date().getTime() - startTime;

      responseData = updateFields(this, opts.updateLogFields, responseData);
      responseData = updateFields(this, opts.updateResponseLogFields,
                                  responseData, err);

      var status = this.status;

      if (err) {
        responseData.err = err;
      }

      var level = levelFn.call(this, this.status, err);

      this.log[level](responseData,
                      formatResponseMessage.call(this, responseData));

      // Remove log object to mitigate accidental leaks
      delete this.log;
    };

    try {
      yield *next; // jshint ignore:line
    } catch (e) {
      err = e;
    } finally {
      // Handle response logging and cleanup when request is finished
      // This ensures that the default error handler is done
      onFinished(this.response.res, onResponseFinished.bind(this));
    }

    if (err) {
      throw err; // rethrow
    }
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
