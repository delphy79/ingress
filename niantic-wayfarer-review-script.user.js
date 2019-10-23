// ==UserScript==
// @name         niantic-wayfarer-review-script.user.js
// @namespace    https://open.kakao.com/o/gVhrW8Z
// @version      0.1
// @description  Niantic Wayfarer Review
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
    setTimeout(function() {fn_init();}, 250);
})();

async function fn_init() {
    var w = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;

    var css = '.test-red { border: 1px red dashed; }',
    head = document.head || document.getElementsByTagName('head')[0],
    style = document.createElement('style');
    head.appendChild(style);
    style.type = 'text/css';
    if (style.styleSheet) {
        style.styleSheet.cssText = css;
    } else {
        style.appendChild(document.createTextNode(css));
    }

    w.onkeydown = function(event) {
        var keyCode = event.keyCode;
        if ((keyCode >= 49 && keyCode <= 53) || (keyCode >= 97 && keyCode <= 101)) {
            if (keyCode > 90) keyCode = keyCode - 48; //넘버패드
            var five_stars = $(".five-stars");
            var five_stars_obj = null;
            var check_num = -1;
            for (var i=0; i<five_stars.length; i++) {
                if ($(five_stars.get(i)).hasClass("test-red")) {
                    five_stars_obj = five_stars.get(i);
                    check_num = i;
                    break;
                }
            }
            if (five_stars_obj != null) {
                var five_stars_obj_children = $(five_stars_obj).children("button");
                $(five_stars_obj_children.get(keyCode-49)).click();
                $(five_stars_obj).removeClass("test-red");
                if (check_num < 5) {
                    $(five_stars.get(check_num+1)).addClass("test-red");
                }
                if (check_num == 3) {
                    $("#content-container").animate({scrollTop: $("body").height()}, 500);
                }
            }
        } else if (keyCode == 13) {
            if ($(".modal-dialog").length == 0) {
                $("#submitDiv").children().click(); //제출
            } else {
                $(".modal-dialog").children().children().children().children("button").click(); //다음후보
            }
        }
    }

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
            var five_stars = $(".five-stars");
            if (five_stars.length > 0) {
                $(five_stars.get(0)).addClass("test-red");
            }
        }
    }, 100);
}
