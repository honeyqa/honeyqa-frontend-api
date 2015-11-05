var express = require('express');
var config = require('./../config/config.js');
var async = require('async');
var bodyParser = require('body-parser');
var app = express();

app.use(bodyParser.urlencoded());
app.use(bodyParser.json());


var mysql = require('mysql');
var connection = mysql.createConnection({
	host	 : config.host,
	user 	 : config.user,
	password : config.password,
	database : config.database,
	multipleStatements : 'true'
});

var server = app.listen(8080, function(){
	var host = server.address().address;
	var port = server.address().port;
	console.log('Honeyqa API Server Started: %s', port);
});

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
	var key = req.params.user_id;
	var queryString = 'select title, apikey, platform, category, stage, timezone, DATE_FORMAT(datetime,\'%Y-%m-%d\') as datetime ' +
		'from project ' +
		'where user_id = ?';

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		result.projects = rows;

		res.send(result);
	});
});


// 프로젝트의 일주일 동안의 에러 개수, 세션 개수
app.get('/project/:project_id/weekly_appruncount', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select error_count, session_count, DATE_FORMAT(datetime,\'%Y-%m-%d\') as datetime ' +
		'from appruncount ' +
		'where project_id = ? and datetime >= now() - interval 1 week ' +
		'order by datetime';
	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');

		var result = new Object();
		var weeklyArr = [];

		if(rows.length < 7){
			var len = 7 - rows.length;
			for(var i=0; i<len; i++){
				var element = new Object();
				element.error_count = 0;
				element.session_count = 0;
				element.date = '';
				weeklyArr.push(element);
			}
			console.log(weeklyArr);
			for(var j=0; j<rows.length; j++){
				var element = new Object();
				element.error_count = rows[j].error_count;
				element.session_count = rows[j].session_count;
				element.date = rows[j].datetime;
				weeklyArr.push(element);
			}
			console.log(weeklyArr);
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

// 프로젝트의 일주일 세션 총 개수
app.get('/project/:project_id/weekly_sessioncount', function(req, res){
	var key = req.params.project_id;
	var queryString = 'select count(*) weekly_sessioncount from session where project_id = ?';

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
	var queryString = 'select count(*) weekly_instancecount from instance where project_id = ?';

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
	var queryString = 'select count(*) weekly_instancecount from instance where project_id = ?';

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
		result = rows[0];
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
		result = rows[0];

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
		result = rows[0];

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
		result = rows[0];

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
		result = rows[0];

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
		result = rows[0];

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
		'order by rank, numofinstances desc';

	connection.query(queryString, [key], function (err, rows, fields) {
		if (err) throw err;

		var json = new Object();
		var errorsArr = [];

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
			var queryString = 'select appversion, count(*) as count from instance where project_id = ? group by appversion order by count desc';
			var key = req.params.project_id;
			var result = new Object;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_appversions = rows;
				callback(null, result);
			});
		},
		function(result, callback){
			var queryString = 'select device, count(*) as count from instance where project_id = ? group by device order by count desc';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_devices = rows;
				callback(null, result);
			});

		},
		function(result, callback){
			var queryString = 'select sdkversion, count(*) as count from instance where project_id = ? group by sdkversion order by count desc';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_sdkversions = rows;
				callback(null, result);
			});
		},
		function(result, callback){
			var queryString = 'select country, count(*) as count from instance where project_id = ? group by country order by count desc';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_countries = rows;
				callback(null, result);
			});
		},

		function(result, callback){
			var queryString = 'select errorclassname from error where project_id = ? group by errorclassname';
			var key = req.params.project_id;

			connection.query(queryString, [key], function(err, rows, fields){
				result.filter_classes = rows;
				callback(null, result);
			});
		},

		function(result, callback){
			var queryString = 'select tag from tag where project_id = ? group by tag';
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
	console.log(key);

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = rows[0];
		res.send(result);
	});
});

// 해당 인스턴스의 로그
app.get('/instance/:instance_id/console_log', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	var queryString = 'select console_log from console_log where instance_id = ? limit 1;';
	var key = req.params.instance_id;

	connection.query(queryString, [key], function(err, rows, fields){
		if(err) throw err;

		res.header('Access-Control-Allow-Origin', '*');
		var result = rows[0];
		res.send(result);
	});
});


// filtered errors 작업중
app.post('/project/:project_id/filtered_errors', function(req, res){
	//console.log('name: ' + req.body.name);
	//res.send('name: ' + req.body.name);

});