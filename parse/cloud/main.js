// Extentions
Array.prototype.getUnique = function(){
    var u = {}, a = [];
    for(var i = 0, l = this.length; i < l; ++i){
        if(u.hasOwnProperty(this[i])) {
            continue;
        }
        a.push(this[i]);
        u[this[i]] = 1;
    }
    return a;
}

// Costants
const kMaxQuerySize = 10;

// Helper functions
var getRoom(roomId, callback) {
    var query = new Parse.Query("Room");
    query.get(roomId, {
        success: function(room) {
            callback(room);
        },
        error: function(error) {
            callback(null);
        }
    });
}

var getFreeNodeForRoom = function(roomId, callback) {
    getRoom(roomId, function(room) {
        if (room == null) {
            callback.error("Room does not exist");
            return;
        }

        var maxDepth    = room.get("maxDepth");
        var maxChildren = room.get("maxChildren");
        var minRating   = room.get("minRating");

        var query = new Parse.Query("Node");
        query.equalTo("room",              room);
        query.lessThan("depth",            maxDepth);
        query.lessThan("reservedChildren", maxChildren);
        query.greaterThan("rating",        minRating);
        query.find({
            success: function(results) {
                if (results.length == 0) {
                    callback.success(null);
                    return;
                }

                var randomNode = results[Math.floor(Math.random() * results.length)];
                callback.success(randomNode);
            },
            error: function(error) {
                callback.error("Error in the function helpers.getFreeNode");
            }
        });
    });
}

var getUpperNodes = function(node, callback) {
    if (typeof(node.get("parent")) == "undefined") {
        callback(new Array());
        return;
    }

    var ancestorQuery = new Parse.Query("Node");
    ancestorQuery.get(node.get("parent").id, {
        success: function(parent) {
            getUpperNodes(parent, function(ancestors) {
                var newArray = new Array(parent);
                callback(ancestors.concat(newArray));
            });
        },
        error: function(error) {
            callback(new Array("Error"));
        }
    });
}

var getUpperContents = function(node, callback) {
    getUpperNodes(node, function(nodes) {

        var resultingString = ""
        nodes.forEach(function(item) {
            resultingString += " " + item.get("content");
        });
        resultingString +=  " " + node.get("content");

        callback(resultingString);
    });
}

Parse.Cloud.define("pull", function(request, response) {
    var params = request.params;

    var roomId = params.roomId;
    getFreeNode(roomId, {
        success: function(node) {
            if (node == null) {
                response.success(null);
                return;
            }

            getUpperContents(node, function(contents) {
                var newArray = new Array(node);

                node.increment("reservedChildren", 1);
                node.save({
                    success: function() {
                        response.success(ancestors.concat(newArray));
                    },
                    error: function(error) {
                        response.error(error);
                    }
                })
            });
        },
        error: function(error) {
            response.error(error);
        }
    })
});

Parse.Cloud.define("skip", function(request, response) {

    var parentNodeId = request.params.objectId;
    var parentQuery = new Parse.Query("Node");
    parentQuery.get(parentNodeId, {
        success: function(parentNode) {
            parentNode.increment("rating",           -1);
            parentNode.increment("reservedChildren", -1);
            parentNode.save({
                success: function() {
                    response.success();
                },
                error: function(err) {
                    response.error(err);
                }
            });
        },
        error: function(error) {
            response.error(error);
        }
    });
});

Parse.Cloud.define("loadMyLastContributions", function(request, response) {

    // get room!

    var currentUser = Parse.User.current();
    var listQuery = new Parse.Query("List");
    listQuery.addDescending("createdAt");
    listQuery.contains("contributersSearchStr", currentUser.id);
    listQuery.include("lastNode");
    listQuery.limit(kMaxQuerySize);
    listQuery.find({
        success: function(lists) {
            var remainingCalls = lists.length;
            
            var resultingArray = new Array();
            lists.forEach(function(item) {

                var lastNode = item.get("lastNode");
                getUpperContents(lastNode, function(contents) {
                    resultingArray.push(contents);

                    remainingCalls -= 1;
                    if (remainingCalls == 0) {
                        response.success(resultingArray);
                    }
                });
            });
        },
        error: function(error) {
            response.error(error);
        }
    });
});

Parse.Cloud.define("loadTopStories", function(request, response) {

    // get room!

    var listQuery = new Parse.Query("List");
    listQuery.addDescending("rating");
    listQuery.include("lastNode");
    listQuery.limit(kMaxQuerySize);
    listQuery.find({
        success: function(lists) {
            var remainingCalls = lists.length;
            
            var resultingArray = new Array();
            lists.forEach(function(item) {

                var lastNode = item.get("lastNode");
                getUpperContents(lastNode, function(contents) {
                    resultingArray.push(contents);

                    remainingCalls -= 1;
                    if (remainingCalls == 0) {
                        response.success(resultingArray);
                    }
                });
            });
        },
        error: function(error) {
            response.error(error);
        }
    });
});

Parse.Cloud.afterSave("Node", function(request, response) {
    var newNode = request.object;

    if (newNode.has("parent") == false) {
        return;
    }

    // get max depth from room

    if (newNode.get("depth") >= kMaxDepth) {
        var userId = newNode.get("owner").id;

        getUpperNodes(newNode, function(nodes) {
            // Setup the text of the list & get total rating
            var text   = newNode.get("content");
            var rating = 0;
            nodes.forEach(function(item) {
                text = item.get("content") + " " + text;
                rating += item.get("rating");
            });

            // Get all contributors
            var contributersIds = [];
            nodes.forEach(function(item) {
                contributersIds.push(item.get("owner").id);
            });
            contributersIds = contributersIds.getUnique();

            // Send each contributer a text message & create a search str
            var searchString = "";
            contributersIds.forEach(function(item) {
                searchString += item + "_";
            });

            // Create list
            var list = new Parse.Object("List");
            list.set("lastNode",              newNode);
            list.set("rating",                rating);
            list.set("contributersSearchStr", searchString);
            list.save();
        });
    }
});
