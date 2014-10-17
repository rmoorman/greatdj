var Api = require('../utils/Api');
var Constants = require('../constants/AppConstants');
var AppDispatcher = require('../dispatcher/AppDispatcher');

var SearchActions = {
  search: function(q, videoDef){
    Api.searchForVideos(q, videoDef);
  },

  resetResults: function(){
    AppDispatcher.handleViewAction({
      actionType: Constants.RESET_RESULTS,
    });

    Api.getRecentTerms();

  },
};

module.exports = SearchActions;