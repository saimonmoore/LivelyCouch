
var http = require('http');
var url = require('url');
var sys = require('sys');
var fs = require('fs');
var path = require('path');
var workerLib = require('../../lib/workerlib');
var watch = require('../../lib/watch');

var couchdb = workerLib.couchdb;

var name = 'filesystem_changelistener';
workerLib.setEventNamespace(name);

var runningListeners = {};

var dataStream = workerLib.createDataListener();

dataStream.on('data', function(d) {
  execute(d);
});

dataStream.on('end', function() {
  process.exit(0);
});

var execute = function(data) {
  var event = data.event.path;
  var listenerId = data.event.parameters.listenerid;
  if (event == 'filesystem_changelistener/stop') {
    stopChangeListener(id);
  } else {
    if(data.event.parameters.path) var paths = [data.event.parameters.path];
    if(data.event.parameters.paths) var paths = data.event.parameters.paths;
    var fileEndings = data.event.parameters.fileendings;
    var markChangedOnInit = data.event.parameters.mark_changed_on_start;
    var options = {};
    if (fileEndings) options.fileEndings = fileEndings;
    if (markChangedOnInit) options.markChangedOnInit = markChangedOnInit;
    startChangeListener(listenerId, paths, options);  
  }
}

var startChangeListener = function(listenerId, paths, options) {
  stopChangeListener(listenerId);
  var validFile = function(filePath) {
    if(options.fileEndings) {
      for(var i in options.fileEndings) {
        if(path.extname(filePath) == options.fileEndings[i]) {
          return true
        }
      }
      return false
    } else {
      return true
    }
  }
  var markFilesInFolderChanged = function(folderPath) {
    var files = fs.readdirSync(folderPath);
    for (var i in files) {
      fs.readdir(folderPath + files[i], function(err, files1) {
        if(files1) {
          markFilesInFolderChanged(folderPath + files[i] + '/');
        }
      })
      if (validFile(files[i])) {
        emitEvent('file_changed', folderPath + files[i], listenerId);
      }
    }
  }
  
  for (var i in paths) {
    var currpath = paths[i];
    if(options.markChangedOnInit) {
      markFilesInFolderChanged(currpath);
    }
    watch.createMonitor(currpath, {'ignoreDotFiles':true}, function (monitor) {
      monitor.on('created', function (f) {
        if(validFile(f)) {
          emitEvent('file_created', f, listenerId); 
        }
      })
      monitor.on('removed', function (f) {
        if(validFile(f)) {
          emitEvent('file_removed', f, listenerId); 
        }
      })
      monitor.on('content_changed', function (f) {
        if(validFile(f)) {
          emitEvent('file_changed', f, listenerId); 
        } 
      })
      if(!runningListeners[listenerId]) runningListeners[listenerId] = [];
      runningListeners[listenerId].push(monitor);
      workerLib.emitLivelyEvent("started", {listenerid: listenerId});
    });
  }
}


var emitEvent = function(event, filePath, listenerId) {
  workerLib.emitLivelyEvent(event, {
    listenerid: listenerId,
    filepath: filePath,
    fileending: path.extname(filePath),
    filename: path.basename(filePath, path.extname(filePath)),
    foldername: path.dirname(filePath).split('/').pop()
  }); 
}


var stopChangeListener = function(id) {
  if(runningListeners[id]) {
    for(var i in runningListeners[id]) {
      runningListeners[id][i].end();    
    }
    workerLib.emitLivelyEvent("stopped", {listenerid: id});
  }
}