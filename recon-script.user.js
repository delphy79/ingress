// ==UserScript==
// @name         recon-script.user.js
// @namespace    https://open.kakao.com/o/gVhrW8Z
// @version      0.1
// @description  hello world
// @author       DELPHY79
// @match        https://wayfarer.nianticlabs.com/review
// @grant        none
// @downloadURL  https://github.com/delphy79/ingress/raw/master/recon-script.user.js
// @updateURL    https://github.com/delphy79/ingress/raw/master/recon-script.user.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Your code here...
    setTimeout("fn_init", 250);
})();

var w = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;

function fn_init() {
    w.$scope = element => w.angular.element(element).scope();
    var NewSubmissionController = w.document.getElementById('NewSubmissionController');
    var subCtrl = w.$scope(NewSubmissionController).subCtrl;
    var pageDateInterval = setInterval(function() {
        if (subCtrl.pageData != undefined) {
            clearInterval(pageDateInterval);
            var geocoder = new google.maps.Geocoder;
            geocoder.geocode({'location': {lat: parseFloat(subCtrl.pageData.lat), lng: parseFloat(subCtrl.pageData.lng)}}, function(results, status) {
                if (status === 'OK') {
                    if (results[0]) {
                        $(".answer-header > div > h3 > span").append("<font style='color: red'>"+results[0].formatted_address.replace("대한민국","")+"</font>");
                    }
                }
            });
        }
    }, 100);
}
