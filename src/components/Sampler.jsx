var React = require('react');

var hornMp3 = '/static/audio/horn.mp3';
    stabMp3 = '/static/audio/orch5.wav';

var sounds = {};

var Sampler = React.createClass({

  componentWillMount: function(){
    window.addEventListener('keydown', this.handleKeyDown);
  },

  handleKeyDown: function(e){
    if(e.target !== document.body) return;
    switch(e.which){
      case 72:
        this.playSound(hornMp3, 'horn', 0.2);
        break;
      case 79:
        this.playSound(stabMp3, 'stab');
        break;
    }
  },

  playSound: function(mp3, soundId, start){
    start = start || 0;
    if(sounds[soundId]){
      sounds[soundId].currentTime = start;
      sounds[soundId].play();
    } else {
      sounds[soundId] = new Audio(mp3);
      sounds[soundId].play();
    }
  },

  render: function() {
    return (
      <div />
    );
  }

});

module.exports = Sampler;