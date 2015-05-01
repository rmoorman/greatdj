var express = require('express');
var bodyParser = require('body-parser');
var mongo = require('mongodb').MongoClient;
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var geoip = require('geoip-lite');
var isMobile = require('ismobilejs');
var credentials = require('./auth.json');
var auth = require('basic-auth');
var request = require('superagent');

var db;
var playlistController = {};
var activeIpsController = {};
var playlistClients = {};
var latestVersion = {};
var recentSearches = [];
var fbToken;
var graphApi = 'https://graph.facebook.com/';
var youTubeListApi = 'https://www.googleapis.com/youtube/v3/videos';
var youtubeApiKey = 'AIzaSyBOUg2rsWYmnU627izv30PK60ctKzw9h9k';

app.set('port', process.env.PORT || 8080);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/dist', express.static(__dirname + '/dist'));
app.use('/static', express.static(__dirname + '/static'));
app.set('views', __dirname + '/');
app.use('/components', express.static(__dirname + '/components'));
app.set('view engine', 'html');
app.engine('html', require('hbs').__express);

// Routes

/**
  POST /p
  Saves (or overrides) a playlist.
**/
app.post('/p', function(req, res){
  var ip = getRemoteIpAddress(req);

  if(req.body.id){
    // update - just overwrite for now
    playlistController.update(req.body.id, req.body, res.send.bind(res));
  } else {
    // insert new record
    var data = req.body;
    data.ip = ip;
    playlistController.insert(data, res.send.bind(res));
  }
});

/**
  POST /s
  Saves a new recent search.
**/
app.post('/s', function(req, res){
  if(req.body.term){
    if(recentSearches.indexOf(req.body.term)+1){ //exists
      recentSearches.splice(recentSearches.indexOf(req.body.term), 1);
      recentSearches.push(req.body.term);
    } else {
      recentSearches.push(req.body.term);
      if(recentSearches.length > 10) recentSearches.shift();
    }
  }
  res.send({ok: 'ok'});
});

/**
  POST /fb_s
  Queries a Facebook page for posts and returns an array of Youtube videos.
**/
app.post('/fb_s', function(req, res){
  var result = {items: []};

  if(req.body.id){
    request
      .get(graphApi + 'v2.2/' + req.body.id + '/posts')
      .query({access_token: fbToken})
      .accept('json')
      .end(function(err, response){
        if(err || !response.body || !response.body.data){
          return res.send(result);
        }

        result.items = response.body.data
          .filter(function(post){
            return post.link && post.link.match(/youtube.com\/watch/);
          })
          .map(function(ytpost){
            var id = ytpost.link.match(/youtube.com\/watch\?v=(.*)/)[1];
            return {
              id: id,
              snippet: {
                title: ytpost.name,
                thumbnails: {
                  medium: {url: ytpost.picture}
                }
              }
            };
          });

        res.send(result);

      });
  } else {
    res.send({error: 'Required parameter id missing!'});
  }
});

/**
  POST /url_s
  Parses a web page returning all Youtube videos it finds along the way.
**/
app.post('/url_s', function(req, res){
  var result = {items: []};

  if(req.body.url){
    request
      .get(req.body.url)
      .end(function(err, response){
        var videos = response.text.match(/youtube.com\/embed\/(.*)\?/g);

        if(!videos){
          res.send(result);
          return;
        }

        var ids = videos.map(function(vid){
            return vid.match(/youtube.com\/embed\/(.*)\?/)[1];
          }).join(',');

        request.get(youTubeListApi)
          .accept('json')
          .query({
            part: 'snippet',
            id: ids,
            key: youtubeApiKey
          }).end(function(e, response){
            result.items = response.body.items;
            res.send(result);
          });
      });
  } else {
    res.send({error: 'Required parameter url missing!'});
  }
});


/**
  GET /p
  Gets a saved playlist by query id.
**/
app.get('/p', function(req, res){
  playlistController.get(req.query.id, res.send.bind(res));
});

/**
  GET /s
  Gets all the recently saved searches.
**/
app.get('/s', function(req, res){
  res.send({terms: recentSearches});
});

/**
  GET /popular_playlists
  Gets all the recently saved searches.
**/
app.get('/popular_playlists', function(req, res){
  res.send({playlists: popularPlaylists});
});

/**
  GET /admin
  Admin stuff.
**/
app.get('/admin', function(req, res){
  var user = auth(req);

  if(!user || !(user.name === credentials.username && user.pass === credentials.password)){
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="Authorization Required"');
    res.end('Unauthorized');
  } else {
    activeIpsController.getAll(function(result){
      result.forEach(function(party, i){
        party.numClients = activeIpsController.clients[party.ip];
      });
      res.render('admin', {activeIps: result});
    });
  }
});

/**
  GET *
  Everything else - serves index.html.
**/
app.get('*', function(req, res){
  if(isMobile(req.headers['user-agent']).any){
    activeIpsController.getPlaylistId(getRemoteIpAddress(req), function(ids){
      res.render('index', {data: passVar({playlists: ids, recent: recentSearches})});
    });
  } else {
    res.render('index', {data: passVar({recent: recentSearches})});
  }
});

// db - Mongo Connect
mongo.connect("mongodb://localhost/greatdj", function(err, database) {
  db = database;
  http.listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
  });
});

// socket io for realtime updates on playlists across clients
io.on('connection', function(socket){
  // socket is the client socket
  // global vars that belong to each socket
  var plId;
  var myIp;

  console.log(' * new connection');

  socket.on('register', function(data){
    console.log(' * client connected', data.id);

    playlistClients[data.id] = playlistClients[data.id] || [];
    playlistClients[data.id].push(socket);
    plId = data.id;

    if(playlistClients[data.id].length > 1 && latestVersion[data.id]){
      socket.emit('playlistChange', latestVersion[data.id]);
    } else {
      playlistController.get(data.id, function(data){
        socket.emit('playlistChange', data);
      });
    }

    activeIpsController.set(socket.request.connection.remoteAddress, data.id);
    myIp = socket.request.connection.remoteAddress;

  });

  socket.on('disconnect', function(){
    console.log(' * client disconnected', plId);
    //remove from playlistClients playlistClients
    if(plId){
      for (var i = playlistClients[plId].length - 1; i >= 0; i--) {
        if(playlistClients[plId][i] === socket){
          playlistClients[plId].splice(i, 1);
          break;
        }
      }

      if(!playlistClients[plId].length){
        latestVersion[plId] = null;
      }

      activeIpsController.unset(myIp, plId);
      plId = null;

    }
  });

  socket.on('unregister', function(){
    console.log(' * client unregister', plId);
    //remove from playlistClients playlistClients
    if(plId){
      for (var i = playlistClients[plId].length - 1; i >= 0; i--) {
        if(playlistClients[plId][i] === socket){
          playlistClients[plId].splice(i, 1);
          break;
        }
      }

      activeIpsController.unset(socket.request.connection.remoteAddress, plId);
      plId = null;
    }
  });

  socket.on('changedPlaylist', function(data){
    console.log(' * changedPlaylist:', data.id);

    latestVersion[data.id] = data;

    for (var i = playlistClients[data.id].length - 1; i >= 0; i--) {
      var subscriber = playlistClients[data.id][i];
      if(subscriber !== socket){
        subscriber.emit('playlistChange', data);
      }
    }
  });

});

// playlist controllers controllers - get them out of here some day
playlistController.insert = function(data, callback){
  var id = Math.random().toString(36).slice(3,9); // revisit
  var geo = geoip.lookup(data.ip);

  var doc = {id: id, playlist: data.playlist, ip: data.ip, geo: geo, created: new Date()};

  db.collection('playlists').insert(doc, {w:1}, function(err, result) {
    console.log('insert ok ', id);
    callback({operation: 'insert', id: id});
  });
};

playlistController.update = function(id, data, callback){
  db.collection('playlists').update({id: id}, {$set:{playlist: data.playlist}}, {w:1}, function(err, result) {
    console.log('update ok ', id);
    callback({operation: 'update', id: id});
  });
};

playlistController.get = function(id, callback){
  db.collection('playlists').findOne({id: id}, function(err, item) {
    callback(item);
  });
};

activeIpsController.clients = {};
activeIpsController.set = function(ip, plId){
  console.log(ip, 'connected to', plId);
  if(!ip && !plId) return;
  var doc = {ip: ip, playlistId: plId};

   db.collection('activeIps').update({ip: ip}, {$set: {playlistId: plId}}, {w:1, upsert: true}, function(err, result) {
    activeIpsController.clients[ip] = activeIpsController.clients[ip] ? +activeIpsController.clients[ip] + 1 : 1;
    console.log('registred ip ', ip, 'to', plId);
  });

};

activeIpsController.unset = function(ip, plId){
  if(activeIpsController.clients[ip]){
    activeIpsController.clients[ip] = +activeIpsController.clients[ip] - 1;
  }

  if(!activeIpsController.clients[ip])
     db.collection('activeIps').remove({ip: ip, playlistId: plId}, function(err, result) {
      delete activeIpsController.clients[ip];
      console.log('deleted ip ', ip, 'from', plId);
    });
};

activeIpsController.getPlaylistId = function(ip, fn){
   db.collection('activeIps').find({ip: ip}).toArray(function(err, result) {
    fn(result.map(function(el){ return el.playlistId; }));
  });
};

activeIpsController.getAll = function(fn){
   db.collection('activeIps').find().toArray(function(err, result) {
    fn(result);
  });
};

// Utils - this file is getting ridiculous :(
function getRemoteIpAddress(req){
 // have to do it this way as it's being served by apache so remoteAddress would always be 127.0.0.1 ...
 return (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : '127.0.0.1');
}

function passVar(object){
  return new Buffer(JSON.stringify(object)).toString('base64');
}


// Generate FB Access Token
request
  .get(graphApi + 'oauth/access_token')
  .query({
    'grant_type': 'client_credentials',
    'client_id': credentials.fb_app,
    'client_secret': credentials.fb_secret
  })
  .end(function(err, response){
    var id = response.text.split('=')[1];
    console.log(' * got fb access token', id);
    fbToken = id;
  });
