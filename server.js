var express =			require('express');
var cookieSession = 	require('cookie-session');
var url =				require('url');
var querystring =		require('querystring');
var pg =				require('pg');
var format =			require('pg-format');
var utils =				require('utils');

var PGUSER = 			'postgres';
var PGDATABASE = 		'chatTool';
var PGPASSWORD = 		'talkamynn';

var app =				express();
var server = 			require('http').Server(app);
var io =				require('socket.io').listen(server);

var config = {
	user:				PGUSER,
	password:			PGPASSWORD,
	database:			PGDATABASE,
	max:				10,
	idleTimeoutMillis:	30000
};

var pool =				new pg.Pool(config);
var room =				{};
var userData = 			{};
var rooms =				[];
var activeUsers = 		[];
var history = 			[];
var historys = 			[];
var connectedUsers = 	0;
var myClient;

// console.log(
// 	utils.formatDate() +
// 	' - Error/Warn/Debug/Info - <text> '
// );

pool.connect(function(err, client, done) {
		if (err) {
			console.log(
				utils.formatDate() +
				' - Error - Unable to connect to database: ' + err
			);
		} else {
			myClient = client;
			var roomQuery = format("SELECT id, name, private, password, creator_id FROM room;");

			console.log(
				utils.formatDate() +
				' - Debug - roomQuery ready: '
			);
			console.log(
				utils.formatDate() +
				' - Debug -             |___ ' + roomQuery
			);

			myClient.query(roomQuery, function(err, result) {

				// Error handling
				if (err) {
					console.log(
						utils.formatDate() +
						' - Error - Unable to run query: ' + err
					);
				} else if (result.rowCount == 0) {
					console.log(
						utils.formatDate() +
						' - Warn - No room in database.'
					);
				} else {
					for (var i = 0; i < result.rows.length; i++) {
						room = {
							id: result.rows[i].id,
							name: result.rows[i].name,
							users: 0,
							private: result.rows[i].private,
							password: result.rows[i].password,
							creator_id: result.rows[i].creator_id
						};
						rooms.push(room);
					};
					console.log(
						utils.formatDate() +
						' - Debug - Rooms fetched: '
					);
					console.log(rooms);
				}
			});
		}
});

app.use(express.static(__dirname + '\\public'))
.use(cookieSession({
	name: 'session',
	keys: ['bar', 'foo'],

	maxAge: 24 * 60 * 60 * 1000
}))
.use(function(req, res, next)  {
	res.locals.session = req.session;
	next();
});

// Get empty route, go to home page
app.get('/', function(req, res) {
	res.setHeader('Content-Type', 'text/html');
	res.render('home.ejs');
});

// Get log in route, check credentials and go to rooms page
app.get('/logIn', function(req, res) {
	var params = querystring.parse(url.parse(req.url).query);
	userData = {
		userName: params['userName'],
		password: params['pwd']
	}

	pool.connect(function(err, client, done) {
		if (err) {
			console.log(
				utils.formatDate() +
				' - Error - Unable to connect to database: ' + err
			);
		} else {
			myClient = client;
			var logInQuery = format(
				"SELECT id FROM public.\"user\" " +
				"WHERE user_name = '" + userData.userName + "' " +
				"AND password = '" + userData.password + "'");

			console.log(
				utils.formatDate() +
				' - Debug - logInQuery ready: '
			);
			console.log(
				utils.formatDate() +
				' - Debug -              |___ ' + logInQuery
			);

			myClient.query(logInQuery, function(err, result) {

				// Error handling
				if (err) {
					console.log(
						utils.formatDate() +
						' - Error - Unable to run query: ' + err
					);

					res.setHeader('Content-Type', 'text/html');
					res.render(
						'home.ejs',
						{
							userData: userData,
							error: 'Unable to log you in, please try later.'
						}
					);
				} else if (result.rowCount == 0) {
					console.log(
						utils.formatDate() +
						' - Warn - No user in database with those credentials : ' + userData.userName + '/' + userData.password
					);
					res.setHeader('Content-Type', 'text/html');
					res.render(
						'home.ejs',
						{
							userData: userData,
							error: 'Unable to identify, please check your credentials.'
						}
					);
				} else {

					req.session.username = params['userName'];
					req.session.userid = result.rows[0].id;
					console.log(userData);
					console.log(result);

					res.setHeader('Content-Type', 'text/html');
					res.redirect('/rooms');
				}
			});
		}
	});
});

// Get sign in route, display sign in form
app.get('/signIn', function(req, res) {
	res.setHeader('Content-Type', 'text/html');
	res.render('signIn.ejs');
});

// Get log out route, destroy session and go to home page
app.get('/logOut', function(req, res) {
	req.session = null;
	res.setHeader('Content-Type', 'text/html');
	res.redirect('/');
});

// Get sign in data, if successful registered, go to profile page
app.get('/signIn/confirm', function(req, res) {
	var params = querystring.parse(url.parse(req.url).query);
	var userData = {
		userName: params['userName'],
		firstName: params['firstName'],
		lastName: params['lastName'],
		password: params['pwd']
	};

	pool.connect(function(err, client, done) {
		if (err) {
			console.log(
				utils.formatDate() +
				' - Error - Unable to connect to database: ' + err
			);
			res.setHeader('Content-Type', 'text/html');
			res.render(
				'signIn.ejs',
				{
					userData: userData,
					error: 'Unable to sign you up, please try again later.'
				}
			);
		} else {

			myClient = client;
			var signInQuery = format(
				"INSERT INTO public.\"user\" " +
				"(user_name, first_name, last_name, password) " +
				"VALUES ('" + userData.userName + "', '" + userData.firstName + "', '" + userData.lastName + "', '" + userData.password + "') " +
				"RETURNING id;");

			console.log(
				utils.formatDate() +
				' - Debug - signInQuery ready: '
			);
			console.log(
				utils.formatDate() +
				' - Debug -               |___ ' + signInQuery
			);
			
			myClient.query(signInQuery, function(err, result) {
				if (err) {
					console.log(err);
					console.log(
						utils.formatDate() +
						' - Error - Unable to run query: ' + err
					);
					var error = err.detail.substr(err.detail.lastIndexOf('.') - 14);
					// Check if user name is already used
					if (error == 'already exists.') {
						res.setHeader('Content-Type', 'text/html');
						res.render(
							'signIn.ejs',
							{
								userData: userData,
								error: 'This user name already exists, please select another one.'
							}
						);
					}
				} else {
					req.session.username = params['userName'];
					req.session.userid = result.rows[0].id;
					console.log(result);
					res.setHeader('Content-Type', 'text/html');
					res.redirect('/profile/' + result.rows[0].id);
				}
			});
		}
	});
});

// Get legal route, go to legal page
app.get('/legal', function(req, res) {
	res.setHeader('Content-Type', 'text/html');
	res.render('legal.ejs');
});

// Get specific profile route, go to user profile
app.get('/profile/:userid', function(req, res) {
	if (!req.session.userid) {
		goHome(res);
	}
	res.setHeader('Content-Type', 'text/html');
	var id = req.params.userid;
	var message = '';
	userData = {};
	var data = {};
	pool.connect(function(err, client, done) {
		if (err) {
			console.log(
				utils.formatDate() +
				' - Error - Unable to connect to database: ' + err
			);
			message = 'Unable to get your profile information, please try again later.';
			data = {
				userData: userData,
				error: message
			};
			doRender(res, 'profile', data);
		} else {
			if (req.session.userid != id) {
				console.log('User ' + req.session.userid + ' try to get profile for another one: ' + id + '.');
				message = 'Don\'t try to be smart, it\'s out of reach for you.';
				data = {
					userData: userData,
					error: message
				};
				doRender(res, 'profile', data);
			} else {
				myClient = client;
				var getProfileQuery = format(
					"SELECT * " +
					"FROM public.\"user\" " +
					"WHERE id = " + id + ";"
				);

				console.log(
					utils.formatDate() +
					' - Debug - getProfileQuery ready: '
				);
				console.log(
					utils.formatDate() +
					' - Debug -                   |___ ' + getProfileQuery
				);

				myClient.query(getProfileQuery, function(err, result) {
					if (err) {
						console.log(err);
						message = 'Unable to get your profile information, please try again later.';
						data = {
							userData: userData,
							error: message
						};
						doRender(res, 'profile', data);
					} else if (result.rowCount == 0) {
						console.log(result);
						// res.setHeader('Content-Type', 'text/html');
						message = 'Unable to get your profile information, please try again later.';
						data = {
							userData: userData,
							error: message
						};
						doRender(res, 'profile', data);
					} else {
						for (var i = 0; i < result.rows.length; i++) {
							userData = {
								id: result.rows[i].id,
								userName: result.rows[i].user_name,
								firstName: result.rows[i].first_name,
								lastName: result.rows[i].last_name,
								password: result.rows[i].password
							};
						};
						console.log(userData);
						data = {
							userData: userData
						};
						doRender(res, 'profile', data);
					}
				});
			}
		}
	});
});

// Get bugReport route, display report bug form
app.get('/bugReport', function(req, res) {
	res.setHeader('Content-Type', 'text/html');
	res.render('bugReport.ejs');
});

// Get rooms route, display rooms lists
app.get('/rooms', function(req, res) {
	if (!req.session.userid) {
		goHome(res);
	}
	res.setHeader('Content-Type', 'text/html');
	res.render('rooms.ejs',
		{
			rooms: rooms
		}
	);
});

// Get join room route, open connection and start the chat
app.get('/room/:roomid', function(req, res) {
	if (!req.session.userid) {
		goHome(res);
	}

	var roomId = req.params.roomid;
	var room;

	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i].id == roomId) {
			room = rooms[i];
		}
	}

	async function loadRoom() {
		try {
			history = await getRoomHistory(roomId);
			console.log(history);
			if (history['error']) {
				data = {
					rooms: rooms,
					error: history.error
				}
				doRender(res, 'rooms', data);
			} else if (history['empty']) {
				data = {
					roomData: room,
					history: [],
					error: history.empty
				}
				doRender(res, 'room', data);
			}

			room.users++;
			connectedUsers++;

			data = {
				roomData: room,
				history: history
			}
			doRender(res, 'room', data);
		} catch(e) {
			data = {
				rooms: rooms,
				error: 'Unexpected error: ' + e
			}
			doRender(res, 'rooms', data);
		}
	}
	loadRoom();
});

// Get edit room route, go to edit room page
app.get('/room/edit/:roomid', function(req, res) {
	if (!req.session.userid) {
		goHome(res);
	}
	res.setHeader('Content-Type', 'text/html');
	res.redirect('/rooms');
});

// Get new room route, go to create room page
app.get('/newRoom', function(req, res) {
	if (!req.session.userid) {
		goHome(res);
	}
	res.setHeader('Content-Type', 'text/html');
	res.render('newRoom.ejs');
});

// Get new room data, create it and open connection to start to chat 
app.get('/newRoom/confirm', function(req, res) {
	if (!req.session.userid) {
		res.setHeader('Content-Type', 'text/html');
		res.redirect('/');
	}
	var params = querystring.parse(url.parse(req.url).query);
	console.log(
		utils.formatDate() +
		' - Debug - query params: '
	);
	console.log(params);
	var roomData = {
		roomName: params['roomName'],
		private: params['private'],
		password: params['password']
	};

	pool.connect(function(err, client, done) {
		if (err) {
			console.log(
				utils.formatDate() +
				' - Error - Unable to connect to database: ' + err
			);
			res.setHeader('Content-Type', 'text/html');
			res.render(
				'newRoom.ejs',
				{
					roomData: roomData,
					error: 'Unable to create new room, please try again later.'
				}
			);
		} else {
			myClient = client;
			var createRoomQuery = format(
				"INSERT INTO public.\"room\" " +
				"(name, private, password, creator_id) " +
				"VALUES ('" + roomData.roomName + "', '" + roomData.private + "', '" + roomData.password + "', " + req.session.userid + ") " +
				"RETURNING id;");

			console.log(
				utils.formatDate() +
				' - Debug - createRoomQuery ready: '
			);
			console.log(
				utils.formatDate() +
				' - Debug -               |___ ' + createRoomQuery
			);
			
			myClient.query(createRoomQuery, function(err, result) {
				if (err) {
					console.log(err);
					console.log(
						utils.formatDate() +
						' - Error - Unable to run query: ' + err
					);
					var error = err.detail.substr(err.detail.lastIndexOf('.') - 14);
					if (error == 'already exists.') {
						res.setHeader('Content-Type', 'text/html');
						res.render(
							'newRoom.ejs',
							{
								roomData: roomData,
								error: 'This room name already exists, please select another one.'
							}
						);
					}
				} else {
					console.log(result);
					room = {
						id: result.rows[0].id,
						name: roomData.roomName,
						users: 0,
						private: roomData.private,
						password: roomData.password,
						creator_id: req.session.userid
					};
					rooms.push(room);
					res.setHeader('Content-Type', 'text/html');
					res.redirect('/room/join/' + result.rows[0].id);
				}
			});
		}
	});
});

// Handle unknown routes, and send 404 error
app.use(function(req, res, next) {
	res.setHeader('Content-Type', 'text/html');
	res.status(404);
	res.render('404.ejs');
});

server.listen(8080);

function doRender(res, page, data) {
	res.setHeader('Content-Type', 'text/html');
	res.render(
		page + '.ejs',
		data
	);
}

function goHome(res) {
	res.setHeader('Content-Type', 'text/html');
	res.redirect('/');
}

function getRoomHistory(roomId) {
	return new Promise((resolve) => {
		console.log(
			utils.formatDate() +
			' - Debug - Start to get history from room ' + roomId
		);
		pool.connect(function(err, client, done) {
			if (err) {
				console.log(
					utils.formatDate() +
					' - Error - Unable to connect to database: ' + err
				);
				message = 'Unable to get room history, please try again later.';
				data = {
					error: message
				};
				resolve(data);
			} else {
				myClient = client;
				var getRoomHistoryQuery = format(
					"SELECT * " +
					"FROM public.\"history\" " +
					"WHERE room_id = " + roomId + 
					"ORDER by time DESC;"
				);

				console.log(
					utils.formatDate() +
					' - Debug - getRoomHistoryQuery ready: '
				);
				console.log(
					utils.formatDate() +
					' - Debug -                       |___ ' + getRoomHistoryQuery
				);

				myClient.query(getRoomHistoryQuery, function(err, result) {
					if (err) {
						console.log(err);
						message = 'Unable to get room history, please try again later.';
						data = {
							error: message
						};
						resolve(data);
					} else if (result.rowCount == 0) {
						console.log(
							utils.formatDate() +
							' - Debug - No room history'
						);
						message = 'No room history.';
						data = {
							empty: message
						};
						resolve(data);
					} else {
						for (var i = 0; i < result.rows.length; i++) {
							history = {
								type: result.rows[i].type,
								user_id: result.rows[i].user_id,
								message: result.rows[i].message,
								time: result.rows[i].time
							};
						};
						console.log(history);
						resolve(data);
					}
				});
			}
		});
	});
}

// When a client is connected, log it in the console
io.sockets.on('connection', function(socket) {

	console.log(
		utils.formatDate() +
		' - Info - New client connected'
	);

	socket.emit(
		'message',
		{
			type: 'validConn',
			content: 'Connection established',
			userColor: utils.randomColor(),
			history: [],
			time: utils.formatDate(2)
		}
	);

	socket.on('userMessage', function(userMessage) {
		var time = utils.formatDate(2);
		console.log(
			utils.formatDate() +
			' - Info - New user message'
		);
		var elem = {
			userName: socket.pseudo,
			userColor: socket.userColor,
			time: time,
			message: userMessage
		};
		console.log(utils.formatDate() + ' - Debug - New history element: ');
		console.log(elem);
		history.push(elem);
		socket.broadcast.emit(
			'message',
			{
				type: 'userMessage',
				userName: socket.pseudo,
				content: userMessage,
				time: time,
				userColor: socket.userColor
			}
		);
		socket.emit(
			'message',
			{
				type: 'successSend',
				time: time
			}
		);
	});

	socket.on('iAmAlive', function() {
		for (var i = 0; i < activeUsers.length; i++) {
			if (socket.pseudo == activeUsers[i].pseudo) {
				// console.log(utils.formatDate() + ' - Debug - ' + socket.pseudo + ' is still alive !');
				activeUsers[i].lastAlive = Date.now();
			}
		}
	});

	socket.on('disconnect', function() {
		var time = utils.formatDate(2);
		console.log(utils.formatDate() + ' - Debug - Disconnection request');
		if (socket.pseudo) {
			connectedUsers--;
			socket.broadcast.emit('message', {
				type: 'userLeft',
				content: socket.pseudo + ' left the chat.',
				users: connectedUsers,
				time: time
			});
			var elem = {
				userName: '',
				userColor: '',
				time: time,
				message: socket.pseudo +
						' left the chat'
			};
			history.push(elem);
			var index = activeUsers.indexOf(socket);
			activeUsers.splice(index, 1);
			socket.disconnect();
			console.log(utils.formatDate() + ' - Debug - User disconnected');
		}
	});

	setInterval(function() {
		for (var i = 0; i < activeUsers.length; i++) {
			if (activeUsers[i].lastAlive > Date.now() - 5000) {
				activeUsers[i].emit('areYouAlive');
			} else {
				var pseudo = activeUsers[i].pseudo;
				console.log(utils.formatDate() + ' - Debug - ' + pseudo + ' is going to be disconnected...');
				connectedUsers--;
				activeUsers[i].broadcast.emit('message', {
					type: 'userLeft',
					content: activeUsers[i].pseudo + ' left the chat.',
					users: connectedUsers
				});
				activeUs;ers[i].close();
				activeUsers.splice(i, 1);
				console.log(utils.formatDate() + ' - Debug - User disconnected');
			}
		}
	}, 1000);
});
