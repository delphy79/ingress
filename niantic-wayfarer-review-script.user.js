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
        if ($("#low-quality-modal").length == 0) {
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
                    if (check_num != 0 || keyCode != 49) {
                        $(five_stars_obj).removeClass("test-red");
                        if (check_num < 5) {
                            $(five_stars.get(check_num+1)).addClass("test-red");
                        }
                        if (check_num == 3) {
                            $("#content-container").animate({scrollTop: $("body").height()}, 500);
                        }
                    }
                }
            } else if (keyCode == 13) {
                if ($(".modal-dialog").length == 0) {
                    $("#submit-bottom").children().click(); //제출
                } else {
                    $(".modal-dialog").children().children().children().children("button").click(); //다음후보
                }
            }
        } else { //리젝
           if ((keyCode >= 49 && keyCode <= 57) || (keyCode >= 97 && keyCode <= 105)) {
               if (keyCode > 90) keyCode = keyCode - 48; //넘버패드
               var low_quality_modal = w.document.getElementById('low-quality-modal');
               var answerCtrl2 = w.$scope(low_quality_modal).answerCtrl2;
               var reject_reason = $("#reject-reason").children("li").children("ul");
               var reject_reason_children = null;
               if (!answerCtrl2.checkedSg1 && !answerCtrl2.checkedSg2 && !answerCtrl2.checkedSg3 && !answerCtrl2.checkedSg4 && !answerCtrl2.checkedSg5) {
                   reject_reason_children = $(reject_reason).children("li").get(keyCode-49);
                   if (reject_reason_children != undefined) {
                       $(reject_reason_children).children("label").click();
                   }
               } else {
                   $(reject_reason).children("li").each(function() {
                       if ($(this).children("ul").css("display") != "none") {
                           reject_reason_children = this;
                           return;
                       }
                   });
                   var group_list = $(reject_reason_children).children("ul");
                   var group_list_children = $(group_list).children("li").get(keyCode-49);
                   if (group_list_children != undefined) {
                       var target = $(group_list_children).children("a").get(0);
                       answerCtrl2.checkedSg1 = false;
                       answerCtrl2.checkedSg2 = false;
                       answerCtrl2.checkedSg3 = false;
                       answerCtrl2.checkedSg4 = false;
                       answerCtrl2.checkedSg5 = false;
                       answerCtrl2.checkedG1 = false;
                       var rootLabel = document.getElementById("root-label");
                       rootLabel.innerText = target.text;
                       answerCtrl2.rejectReasonHelp = target.getAttribute("help");
                       answerCtrl2.formData.rejectReason = target.id;
                       answerCtrl2.formData.spam = true;
                       $(reject_reason_children).children("label").click();
                   }
               }
            } else if (keyCode == 13) {
                $(".button-primary").click(); //제출
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
