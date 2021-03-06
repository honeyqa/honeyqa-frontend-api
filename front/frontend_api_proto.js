var md5 = require('md5');
var express = require('express');
var config = require('./../config/config.js');
var async = require('async');
var bodyParser = require('body-parser');
var app = express();
var mysql = require('mysql');
var redis = require("redis"),
	client = redis.createClient(config.redis.port, config.redis.host);
var https = require('https');
var fs = require('fs');
var mapping = require('./mapping.json');
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());

var pool_0 = mysql.createPool({
	host     : config.server[0].host,
	port : 3306,
	user     : config.server[0].user,
	password : config.server[0].password,
	database : config.server[0].database,
	connectionLimit:20,
	waitForConnections:false
});
var pools = [ pool_0 ];
var lookupBase = 'lookup:';

//var privateKey  = fs.readFileSync('key.key', 'utf8');
//var certificate = fs.readFileSync('crt.crt', 'utf8');
//var credentials = {key: privateKey, cert: certificate};
//https.createServer(credentials, app).listen(8080);

var server = app.listen(8080, function(){
	var host = server.address().address;
	var port = server.address().port;
	console.log('Honeyqa API Server Started: %s', port);
});


client.on('error', function(err){
	console.log('Redis Error ' + err);
});

app.get('/', function(req, res){
	res.send('Honeyqa Frontend API');
});

// 유저 정보
app.get('/user/:user_id', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	var key = req.params.user_id;
	var queryString = 'select email, nickname, image_path from user where id = ?';
	pools[0].getConnection(function(err,connection) {
		connection.query(queryString, [key], function (err, rows, fields) {
			if (err) {
				connection.release();
				throw err;
			}

			if (rows.length === 0) {
				res.send('{}');
				connection.release();
			} else {
				var result = new Object();
				result = rows[0];

				res.send(result);
				connection.release();
			}
		});
	});
});

// 유저의 프로젝트 리스트
app.post('/projects/:user_id', function(req, res){
	var server_id;
	client.get(lookupBase + req.body.key, function(err, reply){
		if(err){
			res.send('{}');
			throw err;
		}
		if(reply == null){
			client.set(lookupBase + req.body.key, 0, redis.print);
			res.send('{}');
		}else{
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.user_id;
			pools[reply].getConnection(function(err,connection) {
				async.waterfall([
					function (callback) {
						var queryString = 'select id, title, apikey, platform, category, stage, timezone, DATE_FORMAT(datetime,\'%Y-%m-%d\') as datetime ' +
							'from project ' +
							'where user_id = ?';

						connection.query(queryString, [key], function (err, rows, fields) {
							if (err){
								connection.release();
								throw err;
							}

							if (rows.length === 0) {
								res.send('{}');
								connection.release();
							} else {
								var json = new Object();
								var projectsArr = [];

								for (var i = 0; i < rows.length; i++) {
									var element = new Object();

									//waterfall로 query문 순차 처리
									async.waterfall([
											function (callback) {
												element.id = rows[i].id;
												element.title = rows[i].title;
												element.apikey = rows[i].apikey;
												element.platform = rows[i].platform;
												element.category = rows[i].category;
												element.stage = rows[i].stage;
												element.timezone = rows[i].timezone;
												element.datetime = rows[i].datetime;
												callback(null, i, element);
											},

											//weekly error count 정보 추가
											function (index, element, callback) {
												var queryString = 'select count(*) as weekly_instancecount ' +
													'from instance ' +
													'where project_id = ? and datetime >= now() - interval 1 week';
												connection.query(queryString, [element.id], function (err, rows, fields) {
													if (rows.length != 0) {
														element.weekly_errorcount = rows[0].weekly_instancecount;
													} else {
														element.weekly_errorcount = 0;
													}
													callback(null, index, element);
												});
											}
										],
										function (err, index, result) {
											if (err){
												connection.release();
												throw err;
											}

											projectsArr.push(result);

											//project 리스트가 끝나면 json 보냄
											if (index == (rows.length - 1)) {
												json.projects = projectsArr;
												res.send(json);
												connection.release();
											}
										});
								}
							}
						});
					},
					function (result, callback) {

					}
				], function (err, result) {
					res.send(result);
					connection.release();
				});
			});
		}
	});
});


// 프로젝트 정보
app.post('/project/:project_id', function(req, res){
	var server_id;
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select id, title, apikey, platform, category, stage, timezone, DATE_FORMAT(datetime,\'%Y-%m-%d\') as datetime ' +
				'from project ' +
				'where id = ?';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows[0];

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 프로젝트의 일주일 동안의 에러 개수, 세션 개수
app.post('/project/:project_id/weekly_appruncount', function(req, res){var server_id;
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 6;
			var queryString = 'select if(a1.error_count is null, a2.error_count, a1.error_count) as error_count, if(a1.session_count is null, a2.session_count, a1.session_count) as session_count, date_format(a2.datetime, \'%Y-%m-%d\') as datetime ' +
				'from (select error_count, session_count, date(datetime) as datetime from appruncount where project_id = ? and datetime >= now() - interval ? day order by datetime) as a1 ' +
				'right join (select datetime, 0 as error_count, 0 as session_count from appruncount where datetime >= now() - interval ? day group by date(datetime) order by datetime) as a2 ' +
				'on date(a1.datetime) = date(a2.datetime)';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					var weeklyArr = [];

					for (var i = 0; i < rows.length; i++) {
						var element = new Object();
						element.error_count = rows[i].error_count;
						element.session_count = rows[i].session_count;
						element.date = rows[i].datetime;
						weeklyArr.push(element);
					}

					result.weekly = weeklyArr;
					res.send(result);
					connection.release();
				});
			});
		}
	});
});


// 프로젝트의 일주일 동안의 에러 개수, 세션 개수 (2)
app.post('/project/:project_id/weekly_appruncount2', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 6;
			var queryString = 'select date(a2.datetime) as datetime, if(a1.error_count is null, a2.error_count, a1.error_count) as error_count ' +
				'from (select datetime, error_count from appruncount where project_id = ? and datetime >= now() - interval ? day order by datetime) as a1 ' +
				'right join (select datetime, 0 as error_count from appruncount where datetime >= now() - interval ? day group by date(datetime) order by datetime) as a2 ' +
				'on date(a1.datetime) = date(a2.datetime)';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					var weeklyArr = [];

					for (var i = 0; i < rows.length; i++) {
						var element = [];
						var datetime = rows[i].datetime;
						element.push(datetime.getTime());
						element.push(rows[i].error_count);
						weeklyArr.push(element);
					}

					result.data = weeklyArr;
					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 일주일 세션 총 개수
app.post('/project/:project_id/weekly_sessioncount', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select count(*) as weekly_sessioncount ' +
				'from session ' +
				'where project_id = ? and datetime >= now() - interval 1 week';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					result = rows[0];

					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 일주일 에러 총 개수
app.post('/project/:project_id/weekly_errorcount', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select count(*) as weekly_instancecount ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					result = rows[0];

					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 일주일 에러 총 개수
app.post('/project/:project_id/weekly_instancecount', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select count(*) as weekly_instancecount ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					result = rows[0];

					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 일주일 세션 중 가장 많았던 앱 버전
app.post('/project/:project_id/most/sessionbyappver', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select appversion, count(*) as count ' +
				'from session ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by appversion ' +
				'order by count(*) desc limit 1';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					var result = new Object();
					if (rows.length === 0) {
						result.appversion = 'unknown';
					} else {
						result = rows[0];
					}
					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 일주일 에러 중 가장 많았던 앱 버전
app.post('/project/:project_id/most/errorbyappver', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select appversion, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by appversion ' +
				'order by count(*) desc limit 1';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					if (rows.length === 0) {
						result.appversion = 'unknown';
					} else {
						result = rows[0];
					}
					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 일주일 에러 중 가장 많았던 디바이스
app.post('/project/:project_id/most/errorbydevice', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select device, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by device ' +
				'order by count(*) desc limit 1';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					if (rows.length === 0) {
						result.device = 'unknown';
					} else {
						result = rows[0];
					}
					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 일주일 에러 중 가장 많았던 OS 버전
app.post('/project/:project_id/most/errorbysdkversion', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select osversion, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by osversion ' +
				'order by count(*) desc limit 1';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					if (rows.length === 0) {
						result.osversion = 'unknown';
					} else {
						result = rows[0];
					}
					res.send(result);
					connection.release();
				});
			});
		}
	});
});


// 프로젝트의 일주일 에러 중 가장 많았던 국가
app.post('/project/:project_id/most/errorbycountry', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select country, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by country ' +
				'order by count(*) desc limit 1';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					if (rows.length === 0) {
						result.country = 'unknown';
					} else {
						result = rows[0];
					}

					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 일주일 에러 중 가장 많았던 클래스
app.post('/project/:project_id/most/errorbyclassname', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select lastactivity, count(*) as count ' +
				'from instance ' +
				'where  project_id = ? and datetime >= now() - interval 1 week ' +
				'group by lastactivity ' +
				'order by count(*) desc limit 1';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					if (rows.length === 0) {
						result.lastactivity = 'unknown';
					} else {
						result = rows[0];
					}

					res.send(result);
					connection.release();
				});
			});
		}
	});
});


// 프로젝트의 에러 리스트 (1 week, default)
app.post('/project/:project_id/errors', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(update_date,\'%Y-%m-%d\') as update_date ' +
				'from error ' +
				'where project_id = ? and (status = 0 or status = 1) and update_date >= now() - interval 1 week ' +
				'order by (case rank when 2 then 1 when 3 then 2 when 1 then 3 when 0 then 4 else 9 end), numofinstances desc limit 50';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var json = new Object();
					var errorsArr = [];

					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						for (var i = 0; i < rows.length; i++) {
							var element = new Object();

							//waterfall로 query문 순차 처리
							async.waterfall([
									function (callback) {
										element.id = rows[i].id;
										element.rank = rows[i].rank;
										element.numofinstance = rows[i].numofinstances;
										element.errorname = rows[i].errorname;
										element.errorclassname = rows[i].errorclassname;
										element.linenum = rows[i].linenum;
										element.status = rows[i].status;
										element.update_date = rows[i].update_date;
										callback(null, i, element);
									},

									//tag 정보 추가
									function (index, element, callback) {
										var queryString = 'select tag from tag where error_id = ?';
										connection.query(queryString, [element.id], function (err, rows, fields) {
											if (rows.length != 0) {
												element.tags = rows;
											}
											callback(null, index, element);
										});
									}],
								function (err, index, result) {
									if (err) {
										connection.release();
										throw err;
									}

									errorsArr.push(result);

									//error 리스트가 끝나면 json 보냄
									if (index == (rows.length - 1)) {
										json.errors = errorsArr;
										res.send(json);
										connection.release();
									}
								});
						}
					}
				});
			});
		}
	});
});


// 프로젝트의 에러 리스트 (1 week, tranding)
app.post('/project/:project_id/errors_tranding', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(update_date,\'%Y-%m-%d\') as update_date ' +
				'from error ' +
				'where project_id = ? and (status = 0 or status = 1) and update_date >= now() - interval 1 week ' +
				'order by (case rank when 2 then 1 when 3 then 2 when 1 then 3 when 0 then 4 else 9 end), numofinstances desc limit 15';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var json = new Object();
					var errorsArr = [];

					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {

						for (var i = 0; i < rows.length; i++) {
							var element = new Object();

							//waterfall로 query문 순차 처리
							async.waterfall([
									function (callback) {
										element.id = rows[i].id;
										element.rank = rows[i].rank;
										element.numofinstance = rows[i].numofinstances;
										element.errorname = rows[i].errorname;
										element.errorclassname = rows[i].errorclassname;
										element.linenum = rows[i].linenum;
										element.status = rows[i].status;
										element.update_date = rows[i].update_date;
										callback(null, i, element);
									},

									//tag 정보 추가
									function (index, element, callback) {
										var queryString = 'select tag from tag where error_id = ?';
										connection.query(queryString, [element.id], function (err, rows, fields) {
											if (rows.length != 0) {
												element.tags = rows;
											}
											callback(null, index, element);
										});
									}],
								function (err, index, result) {
									if (err) {
										connection.release();
										throw err;
									}

									errorsArr.push(result);

									//error 리스트가 끝나면 json 보냄
									if (index == (rows.length - 1)) {
										json.errors = errorsArr;
										res.send(json);
										connection.release();
									}
								});
						}
					}
				});
			});
		}
	});
});

// 프로젝트의 에러 리스트 (1 week, latest)
app.post('/project/:project_id/errors_latest', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(update_date,\'%Y-%m-%d\') as update_date ' +
				'from error ' +
				'where project_id = ? and (status = 0 or status = 1) and update_date >= now() - interval 1 week ' +
				'order by update_date desc, (case rank when 2 then 1 when 3 then 2 when 1 then 3 when 0 then 4 else 9 end), numofinstances desc limit 15';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var json = new Object();
					var errorsArr = [];

					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {

						for (var i = 0; i < rows.length; i++) {
							var element = new Object();

							//waterfall로 query문 순차 처리
							async.waterfall([
									function (callback) {
										element.id = rows[i].id;
										element.rank = rows[i].rank;
										element.numofinstance = rows[i].numofinstances;
										element.errorname = rows[i].errorname;
										element.errorclassname = rows[i].errorclassname;
										element.linenum = rows[i].linenum;
										element.status = rows[i].status;
										element.update_date = rows[i].update_date;
										callback(null, i, element);
									},

									//tag 정보 추가
									function (index, element, callback) {
										var queryString = 'select tag from tag where error_id = ?';
										connection.query(queryString, [element.id], function (err, rows, fields) {
											if (rows.length != 0) {
												element.tags = rows;
											}
											callback(null, index, element);
										});
									}],
								function (err, index, result) {
									if (err) {
										connection.release();
										throw err;
									}

									errorsArr.push(result);

									//error 리스트가 끝나면 json 보냄
									if (index == (rows.length - 1)) {
										json.errors = errorsArr;
										res.send(json);
										connection.release();
									}
								});
						}
					}
				});
			});
		}
	});
});


// 프로젝트의 필터 요소
app.post('/project/:project_id/filters', function(req, res){
			client.get(lookupBase + req.body.key, function(err, reply) {
				if (err || reply == null) {
					res.send('{}');
					//throw err;
				} else {
			res.header('Access-Control-Allow-Origin', '*');
			var period = 7;
			pools[reply].getConnection(function (err, connection) {
				async.waterfall([
					function (callback) {
						var queryString = 'select appversion, count(*) as count ' +
							'from instance ' +
							'where project_id = ? and datetime >= now() - interval ? day ' +
							'group by appversion order by count desc';
						var key = req.params.project_id;
						var result = new Object();

						connection.query(queryString, [key, period], function (err, rows, fields) {
							result.filter_appversions = rows;
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select device, count(*) as count ' +
							'from instance ' +
							'where project_id = ? and datetime >= now() - interval ? day ' +
							'group by device order by count desc';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							result.filter_devices = rows;
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select osversion, count(*) as count ' +
							'from instance ' +
							'where project_id = ? and datetime >= now() - interval ? day ' +
							'group by osversion order by count desc';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							result.filter_sdkversions = rows;
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select country, count(*) as count ' +
							'from instance ' +
							'where project_id = ? and datetime >= now() - interval ? day ' +
							'group by country order by count desc';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							result.filter_countries = rows;
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select errorclassname ' +
							'from error ' +
							'where project_id = ? and update_date >= now() - interval ? day ' +
							'group by errorclassname';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							result.filter_classes = rows;
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select tag ' +
							'from tag ' +
							'where project_id = ?' +
							'group by tag';
						var key = req.params.project_id;

						connection.query(queryString, [key], function (err, rows, fields) {
							result.filter_tags = rows;
							callback(null, result);
						});
					}

				], function (err, result) {
					if (err) {
						connection.release();
						throw err;
					}

					res.send(result);
					connection.release();
				});
			});
		}
	});
});

// 프로젝트의 필터 요소 (maximum 4)
app.post('/project/:project_id/filters2', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var period = 7;
			pools[reply].getConnection(function (err, connection) {
				async.waterfall([
					function (callback) {
						var queryString = 'select appversion, count(*) as count ' +
							'from instance ' +
							'where project_id = ? and datetime >= now() - interval ? day ' +
							'group by appversion order by count desc limit 4';
						var key = req.params.project_id;
						var result = new Object();

						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}
							result.filter_appversions = rows;
							var len = rows.length;
							if (len < 4) {
								for (var i = 0; i < 4 - len; i++) {
									var element = new Object();
									element.appversion = 0;
									element.count = 0;
									result.filter_appversions.push(element);
								}
							}
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select device, count(*) as count ' +
							'from instance ' +
							'where project_id = ? and datetime >= now() - interval ? day ' +
							'group by device order by count desc limit 4';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.filter_devices = rows;
							var len = rows.length;
							if (len < 4) {
								for (var i = 0; i < 4 - len; i++) {
									var element = new Object();
									element.device = 0;
									element.count = 0;
									result.filter_devices.push(element);
								}
							}
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select osversion, count(*) as count ' +
							'from instance ' +
							'where project_id = ? and datetime >= now() - interval ? day ' +
							'group by osversion order by count desc limit 4';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.filter_sdkversions = rows;
							var len = rows.length;
							if (len < 4) {
								for (var i = 0; i < 4 - len; i++) {
									var element = new Object();
									element.osversion = 0;
									element.count = 0;
									result.filter_sdkversions.push(element);
								}
							}
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select country, count(*) as count ' +
							'from instance ' +
							'where project_id = ? and datetime >= now() - interval ? day ' +
							'group by country order by count desc limit 4';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.filter_countries = rows;
							var len = rows.length;
							if (len < 4) {
								for (var i = 0; i < 4 - len; i++) {
									var element = new Object();
									element.country = 0;
									element.count = 0;
									result.filter_countries.push(element);
								}
							}
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select errorclassname ' +
							'from error ' +
							'where project_id = ? and update_date >= now() - interval ? day ' +
							'group by errorclassname';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.filter_classes = rows;
							if (rows.length === 0) {
								var element = new Object();
								element.errorclassname = 0;
								element.count = 0;
								result.filter_classes.push(element);
							}
							callback(null, result);
						});
					},

					function (result, callback) {
						var queryString = 'select tag ' +
							'from tag ' +
							'where project_id = ? ' +
							'group by tag';
						var key = req.params.project_id;

						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.filter_tags = rows;
							if (rows.length === 0) {
								var element = new Object();
								element.tag = 0;
								element.count = 0;
								result.filter_tags.push(element);
							}
							callback(null, result);
						});
					}

				], function (err, result) {
					if (err) {
						connection.release();
						throw err;
					}

					res.send(result);
					connection.release();
				});
			});
		}
	});
});



// 에러 디테일 정보
// /error/891841
app.post('/error/:error_id',function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var queryString = 'select * from error where id = ?';
			var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(create_date,\'%Y-%m-%d %T\') as create_date, DATE_FORMAT(update_date,\'%Y-%m-%d %T\') as update_date, wifion, mobileon, gpson, totalmemusage ' +
				'from error ' +
				'where id = ?';
			var key = req.params.error_id;
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {

						var result = rows[0];
						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 에러 태그 정보
app.post('/error/:error_id/tags', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var queryString = 'select tag from tag where error_id = ?';
			var key = req.params.error_id;
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = rows;
						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 에러 콜스택 정보
app.post('/error/:error_id/callstack', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var queryString = 'select callstack from callstack where error_id = ?';
			var key = req.params.error_id;

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = rows[0];
						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 에러 인스턴스 리스트
app.post('/error/:error_id/instances',function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var period = 7;
			var queryString = 'select id, sdkversion, locale, DATE_FORMAT(datetime,\'%Y-%m-%d %T\') as datetime, device, country, appversion, osversion, gpson, wifion, mobileon, scrwidth, scrheight, batterylevel, availsdcard, rooted, appmemtotal, appmemfree, appmemmax, kernelversion, xdpi, ydpi, scrorientation, sysmemlow, lastactivity, carrier_name ' +
				'from instance ' +
				'where error_id = ? and datetime >= now() - interval ? day ' +
				'order by datetime desc';
			var key = req.params.error_id;

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = rows;
						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 에러 id에 대한 일주일 카운트 정보 (error_id = 1)
app.post('/error/:error_id/daily_errorcount', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.error_id;
			var period = 6;
			var queryString = 'select date(a.datetime) as datetime, if(i.error_count is null, a.error_count, i.error_count) as error_count from (select datetime, count(*) error_count from instance where error_id = ? and datetime >= now() - interval ? day group by date(datetime) order by datetime) as i ' +
				'right join (select datetime, 0 as error_count from appruncount where datetime >= now() - interval ? day group by date(datetime) order by datetime) as a ' +
				'on date(i.datetime) = date(a.datetime);';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var result = new Object();
					var weeklyArr = [];

					for (var i = 0; i < rows.length; i++) {
						var element = [];
						var datetime = rows[i].datetime;
						element.push(datetime.getTime());
						element.push(rows[i].error_count);
						weeklyArr.push(element);
					}

					result.data = weeklyArr;
					res.send(result);
					connection.release();
				});
			});
		}
	});
});

//http://localhost:8080/instance/20446446/eventpath
// 해당 인스턴스의 이벤트 패스
app.post('/instance/:instance_id/eventpath', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var queryString = 'select DATE_FORMAT(datetime,\'%Y-%m-%d %T\') as datetime, classname, methodname, linenum, depth, label from eventpath where instance_id = ?';
			var key = req.params.instance_id;

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = rows[0];
						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

//에러 디테일 페이지 통계 (단위 week)
app.post('/error/:error_id/statistics', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.error_id;
			var period = 7;
			pools[reply].getConnection(function (err, connection) {
				async.waterfall([
					function (callback) {
						var result = new Object();
						var queryString = 'select count(*) weekly_instancecount from instance where error_id = ? and datetime >= now() - interval ? day';
						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.total_error_count = rows[0].weekly_instancecount;
							callback(null, result);
						});
					},
					function (result, callback) {
						var queryString = 'select appversion, count(*) as count ' +
							'from instance ' +
							'where error_id = ? and datetime >= now() - interval ? day ' +
							'group by appversion ' +
							'order by count(*) desc';
						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.appversion_counts = rows;
							callback(null, result);
						});
					},
					function (result, callback) {
						var queryString = 'select device, count(*) as count ' +
							'from instance ' +
							'where error_id = ? and datetime >= now() - interval ? day ' +
							'group by device ' +
							'order by count(*) desc';
						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.device_counts = rows;
							callback(null, result);
						});
					},
					function (result, callback) {
						var queryString = 'select osversion, count(*) as count ' +
							'from instance ' +
							'where error_id = ? and datetime >= now() - interval ? day ' +
							'group by osversion ' +
							'order by count(*) desc';
						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.sdkversion_counts = rows;
							callback(null, result);
						});
					},
					function (result, callback) {
						var queryString = 'select country, count(*) as count ' +
							'from instance ' +
							'where error_id = ? and datetime >= now() - interval ? day ' +
							'group by country ' +
							'order by count(*) desc';
						connection.query(queryString, [key, period], function (err, rows, fields) {
							if (err) {
								connection.release();
								throw err;
							}

							result.country_counts = rows;
							callback(null, result);
						});
					}
				], function (err, result) {
					if (err) {
						connection.release();
						throw err;
					}
					res.send(result);
					connection.release();
				});
			});
		}
	});
});


/*

	Statistics

 */



// 통계 페이지 error by appversion
app.post('/statistics/:project_id/error_appversion', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var result = new Object();
			result.keys = [];
			result.values = [];
			var period = 7;
			var queryString = 'select i2.appversion, if(i1.count is null, i2.count,i1.count) as count, date_format((now() - interval ? day), \'%Y-%m-%d\') as datetime ' +
				'from (select appversion, count(*) as count, project_id, datetime ' +
				'from instance ' +
				'where project_id = ? and date(datetime) = date(now() - interval ? day) ' +
				'group by appversion) as i1 ' +
				'right join ' +
				'(select appversion, 0 as count, project_id from instance where project_id = ? group by appversion) as i2 ' +
				'on i1.appversion = i2.appversion';

			pools[reply].getConnection(function (err, connection) {
				for (var i = period - 1; i >= 0; i--) {
					async.waterfall([
						function (callback) {

							var element = '';
							var index = i;
							connection.query(queryString, [index, key, index, key], function (err, rows, fields) {
								if (err) {
									connection.release();
									throw err;
								}

								if (index === 0) {
									for (var j = 0; j < rows.length; j++) {
										result.keys.push(rows[j].appversion);
									}
								}
								//result.stat_appversion
								element += '{ \"datetime\": ';
								element += '\"' + rows[0].datetime + '\"';
								for (var k = 0; k < rows.length; k++) {
									element += ', ' + '\"' + rows[k].appversion + '\"';
									element += ': ' + rows[k].count;
								}
								element += '}';
								element = JSON.parse(element);
								result.values.push(element);
								callback(null, index, result);
							});
						}
					], function (err, index, result) {
						if (err) {
							connection.release();
							throw err;
						}
						if (index === 0) {
							res.send(result);
							connection.release();
						}
					});
				}
			});
		}
	});
});

// 통계 페이지 session by appversion
app.post('/statistics/:project_id/session_appversion', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var result = new Object();
			result.keys = [];
			result.values = [];

			var period = 7;

			var queryString = 'select i2.appversion, if(i1.count is null, i2.count,i1.count) as count, date_format((now() - interval ? day), \'%Y-%m-%d\') as datetime ' +
				'from (select appversion, count(*) as count, project_id, datetime ' +
				'from session ' +
				'where project_id = ? and date(datetime) = date(now() - interval ? day) ' +
				'group by appversion) as i1 ' +
				'right join ' +
				'(select appversion, 0 as count, project_id from session where project_id = ? group by appversion) as i2 ' +
				'on i1.appversion = i2.appversion';

			pools[reply].getConnection(function (err, connection) {
				for (var i = period - 1; i >= 0; i--) {
					async.waterfall([
						function (callback) {
							var element = '';
							var index = i;
							connection.query(queryString, [index, key, index, key], function (err, rows, fields) {
								if (err) {
									connection.release();
									throw err;
								}
								if (index === 0) {
									for (var j = 0; j < rows.length; j++) {
										result.keys.push(rows[j].appversion);
									}
								}
								//result.stat_appversion
								element += '{ \"datetime\": ';
								element += '\"' + rows[0].datetime + '\"';
								for (var k = 0; k < rows.length; k++) {
									element += ', ' + '\"' + rows[k].appversion + '\"';
									element += ': ' + rows[k].count;
								}
								element += '}';
								element = JSON.parse(element);
								result.values.push(element);
								callback(null, index, result);
							});
						}
					], function (err, index, result) {
						if (err) {
							connection.release();
							throw err;
						}
						if (index === 0) {
							res.send(result);
							connection.release();
						}
					});
				}
			});
		}
	});
});

// 통계 페이지 device (상위 9개)
app.post('/statistics/:project_id/device', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 7;
			var queryString = 'select device, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval ? day ' +
				'group by device order by count desc limit 9';
			var result = new Object();
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows;

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 통계 페이지 android sdkversion(osversion)
app.post('/statistics/:project_id/osversion', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select osversion, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval ? day ' +
				'group by osversion order by count desc';
			var result = new Object();
			var period = 7;
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows;

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 통계 페이지 android sdkversion(osversion) + rank 분류 추가
app.post('/statistics/:project_id/osversion_rank', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 7;
			var queryString = 'select instance.osversion, error.rank, count(rank) as rank_count ' +
				'from instance, error ' +
				'where instance.project_id = ? and instance.error_id = error.id and datetime >= now() - interval ? day ' +
				'group by appversion order by osversion';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows;

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 통계 페이지 country
app.post('/statistics/:project_id/country', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 7;
			var queryString = 'select country, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval ? day ' +
				'group by country order by count desc';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows;

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});


// 통계 페이지 lastactivity
app.post('/statistics/:project_id/lastactivity', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 7;
			var queryString = 'select if(lastactivity = \"\", \"unknown\", lastactivity) as lastactivity, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval ? day ' +
				'group by lastactivity order by count desc limit 30';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						throw err;
						connection.release();
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows;

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 통계 페이지 errorclassname
app.post('/statistics/:project_id/errorclassname', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 7;
			var queryString = 'select if(error.errorclassname = \"\", \"unknown\", error.errorclassname) as errorclassname, count(error.rank) as count ' +
				'from instance join error on instance.error_id = error.id ' +
				'where instance.project_id = ? and instance.datetime >= now() - interval ? day ' +
				'group by errorclassname order by count desc limit 30';
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows;

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 대시보드, 통계 페이지 rank rate
app.post('/statistics/:project_id/rank_rate', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 7;
			var queryString = 'select error.rank, count(error.rank) as count ' +
				'from instance join error on instance.error_id = error.id ' +
				'where instance.project_id = ? and instance.datetime >= now() - interval ? day ' +
				'group by rank';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows;

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

// 통계 페이지 error appversion & osversion
app.post('/statistics/:project_id/error_version', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var period = 7;
			var result = new Object();
			result.osversion = [];
			result.appversion = [];
			result.data = [];
			var queryString = 'select osversion from instance where project_id = ? and datetime >= now() - interval ? day group by osversion';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, period], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						for (var i = 0; i < rows.length; i++) {
							result.osversion.push(rows[i].osversion);
							async.waterfall([
								function (callback) {
									var index = i;
									var osversion = rows[i].osversion;
									var queryString = 'select i2.appversion, if(i1.count is null, 0, i1.count) as count ' +
										'from (select osversion, appversion, count(*) as count from instance where project_id = ? and osversion = ? and datetime >= now() - interval ? day group by appversion) as i1 ' +
										'right outer join (select appversion, if(count(*) != 0, count(*), 0) as count from instance where project_id = ? and datetime >= now() - interval ? day group by appversion order by count desc limit 5) as i2 ' +
										'on i1.appversion = i2.appversion';
									connection.query(queryString, [key, osversion, period, key, period], function (err, rows, fields) {
										var arr = [];
										arr.push(osversion);
										for (var j = 0; j < rows.length; j++) {
											if (j > 10) {
												break;
											}
											arr.push(rows[j].count);
											if (index === 0) {
												result.appversion.push(rows[j].appversion);
											}
										}
										result.data.push(arr);
										callback(null, index, result);
									});
								}

							], function (err, index, result) {
								if (err) {
									connection.release();
									throw err;
								}

								if (index === rows.length - 1) {
									res.send(result);
									connection.release();
								}

							});
						}
					}
				});
			});
		}
	});
});

// proguard list
app.post('/proguard/:project_id', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var key = req.params.project_id;
			var queryString = 'select id, appversion, filename, date_format(uploadtime, \'%Y-%m-%d %T\') as uploadtime ' +
				'from proguard ' +
				'where project_id = ?';

			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}
					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {
						var result = new Object();
						result = rows;

						res.send(result);
						connection.release();
					}
				});
			});
		}
	});
});

app.post('/project/:project_id/errors/filtered', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			var key = req.params.project_id;
			var body = req.body;
			console.log(body);

			var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(update_date,\'%Y-%m-%d\') as update_date ' +
				'from error where ' +
				'id = any(select error_id from instance where project_id = ? ';

			// instance table query
			if (body.country.length != 0) {
				var temp = '';
				for (var i = 0; i < body.country.length; i++) {
					if (body.country[i] === 'all') {
						temp = '';
						break;
					} else {
						if (temp === '') {
							temp += 'and (country = \'' + body.country[i] + '\' or country = \'' + body.country[i].toLowerCase() + '\'';
						} else {
							temp += 'or country = \'' + body.country[i] + '\' or country = \'' + body.country[i].toLowerCase() + '\'';
						}
					}
					if (i === body.country.length - 1) {
						temp += ')';
					}
				}
				queryString += temp;
			}
			if (body.appversion.length != 0) {
				var temp = '';
				for (var i = 0; i < body.appversion.length; i++) {
					if (body.appversion[i] === 'all') {
						temp = '';
						break;
					} else if (body.appversion[i] === 'Others') {
						if (i === body.appversion.length - 1) {
							temp += ')';
						}
						continue;
					} else {
						if (temp === '') {
							temp += 'and (appversion = \'' + body.appversion[i] + '\' ';
						} else {
							temp += 'or appversion = \'' + body.appversion[i] + '\' ';
						}
						if (i === body.appversion.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}
			if (body.osversion.length != 0) {
				var temp = '';
				for (var i = 0; i < body.osversion.length; i++) {
					if (body.osversion[i] === 'all') {
						temp = '';
						break;
					} else if (body.osversion[i] === 'Others') {
						if (i === body.osversion.length - 1) {
							temp += ')';
						}
						continue;
					} else {
						if (temp === '') {
							temp += 'and (osversion = \'' + body.osversion[i] + '\' ';
						} else {
							temp += 'or osversion = \'' + body.osversion[i] + '\' ';
						}
						if (i === body.osversion.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}

			// error table query
			if (body.rank.length != 0) {
				var temp = '';
				for (var i = 0; i < body.rank.length; i++) {
					if (body.rank[i] === 'all') {
						temp = '';
						break;
					} else {
						if (temp === '') {
							temp += 'and (rank = \'' + mapping.rank[body.rank[i]] + '\' ';
						} else {
							temp += 'or rank = \'' + mapping.rank[body.rank[i]] + '\' ';
						}
						if (i === body.rank.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}

			if (body.status.length != 0) {
				var temp = '';
				for (var i = 0; i < body.status.length; i++) {
					if (body.status[i] === 'all') {
						temp = '';
						break;
					} else {
						if (temp === '') {
							temp += 'and (status = \'' + mapping.status[body.status[i]] + '\' ';
						} else {
							temp += 'or status = \'' + mapping.status[body.status[i]] + '\' ';
						}
						if (i === body.status.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}
			queryString += ') ';

			// period query
			if (body.start > 1) {
				queryString += 'and update_date <= now() - interval ' + (body.start - 1) + ' day ';
			}
			if (body.end > 1) {
				queryString += 'and update_date >= now() - interval ' + (body.end - 1) + ' day ';
			} else {
				queryString += 'and date(update_date) >= date(now()) ';
			}
			queryString += 'order by (case rank when 2 then 1 when 3 then 2 when 1 then 3 when 0 then 4 else 9 end), status desc, numofinstances desc limit 50';
			// query 실행

			console.log(queryString);
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, body.start, body.end], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var json = new Object();
					var errorsArr = [];

					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {

						for (var i = 0; i < rows.length; i++) {
							var element = new Object();
							//waterfall로 query문 순차 처리
							async.waterfall([
									function (callback) {
										element.id = rows[i].id;
										element.rank = rows[i].rank;
										element.numofinstance = rows[i].numofinstances;
										element.errorname = rows[i].errorname;
										element.errorclassname = rows[i].errorclassname;
										element.linenum = rows[i].linenum;
										element.status = rows[i].status;
										element.update_date = rows[i].update_date;
										callback(null, i, element);
									},

									//tag 정보 추가
									function (index, element, callback) {
										var queryString = 'select tag from tag where error_id = ?';
										connection.query(queryString, [element.id], function (err, rows, fields) {
											if (rows.length != 0) {
												element.tags = rows;
											}
											callback(null, index, element);
										});
									}],
								function (err, index, result) {
									if (err) {
										connection.release();
										throw err;
									}
									errorsArr.push(result);

									//error 리스트가 끝나면 json 보냄
									if (index == (rows.length - 1)) {
										json.errors = errorsArr;
										res.send(json);
										connection.release();
									}
								});
						}
					}
				});
			});
		}
	});
});

app.post('/project/:project_id/errors/filtered/latest', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			var key = req.params.project_id;
			var body = req.body;
			console.log(body);

			var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(update_date,\'%Y-%m-%d\') as update_date ' +
				'from error where ' +
				'id = any(select error_id from instance where project_id = ? ';

			// instance table query
			if (body.country.length != 0) {
				var temp = '';
				for (var i = 0; i < body.country.length; i++) {
					if (body.country[i] === 'all') {
						temp = '';
						break;
					} else {
						if (temp === '') {
							temp += 'and (country = \'' + body.country[i] + '\' or country = \'' + body.country[i].toLowerCase() + '\'';
						} else {
							temp += 'or country = \'' + body.country[i] + '\' or country = \'' + body.country[i].toLowerCase() + '\'';
						}
						if (i === body.country.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}
			if (body.appversion.length != 0) {
				var temp = '';
				for (var i = 0; i < body.appversion.length; i++) {
					if (body.appversion[i] === 'all') {
						temp = '';
						break;
					} else if (body.appversion[i] === 'Others') {
						if (i === body.appversion.length - 1) {
							temp += ')';
						}
						continue;
					} else {
						if (temp === '') {
							temp += 'and (appversion = \'' + body.appversion[i] + '\' ';
						} else {
							temp += 'or appversion = \'' + body.appversion[i] + '\' ';
						}
						if (i === body.appversion.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}
			if (body.osversion.length != 0) {
				var temp = '';
				for (var i = 0; i < body.osversion.length; i++) {
					if (body.osversion[i] === 'all') {
						temp = '';
						break;
					} else if (body.osversion[i] === 'Others') {
						if (i === body.osversion.length - 1) {
							temp += ')';
						}
						continue;
					} else {
						if (temp === '') {
							temp += 'and (osversion = \'' + body.osversion[i] + '\' ';
						} else {
							temp += 'or osversion = \'' + body.osversion[i] + '\' ';
						}
						if (i === body.osversion.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}

			// error table query
			if (body.rank.length != 0) {
				var temp = '';
				for (var i = 0; i < body.rank.length; i++) {
					if (body.rank[i] === 'all') {
						temp = '';
						break;
					} else {
						if (temp === '') {
							temp += 'and (rank = \'' + mapping.rank[body.rank[i]] + '\' ';
						} else {
							temp += 'or rank = \'' + mapping.rank[body.rank[i]] + '\' ';
						}
						if (i === body.rank.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}

			if (body.status.length != 0) {
				var temp = '';
				for (var i = 0; i < body.status.length; i++) {
					if (body.status[i] === 'all') {
						temp = '';
						break;
					} else {
						if (temp === '') {
							temp += 'and (status = \'' + mapping.status[body.status[i]] + '\' ';
						} else {
							temp += 'or status = \'' + mapping.status[body.status[i]] + '\' ';
						}
						if (i === body.status.length - 1) {
							temp += ')';
						}
					}
				}
				queryString += temp;
			}

			queryString += ') ';

			// period query
			if (body.start > 1) {
				queryString += 'and update_date <= now() - interval ' + (body.start - 1) + ' day ';
			}
			if (body.end > 1) {
				queryString += 'and update_date >= now() - interval ' + (body.end - 1) + ' day ';
			} else {
				queryString += 'and date(update_date) >= date(now()) ';
			}
			queryString += 'order by update_date desc, (case rank when 2 then 1 when 3 then 2 when 1 then 3 when 0 then 4 else 9 end), numofinstances desc limit 50';
			// query 실행

			console.log(queryString);
			pools[reply].getConnection(function (err, connection) {
				connection.query(queryString, [key, body.start, body.end], function (err, rows, fields) {
					if (err) {
						connection.release();
						throw err;
					}

					var json = new Object();
					var errorsArr = [];

					if (rows.length === 0) {
						res.send('{}');
						connection.release();
					} else {

						for (var i = 0; i < rows.length; i++) {
							var element = new Object();
							//waterfall로 query문 순차 처리
							async.waterfall([
									function (callback) {
										element.id = rows[i].id;
										element.rank = rows[i].rank;
										element.numofinstance = rows[i].numofinstances;
										element.errorname = rows[i].errorname;
										element.errorclassname = rows[i].errorclassname;
										element.linenum = rows[i].linenum;
										element.status = rows[i].status;
										element.update_date = rows[i].update_date;
										callback(null, i, element);
									},

									//tag 정보 추가
									function (index, element, callback) {
										var queryString = 'select tag from tag where error_id = ?';
										connection.query(queryString, [element.id], function (err, rows, fields) {
											if (rows.length != 0) {
												element.tags = rows;
											}
											callback(null, index, element);
										});
									}],
								function (err, index, result) {
									if (err) {
										connection.release();
										throw err;
									}
									errorsArr.push(result);

									//error 리스트가 끝나면 json 보냄
									if (index == (rows.length - 1)) {
										json.errors = errorsArr;
										res.send(json);
										connection.release();
									}
								});
						}
					}
				});
			});
		}
	});
});


/*

	Insert

 */

app.post('/project/add', function(req, res){
	client.get(lookupBase + req.body.key, function(err, reply) {
		if (err || reply == null) {
			res.send('{}');
			//throw err;
		} else {
			res.header('Access-Control-Allow-Origin', '*');
			var body = req.body;
			if (!body.hasOwnProperty('appname') || !body.hasOwnProperty('platform') || !body.hasOwnProperty('category') || !body.hasOwnProperty('stage') || !body.hasOwnProperty('user_id')) {
				res.status(500);
				res.send('{}');
				connection.release();
			} else {
				var title = body.appname;
				var platform = parseInt(body.platform);
				var category = parseInt(body.category);
				var stage = parseInt(body.stage);
				var user_id = parseInt(body.user_id);
				var today = new Date();
				var apikey = md5(user_id + title + today + 'honey' + Math.floor(Math.random() * 100)).substr(0, 8);

				var timezone = 'Asiz/Seoul';
				var queryString = 'insert into ' +
					'project (apikey, platform, title, category, stage, timezone, datetime, user_id) ' +
					'values (?,?,?,?,?,?,now(),?)';

				pools[reply].getConnection(function (err, connection) {
					connection.query(queryString, [apikey, platform, title, category, stage, timezone, user_id], function (err, rows, fields) {
						if (err) {
							res.status(500);
							res.send('{}');
							connection.release();
							throw err;
						} else {
							var result = new Object();
							result.project_id = rows.insertId;
							res.send(result);
							connection.release();
						}
					});
				});
			}
		}
	});
});


app.post('/project/:project_id/errors_filtered', function(req, res){
    var key = req.params.project_id;
    var body = req.body;
    res.header('Access-Control-Allow-Origin', '*');
    res.send(body);
});

