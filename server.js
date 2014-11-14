var arena = {
    w: 300,
    h: 300,
    respawn: 100,
    u_rate: 33 //10 16 33 100
};
var bomb = {
    draw_radius: false,
    radius: 3,
    explode_s: 2,
    explode_rad: 50,
    explode_anim: 11
};
var player = {
    step: 2,
    w: 10,
    h: 10,
    max_bomb: 5
};
var log_set = {
    length: 5
};

var app = require('http').createServer(handler);
var io = require('socket.io')(app);
var fs = require('fs');

io.set('origins', '*:8080');
app.listen(8080);

function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.readFile(__dirname + '/client.html', function (err, data) {
        if (err) {
            res.writeHead(500);
            return res.end('Error loading client.html');
        }

        res.writeHead(200);
        res.end(data);
    });
}

var tick = true;
var bombs = [];
var players = [];
var logs = [];
var updateId = null;

var randomStart = {
    x: function () {
        return Math.floor((Math.random() * (arena.w - player.w)) + 1);
    },
    y: function () {
        return Math.floor((Math.random() * (arena.h - player.h)) + 1);
    }
};
function getRandomHexColor() {
    var r = Math.floor(Math.random() * 16777215);
    for (var i in players) {
        if (Math.abs(parseInt(players[i].color.slice(1), 10) - r) < 1000) {
            r = false;
            break;
        }
    }
    if (r) {
        return '#' + r.toString(16);
    }

    return getRandomHexColor();

}
function now() {
    var dt = new Date();
    return '[' + lead(dt.getDate()) + '.' + lead(dt.getMonth() + 1) + '.' + dt.getFullYear() + ' ' + lead(dt.getHours()) + ':' + lead(dt.getMinutes()) + ':' + lead(dt.getSeconds()) + ']';
}
function log(msg) {
    console.log(now() + ' ' + msg);
}
function lead(a) {
    return a < 10 ? '0' + a : a;
}
function timestamp() {
    return Math.round((new Date()).getTime());
}

io.on('connection', function (socket) {

    log('Connected: ' + socket.id);
    var color = getRandomHexColor();
    players[socket.id] = {
        x: randomStart.x(),
        y: randomStart.y(),
        color: color,
        bombs: 0,
        dead: false,
        win: 0
    };
    socket.emit('init', {arena: arena, player: player, bomb: bomb});
    if (updateId == null) {
        update();
    }

    socket.on('setName', function (name) {
        players[socket.id].name = name.substr(0, 15);
    });

    socket.on('updateMe', function (data) {
        var x = data['x'];
        var y = data['y'];
        var place_bomb = data['place_bomb'];

        if (typeof players[socket.id] !== 'undefined') {
            if (Math.abs(x) + Math.abs(y) == 2 * player.step) {
                if (tick) {
                    x = 0;
                } else {
                    y = 0;
                }
            }
            var temp = {};

            temp.x = players[socket.id].x + x;
            temp.y = players[socket.id].y + y;

            if (((Math.abs(x) == player.step || x == 0) && (Math.abs(y) == player.step || y == 0)) && temp.x >= 0 && temp.y >= 0 && temp.x <= arena.w - player.w && temp.y <= arena.h - player.h) // out of borders
            {
                for (i in bombs) {
                    if (bombs[i].owner == socket.id) {
                        if (timestamp() - bombs[i]['time'] < 1000) {
                            place_bomb = false;
                        }
                    }
                }
                if (place_bomb && players[socket.id].bombs < player.max_bomb && !players[socket.id].dead) {
                    players[socket.id].bombs++;
                    bombs.push({
                        x: temp.x + player.w / 2,
                        y: temp.y + player.h / 2,
                        time: timestamp(),
                        owner: socket.id,
                        color: players[socket.id].color
                    });
                }
                players[socket.id].x = temp.x;
                players[socket.id].y = temp.y;
            }
        }
    });

    socket.on('disconnect', function () {
        log('Disconnected: ' + socket.id);
        if (typeof players[socket.id] !== 'undefined') {
            delete players[socket.id];
        }
    });
});

function update() {
    var toUpdate = {};
    for (var i in players) {
        if (typeof players[i].name !== 'undefined') {
            if (!players[i].dead) {
                toUpdate[i] = players[i];
            } else {
                players[i].dead--;
                players[i].x = randomStart.x();
                players[i].y = randomStart.y();
            }
        }
    }

    for (i in bombs) {
        if (typeof bombs[i]['boom'] != 'undefined' && bombs[i]['boom'] == bomb.explode_anim) {
            if (typeof players[bombs[i].owner] !== 'undefined') {
                players[bombs[i].owner].bombs--;
                bombs.splice(i, 1);
            }
        }
        else if (bombs[i]['time'] + bomb.explode_s * 1000 < timestamp()) {
            if (typeof bombs[i]['boom'] == 'undefined') {
                bombs[i]['boom'] = 0;
            } else {
                bombs[i]['boom']++;
            }

            for (var j in players) {
                var dx = players[j].x + player.w / 2 - bombs[i].x;
                var dy = players[j].y + player.h / 2 - bombs[i].y;
                if (Math.sqrt(dx * dx + dy * dy) <= bomb.explode_rad) {
                    if (typeof players[bombs[i].owner] !== 'undefined') {
                        if (j != bombs[i].owner && !players[j].dead) {
                            players[bombs[i].owner].win++;
                            if (logs.length == log_set.length) {
                                logs.splice(0, 1);
                            }
                            logs.push(players[bombs[i].owner].name + ' killed ' + players[j].name);
                        }
                        if (j == bombs[i].owner && !players[j].dead) {
                            players[bombs[i].owner].win--;
                            if (logs.length == log_set.length) {
                                logs.splice(0, 1);
                            }
                            logs.push(players[j].name + ' committed suicide');
                        }
                    }
                    players[j].dead = arena.respawn;
                }
            }
        }
    }

    io.emit('redraw', {players: toUpdate, bombs: bombs, logs: logs});
    tick = !tick;
    updateId = setTimeout(update, arena.u_rate);
}
log('Server started. Port');
