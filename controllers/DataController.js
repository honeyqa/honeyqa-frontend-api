var modelLocation = '../models/Data'
var async = require('async');
var gk = require('../common');
var mq_pubhandler = require('../handler/mq_pubhandler');
var util = require('util');
var express = require('express');
var redisHandler = require('../handler/crashStat.js');
var bodyParser = require('body-parser');
var authController = require('./AuthController');

/**  Model and route setup **/

var model = require(modelLocation).model;
var userModel = require('../models/User').model;

const route = require(modelLocation).route;
const routeIdentifier = util.format('/%s', route);

/** Express setup **/

var router = express.Router();

/** Express routing **/

router.use('*', function(req, res, next) {
  if (!req.user) {
    return res.status(403).send('HoenyQA, 403 - Forbidden');
  }

  if (userModel.findOne({
      '_id': req.user._id
    }, function(err, res) {
      if (err) {
        return res.send(err);
      }

      next();
    }));
});

// Client

// Android v1 (Default UrQA)
// Exception
router.post(routeIdentifier + '/urqa/client/send/exception', function(req, res) {
  res.status(200).send({
    response: 200
  });
});

// Native Exception
router.post(routeIdentifier + '/urqa/client/send/exception/native', function(req, res) {
  res.status(200).send({
    response: 200
  });
});

// Session
router.post(routeIdentifier + '/urqa/client/connect', function(req, res) {
  res.status(200).send({
    response: 200
  });
});

// Key
router.post(routeIdentifier + '/urqa/client/get_key', function(req, res) {
  res.status(200).send({
    response: 200
  });
});

// Android v2 (HoneyQA)
// Exception
router.post(routeIdentifier + '/api/v2/client/exception', function(req, res) {
  res.status(200).send({
    response: 200
  });
});

// Native Exception
router.post(routeIdentifier + '/api/v2/client/exception/native', function(req, res) {
  res.status(200).send({
    response: 200
  });
});

// Session
router.post(routeIdentifier + '/api/v2/client/session', function(req, res) {
  res.status(200).send({
    response: 200
  });
});

// Key
router.post(routeIdentifier + '/api/v2/client/key', function(req, res) {
  res.status(200).send({
    response: 200
  });
});

// iOS
// Session
router.post(routeIdentifier + '/api/ios/client/session', function(req, res) {
  // TODO : insert data to redis
  // apikey / appversion / ios_version / model / carrier_name / country_code
  res.status(200).send({
    response: 200
  });
});

// Exception
router.post(routeIdentifier + '/api/ios/client/exception', function(req, res) {
  // TODO : pass data to worker
  res.status(200).send({
    response: 200
  });
});

module.exports = router;
