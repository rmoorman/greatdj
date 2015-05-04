
var geoip = require('geoip-lite');
var utils = require('../utils');

// Playlist model
var Playlist = require('../models/playlist');

/**
  Controller that saves and loads playlists

**/

var PlaylistController = function(db){
  var api = {};
  Playlist.setup(db);

  // API to be used in Router calls
  api.savePlaylist = function(req, res){
    var ip = utils.getRemoteIpAddress(req);

    if(req.body.id){
      // update - just overwrite for now
      Playlist.update({id: req.body.id}, {$set:{playlist: req.body.playlist}}, function(err, result){
        console.log('update ok ', req.body.id);
        res.send(result);
      });
    } else {
      // insert new record
      var data = req.body;
      data.ip = ip;
      Playlist.createNewPlaylist(data, function(err, result){
        var id = result.ops[0].id;
        console.log('insert ok ', id);
        res.send({operation: 'insert', id: id});
      });
    }
  };

  api.getPlaylistById = function(req, res){

    // @todo ping redis with req.query.id


    Playlist.getPlaylistById(req.query.id, function(err, result){
      res.send(result);
    });
  };

  api.getPopularPlaylists = function(req, res){
    //@todo
  };

  return api;
};

module.exports = PlaylistController;
