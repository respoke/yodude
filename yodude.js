/* global angular */
/* global respoke */
/* global Webcam */
'use strict';

(function () {
    if (!~['localhost', '127.0.0.1'].indexOf(location.hostname) && location.protocol !== 'https:') {
        location.href = location.href.replace('http:', 'https:');
    }
})();

var GROUP_NAME = 'peeps';
var APP_ID = '2a56901d-78ca-4436-b698-4a7a66cdc1fc';

function noop() { }

function playSound() {
    document.getElementById('blop').play();
}

function uid() {
    return Math.random().toString(36).substring(2, 6);
}

function resetVideos() {
    var vids = document.querySelectorAll('video');
    var vid;
    var newVid;
    var parent;
    for (var i = 0; i < vids.length; i++) {
        vid = vids.item(i);
        if (vid.id) {
            newVid = document.createElement('video');
            newVid.id = vid.id;
            parent = vid.parentNode;
            parent.removeChild(vid);
            parent.appendChild(newVid);
        }
    }
}

var yodude = angular.module('yodude', []);

yodude.controller('AppController', ['$rootScope', function ($rootScope) {
    $rootScope.people = {};
    $rootScope.people[$rootScope.myEndpoint] = '';

    $rootScope.activeCall = null;

    $rootScope.startCall = function (endpointId) {
        if ($rootScope.activeCall || endpointId === $rootScope.myEndpoint) {
            return; // it is yourself or you are already on a call
        }
        if ($rootScope.people[endpointId] === window.RESPOKE_LOGO) {
            return; // person is on a call
        }
        $rootScope.activeCall = $rootScope.client.startVideoCall({
            endpointId: endpointId,
            videoRemoteElement: document.getElementById('video-' + endpointId),
            videoLocalElement: document.getElementById('video-' + $rootScope.myEndpoint),
            onConnect: playSound,

            onHangup: function () {
                $rootScope.activeCall = null;
                resetVideos();
            },
            onError: function () {
                $rootScope.activeCall = null;
                resetVideos();
            }
        });
    };
    $rootScope.stopCall = function (endpointId, $event) {
        $event.preventDefault();
        $event.stopPropagation();
        if (!$rootScope.activeCall) { return; }
        $rootScope.activeCall.hangup();
        $rootScope.activeCall = null;
    };
}]);

yodude.directive('pic', [function () {
    return {
        scope: {
            base64: '='
        },
        template: '<img ng-src="{{ base64 }}" class="img" />'
    };
}]);

yodude.directive('camera', ['$rootScope', '$timeout', function ($rootScope, $timeout) {
    return {
        link: function (/*scope, el*/) {
            Webcam.set({
                width: 320,
                height: 240,
                dest_width: 320,
                dest_height: 240,
                image_format: 'jpeg',
                jpeg_quality: 32,
                force_flash: false,
                flip_horiz: false
            });
            Webcam.attach('my-camera');
            Webcam.on('live', function () {
                setInterval(function () {

                    var group = $rootScope.client.getGroup({ id: GROUP_NAME });
                    if (!group) { return; } // respoke not connected

                    if ($rootScope.activeCall) {
                        group.sendMessage({
                            message: window.RESPOKE_LOGO,
                            onError: function (err) { console.error(err); }
                        });
                        return;
                    }

                    Webcam.snap(function (dataUri) {
                        console.log('selfie size', dataUri.length);
                        $rootScope.people[$rootScope.myEndpoint] = dataUri;
                        group.sendMessage({
                            message: dataUri,
                            onError: function (err) { console.error(err); }
                        });
                    });

                    $timeout(noop);
                }, 4000);
            });
            Webcam.on('error', function (err) {
                console.error('Webcamjs Error:', err);
            });
        },
        template: '<div id="my-camera"></div>'
    };
}]);

yodude.run(['$rootScope', '$timeout', function ($rootScope, $timeout) {
    respoke.log.setLevel('debug');
    var myEndpoint = localStorage.getItem('endpointId');
    if (!myEndpoint) {
        myEndpoint = uid();
    }
    $rootScope.myEndpoint = myEndpoint;
    localStorage.setItem('endpointId', myEndpoint);

    var client = respoke.createClient({
        developmentMode: true,
        appId: APP_ID
    });
    client.listen('error', function (err) {
        console.error(err);
    });
    client.listen('connect', function () {
        client.join({
            id: GROUP_NAME,
            onSuccess: function (group) {
                console.log('joined', group);
                group.getMembers().then(function (connections) {
                    connections.forEach(function (member) {
                        console.log('already here', member);
                        $rootScope.people[member.endpointId] = '';
                    });
                    $timeout(noop);
                });
            },
            onJoin: function (data) {
                var endpointId = data.connection.endpointId;
                $rootScope.people[endpointId] = '';
                $timeout(noop);
            },
            onLeave: function (data) {
                var endpointId = data.connection.endpointId;
                $rootScope.people[endpointId] = null;
                delete $rootScope.people[endpointId];
                $timeout(noop);
            }
        });
    });
    client.listen('message', function (data) {
        console.log('message', data);
        var imageContents = data.message.message;
        var endpointId = data.message.endpointId;
        $rootScope.people[endpointId] = imageContents;
        $timeout(noop);
    });
    client.listen('call', function (evt) {
        var call = evt.call;
        console.log('incoming call', evt.call);
        if (call.caller) { return; }
        if ($rootScope.activeCall) {
            call.hangup();
            return;
        }
        call.answer({
            videoRemoteElement: document.getElementById('video-' + call.remoteEndpoint.id),
            videoLocalElement: document.getElementById('video-' + $rootScope.myEndpoint),
            onConnect: playSound,

            onHangup: function () {
                $rootScope.activeCall = null;
                resetVideos();
            },
            onError: function () {
                $rootScope.activeCall = null;
                resetVideos();
            }
        });
        $rootScope.activeCall = call;
    });

    client.connect({
        endpointId: $rootScope.myEndpoint
    });
    $rootScope.client = window.client = client;
}]);
