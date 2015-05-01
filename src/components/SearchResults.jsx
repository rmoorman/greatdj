 /**
  * @jsx React.DOM
  */

var React = require('react'),
    IntroComponent = require('./IntroComponent');

var SearchResults = React.createClass({
  handleVideoEnqueue: function(video){
    this.props.enqueueHandler(video.id.videoId || video.id, video.snippet.title, 'youtube');
    return false;
  },

  handlePlayNow: function(video){
    this.props.playNowHandler(video.id.videoId || video.id, video.snippet.title, 'youtube');
    return false;
  },

  render: function() {
    var resultsList = this.props.videos.map(function(res, i){
      var rowClassName = 'row ' + (i % 2 ? 'odd' : 'even');
      return (
        <tr key={res.id.videoId} className={rowClassName}>
          <td className="imgTd">
            <a onClick={this.handleVideoEnqueue.bind(this, res)} href="#">
              <img className="thumbnail" src={ res.snippet.thumbnails.medium.url } />
            </a>
          </td>
          <td className="descTd">
            <a onClick={this.handleVideoEnqueue.bind(this, res)} href="#">
              { res.snippet.title }
            </a>
            <div className="mobile">
              <button ref="enq" className="primary" onClick={this.handleVideoEnqueue.bind(this, res)}>Enqueue</button>
              <button ref="play" onClick={this.handlePlayNow.bind(this, res)}>Play now</button>
            </div>
          </td>
          <td className="buttonTd desktop">
            <button ref="enq" className="primary" onClick={this.handleVideoEnqueue.bind(this, res)}>Enqueue</button>
            <button ref="play" onClick={this.handlePlayNow.bind(this, res)}>Play now</button>
          </td>
        </tr>
      )
    }, this)

    if(resultsList.length){
      return (
        <div className="results-container">
          <table className="results">
            <thead>
            </thead>
            <tbody>
              { resultsList }
            </tbody>
          </table>
        </div>
      );
    } else {
      return (
        // popular searches vs popular playlists (includes...)
        <IntroComponent
          recentTerms={this.props.recentTerms}
           />
      );
    }
  }

 });

module.exports = SearchResults;

