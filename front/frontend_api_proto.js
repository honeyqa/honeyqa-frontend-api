var express = require('express');
var config = require('./../config/config.js');
var async = require('async');
var bodyParser = require('body-parser');
var app = express();
var https = require('https');
var fs = require('fs');

app.use(bodyParser.urlencoded());
app.use(bodyParser.json());

var mysql = require('mysql');
var connection = mysql.createConnection({
        host     : config.host,
        user     : config.user,
        password : config.password,
        database : config.database,
        multipleStatements : 'true'
});


var privateKey  = fs.readFileSync('key.key', 'utf8');
var certificate = fs.readFileSync('crt.crt', 'utf8');

var credentials = {key: privateKey, cert: certificate};

https.createServer(credentials, app).listen(8080);

//var server = app.listen(8080, function(){
//	var host = server.address().address;
//	var port = server.address().port;
//	console.log('Honeyqa API Server Started: %s', port);
//});


connection.connect(function(err){
	if(!err){
		console.log('Database is connected ... \n\n');
	}else{
		console.log('Error connecting database ... \n\n');
	}
});

app.get('/', function(req, res){
	res.send('Honeyqa Frontend API');
});


// 유저 정보
app.get('/user/:user_id', function(req, res){
	var key = req.params.user_id;
	var queryString = 'select email, nickname, image_path from user where id = ?';

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows[0];

		res.send(result);
	});
});


// 유저의 프로젝트 리스트
app.get('/projects/:user_id', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
	var key = req.params.user_id;

    async.waterfall([
        function(callback){
            var queryString = 'select id, title, apikey, platform, category, stage, timezone, DATE_FORMAT(datetime,\'%Y-%m-%d\') as datetime ' +
                'from project ' +
                'where user_id = ?';

            connection.query(queryString, [key], function(err, rows, fields){
                if (err) throw err;

                var json = new Object();
                var projectsArr = [];

                for(var i = 0; i <rows.length; i++) {
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
                            if (err) throw err;

                            projectsArr.push(result);

                            //project 리스트가 끝나면 json 보냄
                            if (index == (rows.length - 1)) {
                                json.projects = projectsArr;
                                res.send(json);
                            }
                        });
                }
            });
        },
        function(result, callback){

        }
    ], function(err, result){
        res.send(result);
    });
});


// 프로젝트 정보
app.get('/project/:project_id', function(req, res){
    var key = req.params.project_id;
    var queryString = 'select id, title, apikey, platform, category, stage, timezone, DATE_FORMAT(datetime,\'%Y-%m-%d\') as datetime ' +
        'from project ' +
        'where id = ?';

    connection.query(queryString, [key], function(err, rows, fields){
        if(err) throw err;

        res.header('Access-Control-Allow-Origin', '*');

        var result = new Object();
        result = rows[0];

        res.send(result);
    });
});

// 프로젝트의 일주일 동안의 에러 개수, 세션 개수
app.get('/project/:project_id/weekly_appruncount', function(req, res){
	var key = req.params.project_id;
    var period = 7;
	var queryString = 'select error_count, session_count, DATE_FORMAT(datetime,\'%Y-%m-%d\') as datetime ' +
		'from appruncount ' +
		'where project_id = ? and datetime >= now() - interval ? day ' +
		'order by datetime';
	connection.query(queryString, [key, period], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

        var period = 7;
		var result = new Object();
		var weeklyArr = [];

        // error count가 없으면 0 출력
		if(rows.length < period){
			var len = period - rows.length;
			for(var i=0; i<len; i++){
				var element = new Object();
				element.error_count = 0;
				element.session_count = 0;
                var today = new Date();
                today.setDate(today.getDate() - (period-i-1));
                var yyyy = today.getFullYear().toString();
                var mm = (today.getMonth() + 1).toString();
                var dd = (today.getDate()).toString();
				element.date = yyyy+'-'+(mm[1] ? mm : '0'+mm[0])+'-'+(dd[1] ? dd : '0'+dd[0]);
				weeklyArr.push(element);
			}
			for(var j=0; j<rows.length; j++){
				var element = new Object();
				element.error_count = rows[j].error_count;
				element.session_count = rows[j].session_count;
				element.date = rows[j].datetime;
				weeklyArr.push(element);
			}
		}
		else{
			for(var i=0; i<rows.length; i++){
				var element = new Object();
				element.error_count = rows[i].error_count;
				element.session_count = rows[i].session_count;
				element.date = rows[i].datetime;
				weeklyArr.push(element);
			}
		}

		result.weekly = weeklyArr;
		res.send(result);
	});
});


// 프로젝트의 일주일 동안의 에러 개수, 세션 개수 (2)
app.get('/project/:project_id/weekly_appruncount2', function(req, res){
    var key = req.params.project_id;
    var period = 9;
    var queryString = 'select datetime, error_count ' +
        'from appruncount ' +
        'where project_id = ? and datetime >= now() - interval ? day ' +
        'order by datetime';
    connection.query(queryString, [key, period], function(err, rows, fields){
        if(err) throw err;

        var period = 9;

        res.header('Access-Control-Allow-Origin', '*');

        var result = new Object();
        var weeklyArr = [];

        // error count가 없으면 0 출력
        if(rows.length < period){
            var len = period - rows.length;
            for(var i=0; i<len; i++){
                var element = [];
                var today = new Date();
                today.setDate(today.getDate() - (period-i-1));
                element.push(today.getTime());
                element.push(0);
                weeklyArr.push(element);
            }
            for(var j=0; j<rows.length; j++){
                var element = [];
				var datetime = rows[j].datetime;
                element.push(datetime.getTime());
                element.push(rows[j].error_count);
                weeklyArr.push(element);
            }
        }
        else{
            for(var i=0; i<rows.length; i++){
                var element = [];
				var datetime = rows[i].datetime;
				element.push(datetime.getTime());
                element.push(rows[i].error_count);
                weeklyArr.push(element);
            }
        }

        result.data = weeklyArr;
        res.send(result);
    });
});



// 프로젝트의 일주일 세션 총 개수
app.get('/project/:project_id/weekly_sessioncount', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select count(*) as weekly_sessioncount ' +
		'from session ' +
		'where project_id = ? and datetime >= now() - interval 1 week';

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows[0];

		res.send(result);
	});
});

// 프로젝트의 일주일 에러 총 개수
app.get('/project/:project_id/weekly_errorcount', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select count(*) as weekly_instancecount ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval 1 week';

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows[0];

		res.send(result);
	});
});

// 프로젝트의 일주일 에러 총 개수
app.get('/project/:project_id/weekly_instancecount', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select count(*) as weekly_instancecount ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval 1 week';

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows[0];

		res.send(result);
	});
});


// 프로젝트의 일주일 세션 중 가장 많았던 앱 버전
app.get('/project/:project_id/most/sessionbyappver', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select appversion, count(*) as count ' +
		'from session ' +
		'where project_id = ? and datetime >= now() - interval 1 week ' +
		'group by appversion ' +
		'order by count(*) desc limit 1';
	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = new Object();
		console.log(rows.length);
		if(rows.length === 0){
			result.appversion = 'unknown';
		}else{
			result = rows[0];
		}
		res.send(result);
	});
});

// 프로젝트의 일주일 에러 중 가장 많았던 앱 버전
app.get('/project/:project_id/most/errorbyappver', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select appversion, count(*) as count ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval 1 week ' +
		'group by appversion ' +
		'order by count(*) desc limit 1';
	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = new Object();
		console.log(rows.length);
		if(rows.length === 0){
			result.appversion = 'unknown';
		}else{
			result = rows[0];
		}
		res.send(result);
	});
});

// 프로젝트의 일주일 에러 중 가장 많았던 디바이스
app.get('/project/:project_id/most/errorbydevice', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select device, count(*) as count ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval 1 week ' +
		'group by device ' +
		'order by count(*) desc limit 1';
	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = new Object();
		console.log(rows.length);
		if(rows.length === 0){
			result.device = 'unknown';
		}else{
			result = rows[0];
		}
		res.send(result);
	});
});

// 프로젝트의 일주일 에러 중 가장 많았던 OS 버전
app.get('/project/:project_id/most/errorbysdkversion', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select osversion, count(*) as count ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval 1 week ' +
		'group by osversion ' +
		'order by count(*) desc limit 1';
	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = new Object();
		console.log(rows.length);
		if(rows.length === 0){
			result.osversion = 'unknown';
		}else{
			result = rows[0];
		}
		res.send(result);
	});
});


// 프로젝트의 일주일 에러 중 가장 많았던 국가
app.get('/project/:project_id/most/errorbycountry', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select country, count(*) as count ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval 1 week ' +
		'group by country ' +
		'order by count(*) desc limit 1';
	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = new Object();
		if(rows.length === 0){
			result.country = 'unknown';
		}else{
			result = rows[0];
		}

		res.send(result);
	});
});

// 프로젝트의 일주일 에러 중 가장 많았던 클래스
app.get('/project/:project_id/most/errorbyclassname', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select lastactivity, count(*) as count ' +
		'from instance ' +
		'where  project_id = ? and datetime >= now() - interval 1 week ' +
		'group by lastactivity ' +
		'order by count(*) desc limit 1';
	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = new Object();
		if(rows.length === 0){
			result.lastactivity = 'unknown';
		}else{
			result = rows[0];
		}

		res.send(result);
	});
});


// 프로젝트의 에러 리스트 (1 week, default)
app.get('/project/:project_id/errors', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');

	var key = req.params.project_id;
	var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(update_date,\'%Y-%m-%d\') as update_date ' +
		'from error ' +
		'where project_id = ? and (status = 0 or status = 1) and update_date >= now() - interval 1 week ' +
		'order by rank desc, numofinstances desc limit 50';

	connection.query(queryString, [key], function (err, rows, fields) {
		if (err) throw err;

		var json = new Object();
		var errorsArr = [];

		if(rows.length === 0){
			res.send('{}');
		}

		for(var i = 0; i <rows.length; i++){
			var element = new Object();

			//waterfall로 query문 순차 처리
			async.waterfall([
					function(callback){
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
					function(index, element, callback){
						var queryString = 'select tag from tag where error_id = ?';
						connection.query(queryString, [element.id], function(err, rows, fields){
							if(rows.length != 0){
								element.tags = rows;
							}
							callback(null, index, element);
						});
					}],
				function(err, index, result){
					if(err) throw err;

					errorsArr.push(result);

					//error 리스트가 끝나면 json 보냄
					if(index == (rows.length - 1))
					{
						json.errors = errorsArr;
						res.send(json);
					}
				});
		}
	});
});

// 프로젝트의 에러 리스트 (1 week, tranding)
app.get('/project/:project_id/errors_tranding', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');

	var key = req.params.project_id;
	var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(update_date,\'%Y-%m-%d\') as update_date ' +
		'from error ' +
		'where project_id = ? and (status = 0 or status = 1) and update_date >= now() - interval 1 week ' +
		'order by rank desc, numofinstances desc limit 15';

	connection.query(queryString, [key], function (err, rows, fields) {
		if (err) throw err;

		var json = new Object();
		var errorsArr = [];

		if(rows.length === 0){
			res.send('{}');
		}

		for(var i = 0; i <rows.length; i++){
			var element = new Object();

			//waterfall로 query문 순차 처리
			async.waterfall([
					function(callback){
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
					function(index, element, callback){
						var queryString = 'select tag from tag where error_id = ?';
						connection.query(queryString, [element.id], function(err, rows, fields){
							if(rows.length != 0){
								element.tags = rows;
							}
							callback(null, index, element);
						});
					}],
				function(err, index, result){
					if(err) throw err;

					errorsArr.push(result);

					//error 리스트가 끝나면 json 보냄
					if(index == (rows.length - 1))
					{
						json.errors = errorsArr;
						res.send(json);
					}
				});
		}

	});
});

// 프로젝트의 에러 리스트 (1 week, latest)
app.get('/project/:project_id/errors_latest', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');

	var key = req.params.project_id;
	var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(update_date,\'%Y-%m-%d\') as update_date ' +
		'from error ' +
		'where project_id = ? and (status = 0 or status = 1) and update_date >= now() - interval 1 week ' +
		'order by update_date desc, rank desc, numofinstances desc limit 15';

	connection.query(queryString, [key], function (err, rows, fields) {
		if (err) throw err;

		var json = new Object();
		var errorsArr = [];

		if(rows.length === 0){
			res.send('{}');
		}

		for(var i = 0; i <rows.length; i++){
			var element = new Object();

			//waterfall로 query문 순차 처리
			async.waterfall([
					function(callback){
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
					function(index, element, callback){
						var queryString = 'select tag from tag where error_id = ?';
						connection.query(queryString, [element.id], function(err, rows, fields){
							if(rows.length != 0){
								element.tags = rows;
							}
							callback(null, index, element);
						});
					}],
				function(err, index, result){
					if(err) throw err;

					errorsArr.push(result);

					//error 리스트가 끝나면 json 보냄
					if(index == (rows.length - 1))
					{
						json.errors = errorsArr;
						res.send(json);
					}
				});
		}
	});
});

// 프로젝트의 필터 요소
app.get('/project/:project_id/filters', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');

	async.waterfall([
		function(callback){
			var queryString = 'select appversion, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by appversion order by count desc';
			var key = req.params.project_id;
			var result = new Object();

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_appversions = rows;
				callback(null, result);
			});
		},

		function(result, callback){
			var queryString = 'select device, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 ' +
				'week group by device order by count desc';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_devices = rows;
				callback(null, result);
			});
		},

		function(result, callback){
			var queryString = 'select sdkversion, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by sdkversion order by count desc';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_sdkversions = rows;
				callback(null, result);
			});
		},

		function(result, callback){
			var queryString = 'select country, count(*) as count ' +
				'from instance ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by country order by count desc';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_countries = rows;
				callback(null, result);
			});
		},

		function(result, callback){
			var queryString = 'select errorclassname ' +
				'from error ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by errorclassname';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_classes = rows;
				callback(null, result);
			});
		},

		function(result, callback){
			var queryString = 'select tag ' +
				'from tag ' +
				'where project_id = ? and datetime >= now() - interval 1 week ' +
				'group by tag';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_tags = rows;
				callback(null, result);
			});
		}

	], function(err, result){
		if(err) throw err;

		res.send(result);
	});
});

// 에러 디테일 정보
app.get('/error/:error_id',function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	var queryString = 'select * from error where id = ?';
	var queryString = 'select id, rank, numofinstances, errorname, errorclassname, linenum, status, DATE_FORMAT(create_date,\'%Y-%m-%d %T\') as create_date, DATE_FORMAT(update_date,\'%Y-%m-%d %T\') as update_date, wifion, mobileon, gpson, totalmemusage ' +
		'from error ' +
		'where id = ?';
	var key = req.params.error_id;

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = rows[0];
		res.send(result);
	});

});

// 에러 태그 정보
app.get('/error/:error_id/tags', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	var queryString = 'select tag from tag where error_id = ?';
	var key = req.params.error_id;

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = rows;
		res.send(result);
	});
});

// 에러 콜스택 정보
app.get('/error/:error_id/callstack', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	var queryString = 'select callstack from callstack where error_id = ?';
	var key = req.params.error_id;

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = rows[0];
		res.send(result);
	});
});

// 에러 인스턴스 리스트
app.get('/error/:error_id/instances',function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	var queryString = 'select id, sdkversion, locale, DATE_FORMAT(datetime,\'%Y-%m-%d %T\') as datetime, device, country, appversion, osversion, gpson, wifion, mobileon, scrwidth, scrheight, batterylevel, availsdcard, rooted, appmemtotal, appmemfree, appmemmax, kernelversion, xdpi, ydpi, scrorientation, sysmemlow, lastactivity, carrier_name ' +
		'from instance ' +
		'where error_id = ? and datetime >= now() - interval 1 week ' +
		'order by datetime desc';
	var key = req.params.error_id;

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = rows;
		res.send(result);
	});
});

//http://localhost:8080/instance/20446446/eventpath
// 해당 인스턴스의 이벤트 패스
app.get('/instance/:instance_id/eventpath', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	var queryString = 'select DATE_FORMAT(datetime,\'%Y-%m-%d %T\') as datetime, classname, methodname, linenum, depth, label from eventpath where instance_id = ?';
	var key = req.params.instance_id;

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = rows[0];
		res.send(result);
	});
});

//에러 디테일 페이지 통계 (단위 week)
app.get('/error/:error_id/statistics', function(req, res){
	var key = req.params.error_id;
	res.header('Access-Control-Allow-Origin', '*');

	async.waterfall([
		function(callback){
			var result = new Object();
			var queryString = 'select count(*) weekly_instancecount from instance where error_id = ? and datetime >= now() - interval 1 week';
			connection.query(queryString, [key], function(err, rows, fields){
				if(err) throw err;

				result.tatal_error_count = rows[0].weekly_instancecount;
				callback(null, result);
			});
		},
		function(result, callback){
			var queryString = 'select appversion, count(*) as count ' +
				'from instance ' +
				'where error_id = ? and datetime >= now() - interval 1 week ' +
				'group by appversion ' +
				'order by count(*) desc';
			connection.query(queryString, [key], function(err, rows, fields){
				if(err) throw err;

				result.appversion_counts = rows;
				callback(null, result);
			});
		},
		function(result, callback){
			var queryString = 'select device, count(*) as count ' +
				'from instance ' +
				'where error_id = ? and datetime >= now() - interval 1 week ' +
				'group by device ' +
				'order by count(*) desc';
			connection.query(queryString, [key], function(err, rows, fields){
				if(err) throw err;

				result.device_counts = rows;
				callback(null, result);
			});
		},
		function(result, callback){
			var queryString = 'select osversion, count(*) as count ' +
				'from instance ' +
				'where error_id = ? and datetime >= now() - interval 1 week ' +
				'group by osversion ' +
				'order by count(*) desc';
			connection.query(queryString, [key], function(err, rows, fields){
				if(err) throw err;

				result.sdkversion_counts = rows;
				callback(null, result);
			});
		},
		function(result, callback){
			var queryString = 'select country, count(*) as count ' +
				'from instance ' +
				'where error_id = ? and datetime >= now() - interval 1 week ' +
				'group by country ' +
				'order by count(*) desc';
			connection.query(queryString, [key], function(err, rows, fields){
				if(err) throw err;

				result.country_counts = rows;
				callback(null, result);
			});
		}

	], function(err, result){
		if(err) throw err;

		res.send(result);
	});
});

// 통계 페이지 error by appversion
app.get('/statistics/:project_id/error_appversion', function(req, res){
    var key = req.params.project_id;
	var result = new Object();
	result.keys = [];
	result.values = [];

	var period = 7;
    res.header('Access-Control-Allow-Origin', '*');

    var queryString = 'select i2.appversion, if(i1.count is null, i2.count,i1.count) as count, date_format((now() - interval ? day), \'%Y-%m-%d\') as datetime ' +
        'from (select appversion, count(*) as count, project_id, datetime ' +
        'from instance ' +
        'where project_id = ? and date(datetime) = date(now() - interval ? day) ' +
        'group by appversion) as i1 ' +
        'right join ' +
        '(select appversion, 0 as count, project_id from instance where project_id = ? group by appversion) as i2 ' +
        'on i1.appversion = i2.appversion';
    for(var i = period - 1; i >= 0; i--){
        async.waterfall([
            function(callback){

				var element = '';
                var index = i;
                connection.query(queryString, [index, key, index, key], function(err, rows, fields){
                    if(err) throw err;

					if(index === 0){
						for(var j = 0; j < rows.length; j++){
							result.keys.push(rows[j].appversion);
						}
					}
                    console.log(index);
                    //result.stat_appversion
					element += '{ \"datetime\": ';
					element += '\"' + rows[0].datetime + '\"';
					for(var k = 0; k < rows.length; k++){
						element += ', ' + '\"'+rows[k].appversion+ '\"';
						element += ': ' + rows[k].count;
					}
					element += '}';
					element = JSON.parse(element);
					result.values.push(element);
                    callback(null, index, result);
                });
            }
        ], function(err, index, result){
			if(index === 0){
				res.send(result);
			}
        });
    }
});

// 통계 페이지 session by appversion
app.get('/statistics/:project_id/session_appversion', function(req, res){
	var key = req.params.project_id;
	var result = new Object();
	result.keys = [];
	result.values = [];

	var period = 7;
	res.header('Access-Control-Allow-Origin', '*');

	var queryString = 'select i2.appversion, if(i1.count is null, i2.count,i1.count) as count, date_format((now() - interval ? day), \'%Y-%m-%d\') as datetime ' +
		'from (select appversion, count(*) as count, project_id, datetime ' +
		'from session ' +
		'where project_id = ? and date(datetime) = date(now() - interval ? day) ' +
		'group by appversion) as i1 ' +
		'right join ' +
		'(select appversion, 0 as count, project_id from session where project_id = ? group by appversion) as i2 ' +
		'on i1.appversion = i2.appversion';
	for(var i = period - 1; i >= 0; i--){
		async.waterfall([
			function(callback){

				var element = '';
				var index = i;
				connection.query(queryString, [index, key, index, key], function(err, rows, fields){
					if(err) throw err;

					if(index === 0){
						for(var j = 0; j < rows.length; j++){
							result.keys.push(rows[j].appversion);
						}
					}
					console.log(index);
					//result.stat_appversion
					element += '{ \"datetime\": ';
					element += '\"' + rows[0].datetime + '\"';
					for(var k = 0; k < rows.length; k++){
						element += ', ' + '\"'+rows[k].appversion+ '\"';
						element += ': ' + rows[k].count;
					}
					element += '}';
					element = JSON.parse(element);
					result.values.push(element);
					callback(null, index, result);
				});
			}
		], function(err, index, result){
			if(index === 0){
				res.send(result);
			}
		});
	}
});




// 통계 페이지 device (상위 9개)
app.get('', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select device, count(*) as count ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval 1 week ' +
		'group by device order by count desc limit 9';
	var result = new Object();

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows;

		res.send(result);
	});
});




// 통계 페이지 android sdkversion(osversion)
app.get('', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select osversion, count(*) as count ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval ? day ' +
		'group by osversion';
	var result = new Object();
	var period = 7;

	connection.query(queryString, [key, period], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows;

		res.send(result);
	});
});



// 통계 페이지 android sdkversion(osversion) + rank 분류 추가
app.get('/statistics/:project_id/osversion_rank', function(req, res){
	var key = req.params.project_id;
	var period = 7;
	var queryString = 'select instance.osversion, error.rank, count(rank) as rank_count ' +
		'from instance, error ' +
		'where instance.project_id = ? and instance.error_id = error.id and datetime >= now() - interval ? day ' +
		'group by appversion';

	connection.query(queryString, [key, period], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows;

		res.send(result);
	});
});


// 통계 페이지 country
app.get('/statistics/:project_id/country', function(req, res){
	var key = req.params.project_id;
	var period = 7;
	var queryString = 'select country, count(*) as count ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval ? day ' +
		'group by country order by country desc';

	connection.query(queryString, [key, period], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows;

		res.send(result);
	});
});


// 통계 페이지 lastactivity
app.get('/statistics/:project_id/lastactivity', function(req, res){
	var key = req.params.project_id;
	var period = 7;
	var queryString = 'select lastactivity, count(*) as count ' +
		'from instance ' +
		'where project_id = ? and datetime >= now() - interval ? day ' +
		'group by lastactivity order by lastactivity desc';

	connection.query(queryString, [key, period], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows;

		res.send(result);
	});
});


// proguard list
app.get('/proguard/:project_id', function(req, res){
	//
	var key = req.params.project_id;
	var queryString = 'select id, appversion, filename, date_format(uploadtime, \'%Y-%m-%d %T\') as uploadtime ' +
		'from proguard ' +
		'where project_id = ?';

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result = rows;

		res.send(result);
	});
});